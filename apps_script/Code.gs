/**
 * Code.gs
 * Apps Script para sincronizar o status de pagamentos no Google Sheets.
 *
 * Modelo atual da aba Logs:
 * nome | assinatura | mes | pago
 *
 * - nome: nome da pessoa exibido no site.
 * - assinatura: serviço pago (Disney+ ou HBO Max).
 * - mes: data da mensalidade/parcela no formato YYYY-MM-DD.
 * - pago: TRUE quando está pago, FALSE quando está pendente.
 *
 * O script também aceita os campos legados personKey/paymentKey para facilitar
 * a transição do site antigo e sempre devolve o formato usado pelo frontend:
 * { [personKey]: { [serviceKey:YYYY-MM-DD]: "true" } }
 */

const SPREADSHEET_ID = '1FTSntPaY0ZSNAHdpKFaYpx9B2378jylDmvkhL1Gw-yY';
const SHEET_NAME = 'Logs';
const HEADERS = ['nome', 'assinatura', 'mes', 'pago'];

const PEOPLE_BY_KEY = {
  andre: 'André Luiz',
  isabela: 'Bela Lustosa',
  ianka: 'Ianka Lacerda',
  sarha: 'Sarha Pedrosa',
};

const PERSON_KEYS_BY_NAME = {
  'andre luiz': 'andre',
  'andré luiz': 'andre',
  andre: 'andre',
  'bela lustosa': 'isabela',
  isabela: 'isabela',
  'ianka lacerda': 'ianka',
  ianka: 'ianka',
  'sarha pedrosa': 'sarha',
  sarha: 'sarha',
};

const SERVICES_BY_KEY = {
  disney: 'Disney+',
  max: 'HBO Max',
};

const SERVICE_KEYS_BY_NAME = {
  disney: 'disney',
  'disney+': 'disney',
  'hbo': 'max',
  max: 'max',
  'hbo max': 'max',
};

function doPost(e) {
  try {
    var payload = parsePayload(e);
    var removeFlag = payload.remove === true || payload.remove === 'true';

    if (removeFlag) {
      return handleSetPaidStatus(payload, false);
    }

    return handleSetPaidStatus(payload, true);
  } catch (err) {
    return jsonResponse({ success: false, error: err.toString() });
  }
}

function doGet(e) {
  try {
    var action = e && e.parameter && e.parameter.action ? String(e.parameter.action) : '';

    if (action === 'health') {
      return jsonResponse({ success: true, sheetName: SHEET_NAME, headers: HEADERS });
    }

    if (action === 'rows') {
      return jsonResponse(readPaymentRows());
    }

    return jsonResponse(readPaidLogs());
  } catch (err) {
    return jsonResponse({ success: false, error: err.toString() });
  }
}

function handleSetPaidStatus(data, paidStatus) {
  var normalized = normalizePaymentData(data, paidStatus);
  if (!normalized.personKey || !normalized.serviceKey || !normalized.monthDate) {
    return jsonResponse({
      success: false,
      error: 'nome/personKey, assinatura/serviceKey or mes missing',
    });
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    var sheet = getLogsSheet();
    var dataStartRow = ensureHeader(sheet) + 1;
    var values = getDataRows(sheet, dataStartRow);
    var updated = false;

    for (var i = 0; i < values.length; i++) {
      var rowPayment = normalizeRow(values[i]);
      if (
        rowPayment.personKey === normalized.personKey &&
        rowPayment.serviceKey === normalized.serviceKey &&
        rowPayment.monthDate === normalized.monthDate
      ) {
        sheet.getRange(dataStartRow + i, 1, 1, HEADERS.length).setValues([[
          normalized.nome,
          normalized.assinatura,
          normalized.monthDate,
          normalized.pago,
        ]]);
        updated = true;
        break;
      }
    }

    if (!updated) {
      sheet.appendRow([
        normalized.nome,
        normalized.assinatura,
        normalized.monthDate,
        normalized.pago,
      ]);
    }

    return jsonResponse({
      success: true,
      action: updated ? 'updated' : 'appended',
      payment: normalized,
    });
  } finally {
    lock.releaseLock();
  }
}

function readPaidLogs() {
  var rows = readPaymentRows();
  var logs = {};

  for (var i = 0; i < rows.length; i++) {
    var payment = rows[i];
    if (!payment.pago) {
      continue;
    }

    logs[payment.personKey] = logs[payment.personKey] || {};
    logs[payment.personKey][payment.paymentKey] = 'true';
  }

  return logs;
}

function readPaymentRows() {
  var sheet = getLogsSheet();
  var dataStartRow = ensureHeader(sheet) + 1;
  var values = getDataRows(sheet, dataStartRow);
  var rows = [];

  for (var i = 0; i < values.length; i++) {
    var payment = normalizeRow(values[i]);
    if (!payment.personKey || !payment.serviceKey || !payment.monthDate) {
      continue;
    }

    rows.push(payment);
  }

  return rows;
}

function normalizePaymentData(data, paidStatus) {
  data = data || {};

  var paymentKeyParts = parsePaymentKey(data.paymentKey);
  var personKey = normalizePersonKey(data.personKey) || normalizePersonKey(data.nome);
  var serviceKey = normalizeServiceKey(data.serviceKey) || normalizeServiceKey(data.assinatura) || paymentKeyParts.serviceKey;
  var monthDate = normalizeMonthDate(data.mes || data.month || data.monthDate || paymentKeyParts.monthDate);

  return {
    personKey: personKey,
    paymentKey: serviceKey && monthDate ? serviceKey + ':' + monthDate : '',
    nome: normalizePersonName(personKey, data.nome),
    serviceKey: serviceKey,
    assinatura: normalizeServiceName(serviceKey, data.assinatura),
    monthDate: monthDate,
    mes: monthDate,
    pago: paidStatus === undefined ? normalizeBoolean(data.pago) : paidStatus,
  };
}

function normalizeRow(row) {
  var nome = String(row[0] || '').trim();
  var assinatura = String(row[1] || '').trim();
  var legacyPaymentKey = parsePaymentKey(row[1]);
  var personKey = normalizePersonKey(nome);
  var serviceKey = normalizeServiceKey(assinatura) || legacyPaymentKey.serviceKey;
  var monthDate = legacyPaymentKey.monthDate || normalizeMonthDate(row[2]);
  var legacyPaidRow = legacyPaymentKey.serviceKey && legacyPaymentKey.monthDate && row[3] === '';

  return {
    personKey: personKey,
    paymentKey: serviceKey && monthDate ? serviceKey + ':' + monthDate : '',
    nome: normalizePersonName(personKey, nome),
    serviceKey: serviceKey,
    assinatura: normalizeServiceName(serviceKey, assinatura),
    monthDate: monthDate,
    mes: monthDate,
    pago: legacyPaidRow ? true : normalizeBoolean(row[3]),
  };
}

function parsePaymentKey(paymentKey) {
  var parts = String(paymentKey || '').split(':');
  if (parts.length < 2) {
    return { serviceKey: '', monthDate: '' };
  }

  return {
    serviceKey: normalizeServiceKey(parts[0]),
    monthDate: normalizeMonthDate(parts.slice(1).join(':')),
  };
}

function normalizePersonKey(value) {
  var normalized = normalizeText(value);
  return PERSON_KEYS_BY_NAME[normalized] || '';
}

function normalizePersonName(personKey, fallback) {
  return PEOPLE_BY_KEY[personKey] || String(fallback || '').trim();
}

function normalizeServiceKey(value) {
  var normalized = normalizeText(value);
  return SERVICE_KEYS_BY_NAME[normalized] || '';
}

function normalizeServiceName(serviceKey, fallback) {
  return SERVICES_BY_KEY[serviceKey] || String(fallback || '').trim();
}

function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function normalizeMonthDate(value) {
  if (!value) {
    return '';
  }

  if (Object.prototype.toString.call(value) === '[object Date]') {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }

  var text = String(value).trim();
  var isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return isoMatch[1] + '-' + isoMatch[2] + '-' + isoMatch[3];
  }

  var brMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (brMatch) {
    return brMatch[3] + '-' + pad2(brMatch[2]) + '-' + pad2(brMatch[1]);
  }

  return text;
}

function normalizeBoolean(value) {
  if (value === true) {
    return true;
  }

  var text = normalizeText(value);
  return text === 'true' || text === 'sim' || text === '1' || text === 'pago';
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function parsePayload(e) {
  var postDataContents = e && e.postData && e.postData.contents ? e.postData.contents : null;

  if (postDataContents) {
    try {
      return JSON.parse(postDataContents);
    } catch (err) {
      return e && e.parameter ? e.parameter : {};
    }
  }

  return e && e.parameter ? e.parameter : {};
}

function getLogsSheet() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  return ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
}

function ensureHeader(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    return 1;
  }

  var firstRow = sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0];
  var hasHeader = HEADERS.every(function (header, index) {
    return String(firstRow[index] || '').trim().toLowerCase() === header;
  });

  if (!hasHeader) {
    sheet.insertRowBefore(1);
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  }

  return 1;
}

function getDataRows(sheet, dataStartRow) {
  var lastRow = sheet.getLastRow();
  if (lastRow < dataStartRow) {
    return [];
  }

  return sheet.getRange(dataStartRow, 1, lastRow - dataStartRow + 1, HEADERS.length).getValues();
}

function jsonResponse(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
