(function () {
  'use strict';

  var VERSION = 'reopenwebgl1';
  if (window.__stickmanWebGLLifecycle && window.__stickmanWebGLLifecycle.version === VERSION) return;

  var RECOVERY_KEY = 'stickman.webgl-recovery.' + VERSION;
  var state = window.__gameStartup || {};
  state.version = VERSION;
  state.phase = state.phase || 'document';
  state.bootCalls = state.bootCalls || 0;
  state.runCalls = state.runCalls || 0;
  state.ready = false;
  state.failed = false;
  state.events = state.events || [];
  window.__gameStartup = state;

  var lifecycle = {
    version: VERSION,
    canvas: null,
    installed: false,
    leaving: false,
    releasing: false,
    released: false,
    releaseReason: '',
    resumeReloadStarted: false,
    recoveryTimer: 0,
    pendingContextRecovery: false
  };
  window.__stickmanWebGLLifecycle = lifecycle;

  function note(type, detail) {
    var entry = { type: type, at: Date.now() };
    if (detail !== undefined) entry.detail = detail;
    state.events.push(entry);
    if (state.events.length > 30) state.events.shift();
  }

  function safeSessionGet() {
    try { return window.sessionStorage.getItem(RECOVERY_KEY); } catch (_) { return null; }
  }

  function safeSessionSet(value) {
    try { window.sessionStorage.setItem(RECOVERY_KEY, value); } catch (_) {}
  }

  function safeSessionRemove() {
    try { window.sessionStorage.removeItem(RECOVERY_KEY); } catch (_) {}
  }

  function pauseGame() {
    try {
      if (window.cc && cc.game && typeof cc.game.pause === 'function') cc.game.pause();
    } catch (error) {
      note('pause-error', String(error && error.message || error));
    }
  }

  function failureText(stage, detail, error) {
    var lines = [stage || '游戏启动失败'];
    if (detail) lines.push(String(detail));
    if (error && error.message && String(error.message) !== String(detail || '')) lines.push(String(error.message));
    if (state.lastContextCreationError && state.lastContextCreationError.statusMessage) {
      var status = state.lastContextCreationError.statusMessage;
      if (lines.indexOf(status) < 0) lines.push(status);
    }
    return lines.join('\n');
  }

  function showFailure(stage, detail, error, retryScheduled) {
    var panel = document.getElementById('game-startup-error');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'game-startup-error';
      panel.setAttribute('role', 'alert');
      panel.style.cssText = 'position:fixed;z-index:2147483647;inset:0;display:flex;align-items:center;justify-content:center;padding:24px;background:#111827;color:#f9fafb;font:16px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;text-align:center;white-space:pre-wrap;';
      var box = document.createElement('div');
      box.style.cssText = 'max-width:620px;padding:24px;border:1px solid #374151;border-radius:16px;background:#1f2937;box-shadow:0 20px 60px rgba(0,0,0,.35)';
      var message = document.createElement('div');
      message.setAttribute('data-startup-message', '');
      var button = document.createElement('button');
      button.type = 'button';
      button.textContent = '重新载入';
      button.style.cssText = 'margin-top:18px;padding:10px 18px;border:0;border-radius:999px;background:#f9fafb;color:#111827;font:inherit;cursor:pointer';
      button.addEventListener('click', function () {
        button.disabled = true;
        button.textContent = '正在重新载入…';
        window.location.reload();
      }, { once: true });
      box.appendChild(message);
      box.appendChild(button);
      panel.appendChild(box);
      (document.body || document.documentElement).appendChild(panel);
    }
    var target = panel.querySelector('[data-startup-message]');
    if (target) target.textContent = failureText(stage, detail, error) + (retryScheduled ? '\n正在进行唯一一次恢复加载…' : '');
  }

  function scheduleRecovery(reason) {
    if (lifecycle.leaving || lifecycle.recoveryTimer || lifecycle.resumeReloadStarted) return false;
    var now = Date.now();
    var previous = null;
    try { previous = JSON.parse(safeSessionGet() || 'null'); } catch (_) {}
    if (previous && previous.version === VERSION && previous.count >= 1 && now - previous.at < 60000) {
      note('recovery-blocked', reason);
      return false;
    }
    safeSessionSet(JSON.stringify({ version: VERSION, count: 1, at: now, reason: String(reason || '') }));
    note('recovery-scheduled', reason);
    lifecycle.recoveryTimer = window.setTimeout(function () {
      lifecycle.recoveryTimer = 0;
      if (!lifecycle.leaving) window.location.reload();
    }, 450);
    return true;
  }

  state.fail = function (stage, detail, error, options) {
    options = options || {};
    state.failed = true;
    state.phase = 'failed';
    state.failure = {
      stage: String(stage || '启动'),
      detail: String(detail || ''),
      message: String(error && error.message || ''),
      code: String(error && error.code || ''),
      at: Date.now()
    };
    note('failure', state.failure);
    pauseGame();
    var retryScheduled = !!options.autoRecover && scheduleRecovery(stage || 'startup');
    showFailure(stage, detail, error, retryScheduled);
    if (window.console && console.error) console.error('[STARTUP]', stage, detail || '', error || '');
    return retryScheduled;
  };

  state.markReady = function () {
    state.ready = true;
    state.failed = false;
    state.phase = 'ready';
    note('ready');
    // Keep the one-reload budget during the first stable minute. If a context
    // is lost again immediately after a successful reload, this prevents a loop.
    window.setTimeout(function () {
      if (state.ready && !state.failed && !state.contextLost) safeSessionRemove();
    }, 60000);
    var panel = document.getElementById('game-startup-error');
    if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
  };

  function releaseRenderer(reason) {
    if (lifecycle.released) return true;
    pauseGame();
    var gl = null;
    try {
      gl = window.cc && cc.game && cc.game._renderContext;
      if (!gl || typeof gl.getExtension !== 'function') {
        note('release-no-context', reason);
        return false;
      }
      var lose = gl.getExtension('WEBGL_lose_context');
      if (!lose || typeof lose.loseContext !== 'function') {
        note('release-extension-unavailable', reason);
        return false;
      }
      lifecycle.releasing = true;
      lifecycle.releaseReason = String(reason || 'pagehide');
      lose.loseContext();
      lifecycle.released = true;
      state.rendererReleased = { reason: lifecycle.releaseReason, at: Date.now() };
      note('renderer-released', lifecycle.releaseReason);
      return true;
    } catch (error) {
      note('release-error', String(error && error.message || error));
      return false;
    }
  }
  lifecycle.releaseRenderer = releaseRenderer;

  function onContextCreationError(event) {
    var status = event && event.statusMessage ? String(event.statusMessage) : '浏览器未提供原因';
    state.lastContextCreationError = { statusMessage: status, at: Date.now() };
    note('context-creation-error', status);
    if (window.console && console.error) console.error('[WEBGL] context creation failed:', status);
  }

  function requestLostContextRecovery(detail) {
    if (lifecycle.leaving || lifecycle.releasing) return;
    lifecycle.pendingContextRecovery = true;
    if (document.hidden) return;
    lifecycle.pendingContextRecovery = false;
    var scheduled = scheduleRecovery('webglcontextlost');
    showFailure('WebGL 上下文已丢失', detail || '渲染上下文无法继续使用。', null, scheduled);
  }

  function onContextLost(event) {
    if (event && event.preventDefault) event.preventDefault();
    state.contextLost = { at: Date.now(), intentional: !!lifecycle.releasing };
    note('context-lost', lifecycle.releasing ? 'intentional-release' : 'unexpected');
    pauseGame();
    if (!lifecycle.releasing) requestLostContextRecovery('将使用一次完整新加载恢复，避免在半初始化引擎上重复注册。');
  }

  function onContextRestored() {
    state.contextRestored = { at: Date.now() };
    note('context-restored');
    if (!lifecycle.releasing) requestLostContextRecovery('此引擎不能安全地原地重建全部 GPU 资源。');
  }

  lifecycle.installCanvas = function (canvas) {
    if (!canvas) {
      state.fail('页面结构', '找不到 GameCanvas。');
      return false;
    }
    if (canvas.__reopenWebglLifecycle1) return true;
    canvas.__reopenWebglLifecycle1 = true;
    lifecycle.canvas = canvas;
    canvas.addEventListener('webglcontextcreationerror', onContextCreationError, false);
    canvas.addEventListener('webglcontextlost', onContextLost, false);
    canvas.addEventListener('webglcontextrestored', onContextRestored, false);
    note('canvas-listeners-installed');
    return true;
  };

  function onPageHide(event) {
    lifecycle.leaving = true;
    note('pagehide', { persisted: !!(event && event.persisted) });
    releaseRenderer(event && event.persisted ? 'pagehide-bfcache' : 'pagehide');
  }

  function onPageShow(event) {
    note('pageshow', { persisted: !!(event && event.persisted), released: lifecycle.released });
    lifecycle.leaving = false;
    if (lifecycle.released) {
      if (lifecycle.resumeReloadStarted) return;
      lifecycle.resumeReloadStarted = true;
      pauseGame();
      window.location.reload();
      return;
    }
    try {
      if (window.cc && cc.game && cc.game._prepared && typeof cc.game.resume === 'function') cc.game.resume();
    } catch (error) {
      note('resume-error', String(error && error.message || error));
    }
  }

  function onVisibilityChange() {
    if (!document.hidden && lifecycle.pendingContextRecovery && !lifecycle.leaving) {
      requestLostContextRecovery('渲染上下文已丢失。');
    }
  }

  window.addEventListener('pagehide', onPageHide, true);
  window.addEventListener('pageshow', onPageShow, true);
  document.addEventListener('visibilitychange', onVisibilityChange, false);
  lifecycle.installed = true;
  note('lifecycle-installed');
})();
