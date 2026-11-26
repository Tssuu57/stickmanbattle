// ================= 战斗手感层 =================
// 1 起步加速与转身响应   2 跳跃蓄力提速   3 空中微调
// 4 受击硬直 + 击退      5 落地缓冲       6 镜头跟随收紧   7 松手急停
// 全部在补丁层实现，不改 Cocos 打包产物；可与 juice 层共存。
(function () {
  "use strict";
  if (window.__feel) return;
  if (/[?&]feel=0/.test(location.search)) return; // 调试开关：?feel=0 关闭

  var F = { v: "feel-r1", on: true, boosts: 0, jumps: 0, knock: 0, stun: 0 };
  window.__feel = F;

  function log() {
    try {
      (window.__logs || (window.__logs = [])).push("[feel] " + [].slice.call(arguments).join(" "));
      if (window.__logs.length > 300) window.__logs.shift();
    } catch (_) {}
  }

  function cls(n) {
    try { return cc && cc.js && cc.js.getClassByName(n); } catch (_) { return null; }
  }

  function ready() {
    try {
      return !!(window.cc && cc.director && cc.find && cc.find("Canvas") &&
        cls("Human") && cls("JoyStick") && cls("HumanController") && cls("CameraCtrl"));
    } catch (_) { return false; }
  }

  // 参数集中放这里，方便调
  var CFG = {
    burstSpeed: 305,   // 起步一脚把水平速度带到多少（原版巡航约 300）
    burstImpulse: 900, // 起步蹬地冲量（走物理传导）
    airCap: 380,       // 空中水平速度目标
    airGain: 16,       // 空中辅助力系数
    airForce: 4200,    // 空中单帧力上限
    jumpMs: 300,       // 推杆到起跳的目标时间（原版约 620ms）
    stunLight: 80,     // 轻击硬直 ms
    stunMid: 110,
    stunHeavy: 150,
    knockPerDmg: 12,   // 每点伤害的击退速度
    knockMaxDmg: 40,   // 伤害封顶参与计算
    knockLift: 0.25,   // 击退的垂直分量比例
    stopDamp: 0.72,    // 松手时保留的水平速度
    camSmooth: 0.2     // 镜头跟随系数（原版 0.125）
  };

  // ---------- 受击：硬直 + 击退 ----------
  function hookDamage(HC) {
    var P = HC.prototype;
    if (!P || P.__feelDmg) return false;
    var orig = P.setDamage;
    if (typeof orig !== "function") { log("setDamage 缺失"); return false; }
    P.setDamage = function (dmg, silent) {
      var beforeHp = this.hp;
      var r = orig.apply(this, arguments);
      try {
        var lost = beforeHp - this.hp;
        if (lost > 0 && this.hp > 0 && !this.isDead && !this.isAllySummon) {
          var h = null;
          try { h = this.node.getComponent("Human"); } catch (_) {}
          if (h && h.isValid) {
            var now = Date.now();
            var stun = lost >= 30 ? CFG.stunHeavy : lost >= 15 ? CFG.stunMid : CFG.stunLight;
            h.__stunUntil = Math.max(h.__stunUntil || 0, now + stun);
            F.stun++;
            // 方向：攻击者 → 受击者
            var gm = null;
            try { gm = cc.find("Canvas").getComponent("Games"); } catch (_) {}
            var other = null;
            if (gm) other = (this.node === gm.player) ? gm.enemy : (this.node === gm.enemy ? gm.player : null);
            var dir = 1;
            if (other && other.isValid) {
              try { dir = this.node.x >= other.x ? 1 : -1; } catch (_) {}
            }
            var bd = this.node.getChildByName("body");
            var rb = bd && bd.getComponent(cc.RigidBody);
            if (rb && rb.isValid) {
              var dv = Math.min(lost, CFG.knockMaxDmg) * CFG.knockPerDmg;
              try {
                // 整个身体一起推，否则会被腿脚关节和地面摩擦吃掉
                var rigids = this.node.getComponentsInChildren(cc.RigidBody) || [];
                for (var ri = 0; ri < rigids.length; ri++) {
                  var rr = rigids[ri];
                  if (!rr || !rr.isValid) continue;
                  var nm = rr.node && rr.node.name;
                  // 脚掌直接顶地，给满速度会和地面撞出弹射，只给一半
                  var w = (nm === "footL" || nm === "footR") ? 0.5 : 1;
                  var lv = rr.linearVelocity;
                  var lift = (rr === rb) ? dv * CFG.knockLift : 0;
                  var nvx = lv.x + dir * dv * w;
                  if (nvx > 600) nvx = 600;
                  if (nvx < -600) nvx = -600;
                  rr.linearVelocity = cc.v2(nvx, lv.y + lift);
                }
              } catch (_) {}
              F.knock++;
            }
          }
        }
      } catch (e) { log("dmg err", e && e.message); }
      return r;
    };
    P.__feelDmg = true;
    return true;
  }

  // ---------- 角色层：输入屏蔽 / 移动辅助 / 跳跃提速 / 落地 ----------
  function hookHuman(H) {
    var P = H.prototype;
    if (!P || P.__feelHuman) return false;

    var origSetVec = P.setVec;
    if (typeof origSetVec !== "function") { log("setVec 缺失"); return false; }
    P.setVec = function () {
      this.__feelInputAt = Date.now();
      try {
        if (this.__stunUntil && Date.now() < this.__stunUntil) {
          this._PlayerState = 1; // Idle：硬直期间不接受移动输入
          return;
        }
      } catch (_) {}
      return origSetVec.apply(this, arguments);
    };

    var origJump = P.HumanJump;
    if (typeof origJump !== "function") { log("HumanJump 缺失"); return false; }
    P.HumanJump = function () {
      this.__feelInputAt = Date.now();
      try {
        if (this.__stunUntil && Date.now() < this.__stunUntil) return;
      } catch (_) {}
      var now = Date.now();
      try {
        // 距上次调用超过 260ms 视为一次新的蓄力，清掉残留进度
        if (now - (this.__feelJumpLast || 0) > 260) {
          this.__feelJumpT0 = 0;
          if (this._bodyState === 0) this._jumpProgress = 0;
        }
        if (this._jumpProgress === 0) this.__feelJumpT0 = now;
        this.__feelJumpLast = now;
      } catch (_) {}
      var r = origJump.apply(this, arguments);
      try {
        // 原版每帧 +4，蓄满 150 要 0.62s；改成按时间推进，CFG.jumpMs 起跳
        if (this._bodyState === 0 && this.__feelJumpT0) {
          var target = Math.min(150, (now - this.__feelJumpT0) / CFG.jumpMs * 150);
          if (target > this._jumpProgress) {
            this._jumpProgress = target;
            var jl = this.JumpLines;
            if (jl && jl.active) {
              var bg = jl.getChildByName("bg");
              if (bg) bg.width = target;
            }
            F.jumps++;
          }
        }
      } catch (_) {}
      return r;
    };

    var origLate = P.lateUpdate;
    if (typeof origLate !== "function") { log("Human.lateUpdate 缺失"); return false; }
    P.lateUpdate = function (dt) {
      origLate.apply(this, arguments);
      try { tickHuman(this); } catch (_) {}
    };

    P.__feelHuman = true;
    return true;
  }

  function tickHuman(h) {
    if (!h || !h.isValid) return;
    var body = h._BodyrigidBody;
    var st = h._bodyState;

    // --- 起步 / 转身：一次性蹬地爆发，巡航交回原版物理 ---
    if (h.__stunUntil && Date.now() < h.__stunUntil) return;
    if (h._forceState) return;
    if (!body || !body.isValid) return;

    var dir = h.checkChange === 1 ? 1 : (h.checkChange === 2 ? -1 : 0);
    var prevDir = h.__feelDir || 0;
    var wasRun = h.__feelWasRun || false;
    var isRun = h._PlayerState === 0;
    h.__feelDir = dir;
    h.__feelWasRun = isRun;

    var now2 = Date.now();
    if (st === 0 && isRun && dir && now2 - (h.__feelInputAt || 0) < 90 && (dir !== prevDir || !wasRun)) {
      try {
        var v = body.linearVelocity;
        // 只在还没跑起来 / 正在反向时蹬一脚
        if (v.x * dir < CFG.burstSpeed) {
          body.applyLinearImpulse(cc.v2(dir * CFG.burstImpulse, 0), body.getWorldCenter(), true);
          F.boosts++;
        }
        h.__feelImpulseAt = now2;
        h.__feelBurstDir = dir;
      } catch (_) {}
    }

    // --- 空中微调：允许小幅修正落点 ---
    if (st === 1 && isRun && dir && Date.now() - (h.__feelInputAt || 0) < 90) {
      try {
        var av = body.linearVelocity;
        var adv = CFG.airCap * dir - av.x;
        if (adv * dir > 0) {
          var af = Math.min(CFG.airForce, Math.abs(adv) * CFG.airGain);
          if (af > 30) { body.applyForceToCenter(cc.v2(dir * af, 0), true); F.boosts++; }
        }
      } catch (_) {}
    }
  }

  // ---------- 摇杆层：松手急停 ----------
  function hookJoy(J) {
    var P = J.prototype;
    if (!P || P.__feelJoy) return false;
    var origEnd = P._endTouch;
    if (typeof origEnd !== "function") { log("_endTouch 缺失"); return false; }
    P._endTouch = function () {
      var r = origEnd.apply(this, arguments);
      try {
        var h = this.human2;
        var body = h && h._BodyrigidBody;
        if (body && body.isValid) {
          var v = body.linearVelocity;
          if (Math.abs(v.x) > 120) body.linearVelocity = cc.v2(v.x * CFG.stopDamp, v.y);
        }
      } catch (_) {}
      return r;
    };
    P.__feelJoy = true;
    return true;
  }

  // ---------- 镜头：跟随更紧 ----------
  function hookCamera(C) {
    var P = C.prototype;
    if (!P || P.__feelCam) return false;
    var origLoad = P.onLoad;
    if (typeof origLoad !== "function") { log("CameraCtrl.onLoad 缺失"); return false; }
    P.onLoad = function () {
      origLoad.apply(this, arguments);
      try { this.smoothSpeed = CFG.camSmooth; } catch (_) {}
    };
    P.__feelCam = true;
    return true;
  }

  // ---------- 安装 ----------
  var done = { dmg: false, human: false, joy: false, cam: false };
  var timer = setInterval(function () {
    if (!ready()) return;
    var HC = cls("HumanController"), H = cls("Human"), J = cls("JoyStick"), C = cls("CameraCtrl");
    if (!done.dmg && HC) done.dmg = hookDamage(HC);
    if (!done.human && H) done.human = hookHuman(H);
    if (!done.joy && J) done.joy = hookJoy(J);
    if (!done.cam && C) done.cam = hookCamera(C);
    if (done.dmg && done.human && done.joy && done.cam) {
      clearInterval(timer);
      log("手感层已安装", JSON.stringify(CFG));
    }
  }, 400);

  setTimeout(function () {
    if (!done.human) log("未完成安装", JSON.stringify(done));
  }, 30000);
})();
