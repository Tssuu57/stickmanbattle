/* =========================================================================
 * P2-4 脏绿竖条修正
 * 游戏核心每帧把 Ground/Out/UP/bg (NewAsset7_2) 染成 #47ff00 荧光绿，
 * 主题的 150ms tick 会被写回。这里用属性劫持 + 高频兜底彻底压住。
 * 开关：?green=0 关闭；状态：window.__greenR1.report()
 * ========================================================================= */
;(function () {
  'use strict';
  if (/[?&]green=0/.test(location.search || '')) return;
  if (window.__greenR1) return;

  var T = window.__greenR1 = {
    version: 'green-r1', hijacked: 0, ticked: 0,
    report: function () { return { version: T.version, hijacked: T.hijacked, ticked: T.ticked }; }
  };

  var TARGET = [0x6E, 0x9A, 0x7C];   // 松叶绿
  var TARGET_OP = 60;                 // 原 111 → 60，半透明

  function isTarget(n) {
    if (!n || !n.getComponent) return false;
    var sp = null;
    try { sp = n.getComponent(cc.Sprite); } catch (e) {}
    if (!sp || !sp.spriteFrame) return false;
    var nm = sp.spriteFrame.name || sp.spriteFrame._name || '';
    return /NewAsset7_2/.test(nm);
  }

  function forceColor(n) {
    if (!n || !n.isValid) return;
    try {
      n.color = new cc.Color(TARGET[0], TARGET[1], TARGET[2], 255);
      if (n.opacity > TARGET_OP) n.opacity = TARGET_OP;
    } catch (e) {}
  }

  function hijack(n) {
    if (!n || n.__greenHijack) return;
    n.__greenHijack = 1;
    try {
      var real = n.color;
      // 拦截 color 属性：任何写入都被改写成和风色
      Object.defineProperty(n, 'color', {
        configurable: true,
        get: function () {
          return new cc.Color(TARGET[0], TARGET[1], TARGET[2], 255);
        },
        set: function () { /* 游戏想写的颜色被丢弃 */ }
      });
      T.hijacked++;
    } catch (e) {
      // 属性不可劫持时退回高频强制
      n.__greenHijack = 2;
    }
    forceColor(n);
  }

  function tick() {
    if (!window.cc || !cc.director) return;
    var sc = cc.director.getScene();
    if (!sc) return;
    try {
      function walk(n) {
        if (!n || !n.isValid) return;
        if (isTarget(n)) {
          if (!n.__greenHijack) hijack(n);
          else if (n.__greenHijack === 2) forceColor(n);
        }
        var ch = n.children;
        for (var i = 0; i < ch.length; i++) walk(ch[i]);
      }
      walk(sc);
      T.ticked++;
    } catch (e) {}
  }
  // P4: 统一内核调度；内核未加载时退回原生定时器
  if (window.__skinCore && window.__skinCore.add) {
    window.__skinCore.add('green', tick, 60);
    window.__skinCore.once(tick, 600);
  } else {
    setInterval(tick, 60);
    setTimeout(tick, 600);
  }
})();
