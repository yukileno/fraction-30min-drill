/**
 * 小学5年 分数計算30分ドリル バックエンド (GAS)
 * - 学習ログ記録（時系列原本ログ）
 * - 児童名簿管理（最新サマリー自動集計＆名簿同期）
 * - 「日別集計」ダッシュボード自動生成
 * - 「研究用_学習曲線」分析シート自動生成
 */

// スプレッドシートを開いた時のカスタムメニュー
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('📐 分数ドリル管理')
    .addItem('⚡ 「児童名簿」に自動計算式を一括設定（高速化・推奨）', 'applyUserSheetFormulas')
    .addItem('👥 「児童名簿」の累計実績を全再集計', 'recalculateAllUserSummaries')
    .addItem('📊 「日別集計」シートを再構築', 'setupDailySummarySheet')
    .addItem('📈 「研究用_学習曲線」シートを再構築', 'setupResearchSheet')
    .addToUi();
}

function doPost(e) {
  try {
    var rawData = e.postData.contents;
    var data = JSON.parse(rawData);
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // 1. 学習ログの保存（原本ログ追記に特化して0.2秒で超高速終了！）
    if (data.action === 'save_logs' && data.logs && data.logs.length > 0) {
      var logSheet = getOrCreateLogSheet(ss);

      var rows = [];
      for (var i = 0; i < data.logs.length; i++) {
        var log = data.logs[i];
        var d = new Date(log.timestamp);
        var dateStr = Utilities.formatDate(d, 'Asia/Tokyo', 'yyyy-MM-dd');

        rows.push([
          d,                                                  // A: 記録日時
          log.className || '',                               // B: クラス
          log.studentNumber ? Number(log.studentNumber) : '', // C: 出席番号
          log.nickname || log.studentName || '児童',           // D: ニックネーム
          log.formula || '',                                 // E: 問題式
          log.op || '',                                      // F: 演算
          log.category || '',                                // G: 単元分類
          log.correctAnswer || '',                           // H: 正解
          log.timeSpentSeconds || 0,                         // I: 所要時間(秒)
          log.mistakeCount || 0,                             // J: 間違えた回数
          log.sessionId || '',                               // K: セッションID
          dateStr                                            // L: 日付 (YYYY-MM-DD)
        ]);
      }

      if (rows.length > 0) {
        var lastRow = logSheet.getLastRow();
        logSheet.getRange(lastRow + 1, 1, rows.length, 12).setValues(rows);
      }

      return ContentService.createTextOutput(JSON.stringify({
        status: 'success',
        savedCount: rows.length
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // 2. 児童名簿の保存（名前登録・更新時）
    if (data.action === 'sync_user' && data.user) {
      var userSheet = getOrCreateUserSheet(ss);
      var u = data.user;
      var dataRange = userSheet.getDataRange().getValues();
      var foundRowIndex = -1;

      for (var r = 1; r < dataRange.length; r++) {
        if (dataRange[r][1] == u.className && dataRange[r][2] == u.studentNumber) {
          foundRowIndex = r + 1;
          break;
        }
      }

      if (foundRowIndex > 0) {
        // 既存行の場合、A列（更新日時）とD列（ニックネーム）のみ更新（累計値は保持）
        userSheet.getRange(foundRowIndex, 1).setValue(new Date());
        userSheet.getRange(foundRowIndex, 4).setValue(u.nickname);
      } else {
        // 新規児童行の追加（自動計算式を直接設定！）
        var newRow = userSheet.getLastRow() + 1;
        userSheet.appendRow([
          new Date(),
          u.className,
          Number(u.studentNumber),
          u.nickname,
          "=COUNTIFS('計算ドリル記録'!$B:$B, $B" + newRow + ", '計算ドリル記録'!$C:$C, $C" + newRow + ")",
          "=IF($E" + newRow + ">0, ROUND(SUMIFS('計算ドリル記録'!$I:$I, '計算ドリル記録'!$B:$B, $B" + newRow + ", '計算ドリル記録'!$C:$C, $C" + newRow + ")/60, 1), 0)",
          "=IF($E" + newRow + ">0, ROUND(COUNTIFS('計算ドリル記録'!$B:$B, $B" + newRow + ", '計算ドリル記録'!$C:$C, $C" + newRow + ", '計算ドリル記録'!$J:$J, 0) / $E" + newRow + " * 100), 100)",
          "=IF($E" + newRow + ">0, ROUND(SUMIFS('計算ドリル記録'!$I:$I, '計算ドリル記録'!$B:$B, $B" + newRow + ", '計算ドリル記録'!$C:$C, $C" + newRow + ") / $E" + newRow + "), 0)",
          "=SUMIFS('計算ドリル記録'!$J:$J, '計算ドリル記録'!$B:$B, $B" + newRow + ", '計算ドリル記録'!$C:$C, $C" + newRow + ")",
          "=IF($E" + newRow + ">0, IFERROR(TEXT(MAXIFS('計算ドリル記録'!$A:$A, '計算ドリル記録'!$B:$B, $B" + newRow + ", '計算ドリル記録'!$C:$C, $C" + newRow + "), \"yyyy-mm-dd hh:mm\"), \"\"), \"\")"
        ]);
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
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var action = (e && e.parameter && e.parameter.action) ? e.parameter.action : 'status';

    // 1. 児童名簿の取得 (名前自動補完 ＆ 過去累計サマリー読込)
    if (action === 'get_users') {
      var userSheet = getOrCreateUserSheet(ss);
      var users = [];
      if (userSheet) {
        var values = userSheet.getDataRange().getValues();
        // 1行目はヘッダー
        for (var i = 1; i < values.length; i++) {
          var row = values[i];
          if (row[1] && row[2]) {
            var lastDateStr = '';
            if (row[9]) {
              try {
                lastDateStr = row[9] instanceof Date
                  ? Utilities.formatDate(row[9], 'Asia/Tokyo', 'yyyy-MM-dd HH:mm')
                  : String(row[9]);
              } catch(e) {}
            }
            users.push({
              className: String(row[1]),
              studentNumber: Number(row[2]),
              nickname: String(row[3] || ''),
              totalSolved: Number(row[4]) || 0,
              totalMinutes: Number(row[5]) || 0,
              accuracy: (row[6] !== '' && !isNaN(row[6])) ? Number(row[6]) : null,
              avgSeconds: (row[7] !== '' && !isNaN(row[7])) ? Number(row[7]) : null,
              totalMistakes: Number(row[8]) || 0,
              lastStudyAt: lastDateStr
            });
          }
        }
      }
      return ContentService.createTextOutput(JSON.stringify({
        status: 'success',
        users: users
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // 2. 指定児童の本日の集計データ取得
    if (action === 'get_student_summary') {
      var pClass = e.parameter.class || '';
      var pNumber = Number(e.parameter.number) || 0;
      var pDate = e.parameter.date || Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');

      var logSheet = ss.getSheetByName('計算ドリル記録');
      var solvedCount = 0;
      var totalSeconds = 0;
      var totalMistakes = 0;
      var firstTryCount = 0;

      if (logSheet) {
        var logValues = logSheet.getDataRange().getValues();
        for (var j = 1; j < logValues.length; j++) {
          var row = logValues[j];
          var rowClass = String(row[1]);
          var rowNum = Number(row[2]);
          var rowDate = String(row[11]);

          if (rowClass === pClass && rowNum === pNumber && rowDate === pDate) {
            solvedCount++;
            var sec = Number(row[8]) || 0;
            var mis = Number(row[9]) || 0;
            totalSeconds += sec;
            totalMistakes += mis;
            if (mis === 0) firstTryCount++;
          }
        }
      }

      return ContentService.createTextOutput(JSON.stringify({
        status: 'success',
        summary: {
          className: pClass,
          studentNumber: pNumber,
          date: pDate,
          solvedCount: solvedCount,
          totalMinutes: Math.round((totalSeconds / 60) * 10) / 10,
          avgSeconds: solvedCount > 0 ? Math.round(totalSeconds / solvedCount) : 0,
          totalMistakes: totalMistakes,
          accuracy: solvedCount > 0 ? Math.round((firstTryCount / solvedCount) * 100) : 100
        }
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // デフォルト: 稼働ステータス確認
    return ContentService.createTextOutput(JSON.stringify({
      status: 'ok',
      message: '分数30分ドリル用スプレッドシートAPIは正常に動作しています。',
      serverTime: new Date().toISOString()
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// --- 児童名簿シートの自動計算式設定（GAS軽量化・同時実行制限対策） ---

/**
 * ⚡ 「児童名簿」シートの全生徒行（E〜J列）にスプレッドシート関数を一括セット
 * （GASのループ集計を撤廃し、同時30件制限を根本回避する超高速化設計）
 */
function applyUserSheetFormulas() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var userSheet = getOrCreateUserSheet(ss);
  var lastRow = userSheet.getLastRow();

  if (lastRow <= 1) {
    SpreadsheetApp.getUi().alert('児童名簿にデータがありません。クラスと番号を入力してください。');
    return;
  }

  var numRows = lastRow - 1;
  var formulas = [];

  for (var r = 2; r <= lastRow; r++) {
    formulas.push([
      "=COUNTIFS('計算ドリル記録'!$B:$B, $B" + r + ", '計算ドリル記録'!$C:$C, $C" + r + ")",
      "=IF($E" + r + ">0, ROUND(SUMIFS('計算ドリル記録'!$I:$I, '計算ドリル記録'!$B:$B, $B" + r + ", '計算ドリル記録'!$C:$C, $C" + r + ")/60, 1), 0)",
      "=IF($E" + r + ">0, ROUND(COUNTIFS('計算ドリル記録'!$B:$B, $B" + r + ", '計算ドリル記録'!$C:$C, $C" + r + ", '計算ドリル記録'!$J:$J, 0) / $E" + r + " * 100), 100)",
      "=IF($E" + r + ">0, ROUND(SUMIFS('計算ドリル記録'!$I:$I, '計算ドリル記録'!$B:$B, $B" + r + ", '計算ドリル記録'!$C:$C, $C" + r + ") / $E" + r + "), 0)",
      "=SUMIFS('計算ドリル記録'!$J:$J, '計算ドリル記録'!$B:$B, $B" + r + ", '計算ドリル記録'!$C:$C, $C" + r + ")",
      "=IF($E" + r + ">0, IFERROR(TEXT(MAXIFS('計算ドリル記録'!$A:$A, '計算ドリル記録'!$B:$B, $B" + r + ", '計算ドリル記録'!$C:$C, $C" + r + "), \"yyyy-mm-dd hh:mm\"), \"\"), \"\")"
    ]);
  }

  userSheet.getRange(2, 5, numRows, 6).setFormulas(formulas);

  SpreadsheetApp.getUi().alert(
    '⚡ 児童名簿（2行目〜' + lastRow + '行目）に自動計算式を一括設定しました！\n\n' +
    '・原本ログからリアルタイムで自動集計されます\n' +
    '・GASの通信負荷が最小化され、混雑時の安定性が大幅に向上しました。'
  );
}

// --- 児童名簿シートの累計サマリー自動集計 ---

/**
 * 今回送信された学習ログをもとに、児童名簿シートの累計実績（E〜J列）を即時更新
 */
function updateUserSummariesFromLogs(ss, logs) {
  var userSheet = getOrCreateUserSheet(ss);
  var values = userSheet.getDataRange().getValues();

  // 児童ごとに今回のログを集計
  var studentDeltas = {};
  for (var i = 0; i < logs.length; i++) {
    var l = logs[i];
    var c = l.className;
    var n = l.studentNumber;
    if (!c || !n) continue;

    var key = c + '_' + n;
    if (!studentDeltas[key]) {
      studentDeltas[key] = {
        className: c,
        studentNumber: Number(n),
        nickname: l.nickname || l.studentName || '',
        solved: 0,
        seconds: 0,
        mistakes: 0,
        firstTry: 0,
        lastTime: new Date(l.timestamp || Date.now())
      };
    }

    var item = studentDeltas[key];
    item.solved += 1;
    item.seconds += (Number(l.timeSpentSeconds) || 0);
    item.mistakes += (Number(l.mistakeCount) || 0);
    if ((Number(l.mistakeCount) || 0) === 0) {
      item.firstTry += 1;
    }
    var logDate = new Date(l.timestamp || Date.now());
    if (logDate > item.lastTime) {
      item.lastTime = logDate;
    }
  }

  // 既存行のマップ作成 (key -> rowNumber)
  var rowMap = {};
  for (var r = 1; r < values.length; r++) {
    var k = String(values[r][1]) + '_' + String(values[r][2]);
    rowMap[k] = r + 1; // 1-indexed行番号
  }

  // 各児童の累計値を加算・更新
  for (var key in studentDeltas) {
    var delta = studentDeltas[key];
    if (rowMap[key]) {
      var rIdx = rowMap[key];
      var oldRow = values[rIdx - 1];

      var oldSolved = Number(oldRow[4]) || 0;
      var oldMinutes = Number(oldRow[5]) || 0;
      var oldAcc = (oldRow[6] !== '' && !isNaN(oldRow[6])) ? Number(oldRow[6]) : null;
      var oldAvgSec = (oldRow[7] !== '' && !isNaN(oldRow[7])) ? Number(oldRow[7]) : null;
      var oldMistakes = Number(oldRow[8]) || 0;

      // 既存の合計秒数・一発正解数を推計復元
      var oldTotalSec = (oldAvgSec !== null && oldSolved > 0) ? (oldAvgSec * oldSolved) : (oldMinutes * 60);
      var oldFirstTry = (oldAcc !== null && oldSolved > 0) ? Math.round(oldSolved * oldAcc / 100) : 0;

      var newSolved = oldSolved + delta.solved;
      var newTotalSec = oldTotalSec + delta.seconds;
      var newFirstTry = oldFirstTry + delta.firstTry;
      var newMistakes = oldMistakes + delta.mistakes;

      var newMinutes = Math.round((newTotalSec / 60) * 10) / 10;
      var newAcc = newSolved > 0 ? Math.round((newFirstTry / newSolved) * 100) : 100;
      var newAvgSec = newSolved > 0 ? Math.round(newTotalSec / newSolved) : 0;

      // E〜J列を一括更新
      userSheet.getRange(rIdx, 1).setValue(new Date()); // A列: 最終更新
      if (delta.nickname && !oldRow[3]) {
        userSheet.getRange(rIdx, 4).setValue(delta.nickname); // D列
      }
      userSheet.getRange(rIdx, 5, 1, 6).setValues([[
        newSolved,
        newMinutes,
        newAcc,
        newAvgSec,
        newMistakes,
        delta.lastTime
      ]]);
    } else {
      // 児童名簿に未登録の場合は新規追加
      var acc = delta.solved > 0 ? Math.round((delta.firstTry / delta.solved) * 100) : 100;
      var avg = delta.solved > 0 ? Math.round(delta.seconds / delta.solved) : 0;
      var mins = Math.round((delta.seconds / 60) * 10) / 10;

      userSheet.appendRow([
        new Date(),
        delta.className,
        delta.studentNumber,
        delta.nickname,
        delta.solved,
        mins,
        acc,
        avg,
        delta.mistakes,
        delta.lastTime
      ]);
    }
  }
}

/**
 * 👥 「計算ドリル記録」の全過去ログから「児童名簿」の累計実績を完全再集計
 * （手動メンテ・初期同期用）
 */
function recalculateAllUserSummaries() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var logSheet = ss.getSheetByName('計算ドリル記録');
  var userSheet = getOrCreateUserSheet(ss);

  if (!logSheet) {
    SpreadsheetApp.getUi().alert('計算ドリル記録シートが見つかりません。');
    return;
  }

  var logValues = logSheet.getDataRange().getValues();
  if (logValues.length <= 1) {
    SpreadsheetApp.getUi().alert('計算ドリル記録にデータがまだありません。');
    return;
  }

  // 全ログから集計
  // A:日時, B:クラス, C:番号, D:ニックネーム, ..., I:秒数, J:ミス, K:セッション, L:日付
  var summary = {};
  for (var i = 1; i < logValues.length; i++) {
    var r = logValues[i];
    var c = String(r[1]).trim();
    var n = Number(r[2]);
    if (!c || !n) continue;

    var key = c + '_' + n;
    if (!summary[key]) {
      summary[key] = {
        className: c,
        studentNumber: n,
        nickname: String(r[3] || ''),
        solved: 0,
        seconds: 0,
        mistakes: 0,
        firstTry: 0,
        lastTime: new Date(r[0] || Date.now())
      };
    }

    var item = summary[key];
    item.solved += 1;
    item.seconds += (Number(r[8]) || 0);
    item.mistakes += (Number(r[9]) || 0);
    if ((Number(r[9]) || 0) === 0) item.firstTry += 1;

    var curDate = new Date(r[0]);
    if (curDate > item.lastTime) item.lastTime = curDate;
    if (r[3] && !item.nickname) item.nickname = String(r[3]);
  }

  // 名簿シートの既存データと照合
  var userValues = userSheet.getDataRange().getValues();
  var rowMap = {};
  for (var u = 1; u < userValues.length; u++) {
    var k = String(userValues[u][1]) + '_' + String(userValues[u][2]);
    rowMap[k] = u + 1;
  }

  var updatedCount = 0;
  var insertedCount = 0;

  for (var sKey in summary) {
    var s = summary[sKey];
    var acc = s.solved > 0 ? Math.round((s.firstTry / s.solved) * 100) : 100;
    var avg = s.solved > 0 ? Math.round(s.seconds / s.solved) : 0;
    var mins = Math.round((s.seconds / 60) * 10) / 10;

    if (rowMap[sKey]) {
      var rowIdx = rowMap[sKey];
      userSheet.getRange(rowIdx, 5, 1, 6).setValues([[
        s.solved,
        mins,
        acc,
        avg,
        s.mistakes,
        s.lastTime
      ]]);
      if (s.nickname && !userValues[rowIdx - 1][3]) {
        userSheet.getRange(rowIdx, 4).setValue(s.nickname);
      }
      updatedCount++;
    } else {
      userSheet.appendRow([
        new Date(),
        s.className,
        s.studentNumber,
        s.nickname,
        s.solved,
        mins,
        acc,
        avg,
        s.mistakes,
        s.lastTime
      ]);
      insertedCount++;
    }
  }

  SpreadsheetApp.getUi().alert(
    '児童名簿の累計実績の再集計が完了しました！\n\n' +
    '・更新: ' + updatedCount + ' 名\n' +
    '・新規追加: ' + insertedCount + ' 名'
  );
}

// --- シート取得・作成ヘルパー ---

function getOrCreateLogSheet(ss) {
  var sheetName = '計算ドリル記録';
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow([
      '記録日時', 'クラス', '出席番号', 'ニックネーム',
      '問題式', '演算', '単元分類', '正解',
      '所要時間(秒)', '間違えた回数', 'セッションID', '日付(検索用)'
    ]);
    sheet.getRange(1, 1, 1, 12).setBackground('#2563eb').setFontColor('#ffffff').setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function getOrCreateUserSheet(ss) {
  var sheetName = '児童名簿';
  var sheet = ss.getSheetByName(sheetName);
  var headers = [
    '最終更新日時',       // A (index 0)
    'クラス',             // B (index 1)
    '出席番号',           // C (index 2)
    'ニックネーム',       // D (index 3)
    '累計問題数',         // E (index 4)
    '累計学習時間(分)',   // F (index 5)
    '1発正解率(%)',       // G (index 6)
    '平均解答時間(秒)',   // H (index 7)
    '累計ミス回数',       // I (index 8)
    '最終学習日時'        // J (index 9)
  ];

  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setBackground('#059669').setFontColor('#ffffff').setFontWeight('bold');
    sheet.setFrozenRows(1);
  } else {
    // 既存シートのヘッダーが短い場合は10列に拡張
    var curCols = Math.max(sheet.getLastColumn(), headers.length);
    var curRow1 = sheet.getRange(1, 1, 1, curCols).getValues()[0];
    if (curRow1.length < headers.length || !curRow1[4]) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers])
        .setBackground('#059669').setFontColor('#ffffff').setFontWeight('bold');
    }
  }

  // 列幅を美しく設定
  sheet.setColumnWidth(1, 140); // 最終更新日時
  sheet.setColumnWidth(2, 90);  // クラス
  sheet.setColumnWidth(3, 80);  // 出席番号
  sheet.setColumnWidth(4, 120); // ニックネーム
  sheet.setColumnWidth(5, 100); // 累計問題数
  sheet.setColumnWidth(6, 120); // 累計学習時間(分)
  sheet.setColumnWidth(7, 100); // 1発正解率(%)
  sheet.setColumnWidth(8, 120); // 平均解答時間(秒)
  sheet.setColumnWidth(9, 100); // 累計ミス回数
  sheet.setColumnWidth(10, 140);// 最終学習日時

  return sheet;
}

/**
 * 📊 「日別集計」シートの作成・フォーミュラ設定
 */
function setupDailySummarySheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetName = '日別集計';
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  } else {
    sheet.clear();
  }

  // 1. コントロール部 (日付選択 ＆ クラス選択)
  sheet.getRange('A1').setValue('📅 集計日付:').setFontWeight('bold');
  var todayStr = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
  sheet.getRange('B1').setValue(todayStr).setNumberFormat('@').setBackground('#fef3c7').setFontWeight('bold');

  sheet.getRange('C1').setValue('🏫 クラス:').setFontWeight('bold');
  sheet.getRange('D1').setValue('5年1組').setBackground('#fef3c7').setFontWeight('bold');

  var classRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['5年1組', '5年2組', '5年3組', '5年4組', '5年5組', '5年6組'], true)
    .build();
  sheet.getRange('D1').setDataValidation(classRule);

  sheet.getRange('E1').setValue('※黄色いセル（日付・クラス）を変更すると自動で再集計されます').setFontColor('#64748b').setFontSize(9);

  // 2. 表ヘッダー
  var headers = [
    '出席番号', 'ニックネーム', '解いた問題数', '学習時間(分)',
    '平均解答時間(秒)', '間違えた回数(合計)', '1発正解数', '1発正解率'
  ];
  sheet.getRange(3, 1, 1, headers.length).setValues([headers])
    .setBackground('#1e40af').setFontColor('#ffffff').setFontWeight('bold').setHorizontalAlignment('center');
  sheet.setFrozenRows(3);

  // 3. 各出席番号（1〜45番）の数式設定
  var formulaRows = [];
  for (var num = 1; num <= 45; num++) {
    var row = num + 3; // 行番号 (4〜48)
    formulaRows.push([
      num, // A列: 番号
      // B列: ニックネーム
      '=IFERROR(INDEX(児童名簿!$D:$D, MATCH(1, (児童名簿!$B:$B=$D$1)*(児童名簿!$C:$C=' + num + '), 0)), "-")',
      // C列: 解いた問題数
      '=COUNTIFS(計算ドリル記録!$L:$L, $B$1, 計算ドリル記録!$B:$B, $D$1, 計算ドリル記録!$C:$C, ' + num + ')',
      // D列: 学習時間(分)
      '=IF(C' + row + '=0, 0, ROUND(SUMIFS(計算ドリル記録!$I:$I, 計算ドリル記録!$L:$L, $B$1, 計算ドリル記録!$B:$B, $D$1, 計算ドリル記録!$C:$C, ' + num + ')/60, 1))',
      // E列: 平均解答時間(秒)
      '=IF(C' + row + '=0, "-", ROUND(SUMIFS(計算ドリル記録!$I:$I, 計算ドリル記録!$L:$L, $B$1, 計算ドリル記録!$B:$B, $D$1, 計算ドリル記録!$C:$C, ' + num + ')/C' + row + ', 0))',
      // F列: 間違えた回数
      '=IF(C' + row + '=0, "-", SUMIFS(計算ドリル記録!$J:$J, 計算ドリル記録!$L:$L, $B$1, 計算ドリル記録!$B:$B, $D$1, 計算ドリル記録!$C:$C, ' + num + '))',
      // G列: 1発正解数
      '=IF(C' + row + '=0, "-", COUNTIFS(計算ドリル記録!$L:$L, $B$1, 計算ドリル記録!$B:$B, $D$1, 計算ドリル記録!$C:$C, ' + num + ', 計算ドリル記録!$J:$J, 0))',
      // H列: 1発正解率
      '=IF(C' + row + '=0, "-", TEXT(G' + row + '/C' + row + ', "0.0%"))'
    ]);
  }
  sheet.getRange(4, 1, 45, headers.length).setValues(formulaRows);

  // 4. クラス平均行 (49行目)
  var avgRow = [
    '【クラス平均】',
    '-',
    '=IFERROR(ROUND(AVERAGEIF(C4:C48, ">0"), 1), 0)',
    '=IFERROR(ROUND(AVERAGEIF(D4:D48, ">0"), 1), 0)',
    '=IFERROR(ROUND(AVERAGEIF(E4:E48, ">0"), 0), "-")',
    '=IFERROR(SUM(F4:F48), 0)',
    '=IFERROR(SUM(G4:G48), 0)',
    '=IFERROR(TEXT(SUM(G4:G48)/SUM(C4:C48), "0.0%"), "-")'
  ];
  sheet.getRange(49, 1, 1, headers.length).setValues([avgRow])
    .setBackground('#dbeafe').setFontWeight('bold');

  sheet.setColumnWidth(1, 80);
  sheet.setColumnWidth(2, 130);
  sheet.setColumnWidth(3, 110);
  sheet.setColumnWidth(4, 110);
  sheet.setColumnWidth(5, 130);
  sheet.setColumnWidth(6, 140);
  sheet.setColumnWidth(7, 100);
  sheet.setColumnWidth(8, 110);
  sheet.getRange(4, 1, 46, headers.length).setHorizontalAlignment('center');
}

/**
 * 📈 「研究用_学習曲線」シートの作成
 */
function setupResearchSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetName = '研究用_学習曲線';
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  } else {
    sheet.clear();
  }

  // コントロール部
  sheet.getRange('A1').setValue('🏫 クラス:').setFontWeight('bold');
  sheet.getRange('B1').setValue('5年1組').setBackground('#fef3c7').setFontWeight('bold');
  var classRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['5年1組', '5年2組', '5年3組', '5年4組', '5年5組', '5年6組'], true)
    .build();
  sheet.getRange('B1').setDataValidation(classRule);

  sheet.getRange('C1').setValue('出席番号:').setFontWeight('bold');
  sheet.getRange('D1').setValue(1).setBackground('#fef3c7').setFontWeight('bold');

  sheet.getRange('E1').setValue('児童名:').setFontWeight('bold');
  sheet.getRange('F1').setFormula('=IFERROR(INDEX(児童名簿!$D:$D, MATCH(1, (児童名簿!$B:$B=$B$1)*(児童名簿!$C:$C=$D$1), 0)), "未登録")')
    .setFontWeight('bold').setFontColor('#15803d');

  sheet.getRange('G1').setValue('※クラスと出席番号を選ぶと、その児童の全問題の時系列ログが自動抽出されます').setFontColor('#64748b').setFontSize(9);

  // 表ヘッダー
  var headers = [
    '解いた順番(問目)', '記録日時', '問題式', '単元分類',
    '正解', '所要時間(秒)', '間違えた回数', '結果(1発/ミス)'
  ];
  sheet.getRange(3, 1, 1, headers.length).setValues([headers])
    .setBackground('#047857').setFontColor('#ffffff').setFontWeight('bold').setHorizontalAlignment('center');
  sheet.setFrozenRows(3);

  var filterFormula = '=IFERROR(QUERY(計算ドリル記録!A2:J, "SELECT A, E, G, H, I, J WHERE B = \'" & $B$1 & "\' AND C = " & $D$1 & " ORDER BY A ASC", 0), "")';
  sheet.getRange('B4').setFormula(filterFormula);
  sheet.getRange('A4').setFormula('=ARRAYFORMULA(IF(ISBLANK(B4:B), "", "第 " & (ROW(B4:B)-3) & " 問"))');

  sheet.setColumnWidth(1, 130);
  sheet.setColumnWidth(2, 160);
  sheet.setColumnWidth(3, 150);
  sheet.setColumnWidth(4, 160);
  sheet.setColumnWidth(5, 100);
  sheet.setColumnWidth(6, 120);
  sheet.setColumnWidth(7, 110);
  sheet.setColumnWidth(8, 110);
}
