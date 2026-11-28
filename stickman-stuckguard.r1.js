// stickman-stuckguard.r1.js — 卡局守护（2026-11-28）
// 现象：偶发卡在战斗画面——画面定格 / 角色不动 / 打不死也不出结算。
// 做法：只在本局做轻量巡检，命中“假死”就自动拉回；拉不回来时给一个可点的出口。
//   1) 假结算：isShowFinishView=true 但画布上没有 EndView/FinishView
//      （这个标记会把判死、输入、物理全部锁死；结算界面加载失败时就会留下它）
//   2) 结算缺失：本局开打过、gameStart 已 false，却一直没有结算界面
//   3) 物理被误关：结算定格把 PhysicsManager.enabled 关掉后没恢复 → 全场关节静止
//   4) 时间缩放卡住：顿帧/死亡慢动作把 timeScale 压到 0.04~0.25 后没恢复（低端机上尤其明显）
//   5) 物理子步过高：死亡慢动作把 FIXED_TIME_STEP 改成 1/480，低端机 CPU 直接打满
//   6) 主循环被暂停：cc.game.pause() 后无人 resume（图鉴/暂停面板之外的场景）
//   7) 僵局：贴脸 40 秒双方血量纹丝不动 —— 给出“结束本局”出口
// 关闭：?stuckguard=0    状态：window.__stuckGuard.report()
(function () {
  "use strict";
  if (/[?&]stuckguard=0/.test(location.search || "")) return;
  if (window.__stuckGuard) return;

  var G = window.__stuckGuard = {
    v: "stuckguard-r1",
    checks: 0,
    fixes: 0,
    fps: 0,
    armed: false,
    scene: "",
    events: [],
    last: null
  };
  var TICK = 700;

  function now() { return Date.now(); }
  function note(type, d) {
    var e = { t: now(), type: type };
    if (d !== undefined) e.d = d;
    G.events.push(e);
    if (G.events.length > 40) G.events.shift();
  }
  function fix(type, d) {
    G.fixes++;
    note("fix:" + type, d);
  }
  function ready() {
    try { return !!(window.cc && cc.director && cc.find && cc.director.getScene()); } catch (_) { return false; }
  }
  function cfg() {
    try { var m = window.__require && window.__require("ConfigManager"); return m && m.gameConfig; } catch (_) { return null; }
  }
  function canvas() { try { return cc.find("Canvas"); } catch (_) { return null; } }
  function games() {
    try { var c = canvas(); return c && c.getComponent("Games"); } catch (_) { return null; }
  }
  function hcOf(n) {
    try { return n && n.isValid ? n.getComponent("HumanController") : null; } catch (_) { return null; }
  }
  function endViewShown() {
    var c = canvas(); if (!c || !c.children) return false;
    for (var i = 0; i < c.children.length; i++) {
      var n = c.children[i];
      if (n && n.active && (n.name === "EndView" || n.name === "FinishView")) return true;
    }
    return false;
  }
  function guideOpen() { return !!document.getElementById("__itemGuideDom"); }
  function stopShown() {
    try { var s = cc.find("Canvas/MainView/StopView"); return !!(s && s.active); } catch (_) { return false; }
  }
  function mainView() { try { return cc.find("Canvas/MainView"); } catch (_) { return null; } }

  // ---------- 结算界面加载跟踪 ----------
  // 原版在加载 EndView/FinishView 的同时就把 isShowFinishView 置 true。
  // 加载期间不能当成“假结算”，否则慢机会把正常结算打断。
  var loadingView = 0;
  function patchBundle() {
    try {
      var b = cc.assetManager && cc.assetManager.getBundle && cc.assetManager.getBundle("prefabs");
      if (!b || b.__sgPatched || typeof b.load !== "function") return false;
      b.__sgPatched = true;
      var orig = b.load;
      b.load = function (path, type, cb) {
        if (typeof path === "string" && /(EndView|FinishView)$/.test(path)) {
          var done = false;
          loadingView++;
          var fin = function () { if (!done) { done = true; loadingView = Math.max(0, loadingView - 1); } };
          if (typeof cb === "function") {
            return orig.call(this, path, type, function () {
              fin();
              return cb.apply(this, arguments);
            });
          }
          setTimeout(fin, 10000);
          return orig.apply(this, arguments);
        }
        return orig.apply(this, arguments);
      };
      return true;
    } catch (_) { return false; }
  }

  function restoreMainView() {
    try {
      var mv = mainView();
      if (mv && !mv.active) { mv.active = true; fix("mainview-back"); }
      var joy = cc.find("Canvas/MainView/Joy");
      if (joy && !joy.active) joy.active = true;
    } catch (_) {}
  }
  function thawSoft() {
    try {
      var c = canvas(); if (!c) return;
      var ais = c.getComponentsInChildren("AiCtrl") || [];
      for (var i = 0; i < ais.length; i++) { try { ais[i].enabled = true; } catch (_) {} }
      var hs = c.getComponentsInChildren("HumanController") || [];
      for (var k = 0; k < hs.length; k++) { try { hs[k].__feelFrozen = false; } catch (_) {} }
    } catch (_) {}
  }

  // ---------- DOM 出口（提示 / 退出） ----------
  var tip = null, tipAt = 0, tipMode = "";
  function styleBox() {
    return [
      "position:fixed", "z-index:100040", "display:none",
      "align-items:center", "justify-content:center",
      "padding:9px 16px", "border-radius:999px",
      "background:rgba(51,65,58,.94)", "border:2px solid #1C2420",
      "color:#F6EEDC", "font:700 13px/1.2 JCRound,'PingFang SC',sans-serif",
      "box-shadow:0 4px 14px rgba(0,0,0,.32)", "cursor:pointer",
      "-webkit-tap-highlight-color:transparent", "user-select:none",
      "white-space:nowrap"
    ].join(";");
  }
  function makeTip() {
    if (tip) return tip;
    tip = document.createElement("div");
    tip.id = "__stuckTip";
    tip.style.cssText = styleBox();
    tip.addEventListener("click", function (ev) {
      if (ev && ev.stopPropagation) ev.stopPropagation();
      if (tipMode === "skip") skipRound();
      else if (tipMode === "exit") exitToMenu();
      hideTip();
    }, false);
    (document.body || document.documentElement).appendChild(tip);
    return tip;
  }
  function showTip(mode, text, where) {
    makeTip();
    tipMode = mode;
    tip.textContent = text;
    tip.style.display = "flex";
    tip.style.left = "auto"; tip.style.right = "auto"; tip.style.top = "auto"; tip.style.bottom = "auto";
    if (where === "center") {
      tip.style.left = "50%"; tip.style.top = "50%";
      tip.style.transform = "translate(-50%,-50%)";
    } else {
      // 顶部居中：战斗中这里通常是空的（血条在左右两角，摇杆/技能在下方）
      tip.style.left = "50%"; tip.style.top = "8px";
      tip.style.transform = "translateX(-50%)";
    }
    tipAt = now();
  }
  function hideTip() {
    if (tip && tip.style.display !== "none") tip.style.display = "none";
  }

  function skipRound() {
    try {
      var gm = games(), c = cfg();
      if (!gm || !c || !gm.player || !gm.enemy) return;
      var p1 = hcOf(gm.player), p2 = hcOf(gm.enemy);
      if (!p1 || !p2) return;
      // 血多的一方判胜；同血随机，避免“点一下必赢”
      var p1Win = (p1.hp === p2.hp) ? Math.random() < 0.5 : (p1.hp > p2.hp);
      var loser = p1Win ? p2 : p1;
      note("skip", { hp: [p1.hp, p2.hp], loser: loser.node && loser.node.name });
      try { cc.director.getScheduler().setTimeScale(1); } catch (_) {}
      try { cc.PhysicsManager.FIXED_TIME_STEP = 1 / 60; } catch (_) {}
      loser.hp = 0.0001;
      if (window.__fixR1 && window.__fixR1.forceDeath) window.__fixR1.forceDeath(loser);
      else { try { loser.node.getComponent("Human").dead(); } catch (_) {} }
    } catch (e) { note("skip-err", String(e && e.message || e)); }
  }
  function exitToMenu() {
    try {
      note("exit-to-menu");
      var c = cfg(); if (c) c.isShowFinishView = false;
      var gm = games();
      if (gm && gm.closeGame) gm.closeGame();
      else { try { cc.director.loadScene("main"); } catch (_) {} }
    } catch (_) {}
  }

  // ---------- 巡检 ----------
  var lastFrame = -1, lastFrameAt = 0, zeroFrames = 0;
  var hpSig = "", hpStill = 0;
  var roundKey = "", roundAt = 0;

  function sampleFps() {
    try {
      var f = cc.director.getTotalFrames ? cc.director.getTotalFrames() : -1;
      if (f < 0) return;
      var t = now();
      if (lastFrame >= 0 && t > lastFrameAt) {
        var v = (f - lastFrame) * 1000 / (t - lastFrameAt);
        G.fps = Math.round(v);
        if (f === lastFrame) zeroFrames++; else zeroFrames = 0;
      }
      lastFrame = f; lastFrameAt = t;
    } catch (_) {}
  }

  function resetRound() {
    hpSig = ""; hpStill = 0; roundKey = ""; roundAt = 0;
    hideTip();
  }

  function tick() {
    if (document.hidden) return;
    if (!ready()) return;
    sampleFps();

    var c = cfg(), gm = games(), cn = canvas();
    if (!c || !gm || !cn) { G.armed = false; resetRound(); return; }

    if (!gm.player || !gm.enemy || !gm.player.isValid || !gm.enemy.isValid) {
      G.armed = false; resetRound(); return;
    }

    // 换局重置
    var rk = (gm.player.uuid || "") + "|" + (gm.enemy.uuid || "");
    if (rk !== roundKey) {
      roundKey = rk; roundAt = now(); hpSig = ""; hpStill = 0;
      G.armed = false; G._fakeAt = 0; G._noEndAt = 0; G._tsAt = 0; G._stepAt = 0; G._pauseAt = 0;
      hideTip();
    }

    if (endViewShown()) { G.armed = false; hideTip(); return; }
    if (guideOpen()) { hideTip(); return; }

    if (c.gameStart) G.armed = true;
    G.checks++;
    patchBundle();

    // 1) 假结算：标记在，界面不在（结算 prefab 正在加载时不判）
    if (c.isShowFinishView) {
      if (loadingView > 0) { G._fakeAt = 0; }
      else if (!G._fakeAt) G._fakeAt = now();
      else if (now() - G._fakeAt > (G.armed ? 4000 : 1800)) {
        G._fakeAt = 0;
        c.isShowFinishView = false;
        restoreMainView();
        thawSoft();
        fix("clear-finish-flag");
      }
    } else G._fakeAt = 0;

    // 2) 结算缺失：本局开打过，gameStart 已关，但一直没结算界面
    if (G.armed && !c.gameStart && !c.isShowFinishView) {
      if (!G._noEndAt) G._noEndAt = now();
      else if (now() - G._noEndAt > 6000) {
        G._noEndAt = 0;
        showTip("exit", "本局已结束 · 点这里返回主菜单", "center");
        fix("no-end-view");
      }
    } else G._noEndAt = 0;

    if (!c.gameStart || c.isShowFinishView) return;   // 下面只处理“本局进行中”的异常

    // 3) 战斗 UI 被藏起来（结算流程留下的）
    var mv = mainView();
    if (mv && !mv.active) { mv.active = true; fix("mainview-idle-back"); }

    // 4) 物理被误关
    try {
      var pm = cc.director.getPhysicsManager();
      if (pm && pm.enabled === false) {
        pm.enabled = true;
        var E = window.__endFreeze;
        if (E) { E.over = false; E.physOff = false; }
        thawSoft();
        fix("physics-on");
      }
    } catch (_) {}

    // 5) 物理子步过高（1/480 = 8 倍计算量，低端机直接打满）
    try {
      var step = cc.PhysicsManager && cc.PhysicsManager.FIXED_TIME_STEP;
      if (step && step < 1 / 120) {
        if (!G._stepAt) G._stepAt = now();
        else if (now() - G._stepAt > (G.fps > 0 && G.fps < 26 ? 1500 : 4500)) {
          cc.PhysicsManager.FIXED_TIME_STEP = 1 / 60;
          G._stepAt = 0;
          fix("phys-step", { was: Math.round(1 / step) });
        }
      } else G._stepAt = 0;
    } catch (_) {}

    // 6) 时间缩放卡住（正常死亡慢动作 0.25 约 4 秒；低帧率时缩短等待）
    try {
      var sch = cc.director.getScheduler();
      var ts = sch && sch.getTimeScale ? sch.getTimeScale() : 1;
      if (ts < 0.9) {
        if (!G._tsAt) G._tsAt = now();
        else {
          var limit = (G.fps > 0 && G.fps < 26) ? 2600 : 6500;
          if (now() - G._tsAt > limit) { sch.setTimeScale(1); G._tsAt = 0; fix("timescale", { was: ts, fps: G.fps }); }
        }
      } else G._tsAt = 0;
    } catch (_) {}

    // 7) 主循环被暂停且没有对应面板
    try {
      var paused = cc.game.isPaused ? !!cc.game.isPaused() : !!cc.game._paused;
      if (paused && !guideOpen() && !stopShown()) {
        if (!G._pauseAt) G._pauseAt = now();
        else if (now() - G._pauseAt > 2500) { cc.game.resume(); G._pauseAt = 0; fix("game-resume"); }
      } else G._pauseAt = 0;
    } catch (_) {}

    // 8) 连续 0 帧（渲染停了但定时器还活着）
    if (zeroFrames >= 6) {
      zeroFrames = 0;
      var did = false;
      try { if (cc.game.isPaused && cc.game.isPaused()) { cc.game.resume(); did = true; } } catch (_) {}
      try { cc.director.resume(); cc.director.getScheduler().setTimeScale(1); did = true; } catch (_) {}
      if (did) fix("frames-stalled", { f: lastFrame });
    }

    // 9) 僵局：贴脸 40 秒双方血量纹丝不动
    var p1 = hcOf(gm.player), p2 = hcOf(gm.enemy);
    if (p1 && p2) {
      var sig = Math.round(p1.hp * 10) + "|" + Math.round(p2.hp * 10);
      if (sig !== hpSig) { hpSig = sig; hpStill = 0; hideTip(); }
      else {
        hpStill++;
        if (hpStill * TICK > 40000 && now() - roundAt > 25000) showTip("skip", "卡住了？点我结束本局");
        if (tip && tip.style.display === "flex" && now() - tipAt > 30000) hideTip(); // 不自作主张，30 秒后收起
      }

      G.last = {
        at: now(), hp: [Math.round(p1.hp), Math.round(p2.hp)], fps: G.fps,
        start: !!c.gameStart, finish: !!c.isShowFinishView,
        ts: (function () { try { return cc.director.getScheduler().getTimeScale(); } catch (_) { return -1; } })(),
        phys: (function () { try { return cc.director.getPhysicsManager().enabled; } catch (_) { return null; } })(),
        step: (function () { try { return cc.PhysicsManager.FIXED_TIME_STEP; } catch (_) { return null; } })()
      };
    }
  }

  setInterval(function () {
    try { tick(); } catch (e) { note("tick-err", String(e && e.message || e)); }
  }, TICK);

  G.report = function () {
    return {
      v: G.v, checks: G.checks, fixes: G.fixes, fps: G.fps, armed: G.armed,
      last: G.last, events: G.events.slice(-20),
      hideTip: hideTip, showTip: showTip, skipRound: skipRound, exitToMenu: exitToMenu
    };
  };

  note("ready");
})();
