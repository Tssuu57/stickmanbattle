// stickman-fixes.r1.js — 2026-11-10 修复层（加载在所有原有补丁之后）
// 1 血量<=0 强制死亡（除非有可用复活）  2 复活无敌超时兜底  3 音乐默认不放（设置里打开）
// 4 道具刷新池补齐  5+ 其它修复见下方各段
(function(){
  "use strict";
  // 日志环形缓冲（调试用，最多 300 条）
  window.__logs=[];
  ["log","warn","error"].forEach(function(k){
    var o=console[k];
    console[k]=function(){
      try{ var s=[].slice.call(arguments).map(function(x){return typeof x==="string"?x:(x&&x.message)||JSON.stringify(x);}).join(" ");
        window.__logs.push(k[0]+" "+s.slice(0,300)); if(window.__logs.length>300)window.__logs.shift(); }catch(_){}
      return o.apply(console,arguments);
    };
  });
  window.addEventListener("error",function(e){ window.__logs.push("E "+(e.message||"")+" @"+(e.filename||"").split("/").pop()+":"+e.lineno); });
  var LOG = function(){ try{ console.log.apply(console, ["[FIX-R1]"].concat([].slice.call(arguments))); }catch(_){} };
  function ready(){ return window.cc && cc.director && cc.director.getScene && window.__require; }
  function req(n){ try{ return window.__require(n); }catch(_){ return null; } }
  function cfg(){ var m=req("ConfigManager"); return m&&m.gameConfig; }
  function games(){ var cn=cc.find("Canvas"); return cn&&cn.getComponent("Games"); }

  // ---------- 1. 死亡看门狗 ----------
  function hasRevive(hc){
    if(!hc||!hc.node)return false;
    var isP1=hc.node.name==="StickMan1";
    var P=window.__passives||{};
    var phoenix=(isP1?P.p1:P.p2)==="reviveOnce" && !hc.__phoenixUsed;
    var totem=hc.__totemReady && !hc.__totemUsed;
    return !!(phoenix||totem);
  }
  function endViewShown(){
    var cn=cc.find("Canvas"); if(!cn)return false;
    return cn.children.some(function(n){ return n&&n.active&&/^(EndView|FinishView)$/.test(n.name); });
  }
  function clearInvuln(hc){
    hc.isInvincible=false; hc.__invincibleEnd=null; hc.__invincibleStart=null;
    hc.isShieldInvincible=false; hc.isSlowShieldTimer=null;
    hc.__phoenixInvuln=false; hc.__totemInvuln=false;
    hc.onceShield=0; hc.__activeItemDamageBudget=null;
  }
  function forceDeath(hc){
    var c=cfg();
    // 上一局遗留的“结算已显示”标记会让原版跳过判死；没有结算界面时纠正它
    if(c && c.isShowFinishView && c.gameStart && !endViewShown()) c.isShowFinishView=false;
    if(hasRevive(hc) && window.__resolveFatalProtection){
      var saveHp=hc.hp; hc.hp=Math.max(hc.hp,0.0001);
      if(window.__resolveFatalProtection(hc, 1e9)){ LOG("复活触发", hc.node.name); return; }
      hc.hp=saveHp;
    }
    clearInvuln(hc);
    hc.hp=0;
    var orig=hc.__origSetDamage || (window.__HCClass&&window.__HCClass.prototype.__origSetDamage);
    var capSave=window.__capBudgetedItemDamage, fatalSave=window.__resolveFatalProtection;
    try{
      window.__capBudgetedItemDamage=function(h,d){return d;};
      window.__resolveFatalProtection=function(){return false;};
      if(orig) orig.call(hc, 1, true);
    }catch(e){ LOG("forceDeath err", e&&e.message); }
    finally{ window.__capBudgetedItemDamage=capSave; window.__resolveFatalProtection=fatalSave; }
    if(!hc.isDead){ // 原版路径仍没判死（例如 gameStart=false）：至少让它倒下
      hc.isDead=true;
      try{ hc.node.getComponent("Human").dead(); }catch(_){}
    }
    LOG("强制死亡", hc.node.name, "hp=", hc.hp);
  }
  function guardOne(hc){
    if(!hc||!hc.node||!hc.node.isValid||hc.isDead)return;
    // 复活无敌兜底：最长 5.5 秒
    var now=Date.now();
    ["__phoenixInvuln","__totemInvuln"].forEach(function(k){
      if(hc[k]){ hc[k+"At"]=hc[k+"At"]||now; if(now-hc[k+"At"]>5500){ hc[k]=false; hc[k+"At"]=0; LOG("清除超时无敌",k,hc.node.name);} }
      else hc[k+"At"]=0;
    });
    if(!(hc.hp>0)) forceDeath(hc);   // 包括 hp<=0 和 NaN
  }
  function guardAll(){
    try{
      if(!ready())return;
      var cn=cc.find("Canvas"); if(!cn)return;
      var list=cn.getComponentsInChildren("HumanController");
      for(var i=0;i<list.length;i++) guardOne(list[i]);
    }catch(_){}
  }
  setInterval(guardAll, 100);

  // ---------- 1b. 双人模式回合结束兜底 ----------
  // 原版判死后靠镜头慢动作回调出结算；回调丢了 / 判死时 gameStart 已是 false → 人倒了但回合不结束。
  var deadSince=0, armed=false;
  function mainDead(n){
    if(!n||!n.isValid)return true;
    var h=n.getComponent("HumanController");
    return !h || h.isDead || !(h.hp>0);
  }
  function finishRound(gm,c){
    var p1d=mainDead(gm.player), p2d=mainDead(gm.enemy);
    var winner = p1d&&!p2d ? 2 : (!p1d&&p2d ? 1 : 0);   // 0 = 同归于尽
    try{ cc.director.getScheduler().setTimeScale(1); cc.PhysicsManager.FIXED_TIME_STEP=1/60; cc.director.getPhysicsManager().enabledAccumulator=false; }catch(_){}
    try{ var cam=cc.find("Canvas/MainCamera"); var cf=cam&&cam.getComponents(cc.Component).filter(function(x){return "isDeadCamera" in x;})[0]; if(cf){cf.isDeadCamera=false;cf.isDeadTarget=null;} }catch(_){}
    try{ cc.find("Canvas/MainView/Joy").active=false; }catch(_){}
    c.gameStart=false;
    var up=req("UserProfile").userProfile, d=up.data;
    if(winner===1){ d.player1Count++; c.WhoKill=1; }
    else if(winner===2){ d.player2Count++; c.WhoKill=2; }
    else c.WhoKill=null;
    up.save();
    c.isShowFinishView=true;
    var final = d.player1Count>=3 || d.player2Count>=3;
    if(final) c.isLeftWin = d.player1Count>=3;
    loadView(final?"views/FinishView":"views/EndView", function(e,p){
      if(e||!p){ LOG("结算界面加载失败",e&&e.message); return; }
      var o=cc.instantiate(p); o.parent=cc.find("Canvas"); o.active=true; o.zIndex=5;
    });
    LOG("回合兜底结算 winner=",winner, d.player1Count+":"+d.player2Count);
  }
  // 预载 EndView/FinishView，判死后不用再等加载
  var viewCache={};
  function preloadViews(){
    var b=cc.assetManager&&cc.assetManager.getBundle("prefabs"); if(!b)return false;
    ["views/EndView","views/FinishView"].forEach(function(k){ if(!viewCache[k]) b.load(k,cc.Prefab,function(e,p){ if(!e&&p) viewCache[k]=p; }); });
    return true;
  }
  function loadView(k,cb){ if(viewCache[k]) return cb(null,viewCache[k]); cc.assetManager.getBundle("prefabs").load(k,cc.Prefab,cb); }
  // 原版判死也走缓存：包一层 bundle.load
  function patchBundle(){
    var b=cc.assetManager&&cc.assetManager.getBundle("prefabs"); if(!b)return false; if(b.__fixR1)return true;
    var o=b.load;
    b.load=function(path,type,cb){ if(viewCache[path]&&typeof cb==="function"&&arguments.length===3){ var p=viewCache[path]; cb(null,p); return; } return o.apply(this,arguments); };
    b.__fixR1=true; preloadViews(); return true;
  }
  function roundWatch(){
    try{
      if(!ready())return;
      var c=cfg(), gm=games();
      if(!c||!gm||c.suverModel||!gm.player||!gm.enemy||!gm.player.isValid||!gm.enemy.isValid){ deadSince=0; armed=false; return; }
      if(endViewShown()){ deadSince=0; armed=false; return; }
      var anyDead=mainDead(gm.player)||mainDead(gm.enemy);
      if(!anyDead){ deadSince=0; if(c.gameStart) armed=true; return; }
      if(!armed) return;   // 只管本局开打后出现的死亡（菜单里不动）
      // 有复活还没用：先让复活走
      [gm.player,gm.enemy].forEach(function(n){ var h=n&&n.isValid&&n.getComponent("HumanController"); if(h&&!h.isDead&&!(h.hp>0)) forceDeath(h); });
      var now=Date.now(); if(!deadSince){ deadSince=now; return; }
      if(now-deadSince<300)return;       // 慢动作已去掉，原版应立刻出结算；0.3 秒还没有就兜底
      if(c.isShowFinishView && now-deadSince<2500) return; // 原版已在加载结算，再等等
      if(mainDead(gm.player)||mainDead(gm.enemy)){ deadSince=0; armed=false; finishRound(gm,c); }
    }catch(e){ LOG("roundWatch err", e&&e.message); }
  }
  setInterval(roundWatch, 250);

  // ---------- 2. 音乐：默认不放，设置里的开关打开才放 ----------
  var MKEY="stickman.musicOn";
  function musicOn(){ try{ return localStorage.getItem(MKEY)==="1"; }catch(_){ return false; } }
  function setMusicOn(v){ try{ localStorage.setItem(MKEY, v?"1":"0"); }catch(_){} }
  window.__musicWanted=null;
  function patchAudio(){
    var am=req("AudioManager"); if(!am||!am.audioManager)return false;
    var a=am.audioManager; if(a.__fixR1)return true;
    var orig=a.playMusic;
    a.playMusic=function(name,vol){
      window.__musicWanted=[name,vol];
      if(!musicOn()){ try{ cc.audioEngine.stopMusic(); }catch(_){} return; }
      return orig.call(this,name,vol);
    };
    a.__origPlayMusic=orig; a.__fixR1=true;
    // 设置面板的声音按钮：只管音乐开/关，音效保持
    var AV=req("AudioView"); var P=AV&&AV.default&&AV.default.prototype;
    if(P && !P.__fixR1){
      var oLoad=P.onLoad;
      P.onLoad=function(){ if(oLoad)oLoad.call(this); try{ this.musicSprite.spriteFrame = musicOn()?this.musicOn:this.musicOff; }catch(_){} };
      P.OnMusicBtn=function(){
        var on=!musicOn(); setMusicOn(on);
        try{ this.musicSprite.spriteFrame = on?this.musicOn:this.musicOff; }catch(_){}
        if(on){
          var up=req("UserProfile").userProfile; if(!(up.data.audioNumber>0)){ up.data.audioNumber=.5; up.save(); }
          var w=window.__musicWanted||[cfg()&&cfg().gameStart?"battle":"bgm"];
          cc.audioEngine.setMusicVolume(up.data.audioNumber);
          orig.call(a, w[0], up.data.audioNumber);
        }else cc.audioEngine.stopMusic();
      };
      P.__fixR1=true;
    }
    return true;
  }

  // ---------- 3. 道具刷新池补齐 ----------
  function patchItems(){
    if(!window.__itemIcons||!window.__BLOCKED_STATES||!window.__itemTextureCache)return false;
    // 已实现、但被黑名单挡住的道具放回刷新池
    [9,30,110,150].forEach(function(s){ delete window.__BLOCKED_STATES[s]; });
    // 缺图标 → 永远不进池：补上
    var add={201:"/assets/icons/new1/item_recall.png",203:"/assets/icons/new1/item_ceasefire.png"};
    Object.keys(add).forEach(function(k){
      var s=+k;
      window.__itemIcons[s]=add[k];
      if(window.__guideThumbs) window.__guideThumbs[k]=add[k];
      cc.assetManager.loadRemote(add[k],{ext:".png"},function(err,tex){
        if(err||!tex){ LOG("图标加载失败",k); return; }
        var fr=new cc.SpriteFrame(tex);
        // 旧的 svg 可能稍后才加载完把它盖掉：前 10 秒内反复写回
        [0,2000,5000,10000].forEach(function(ms){ setTimeout(function(){ window.__itemIcons[s]=add[k]; window.__itemTextureCache[s]=fr; },ms); });
      });
    });
    // 场上道具图标放大 1.4 倍（只放大图标，不改拾取范围）
    var oA=window.__assignItemFrame;
    if(oA&&!oA.__fix){
      window.__assignItemFrame=function(sprite,frame){
        var r=oA.apply(this,arguments);
        try{ var p=sprite.node.parent; for(var i=0;i<3&&p;i++,p=p.parent){ if(p.name==="BuffItem"){ sprite.node.scale=1.4; break; } } }catch(_){}
        return r;
      };
      window.__assignItemFrame.__fix=true;
    }
    return true;
  }

  // ---------- 4. 武器大招：光环 → 直接扣敌方最大生命值的一半 ----------
  function worldPos(node){
    var b=node&&node.getChildByName&&node.getChildByName("body"); var rb=b&&b.getComponent(cc.RigidBody);
    var p=cc.v2(0,0); if(rb){ rb.getWorldPosition(p); return p; }
    return node&&node.parent?node.parent.convertToWorldSpaceAR(node.getPosition()):p;
  }
  function popText(node,str,color){
    try{
      var cn=cc.find("Canvas"); var l=new cc.Node("halfHpTxt"); l.parent=cn; l.zIndex=99;
      var lb=l.addComponent(cc.Label); lb.string=str; lb.fontSize=46; lb.lineHeight=50;
      var ol=l.addComponent(cc.LabelOutline); ol.color=cc.Color.BLACK; ol.width=3;
      l.color=color||cc.color(255,70,70);
      var p=cn.convertToNodeSpaceAR(worldPos(node)); l.setPosition(p.x,p.y+140);
      cc.tween(l).by(.9,{position:cc.v3(0,90,0)}).to(.3,{opacity:0}).call(function(){l.destroy();}).start();
    }catch(_){}
  }
  function halfHpStrike(casterGroup, origin){
    var c=cfg(); var cn=cc.find("Canvas"); if(!cn)return 0;
    var PS=window.__passives||{}, ap=casterGroup==="weapons1"?PS.p1:PS.p2, mul=1, gmH=games();
    if(ap==="mage")mul=.5;                                                   // 咒术师：大招伤害减半
    if(ap==="firstStrike"&&gmH&&Date.now()-gmH.__roundStart<15000)mul=1.5;   // 先登勇士：开局 15 秒大招 ×1.5
    var targets=casterGroup==="weapons1"?{player2:1,suverenemy:1}:{player1:1};
    var EM=req("EffectManager"); var hit=0;
    cn.getComponentsInChildren("HumanController").forEach(function(hc){
      if(!hc||hc.isDead||!hc.node||!hc.node.isValid||!hc.node.activeInHierarchy)return;
      var body=hc.node.getChildByName("body"); if(!body||!targets[body.group])return;
      // 按距离递减：≤100 像素扣 50% 最大生命，600 像素处降到 10%，再远不扣
      var frac=0.5;
      if(origin){
        var dmin=1e9; hc.node.getComponentsInChildren(cc.RigidBody).forEach(function(rb){ var q=cc.v2(); rb.getWorldPosition(q); dmin=Math.min(dmin,cc.Vec2.distance(origin,q)); });
        if(dmin>600)return;
        frac = dmin<=100 ? 0.5 : 0.5-0.4*(dmin-100)/500;
      }
      // 无敌/护盾照常生效
      if(hc.isInvincible||hc.isShieldInvincible||hc.__phoenixInvuln||hc.__totemInvuln)return;
      if(hc.onceShield>0){ hc.onceShield--; if(hc.onceShield<=0){ try{hc.node.getComponent("Human").offShieldsNode();}catch(_){} } hc.isShieldInvincible=true; hc.isSlowShieldTimer=.2; return; }
      frac*=mul;
      var tp=body.group==="player1"?PS.p1:(body.group==="player2"?PS.p2:null);
      if(tp==="ironHead")frac*=.5; /* r19：30%→50% */                                            // 铁头：吃大招少 30%
      var cut=Math.max(1,Math.round((hc.maxhp||1)*frac));
      hc.hp-=cut; hit++;
      try{ hc.flash(); hc.HealthBar.getComponent(cc.ProgressBar).progress=Math.max(0,hc.hp)/hc.maxhp; hc.showHp(); }catch(_){}
      try{ var A=req("AudioManager"); A&&A.audioManager.playEffect("inhit"); }catch(_){}
      try{ EM.effectManager.playEffect(EM.EffectType.smallBoom, body.getPosition(), hc.node); }catch(_){}
      popText(hc.node,"-"+Math.round(frac*100)+"%");
      if(!(hc.hp>0)) forceDeath(hc);
    });
    return hit;
  }
  function patchBigSkill(){
    var EM=req("EffectManager"); if(!EM||!EM.effectManager||!EM.EffectType)return false;
    var em=EM.effectManager; if(em.__fixR1)return true;
    var orig=em.playBigSkills;
    em.playBigSkills=function(type,group,atk,node){
      if(type!==EM.EffectType.bigSkill) return orig.apply(this,arguments);
      // 保留原版光环样式（吸人 + 爆炸动画），爆炸本身的伤害关掉，改为按距离递减的百分比伤害
      var origin=node&&node.isValid?node.convertToWorldSpaceAR(cc.v2(0,0)):null;
      try{ orig.apply(this,arguments); }catch(e){ LOG("ring vis err", e&&e.message); }
      setTimeout(function(){ var n=halfHpStrike(group, origin); LOG("大招递减打击", group, "命中", n); }, 120);
    };
    em.__origPlayBigSkills=orig; em.__fixR1=true;
    var BB=req("BigSkillBooms"); var BP=BB&&BB.default&&BB.default.prototype;
    if(BP&&!BP.__fixR1){ BP.onBeginContact=function(){}; BP.__fixR1=true; }
    return true;
  }


  // ---------- 6. 道具修复：闪现背刺 / 乾坤大挪移 / 缴械 / 倒置控制 ----------
  function bodyPos(n){ var b=n&&n.isValid&&n.getChildByName("body"); var rb=b&&b.getComponent(cc.RigidBody); if(!rb)return null; var p=cc.v2(); rb.getWorldPosition(p); return p; }
  function depth(n){ var d=0; while(n&&n.parent){d++;n=n.parent;} return d; }
  function moveHumanBy(node,dx,dy){
    var list=node.getComponentsInChildren(cc.RigidBody).filter(function(rb){return rb.node&&rb.node.isValid;});
    var tgt=list.map(function(rb){ var w=rb.node.convertToWorldSpaceAR(cc.v2(0,0)); return {rb:rb,w:cc.v2(w.x+dx,w.y+dy),d:depth(rb.node)}; });
    tgt.sort(function(a,b){return a.d-b.d;});
    tgt.forEach(function(t){
      var n=t.rb.node; n.setPosition(n.parent.convertToNodeSpaceAR(t.w));
      try{t.rb.syncPosition(true);}catch(_){}
      t.rb.linearVelocity=cc.v2(0,0); t.rb.angularVelocity=0;
    });
    node.opacity=128; cc.tween(node).to(.3,{opacity:255}).start();
  }
  function blink(me,opp){
    var a=bodyPos(me), b=bodyPos(opp); if(!a||!b)return false;
    // r21：拾取回调里物理世界是锁着的，直接挪刚体会失败 → 推到下一帧再挪
    setTimeout(function(){ try{ var a=bodyPos(me), b=bodyPos(opp); if(!a||!b)return;
      var side=b.x>=a.x?1:-1;            // 闪到对手另一侧（背后）
      moveHumanBy(me, b.x+side*130-a.x, b.y+40-a.y); LOG("闪现背刺"); }catch(e){ LOG("闪现背刺失败",e&&e.message); } },0);
    return true;
  }
  function swapPos(p1,p2){
    var a=bodyPos(p1), b=bodyPos(p2); if(!a||!b)return false;
    setTimeout(function(){ try{ var a=bodyPos(p1), b=bodyPos(p2); if(!a||!b)return;
      moveHumanBy(p1,b.x-a.x,b.y-a.y+20); moveHumanBy(p2,a.x-b.x,a.y-b.y+20); LOG("乾坤大挪移"); }catch(e){ LOG("乾坤大挪移失败",e&&e.message); } },0); // r21：推到下一帧
    return true;
  }
  function disarm(opp,ms){
    if(!opp||!opp.isValid)return false;
    var W=window.__weaponStealHotfix; var ents=W&&W.weaponEntries?W.weaponEntries(opp):[];
    var hc=opp.getComponent("HumanController"); if(!ents.length)LOG("缴械：没找到武器");
    ents.forEach(function(e){ if(e.root&&e.root.isValid){ e.root.active=false; e.root.__disarmed52=true; } });
    if(hc) hc.__disarmEnd=Date.now()+ms;
    setTimeout(function(){
      ents.forEach(function(e){ if(e.root&&e.root.isValid&&e.root.__disarmed52){ e.root.active=true; e.root.__disarmed52=false; } });
      if(hc&&hc.__disarmEnd<=Date.now()) hc.__disarmEnd=0;
    },ms);
    LOG("缴械", ents.length); return ents.length>0;
  }
  // 倒置控制：反转该玩家的左右输入（键盘 + 摇杆）
  function patchJoy(){
    var J=req("JoyStick"); var P=J&&J.default&&J.default.prototype; if(!P)return false; if(P.__fixR1)return true;
    var o=P._moveTouch;
    P._moveTouch=function(e){
      try{ var n=this.human2&&this.human2.node; if(n&&n.__invertControlEnd&&Date.now()<n.__invertControlEnd&&e) e=cc.v2(-e.x,e.y); }catch(_){}
      return o.call(this,e);
    };
    P.__fixR1=true; return true;
  }

  // ---------- 7. 道具特效重绘（贴图版：陨石 / 射线 / 爆炸 / 炸弹 / 时间凝滞） ----------
  var FX={}, FXV="fx1";
  function loadFx(){
    ["meteor","boom","beam","bomb","timestop","target"].forEach(function(k){
      if(FX[k]!==undefined)return; FX[k]=null;
      cc.assetManager.loadRemote("/assets/icons/fx1/"+k+".png?v="+FXV,{ext:".png"},function(e,tex){ if(!e&&tex) FX[k]=new cc.SpriteFrame(tex); else LOG("fx 加载失败",k); });
    });
  }
  function fxSprite(R,name,key,pos,z,w,h){
    if(!FX[key])return null;
    var n=R.node(name,pos,z); if(!n)return null;
    var sp=n.addComponent(cc.Sprite); sp.sizeMode=cc.Sprite.SizeMode.CUSTOM; sp.spriteFrame=FX[key];
    n.setContentSize(w,h||w); return n;
  }
  function kill(n){ return function(){ if(n&&n.isValid)n.destroy(); }; }
  function patchFx(){
    var R=window.__selectedItemRuntime; if(!R||!R.node||!R.meteor)return false;
    if(R.__fixFx)return true;
    loadFx();
    var o={impact:R.impact, meteor:R.meteor, laser:R.laser, bombArmed:R.bombArmed, timeStop:R.timeStop};
    R.impact=function(pos,color){
      var b=fxSprite(R,"fxBoom","boom",pos,426,180);
      if(!b) return o.impact.apply(R,arguments);
      b.scale=.25; b.angle=Math.random()*360;
      cc.tween(b).to(.12,{scale:1.05},{easing:"quadOut"}).to(.28,{scale:1.25,opacity:0}).call(kill(b)).start();
      R.drawRing(pos,color||cc.color(255,150,60),40,6,380,0);
    };
    R.meteor=function(target,index,onHit){
      if(!FX.meteor) return o.meteor.apply(R,arguments);
      var token=R.roundToken();
      var warn=fxSprite(R,"fxMeteorWarn","target",target,360,96);
      if(warn){ warn.scale=1.4; warn.opacity=60; cc.tween(warn).to(.5,{scale:.75,opacity:235}).call(kill(warn)).start(); }
      var off=((index*47)%121)-60;
      var start=cc.v2(target.x+off,cc.winSize.height/2+120);
      var m=fxSprite(R,"fxMeteor","meteor",start,410,220);
      if(!m) return;
      m.angle=Math.atan2(target.x-start.x, start.y-target.y)*180/Math.PI;   // 尾巴朝来的方向
      cc.tween(m).to(.5,{x:target.x,y:target.y+30},{easing:"quadIn"}).call(function(){
        kill(m)();
        if(!R.fxValid(token))return;
        R.impact(target,cc.color(255,145,60));
        if(onHit)onHit();
      }).start();
    };
    R.laser=function(from,to){
      if(!FX.beam) return o.laser.apply(R,arguments);
      var dx=to.x-from.x, dy=to.y-from.y, len=Math.sqrt(dx*dx+dy*dy)||1;
      var mid=cc.v2((from.x+to.x)/2,(from.y+to.y)/2);
      var b=fxSprite(R,"fxBeam","beam",mid,431,len,54);
      if(b){
        b.angle=Math.atan2(dy,dx)*180/Math.PI; b.scaleY=.2; b.opacity=0;
        cc.tween(b).to(.05,{opacity:255,scaleY:1.15}).to(.1,{scaleY:.9}).delay(.08).to(.2,{opacity:0,scaleY:.15}).call(kill(b)).start();
      }
      R.drawRing(from,cc.color(255,120,170),22,6,260,0);
      R.impact(to,cc.color(255,80,140));
    };
    R.bombArmed=function(pos,index){
      if(!FX.bomb||!FX.target) return o.bombArmed.apply(R,arguments);
      var token=R.roundToken();
      var ring=fxSprite(R,"fxBombRing","target",pos,370,150);
      if(ring){ ring.opacity=200; cc.tween(ring).to(2,{scale:.3,opacity:90},{easing:"quadIn"}).start(); cc.tween(ring).by(2,{angle:180}).start(); }
      var bomb=fxSprite(R,"fxBomb","bomb",pos,390,72);
      if(bomb) cc.tween(bomb).repeat(8,cc.tween().to(.12,{scale:1.12}).to(.12,{scale:.95})).start();
      return {token:token, explode:function(){
        kill(ring)(); kill(bomb)();
        if(!R.fxValid(token))return false;
        var big=fxSprite(R,"fxBombBoom","boom",pos,430,230);
        if(big){ big.scale=.2; cc.tween(big).to(.15,{scale:1.1},{easing:"quadOut"}).to(.3,{scale:1.35,opacity:0}).call(kill(big)).start(); }
        else R.impact(pos,cc.color(255,120,55));
        R.drawRing(pos,cc.color(255,170,80),60,8,420,0);
        return true;
      }};
    };
    R.timeStop=function(player,duration){
      var r=o.timeStop.apply(R,arguments);
      try{ cc.find("Canvas").children.forEach(function(ch){ if(ch&&ch.name==="timeStopOverlay")ch.destroy(); }); }catch(_){}
      var pos=R.canvasPoint(player)||cc.v2(0,0);
      var c=fxSprite(R,"fxTimeStop","timestop",cc.v2(pos.x,pos.y+60),980,320,234);
      if(c){ c.scale=.3; c.opacity=0; cc.tween(c).to(.2,{scale:1.1,opacity:255},{easing:"backOut"}).by(.8,{angle:-30}).to(.35,{scale:1.4,opacity:0}).call(kill(c)).start(); }
      return r;
    };
    R.__fixFx=true; return true;
  }

  // ---------- 8. 亡命同归：带走对手身上的道具效果 ----------
  function stripItems(n){
    if(!n||!n.isValid)return false;
    var hc=n.getComponent("HumanController"); if(!hc)return false;
    ["__atkBuffEnd","__berserkEnd","__flyEnd","__bigEnd","__reflectEnd","__reflectActive","__reflectOnce",
     "__bloodthirstReady","__hunterReady","__counterReady","__counterStrike","__triplecast",
     "__totemReady","__invincibleEnd","__infSkillEnd"].forEach(function(k){ try{ delete hc[k]; }catch(_){} });
    ["__infSkillEnd","__feathered","__bloodthirstReady"].forEach(function(k){ try{ delete n[k]; }catch(_){} });
    hc.onceShield=0; hc.isInvincible=false; hc.isShieldInvincible=false;
    try{ n.getComponent("Human").offShieldsNode(); }catch(_){}
    var body=n.getChildByName("body");
    if(body)["totemHalo","reflectAura","reflect5sAura","goldenDome","bloodAura"].forEach(function(k){ var c=body.getChildByName(k); if(c&&c.isValid)c.destroy(); });
    try{ if(window.__toastNearPlayer)window.__toastNearPlayer("💥 道具被带走!",n,new cc.Color(255,120,80),26); }catch(_){}
    LOG("亡命同归带走道具", n.name); return true;
  }

  // ---------- 9. 缴械期间不能出小招/大招；无限小招 ----------
  function hcOf(js){ var n=js&&js.human2&&js.human2.node; return n&&n.isValid?n.getComponent("HumanController"):null; }
  function patchJoyAtk(){
    var J=req("JoyStick"); var P=J&&J.default&&J.default.prototype; if(!P)return false; if(P.__fixAtk)return true;
    ["showattack","showbigs"].forEach(function(k){
      var o=P[k];
      P[k]=function(){ var h=hcOf(this); if(h&&h.__disarmEnd>Date.now())return; return o.apply(this,arguments); };
    });
    P.__fixAtk=true;
    // 武器 update 每帧用 skillTimer/skillInverter 重算 attackProgress，只设 attackProgress 会被覆盖 → 直接把计时拉满
    cc.director.on(cc.Director.EVENT_BEFORE_UPDATE,function(){
      try{
        if(!ready())return; var cn=cc.find("Canvas"); if(!cn)return; var now=Date.now();
        cn.getComponentsInChildren("JoyStick").forEach(function(js){
          var n=js.human2&&js.human2.node, w=js._weapons; if(!n||!n.isValid||!(n.__infSkillEnd>now)||!w)return;
          if(w.SkillNumber==null&&w.skillInverter>0&&!(w.skillTimer>=w.skillInverter))w.skillTimer=w.skillInverter;
          w.attackProgress=1;
        });
      }catch(_){}
    });
    return true;
  }

  // ---------- 10. 全屏卡顿：限制画布像素量（约 1920×1080） ----------
  var MAXPX=2.1e6;
  function capRes(){
    try{
      var w=window.innerWidth||1, h=window.innerHeight||1;
      var r=Math.max(.5,Math.min(2,Math.sqrt(MAXPX/(w*h))));
      if(Math.abs((cc.view._maxPixelRatio||2)-r)<.01)return;
      cc.view._maxPixelRatio=r; cc.view.enableRetina(true);
      if(cc.view._resizeEvent) cc.view._resizeEvent(true);
      LOG("画布像素比", r.toFixed(2), w+"x"+h);
    }catch(e){ LOG("capRes err", e&&e.message); }
  }
  function installRes(){
    if(!window.cc||!cc.view||!cc.game||!cc.game.canvas)return false;
    var t=0; function later(){ clearTimeout(t); t=setTimeout(capRes,60); }
    window.addEventListener("resize",later);
    ["fullscreenchange","webkitfullscreenchange"].forEach(function(e){ document.addEventListener(e,later); });
    capRes(); return true;
  }

  // ---------- 11. 新道具：黑洞 210 / 冰冻地面 211 / 磁铁 212 / 无限小招 213 ----------
  var NEW_ITEMS=[
    {state:210,emoji:"🌀",name:"黑洞",short:"吸住对手",detail:"在对手身边生成黑洞，3 秒内把对手往中心吸，每 0.5 秒造成 3 点伤害",icon:"/assets/icons/new1/item_blackhole.png"},
    {state:211,emoji:"🧊",name:"冰冻地面",short:"对手打滑",detail:"对手脚下结冰 6 秒，停不下来、一直打滑",icon:"/assets/icons/new1/item_icefloor.png"},
    {state:212,emoji:"🧲",name:"磁铁",short:"吸走道具",detail:"把场上所有道具吸到自己身边",icon:"/assets/icons/new1/item_magnet.png"},
    {state:213,emoji:"♾️",name:"无限小招",short:"小招无冷却",detail:"6 秒内小招没有冷却，可以一直放",icon:"/assets/icons/new1/item_infskill.png"},
    {state:214,emoji:"👟",name:"弹跳鞋",short:"落地震飞",detail:"8 秒内跳得更高，每次重重落地震开身边的对手",icon:"/assets/icons/new1/item_bounce.png"},
    {state:215,emoji:"🔫",name:"缩小射线",short:"对手变小",detail:"射中对手，让他变小 8 秒，武器也跟着变短",icon:"/assets/icons/new1/item_shrinkray.png"},
    {state:216,emoji:"📍",name:"地刺陷阱",short:"埋 3 根刺",detail:"在脚下埋 3 根地刺，15 秒内对手踩到被弹飞并扣血",icon:"/assets/icons/new1/item_spikes.png"},
    {state:217,emoji:"🪃",name:"回旋镖",short:"打两下",detail:"扔出回旋镖飞向对手再飞回来，去回各能打中一次",icon:"/assets/icons/new1/item_boomerang.png"}
  ];
  function hurt(n,dmg,vx,vy){
    var hc=n&&n.isValid&&n.getComponent("HumanController"); if(!hc||hc.isDead||hc.isInvincible||hc.isShieldInvincible||hc.__phoenixInvuln||hc.__totemInvuln)return false;
    if(hc.onceShield>0){ hc.onceShield--; if(hc.onceShield<=0){ try{n.getComponent("Human").offShieldsNode();}catch(_){} } hc.isShieldInvincible=true; hc.isSlowShieldTimer=.2; return false; }
    // dmg = 最大生命的百分比
    var cut=Math.max(1,Math.round((hc.maxhp||100)*dmg/100)); hc.hp-=cut;
    try{ hc.flash(); hc.HealthBar.getComponent(cc.ProgressBar).progress=Math.max(0,hc.hp)/hc.maxhp; hc.showHp(); }catch(_){}
    popText(n,"-"+dmg+"%");
    if(!(hc.hp>0)) forceDeath(hc);
    if(vx!==undefined) n.getComponentsInChildren(cc.RigidBody).forEach(function(rb){ rb.linearVelocity=cc.v2(vx,vy); });
    return true;
  }
  function passiveOf(n){ var gm=games(), P=window.__passives||{}; return gm&&n===gm.player?P.p1:(gm&&n===gm.enemy?P.p2:null); }
  function bounceShoes(me){
    var R=window.__selectedItemRuntime, tok=roundTok(), t0=Date.now();
    me.__bounceEnd=t0+8000;
    var body=me.getChildByName("body"), rb=body&&body.getComponent(cc.RigidBody); if(!rb)return;
    var prev=0, air=false, peakFall=0;
    try{ if(window.__toastNearPlayer)window.__toastNearPlayer("👟 弹跳鞋!",me,new cc.Color(255,140,90),26); }catch(_){}
    var iv=setInterval(function(){
      if(Date.now()>me.__bounceEnd||!me.isValid||roundTok()!==tok){ clearInterval(iv); return; }
      var vy=rb.linearVelocity.y;
      if(!air&&prev<=80&&vy>260){ air=true; peakFall=0; me.getComponentsInChildren(cc.RigidBody).forEach(function(r){ var v=r.linearVelocity; r.linearVelocity=cc.v2(v.x,v.y*1.4); }); }
      if(vy<peakFall)peakFall=vy;
      if(air&&peakFall<-380&&vy>-60){
        air=false;
        var p=bodyPos(me), opp=oppOf(me), cp=canvasPt(me);
        if(cp&&R){ R.drawRing(cc.v2(cp.x,cp.y-60),cc.color(255,200,90),60,10,420,0); R.drawRing(cc.v2(cp.x,cp.y-60),cc.color(255,120,60),30,6,320,80); }
        var q=bodyPos(opp);
        if(p&&q&&cc.Vec2.distance(p,q)<280) hurt(opp,6,(q.x>p.x?1:-1)*650,750);
      }
      if(vy>260&&prev<=80)air=true;
      prev=vy;
    },30);
  }
  function shrinkRay(me){
    var opp=oppOf(me), R=window.__selectedItemRuntime; if(!opp||!opp.isValid||!R)return;
    var a=canvasPt(me), b=canvasPt(opp);
    if(a&&b&&R.laser){ try{ R.laser(a,b); }catch(_){} }
    if(passiveOf(opp)==="spikeImmune"){ try{ window.__toastNearPlayer&&window.__toastNearPlayer("🛡 免疫",opp,new cc.Color(255,230,120),24); }catch(_){} return; }
    try{ R.applyScaleRoll(opp,"shrink",2,8000); opp.__shrunk=false; opp.__rayShrunkEnd=Date.now()+8000; }catch(e){ LOG("缩小射线出错",e&&e.message); }
    try{ window.__toastNearPlayer&&window.__toastNearPlayer("🔫 变小了!",opp,new cc.Color(200,140,255),26); }catch(_){}
  }
  function spikeTrap(me){
    var R=window.__selectedItemRuntime, cn=cc.find("Canvas"), tok=roundTok(), p=bodyPos(me); if(!p||!cn)return;
    var spikes=[-90,0,90].map(function(dx){
      var w=cc.v2(p.x+dx,p.y-70), cp=cn.convertToNodeSpaceAR(w);
      var n=FX2.spike&&R?fxSpriteF(R,"fxSpike",FX2.spike,cp,290,100,120):null;
      if(n){ n.scaleY=0; n.anchorY=0; n.setPosition(cp.x,cp.y-45); cc.tween(n).to(.2,{scaleY:1},{easing:"backOut"}).start(); }
      return {w:w,n:n,used:false};
    });
    var t0=Date.now(), armAt=t0+600;
    var iv=setInterval(function(){
      var now=Date.now();
      var end=now-t0>15000||roundTok()!==tok||spikes.every(function(s){return s.used;});
      if(end){ clearInterval(iv); spikes.forEach(function(s){ if(s.n&&s.n.isValid)cc.tween(s.n).to(.25,{scaleY:0,opacity:0}).call(kill(s.n)).start(); }); return; }
      if(now<armAt)return;
      var opp=oppOf(me); if(!opp||!opp.isValid)return;
      var feet=[]; opp.getComponentsInChildren(cc.RigidBody).forEach(function(rb){ var q=cc.v2(); rb.getWorldPosition(q); feet.push(q); });
      if(now-(spikeTrap.last||0)<800)return;   // 一次只扎一根
      spikes.forEach(function(s){
        if(s.used||now-(spikeTrap.last||0)<800)return;
        if(feet.some(function(q){ return Math.abs(q.x-s.w.x)<55&&Math.abs(q.y-s.w.y)<90; })){
          s.used=true; spikeTrap.last=now; hurt(opp,10,(Math.random()<.5?-1:1)*200,1100);
          if(s.n&&s.n.isValid){ cc.tween(s.n).to(.08,{scaleY:1.5}).to(.2,{scaleY:0,opacity:0}).call(kill(s.n)).start(); }
          try{ R&&R.impact(cn.convertToNodeSpaceAR(s.w),cc.color(220,220,230)); }catch(_){}
        }
      });
    },40);
  }
  function boomerang(me){
    var R=window.__selectedItemRuntime, cn=cc.find("Canvas"), tok=roundTok(); if(!R||!cn||!FX2.boomerang)return;
    var opp=oppOf(me); if(!opp)return;
    var n=fxSpriteF(R,"fxBoomerang",FX2.boomerang,canvasPt(me)||cc.v2(0,0),415,110); if(!n)return;
    var t0=Date.now(), dur=1800, hits={out:false,back:false}, start=canvasPt(me);
    var iv=setInterval(function(){
      var k=(Date.now()-t0)/dur;
      if(k>=1||roundTok()!==tok||!me.isValid){ clearInterval(iv); if(n.isValid)n.destroy(); return; }
      var a=canvasPt(me)||start, b=canvasPt(opp)||a;
      var leg=k<.5?"out":"back", u=k<.5?k*2:(k-.5)*2;
      var from=leg==="out"?start:b, to=leg==="out"?b:a;
      if(leg==="back"&&!hits.__b0){ hits.__b0=true; hits.bpos=n.getPosition(); }
      if(leg==="back")from=hits.bpos;
      var e=u*u*(3-2*u), arc=Math.sin(u*Math.PI)*90*(leg==="out"?1:-1);
      n.setPosition(from.x+(to.x-from.x)*e, from.y+(to.y-from.y)*e+arc);
      n.angle-=28;
      if(!hits[leg]&&b){ var d=cc.Vec2.distance(n.getPosition(),b); if(d<90){ hits[leg]=true; var dir=(b.x>a.x?1:-1)*(leg==="out"?1:-1); hurt(opp,8,dir*500,450); try{R.impact(b,cc.color(255,170,80));}catch(_){} } }
    },30);
    try{ window.__toastNearPlayer&&window.__toastNearPlayer("🪃 回旋镖!",me,new cc.Color(255,180,90),26); }catch(_){}
  }
  function oppOf(n){ var gm=games(); if(!gm)return null; return n===gm.player?gm.enemy:(n===gm.enemy?gm.player:null); }
  function canvasPt(n){ var p=bodyPos(n); var cn=cc.find("Canvas"); return p&&cn?cn.convertToNodeSpaceAR(p):null; }
  function roundTok(){ var gm=games(); return gm&&gm.__roundStart; }
  function blackHole(me){
    var opp=oppOf(me); if(!opp||!opp.isValid)return;
    var R=window.__selectedItemRuntime, cn=cc.find("Canvas"), tok=roundTok();
    var cw=bodyPos(opp); if(!cw)return; var center=cc.v2(cw.x+(Math.random()<.5?-1:1)*90, cw.y+30);
    var cp=cn.convertToNodeSpaceAR(center);
    var v=FX2.blackhole&&R?fxSpriteF(R,"fxBlackHole",FX2.blackhole,cp,400,260):null;
    if(v){ v.scale=.1; cc.tween(v).to(.3,{scale:1},{easing:"backOut"}).start(); cc.tween(v).by(3.3,{angle:-720}).start(); }
    var t0=Date.now(), lastHit=0;
    var iv=setInterval(function(){
      var now=Date.now();
      if(now-t0>3000||!opp.isValid||roundTok()!==tok){ clearInterval(iv); if(v&&v.isValid)cc.tween(v).to(.25,{scale:0,opacity:0}).call(kill(v)).start(); return; }
      var hc=opp.getComponent("HumanController"); if(!hc||hc.isDead)return;
      opp.getComponentsInChildren(cc.RigidBody).forEach(function(rb){
        var q=cc.v2(); rb.getWorldPosition(q); var d=center.sub(q), L=d.mag()||1;
        var sp=Math.min(900,L*4); var lv=rb.linearVelocity;
        rb.linearVelocity=cc.v2(lv.x*.6+d.x/L*sp*.4, lv.y*.6+d.y/L*sp*.4);
      });
      if(now-lastHit>=500){ lastHit=now; try{ hc.setDamage(3,true); }catch(_){} }
    },50);
  }
  function iceFloor(me){
    var opp=oppOf(me); if(!opp||!opp.isValid)return;
    var R=window.__selectedItemRuntime, tok=roundTok(), body=opp.getChildByName("body"), rb=body&&body.getComponent(cc.RigidBody);
    var cols=opp.getComponentsInChildren(cc.PhysicsCollider), saved=cols.map(function(c){return c.friction;});
    cols.forEach(function(c){ c.friction=0; try{c.apply();}catch(_){} });
    var ice=FX2.ice&&R?fxSpriteF(R,"fxIce",FX2.ice,canvasPt(opp)||cc.v2(0,0),300,220,110):null;
    if(ice){ ice.opacity=0; cc.tween(ice).to(.2,{opacity:230}).start(); }
    try{ if(window.__toastNearPlayer)window.__toastNearPlayer("🧊 脚下结冰!",opp,new cc.Color(150,220,255),26); }catch(_){}
    var last=0, t0=Date.now();
    var iv=setInterval(function(){
      if(Date.now()-t0>6000||!opp.isValid||roundTok()!==tok){
        clearInterval(iv); cols.forEach(function(c,i){ if(c&&c.isValid!==false){ c.friction=saved[i]; try{c.apply();}catch(_){} } });
        if(ice&&ice.isValid)cc.tween(ice).to(.3,{opacity:0}).call(kill(ice)).start(); return;
      }
      if(!rb)return;
      var v=rb.linearVelocity;
      // 停不下来：速度掉得太快就补回一部分惯性
      if(Math.abs(last)>40&&Math.abs(v.x)<Math.abs(last)*.85){ var nv=last*.94; opp.getComponentsInChildren(cc.RigidBody).forEach(function(r){ r.linearVelocity=cc.v2(nv,r.linearVelocity.y); }); last=nv; }
      else last=v.x;
      if(ice&&ice.isValid){ var p=canvasPt(opp); if(p)ice.setPosition(p.x,p.y-95); }
    },50);
  }
  function magnet(me){
    var cn=cc.find("Canvas"), root=cn&&cn.getChildByName("Items"); if(!root)return;
    var items=root.children.filter(function(n){return n&&n.isValid&&n.active&&n.name==="BuffItem";});
    var t0=Date.now();
    var iv=setInterval(function(){
      var k=Math.min(1,(Date.now()-t0)/700); var tw=bodyPos(me); if(!tw||!me.isValid){clearInterval(iv);return;}
      var tp=root.convertToNodeSpaceAR(tw);
      items.forEach(function(n){
        if(!n.isValid||!n.active)return; var p=n.getPosition();
        n.setPosition(p.x+(tp.x-p.x)*(.15+.6*k), p.y+(tp.y-p.y)*(.15+.6*k));
        var rb=n.getComponent(cc.RigidBody); if(rb){ try{rb.syncPosition(true);}catch(_){} rb.linearVelocity=cc.v2(0,0); }
      });
      if(k>=1)clearInterval(iv);
    },40);
    try{ if(window.__toastNearPlayer)window.__toastNearPlayer("🧲 道具都过来!",me,new cc.Color(255,120,120),26); }catch(_){}
    LOG("磁铁", items.length);
  }
  function infSkill(me){
    me.__infSkillEnd=Date.now()+6000;
    var hc=me.getComponent("HumanController"); if(hc)hc.__infSkillEnd=me.__infSkillEnd;
    try{ if(window.__toastNearPlayer)window.__toastNearPlayer("♾️ 小招无限!",me,new cc.Color(255,190,90),26); }catch(_){}
  }
  var FX2={};
  function fxSpriteF(R,name,frame,pos,z,w,h){ var n=R.node(name,pos,z); if(!n)return null; var sp=n.addComponent(cc.Sprite); sp.sizeMode=cc.Sprite.SizeMode.CUSTOM; sp.spriteFrame=frame; n.setContentSize(w,h||w); return n; }
  function patchNewItems(){
    if(!window.__applyItemToOne||!window.__itemIcons||!window.__itemTextureCache||!window.__ITEM_DATA)return false;
    if(!patchNewItems.done){
      patchNewItems.done=true;
      [["blackhole","fx_blackhole"],["ice","fx_ice"],["spike","fx_spike"],["boomerang","fx_boomerang"]].forEach(function(x){ cc.assetManager.loadRemote("/assets/icons/new1/"+x[1]+".png",{ext:".png"},function(e,t){ if(!e&&t)FX2[x[0]]=new cc.SpriteFrame(t); }); });
      NEW_ITEMS.forEach(function(it){
        window.__itemIcons[it.state]=it.icon; if(window.__guideThumbs)window.__guideThumbs[it.state]=it.icon;
        cc.assetManager.loadRemote(it.icon,{ext:".png"},function(e,t){ if(!e&&t)window.__itemTextureCache[it.state]=new cc.SpriteFrame(t); else LOG("新道具图标失败",it.state); });
      });
      var prev=window.__applyItemToOne;
      window.__applyItemToOne=function(state,n){
        var f={210:blackHole,211:iceFloor,212:magnet,213:infSkill,214:bounceShoes,215:shrinkRay,216:spikeTrap,217:boomerang}[state];
        if(!f) return prev.apply(this,arguments);
        if(!n||!n.isValid)return;
        try{ if(window.__showItemToast)window.__showItemToast(state,n); }catch(_){}
        try{ f(n); }catch(e){ LOG("新道具出错",state,e&&e.message); }
      };
      // 道具数据会被异步覆盖：一直保证新道具在列表里
      setInterval(function(){
        var D=window.__ITEM_DATA; if(!D)return;
        NEW_ITEMS.forEach(function(it){ if(!D.some(function(x){return x.state===it.state;})) D.push({state:it.state,emoji:it.emoji,name:it.name,short:it.short,detail:it.detail}); });
      },1000);
    }
    return true;
  }


  // ---------- 12. 拾取修复：效果加到真正的人身上；没吃成的道具恢复可吃；傀儡加强 ----------
  function resolveHuman(n){
    var p=n;
    for(var i=0;i<6&&p&&p.isValid;i++,p=p.parent){
      if(p.getComponent("HumanController"))return p;
      var cs=p.getComponents(cc.Component);
      for(var j=0;j<cs.length;j++){ var h=cs[j].human; if(h&&h.isValid&&h.getComponent&&h.getComponent("HumanController"))return h; if(h&&h.node&&h.node.isValid&&h.node.getComponent("HumanController"))return h.node; }
    }
    return n;
  }
  function patchPickup(){
    if(!window.__applyItemToOne||!patchNewItems.done)return false;
    if(!window.__applyItemToOne.__fixHuman){
      var prev=window.__applyItemToOne;
      window.__applyItemToOne=function(state,n){ var a=[].slice.call(arguments); a[1]=resolveHuman(n); return prev.apply(this,a); };
      window.__applyItemToOne.__fixHuman=true;
    }
    var cn=cc.find("Canvas"), root=cn&&cn.getChildByName("Items");
    var bi=root&&root.children.filter(function(n){return n.name==="BuffItem"||n.name==="BuffItems";})[0];
    var comp=bi&&bi.getComponents(cc.Component).filter(function(c){return c.iconAll!==undefined;})[0];
    if(!comp)return false;
    var P=Object.getPrototypeOf(comp); if(P.__fixPick)return true;
    if(!P.__bipProtoPatched)return false;          // 等原补丁先装好
    var o=P.onBeginContact;
    P.onBeginContact=function(e,t,c){
      var gen=this.__pickupGeneration, self=this;
      var r=o.apply(this,arguments);
      if(this.__pickupConsumed){
        setTimeout(function(){
          // 被标记“已吃”但人没吃到（道具还在场上、同一批次）→ 恢复可吃
          if(self.node&&self.node.isValid&&self.node.activeInHierarchy&&self.__pickupGeneration===gen&&self.node.parent&&self.node.parent.name==="Items"){
            self.__pickupConsumed=false; LOG("道具恢复可吃", self.state);
          }
        },150);
      }
      return r;
    };
    P.__fixPick=true; return true;
  }
  // ---------- 剑气大招：飞剑碰到人后每 0.1s 再打一次，人被推到墙上就被钉住连打（秒人）→ 每把剑对同一个人最多 3 下（间隔≥0.2s），打满后穿过 ----------
  var ACE_MAX=3, ACE_GAP=200;
  function patchSwordAce(){
    var M=req("SwordAce"), P=M&&M.default&&M.default.prototype; if(!P)return false; if(P.__fixAce)return true;
    var sv=P.setVec, bc=P.onBeginContact;
    P.setVec=function(){ this.__aceHit={}; return sv.apply(this,arguments); };
    P.onBeginContact=function(e,t,o){
      try{
        var g=o&&o.node&&o.node.group;
        if(g==="player1"||g==="player2"||g==="suverenemy"){
          var who=o.node.parent, id=who&&(who.uuid||who._id);
          var H=this.__aceHit||(this.__aceHit={});
          var h=id&&H[id]||{n:0,t:0}, now=Date.now();
          if(h.n>=ACE_MAX){ if(e)e.disabled=true; return; }     // 打满了：直接穿过，不再钉人
          if(now-h.t<ACE_GAP)return;                             // 两下之间至少隔 0.2s
          var before=this.damageInverter;
          var r=bc.apply(this,arguments);
          if(id&&before>=.1&&this.damageInverter===0){ h.n++; h.t=now; H[id]=h; }   // 这次真的打中了
          return r;
        }
      }catch(_){}
      return bc.apply(this,arguments);
    };
    P.onPreSolve=function(e,t,o){
      try{ var g=o&&o.node&&o.node.group, who=o&&o.node&&o.node.parent, id=who&&(who.uuid||who._id);
        if((g==="player1"||g==="player2"||g==="suverenemy")&&id&&this.__aceHit&&this.__aceHit[id]&&this.__aceHit[id].n>=ACE_MAX&&e)e.disabled=true; }catch(_){}
    };
    P.__aceOrig={setVec:sv,onBeginContact:bc}; P.__fixAce=true; LOG("剑气大招每剑每人最多3下"); return true;
  }
  function patchSummon(){
    var S=window.__directGuideSummon; if(!S||!S.spawn)return false; if(S.__fix)return true;
    var o=S.spawn;
    S.spawn=function(){
      var r=o.apply(this,arguments);
      try{ cc.find("Canvas").getComponentsInChildren("HumanController").forEach(function(h){
        if(h.isAllySummon&&!h.__fixBuff){ h.__fixBuff=true; h.maxhp=Math.max(60,h.maxhp); h.hp=h.maxhp; }
      }); }catch(_){}
      return r;
    };
    S.__fix=true; return true;
  }


  // ---------- 13. 道具外观：吃了道具身上长出对应的光环/翅膀等（按状态每帧跟随） ----------
  var AU={}, AUV="aura1", AURA_ALL=[];
  // [贴图, 判定, 尺寸, 相对躯干的 y 偏移, 层]
  var AURAS=[
    ["wings",   function(n,h,t){return h.__flyEnd>t;},                         230,10, -1],
    ["feather", function(n,h,t){return n.__feathered;},                         170,0,  -1],
    ["dome",    function(n,h,t){return h.isInvincible;},                        230,0,  2],
    ["shield",  function(n,h,t){return h.onceShield>0;},                        190,0,  2],
    ["frost",   function(n,h,t){return (n.__frostUntil>t)||(n.__frostlordUntil>t);},190,0,2],
    ["thorns",  function(n,h,t){return h.__reflectActive||h.__reflectEnd>t;},   200,0,  1],
    ["flame",   function(n,h,t){return h.__atkBuffEnd>t;},                      180,-70,-1],
    ["rage",    function(n,h,t){return h.__berserkEnd>t;},                      210,0,  1],
    ["blood",   function(n,h,t){return h.__bloodthirstReady;},                  170,0,  1],
    ["totem",   function(n,h,t){return h.__totemReady&&!h.__totemUsed;},        130,150,3],
    ["silence", function(n,h,t){return h.__silenced;},                          130,150,3],
    ["invert",  function(n,h,t){return n.__invertControlEnd>t;},                130,150,3],
    ["disarm",  function(n,h,t){return h.__disarmEnd>t;},                       130,150,3],
    ["infinity",function(n,h,t){return n.__infSkillEnd>t;},                     150,-100,3]
  ];
  function loadAura(){
    AURAS.forEach(function(a){ var k=a[0]; if(AU[k]!==undefined)return; AU[k]=null;
      cc.assetManager.loadRemote("/assets/icons/aura1/"+k+".png?v="+AUV,{ext:".png"},function(e,tex){ if(!e&&tex) AU[k]=new cc.SpriteFrame(tex); else LOG("aura 加载失败",k); });
    });
  }
  function auraTick(){
    try{
      var gm=games(), R=window.__selectedItemRuntime; if(!gm||!R||!R.canvas)return;
      var cv=R.canvas(); if(!cv)return; var t=Date.now();
      // 上一回合的人没了 → 它的光环也删掉
      AURA_ALL=AURA_ALL.filter(function(s){ if(!s.isValid)return false; var o=s.__owner; if(!o||!o.isValid||(o!==gm.player&&o!==gm.enemy)){ s.destroy(); return false; } return true; });
      [gm.player,gm.enemy].forEach(function(n){
        if(!n||!n.isValid)return; var h=n.getComponent("HumanController"); if(!h)return;
        var store=n.__auraNodes||(n.__auraNodes={});
        var body=n.getChildByName("body");
        if(body){ ["totemHalo","invertAura"].forEach(function(k){ var c=body.getChildByName(k); if(c&&c.active&&AU.totem)c.active=false; }); }
        var pos=null; try{ pos=R.canvasPoint(n); }catch(_){}
        var dead=h.isDead||!(h.hp>0)||!n.activeInHierarchy;
        var stack=0;
        AURAS.forEach(function(a){
          var k=a[0], on=false; try{ on=!dead&&!!a[1](n,h,t); }catch(_){}
          var s=store[k];
          if(!on||!pos||!AU[k]){ if(s&&s.isValid&&s.active)s.active=false; return; }
          if(!s||!s.isValid||s.parent!==cv){
            s=new cc.Node("aura_"+k); s.parent=cv; s.zIndex=a[4]<0?250:420;
            var sp=s.addComponent(cc.Sprite); sp.sizeMode=cc.Sprite.SizeMode.CUSTOM; sp.spriteFrame=AU[k];
            s.setContentSize(a[2],a[2]); s.__born=t; s.__owner=n; store[k]=s; AURA_ALL.push(s);
          }
          if(!s.active){ s.active=true; s.__born=t; }
          var age=(t-s.__born)/1000, y=a[3];
          // 头顶小图标并排
          var x=0; if(a[4]===3&&a[3]>100){ x=stack*135; stack++; }
          s.setPosition(pos.x+x, pos.y+y+(a[4]===3?Math.sin(age*4)*5:0));
          var pop=Math.min(1,age*5);
          var pulse=1+Math.sin(age*5)*0.05;
          s.scale=(0.4+0.6*pop)*pulse;
          if(k==="wings") s.scaleY=s.scale*(1+Math.sin(age*14)*0.12);
          if(k==="dome"||k==="frost"||k==="thorns"||k==="rage"||k==="blood") s.angle=age*40%360;
          s.opacity=(k==="dome"||k==="shield")?200:235;
        });
        // 头顶图标居中
        if(stack>1){ var off=(stack-1)*135/2; AURAS.forEach(function(a){ var s=store[a[0]]; if(a[4]===3&&a[3]>100&&s&&s.isValid&&s.active) s.x-=off; }); }
      });
    }catch(e){ LOG("aura err", e&&e.message); }
  }
  function installAura(){
    if(!window.__selectedItemRuntime||!games())return false;
    if(window.__fixAura)return true;
    loadAura(); cc.director.on(cc.Director.EVENT_AFTER_UPDATE, auraTick);
    window.__fixAura=true; return true;
  }

  // ---------- 5. 去掉死亡慢动作：0 血立刻结算 ----------
  function patchCamera(){
    var CM=req("CameraCtrl"); var P=CM&&CM.default&&CM.default.prototype; if(!P)return false;
    if(P.__fixR1)return true;
    P.setTarget=function(e,t,o){
      try{ cc.director.getScheduler().setTimeScale(1); cc.PhysicsManager.FIXED_TIME_STEP=1/60; cc.director.getPhysicsManager().enabledAccumulator=false; }catch(_){}
      if(e==1)this.target=null; else if(e==2)this.target2=null;
      this.isDeadCamera=false; this.isDeadTarget=null; this.callback=null;
      if(typeof o==="function"){ try{ o(); }catch(err){ LOG("death cb err", err&&err.message); } }
    };
    P.__fixR1=true; return true;
  }

  // ---------- 安装 ----------
  var done={audio:false,items:false,big:false,cam:false,joy:false,bundle:false,fx:false,atk:false,res:false,newi:false,sum:false,aura:false};
  var t=setInterval(function(){
    if(!ready())return;
    if(!done.audio) done.audio=patchAudio();
    if(!done.items) done.items=patchItems();
    if(!done.big) done.big=patchBigSkill();
    if(!done.cam) done.cam=patchCamera();
    if(!done.joy) done.joy=patchJoy();
    if(!done.bundle) done.bundle=patchBundle();
    if(!done.fx) done.fx=patchFx();
    if(!done.atk) done.atk=patchJoyAtk();
    if(!done.res) done.res=installRes();
    if(!done.newi) done.newi=patchNewItems();
    if(!done.ace) done.ace=patchSwordAce();
    if(!done.sum) done.sum=patchSummon();
    if(!done.aura) done.aura=installAura();
    if(done.audio&&done.items&&done.big&&done.cam&&done.joy&&done.bundle&&done.fx&&done.atk&&done.res&&done.newi&&done.sum&&done.aura){ clearInterval(t); LOG("installed"); }
  },200);
  var tp=setInterval(function(){ try{ if(ready()&&patchPickup()){ clearInterval(tp); LOG("pickup patched"); } }catch(_){} },500);

  // ---------- 拾取兜底：碰撞只在「刚碰上」那一下触发，人压着道具/道具刷在人身上就吃不到 → 身体部件在道具框里 0.25s 就走原拾取流程 ----------
  function pickupFallback(){
    try{
      if(!ready())return; var cn=cc.find("Canvas"), root=cn&&cn.getChildByName("Items"); if(!root)return;
      var gm=cn.getComponent("Games"); if(!gm||!gm.player||!gm.enemy||!gm.player.isValid||!gm.enemy.isValid)return;
      var now=Date.now(), humans=[gm.player,gm.enemy].filter(function(h){ var hc=h.getComponent("HumanController"); return hc&&!hc.isDead&&hc.hp>0; });
      root.children.forEach(function(it){
        if((it.name!=="BuffItem"&&it.name!=="BuffItems")||!it.activeInHierarchy)return;
        var comp=it.__biComp; if(!comp||!comp.isValid){ comp=it.__biComp=it.getComponents(cc.Component).filter(function(c){return c.iconAll!==undefined;})[0]; }
        if(!comp||comp.__pickupConsumed||comp.state==null)return;
        if(comp.__fbGen!==comp.__pickupGeneration){ comp.__fbGen=comp.__pickupGeneration; comp.__fbSeen=now; comp.__fbIn=0; return; }
        if(now-comp.__fbSeen<300)return;
        var bb=it.getBoundingBoxToWorld(); bb.x-=30; bb.y-=30; bb.width+=60; bb.height+=60;
        var hit=null;
        humans.forEach(function(h){ if(hit)return; h.children.forEach(function(p){
          if(hit||(p.group!=="player1"&&p.group!=="player2")||!p.activeInHierarchy)return;
          if(bb.contains(p.convertToWorldSpaceAR(cc.v2(0,0))))hit=p;
        }); });
        if(!hit){ comp.__fbIn=0; return; }
        if(!comp.__fbIn){ comp.__fbIn=now; return; }
        if(now-comp.__fbIn<250)return;   // 正常碰撞来得及就让它自己吃
        comp.__fbIn=0;
        var grp=it.group; if(grp!=="default"){ it.group="default"; }
        try{ comp.onBeginContact(null,{node:it},{node:hit}); }finally{ if(it.isValid&&grp!=="default")it.group=grp; }
        LOG("兜底拾取", comp.state);
      });
    }catch(e){ LOG("兜底拾取出错", e&&e.message); }
  }
  setInterval(pickupFallback,100);
  window.__fixR1={guardAll:guardAll, musicOn:musicOn, setMusicOn:setMusicOn, blink:blink, swapPos:swapPos, disarm:disarm, moveHumanBy:moveHumanBy, stripItems:stripItems, capRes:capRes, resolveHuman:resolveHuman, hurt:hurt, forceDeath:forceDeath, popText:popText, mainDead:mainDead};
})();

// ================= r19 武器平衡（只在双人模式） =================
// 依据 2026-11-18 战斗日志 740 局（同一把武器的 P1/P2 版本合并算）。
// 只改原版武器打人（setDamage 只传 1 个参数、伤害 <50），道具/场地/尖刺不受影响。
// 调试：__weaponBal.mult 改倍率；__weaponBal.off=true 关闭
(function(){
  if(window.__weaponBal)return;
  var W=window.__weaponBal={off:false, mult:{
    // r21：按去掉 ×4 bug 后的数据重调（lamp 5.9/s … scie 0.7/s → 尽量拉到 2~4/s）
    lamp:.7, lightsaber:.8, sniper:.75, spear:.85, lancespear:.8,
    sucette:1, iceCream:1, flail:1.4, sword:1.25, potion:1.4, boot:1.6, axe:1.3, harp:1.2, faux:1.5, grappin:1.2,
    armCannon:1.15, card:1.6, guitare:1.35, blades:1.6, scie:1.8, knife:1.5, baton:1.3, scepter:1.2, hammer:1.2
  }, cap1s:{sniper:100, bananazooka:100}};
  var hist={}; // key 武器|目标 → [{t,d}]
  function req(n){ try{ return window.__require(n); }catch(_){ return null; } }
  function is2P(){ var m=req("ConfigManager"); var c=m&&m.gameConfig; return !!(c&&c.gameChooseViewNumber==2); }
  function weaponOf(n){
    var c=cc.find("Canvas"); var js=c?c.getComponentsInChildren("JoyStick"):[];
    for(var i=0;i<js.length;i++){ var h=js[i].human2; if(h&&(h===n||h.node===n)){ var w=js[i]._weapons; return (w&&w.node&&w.node.isValid&&w.node.name)||null; } }
    return null;
  }
  var depth=0;
  function install(){
    var M=req("HumanController"), P=M&&M.default&&M.default.prototype;
    if(!P||!P.setDamage||P.setDamage.__wb)return;
    var o=P.setDamage;
    var f=function(dmg){
      if(depth>0||W.off||arguments.length!==1||!(dmg>0)||dmg>=50)return o.apply(this,arguments);
      depth++;
      try{
        if(is2P()&&this.node){
          var g=cc.find("Canvas").getComponent("Games");
          var opp=this.node===g.player?g.enemy:(this.node===g.enemy?g.player:null);
          var wn=opp&&weaponOf(opp);
          if(wn){
            var base=wn.replace(/2$/,"");
            var m=W.mult[base]; if(m)dmg=Math.max(1,Math.round(dmg*m));
            var cap=W.cap1s[base];
            if(cap){
              var key=base+"|"+this.node.name, now=Date.now(), L=(hist[key]||[]).filter(function(x){return now-x.t<1000;});
              var sum=0; L.forEach(function(x){sum+=x.d;});
              dmg=Math.min(dmg,Math.max(0,cap-sum));
              L.push({t:now,d:dmg}); hist[key]=L;
              if(dmg<=0)return;
            }
          }
        }
        return o.call(this,dmg);
      }finally{ depth--; }
    };
    f.__wb=true; P.setDamage=f;
  }
  setInterval(install,500);
})();

// ================= r21 ×4 伤害卡住 =================
// 狂暴药剂/巨人药剂/缩小射线 会把 gameConfig.player1AtkBuff/player2AtkBuff 设成 true（伤害 ×4，本应 10 秒）。
// 原版只在 buff 图标还显示时倒计时关掉；人死了、换回合、图标节点没了 → 标志永远是 true，之后每一局都 ×4（日志里 1P 伤害偏高的主因）。
// 这里：换回合/回主菜单清掉；每次打开后最多 10.5 秒强制关掉。
(function(){
  if(window.__atkBuffGuard)return;
  var G=window.__atkBuffGuard={on:{}, round:null};
  function req(n){ try{ return window.__require(n); }catch(_){ return null; } }
  setInterval(function(){
    try{
      var m=req("ConfigManager"), c=m&&m.gameConfig; if(!c)return;
      var cv=cc.find("Canvas"), g=cv&&cv.getComponent("Games");
      var rid=g&&g.player&&g.enemy&&g.player.isValid&&g.enemy.isValid?(g.player.uuid+"|"+g.enemy.uuid):null;
      var now=Date.now();
      if(rid!==G.round){ G.round=rid; G.on={}; c.player1AtkBuff=false; c.player2AtkBuff=false; return; }
      ["player1AtkBuff","player2AtkBuff"].forEach(function(k){
        if(c[k]){ if(!G.on[k])G.on[k]=now; else if(now-G.on[k]>10500){ c[k]=false; G.on[k]=0; } }
        else G.on[k]=0;
      });
    }catch(_){}
  },200);
})();
