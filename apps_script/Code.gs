// Code.gs
// Apps Script para sincronizar pagamentos pagos no Google Sheets.
//
// Banco simplificado:
// - Cada linha representa somente um pagamento marcado como pago.
// - Se a linha existe, o pagamento está pago.
// - Se a linha não existe, o pagamento está pendente.
//
// Colunas da aba Logs:
// personKey | paymentKey | paidAt
//
// Observação: use comentários de linha e sintaxe ES5 para evitar erros de
// parser em projetos antigos do Apps Script ou em cópias parciais do arquivo.

var SPREADSHEET_ID = '1FTSntPaY0ZSNAHdpKFaYpx9B2378jylDmvkhL1Gw-yY';
var SHEET_NAME = 'Logs';
var HEADERS = ['personKey', 'paymentKey', 'paidAt'];

function doPost(e) {
  try {
    var payload = parsePayload(e);
    var removeFlag = payload.remove === true || payload.remove === 'true';

    if (removeFlag) {
      return handleRemove(payload);
    }

    return handleAddOrUpdate(payload);
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

    return jsonResponse(readPaidLogs());
  } catch (err) {
    return jsonResponse({ success: false, error: err.toString() });
  }
}

function handleAddOrUpdate(data) {
  var normalized = normalizePaymentData(data);
  if (!normalized.personKey || !normalized.paymentKey) {
    return jsonResponse({ success: false, error: 'personKey or paymentKey missing' });
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    var sheet = getLogsSheet();
    var dataStartRow = ensureHeader(sheet) + 1;
    var values = getDataRows(sheet, dataStartRow);
    var updated = false;

    for (var i = 0; i < values.length; i++) {
      var row = values[i];
      if (String(row[0]) === normalized.personKey && String(row[1]) === normalized.paymentKey) {
        sheet.getRange(dataStartRow + i, 3).setValue(normalized.paidAt);
        updated = true;
        break;
      }
    }

    if (!updated) {
      sheet.appendRow([normalized.personKey, normalized.paymentKey, normalized.paidAt]);
    }

    return jsonResponse({
      success: true,
      action: updated ? 'updated' : 'appended',
      payment: normalized
    });
  } finally {
    lock.releaseLock();
  }
}

function handleRemove(data) {
  var normalized = normalizePaymentData(data);
  if (!normalized.personKey || !normalized.paymentKey) {
    return jsonResponse({ success: false, error: 'personKey or paymentKey missing' });
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    var sheet = getLogsSheet();
    var dataStartRow = ensureHeader(sheet) + 1;
    var values = getDataRows(sheet, dataStartRow);
    var deleted = 0;

    for (var i = values.length - 1; i >= 0; i--) {
      var row = values[i];
      if (String(row[0]) === normalized.personKey && String(row[1]) === normalized.paymentKey) {
        sheet.deleteRow(dataStartRow + i);
        deleted++;
      }
    }

    return jsonResponse({ success: true, action: 'removed', deleted: deleted });
  } finally {
    lock.releaseLock();
  }
}

function readPaidLogs() {
  var sheet = getLogsSheet();
  var dataStartRow = ensureHeader(sheet) + 1;
  var values = getDataRows(sheet, dataStartRow);
  var logs = {};

  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    var personKey = String(row[0] || '').trim();
    var paymentKey = String(row[1] || '').trim();
    var paidAt = serializePaidAt(row[2]);

    if (!personKey || !paymentKey) {
      continue;
    }

    if (!logs[personKey]) {
      logs[personKey] = {};
    }

    logs[personKey][paymentKey] = paidAt || new Date().toISOString();
  }

  return logs;
}

function serializePaidAt(value) {
  if (!value) {
    return '';
  }

  if (Object.prototype.toString.call(value) === '[object Date]') {
    return value.toISOString();
  }

  return String(value).trim();
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

function normalizePaymentData(data) {
  data = data || {};

  return {
    personKey: String(data.personKey || '').trim(),
    paymentKey: String(data.paymentKey || '').trim(),
    paidAt: String(data.paidAt || data.timestamp || new Date().toISOString()).trim()
  };
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
    return String(firstRow[index] || '').trim() === header;
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
