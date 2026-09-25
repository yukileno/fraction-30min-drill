/**
 * 学習時間トラッカー ＆ 放置検知 ＆ ローカルストレージ管理
 * UMD形式（ブラウザ直接読み込み・Node.js両対応）
 */
(function (root, factory) {
  if (typeof exports === 'object' && typeof module !== 'undefined') {
    module.exports = factory();
  } else if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else {
    root.StudyTracker = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
  'use strict';

  const STORAGE_KEY_SESSION = 'keisan_session_active_v1';
  const STORAGE_KEY_LOGS = 'keisan_problem_logs_v1';
  const IDLE_LIMIT_SECONDS = 60; // 60秒間無操作で放置と判定して一時停止

  class StudyTracker {
    constructor(options = {}) {
      this.targetSeconds = options.targetSeconds || 30 * 60; // 30分 = 1800秒
      this.onTick = options.onTick || (() => {});
      this.onIdleStateChange = options.onIdleStateChange || (() => {});
      this.onTargetReached = options.onTargetReached || (() => {});

      this.activeSeconds = 0;
      this.isRunning = false;
      this.isIdle = false;
      this.isTabHidden = false;
      this.idleTimerSeconds = 0;
      this.targetReachedFired = false;

      this.currentProblemStartTime = 0;
      this.currentProblemActiveSeconds = 0;
      this.currentProblemMistakes = 0;
      this.currentProblemHistory = [];

      this.sessionId = this.getOrCreateSessionId();
      this.loadTodaySession();

      this.setupActivityListeners();
      this.setupVisibilityListener();
    }

    getOrCreateSessionId() {
      if (typeof sessionStorage === 'undefined') return 'sess_node';
      let id = sessionStorage.getItem('keisan_current_session_id');
      if (!id) {
        id = 'sess_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
        sessionStorage.setItem('keisan_current_session_id', id);
      }
      return id;
    }

    loadTodaySession() {
      if (typeof localStorage === 'undefined') return;
      try {
        const saved = localStorage.getItem(STORAGE_KEY_SESSION);
        if (saved) {
          const data = JSON.parse(saved);
          const todayStr = new Date().toDateString();
          if (data.date === todayStr) {
            this.activeSeconds = data.activeSeconds || 0;
            this.targetReachedFired = this.activeSeconds >= this.targetSeconds;
          }
        }
      } catch (e) {
        console.warn('Failed to load session:', e);
      }
    }

    saveSession() {
      if (typeof localStorage === 'undefined') return;
      try {
        const data = {
          date: new Date().toDateString(),
          sessionId: this.sessionId,
          activeSeconds: this.activeSeconds,
          updatedAt: new Date().toISOString()
        };
        localStorage.setItem(STORAGE_KEY_SESSION, JSON.stringify(data));
      } catch (e) {
        console.warn('Failed to save session:', e);
      }
    }

    setupActivityListeners() {
      if (typeof window === 'undefined') return;
      const resetIdle = () => {
        this.idleTimerSeconds = 0;
        if (this.isIdle) {
          this.resumeFromIdle();
        }
      };

      window.addEventListener('mousemove', resetIdle, { passive: true });
      window.addEventListener('keydown', resetIdle, { passive: true });
      window.addEventListener('touchstart', resetIdle, { passive: true });
      window.addEventListener('pointerdown', resetIdle, { passive: true });
    }

    setupVisibilityListener() {
      if (typeof document === 'undefined') return;
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          this.isTabHidden = true;
          this.pause('tab_hidden');
        } else {
          this.isTabHidden = false;
          if (!this.isIdle) {
            this.start();
          }
        }
      });
    }

    start() {
      if (this.intervalId) return;
      this.isRunning = true;

      this.intervalId = setInterval(() => {
        if (this.isTabHidden || this.isIdle) return;

        this.idleTimerSeconds++;
        if (this.idleTimerSeconds >= IDLE_LIMIT_SECONDS) {
          this.triggerIdle();
          return;
        }

        this.activeSeconds++;
        this.currentProblemActiveSeconds++;

        if (this.activeSeconds % 5 === 0) {
          this.saveSession();
        }

        if (!this.targetReachedFired && this.activeSeconds >= this.targetSeconds) {
          this.targetReachedFired = true;
          this.onTargetReached(this.activeSeconds);
        }

        this.onTick({
          activeSeconds: this.activeSeconds,
          targetSeconds: this.targetSeconds,
          isIdle: this.isIdle,
          problemSeconds: this.currentProblemActiveSeconds
        });
      }, 1000);
    }

    pause(reason = 'manual') {
      this.isRunning = false;
      if (this.intervalId) {
        clearInterval(this.intervalId);
        this.intervalId = null;
      }
      this.saveSession();
    }

    triggerIdle() {
      this.isIdle = true;
      this.pause('idle');
      this.onIdleStateChange(true);
    }

    resumeFromIdle() {
      this.isIdle = false;
      this.idleTimerSeconds = 0;
      this.onIdleStateChange(false);
      if (!this.isTabHidden) {
        this.start();
      }
    }

    startNewProblem(problemData) {
      this.currentProblemData = problemData;
      this.currentProblemStartTime = Date.now();
      this.currentProblemActiveSeconds = 0;
      this.currentProblemMistakes = 0;
      this.currentProblemHistory = [];
    }

    recordMistake(inputVal, reason) {
      this.currentProblemMistakes++;
      this.currentProblemHistory.push({
        input: inputVal,
        reason: reason,
        atSeconds: this.currentProblemActiveSeconds
      });
    }

    recordCorrect(userInfo = {}) {
      const user = typeof userInfo === 'string'
        ? { nickname: userInfo, className: '', studentNumber: '' }
        : (userInfo || {});

      const studentDisplayName = `${user.className ? user.className + ' ' : ''}${user.studentNumber ? user.studentNumber + '番 ' : ''}${user.nickname || '児童'}`;

      const logEntry = {
        id: 'log_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
        sessionId: this.sessionId,
        timestamp: new Date().toISOString(),
        className: user.className || '',
        studentNumber: user.studentNumber || '',
        nickname: user.nickname || '未設定',
        studentName: studentDisplayName,
        problem: {
          formula: `${this.currentProblemData.frac1.toString()} ${this.currentProblemData.op} ${this.currentProblemData.frac2.toString()}`,
          op: this.currentProblemData.op,
          category: this.currentProblemData.category,
          canReduce: this.currentProblemData.canReduce,
          hasRegrouping: this.currentProblemData.hasRegrouping,
          correctAnswer: `${this.currentProblemData.answer.whole > 0 ? this.currentProblemData.answer.whole + 'と' : ''}${this.currentProblemData.answer.num > 0 ? this.currentProblemData.answer.num + '/' + this.currentProblemData.answer.den : '0'}`
        },
        timeSpentSeconds: this.currentProblemActiveSeconds,
        mistakeCount: this.currentProblemMistakes,
        history: this.currentProblemHistory,
        syncedToSheet: false
      };

      if (typeof localStorage !== 'undefined') {
        try {
          const logs = JSON.parse(localStorage.getItem(STORAGE_KEY_LOGS) || '[]');
          logs.push(logEntry);
          localStorage.setItem(STORAGE_KEY_LOGS, JSON.stringify(logs));
        } catch (e) {
          console.error('Failed to save problem log:', e);
        }
      }

      this.saveSession();
      return logEntry;
    }

    getAllLogs() {
      if (typeof localStorage === 'undefined') return [];
      try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY_LOGS) || '[]');
      } catch (e) {
        return [];
      }
    }

    getTodayLogs(userInfo = null) {
      const today = new Date().toDateString();
      let logs = this.getAllLogs().filter(log => new Date(log.timestamp).toDateString() === today);
      if (userInfo && userInfo.className && userInfo.studentNumber) {
        logs = logs.filter(l => l.className === userInfo.className && Number(l.studentNumber) === Number(userInfo.studentNumber));
      }
      return logs;
    }

    getPastLogs(userInfo = null) {
      const today = new Date().toDateString();
      let logs = this.getAllLogs().filter(log => new Date(log.timestamp).toDateString() !== today);
      if (userInfo && userInfo.className && userInfo.studentNumber) {
        logs = logs.filter(l => l.className === userInfo.className && Number(l.studentNumber) === Number(userInfo.studentNumber));
      }
      return logs;
    }

    // 「きょう」と「これまで（過去）」の比較データ集計
    getStatsComparison(userInfo = null) {
      const todayLogs = this.getTodayLogs(userInfo);
      const pastLogs = this.getPastLogs(userInfo);
      const allUserLogs = [...pastLogs, ...todayLogs];

      const calcStats = (logs) => {
        const count = logs.length;
        if (count === 0) {
          return { count: 0, avgSec: 0, firstTryCount: 0, accuracy: 100, totalMinutes: 0 };
        }
        const totalSec = logs.reduce((sum, l) => sum + (l.timeSpentSeconds || 0), 0);
        const firstTry = logs.filter(l => l.mistakeCount === 0).length;
        return {
          count: count,
          avgSec: Math.round(totalSec / count),
          firstTryCount: firstTry,
          accuracy: Math.round((firstTry / count) * 100),
          totalMinutes: Math.round((totalSec / 60) * 10) / 10
        };
      };

      const todayStats = calcStats(todayLogs);
      const pastStats = calcStats(pastLogs);
      const allStats = calcStats(allUserLogs);

      // 今日の学習時間（分）と残り時間（分）
      const todayMinutes = Math.floor(this.activeSeconds / 60);
      const remainingSeconds = Math.max(0, this.targetSeconds - this.activeSeconds);
      const remainingMinutes = Math.ceil(remainingSeconds / 60);

      // スピード変化（過去の平均秒 - 今日の平均秒: プラスなら短縮して早い！）
      let speedDiff = null;
      if (todayStats.count > 0 && pastStats.count > 0) {
        speedDiff = pastStats.avgSec - todayStats.avgSec;
      }

      // 正答率変化（今日の正答率 - 過去の正答率）
      let accDiff = null;
      if (todayStats.count > 0 && pastStats.count > 0) {
        accDiff = todayStats.accuracy - pastStats.accuracy;
      }

      return {
        today: {
          ...todayStats,
          activeSeconds: this.activeSeconds,
          todayMinutes: todayMinutes,
          remainingMinutes: remainingMinutes,
          remainingSeconds: remainingSeconds
        },
        past: pastStats,
        all: allStats,
        speedDiff: speedDiff,
        accDiff: accDiff
      };
    }

    clearLogs() {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(STORAGE_KEY_LOGS);
        localStorage.removeItem(STORAGE_KEY_SESSION);
      }
      this.activeSeconds = 0;
      this.targetReachedFired = false;
    }
  }

  return StudyTracker;
});
