/* =========================================================================
 * P3-2 卷轴横拉转场  (r4 · 绘卷墨韵升级版)
 *  外观：方案A 和纸质感 + 淡墨远山 + 樱瓣 + 铜轴头，
 *        中缝卷轴杆换成方案B 的漆木杆（黑漆描金）。
 *  机制不变：点战斗的瞬间就合拢纸幕，遮住场景切换的黑屏加载期，
 *  等新场景加载完成（getScene().name 变化）再从中间向两边拉开。
 *  hook 按组件实例判断（r3 修复）：战斗返回后 ChooseView 重建也能重新 hook。
 *  触发：主菜单→选人（ChooseView 激活）、选人→战斗（ChangeScene 劫持）
 *  开关：?trans=0   状态：window.__transR1.report() / .play()
 * ========================================================================= */
;(function () {
  'use strict';
  if (/[?&]trans=0/.test(location.search || '')) return;
  if (window.__transR1) return;
  var T = window.__transR1 = {
    version: 'trans-r4', plays: 0, hooks: 0, last: '', err: '',
    report: function () { return { version: T.version, plays: T.plays, hooks: T.hooks, last: T.last, err: T.err, phase: phase }; },
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

  // ---- 样式：和纸质感 + 漆木卷轴杆 + 铜轴头（只注入一次）----
  var WASHI_NOISE = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0.42 0 0 0 0 0.36 0 0 0 0 0.26 0 0 0 0.05 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";
  var ROD_GRAD = 'linear-gradient(90deg,#1a1a18 0%,#2e2c26 18%,#4a4638 45%,#6a6248 56%,#2a2820 80%,#141410 100%)';
  var CAP_GRAD = 'linear-gradient(180deg,#E8CE8F,#B08C42 55%,#8A6A2E)';
  var washiBG = [
    'radial-gradient(ellipse at 25% 18%,rgba(255,255,255,.85),transparent 55%)',
    'radial-gradient(ellipse at 78% 82%,rgba(214,199,163,.4),transparent 60%)',
    WASHI_NOISE
  ].join(',');

  var wrap = document.getElementById('__transWrap');
  if (!document.getElementById('__transUpgradeCss')) {
    var st = document.createElement('style');
    st.id = '__transUpgradeCss';
    st.textContent = [
      // 和纸面
      '.__twWashi{position:absolute;inset:0;background-color:#F7F1DF;background-image:' + washiBG + '}',
      // 卷曲高光：靠近中缝一侧的立体感
      '.__twL .__twWashi{box-shadow:inset -16px 0 22px -12px rgba(70,58,40,.22),inset 8px 0 14px -10px rgba(255,255,255,.6)}',
      '.__twR .__twWashi{box-shadow:inset 16px 0 22px -12px rgba(70,58,40,.22),inset -8px 0 14px -10px rgba(255,255,255,.6)}',
      // 卷纸层次（中缝旁的纸边卷曲）
      '.__twCurl{position:absolute;top:0;bottom:0;width:7px;z-index:2;opacity:.55}',
      '.__twL .__twCurl{right:13px;background:linear-gradient(90deg,transparent,rgba(120,104,76,.28) 40%,rgba(255,255,255,.5) 75%,transparent)}',
      '.__twR .__twCurl{left:13px;background:linear-gradient(270deg,transparent,rgba(120,104,76,.28) 40%,rgba(255,255,255,.5) 75%,transparent)}',
      // 漆木卷轴杆（每片各带半边，合拢时并成一根）
      '.__twRod{position:absolute;top:0;bottom:0;width:13px;z-index:3;background:' + ROD_GRAD + ';box-shadow:0 0 10px rgba(0,0,0,.28)}',
      '.__twL .__twRod{right:0}',
      '.__twR .__twRod{left:0;transform:scaleX(-1)}',
      // 铜轴头（上下）
      '.__twCap{position:absolute;left:50%;width:26px;height:15px;border-radius:5px;z-index:4;transform:translateX(-50%);background:' + CAP_GRAD + ';box-shadow:0 1px 4px rgba(0,0,0,.35),inset 0 1px 0 rgba(255,255,255,.5)}',
      '.__twCap.t{top:16px}',
      '.__twCap.b{bottom:16px}',
      '.__twCap:before,.__twCap:after{content:"";position:absolute;top:2px;bottom:2px;width:3px;background:rgba(60,48,24,.5)}',
      '.__twCap:before{left:5px}',
      '.__twCap:after{right:5px}',
      // 淡墨远山（只贴左幕底部，拉开时随左幕移走）
      '.__twMtn{position:absolute;bottom:0;left:0;right:0;height:30%;opacity:.2;background:radial-gradient(ellipse at 20% 100%,#3a4a3e 0 30%,transparent 31%) 0 0/100% 100% no-repeat,radial-gradient(ellipse at 78% 105%,#2e3a34 0 34%,transparent 35%) 0 0/100% 100% no-repeat}',
      // 樱瓣
      '.__twPetal{position:absolute;width:9px;height:7px;border-radius:60% 10% 60% 10%;background:rgba(178,120,110,.42)}'
    ].join('\n');
    (document.head || document.documentElement).appendChild(st);
  }

  if (!wrap) {
    wrap = document.createElement('div');
    wrap.id = '__transWrap';
    wrap.style.cssText = 'position:fixed;inset:0;z-index:100040;pointer-events:none;overflow:hidden;display:none';

    var L = document.createElement('div');
    L.id = '__transL';
    L.style.cssText = 'position:absolute;top:0;bottom:0;left:0;width:50%;overflow:hidden;will-change:transform';
    L.className = '__twL';
    L.innerHTML = [
      '<div class="__twWashi">',
      '<div class="__twMtn"></div>',
      '<div class="__twPetal" style="top:22%;left:26%;transform:rotate(25deg)"></div>',
      '<div class="__twPetal" style="top:38%;left:70%;transform:rotate(-40deg)"></div>',
      '<div class="__twPetal" style="top:58%;left:18%;transform:rotate(70deg)"></div>',
      '<div class="__twPetal" style="top:72%;left:80%;transform:rotate(15deg)"></div>',
      '</div>',
      '<div class="__twCurl"></div>',
      '<div class="__twRod"><div class="__twCap t"></div><div class="__twCap b"></div></div>'
    ].join('');

    var R = document.createElement('div');
    R.id = '__transR';
    R.style.cssText = 'position:absolute;top:0;bottom:0;left:50%;width:50%;overflow:hidden;will-change:transform';
    R.className = '__twR';
    R.innerHTML = [
      '<div class="__twWashi"></div>',
      '<div class="__twCurl"></div>',
      '<div class="__twRod"><div class="__twCap t"></div><div class="__twCap b"></div></div>'
    ].join('');

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
  // 注意：不能用"一次性门闩"。战斗结束返回选人时 loadScene 会销毁重建
  // ChooseView，ChangeScene 变成全新函数。若 hooked 已锁死就再也 hook 不上，
  // 表现为"刷新后第一次进战斗有卷轴，之后都没有"。改为按组件实例判断。
  var hookCount = 0;
  function tryHook() {
    if (!window.cc || !cc.find) return;
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
        T.hooks = ++hookCount;
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
