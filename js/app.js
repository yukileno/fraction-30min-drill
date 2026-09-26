// 熱血！分数1000本ノック アプリケーション制御
(function() {
  'use strict';

  const { generateProblem, checkAnswer } = window.FractionEngine;
  const StudyTracker = window.StudyTracker;
  const SheetSync = window.SheetSync;
  const AuthManager = window.AuthManager;

  // 熱血効果音プレイヤー (Base64オーディオ ＆ Web Audio API)
  class SoundPlayer {
    constructor() {
      this.hitAudio = null;
      this.homerunAudio = null;
      this.initAudios();
    }

    initAudios() {
      if (window.ASSETS) {
        if (window.ASSETS.HIT_SOUND) {
          this.hitAudio = new Audio(window.ASSETS.HIT_SOUND);
        }
        if (window.ASSETS.HOMERUN_SOUND) {
          this.homerunAudio = new Audio(window.ASSETS.HOMERUN_SOUND);
        }
      }
    }

    playHit() {
      try {
        if (this.hitAudio) {
          this.hitAudio.currentTime = 0;
          this.hitAudio.play().catch(() => {});
        } else {
          this.playSynthHit();
        }
      } catch (e) {
        this.playSynthHit();
      }
    }

    playHomerun() {
      try {
        if (this.homerunAudio) {
          this.homerunAudio.currentTime = 0;
          this.homerunAudio.play().catch(() => {});
        } else {
          this.playHit();
        }
      } catch (e) {
        this.playHit();
      }
    }

    // 音声ファイル未読込時のシンセサイザー代替音
    playSynthHit() {
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(880, ctx.currentTime); // A5
        osc.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.4, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.4);
      } catch (e) {}
    }

    playWrong() {
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(200, ctx.currentTime);
        osc.frequency.setValueAtTime(160, ctx.currentTime + 0.15);
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.35);
      } catch (e) {}
    }
  }

  class App {
    constructor() {
      this.sound = new SoundPlayer();
      this.auth = new AuthManager();
      this.problemMode = 'mix'; // ミックス固定
      this.currentProblem = null;
      this.activeInputBox = null;
      this.comboCount = 0; // 連続ヒット数
      this.pitchCount = 1; // 本日の投球数

      this.selectedClass = '5年1組';
      this.selectedNumber = 1;

      this.initElements();
      this.populateNumberSelect();

      // トラッカー初期化（1000本ノック仕様）
      this.tracker = new StudyTracker({
        targetKnocks: 1000,
        onTick: (data) => this.updateTimerDisplay(data),
        onIdleStateChange: (isIdle) => this.handleIdleChange(isIdle)
      });

      // スプレッドシート同期マネージャー
      this.sync = new SheetSync({
        onStatusChange: (status) => this.updateSyncButton(status)
      });

      this.initCoachImage();
      this.initScratchCanvas();
      this.bindEvents();

      // 毎回入部届（ログイン）を求める
      this.showAuthModal();

      // バックグラウンドでスプレッドシート名簿を先読み
      this.loadRemoteUsers();

      // 初期保存ボタン表示
      this.sync.checkAndNotify();
    }

    initElements() {
      this.appViewport = document.getElementById('appViewport');
      this.hitEffectOverlay = document.getElementById('hitEffectOverlay');
      this.hitEffectText = document.getElementById('hitEffectText');

      // スコアボード
      this.knockRemainingDisplay = document.getElementById('knockRemainingDisplay');
      this.knockStatusLabel = document.getElementById('knockStatusLabel');
      this.knockUnit = document.getElementById('knockUnit');
      this.knockProgress = document.getElementById('knockProgress');
      this.knockSubText = document.getElementById('knockSubText');

      this.studentDisplayName = document.getElementById('studentDisplayName');
      this.pitchNumberBadge = document.getElementById('pitchNumberBadge');
      this.categoryBadge = document.getElementById('categoryBadge');
      this.probTimerBadge = document.getElementById('probTimerBadge');
      this.formulaEl = document.getElementById('formulaDisplay');

      // 入力ボックス
      this.inputWhole = document.getElementById('inputWhole');
      this.inputNum = document.getElementById('inputNum');
      this.inputDen = document.getElementById('inputDen');
      this.activeInputBox = this.inputWhole;

      // ボタン
      this.btnCheck = document.getElementById('btnCheck');
      this.feedbackBox = document.getElementById('feedbackBox');

      // 鬼監督
      this.coachImg = document.getElementById('coachImg');
      this.coachBubble = document.getElementById('coachBubble');

      // ダッシュボード
      this.statTodaySolved = document.getElementById('statTodaySolved');
      this.statTodayTime = document.getElementById('statTodayTime');
      this.statSessionBadge = document.getElementById('statSessionBadge');

      this.statTodayAcc = document.getElementById('statTodayAcc');
      this.statPastAcc = document.getElementById('statPastAcc');
      this.statAccBadge = document.getElementById('statAccBadge');

      this.statTodaySpeed = document.getElementById('statTodaySpeed');
      this.statPastSpeed = document.getElementById('statPastSpeed');
      this.statSpeedBadge = document.getElementById('statSpeedBadge');

      this.statAllSolved = document.getElementById('statAllSolved');
      this.statAllTime = document.getElementById('statAllTime');
      this.statComboBadge = document.getElementById('statComboBadge');

      // 保存ボタン
      this.btnSync = document.getElementById('btnSync');
      this.btnSyncText = document.getElementById('btnSyncText');

      // 認証モーダル要素
      this.authModal = document.getElementById('authModal');
      this.authStepSelect = document.getElementById('authStepSelect');
      this.authStepConfirm = document.getElementById('authStepConfirm');
      this.authStepRegister = document.getElementById('authStepRegister');

      this.authClass = document.getElementById('authClass');
      this.authNumber = document.getElementById('authNumber');
      this.btnStepNext = document.getElementById('btnStepNext');

      this.confirmClassNum = document.getElementById('confirmClassNum');
      this.confirmNickname = document.getElementById('confirmNickname');
      this.btnStartConfirmed = document.getElementById('btnStartConfirmed');
      this.btnEditNickname = document.getElementById('btnEditNickname');

      this.registerClassNum = document.getElementById('registerClassNum');
      this.inputNickname = document.getElementById('inputNickname');
      this.btnSaveNickname = document.getElementById('btnSaveNickname');
      this.btnBackToSelect = document.getElementById('btnBackToSelect');

      // 完走・放置・記録モーダル
      this.goalModal = document.getElementById('goalModal');
      this.btnContinueExtra = document.getElementById('btnContinueExtra');
      this.idleModal = document.getElementById('idleModal');
      this.btnResume = document.getElementById('btnResume');
      this.logModal = document.getElementById('logModal');
      this.btnShowLogs = document.getElementById('btnShowLogs');
      this.btnCloseLogs = document.getElementById('btnCloseLogs');
      this.btnCloseLogsBottom = document.getElementById('btnCloseLogsBottom');
      this.logTableBody = document.getElementById('logTableBody');
    }

    initCoachImage() {
      const bgUrl = (window.ASSETS && window.ASSETS.KYOJIN_IMG)
        ? `url("${window.ASSETS.KYOJIN_IMG}")`
        : 'url("kyojin.jpg")';
      document.body.style.backgroundImage = bgUrl;
      if (this.appViewport) {
        this.appViewport.style.backgroundImage = bgUrl;
      }
    }

    populateNumberSelect() {
      this.authNumber.innerHTML = '';
      for (let i = 1; i <= 45; i++) {
        const opt = document.createElement('option');
        opt.value = i;
        opt.textContent = `背番号 ${i} 番`;
        this.authNumber.appendChild(opt);
      }
    }

    async loadRemoteUsers() {
      try {
        const users = await this.sync.fetchUsersFromSheet(2000);
        if (users && users.length > 0) {
          this.auth.syncWithRemoteUsers(users);
        }
      } catch (e) {
        console.warn('Could not pre-fetch users:', e);
      }
    }

    updateSyncButton(info) {
      this.btnSync.className = 'btn-sync';
      if (info.state === 'saving') {
        this.btnSync.classList.add('status-saving');
        this.btnSync.disabled = true;
        this.btnSyncText.textContent = `⏳ 送信中...`;
      } else if (info.state === 'unsaved' || info.count > 0) {
        this.btnSync.classList.add('status-unsaved');
        this.btnSync.disabled = false;
        this.btnSyncText.textContent = `⚾ スコア送信 (${info.count}球)`;
      } else {
        this.btnSync.classList.add('status-saved');
        this.btnSync.disabled = true;
        this.btnSyncText.textContent = `✅ スコア保存済`;
      }
    }

    showAuthModal() {
      this.authModal.classList.add('active');
      this.authStepSelect.style.display = 'block';
      this.authStepConfirm.style.display = 'none';
      this.authStepRegister.style.display = 'none';
    }

    hideAuthModal() {
      this.authModal.classList.remove('active');
    }

    onLoginComplete(user, isNew = false) {
      this.hideAuthModal();
      this.studentDisplayName.textContent = `⚾ 背番号${user.studentNumber}番 ${user.nickname} 選手`;
      this.updateGrowthDashboard();
      this.nextProblem();
      this.tracker.start();

      this.setCoachSpeech(`「${user.nickname}！打席に立て！努力は裏切らんぞ！！」`);

      if (isNew) {
        this.sync.syncUser(user);
      }
    }

    setCoachSpeech(text) {
      if (this.coachBubble) {
        this.coachBubble.textContent = text;
      }
    }

    updateTimerDisplay(data) {
      this.probTimerBadge.textContent = `勝負時間: ${data.problemSeconds}秒`;
    }

    handleIdleChange(isIdle) {
      if (isIdle) {
        this.idleModal.classList.add('active');
        this.setCoachSpeech('「おい！タイムだ！汗を拭いて気合を入れ直せ！！」');
      } else {
        this.idleModal.classList.remove('active');
      }
    }

    nextProblem() {
      this.currentProblem = generateProblem(this.problemMode);
      
      const f1Str = this.currentProblem.frac1 ? this.formatFrac(this.currentProblem.frac1) : '';
      const f2Str = this.currentProblem.frac2 ? this.formatFrac(this.currentProblem.frac2) : '';
      this.currentProblem.formula = `${f1Str} ${this.currentProblem.op} ${f2Str}`;
      this.currentProblem.correctAnswer = this.formatAns(this.currentProblem.answer);

      this.pitchNumberBadge.textContent = `第 ${this.pitchCount} 球！ 勝負！`;
      this.categoryBadge.textContent = this.currentProblem.category;
      this.renderFormula(this.currentProblem);
      this.resetInputs();
      this.clearFeedback();
      this.tracker.startNewProblem(this.currentProblem);
    }

    renderFormula(prob) {
      if (!prob) return;
      const renderTerm = (term) => {
        if (!term) return '';
        let html = '<div class="fraction-term">';
        if (term.whole > 0) {
          html += `<span class="frac-whole">${term.whole}</span>`;
        }
        if (term.num > 0 && term.den > 1) {
          html += `
            <div class="frac-vertical">
              <span class="frac-num">${term.num}</span>
              <span class="frac-den">${term.den}</span>
            </div>
          `;
        } else if (term.whole === 0 && term.num === 0) {
          html += `<span class="frac-whole">0</span>`;
        }
        html += '</div>';
        return html;
      };

      const term1 = prob.frac1 || prob.term1;
      const term2 = prob.frac2 || prob.term2;
      const leftHtml = renderTerm(term1);
      const rightHtml = renderTerm(term2);
      const opSymbol = prob.op === '+' ? '＋' : '－';

      this.formulaEl.innerHTML = `
        ${leftHtml}
        <span class="operator">${opSymbol}</span>
        ${rightHtml}
        <span class="equals">＝</span>
      `;
    }

    formatFrac(f) {
      if (!f) return '';
      if (f.whole > 0 && f.num > 0) return `${f.whole}と${f.num}/${f.den}`;
      if (f.whole > 0) return `${f.whole}`;
      return `${f.num}/${f.den}`;
    }

    formatAns(a) {
      if (!a) return '';
      if (a.isInteger || a.num === 0) return String(a.whole);
      if (a.whole === 0) return `${a.num}/${a.den}`;
      return `${a.whole}と${a.num}/${a.den}`;
    }

    resetInputs() {
      this.inputWhole.value = '';
      this.inputNum.value = '';
      this.inputDen.value = '';
      this.setActiveInput(this.inputWhole);
    }

    setActiveInput(box) {
      [this.inputWhole, this.inputNum, this.inputDen].forEach(b => b.classList.remove('active-target'));
      if (box) {
        this.activeInputBox = box;
        if (typeof box.focus === 'function') {
          box.focus();
        }
      }
    }

    checkAnswerNow() {
      if (!this.currentProblem) return;

      const wholeStr = this.inputWhole.value.trim();
      const numStr = this.inputNum.value.trim();
      const denStr = this.inputDen.value.trim();

      if (!wholeStr && !numStr && !denStr) {
        this.showFeedback('warning', 'バットを振れ！答えを入力するんだ！');
        this.setActiveInput(this.inputWhole);
        return;
      }

      const result = checkAnswer(this.currentProblem, wholeStr, numStr, denStr);

      if (result.isCorrect) {
        const isFirstTry = this.tracker.currentProblemMistakes === 0;
        this.tracker.recordSolve(this.currentProblem, result.userAnswerDisplay);

        // 連続ヒットカウント
        this.comboCount++;
        this.pitchCount++;

        // 🌟 正解演出！「カキーン！！」快音 ＆ 画面揺れ ＆ 特大エフェクト
        this.triggerHitEffect(isFirstTry);

        // 監督の熱血台詞
        if (isFirstTry) {
          const praises = [
            '「うむ！会心の当たりだ！！カキーン！！」',
            '「ナイスバッティング！努力は裏切らんぞ！！」',
            '「スタンドイン！特大ホームランだ！！」',
            '「完璧なスイングだ！その調子で行け！！」'
          ];
          this.setCoachSpeech(praises[Math.floor(Math.random() * praises.length)]);
        } else {
          this.setCoachSpeech('「粘って打ったな！泥臭く食らいつけ！！」');
        }

        this.showFeedback('correct', `⚾ カキーン！！ 正解だ！！ (答え: ${result.correctDisplay})`);
        this.updateGrowthDashboard();

        // 1000本達成判定
        const user = this.auth.getCurrentUser();
        const stats = this.tracker.getStatsComparison(user);
        if (stats.knocks.done === 1000) {
          setTimeout(() => {
            this.goalModal.classList.add('active');
          }, 800);
        }

        setTimeout(() => {
          this.nextProblem();
        }, 1100);

      } else {
        // 不正解演出
        this.comboCount = 0;
        this.sound.playWrong();
        this.tracker.recordMistake(`${wholeStr} ${numStr}/${denStr}`, result.message);

        const scolds = [
          '「バカモン！！まだ腰が入っとらん！！もう一丁！！」',
          '「ボール球に手を出すな！通分をしっかり見極めろ！！」',
          '「歯を食いしばれ！気合で食らいつくんだ！！」'
        ];
        this.setCoachSpeech(scolds[Math.floor(Math.random() * scolds.length)]);
        this.showFeedback('wrong', `💥 空振り三振！ ${result.message}`);

        if (result.canRetry) {
          if (!this.inputNum.value && !this.inputDen.value) {
            this.setActiveInput(this.inputWhole);
          } else {
            this.setActiveInput(this.inputNum);
          }
        }
      }
    }

    // 🌟 カキーン！演出（快音・画面揺れ・オノマトペ）
    triggerHitEffect(isHomerun = false) {
      if (isHomerun) {
        this.sound.playHomerun();
        this.hitEffectText.textContent = '特大ホームラン！！';
      } else {
        this.sound.playHit();
        this.hitEffectText.textContent = 'カキーン！！';
      }

      // 画面シェイク
      this.appViewport.classList.remove('screen-shake');
      void this.appViewport.offsetWidth; // リフロー強制
      this.appViewport.classList.add('screen-shake');

      // オノマトペレイヤー表示
      this.hitEffectOverlay.classList.remove('active');
      void this.hitEffectOverlay.offsetWidth;
      this.hitEffectOverlay.classList.add('active');

      setTimeout(() => {
        this.hitEffectOverlay.classList.remove('active');
        this.appViewport.classList.remove('screen-shake');
      }, 700);
    }

    clearFeedback() {
      this.feedbackBox.className = 'feedback-box feedback-empty';
      this.feedbackBox.textContent = '';
    }

    showFeedback(type, text) {
      this.feedbackBox.className = `feedback-box feedback-${type}`;
      this.feedbackBox.textContent = text;
    }

    // 猛特訓スコアボード（ダッシュボード）更新
    updateGrowthDashboard() {
      const user = this.auth.getCurrentUser();
      const stats = this.tracker.getStatsComparison(user);
      const k = stats.knocks;

      // 1000本ノックスコアボード
      if (k.isCompleted) {
        this.knockStatusLabel.textContent = '🔥 魂の追加特打！';
        this.knockRemainingDisplay.textContent = `${k.done}`;
        this.knockUnit.textContent = '本目！！';
        this.knockProgress.style.width = '100%';
        this.knockSubText.textContent = `猛者認定済！ 限界突破中 (+${k.extra}本)`;
      } else {
        this.knockStatusLabel.textContent = '🔥 魂の1000本ノック 残り';
        this.knockRemainingDisplay.textContent = `${k.remaining}`;
        this.knockUnit.textContent = '本！！';
        this.knockProgress.style.width = `${k.percent}%`;
        this.knockSubText.textContent = `打倒・分数の壁！ ${k.done} / ${k.target} 本 (${k.percent}%)`;
      }

      // 1. 本日特打
      this.statTodaySolved.textContent = `${stats.today.count}本`;
      this.statTodayTime.textContent = `特打時間: ${stats.today.todayMinutes}分`;

      // 2. 1発打率
      const rate = (stats.today.accuracy / 100).toFixed(3).replace(/^0/, '');
      this.statTodayAcc.textContent = stats.today.count > 0 ? `.${rate.replace('.', '')}` : '1.000';
      if (stats.past.count > 0) {
        const pastRate = (stats.past.accuracy / 100).toFixed(3).replace(/^0/, '');
        this.statPastAcc.textContent = `通算打率: .${pastRate.replace('.', '')}`;
        if (stats.accDiff !== null && stats.accDiff > 0) {
          this.statAccBadge.className = 'growth-badge up';
          this.statAccBadge.textContent = `📈 打率UP!`;
        }
      } else {
        this.statPastAcc.textContent = `通算: -`;
      }

      // 3. スイング速度
      if (stats.today.count > 0) {
        this.statTodaySpeed.textContent = `${stats.today.avgSec}秒`;
      } else {
        this.statTodaySpeed.textContent = `-`;
      }
      if (stats.past.count > 0) {
        this.statPastSpeed.textContent = `通算: ${stats.past.avgSec}秒`;
        if (stats.speedDiff !== null && stats.speedDiff > 0) {
          this.statSpeedBadge.className = 'growth-badge faster';
          this.statSpeedBadge.textContent = `⚡ ${stats.speedDiff}秒 速いスイング！`;
        }
      }

      // 4. 通算特打本数 ＆ 連続ヒット
      this.statAllSolved.textContent = `${stats.all.count}本`;
      this.statAllTime.textContent = `総特打: ${stats.all.totalMinutes}分`;
      this.statComboBadge.textContent = `連続 ${this.comboCount} 球ヒット！`;
    }

    bindEvents() {
      // ステップ1: クラス・番号選択後に「次へ進む！」（超高速・タイムアウト保証）
      this.btnStepNext.addEventListener('click', async () => {
        this.selectedClass = this.authClass.value;
        this.selectedNumber = this.authNumber.value;

        const origText = this.btnStepNext.textContent;
        this.btnStepNext.textContent = '☁️ 名簿確認中...';
        this.btnStepNext.disabled = true;

        try {
          // 最大1.8秒で確実にタイムアウトする安全な読み出し
          const users = await this.sync.fetchUsersFromSheet(1800);
          if (users && users.length > 0) {
            this.auth.syncWithRemoteUsers(users);
          }
        } catch (e) {
          console.warn('名簿確認スキップ (ローカルキャッシュ優先):', e);
        } finally {
          this.btnStepNext.textContent = origText;
          this.btnStepNext.disabled = false;
        }

        // 即座に次の画面へ遷移（絶対にフリーズさせない！）
        const check = this.auth.checkStudent(this.selectedClass, this.selectedNumber);
        this.authStepSelect.style.display = 'none';

        if (check.exists) {
          this.confirmClassNum.textContent = `${this.selectedClass} ${this.selectedNumber}番`;
          this.confirmNickname.textContent = check.nickname;
          this.authStepConfirm.style.display = 'block';
          this.authStepRegister.style.display = 'none';
        } else {
          this.registerClassNum.textContent = `${this.selectedClass} ${this.selectedNumber}番`;
          this.inputNickname.value = '';
          this.authStepRegister.style.display = 'block';
          this.authStepConfirm.style.display = 'none';
          setTimeout(() => this.inputNickname.focus(), 100);
        }
      });

      // ステップ2-A: 「よし、特訓開始だ！！」
      this.btnStartConfirmed.addEventListener('click', () => {
        const user = this.auth.loginExisting(this.selectedClass, this.selectedNumber);
        if (user) {
          this.onLoginComplete(user, false);
        }
      });

      // ステップ2-A: 「名前を修正する / 別の選手」
      this.btnEditNickname.addEventListener('click', () => {
        const check = this.auth.checkStudent(this.selectedClass, this.selectedNumber);
        this.registerClassNum.textContent = `${this.selectedClass} ${this.selectedNumber}番`;
        this.inputNickname.value = check.nickname || '';
        this.authStepConfirm.style.display = 'none';
        this.authStepRegister.style.display = 'block';
        setTimeout(() => this.inputNickname.focus(), 100);
      });

      // ステップ2-B: 「登録してバッターボックスへ！」
      this.btnSaveNickname.addEventListener('click', () => {
        const nick = this.inputNickname.value.trim();
        if (!nick) {
          alert('登録名を入力するんだ！');
          this.inputNickname.focus();
          return;
        }
        const user = this.auth.loginWithNickname(this.selectedClass, this.selectedNumber, nick);
        this.onLoginComplete(user, true);
      });

      // ステップ2-B: 「クラス・番号を選び直す」
      this.btnBackToSelect.addEventListener('click', () => {
        this.authStepRegister.style.display = 'none';
        this.authStepConfirm.style.display = 'none';
        this.authStepSelect.style.display = 'block';
      });

      // キーボード操作
      const boxes = [this.inputWhole, this.inputNum, this.inputDen];
      boxes.forEach(box => {
        box.addEventListener('focus', () => this.setActiveInput(box));
        box.addEventListener('click', () => this.setActiveInput(box));
      });

      this.inputWhole.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.checkAnswerNow();
        } else if (e.key === 'ArrowRight' || (e.key === 'Tab' && !e.shiftKey)) {
          if (e.key === 'ArrowRight') {
            e.preventDefault();
            this.setActiveInput(this.inputNum);
          }
        }
      });

      this.inputNum.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.checkAnswerNow();
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          this.setActiveInput(this.inputDen);
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          this.setActiveInput(this.inputWhole);
        }
      });

      this.inputDen.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.checkAnswerNow();
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          this.setActiveInput(this.inputNum);
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          this.setActiveInput(this.inputWhole);
        }
      });

      // フルスイングボタン
      this.btnCheck.addEventListener('click', () => this.checkAnswerNow());

      // スコア保存ボタン
      this.btnSync.addEventListener('click', async () => {
        const res = await this.sync.syncNow(true);
        if (res.status === 'success') {
          alert(`⚾ 先生のスプレッドシートへ ${res.count}球の打撃スコアを送信しました！`);
        }
      });

      // 放置再開
      this.btnResume.addEventListener('click', () => {
        this.tracker.resumeFromIdle();
      });

      // 1000本完走モーダル追加特打ボタン
      this.btnContinueExtra.addEventListener('click', () => {
        this.goalModal.classList.remove('active');
        this.setCoachSpeech('「限界突破だ！！1000本を超えてこそ真の男だ！！」');
      });

      // 記録モーダル
      this.btnShowLogs.addEventListener('click', () => {
        this.renderLogTable();
        this.logModal.classList.add('active');
      });
      this.btnCloseLogs.addEventListener('click', () => {
        this.logModal.classList.remove('active');
      });
      this.btnCloseLogsBottom.addEventListener('click', () => {
        this.logModal.classList.remove('active');
      });
    }

    initScratchCanvas() {
      const canvas = document.getElementById('scratchCanvas');
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      const container = canvas.parentElement;

      const resize = () => {
        if (container.clientWidth > 0 && container.clientHeight > 0) {
          canvas.width = container.clientWidth;
          canvas.height = container.clientHeight;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
        }
      };
      resize();
      window.addEventListener('resize', resize);

      let drawing = false;
      let mode = 'pen';

      const getPos = (e) => {
        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return {
          x: clientX - rect.left,
          y: clientY - rect.top
        };
      };

      const startDraw = (e) => {
        drawing = true;
        const pos = getPos(e);
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
        if (e.type === 'touchstart') e.preventDefault();
      };

      const draw = (e) => {
        if (!drawing) return;
        const pos = getPos(e);
        if (mode === 'eraser') {
          ctx.strokeStyle = '#fffdf5';
          ctx.lineWidth = 20;
        } else if (mode === 'red') {
          ctx.strokeStyle = '#dc2626';
          ctx.lineWidth = 3;
        } else {
          ctx.strokeStyle = '#0f172a';
          ctx.lineWidth = 3;
        }
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
        if (e.type === 'touchmove') e.preventDefault();
      };

      const stopDraw = () => {
        drawing = false;
      };

      canvas.addEventListener('mousedown', startDraw);
      canvas.addEventListener('mousemove', draw);
      canvas.addEventListener('mouseup', stopDraw);
      canvas.addEventListener('mouseleave', stopDraw);

      canvas.addEventListener('touchstart', startDraw, { passive: false });
      canvas.addEventListener('touchmove', draw, { passive: false });
      canvas.addEventListener('touchend', stopDraw);

      const toolPen = document.getElementById('toolPen');
      const toolEraser = document.getElementById('toolEraser');
      const toolClear = document.getElementById('toolClear');

      toolPen.addEventListener('click', () => {
        mode = 'pen';
        toolPen.classList.add('active');
        toolEraser.classList.remove('active');
      });

      toolEraser.addEventListener('click', () => {
        mode = 'eraser';
        toolEraser.classList.add('active');
        toolPen.classList.remove('active');
      });

      toolClear.addEventListener('click', () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      });
    }

    renderLogTable() {
      const logs = this.tracker.getTodayLogs(this.auth.getCurrentUser());
      if (logs.length === 0) {
        this.logTableBody.innerHTML = '<tr><td colspan="6" style="padding: 24px; color: #64748b;">本日の打撃記録はまだありません。バッターボックスへ立て！</td></tr>';
        return;
      }

      this.logTableBody.innerHTML = logs.slice().reverse().map(log => {
        const timeStr = new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const mistakeBadge = log.mistakeCount === 0
          ? '<span style="color:#15803d; font-weight:bold;">1発クリーンヒット⚾</span>'
          : `<span style="color:#b91c1c;">${log.mistakeCount}回ファウル</span>`;
        return `
          <tr>
            <td>${timeStr}</td>
            <td style="font-weight: bold;">${log.problem.formula}</td>
            <td>${log.problem.correctAnswer}</td>
            <td>${log.timeSpentSeconds}秒</td>
            <td>${mistakeBadge}</td>
            <td style="font-size: 0.8rem; color: #64748b;">${log.problem.category}</td>
          </tr>
        `;
      }).join('');
    }
  }

  window.addEventListener('DOMContentLoaded', () => {
    window.keisanApp = new App();
  });
})();
