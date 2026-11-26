// ================= 战斗日志 + 自动选被动（只在双人模式） =================
// 每局记录：场地、地图、双方被动、各武器持有时间、伤害来源、胜负、时长、致命一击来源
// 结束时 POST /api/battlelog（失败就存 localStorage，下次再发）。分析页 /battlelog
// 调试：__battlelog.last  __battlelog.queue()  __battlelog.off=true 关闭上传
(function(){
  if(window.__battlelog)return;
  var B=window.__battlelog={ver:1,last:null,off:false};
  var QKEY="stickman.battlelog.queue", NOLOG="stickman.nolog", DEV="stickman.deviceId";
  // 这台设备不记日志：网址 ?nolog=1 打开 / ?nolog=0 关闭，或者在「预选场地」面板里勾选
  try{ var mq=location.search.match(/[?&]nolog=([01])/); if(mq){ if(mq[1]==="1")localStorage.setItem(NOLOG,"1"); else localStorage.removeItem(NOLOG); } }catch(_){}
  B.noLog=function(v){ try{ if(v===undefined)return localStorage.getItem(NOLOG)==="1"; if(v)localStorage.setItem(NOLOG,"1"); else localStorage.removeItem(NOLOG); }catch(_){ } return !!v; };
  function devId(){ try{ var d=localStorage.getItem(DEV); if(!d){ d=Math.random().toString(36).slice(2,10); localStorage.setItem(DEV,d); } return d; }catch(_){ return null; } }
  function req(n){ try{ return window.__require(n); }catch(_){ return null; } }
  function cfg(){ var m=req("ConfigManager"); return m&&m.gameConfig; }
  function games(){ var c=cc.find("Canvas"); return c&&c.getComponent("Games"); }
  function valid(n){ return !!(n&&n.isValid); }
  function hcOf(n){ return valid(n)?n.getComponent("HumanController"):null; }
  function dead(n){ var h=hcOf(n); return !h||h.isDead||!(h.hp>0); }
  function joyOf(n){ var c=cc.find("Canvas"); var js=c?c.getComponentsInChildren("JoyStick"):[]; for(var i=0;i<js.length;i++){ var h=js[i].human2; if(h&&(h===n||h.node===n))return js[i]; } return null; }
  function wname(n){ var j=joyOf(n), w=j&&j._weapons; return (w&&w.node&&w.node.isValid&&w.node.name)||"空手"; }
  function round1(x){ return Math.round(x*10)/10; }

  // ---------- 自动选被动：没选的人每局随机一个 ----------
  function autoPassive(){
    var o=window.__passivesOrig, p=window.__passives, L=window.__PASSIVES;
    if(!o||!p||!L||!L.length)return;
    ["p1","p2"].forEach(function(k){
      if(!o[k])o[k]="random";
      if(!p[k]||p[k]==="random")p[k]=L[Math.floor(Math.random()*L.length)].id;
    });
  }

  // ---------- 伤害来源标记 ----------
  var cur=null;   // 本局记录
  function idxOf(node){ if(!cur)return -1; if(node===cur.n[0])return 0; if(node===cur.n[1])return 1; return -1; }
  var applyDepth=0;
  // r20 每一下伤害：SS = 正在执行的「会调 setDamage 的方法」栈
  var SS=[], HMAX=400;
  // 游戏里所有组件类名（从 index.fixr9.js 的 _RF.push 提取）
  var CLS=["AiCtrl","AkCollider","ArbaleteCollider","ArcCollider","ArenaView","ArmCannon","Arrows","AtkBuff","AudioManager","AudioView","AxeCollider","BallScale","BananaBall","BananazookaCollider","BatonCollider","BigSkillBooms","BigSkills","Blades","BladesCollider","BombCollider","BoomScale","BoomerangCollider","Boots","BootsBoom","BootsCollider","BormBall","BuffItemCollider","BulletBase","BulletFactory","CameraCtrl","CannonBall","CardCollider","CardGreen","CardPurple","CardRed","CardRedScale","ChooseView","ColorsItem","ColorsView","ConfigManager","DragonBullet","EffectManager","EndView","EnergyBall","FauxCollider","FireCollider","FlailBullet","FlailCollider","FlailLines","Games","GantBall","Gants","GantsCollider","GauntletGreen","GrappinBullet","GrappinCollider","GreenBall","GroundCollider","GuitaRed","GuitareCollider","Guncollider","HammerCollider","HarpCollider","Human","HumanController","HumanFactory","IceCreamCollider","IceMotagne","IronHandCollider","JBFireCollider","JoyStick","Jumper","KatannaCollider","KnifeCollider","LaceSpearCollider","LampCollider","LampGreen","LampPurple","LampRed","LampWall","LeaderboardItem","LeaderboardManager","LeaderboardView","LevelManager","LevelProgress","LineWidth","LinghtsaberCollider","Load","Magnit","MainCanvas","MainView","MainViewFight","NewWeaponsView","NicknameView","Normal","NormalBig","NoteGreen","NotePurple","NoteRed","PaintBox","ParticleCtrl","PickAxeCollider","Portal","PotionBall","PotionCollider","Rebound","ReboundTimer","RewardManager","RondIn","RondOut","RotatePlatform","RpgNormal","RunInCenter","RunTableCtrl","RunWith","RunWith2","SaberBall","ScepterBall","ScepterCollider","ScieCollider","ScieRunCollider","ScrollSet","ShareBoom","ShareBullet","ShieldBullet","ShieldCollider","ShotgunCollider","ShuikenBall","ShurikenCollider","SkinsItem","SkinsView","SniperCollider","SnowBullet","SpearBallCollider","SpearCollider","StartView","SucettlCollider","SuverAiWeaponsCollider","SwordAce","SwordCollider","ThorHammer","Tips","TipsManager","TranslateLbl","Turret","TurretBullet","TutorText","UpBall","UpCollider","UpQuad","UserProfile","Utils","ViewSize","WarerCollider","Weapon","WeaponFactory","WeaponManager","WeaponsItem","WeaponsView","adManager","csvManager","flyMoney","guitaRed","localConfig","nicknames"];
  function wrapSources(){
    if(B.srcWrapped)return;
    if(!cc.js.getClassByName("HumanController"))return;
    var n=0;
    CLS.forEach(function(cn){
      var C=cc.js.getClassByName(cn), P=C&&C.prototype; if(!P)return;
      Object.getOwnPropertyNames(P).forEach(function(k){
        if(k==="constructor"||(cn==="HumanController"&&k==="setDamage"))return;
        var d=Object.getOwnPropertyDescriptor(P,k); if(!d||typeof d.value!=="function"||d.value.__blSrc)return;
        var fn=d.value, src; try{ src=Function.prototype.toString.call(fn); }catch(_){ return; }
        if(src.indexOf("setDamage")<0)return;
        var w=function(){ SS.push({c:cn,f:k,o:this}); try{ return fn.apply(this,arguments); }finally{ SS.pop(); } };
        w.__blSrc=true; w.__orig=fn;
        try{ P[k]=w; n++; }catch(_){}
      });
    });
    B.srcWrapped=n||-1;
  }
  function di(c,v){ v=v==null?"":String(v); var D=c.dict, k=D.idx[v]; if(k===undefined){ k=D.list.length; D.list.push(v); D.idx[v]=k; } return k; }
  function ownerOf(o){
    if(!o)return -1;
    try{
      var h=o.human; var hn=h&&(h.node||h); var k=idxOf(hn); if(k>=0)return k;
      var nd=o.node; if(nd){ k=idxOf(nd); if(k>=0)return k; var g=String(nd.group||""); if(/1$/.test(g))return 0; if(/2$/.test(g))return 1; }
    }catch(_){}
    return -1;
  }
  function recHit(c,v,raw,real,hpAfter,nargs){
    if(c.hits.length>=HMAX){ c.hitOver++; return; }
    var top=SS[SS.length-1], o=top&&top.o, nd=o&&o.node;
    var src=top?top.c+"."+top.f:(window.__blSrc?"脚本:"+window.__blSrc:"其他代码(道具/场地/延时)");
    var own=ownerOf(o);
    var oj=joyOf(c.n[1-v]);
    // [时间, 挨打方, 原始伤害, 实际掉血, 来源, 攻击方(-1=不明), 打中的物体名, 物体分组, 对手当时武器, 挨打后血量, 对手在放大招]
    c.hits.push([round1((Date.now()-c.t0)/1000), v, round1(raw), round1(real), di(c,src), own,
      di(c,nd&&nd.name), di(c,nd&&nd.group), di(c,wname(c.n[1-v])), round1(hpAfter), oj&&oj.bigSkillState?1:0]);
  }
  function itemName(st){ var L=window.__ITEM_DATA||[]; for(var k=0;k<L.length;k++){ if(L[k].state===st)return L[k].name||String(st); } return String(st); }
  function mark(i,src){ if(cur&&i>=0){ cur.src[i]={s:src,t:Date.now()}; } }
  function patch(){
    var M=req("HumanController"), P=M&&M.default&&M.default.prototype;
    if(P&&P.setDamage&&!P.__blHook){
      var o=P.setDamage;
      P.setDamage=function(dmg){
        var c=cur, i=-1, hp0=0;
        try{ if(c&&this&&this.node){ i=idxOf(this.node); if(i>=0){ mark(i,dmg>=50?"地形":"武器:"+wname(c.n[1-i])); hp0=this.hp; } } }catch(_){}
        var ret=o.apply(this,arguments);
        try{ if(i>=0&&c===cur)recHit(c,i,+dmg||0,hp0-this.hp,this.hp,arguments.length); }catch(_){}
        return ret;
      };
      P.__blHook=true;
    }
    // r19 道具日志：真捡到 = 不在 __applyItemToOne 里面弹的拾取提示；在里面弹的 = 被动/道具白送
    var ap=window.__applyItemToOne;
    if(ap&&!ap.__blItem){
      var wrapA=function(state,n){ applyDepth++; try{ return ap.apply(this,arguments); }finally{ applyDepth--; } };
      wrapA.__blItem=true; window.__applyItemToOne=wrapA;
    }
    var ts=window.__showItemToast;
    if(ts&&!ts.__blItem){
      var wrapT=function(state,n){
        try{ if(cur){ var i=idxOf(n&&n.node?n.node:n); if(i>=0){
          var nm=itemName(state);
          var same=cur.lastPick&&cur.lastPick.i===i&&cur.lastPick.s===state&&Date.now()-cur.lastPick.t<300;
          if(same){}
          else if(applyDepth===0){
            cur.items[i].push({s:state,n:nm,t:round1((Date.now()-cur.t0)/1000)});
            cur.lastPick={i:i,s:state,t:Date.now()};
          }
          else { cur.gifts[i][nm]=(cur.gifts[i][nm]||0)+1; }
        } } }catch(_){}
        return ts.apply(this,arguments);
      };
      wrapT.__blItem=true; window.__showItemToast=wrapT;
    }
    try{ wrapSources(); }catch(_){}
    var fx=window.__fixR1;
    if(fx&&fx.hurt&&!fx.__blHook){
      var h=fx.hurt;
      fx.hurt=function(n){
        try{ if(cur){ var i=idxOf(n&&n.node?n.node:n); if(i>=0)mark(i,window.__blSrc||"道具"); } }catch(_){}
        return h.apply(this,arguments);
      };
      fx.__blHook=true;
    }
  }

  // ---------- 一局 ----------
  function begin(gm){
    var P=window.__passives||{};
    cur={
      key:(gm.player.uuid||gm.player._id)+"|"+(gm.enemy.uuid||gm.enemy._id),
      n:[gm.player,gm.enemy], t0:Date.now(),
      hp:[hcOf(gm.player).hp,hcOf(gm.enemy).hp],
      src:[null,null], lastSrc:[null,null],
      taken:[{},{}], burst:[{},{}], win1:[[],[]], heal:[0,0], weap:[{},{}], items:[[],[]], gifts:[{},{}], field:null,
      hits:[], hitOver:0, dict:{list:[],idx:{}}, ev:[], pos:[], lastW:[null,null], lastSk:[0,0], posT:0,
      rec:{v:2, map:(cc.director.getScene()||{}).name||"", passive:[P.p1||null,P.p2||null], maxhp:[hcOf(gm.player).maxhp,hcOf(gm.enemy).maxhp]}
    };
  }
  function posOf(n){ try{ var b=n.getChildByName("body")||n; var p=b.convertToWorldSpaceAR(cc.v2(0,0)); return [Math.round(p.x),Math.round(p.y)]; }catch(_){ return [0,0]; } }
  function tick(dt){
    if(!cur)return;
    // 检查点：每秒记一次双方位置
    var nw=Date.now(); if(nw-cur.posT>=1000&&cur.pos.length<240){ cur.posT=nw; var a=posOf(cur.n[0]), bb=posOf(cur.n[1]); cur.pos.push([round1((nw-cur.t0)/1000),a[0],a[1],bb[0],bb[1]]); }
    var F=window.__fields;
    if(!cur.field&&F&&F.cur){ cur.field=F.cur.def.id; cur.picked=!!F.cur.picked; }
    var tt=round1((Date.now()-cur.t0)/1000);
    for(var i=0;i<2;i++){
      var h=hcOf(cur.n[i]); if(!h)continue;
      // 检查点：换武器、放大招
      var wn=wname(cur.n[i]); if(wn!==cur.lastW[i]){ cur.lastW[i]=wn; if(cur.ev.length<300)cur.ev.push(["w",tt,i,wn]); }
      var jj=joyOf(cur.n[i]), sk=jj&&jj.bigSkillState?1:0; if(sk&&!cur.lastSk[i]&&cur.ev.length<300)cur.ev.push(["skill",tt,i]); cur.lastSk[i]=sk;
      var w=wname(cur.n[i]); cur.weap[i][w]=(cur.weap[i][w]||0)+dt;
      var hp=h.hp, d=cur.hp[i]-hp;
      if(d>0.01){
        var s=cur.src[i], src;
        if(s&&Date.now()-s.t<400)src=s.s;
        else { var oj=joyOf(cur.n[1-i]); src=(oj&&oj.bigSkillState)?"大招":"其他"; }
        cur.taken[i][src]=(cur.taken[i][src]||0)+d;
        // 1 秒内同一来源的最大爆发
        var now=Date.now(), W=cur.win1[i]; W.push({t:now,s:src,d:d});
        while(W.length&&now-W[0].t>1000)W.shift();
        var sum=0; for(var q=0;q<W.length;q++)if(W[q].s===src)sum+=W[q].d;
        if(sum>(cur.burst[i][src]||0))cur.burst[i][src]=sum;
        cur.lastSrc[i]=src;
        if(d>=50)cur.ev.push(["big",round1((Date.now()-cur.t0)/1000),i,round1(d),src]);
      } else if(d<-0.01){ cur.heal[i]+=-d; }
      cur.hp[i]=hp;
    }
  }
  function finish(reason){
    var c=cur; cur=null; if(!c)return; doneKey=c.key;
    var dur=(Date.now()-c.t0)/1000;
    if(dur<3)return;                       // 太短（切图/测试）不记
    var d0=dead(c.n[0]), d1=dead(c.n[1]);
    if(reason!=="death")return;            // 中途退出不记
    if(c.picked)return;                    // 自选/预选/指定的场地不记
    if(B.noLog())return;                   // 这台设备设置了不记
    var r=c.rec;
    r.dev=devId(); r.ts=Date.now(); r.dur=round1(dur); r.field=c.field; try{ var FD=window.__fields&&window.__fields.byId[c.field]; r.fname=FD?FD.name:null; }catch(_){} r.maxhp=[0,1].map(function(i){ var h=hcOf(c.n[i]); return h?h.maxhp:null; });
    r.winner=d0&&d1?-1:(d0?1:0);
    r.hits=c.hits; r.hitOver=c.hitOver; r.dict=c.dict.list; r.ev=c.ev; r.pos=c.pos; r.srcWrapped=B.srcWrapped||0;
    r.p=[0,1].map(function(i){
      var t={}, w={}, bu={}; Object.keys(c.taken[i]).forEach(function(k){ t[k]=round1(c.taken[i][k]); }); Object.keys(c.burst[i]).forEach(function(k){ bu[k]=round1(c.burst[i][k]); });
      Object.keys(c.weap[i]).forEach(function(k){ if(c.weap[i][k]>=0.5)w[k]=round1(c.weap[i][k]); });
      var L=window.__PASSIVES||[], pd=null; for(var k=0;k<L.length;k++){ if(L[k].id===r.passive[i]){ pd=L[k]; break; } }
      return {passive:r.passive[i], pname:pd?pd.name:null, hpEnd:round1(Math.max(0,c.hp[i])), taken:t, burst1s:bu, heal:round1(c.heal[i]), weapons:w, items:c.items[i], gifts:c.gifts[i], killedBy:dead(c.n[i])?c.lastSrc[i]:null};
    });
    delete r.passive;
    B.last=r;
    send(r);
  }

  // ---------- 上传 ----------
  function loadQ(){ try{ return JSON.parse(localStorage.getItem(QKEY)||"[]")||[]; }catch(_){ return []; } }
  function saveQ(q){
    q=q.slice(-200);
    try{ localStorage.setItem(QKEY,JSON.stringify(q)); return; }catch(_){}
    // 装不下：旧局去掉逐击明细，只留最新 20 局的明细
    for(var i=0;i<q.length-20;i++){ if(q[i]&&q[i].hits){ delete q[i].hits; delete q[i].pos; delete q[i].dict; delete q[i].ev; } }
    try{ localStorage.setItem(QKEY,JSON.stringify(q)); return; }catch(_){}
    try{ localStorage.setItem(QKEY,JSON.stringify(q.slice(-20))); }catch(_){}
  }
  B.queue=loadQ;
  function send(r){
    var q=loadQ(); q.push(r); saveQ(q); flush();
  }
  var flushing=false;
  function flush(){
    if(B.off||flushing)return;
    var q=loadQ(); if(!q.length)return;
    var batch=[], size=20;
    for(var bi=0;bi<q.length&&batch.length<30;bi++){ var js=JSON.stringify(q[bi]); if(batch.length&&size+js.length>150000)break; if(js.length>150000){ q[bi].hits=q[bi].hits.slice(0,150); q[bi].pos=[]; js=JSON.stringify(q[bi]); } batch.push(q[bi]); size+=js.length+1; }
    flushing=true;
    try{
      fetch("/api/battlelog",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({rounds:batch})})
        .then(function(res){ flushing=false; if(res.ok){ var q2=loadQ(); saveQ(q2.slice(batch.length)); } })
        .catch(function(){ flushing=false; });
    }catch(_){ flushing=false; }
  }
  B.flush=flush;
  B.mark=function(node,src){ mark(idxOf(node&&node.node?node.node:node),src); };

  // ---------- 主循环 ----------
  var lastT=0, seenKey=null, seenAt=0, doneKey=null;
  setInterval(function(){
    try{
      if(!window.cc||!cc.director||!window.__require)return;
      patch();
      var gm=games(), C=cfg();
      var twoP=C&&String(C.gameChooseViewNumber)==="2"&&!C.suverModel;
      if(twoP)autoPassive();
      var ok=gm&&twoP&&valid(gm.player)&&valid(gm.enemy);
      var now=Date.now(), dt=lastT?Math.min(0.5,(now-lastT)/1000):0; lastT=now;
      if(!ok){ if(cur)finish("leave"); return; }
      var key=(gm.player.uuid||gm.player._id)+"|"+(gm.enemy.uuid||gm.enemy._id);
      if(cur&&cur.key!==key)finish("leave");
      if(!cur){ if(key!==seenKey){ seenKey=key; seenAt=now; return; } if(now-seenAt>1000&&!dead(gm.player)&&!dead(gm.enemy)&&C.gameStart!==false&&key!==doneKey)begin(gm); return; }
      tick(C.gameStart===false?0:dt);
      if(dead(cur.n[0])||dead(cur.n[1])){ tick(0); finish("death"); }
    }catch(e){ try{ (window.__logs||(window.__logs=[])).push("[battlelog] "+(e&&e.message)); }catch(_){} }
  },100);
  setTimeout(flush,5000);
})();
