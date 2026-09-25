// アプリケーション制御
(function() {
  'use strict';

  const { generateProblem, checkAnswer } = window.FractionEngine;
  const StudyTracker = window.StudyTracker;
  const SheetSync = window.SheetSync;
  const AuthManager = window.AuthManager;

  // 音声効果（Web Audio API）
  class SoundPlayer {
    constructor() {
      this.ctx = null;
    }
    init() {
      if (!this.ctx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) this.ctx = new AudioCtx();
      }
    }
    playCorrect() {
      try {
        this.init();
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, this.ctx.currentTime); // C5
        osc.frequency.setValueAtTime(659.25, this.ctx.currentTime + 0.12); // E5
        osc.frequency.setValueAtTime(783.99, this.ctx.currentTime + 0.24); // G5
        gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.5);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.5);
      } catch(e) {}
    }
    playWrong() {
      try {
        this.init();
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(220, this.ctx.currentTime); // A3
        osc.frequency.setValueAtTime(196, this.ctx.currentTime + 0.15); // G3
        gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.35);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.35);
      } catch(e) {}
    }
  }

  class App {
    constructor() {
      this.sound = new SoundPlayer();
      this.auth = new AuthManager();
      this.problemMode = 'mix'; // ミックス固定
      this.currentProblem = null;
      this.activeInputBox = null;

      this.selectedClass = '5年1組';
      this.selectedNumber = 1;

      this.initElements();
      this.populateNumberSelect();

      // トラッカー初期化
      this.tracker = new StudyTracker({
        targetSeconds: 30 * 60,
        onTick: (data) => this.updateTimerDisplay(data),
        onIdleStateChange: (isIdle) => this.handleIdleChange(isIdle),
        onTargetReached: (seconds) => this.handleTargetReached(seconds)
      });

      // スプレッドシート同期初期化
      this.sync = new SheetSync({
        onStatusChange: (status) => this.updateSyncButton(status)
      });

      this.initScratchCanvas();
      this.bindEvents();

      // 毎回ログインを求める
      this.showAuthModal();

      // 📖 スプレッドシートから最新の名簿データを読み込んで同期（Read検証）
      this.loadRemoteUsers();

      // 初期の保存ボタン状態
      this.sync.checkAndNotify();
    }

    initElements() {
      this.timerDisplay = document.getElementById('timerDisplay');
      this.timerProgress = document.getElementById('timerProgress');
      this.timerSubText = document.getElementById('timerSubText');
      this.studentDisplayName = document.getElementById('studentDisplayName');
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

      // 成長比較ダッシュボード要素
      this.statTodayTime = document.getElementById('statTodayTime');
      this.statRemainingTime = document.getElementById('statRemainingTime');
      this.statAllTime = document.getElementById('statAllTime');

      this.statTodaySolved = document.getElementById('statTodaySolved');
      this.statAllSolved = document.getElementById('statAllSolved');
      this.statSessionBadge = document.getElementById('statSessionBadge');

      this.statTodayAcc = document.getElementById('statTodayAcc');
      this.statPastAcc = document.getElementById('statPastAcc');
      this.statAccBadge = document.getElementById('statAccBadge');

      this.statTodaySpeed = document.getElementById('statTodaySpeed');
      this.statPastSpeed = document.getElementById('statPastSpeed');
      this.statSpeedBadge = document.getElementById('statSpeedBadge');

      // スマート保存ボタン
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

      // 放置・ログモーダル
      this.idleModal = document.getElementById('idleModal');
      this.btnResume = document.getElementById('btnResume');
      this.logModal = document.getElementById('logModal');
      this.btnShowLogs = document.getElementById('btnShowLogs');
      this.btnCloseLogs = document.getElementById('btnCloseLogs');
      this.btnCloseLogsBottom = document.getElementById('btnCloseLogsBottom');
      this.logTableBody = document.getElementById('logTableBody');
    }

    populateNumberSelect() {
      this.authNumber.innerHTML = '';
      for (let i = 1; i <= 45; i++) {
        const opt = document.createElement('option');
        opt.value = i;
        opt.textContent = `${i}番`;
        this.authNumber.appendChild(opt);
      }
    }

    // 📖 スプレッドシートのデータを読みに行く検証
    async loadRemoteUsers() {
      try {
        const users = await this.sync.fetchUsersFromSheet();
        if (users && users.length > 0) {
          this.auth.syncWithRemoteUsers(users);
        }
      } catch (e) {
        console.warn('Could not pre-fetch users:', e);
      }
    }

    // スマート保存ボタンの表示切り替え
    updateSyncButton(info) {
      this.btnSync.className = 'btn-sync';

      if (info.state === 'saving') {
        this.btnSync.classList.add('status-saving');
        this.btnSync.disabled = true;
        this.btnSyncText.textContent = `⏳ 保存中...`;
      } else if (info.state === 'unsaved' || info.count > 0) {
        this.btnSync.classList.add('status-unsaved');
        this.btnSync.disabled = false;
        this.btnSyncText.textContent = `☁️ 今すぐ保存 (${info.count}問)`;
      } else if (info.state === 'error') {
        this.btnSync.classList.add('status-unsaved');
        this.btnSync.disabled = false;
        this.btnSyncText.textContent = `⚠️ 今すぐ再試行 (${info.count}問)`;
      } else {
        this.btnSync.classList.add('status-saved');
        this.btnSync.disabled = true;
        this.btnSyncText.textContent = `✅ 保存完了`;
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
      this.studentDisplayName.textContent = `👤 ${user.displayName}`;
      this.updateGrowthDashboard();
      this.nextProblem();
      this.tracker.start();

      if (isNew) {
        this.sync.syncUser(user);
      }
    }

    // 30分カウントダウンバー ＆ タイマー表示更新
    updateTimerDisplay(data) {
      const remainSec = Math.max(0, data.targetSeconds - data.activeSeconds);
      const min = Math.floor(remainSec / 60);
      const sec = remainSec % 60;
      this.timerDisplay.textContent = `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;

      // カウントダウンバー（100%から減っていく）
      const pct = Math.max(0, Math.min(100, (remainSec / data.targetSeconds) * 100));
      this.timerProgress.style.width = `${pct}%`;

      // 残り時間による色変化（5分未満ならオレンジ、1分未満なら赤）
      if (remainSec < 60) {
        this.timerProgress.style.background = 'linear-gradient(90deg, #ef4444, #dc2626)';
      } else if (remainSec < 300) {
        this.timerProgress.style.background = 'linear-gradient(90deg, #f59e0b, #d97706)';
      } else {
        this.timerProgress.style.background = 'linear-gradient(90deg, #10b981, #3b82f6)';
      }

      const todayMin = Math.floor(data.activeSeconds / 60);
      const remainMin = Math.ceil(remainSec / 60);
      this.timerSubText.textContent = `目標30分まで あと ${remainMin}分 (今日: ${todayMin}分)`;

      this.probTimerBadge.textContent = `考え中: ${data.problemSeconds}秒`;

      // 毎分または問題解約時に成長ダッシュボード更新
      if (data.activeSeconds % 10 === 0) {
        this.updateGrowthDashboard();
      }
    }

    handleIdleChange(isIdle) {
      if (isIdle) {
        this.idleModal.classList.add('active');
      } else {
        this.idleModal.classList.remove('active');
      }
    }

    handleTargetReached(seconds) {
      this.sound.playCorrect();
      this.sync.syncNow(false);
      alert('🎉 おめでとうございます！ 目標の30分学習を達成しました！\nこのまま続けても、きょうの学習を終了してもOKです。');
    }

    nextProblem() {
      this.currentProblem = generateProblem({
        mode: 'mix',
        preferReduce: true
      });

      this.tracker.startNewProblem(this.currentProblem);

      this.categoryBadge.textContent = this.currentProblem.category;
      this.renderFormula(this.currentProblem);

      this.inputWhole.value = '';
      this.inputNum.value = '';
      this.inputDen.value = '';

      this.feedbackBox.className = 'feedback-box feedback-empty';
      this.feedbackBox.textContent = '';

      if (this.currentProblem.frac1.whole === 0 && this.currentProblem.frac2.whole === 0 && this.currentProblem.op === '-') {
        this.setActiveInput(this.inputNum);
      } else {
        this.setActiveInput(this.inputWhole);
      }
    }

    renderFormula(prob) {
      const renderFrac = (f) => {
        const wholeHtml = f.whole > 0 ? `<div class="frac-whole">${f.whole}</div>` : '';
        return `
          <div class="fraction-term">
            ${wholeHtml}
            <div class="frac-vertical">
              <div class="frac-num">${f.num}</div>
              <div class="frac-den">${f.den}</div>
            </div>
          </div>
        `;
      };

      const opSymbol = prob.op === '+' ? '＋' : '－';

      this.formulaEl.innerHTML = `
        ${renderFrac(prob.frac1)}
        <span class="operator">${opSymbol}</span>
        ${renderFrac(prob.frac2)}
        <span class="equals">＝</span>
      `;
    }

    setActiveInput(box) {
      if (this.activeInputBox) {
        this.activeInputBox.classList.remove('active-target');
      }
      this.activeInputBox = box;
      if (box) {
        box.classList.add('active-target');
        box.focus();
        box.select();
      }
    }

    checkAnswerNow() {
      const inputVal = {
        whole: this.inputWhole.value.trim(),
        num: this.inputNum.value.trim(),
        den: this.inputDen.value.trim()
      };

      if (!inputVal.whole && !inputVal.num && !inputVal.den) {
        this.showFeedback('warning', '答えの数字を入力してね');
        return;
      }

      const result = checkAnswer(inputVal, this.currentProblem);

      if (result.isCorrect) {
        this.sound.playCorrect();
        this.showFeedback('correct', result.message);

        this.tracker.recordCorrect(this.auth.getCurrentUser());
        this.updateGrowthDashboard();

        this.sync.checkAndNotify();

        this.btnCheck.disabled = true;
        setTimeout(() => {
          this.btnCheck.disabled = false;
          this.nextProblem();
        }, 1200);
      } else {
        this.sound.playWrong();
        this.showFeedback(result.status === 'wrong' ? 'wrong' : 'warning', result.message);

        const displayInput = `${inputVal.whole ? inputVal.whole + 'と' : ''}${inputVal.num}/${inputVal.den}`;
        this.tracker.recordMistake(displayInput, result.message);
        this.updateGrowthDashboard();
      }
    }

    showFeedback(type, text) {
      this.feedbackBox.className = `feedback-box feedback-${type}`;
      this.feedbackBox.textContent = text;
    }

    // 成長比較ダッシュボード（今日とこれまでの成長がわかる表示）
    updateGrowthDashboard() {
      const user = this.auth.getCurrentUser();
      const stats = this.tracker.getStatsComparison(user);

      // 1. 学習時間
      this.statTodayTime.textContent = `${stats.today.todayMinutes}分`;
      this.statRemainingTime.textContent = `あと ${stats.today.remainingMinutes}分`;
      this.statAllTime.textContent = `累計: ${stats.all.totalMinutes}分`;

      // 2. 解いた問題数
      this.statTodaySolved.textContent = `${stats.today.count}問`;
      this.statAllSolved.textContent = `累計: ${stats.all.count}問`;

      // 3. 1発正解率
      this.statTodayAcc.textContent = `${stats.today.accuracy}%`;
      if (stats.past.count > 0) {
        this.statPastAcc.textContent = `これまで: ${stats.past.accuracy}%`;
        if (stats.accDiff !== null) {
          if (stats.accDiff > 0) {
            this.statAccBadge.className = 'growth-badge up';
            this.statAccBadge.textContent = `📈 +${stats.accDiff}% UP!`;
          } else if (stats.accDiff < 0) {
            this.statAccBadge.className = 'growth-badge normal';
            this.statAccBadge.textContent = `${stats.accDiff}%`;
          } else {
            this.statAccBadge.className = 'growth-badge normal';
            this.statAccBadge.textContent = `キープ中!`;
          }
        }
      } else {
        this.statPastAcc.textContent = `これまで: -`;
        this.statAccBadge.className = 'growth-badge normal';
        this.statAccBadge.textContent = `本日スタート`;
      }

      // 4. 平均解答時間（昨日と比較して早いじゃん！）
      if (stats.today.count > 0) {
        this.statTodaySpeed.textContent = `${stats.today.avgSec}秒`;
      } else {
        this.statTodaySpeed.textContent = `-`;
      }

      if (stats.past.count > 0) {
        this.statPastSpeed.textContent = `これまで: ${stats.past.avgSec}秒`;
        if (stats.speedDiff !== null) {
          if (stats.speedDiff > 0) {
            // 早くなった！
            this.statSpeedBadge.className = 'growth-badge faster';
            this.statSpeedBadge.textContent = `⚡ ${stats.speedDiff}秒 早いじゃん！`;
          } else if (stats.speedDiff < 0) {
            this.statSpeedBadge.className = 'growth-badge normal';
            this.statSpeedBadge.textContent = `じっくり解いてるね`;
          } else {
            this.statSpeedBadge.className = 'growth-badge normal';
            this.statSpeedBadge.textContent = `同じペース`;
          }
        }
      } else {
        this.statPastSpeed.textContent = `これまで: -`;
        this.statSpeedBadge.className = 'growth-badge normal';
        this.statSpeedBadge.textContent = `データ収集中`;
      }
    }

    bindEvents() {
      // ステップ1: クラス・番号選択後に「つぎへ」
      this.btnStepNext.addEventListener('click', async () => {
        this.selectedClass = this.authClass.value;
        this.selectedNumber = this.authNumber.value;

        const origText = this.btnStepNext.textContent;
        this.btnStepNext.textContent = '☁️ スプレッドシートを確認中...';
        this.btnStepNext.disabled = true;

        try {
          // スプレッドシートの「児童名簿」シートを直接読みに行く！
          const users = await this.sync.fetchUsersFromSheet();
          if (users && users.length > 0) {
            this.auth.syncWithRemoteUsers(users);
          }
        } catch (e) {
          console.warn('スプレッドシートへの確認に失敗 (オフライン等):', e);
        } finally {
          this.btnStepNext.textContent = origText;
          this.btnStepNext.disabled = false;
        }

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

      // ステップ2-A: 「はい、学習スタート！」
      this.btnStartConfirmed.addEventListener('click', () => {
        const user = this.auth.loginExisting(this.selectedClass, this.selectedNumber);
        if (user) {
          this.onLoginComplete(user, false);
        }
      });

      // ステップ2-A: 「名前をなおす / 別の人」
      this.btnEditNickname.addEventListener('click', () => {
        const check = this.auth.checkStudent(this.selectedClass, this.selectedNumber);
        this.registerClassNum.textContent = `${this.selectedClass} ${this.selectedNumber}番`;
        this.inputNickname.value = check.nickname || '';
        this.authStepConfirm.style.display = 'none';
        this.authStepRegister.style.display = 'block';
        setTimeout(() => this.inputNickname.focus(), 100);
      });

      // ステップ2-B: 「登録してスタート！」
      this.btnSaveNickname.addEventListener('click', () => {
        const nick = this.inputNickname.value.trim();
        if (!nick) {
          alert('ニックネームを入力してね！');
          this.inputNickname.focus();
          return;
        }
        const user = this.auth.loginWithNickname(this.selectedClass, this.selectedNumber, nick);
        this.onLoginComplete(user, true);
      });

      // ステップ2-B: 「クラス・番号をえらびなおす」
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

      this.btnCheck.addEventListener('click', () => this.checkAnswerNow());

      // スマート保存ボタンクリック時
      this.btnSync.addEventListener('click', async () => {
        const res = await this.sync.syncNow(true);
        if (res.status === 'success') {
          alert(`☁️ 先生のスプレッドシートへ ${res.count}問の記録を保存しました！`);
        }
      });

      // 放置再開
      this.btnResume.addEventListener('click', () => {
        this.tracker.resumeFromIdle();
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
        if (e.cancelable && e.type.startsWith('touch')) e.preventDefault();
      };

      const draw = (e) => {
        if (!drawing) return;
        const pos = getPos(e);
        ctx.strokeStyle = mode === 'eraser' ? '#ffffff' : '#1e3a8a';
        ctx.lineWidth = mode === 'eraser' ? 24 : 3;
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
        if (e.cancelable && e.type.startsWith('touch')) e.preventDefault();
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

      const btnPen = document.getElementById('toolPen');
      const btnEraser = document.getElementById('toolEraser');
      const btnClearCanvas = document.getElementById('toolClear');

      btnPen.addEventListener('click', () => {
        mode = 'pen';
        btnPen.classList.add('active');
        btnEraser.classList.remove('active');
      });

      btnEraser.addEventListener('click', () => {
        mode = 'eraser';
        btnEraser.classList.add('active');
        btnPen.classList.remove('active');
      });

      btnClearCanvas.addEventListener('click', () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      });
    }

    renderLogTable() {
      const logs = this.tracker.getAllLogs().reverse();
      if (logs.length === 0) {
        this.logTableBody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 20px; color: #94a3b8;">まだ記録がありません</td></tr>';
        return;
      }

      this.logTableBody.innerHTML = logs.map(log => {
        const timeStr = new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const mistakeBadge = log.mistakeCount === 0
          ? '<span style="color:#15803d; font-weight:bold;">1発正解🎉</span>'
          : `<span style="color:#b91c1c;">${log.mistakeCount}回ミス</span>`;
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
