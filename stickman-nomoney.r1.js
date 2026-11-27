/* =========================================================================
 * 无金钱化补丁 r1
 * -------------------------------------------------------------------------
 * 目标：把金币 / 钥匙这一整套收支从游戏里彻底拿掉，而不是仅仅调数值。
 *
 * 1) 界面
 *    - 主菜单顶部金币条（绿色钞票 + 数字）、钥匙条、等级进度上的钥匙标记
 *    - 宝箱（Lootbox）与开箱按钮、宝箱红色提示点
 *    - 竞技场按钮上的钥匙图标 / 看广告换钥匙的小标签
 *    - 结算界面：余额金币、+金币按钮、看广告翻倍按钮、钥匙奖励面板
 * 2) 收支
 *    - 结算不再发金币 / 钥匙（把 GoHome / GoHomeKey 的增量还原）
 *    - 开箱不再扣 150 金币；开箱入口一并下线
 *    - 竞技场不再检查 / 消耗钥匙
 *    - 武器 / 皮肤面板点击不再扣 300 金币
 * 3) 存档
 *    - gold / keys 恒为 0，并且每次 save 前强制归零，旧存档里的余额不会回来
 *    - 武器 / 皮肤全部解锁，锁图标与「金币不足」提示自然消失
 * 开关：?money=0 关闭；状态：window.__noMoney.report()
 * ========================================================================= */
;(function () {
  'use strict';

  if (/[?&]money=0/.test(location.search || '')) return;
  if (window.__noMoney) return;

  var M = window.__noMoney = {
    version: 'nomoney-r1',
    unlocked: 0,
    hidden: 0,
    freeUnlocks: 0,
    lootBlocked: 0,
    flyBlocked: 0,
    rewardsStripped: 0,
    saveHooked: false,
    report: function () {
      return {
        version: M.version,
        unlocked: M.unlocked,
        hidden: M.hidden,
        freeUnlocks: M.freeUnlocks,
        lootBlocked: M.lootBlocked,
        flyBlocked: M.flyBlocked,
        rewardsStripped: M.rewardsStripped,
        saveHooked: M.saveHooked,
        gold: (function () { try { return up().data.gold; } catch (e) { return null; } })(),
        keys: (function () { try { return up().data.keys; } catch (e) { return null; } })()
      };
    }
  };

  function mod(name) {
    try { return window.__require ? window.__require(name) : null; } catch (e) { return null; }
  }
  function up() {
    var m = mod('UserProfile');
    return m && m.userProfile;
  }
  function hide(n) {
    if (n && n.isValid && n.active) { n.active = false; M.hidden++; return true; }
    return false;
  }
  function find(path) {
    try { return cc.find(path); } catch (e) { return null; }
  }

  /* ---------------- 存档 ---------------- */
  function zero() {
    var u = up(); if (!u || !u.data) return;
    var d = u.data;
    if (d.gold !== 0) d.gold = 0;
    if (d.keys !== 0) d.keys = 0;
    d.isPassShopTutorial = true;
    d.isPassArenaTutorial = true;
  }

  function unlockAll() {
    var u = up(); if (!u || !u.data) return false;
    var d = u.data, k, n = 0;
    if (d.weaponsUnLock) {
      for (k in d.weaponsUnLock) {
        if (d.weaponsUnLock[k] !== true) { d.weaponsUnLock[k] = true; n++; }
      }
    }
    if (d.skinsUnLock) {
      for (k in d.skinsUnLock) {
        if (d.skinsUnLock[k] !== true) { d.skinsUnLock[k] = true; n++; }
      }
    }
    if (n) {
      M.unlocked += n;
      try { u.save(); } catch (e) { }
    }
    return true;
  }

  function hookSave() {
    var u = up(); if (!u || u.__noMoneySave) return;
    var orig = u.save;
    u.save = function () {
      try {
        if (this.data) { this.data.gold = 0; this.data.keys = 0; }
      } catch (e) { }
      return orig.apply(this, arguments);
    };
    u.__noMoneySave = true;
    M.saveHooked = true;
  }

  /* ---------------- 界面 ---------------- */
  function hideChooseUI(cv) {
    if (!cv) return;
    var tp = cv.getChildByName('TopPanel');
    if (tp) {
      hide(tp.getChildByName('golds'));
      hide(tp.getChildByName('keys'));
      var lp = tp.getChildByName('LevelProgress');
      if (lp) {
        for (var i = 0; i < lp.children.length; i++) {
          if (lp.children[i].name === 'keyIcon') hide(lp.children[i]);
        }
      }
    }
    var cen = cv.getChildByName('Center');
    if (cen) {
      ['1PlayerUI', '2PlayersUI'].forEach(function (ui) {
        var box = cen.getChildByName(ui); if (!box) return;
        hide(box.getChildByName('Lootbox'));
        hide(box.getChildByName('LootBoxBtn'));
        var ab = box.getChildByName('ArenaBtn');
        if (ab) {
          hide(ab.getChildByName('key'));
          hide(ab.getChildByName('ad'));
          var lb = ab.getChildByName('label');
          if (lb && !lb.active) lb.active = true;
        }
      });
    }
  }

  function finishUI(node, isFinishPrefab) {
    if (!node) return;
    hide(node.getChildByName('golds'));
    hide(node.getChildByName('keyPanel'));
    if (isFinishPrefab) {
      hide(node.getChildByName('getGoldReward'));
      var gg = node.getChildByName('getGold');
      if (gg) {
        if (!gg.active) gg.active = true;
        hide(gg.getChildByName('golds'));
        var lb = null;
        try { lb = gg.getComponentInChildren(cc.Label); } catch (e) { }
        if (lb && lb.string !== 'OK') lb.string = 'OK';
      }
    }
  }

  function sweepEndViews() {
    var cv = find('Canvas'); if (!cv) return;
    for (var i = 0; i < cv.children.length; i++) {
      var n = cv.children[i];
      if (!n || !n.active) continue;
      if (n.name === 'FinishView') { finishUI(n, true); }
      else if (n.name === 'EndView') { finishUI(n, false); }
    }
  }

  /* ---------------- ChooseView ---------------- */
  function patchChoose() {
    var m = mod('ChooseView');
    var p = m && m.default && m.default.prototype;
    if (!p) return false;
    if (p.__noMoney) return true;

    var origUpdate = p.updateGold;
    p.updateGold = function () {
      try { origUpdate.apply(this, arguments); } catch (e) { }
      try { hideChooseUI(this.node); } catch (e) { }
    };

    p.showFlyMoney = function () { M.flyBlocked++; };

    p.buyLootbox = function () { M.lootBlocked++; };
    p.openLootBox = function () { M.lootBlocked++; };

    var origChange = p.ChangeScene;
    p.ChangeScene = function () {
      var u = up(), d = u && u.data, had = d ? d.keys : 0;
      if (d) d.keys = 1;              // 让「需要钥匙」的检查通过
      var r;
      try { r = origChange.apply(this, arguments); }
      finally {
        if (d) d.keys = 0;
        try { if (u && u.save) u.save(); } catch (e) { }
      }
      return r;
    };

    p.__noMoney = true;
    return true;
  }

  /* ---------------- EndView ---------------- */
  function patchEnd() {
    var m = mod('EndView');
    var p = m && m.default && m.default.prototype;
    if (!p) return false;
    if (p.__noMoney) return true;

    var origEnable = p.onEnable;
    p.onEnable = function () {
      try { origEnable.apply(this, arguments); } catch (e) { }
      try {
        finishUI(this.node, this.node && this.node.name === 'FinishView');
        M.rewardsStripped++;
      } catch (e) { }
    };

    var origHome = p.GoHome;
    p.GoHome = function () {
      var u = up(), d = u && u.data;
      var r;
      try { r = origHome.apply(this, arguments); }
      finally {
        if (d) { d.gold = 0; d.keys = 0; }
        // 钥匙奖励面板：整块跳过，直接回主菜单
        var kp = this.node && this.node.getChildByName && this.node.getChildByName('keyPanel');
        if (kp && kp.active) {
          kp.active = false;
          this.isKeyPopup = false;
          try { cc.find('Canvas').getComponent('Games').closeGame(); } catch (e) { }
        }
        try { if (u && u.save) u.save(); } catch (e) { }
      }
      return r;
    };

    var origKey = p.GoHomeKey;
    p.GoHomeKey = function () {
      var u = up(), d = u && u.data, k0 = d ? d.keys : 0;
      var r;
      try { r = origKey.apply(this, arguments); }
      finally {
        if (d) d.keys = k0;
        try { if (u && u.save) u.save(); } catch (e) { }
      }
      return r;
    };

    p.getGoldReward = function () { M.lootBlocked++; };
    p.getKeyReward = function () { M.lootBlocked++; };

    p.__noMoney = true;
    return true;
  }

  /* ---------------- 武器 / 皮肤条目：免费解锁 ---------------- */
  function patchItem(name) {
    var m = mod(name);
    var p = m && m.default && m.default.prototype;
    if (!p) return false;
    if (p.__noMoney) return true;

    var orig = p.clickEvent;
    p.clickEvent = function () {
      var u = up(), d = u && u.data;
      if (d) d.gold = 300;           // 通过「300 金币」校验，原逻辑会把它扣成 0
      var r;
      try { r = orig.apply(this, arguments); }
      finally {
        if (d) d.gold = 0;
        M.freeUnlocks++;
        try { if (u && u.save) u.save(); } catch (e) { }
      }
      return r;
    };
    p.showTips = function () { M.lootBlocked++; };
    p.__noMoney = true;
    return true;
  }

  /* ---------------- 启动 ---------------- */
  function boot() {
    if (typeof cc === 'undefined' || !cc.director) return false;
    zero(); hookSave(); unlockAll();
    var a = patchChoose(), b = patchEnd();
    var c = patchItem('WeaponsItem'), d = patchItem('SkinsItem');
    return a && b && c && d;
  }

  var tick = 0;
  var timer = setInterval(function () {
    var ok = false;
    try { ok = boot(); } catch (e) { }
    if (ok) {
      tick++;
      if (tick % 2 === 0) {
        try { zero(); } catch (e) { }
        try { hideChooseUI(find('Canvas/ChooseView')); } catch (e) { }
        try { sweepEndViews(); } catch (e) { }
      }
      if (tick === 6) { clearInterval(timer); setInterval(function () { try { zero(); } catch (e) { } }, 1500); }
    }
  }, 400);

  // 常驻：界面可能在任意时刻重建
  setInterval(function () {
    try {
      if (typeof cc === 'undefined' || !cc.director) return;
      hideChooseUI(find('Canvas/ChooseView'));
      sweepEndViews();
    } catch (e) { }
  }, 800);

  // 清掉上一版 meme 武器的自选记录
  try { localStorage.removeItem('r23.forced'); } catch (e) { }
})();
