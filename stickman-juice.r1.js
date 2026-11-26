// ================= 打击感增强层 =================
// 1 受击顿帧（按伤害分档）  2 分级震屏  3 伤害飘字  4 残血红边 + 心跳  5 击杀白闪
// 全部在补丁层实现，不改 Cocos 打包产物；不干扰 battlelog 的 setDamage 钩子。
(function () {
  "use strict";
  if (window.__juice) return;
  if (/[?&]juice=0/.test(location.search)) return; // 调试开关
  var J = { v: "juice-r1", on: true, hits: 0 };
  window.__juice = J;

  function log() {
    try {
      (window.__logs || (window.__logs = [])).push("[juice] " + [].slice.call(arguments).join(" "));
      if (window.__logs.length > 300) window.__logs.shift();
    } catch (_) {}
  }

  // ---------- DOM 层：飘字 / 红边 / 白闪 ----------
  var layer, vig, flash;
  function ensureDom() {
    if (layer && layer.parentNode) return;
    layer = document.createElement("div");
    layer.id = "__juiceLayer";
    layer.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:9000;overflow:hidden";
    document.body.appendChild(layer);

    vig = document.createElement("div");
    vig.id = "__juiceVig";
    vig.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:8999;opacity:0;" +
      "transition:opacity .3s ease-out;box-shadow:inset 0 0 110px 26px rgba(255,42,42,.8)";
    document.body.appendChild(vig);

    flash = document.createElement("div");
    flash.id = "__juiceFlash";
    flash.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:9001;opacity:0;" +
      "background:radial-gradient(circle at 50% 55%, rgba(255,255,255,.95), rgba(255,255,255,0) 62%)";
    document.body.appendChild(flash);
  }

  function canvasRect() {
    var el = document.getElementById("GameCanvas") || document.querySelector("canvas");
    if (!el) return null;
    var r = el.getBoundingClientRect();
    return { el: el, x: r.left, y: r.top, w: r.width, h: r.height };
  }

  // ---------- 伤害飘字：直接用 Cocos 节点，不做屏幕坐标换算 ----------
  var lastPop = 0, popCount = 0;
  function popup(hostNode, dmg) {
    var d = Math.round(dmg || 0);
    if (d <= 0) return;
    var canvas = cc.find("Canvas");
    if (!canvas || !hostNode || !hostNode.isValid) return;
    var big = d >= 30, mid = d >= 15;
    var now = Date.now();
    if (now - lastPop > 260) popCount = 0;
    var lane = popCount % 3;
    popCount++;
    lastPop = now;
    var n = new cc.Node("__dmg");
    n.parent = canvas;
    try {
      var wp = hostNode.convertToWorldSpaceAR(cc.v2((lane - 1) * 30, 60 + popCount * 14));
      n.setPosition(canvas.convertToNodeSpaceAR(wp));
    } catch (_) { return; }
    n.zIndex = 9999;
    var lb = n.addComponent(cc.Label);
    lb.string = d >= 60 ? d + "!" : String(d);
    lb.fontSize = big ? 36 : mid ? 29 : 24;
    lb.lineHeight = lb.fontSize + 2;
    lb.fontFamily = "Arial";
    lb.enableBold = true;
    try {
      var ol = n.addComponent(cc.LabelOutline);
      ol.color = cc.color(20, 10, 10, 220);
      ol.width = 2.5;
    } catch (_) {}
    n.color = big ? cc.color(255, 86, 68) : mid ? cc.color(255, 214, 74) : cc.color(255, 255, 255);
    n.opacity = 255;
    n.setScale(0.45);
    var dx = (Math.random() * 2 - 1) * 26;
    if (cc.tween) {
      cc.tween(n)
        .to(0.11, { scale: big ? 1.45 : 1.3 })
        .to(0.09, { scale: 1 })
        .by(0.62, { position: cc.v3(dx, 96, 0) })
        .to(0.22, { opacity: 0 }, { easing: "quadOut" })
        .call(function () { if (n.isValid) n.destroy(); })
        .start();
    } else {
      setTimeout(function () { if (n.isValid) n.destroy(); }, 900);
    }
    // 兜底：tween 可能被 timeScale 拖慢，1.6 秒后强制清理
    setTimeout(function () { if (n && n.isValid) n.destroy(); }, 1600);
  }

  function shake(power) {
    var rc = canvasRect();
    if (!rc || !rc.el.animate) return;
    var p = power;
    rc.el.animate([
      { transform: "translate(0,0)" },
      { transform: "translate(" + (-p) + "px," + (p * 0.7) + "px)" },
      { transform: "translate(" + (p * 0.9) + "px," + (-p * 0.55) + "px)" },
      { transform: "translate(" + (-p * 0.45) + "px," + (p * 0.25) + "px)" },
      { transform: "translate(" + (p * 0.2) + "px,0)" },
      { transform: "translate(0,0)" }
    ], { duration: 150, easing: "ease-out" });
  }

  function whiteFlash(strength) {
    if (!flash || !flash.animate) return;
    flash.style.opacity = "0";
    var a = flash.animate([
      { opacity: 0 },
      { opacity: strength, offset: 0.12 },
      { opacity: 0 }
    ], { duration: 320, easing: "ease-out" });
    a.onfinish = function () { flash.style.opacity = "0"; };
  }

  // ---------- 顿帧 ----------
  var tsTimer = null, savedTS = 1, lastStop = 0;
  function hitStop(ms) {
    var now = Date.now();
    if (now - lastStop < 110) return; // 连击不叠加顿帧
    lastStop = now;
    try {
      var sch = cc.director.getScheduler();
      if (!sch || !sch.setTimeScale) return;
      if (tsTimer === null) savedTS = sch.getTimeScale ? (sch.getTimeScale() || 1) : 1;
      sch.setTimeScale(0.04);
      clearTimeout(tsTimer);
      tsTimer = setTimeout(function () {
        try { sch.setTimeScale(savedTS || 1); } catch (_) {}
        tsTimer = null;
      }, ms);
    } catch (_) {}
  }

  // ---------- 钩子：受击 ----------
  function hook() {
    var M = null;
    try { M = window.__require && window.__require("HumanController"); } catch (_) {}
    var P = M && M.default && M.default.prototype;
    if (!P || !P.setDamage || P.setDamage.__juiceHook) return false;
    var prev = P.setDamage;
    var wrapped = function (dmg) {
      var before = this && typeof this.hp === "number" ? this.hp : 0;
      var ret = prev.apply(this, arguments);
      try {
        var after = this && typeof this.hp === "number" ? this.hp : 0;
        var real = before - after;
        if (real > 0.5 && this.node && this.node.isValid) {
          J.hits++;
          var d = Math.min(real, 120);
          popup(this.node, d);
          // 顿帧与震屏：按伤害分档
          if (d >= 25) { hitStop(70); shake(10); }
          else if (d >= 12) { hitStop(48); shake(6); }
          else { hitStop(28); shake(3); }
          if (after <= 0 && before > 0) {
            whiteFlash(0.55);
            hitStop(140);
            shake(14);
          }
        }
      } catch (e) { log("hookerr " + (e && e.message)); }
      return ret;
    };
    for (var k in prev) { try { wrapped[k] = prev[k]; } catch (_) {} }
    wrapped.__juiceHook = true;
    P.setDamage = wrapped;
    log("hooked, hits-ready");
    return true;
  }

  // ---------- 残血红边 ----------
  var lastVig = -1;
  function tickVig() {
    try {
      var c = cc.find("Canvas");
      var gm = c && c.getComponent("Games");
      if (!gm || !gm.player || !gm.enemy) {
        if (lastVig !== 0) { lastVig = 0; if (vig) vig.style.opacity = "0"; }
        return;
      }
      function hc(n) {
        if (!n) return null;
        try { return n.getComponent ? n.getComponent("HumanController") : null; } catch (_) { return null; }
      }
      var p1 = hc(gm.player), p2 = hc(gm.enemy);
      if (!p1 || !p2) return;
      var r1 = (p1.maxhp ? p1.hp / p1.maxhp : 1);
      var r2 = (p2.maxhp ? p2.hp / p2.maxhp : 1);
      if (p1.hp <= 0 || p2.hp <= 0) {
        if (lastVig !== 0) { lastVig = 0; if (vig) vig.style.opacity = "0"; }
        return;
      }
      var low = Math.min(r1, r2);
      var o = low < 0.25 ? Math.min(0.95, (0.25 - low) / 0.25 * 0.95 + 0.12) : 0;
      o = Math.round(o * 20) / 20;
      if (o !== lastVig) {
        lastVig = o;
        if (vig) vig.style.opacity = String(o);
      }
    } catch (_) {}
  }

  // ---------- 启动 ----------
  function boot() {
    ensureDom();
    var n = 0;
    var iv = setInterval(function () {
      if (hook() || ++n > 200) clearInterval(iv);
    }, 300);
    setInterval(function () { try { tickVig(); } catch (_) {} }, 220);
    // 兜底：顿帧若异常未恢复，强制拉回
    setInterval(function () {
      try {
        if (tsTimer === null) {
          var sc = cc.director.getScheduler();
          if (sc && sc.getTimeScale && sc.getTimeScale() !== 1 && sc.setTimeScale) sc.setTimeScale(1);
        }
      } catch (_) {}
    }, 2000);
    log("ready");
  }

  if (typeof cc !== "undefined" && cc.director && cc.director.getScene()) boot();
  else {
    var t = 0;
    var iv2 = setInterval(function () {
      if (typeof cc !== "undefined" && cc.director && cc.director.getScene()) { clearInterval(iv2); boot(); }
      else if (++t > 300) clearInterval(iv2);
    }, 100);
  }
})();
