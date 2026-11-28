/* =========================================================================
 * P3-2 卷轴横拉转场
 *  切屏瞬间两片纸幕合拢盖住画面，随后从中间向两边拉开（约 320ms），
 *  中缝带淡墨卷轴轴杆，像一幅和风卷轴被展开。
 *  触发：主菜单→选人（ChooseView 激活）、选人→战斗（scene 切换）
 *  开关：?trans=0   状态：window.__transR1.report() / .play()
 * ========================================================================= */
;(function () {
  'use strict';
  if (/[?&]trans=0/.test(location.search || '')) return;
  if (window.__transR1) return;
  var T = window.__transR1 = {
    version: 'trans-r1', plays: 0, last: '', err: '',
    report: function () { return { version: T.version, plays: T.plays, last: T.last, err: T.err }; },
    play: function () { play(); },
    // 调试：定格在合拢态，便于截图核对
    freeze: function () {
      wrap.style.display = 'block';
      L.style.transition = 'none'; R.style.transition = 'none';
      L.style.transform = 'translateX(0)'; R.style.transform = 'translateX(0)';
    },
    unfreeze: function () { wrap.style.display = 'none'; }
  };

  var wrap = document.getElementById('__transWrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.id = '__transWrap';
    wrap.style.cssText = 'position:fixed;inset:0;z-index:100040;pointer-events:none;overflow:hidden;display:none';

    var L = document.createElement('div');
    L.id = '__transL';
    L.style.cssText = [
      'position:absolute;top:0;bottom:0;left:0;width:50%',
      'background:linear-gradient(90deg,#F6EFDC 0%,#FBF7E9 92%)',
      'border-right:4px solid rgba(46,58,52,.55)',
      'box-shadow:inset -10px 0 18px rgba(46,58,52,.06)',
      'will-change:transform'
    ].join(';');

    var R = document.createElement('div');
    R.id = '__transR';
    R.style.cssText = [
      'position:absolute;top:0;bottom:0;left:50%;width:50%',
      'background:linear-gradient(90deg,#FBF7E9 8%,#F6EFDC 100%)',
      'border-left:4px solid rgba(46,58,52,.55)',
      'box-shadow:inset 10px 0 18px rgba(46,58,52,.06)',
      'will-change:transform'
    ].join(';');

    // 中缝上下的淡墨横饰（卷轴轴头）——放进各自纸幕，随幕一起移动
    [['top', L], ['bottom', R]].forEach(function (pair) {
      var cap = document.createElement('div');
      cap.style.cssText = 'position:absolute;' + pair[0] + ':14px;right:0;width:56px;height:3px;background:rgba(46,58,52,.45);border-radius:2px';
      pair[1].appendChild(cap);
    });

    wrap.appendChild(L);
    wrap.appendChild(R);
    (document.body || document.documentElement).appendChild(wrap);
  }

  var L = document.getElementById('__transL');
  var R = document.getElementById('__transR');

  function play() {
    T.plays++;
    try {
      wrap.style.display = 'block';
      // 合拢（无过渡）
      L.style.transition = 'none';
      R.style.transition = 'none';
      L.style.transform = 'translateX(0)';
      R.style.transform = 'translateX(0)';
      // 强制回流 + 双 rAF，确保合拢帧先真正渲染一帧，再开始拉开
      void wrap.offsetWidth;
      var ease = 'transform .32s cubic-bezier(.45,.05,.2,1)';
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          L.style.transition = ease;
          R.style.transition = ease;
          L.style.transform = 'translateX(-100%)';
          R.style.transform = 'translateX(100%)';
        });
      });
      setTimeout(function () {
        wrap.style.display = 'none';
        L.style.transition = 'none';
        R.style.transition = 'none';
      }, 360);
    } catch (e) { T.err = String(e && e.message || e); }
  }

  var lastScene = '', lastChoose = false, cooldown = 0, inited = false;

  function tick() {
    if (!window.cc || !cc.director) return;
    try {
      var sc = cc.director.getScene();
      if (!sc) return;
      var sname = sc.name || '';
      var cv = cc.find('Canvas/ChooseView');
      var choose = !!(cv && cv.activeInHierarchy);

      if (!inited) {
        inited = true;
        lastScene = sname;
        lastChoose = choose;
        return;
      }
      var trigger = false;
      if (sname !== lastScene) trigger = true;                 // 选人→战斗（换 scene）
      else if (choose && !lastChoose) trigger = true;          // 主菜单→选人（叠加显示）
      lastScene = sname;
      lastChoose = choose;

      var now = Date.now();
      if (trigger && now > cooldown) {
        cooldown = now + 700;
        T.last = sname + (choose ? '/choose' : '');
        play();
      }
    } catch (e) { T.err = String(e && e.message || e); }
  }

  setInterval(tick, 30);
  setTimeout(tick, 400);
})();
