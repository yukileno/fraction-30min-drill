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
      return `${className}-${number}`;
    }

    // スプレッドシートから読み込んだ名簿を取り込む
    syncWithRemoteUsers(users) {
      if (!Array.isArray(users) || users.length === 0) return;
      const registry = this.getRegistry();
      let updated = false;

      users.forEach(u => {
        if (u.className && u.studentNumber && u.nickname) {
          const key = this.makeKey(u.className, u.studentNumber);
          if (registry[key] !== u.nickname) {
            registry[key] = u.nickname;
            updated = true;
          }
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
      const nickname = registry[key];

      if (nickname) {
        return {
          exists: true,
          className: className,
          studentNumber: Number(number),
          nickname: nickname
        };
      }
      return {
        exists: false,
        className: className,
        studentNumber: Number(number),
        nickname: ''
      };
    }

    // 名前を登録または更新してログイン
    loginWithNickname(className, number, nickname) {
      const cleanNick = (nickname || '').trim();
      const key = this.makeKey(className, number);
      const registry = this.getRegistry();

      registry[key] = cleanNick;
      this.saveRegistry(registry);

      const user = {
        className: className,
        studentNumber: Number(number),
        nickname: cleanNick,
        displayName: `${className} ${number}番 ${cleanNick}`
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
        displayName: `${className} ${number}番 ${checked.nickname}`
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
