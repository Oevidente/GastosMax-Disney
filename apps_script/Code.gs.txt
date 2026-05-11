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
  'andre': 'andre',
  'andré': 'andre',
  'bela lustosa': 'isabela',
  'isabela': 'isabela',
  'ianka lacerda': 'ianka',
  'ianka': 'ianka',
  'sarha pedrosa': 'sarha',
  'sarha': 'sarha',
};

const SERVICES_BY_KEY = {
  disney: 'Disney+',
  max: 'HBO Max',
  spotify: 'Spotify',
  crunchyroll: 'Crunchyroll',
  prime_video: 'Prime Video',
  google_one: 'Google One',
  f1_tv_pro: 'F1 TV Pro',
  globoplay: 'Globoplay',
};

const SERVICE_KEYS_BY_NAME = {
  'disney': 'disney',
  'disney+': 'disney',
  'hbo': 'max',
  'max': 'max',
  'hbo max': 'max',
  'spotify': 'spotify',
  'crunchyroll': 'crunchyroll',
  'prime video': 'prime_video',
  'prime_video': 'prime_video',
  'google one': 'google_one',
  'google_one': 'google_one',
  'f1 tv pro': 'f1_tv_pro',
  'f1_tv_pro': 'f1_tv_pro',
  'globoplay': 'globoplay',
};

// Obter o fuso horário da planilha para garantir que as datas não mudem no processamento

function doGet(e) {
  try {
    var action = e && e.parameter && e.parameter.action ? String(e.parameter.action) : '';
    var sheetName = e && e.parameter && e.parameter.sheetName ? String(e.parameter.sheetName) : SHEET_NAME;

    // --- LÓGICA DE SENHAS COM DICA ---
    if (action === 'has_password') {
      var pKey = e.parameter.personKey;
      var sheet = getPasswordSheet();
      var data = sheet.getDataRange().getValues();
      for (var i = 1; i < data.length; i++) {
        if (data[i][0] === pKey && String(data[i][1]).trim() !== '') {
          var dicaSalva = data[i][2] ? String(data[i][2]) : 'Nenhuma dica cadastrada.';
          return jsonResponse({ success: true, hasPassword: true, hint: dicaSalva });
        }
      }
      return jsonResponse({ success: true, hasPassword: false });
    }

    if (action === 'check_password') {
      var pKey = e.parameter.personKey;
      var pass = e.parameter.password;
      var sheet = getPasswordSheet();
      var data = sheet.getDataRange().getValues();
      for (var j = 1; j < data.length; j++) {
        if (data[j][0] === pKey && String(data[j][1]).trim() === String(pass).trim()) {
          return jsonResponse({ success: true, match: true });
        }
      }
      return jsonResponse({ success: true, match: false });
    }
    // ---------------------------------

    if (action === 'health') {
      return jsonResponse({ success: true, sheetName: sheetName, headers: HEADERS });
    }

    if (action === 'rows') {
      return jsonResponse(readPaymentRows(sheetName));
    }

    return jsonResponse(readPaidLogs(sheetName));
  } catch (err) {
    return jsonResponse({ success: false, error: err.toString() });
  }
}

function doPost(e) {
  try {
    var payload = parsePayload(e);

    // --- SALVAR SENHA E DICA ---
    if (payload.action === 'set_password') {
      var pKey = payload.personKey;
      var pass = payload.newPassword;
      var hint = payload.hint || '';
      var sheet = getPasswordSheet();
      var data = sheet.getDataRange().getValues();
      var row = -1;
      for (var i = 1; i < data.length; i++) {
        if (data[i][0] === pKey) { row = i + 1; break; }
      }
      if (row !== -1) {
        sheet.getRange(row, 2).setValue(pass);
        sheet.getRange(row, 3).setValue(hint);
      } else {
        sheet.appendRow([pKey, pass, hint]);
      }
      return jsonResponse({ success: true });
    }
    // ---------------------------

    var removeFlag = payload.remove === true || payload.remove === 'true';
    var sheetName = payload.sheetName || SHEET_NAME;

    if (removeFlag) {
      return handleSetPaidStatus(payload, false, sheetName);
    }

    return handleSetPaidStatus(payload, true, sheetName);
  } catch (err) {
    return jsonResponse({ success: false, error: err.toString() });
  }
}

function handleSetPaidStatus(data, paidStatus, sheetName) {
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
    var sheet = getSheetByName(sheetName || SHEET_NAME);
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
          "'" + normalized.monthDate, // O apóstrofo mágico voltou aqui!
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
        "'" + normalized.monthDate, // E o apóstrofo mágico voltou aqui também!
        normalized.pago,
      ]);
    }

    SpreadsheetApp.flush(); // Obriga o Google a salvar na hora

    return jsonResponse({
      success: true,
      action: updated ? 'updated' : 'appended',
      payment: normalized,
    });
  } finally {
    lock.releaseLock();
  }
}

function readPaidLogs(sheetName) {
  var rows = readPaymentRows(sheetName);
  var logs = {};
  for (var i = 0; i < rows.length; i++) {
    var payment = rows[i];
    if (!payment.pago) continue;
    logs[payment.personKey] = logs[payment.personKey] || {};
    logs[payment.personKey][payment.paymentKey] = 'true';
  }
  return logs;
}

function readPaymentRows(sheetName) {
  var sheet = getSheetByName(sheetName || SHEET_NAME);
  var dataStartRow = ensureHeader(sheet) + 1;
  var values = getDataRows(sheet, dataStartRow);
  var rows = [];
  var isConfig = (sheetName === 'Configuracoes');

  for (var i = 0; i < values.length; i++) {
    var payment = normalizeRow(values[i]);
    if (!payment.personKey || !payment.serviceKey) {
      continue;
    }

    // Na aba Logs exigimos data, na Configuracoes não (metadados)
    if (!isConfig && !payment.monthDate) {
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

  // Se for site_settings, usamos a paymentKey bruta se fornecida
  var finalPaymentKey = serviceKey && monthDate ? serviceKey + ':' + monthDate : (data.paymentKey || '');

  return {
    personKey: personKey,
    paymentKey: finalPaymentKey,
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
  var personKey = normalizePersonKey(nome);

  // Tentar detectar se a segunda coluna já é uma paymentKey (contém :)
  var legacyPaymentKey = parsePaymentKey(assinatura);
  var serviceKey = normalizeServiceKey(assinatura) || legacyPaymentKey.serviceKey;
  var monthDate = legacyPaymentKey.monthDate || normalizeMonthDate(row[2]);

  var finalPaymentKey = serviceKey && monthDate ? serviceKey + ':' + monthDate : assinatura;

  return {
    personKey: personKey,
    paymentKey: finalPaymentKey,
    nome: normalizePersonName(personKey, nome),
    serviceKey: serviceKey,
    assinatura: normalizeServiceName(serviceKey, assinatura),
    monthDate: monthDate,
    mes: monthDate,
    pago: normalizeBoolean(row[3]),
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

function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function normalizePersonKey(value) {
  var normalized = normalizeText(value);
  return PERSON_KEYS_BY_NAME[normalized] || normalized.replace(/\s+/g, '_');
}

function normalizePersonName(personKey, fallback) {
  return PEOPLE_BY_KEY[personKey] || String(fallback || personKey || '').trim();
}

function normalizeServiceKey(value) {
  var normalized = normalizeText(value);
  return SERVICE_KEYS_BY_NAME[normalized] || normalized.replace(/\s+/g, '_');
}

function normalizeServiceName(serviceKey, fallback) {
  return SERVICES_BY_KEY[serviceKey] || String(fallback || serviceKey || '').trim();
}

function normalizeMonthDate(value) {
  if (!value) {
    return '';
  }

  if (Object.prototype.toString.call(value) === '[object Date]') {
    var tz = SpreadsheetApp.openById(SPREADSHEET_ID).getSpreadsheetTimeZone();
    return Utilities.formatDate(value, tz, 'yyyy-MM-dd');
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

function getSheetByName(name) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheetName = name || SHEET_NAME;
  return ss.getSheetByName(sheetName) || ss.insertSheet(sheetName);
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

function getPasswordSheet() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName('Senhas');
  if (!sheet) {
    sheet = ss.insertSheet('Senhas');
    sheet.appendRow(['personKey', 'senha', 'dica']);
    sheet.getRange("A1:C1").setFontWeight("bold");
  }
  return sheet;
}