/* =========================================================================
 * P3-1 按下反馈
 *  - Cocos 纸牌按钮：按下下移 4 设计单位（屏幕 2px），松开回弹；禁用 SCALE 放大
 *  - 功能小签：zoomScale 1.2 → 1.08，收掉“弹一下”
 *  - DOM 浮层按钮：:active 下移 2px + 阴影收掉
 *  开关：?press=0   状态：window.__pressR1.report()
 * ========================================================================= */
;(function () {
  'use strict';
  if (/[?&]press=0/.test(location.search || '')) return;
  if (window.__pressR1) return;
  var T = window.__pressR1 = {
    version: 'press-r1', bound: 0, pressed: 0, ticked: 0, err: '',
    report: function () { return { version: T.version, bound: T.bound, pressed: T.pressed, ticked: T.ticked, err: T.err }; }
  };

  // 屏幕 960x540 ← 设计 1920x1080，比例 0.5；屏幕 2px = 设计 4 单位
  var DY = 4;

  // 纸牌按钮（下移型）：FIGHT / 暂停 / 返回 / 继续 / 齿轮 / 关闭 / 主菜单对战
  var PLATE = [
    'Canvas/MainView/pvp',
    'Canvas/ChooseView/Center/2PlayersUI/StartBtn',
    'Canvas/ChooseView/TopPanel/Setting',
    'Canvas/ChooseView/TopPanel/Home',
    'Canvas/MainView/Stop',
    'Canvas/MainView/StopView/Home',
    'Canvas/MainView/StopView/Run'
  ];
  // 功能小签（缩放调轻型）
  var TAGS = [
    'PassiveBtn1', 'weaponsshopping', 'skinsshopping', 'ColorAllShopping',
    'PassiveBtn2', 'r23Field', 'r23Codex'
  ];

  var state = null; // {node, baseY}

  function bindPlate(n, path) {
    if (!n || n.__pressBound) return;
    var bt = n.getComponent && n.getComponent(cc.Button);
    if (!bt) return;
    n.__pressBound = 1;
    // 关掉 SCALE 放大，避免与下移叠加
    try { bt.transition = cc.Button.Transition.NONE; } catch (e) {}

    var down = function () {
      if (state && state.node !== n) release();
      if (!n.isValid || !n.activeInHierarchy) return;
      state = { node: n, baseY: n.y };
      n.y = state.baseY - DY;
      T.pressed++;
    };
    var up = function () { if (state && state.node === n) release(); };
    n.on('touchstart', down, n);
    n.on('touchend', up, n);
    n.on('touchcancel', up, n);
    n.on('mouseup', up, n);
    T.bound++;
  }

  function release() {
    if (!state) return;
    try { if (state.node && state.node.isValid) state.node.y = state.baseY; } catch (e) {}
    state = null;
  }

  function softenTags() {
    var cv = cc.find('Canvas/ChooseView');
    if (!cv || !cv.activeInHierarchy) return;
    var p1 = cc.find('Canvas/ChooseView/Center/player1/player1');
    var p2 = cc.find('Canvas/ChooseView/Center/player2/player2');
    var ui = cc.find('Canvas/ChooseView/Center/2PlayersUI');
    [p1, p2, ui].forEach(function (p) {
      if (!p) return;
      TAGS.forEach(function (nm) {
        var n = p.getChildByName(nm);
        if (!n) return;
        var bt = n.getComponent && n.getComponent(cc.Button);
        if (!bt || bt.__pressSoft) return;
        bt.__pressSoft = 1;
        try { bt.zoomScale = 1.08; } catch (e) {}
      });
    });
  }

  function bindAll() {
    PLATE.forEach(function (path) {
      var n = cc.find(path);
      if (n && n.activeInHierarchy) bindPlate(n, path);
    });
    softenTags();
  }

  // DOM 按钮 :active —— 用 margin-top 避免覆盖原有 transform
  function domCss() {
    if (document.getElementById('__pressCss')) return;
    var st = document.createElement('style');
    st.id = '__pressCss';
    st.textContent = [
      '.pressable:active{margin-top:2px!important;box-shadow:none!important}',
      '#__guideBtnDom:active{margin-top:2px;box-shadow:none}'
    ].join('');
    document.head.appendChild(st);
  }
  function markDom() {
    var all = document.querySelectorAll('div,button,a');
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (el.classList && el.classList.contains('pressable')) continue;
      var cs = window.getComputedStyle ? getComputedStyle(el) : null;
      var z = cs ? parseInt(cs.zIndex || '0', 10) : 0;
      var pos = cs ? cs.position : '';
      var clickable = el.tagName === 'BUTTON' || el.onclick || (cs && cs.cursor === 'pointer');
      if (clickable && pos === 'fixed' && z >= 10000) {
        el.classList.add('pressable');
      }
    }
  }

  function tick() {
    if (!window.cc || !cc.director) return;
    // 维持按下态（节点位置可能被外部脚本每帧写回）
    if (state && state.node && state.node.isValid) {
      try {
        if (state.node.y !== state.baseY - DY) state.node.y = state.baseY - DY;
      } catch (e) { release(); }
    }
    try { bindAll(); } catch (e) { T.err = String(e && e.message || e); }
    T.ticked++;
  }
  domCss();
  var loop = function () { tick(); markDom(); };
  // P4: 统一内核调度；内核未加载时退回原生定时器
  if (window.__skinCore && window.__skinCore.add) {
    window.__skinCore.add('press', loop, 100);
    window.__skinCore.once(loop, 500);
  } else {
    setInterval(loop, 100);
    setTimeout(loop, 500);
  }
})();
