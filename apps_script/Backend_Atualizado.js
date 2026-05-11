const SPREADSHEET_ID = '1FTSntPaY0ZSNAHdpKFaYpx9B2378jylDmvkhL1Gw-yY';

function getSheetByName(name) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function jsonResponse(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  try {
    var action = e.parameter.action;
    var idGrupo = e.parameter.id_grupo;
    
    if (action === 'carregar_dados') {
      return jsonResponse({
        success: true,
        nome_grupo: getNomeGrupo(idGrupo),
        perfis: getCollection('Perfis', idGrupo),
        assinaturas: getCollection('Assinaturas', idGrupo),
        logs: getCollection('Logs', idGrupo)
      });
    }
    
    if (action === 'has_password') {
      var pKey = e.parameter.personKey;
      var sheet = getSheetByName('Senhas');
      if (sheet.getLastRow() === 0) return jsonResponse({ success: true, hasPassword: false });
      var data = sheet.getDataRange().getValues();
      for (var i = 1; i < data.length; i++) {
        if (data[i][0] === idGrupo && data[i][1] === pKey && String(data[i][2]).trim() !== '') {
          return jsonResponse({ success: true, hasPassword: true, hint: String(data[i][3]) || '' });
        }
      }
      return jsonResponse({ success: true, hasPassword: false });
    }
    
    if (action === 'check_password') {
      var pKey = e.parameter.personKey;
      var pass = e.parameter.password;
      var sheet = getSheetByName('Senhas');
      if (sheet.getLastRow() === 0) return jsonResponse({ success: true, match: false });
      var data = sheet.getDataRange().getValues();
      for (var i = 1; i < data.length; i++) {
        if (data[i][0] === idGrupo && data[i][1] === pKey && String(data[i][2]).trim() === String(pass).trim()) {
          return jsonResponse({ success: true, match: true });
        }
      }
      return jsonResponse({ success: true, match: false });
    }
    
    return jsonResponse({ success: false, error: 'Ação GET não encontrada' });
  } catch (err) {
    return jsonResponse({ success: false, error: err.toString() });
  }
}

function doPost(e) {
  try {
    var payload = typeof e.postData !== 'undefined' ? JSON.parse(e.postData.contents) : e.parameter;
    var action = payload.action;
    var lock = LockService.getScriptLock();
    lock.waitLock(15000);
    
    try {
      if (action === 'criar_grupo') {
        var sheet = getSheetByName('Grupos');
        var idGrupo = payload.id_grupo || payload.nome.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/(^_|_$)/g, '');
        ensureHeaders(sheet, ['id_grupo', 'nome']);
        sheet.appendRow([idGrupo, payload.nome]);
        return jsonResponse({ success: true, id_grupo: idGrupo, nome_grupo: payload.nome });
      }
      
      if (action === 'renomear_grupo') {
        var idGrupoOld = payload.id_grupo;
        var idGrupoNew = payload.id_grupo_novo || payload.nome.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/(^_|_$)/g, '');
        
        // Update Grupos
        updateCollectionField('Grupos', idGrupoOld, 0, idGrupoNew, payload.nome, 1);
        
        // Update foreign instances if slug changed
        if (idGrupoOld !== idGrupoNew) {
           updateCollectionForeignKey('Perfis', idGrupoOld, idGrupoNew);
           updateCollectionForeignKey('Assinaturas', idGrupoOld, idGrupoNew);
           updateCollectionForeignKey('Logs', idGrupoOld, idGrupoNew);
           updateCollectionForeignKey('Senhas', idGrupoOld, idGrupoNew);
        }
        return jsonResponse({ success: true, id_grupo: idGrupoNew, nome_grupo: payload.nome });
      }
      
      var idGrupo = payload.id_grupo;
      if (!idGrupo) return jsonResponse({ success: false, error: 'id_grupo missing' });
      
      if (action === 'set_password') {
        saveRow('Senhas', ['id_grupo', 'chave_perfil', 'senha', 'dica'], 
          [idGrupo, payload.chave_perfil, payload.newPassword, payload.hint || ''],
          function(r) { return r[0] === idGrupo && r[1] === payload.chave_perfil; }
        );
        return jsonResponse({ success: true });
      }
      
      if (action === 'salvar_log') {
        saveRow('Logs', ['id_grupo', 'chave_perfil', 'chave_servico', 'mes', 'pago', 'nome', 'assinatura'], 
          [idGrupo, payload.chave_perfil, payload.chave_servico, "'" + payload.mes, payload.pago, payload.nome, payload.assinatura],
          function(r) { return r[0] === idGrupo && r[1] === payload.chave_perfil && r[2] === payload.chave_servico && r[3] === payload.mes; }
        );
        return jsonResponse({ success: true });
      }
      
      if (action === 'salvar_assinatura') {
        saveRow('Assinaturas', ['id_grupo', 'chave_servico', 'nome', 'valor_total', 'modelo', 'participantes', 'cor'], 
          [idGrupo, payload.chave_servico, payload.nome, payload.valor_total, payload.modelo, JSON.stringify(payload.participantes || []), payload.cor || ''],
          function(r) { return r[0] === idGrupo && r[1] === payload.chave_servico; }
        );
        return jsonResponse({ success: true });
      }
      
      if (action === 'salvar_perfil') {
        saveRow('Perfis', ['id_grupo', 'chave_perfil', 'nome', 'cor', 'iniciais', 'is_admin'], 
          [idGrupo, payload.chave_perfil, payload.nome, payload.cor || '', payload.iniciais || '', payload.is_admin || false],
          function(r) { return r[0] === idGrupo && r[1] === payload.chave_perfil; }
        );
        return jsonResponse({ success: true });
      }
      
      if (action === 'deletar_item') {
        var sheet = getSheetByName(payload.aba);
        if (sheet.getLastRow() === 0) return jsonResponse({ success: true });
        var data = sheet.getDataRange().getValues();
        var key = payload.chave || payload.chave_perfil || payload.chave_servico; 
        for (var i = data.length - 1; i >= 1; i--) {
           if (data[i][0] === idGrupo && data[i][1] === key) {
             sheet.deleteRow(i + 1);
           }
        }
        return jsonResponse({ success: true });
      }
      
      return jsonResponse({ success: false, error: 'Ação não encontrada' });
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return jsonResponse({ success: false, error: err.toString() });
  }
}

function ensureHeaders(sheet, headers) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
  }
}

function getNomeGrupo(idGrupo) {
  var sheet = getSheetByName('Grupos');
  if (sheet.getLastRow() === 0) return '';
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === idGrupo) return String(data[i][1]);
  }
  return '';
}

function getCollection(sheetName, idGrupo) {
  var sheet = getSheetByName(sheetName);
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];
  var data = sheet.getRange(1, 1, lastRow, sheet.getLastColumn()).getValues();
  var headers = data[0];
  var results = [];
  
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] !== idGrupo) continue;
    var item = {};
    for (var j = 0; j < headers.length; j++) {
      var val = data[i][j];
      if (headers[j] === 'participantes' && typeof val === 'string' && val.indexOf('[') === 0) {
        try { val = JSON.parse(val); } catch(ev) {}
      }
      item[headers[j]] = val;
    }
    results.push(item);
  }
  return results;
}

function saveRow(sheetName, headers, rowData, matchFunc) {
  var sheet = getSheetByName(sheetName);
  ensureHeaders(sheet, headers);
  var data = sheet.getDataRange().getValues();
  var updated = false;
  
  for (var i = 1; i < data.length; i++) {
    if (matchFunc(data[i])) {
      var finalRow = [];
      for(var j=0; j<headers.length; j++) {
        finalRow.push(rowData[j] !== undefined ? rowData[j] : '');
      }
      sheet.getRange(i + 1, 1, 1, headers.length).setValues([finalRow]);
      updated = true;
      break;
    }
  }
  if (!updated) {
    sheet.appendRow(rowData);
  }
  SpreadsheetApp.flush();
}

function updateCollectionField(sheetName, idOld, idIdx, idNew, extraVar, extraIdx) {
  var sheet = getSheetByName(sheetName);
  ensureHeaders(sheet, ['id_grupo', 'nome']); // for Grupos tab
  if(sheet.getLastRow() <= 1) {
    if (sheetName === 'Grupos') sheet.appendRow([idNew, extraVar]);
    return;
  }
  var data = sheet.getDataRange().getValues();
  var found = false;
  for (var i = 1; i < data.length; i++) {
    if (data[i][idIdx] === idOld) {
       sheet.getRange(i + 1, idIdx + 1).setValue(idNew);
       if(extraIdx !== undefined && extraVar !== undefined) {
         sheet.getRange(i + 1, extraIdx + 1).setValue(extraVar);
       }
       found = true;
       return;
    }
  }
  if (!found && sheetName === 'Grupos') {
    sheet.appendRow([idNew, extraVar]);
  }
}

function updateCollectionForeignKey(sheetName, idOld, idNew) {
  var sheet = getSheetByName(sheetName);
  if(sheet.getLastRow() <= 1) return;
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === idOld) {
       sheet.getRange(i + 1, 1).setValue(idNew);
    }
  }
}
