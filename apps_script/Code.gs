/**
 * Code.gs
 * Apps Script para marcar e remover pagamentos no Google Sheets.
 * Substitua SPREADSHEET_ID e SHEET_NAME antes de publicar como Web App.
 */

const SPREADSHEET_ID = '1FTSntPaY0ZSNAHdpKFaYpx9B2378jylDmvkhL1Gw-yY';
const SHEET_NAME = 'Logs';

function doPost(e) {
  try {
    Logger.log('doPost called');

    // Proteção: `e` pode ser undefined quando a função é executada manualmente
    // no editor (Run). Evitar acessar propriedades de `e` sem checar.
    var postDataContents = e && e.postData && e.postData.contents ? e.postData.contents : null;
    Logger.log('postData.contents: ' + (postDataContents ? postDataContents : 'none'));
    Logger.log('parameters: ' + JSON.stringify(e && e.parameter ? e.parameter : {}));

    var payload = {};
    if (postDataContents) {
      try {
        payload = JSON.parse(postDataContents);
      } catch (err) {
        payload = e && e.parameter ? e.parameter : {};
      }
    } else {
      payload = e && e.parameter ? e.parameter : {};
    }

    Logger.log('parsed payload: ' + JSON.stringify(payload));
    var removeFlag = payload.remove === true || payload.remove === 'true';
    Logger.log('removeFlag: ' + removeFlag);

    if (removeFlag) {
      return handleRemove(payload);
    } else {
      return handleAddOrUpdate(payload);
    }
  } catch (err) {
    Logger.log('doPost error: ' + err.toString());
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function handleAddOrUpdate(data) {
  if (!data.personKey || !data.paymentKey) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: 'personKey or paymentKey missing' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET_NAME) || ss.getSheets()[0];
  var values = sheet.getDataRange().getValues();
  var updated = false;

  Logger.log('handleAddOrUpdate payload: ' + JSON.stringify(data));

  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    if (String(row[0]) === String(data.personKey) && String(row[1]) === String(data.paymentKey)) {
      sheet.getRange(i + 1, 3).setValue(data.timestamp || new Date().toISOString());
      updated = true;
      break;
    }
  }

  if (!updated) {
    sheet.appendRow([data.personKey, data.paymentKey, data.timestamp || new Date().toISOString()]);
    Logger.log('appended row for ' + data.personKey + ' ' + data.paymentKey);
  }

  return ContentService
    .createTextOutput(JSON.stringify({ success: true, action: updated ? 'updated' : 'appended' }))
    .setMimeType(ContentService.MimeType.JSON);
}

function handleRemove(data) {
  if (!data.personKey || !data.paymentKey) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: 'personKey or paymentKey missing' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET_NAME) || ss.getSheets()[0];
  var values = sheet.getDataRange().getValues();
  var deleted = 0;

  Logger.log('handleRemove payload: ' + JSON.stringify(data));

  // Iterate backwards to avoid row shifting when deleting
  for (var i = values.length - 1; i >= 0; i--) {
    var row = values[i];
    if (String(row[0]) === String(data.personKey) && String(row[1]) === String(data.paymentKey)) {
      sheet.deleteRow(i + 1);
      deleted++;
    }
  }

  Logger.log('removed rows: ' + deleted + ' for ' + data.personKey + ' ' + data.paymentKey);

  return ContentService
    .createTextOutput(JSON.stringify({ success: true, action: 'removed', deleted: deleted }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}
