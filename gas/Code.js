/**
 * 小学5年 分数計算30分ドリル バックエンド (GAS)
 * - 学習ログ記録
 * - 児童名簿管理
 * - 「日別集計」ダッシュボード自動生成
 * - 「研究用_学習曲線」分析シート自動生成
 */

// スプレッドシートを開いた時のカスタムメニュー
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('📐 分数ドリル管理')
    .addItem('📊 「日別集計」シートを再構築', 'setupDailySummarySheet')
    .addItem('📈 「研究用_学習曲線」シートを再構築', 'setupResearchSheet')
    .addToUi();
}

function doPost(e) {
  try {
    var rawData = e.postData.contents;
    var data = JSON.parse(rawData);
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // 1. 学習ログの保存
    if (data.action === 'save_logs' && data.logs && data.logs.length > 0) {
      var logSheet = getOrCreateLogSheet(ss);

      var rows = [];
      for (var i = 0; i < data.logs.length; i++) {
        var log = data.logs[i];
        var d = new Date(log.timestamp);
        var dateStr = Utilities.formatDate(d, 'Asia/Tokyo', 'yyyy-MM-dd');

        rows.push([
          d,                                        // A: 記録日時
          log.className || '',                     // B: クラス
          log.studentNumber ? Number(log.studentNumber) : '', // C: 出席番号
          log.nickname || log.studentName || '児童', // D: ニックネーム
          log.formula || '',                       // E: 問題式
          log.op || '',                            // F: 演算
          log.category || '',                      // G: 単元分類
          log.correctAnswer || '',                 // H: 正解
          log.timeSpentSeconds || 0,               // I: 所要時間(秒)
          log.mistakeCount || 0,                   // J: 間違えた回数
          log.sessionId || '',                     // K: セッションID
          dateStr                                  // L: 日付 (YYYY-MM-DD)
        ]);
      }

      if (rows.length > 0) {
        var lastRow = logSheet.getLastRow();
        logSheet.getRange(lastRow + 1, 1, rows.length, 12).setValues(rows);
      }

      // 集計シートが無ければ初回自動作成
      if (!ss.getSheetByName('日別集計')) {
        setupDailySummarySheet();
      }
      if (!ss.getSheetByName('研究用_学習曲線')) {
        setupResearchSheet();
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

      var newRowValues = [
        new Date(),
        u.className,
        Number(u.studentNumber),
        u.nickname
      ];

      if (foundRowIndex > 0) {
        userSheet.getRange(foundRowIndex, 1, 1, 4).setValues([newRowValues]);
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
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var action = (e && e.parameter && e.parameter.action) ? e.parameter.action : 'status';

    // 1. 児童名簿の取得 (端末側の名前自動補完用)
    if (action === 'get_users') {
      var userSheet = ss.getSheetByName('児童名簿');
      var users = [];
      if (userSheet) {
        var values = userSheet.getDataRange().getValues();
        // 2行目以降がデータ (0行目はヘッダー: 最終更新日時, クラス, 出席番号, ニックネーム)
        for (var i = 1; i < values.length; i++) {
          if (values[i][1] && values[i][2]) {
            users.push({
              className: String(values[i][1]),
              studentNumber: Number(values[i][2]),
              nickname: String(values[i][3] || '')
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
        // 列: A:日時, B:クラス, C:番号, D:ニックネーム, ..., I:秒数, J:ミス, K:セッション, L:日付
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
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow(['最終更新日時', 'クラス', '出席番号', 'ニックネーム']);
    sheet.getRange(1, 1, 1, 4).setBackground('#059669').setFontColor('#ffffff').setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/**
 * 📊 「日別集計」シートの作成・フォーミュラ設定
 * 日付とクラスを選ぶだけで、児童ごとの問題数・学習時間・ミス数・正答率が瞬時に集計されます。
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

  // クラスのドロップダウン設定
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
      // B列: ニックネーム (名簿シートから参照)
      '=IFERROR(INDEX(児童名簿!$D:$D, MATCH(1, (児童名簿!$B:$B=$D$1)*(児童名簿!$C:$C=' + num + '), 0)), "-")',
      // C列: 解いた問題数
      '=COUNTIFS(計算ドリル記録!$L:$L, $B$1, 計算ドリル記録!$B:$B, $D$1, 計算ドリル記録!$C:$C, ' + num + ')',
      // D列: 学習時間(分)
      '=IF(C' + row + '=0, 0, ROUND(SUMIFS(計算ドリル記録!$I:$I, 計算ドリル記録!$L:$L, $B$1, 計算ドリル記録!$B:$B, $D$1, 計算ドリル記録!$C:$C, ' + num + ')/60, 1))',
      // E列: 平均解答時間(秒)
      '=IF(C' + row + '=0, "-", ROUND(SUMIFS(計算ドリル記録!$I:$I, 計算ドリル記録!$L:$L, $B$1, 計算ドリル記録!$B:$B, $D$1, 計算ドリル記録!$C:$C, ' + num + ')/C' + row + ', 0))',
      // F列: 間違えた回数
      '=IF(C' + row + '=0, "-", SUMIFS(計算ドリル記録!$J:$J, 計算ドリル記録!$L:$L, $B$1, 計算ドリル記録!$B:$B, $D$1, 計算ドリル記録!$C:$C, ' + num + '))',
      // G列: 1発正解数 (ミス0)
      '=IF(C' + row + '=0, "-", COUNTIFS(計算ドリル記録!$L:$L, $B$1, 計算ドリル記録!$B:$B, $D$1, 計算ドリル記録!$C:$C, ' + num + ', 計算ドリル記録!$J:$J, 0))',
      // H列: 1発正解率
      '=IF(C' + row + '=0, "-", TEXT(G' + row + '/C' + row + ', "0.0%"))'
    ]);
  }
  sheet.getRange(4, 1, 45, headers.length).setValues(formulaRows);

  // 4. クラス合計・平均行 (49行目)
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

  // 列幅・配置調整
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
 * 「問題を解けば解くほど所要時間が短縮し正答率が上がるか」を研究・グラフ化するシート
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

  // 動的抽出数式 (FILTER関数)
  // A4セルに1つの数式を入れるだけで、該当する児童のデータがズラリと自動展開されます
  var filterFormula = '=IFERROR(QUERY(計算ドリル記録!A2:J, "SELECT A, E, G, H, I, J WHERE B = \'" & $B$1 & "\' AND C = " & $D$1 & " ORDER BY A ASC", 0), "")';

  // QUERYの結果を分解して表示するためのスマートフォーミュラ
  sheet.getRange('B4').setFormula(filterFormula);

  // A列に通番（第1問、第2問...）を入れる数式
  sheet.getRange('A4').setFormula('=ARRAYFORMULA(IF(ISBLANK(B4:B), "", "第 " & (ROW(B4:B)-3) & " 問"))');

  // 列幅
  sheet.setColumnWidth(1, 130);
  sheet.setColumnWidth(2, 160);
  sheet.setColumnWidth(3, 150);
  sheet.setColumnWidth(4, 160);
  sheet.setColumnWidth(5, 100);
  sheet.setColumnWidth(6, 120);
  sheet.setColumnWidth(7, 110);
  sheet.setColumnWidth(8, 110);
}
