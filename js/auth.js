/**
 * 児童アカウント・ログイン管理モジュール (パスワードなし・毎回ログイン版)
 */
(function (root, factory) {
  if (typeof exports === 'object' && typeof module !== 'undefined') {
    module.exports = factory();
  } else if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else {
    root.AuthManager = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
  'use strict';

  const STORAGE_KEY_REGISTRY = 'keisan_student_registry_v2';

  class AuthManager {
    constructor() {
      this.currentUser = null; // 毎回ログインを求めるため初期値は常にnull
    }

    // 保存されている名簿辞書 { "5年1組-12": "たろう", ... }
    getRegistry() {
      try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY_REGISTRY) || '{}');
      } catch (e) {
        return {};
      }
    }

    saveRegistry(reg) {
      try {
        localStorage.setItem(STORAGE_KEY_REGISTRY, JSON.stringify(reg));
      } catch (e) {
        console.error('Failed to save student registry:', e);
      }
    }

    makeKey(className, number) {
      // 「5年1組」「1組」「1」などの表記揺れを吸収し、統一キーを生成
      const str = String(className || '').trim();
      const match = str.match(/(\d+)\s*組?/);
      const classNum = match ? match[1] : str;
      return `組${classNum}-番${Number(number)}`;
    }

    // スプレッドシートから読み込んだ名簿を取り込む（累計サマリー情報も含む）
    syncWithRemoteUsers(users) {
      if (!Array.isArray(users) || users.length === 0) return;
      const registry = this.getRegistry();
      let updated = false;

      users.forEach(u => {
        if (u.className && u.studentNumber && u.nickname) {
          const key = this.makeKey(u.className, u.studentNumber);
          registry[key] = {
            nickname: u.nickname,
            totalSolved: Number(u.totalSolved) || 0,
            totalMinutes: Number(u.totalMinutes) || 0,
            accuracy: (u.accuracy !== undefined && u.accuracy !== null) ? Number(u.accuracy) : null,
            avgSeconds: (u.avgSeconds !== undefined && u.avgSeconds !== null) ? Number(u.avgSeconds) : null,
            totalMistakes: Number(u.totalMistakes) || 0,
            lastStudyAt: u.lastStudyAt || ''
          };
          updated = true;
        }
      });

      if (updated) {
        this.saveRegistry(registry);
      }
    }

    // 児童の登録状態を確認
    checkStudent(className, number) {
      const key = this.makeKey(className, number);
      const registry = this.getRegistry();
      const val = registry[key];

      if (val) {
        const nickname = typeof val === 'object' ? val.nickname : val;
        const summary = typeof val === 'object' ? val : null;
        return {
          exists: true,
          className: className,
          studentNumber: Number(number),
          nickname: nickname,
          summary: summary
        };
      }
      return {
        exists: false,
        className: className,
        studentNumber: Number(number),
        nickname: '',
        summary: null
      };
    }

    // 名前を登録または更新してログイン
    loginWithNickname(className, number, nickname) {
      const cleanNick = (nickname || '').trim();
      const key = this.makeKey(className, number);
      const registry = this.getRegistry();

      const existing = (typeof registry[key] === 'object' && registry[key] !== null)
        ? registry[key]
        : { totalSolved: 0, totalMinutes: 0, accuracy: null, avgSeconds: null, totalMistakes: 0, lastStudyAt: '' };
      existing.nickname = cleanNick;
      registry[key] = existing;
      this.saveRegistry(registry);

      const user = {
        className: className,
        studentNumber: Number(number),
        nickname: cleanNick,
        displayName: `${className} ${number}番 ${cleanNick}`,
        summary: existing
      };

      this.currentUser = user;
      return user;
    }

    // 登録済みの名前でそのままログイン
    loginExisting(className, number) {
      const checked = this.checkStudent(className, number);
      if (!checked.exists) return null;

      const user = {
        className: className,
        studentNumber: Number(number),
        nickname: checked.nickname,
        displayName: `${className} ${number}番 ${checked.nickname}`,
        summary: checked.summary
      };

      this.currentUser = user;
      return user;
    }

    getCurrentUser() {
      return this.currentUser;
    }

    isLoggedIn() {
      return Boolean(this.currentUser);
    }

    logout() {
      this.currentUser = null;
    }
  }

  return AuthManager;
});
