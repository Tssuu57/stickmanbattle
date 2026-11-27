/* =========================================================================
 * 皮肤清理层：移除皮肤列表中的真人照片 / 梗图头像（Skin_0 ~ Skin_8）
 * 1) 皮肤面板只显示 Skin_9 以后的正常火柴人头饰
 * 2) 已保存的选择、对手随机皮肤若命中被移除项，回退到 Skin_9
 * 3) 未解锁奖励池一并剔除，避免抽到已删除皮肤
 * 开关：?skins=0 关闭；状态：window.__skinsClean.report()
 * ========================================================================= */
;(function () {
  'use strict';

  if (/[?&]skins=0/.test(location.search || '')) return;
  if (window.__skinsClean) return;

  var BLOCK = {};
  for (var bi = 0; bi <= 8; bi++) BLOCK['Skin_' + bi] = 1;
  var FALLBACK = 'Skin_9';

  var S = window.__skinsClean = {
    version: 'skins-clean-r1',
    blocked: Object.keys(BLOCK),
    hookedView: false,
    hookedAtlas: false,
    removedItems: 0,
    fallbackHits: 0,
    clearedSaves: 0,
    report: function () {
      return {
        version: S.version,
        hookedView: S.hookedView,
        hookedAtlas: S.hookedAtlas,
        removedItems: S.removedItems,
        fallbackHits: S.fallbackHits,
        clearedSaves: S.clearedSaves
      };
    }
  };

  function mod(name) {
    try { return window.__require ? window.__require(name) : null; } catch (e) { return null; }
  }
  function getSV() { var m = mod('SkinsView'); return m && m.default; }
  function getSI() { var m = mod('SkinsItem'); return m && m.default; }

  function trim(content, SI) {
    if (!content || !SI || !content.children) return 0;
    var kids = content.children.slice(), n = 0;
    for (var i = 0; i < kids.length; i++) {
      var nd = kids[i], it = null;
      try { it = nd.getComponent(SI); } catch (e) { it = null; }
      if (it && it.sksName && BLOCK[it.sksName]) {
        try { nd.active = false; nd.destroy(); } catch (e) { }
        n++;
      }
    }
    if (n) {
      S.removedItems += n;
      try {
        var lay = content.getComponent(cc.Layout);
        if (lay && lay.updateLayout) lay.updateLayout();
      } catch (e) { }
    }
    return n;
  }

  function hookView() {
    var SV = getSV(), SI = getSI();
    if (!SV || !SI) return false;
    if (SV.__cleanPatched) return true;
    var proto = SV.prototype, orig = proto._AddItem;
    if (typeof orig !== 'function') return false;
    proto._AddItem = function () {
      orig.apply(this, arguments);
      try { trim(this.Content, SI); } catch (e) { }
    };
    SV.__cleanPatched = true;
    S.hookedView = true;
    return true;
  }

  function hookAtlas() {
    var CM = mod('ConfigManager');
    var atlas = CM && CM.gameConfig && CM.gameConfig.AllSkins;
    if (!atlas) return false;
    if (atlas.__cleanPatched) return true;
    var orig = atlas.getSpriteFrame;
    if (typeof orig !== 'function') return false;
    atlas.getSpriteFrame = function (name) {
      if (BLOCK[name]) {
        S.fallbackHits++;
        name = FALLBACK;
      }
      return orig.call(this, name);
    };
    atlas.__cleanPatched = true;
    S.hookedAtlas = true;
    return true;
  }

  function clearSaved() {
    var m = mod('UserProfile');
    var up = m && m.userProfile;
    if (!up || !up.data) return false;
    var d = up.data, changed = false, k;
    if (d.skins1 && BLOCK[d.skins1]) { d.skins1 = null; changed = true; }
    if (d.skins2 && BLOCK[d.skins2]) { d.skins2 = null; changed = true; }
    if (d.lastBuySkin != null && BLOCK['Skin_' + d.lastBuySkin]) { d.lastBuySkin = null; changed = true; }
    if (d.skinsUnLock) {
      for (k in BLOCK) {
        if (Object.prototype.hasOwnProperty.call(d.skinsUnLock, k)) {
          delete d.skinsUnLock[k];
          changed = true;
        }
      }
    }
    if (changed) {
      S.clearedSaves++;
      try { if (up.save) up.save(); } catch (e) { }
    }
    return changed;
  }

  var tick = 0;
  var timer = setInterval(function () {
    tick++;
    hookView();
    hookAtlas();
    if (tick % 10 === 0) clearSaved();
    if (S.hookedView && S.hookedAtlas) {
      clearInterval(timer);
      clearSaved();
    }
  }, 300);

  // 兜底：面板已出现但 hook 未生效（极端情况）
  setInterval(function () {
    if (!window.cc || !cc.find) return;
    var SV = getSV(), SI = getSI();
    if (!SV || !SI) return;
    var nd = null;
    try { nd = cc.find('Canvas/SkinsView'); } catch (e) { nd = null; }
    if (!nd) return;
    var comp = null;
    try { comp = nd.getComponent(SV); } catch (e) { comp = null; }
    if (comp && comp.Content) trim(comp.Content, SI);
  }, 900);
})();
