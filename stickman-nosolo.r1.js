// ================= 移除单人模式入口 =================
// 主菜单只保留 2 Players，并把它居中。
// 原版节点：Canvas/MainView/{bgPve,pve,bgPvp,pvp}
// 1 Player = bgPve + pve（隐藏并禁用按钮）
// 2 Players = bgPvp + pvp（移到中间）
(function () {
  "use strict";
  if (window.__nosolo) return;
  if (/[?&]nosolo=0/.test(location.search)) return; // 调试开关：加 ?nosolo=0 可看原版菜单
  var NS = { v: "nosolo-r1", done: 0 };
  window.__nosolo = NS;

  function log() {
    try {
      (window.__logs || (window.__logs = [])).push("[nosolo] " + [].slice.call(arguments).join(" "));
      if (window.__logs.length > 300) window.__logs.shift();
    } catch (_) {}
  }

  function findMain() {
    try {
      if (typeof cc === "undefined" || !cc.find) return null;
      var mv = cc.find("Canvas/MainView");
      if (!mv || !mv.isValid || !mv.activeInHierarchy) return null;
      // 只处理真正的菜单层：要有 pvp 节点
      if (!mv.getChildByName("pvp")) return null;
      return mv;
    } catch (_) {
      return null;
    }
  }

  function killNode(n) {
    if (!n || !n.isValid) return false;
    // 先摘掉按钮，避免残留点击
    try {
      var b = n.getComponent(cc.Button);
      if (b) {
        b.interactable = false;
        if (b.clickEvents) b.clickEvents.length = 0;
      }
    } catch (_) {}
    if (n.active) {
      n.active = false;
      return true;
    }
    return false;
  }

  function centerNode(n, y) {
    if (!n || !n.isValid) return;
    try {
      var w = n.getComponent(cc.Widget);
      if (w) {
        // 关掉 Widget，否则它会把位置算回去
        w.enabled = false;
      }
      n.setPosition(0, y);
    } catch (_) {}
  }

  function tick() {
    var mv = findMain();
    if (!mv) return;
    var changed = 0;
    changed += killNode(mv.getChildByName("bgPve")) ? 1 : 0;
    changed += killNode(mv.getChildByName("pve")) ? 1 : 0;

    var pvp = mv.getChildByName("bgPvp");
    var pvpL = mv.getChildByName("pvp");
    if (pvp && pvp.isValid) {
      if (!pvp.__nsCentered) {
        centerNode(pvp, -110); // 卡片
        pvp.__nsCentered = 1;
        changed++;
      }
    }
    if (pvpL && pvpL.isValid) {
      if (!pvpL.__nsCentered) {
        centerNode(pvpL, -310); // 文字条：保持在卡片下方 200
        pvpL.__nsCentered = 1;
        changed++;
      }
    }
    // 2P 按钮稍微放大，单按钮菜单不至于太空
    if (pvp && pvp.isValid && !pvp.__nsScaled) {
      try {
        pvp.setScale(1.08, 1.08);
        pvp.__nsScaled = 1;
      } catch (_) {}
    }
    if (changed) {
      NS.done++;
      log("隐藏单人入口 " + changed + " 项");
    }
  }

  function boot() {
    setInterval(function () {
      try { tick(); } catch (e) { log("err " + (e && e.message)); }
    }, 300);
    log("ready");
  }

  if (typeof cc !== "undefined" && cc.director && cc.director.getScene()) boot();
  else {
    var n = 0;
    var iv = setInterval(function () {
      if (typeof cc !== "undefined" && cc.director && cc.director.getScene()) {
        clearInterval(iv); boot();
      } else if (++n > 200) clearInterval(iv);
    }, 100);
  }
})();
