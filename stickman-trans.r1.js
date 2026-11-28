/* =========================================================================
 * P3-2 卷轴横拉转场  (r2)
 *  关键修复：点战斗的瞬间就合拢纸幕，遮住场景切换的黑屏加载期，
 *  等新场景加载完成（getScene().name 变化）再从中间向两边拉开。
 *  r1 的毛病：靠轮询场景名变化触发，名字要等加载完才变——纸幕成了
 *  "马后炮"，玩家只看到黑屏一闪，没看到卷轴。
 *  触发：主菜单→选人（ChooseView 激活）、选人→战斗（ChangeScene 劫持）
 *  开关：?trans=0   状态：window.__transR1.report() / .play()
 * ========================================================================= */
;(function () {
  'use strict';
  if (/[?&]trans=0/.test(location.search || '')) return;
  if (window.__transR1) return;
  var T = window.__transR1 = {
    version: 'trans-r2', plays: 0, last: '', err: '',
    report: function () { return { version: T.version, plays: T.plays, last: T.last, err: T.err, phase: phase }; },
    play: function () { T.plays++; closeNow(); setTimeout(openNow, 60); },
    // 调试：定格在合拢态，便于截图核对
    freeze: function () {
      wrap.style.display = 'block';
      L.style.transition = 'none'; R.style.transition = 'none';
      L.style.transform = 'translateX(0)'; R.style.transform = 'translateX(0)';
      phase = 'waiting';
    },
    unfreeze: function () { wrap.style.display = 'none'; phase = 'idle'; }
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
  var phase = 'idle'; // idle | waiting(纸幕合拢中，等新场景) | opening

  function closeNow() {
    wrap.style.display = 'block';
    L.style.transition = 'none';
    R.style.transition = 'none';
    L.style.transform = 'translateX(0)';
    R.style.transform = 'translateX(0)';
    void wrap.offsetWidth; // 强制回流，确保合拢帧先渲染
    phase = 'waiting';
  }

  function openNow() {
    if (phase !== 'waiting') return;
    phase = 'opening';
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
      phase = 'idle';
    }, 360);
  }

  // ---- 劫持选人界面的 ChangeScene：点战斗 → 立刻合拢纸幕 ----
  var hooked = false;
  function tryHook() {
    if (hooked || !window.cc || !cc.find) return;
    var cv = cc.find('Canvas/ChooseView');
    if (!cv || !cv.getComponents) return;
    var comps = cv.getComponents(cc.Component) || [];
    for (var i = 0; i < comps.length; i++) {
      var c = comps[i];
      if (c && typeof c.ChangeScene === 'function' && !c.__transWrapped) {
        var orig = c.ChangeScene;
        c.ChangeScene = function () {
          if (phase === 'idle') {
            T.plays++;
            T.last = 'fight-close';
            closeNow();
          }
          try {
            return orig.apply(this, arguments);
          } finally {
            // 兜底：万一场景名检测没触发，1.4s 后强制拉开，避免纸幕卡死
            setTimeout(openNow, 1400);
          }
        };
        c.__transWrapped = true;
        hooked = true;
        break;
      }
    }
  }

  var lastScene = '', lastChoose = false, cooldown = 0, inited = false;

  function tick() {
    if (!window.cc || !cc.director) return;
    tryHook();
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

      if (sname !== lastScene) {
        // 场景切换完成（战斗已加载好）→ 拉开纸幕，露出战斗画面
        if (phase === 'waiting') { T.last = sname; openNow(); }
        lastScene = sname;
        lastChoose = choose;
        return;
      }

      // 主菜单→选人（同一场景内叠加显示）：合拢后短延时拉开
      if (choose && !lastChoose) {
        var now = Date.now();
        if (now > cooldown && phase === 'idle') {
          cooldown = now + 700;
          T.last = sname + '/choose';
          T.plays++;
          closeNow();
          setTimeout(openNow, 60);
        }
      }
      lastChoose = choose;
    } catch (e) { T.err = String(e && e.message || e); }
  }

  // P4: 统一内核调度；内核未加载时退回原生定时器
  // 注意：ChangeScene 劫持在 tick() 内的 tryHook()，逻辑完全保留
  if (window.__skinCore && window.__skinCore.add) {
    window.__skinCore.add('trans', tick, 25);
    window.__skinCore.once(tick, 400);
  } else {
    setInterval(tick, 25);
    setTimeout(tick, 400);
  }
})();
