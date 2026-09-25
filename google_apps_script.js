/**
 * ====================================================================
 * Google Apps Script (GAS) 用コード
 * ====================================================================
 * 【設定手順】
 * 1. Googleスプレッドシートを開く
 * 2. 画面上部メニュー「拡張機能」 > 「Apps Script」を開く
 * 3. 既存のコードを消して、このファイルの内容をすべて貼り付ける
 * 4. 画面右上の「デプロイ」 > 「デプロイを管理」 > 編集（鉛筆アイコン）
 *    バージョンを「新バージョン」にして「デプロイ」をクリック
 *    （※WebアプリURLはそのままで機能が更新されます）
 * ====================================================================
 */

function doPost(e) {
  try {
    var rawData = e.postData.contents;
    var data = JSON.parse(rawData);
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // 1. 学習ログの保存
    if (data.action === 'save_logs' && data.logs && data.logs.length > 0) {
      var logSheetName = '計算ドリル記録';
      var logSheet = ss.getSheetByName(logSheetName);

      if (!logSheet) {
        logSheet = ss.insertSheet(logSheetName);
        logSheet.appendRow([
          '記録日時',
          'クラス',
          '出席番号',
          'ニックネーム',
          '問題式',
          '演算',
          '単元分類',
          '正解',
          '所要時間(秒)',
          '間違えた回数',
          'セッションID'
        ]);
        logSheet.getRange(1, 1, 1, 11).setBackground('#2563eb').setFontColor('#ffffff').setFontWeight('bold');
        logSheet.setFrozenRows(1);
      }

      var rows = [];
      for (var i = 0; i < data.logs.length; i++) {
        var log = data.logs[i];
        rows.push([
          new Date(log.timestamp),
          log.className || '',
          log.studentNumber ? Number(log.studentNumber) : '',
          log.nickname || log.studentName || '児童',
          log.formula || '',
          log.op || '',
          log.category || '',
          log.correctAnswer || '',
          log.timeSpentSeconds || 0,
          log.mistakeCount || 0,
          log.sessionId || ''
        ]);
      }

      if (rows.length > 0) {
        var lastRow = logSheet.getLastRow();
        logSheet.getRange(lastRow + 1, 1, rows.length, 11).setValues(rows);
      }

      return ContentService.createTextOutput(JSON.stringify({
        status: 'success',
        savedCount: rows.length
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // 2. 児童名簿・パスワードの保存（先生管理用）
    if (data.action === 'sync_user' && data.user) {
      var userSheetName = '児童名簿・パスワード';
      var userSheet = ss.getSheetByName(userSheetName);

      if (!userSheet) {
        userSheet = ss.insertSheet(userSheetName);
        userSheet.appendRow([
          '最終更新日時',
          'クラス',
          '出席番号',
          'ニックネーム',
          'パスワード'
        ]);
        userSheet.getRange(1, 1, 1, 5).setBackground('#059669').setFontColor('#ffffff').setFontWeight('bold');
        userSheet.setFrozenRows(1);
      }

      var u = data.user;
      var dataRange = userSheet.getDataRange().getValues();
      var foundRowIndex = -1;

      // 同じクラス・出席番号の児童がいるか探す
      for (var r = 1; r < dataRange.length; r++) {
        if (dataRange[r][1] == u.className && dataRange[r][2] == u.studentNumber) {
          foundRowIndex = r + 1; // 1-indexed
          break;
        }
      }

      var newRowValues = [
        new Date(),
        u.className,
        Number(u.studentNumber),
        u.nickname,
        String(u.password)
      ];

      if (foundRowIndex > 0) {
        userSheet.getRange(foundRowIndex, 1, 1, 5).setValues([newRowValues]);
      } else {
        userSheet.appendRow(newRowValues);
      }

      return ContentService.createTextOutput(JSON.stringify({
        status: 'success',
        action: 'user_synced'
      })).setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({
      status: 'ignored',
      message: 'Unknown action'
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    status: 'ok',
    message: '分数30分ドリル用スプレッドシートAPIは正常に動作しています。'
  })).setMimeType(ContentService.MimeType.JSON);
}
