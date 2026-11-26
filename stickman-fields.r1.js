// ================= 场地内核（只在双人模式生效） =================
// 每局开打时按概率抽一个场地，整局生效，回合结束自动清理。
// 场地文件写法见 fields/README-场地接口.md
(function(){
  if(window.__fields)return;
  var F=window.__fields={list:[],byId:{},cur:null,lastId:null,force:null,version:"fields-r1"};
  function LOG(){ try{ var a=[].slice.call(arguments).join(" "); (window.__logs||(window.__logs=[])).push("[field] "+a); if(window.__logs.length>300)window.__logs.shift(); }catch(_){} }
  F.log=LOG;
  function req(n){ try{ return window.__require(n); }catch(_){ return null; } }
  function cfg(){ var m=req("ConfigManager"); return m&&m.gameConfig; }
  function games(){ var c=cc.find("Canvas"); return c&&c.getComponent("Games"); }
  function valid(n){ return !!(n&&n.isValid); }
  function hcOf(n){ return valid(n)?n.getComponent("HumanController"):null; }
  function dead(n){ var h=hcOf(n); return !h||h.isDead||!(h.hp>0); }

  // 注册：F.register({id:"lava", no:14, name:"岩浆", emoji:"🌋", desc:"…", start:function(ctx){…}, stop:function(ctx){…}})
  F.register=function(def){
    if(!def||!def.id||F.byId[def.id]){ LOG("重复或无效场地", def&&def.id); return; }
    F.list.push(def); F.byId[def.id]=def;
  };

  // ---------- 横幅（DOM，不受镜头缩放影响） ----------
  var banner=null, tag=null;
  function domClear(){ [banner,tag].forEach(function(n){ if(n&&n.parentNode)n.parentNode.removeChild(n); }); banner=tag=null; }
  function showBanner(def){
    domClear();
    banner=document.createElement("div");
    banner.style.cssText="position:fixed;left:50%;top:18%;transform:translate(-50%,-50%) scale(.6);opacity:0;z-index:100030;pointer-events:none;text-align:center;padding:14px 28px;border-radius:16px;background:rgba(12,18,34,.88);border:3px solid #ffd45a;color:#fff;font:800 clamp(22px,4vw,44px)/1.2 JCRound,\"PingFang SC\",sans-serif;text-shadow:0 2px 3px #000;transition:all .35s cubic-bezier(.2,1.4,.4,1);max-width:86vw;";
    banner.innerHTML="<div style='font-size:.55em;color:#ffd45a;letter-spacing:.2em'>本局场地</div><div>"+(def.emoji||"")+" "+def.name+"</div><div style='font-size:.42em;font-weight:600;color:#dfe8ff;margin-top:6px'>"+(def.desc||"")+"</div>";
    document.body.appendChild(banner);
    setTimeout(function(){ if(banner){ banner.style.opacity="1"; banner.style.transform="translate(-50%,-50%) scale(1)"; } },30);
    setTimeout(function(){ if(banner){ banner.style.opacity="0"; banner.style.transform="translate(-50%,-50%) scale(.8)"; } },3200);
    setTimeout(function(){ if(banner&&banner.parentNode)banner.parentNode.removeChild(banner); banner=null; },3700);
    tag=document.createElement("div"); tag.id="__fieldTag";
    tag.style.cssText="position:fixed;left:50%;top:8px;transform:translateX(-50%);z-index:100020;pointer-events:none;padding:3px 12px;border-radius:999px;background:rgba(12,18,34,.78);border:2px solid #ffd45a;color:#ffe9a8;font:700 clamp(13px,1.8vw,18px)/1.3 JCRound,\"PingFang SC\",sans-serif;white-space:nowrap;";
    tag.textContent=(def.emoji||"")+" "+def.name;
    document.body.appendChild(tag);
  }

  // ---------- 贴图缓存 ----------
  var TEX={};
  function loadFrame(url,cb){
    var e=TEX[url];
    if(e&&e.frame){ cb(e.frame); return; }
    if(e){ e.cbs.push(cb); return; }
    e=TEX[url]={frame:null,cbs:[cb]};
    cc.assetManager.loadRemote(url,{ext:".png"},function(err,tex){
      if(err||!tex){ LOG("贴图失败",url); e.cbs=[]; delete TEX[url]; return; }
      e.frame=new cc.SpriteFrame(tex); var cbs=e.cbs; e.cbs=[]; cbs.forEach(function(f){ try{f(e.frame);}catch(_){} });
    });
  }
  F.preload=function(urls){ (urls||[]).forEach(function(u){ loadFrame(u,function(){}); }); };

  // ---------- 受击钩子（武器等走 setDamage 的伤害） ----------
  function patchSetDamage(){
    var M=req("HumanController"), P=M&&M.default&&M.default.prototype; if(!P||!P.setDamage)return false;
    if(P.__fieldHook)return true;
    var o=P.setDamage;
    P.setDamage=function(dmg){
      var c=F.cur&&F.cur.ctx;
      if(c&&c.alive&&c._hits.length&&this&&this.node){
        var d=dmg, info={terrain:dmg>=50, victim:this.node, attacker:c.opp(this.node)};
        for(var i=0;i<c._hits.length;i++){ try{ var r=c._hits[i](this,d,info); if(typeof r==="number"&&isFinite(r))d=r; }catch(e){ LOG("onHit 出错",c.def.id,e&&e.message); } }
        if(!(d>0))return;
        arguments[0]=d;
      }
      if(F.overtime&&F.overtime.on&&arguments[0]>0&&arguments[0]<50)arguments[0]=arguments[0]*F.overtime.mul();
      return o.apply(this,arguments);
    };
    P.__fieldHook=true; return true;
  }
  function patchHurt(){
    var fx=window.__fixR1; if(!fx||!fx.hurt||fx.__otHook)return;
    var h=fx.hurt;
    fx.hurt=function(n,pct){ var a=[].slice.call(arguments); if(F.overtime&&F.overtime.on&&typeof pct==="number")a[1]=pct*F.overtime.mul(); return h.apply(this,a); };
    fx.__otHook=true;
  }

  // ---------- 上下文：每局一个 ----------
  function makeCtx(def,gm){
    var c={def:def, gm:gm, alive:true, t0:Date.now(), _timers:[], _ups:[], _hits:[], _cleanups:[], _nodes:[]};
    c.p1=gm.player; c.p2=gm.enemy; c.players=[gm.player,gm.enemy];
    c.R=window.__selectedItemRuntime;
    c.canvas=cc.find("Canvas");
    c.log=function(){ LOG.apply(null,[def.id].concat([].slice.call(arguments))); };
    c.now=function(){ return Date.now(); };
    c.elapsed=function(){ return (Date.now()-c.t0)/1000; };
    c.rnd=function(a,b){ return a+Math.random()*(b-a); };
    c.pick=function(arr){ return arr[Math.floor(Math.random()*arr.length)]; };
    c.valid=valid;
    c.hc=hcOf;
    c.isDead=dead;
    c.opp=function(n){ return n===c.p1?c.p2:(n===c.p2?c.p1:null); };
    c.isP1=function(n){ return n===c.p1; };
    c.parts=function(n){ return valid(n)?n.getComponentsInChildren(cc.RigidBody):[]; };
    c.bodyRb=function(n){ var b=valid(n)&&n.getChildByName("body"); return b&&b.getComponent(cc.RigidBody); };
    c.bodyPos=function(n){ var rb=c.bodyRb(n); if(!rb)return null; var p=cc.v2(); rb.getWorldPosition(p); return p; };
    c.partPos=function(rb){ var p=cc.v2(); rb.getWorldPosition(p); return p; };
    c.toCanvas=function(w){ return w&&c.canvas?c.canvas.convertToNodeSpaceAR(w):null; };
    c.toWorld=function(p){ return p&&c.canvas?c.canvas.convertToWorldSpaceAR(p):null; };
    c.canvasPt=function(n){ return c.toCanvas(c.bodyPos(n)); };
    c.passive=function(n){ var P=window.__passives||{}; return n===c.p1?P.p1:(n===c.p2?P.p2:null); };
    // 地图范围：世界坐标里的「边框内侧」矩形（Walls 下 left/right/down/up 四块厚墙的内边）；拿不到时用镜头可见范围
    c.mapRect=function(){
      if(c._rect)return c._rect;
      var W={};
      function walk(n){ if(n.name==="Walls"){ n.getComponentsInChildren(cc.PhysicsCollider).forEach(function(col){ try{ W[col.node.name]=col.getAABB(); }catch(_){} }); return; } n.children.forEach(walk); }
      try{ walk(cc.director.getScene()); }catch(_){}
      var r=null;
      if(W.left&&W.right&&W.down&&W.up){ var x0=W.left.xMax, x1=W.right.xMin, y0=W.down.yMax, y1=W.up.yMin; if(x1-x0>300&&y1-y0>300) r=cc.rect(x0,y0,x1-x0,y1-y0); }
      if(!r){ try{ var cam=cc.Camera.main, a=cam.getScreenToWorldPoint(cc.v2(0,0)), b=cam.getScreenToWorldPoint(cc.v2(cc.winSize.width,cc.winSize.height)); r=cc.rect(a.x,a.y,b.x-a.x,b.y-a.y); }catch(_){ var p=c.bodyPos(c.p1)||cc.v2(0,0); r=cc.rect(p.x-1400,p.y-700,2800,1400); } }
      c._rect=r; return r;
    };
    // 计时（回合结束自动清掉）
    c.every=function(ms,fn){ var id=setInterval(function(){ if(!c.alive)return; try{fn();}catch(e){ LOG("every 出错",def.id,e&&e.message); } },ms); c._timers.push(["i",id]); return id; };
    c.after=function(ms,fn){ var id=setTimeout(function(){ if(!c.alive)return; try{fn();}catch(e){ LOG("after 出错",def.id,e&&e.message); } },ms); c._timers.push(["t",id]); return id; };
    c.onUpdate=function(fn){ c._ups.push(fn); };
    c.onHit=function(fn){ c._hits.push(fn); };
    c.onCleanup=function(fn){ c._cleanups.push(fn); };
    // 节点（挂在 Canvas 下，坐标用 Canvas 坐标；回合结束自动销毁）
    c.node=function(name,pos,z){ if(!c.canvas)return null; var n=new cc.Node(name||"fieldNode"); n.parent=c.canvas; n.zIndex=z||300; if(pos)n.setPosition(pos.x,pos.y); c._nodes.push(n); return n; };
    c.sprite=function(url,pos,w,h,z){ var n=c.node("fieldSprite",pos,z); if(!n)return null; var sp=n.addComponent(cc.Sprite); sp.sizeMode=cc.Sprite.SizeMode.CUSTOM; n.setContentSize(w,h||w); loadFrame(url,function(f){ if(n.isValid){ sp.spriteFrame=f; n.setContentSize(w,h||w); } }); return n; };
    c.graphics=function(pos,z){ var n=c.node("fieldGfx",pos,z); return n?n.addComponent(cc.Graphics):null; };
    c.label=function(text,pos,size,color,z){ var n=c.node("fieldLabel",pos,z||430); if(!n)return null; var l=n.addComponent(cc.Label); l.string=text; l.fontSize=size||32; l.lineHeight=(size||32)+4; n.color=color||cc.Color.WHITE; var o=n.addComponent(cc.LabelOutline); o.color=cc.Color.BLACK; o.width=3; return n; };
    c.toast=function(text,n,color,size){ try{ window.__toastNearPlayer&&window.__toastNearPlayer(text,n,color||new cc.Color(255,230,120),size||24); }catch(_){} };
    // 伤害与运动
    c.hurtPct=function(n,pct,vx,vy){ var fx=window.__fixR1; if(!fx||!fx.hurt)return false; window.__blSrc="场地:"+def.name; try{ return fx.hurt(n,pct,vx,vy); }finally{ window.__blSrc=null; } };   // 扣最大生命的 pct%，过护盾/无敌
    c.heal=function(n,amount){ var h=hcOf(n); if(!h||h.isDead)return; h.hp=Math.min(h.maxhp,h.hp+amount); try{ h.HealthBar.getComponent(cc.ProgressBar).progress=h.hp/h.maxhp; }catch(_){} };
    c.kill=function(n){ var h=hcOf(n), fx=window.__fixR1; if(!h||h.isDead)return; try{ window.__battlelog&&window.__battlelog.mark(n,"场地:"+def.name); }catch(_){} h.hp=0; if(fx&&fx.forceDeath)fx.forceDeath(h); };
    c.popText=function(n,str,color){ var fx=window.__fixR1; try{ fx&&fx.popText&&fx.popText(n,str,color); }catch(_){} };
    c.setVel=function(n,vx,vy){ c.parts(n).forEach(function(rb){ rb.linearVelocity=cc.v2(vx,vy); }); };
    c.addVel=function(n,dx,dy){ c.parts(n).forEach(function(rb){ var v=rb.linearVelocity; rb.linearVelocity=cc.v2(v.x+dx,v.y+dy); }); };
    c.scaleVelNextStep=function(n,k){ cc.director.once(cc.Director.EVENT_AFTER_PHYSICS,function(){ if(!c.alive)return; c.parts(n).forEach(function(rb){ var v=rb.linearVelocity; rb.linearVelocity=cc.v2(v.x*k,v.y*k); }); }); };
    // 全局状态（都会在回合结束还原）
    var pm=cc.director.getPhysicsManager(), g0=pm.gravity.clone(), ts0=1;
    c.gravity0=g0;
    c.setGravity=function(x,y){ pm.gravity=cc.v2(x,y); };
    c.setTimeScale=function(k){ cc.director.getScheduler().setTimeScale(k); };
    c.spikes=function(on){   // on=false：尖刺（碰撞组 deads）当普通地面，不扣血
      walkScene(function(n){ if(on===false&&n.group==="deads"){ n.__fieldWasDeads=true; n.group="ground"; applyCols(n); } else if(on!==false&&n.__fieldWasDeads){ n.group="deads"; n.__fieldWasDeads=false; applyCols(n); } });
    };
    c.items={ rate:1, off:false };            // rate=2 → 道具刷新快一倍；off=true → 不刷道具
    c.bigCdMul=1;                              // 0.5 → 大招冷却减半（双人模式原本 8 秒）
    c.applyItem=function(state,n){ try{ window.__applyItemToOne&&window.__applyItemToOne(state,n); }catch(e){ LOG("applyItem 出错",e&&e.message); } };
    c.joyOf=function(n){ var js=c.canvas?c.canvas.getComponentsInChildren("JoyStick"):[]; for(var i=0;i<js.length;i++){ var h=js[i].human2; if(h&&(h===n||h.node===n))return js[i]; } return null; };
    // 位置：moveBy 整个人平移（世界坐标），teleport 把躯干移到某点，swap 两人互换
    c.moveBy=function(n,dx,dy){ var fx=window.__fixR1; try{ fx&&fx.moveHumanBy&&fx.moveHumanBy(n,dx,dy); }catch(e){ LOG("moveBy 出错",e&&e.message); } };
    c.teleport=function(n,w){ var b=c.bodyPos(n); if(b&&w)c.moveBy(n,w.x-b.x,w.y-b.y); };
    c.swap=function(){ var fx=window.__fixR1; try{ fx&&fx.swapPos&&fx.swapPos(c.p1,c.p2); }catch(_){} };
    // 单人重力倍数（-1 = 往上掉）：gravityScale 设到这个人所有刚体上，回合结束还原
    c._gs=[];
    c.gravityScale=function(n,k){ c.parts(n).forEach(function(rb){ if(rb.__gs0===undefined){ rb.__gs0=rb.gravityScale; c._gs.push(rb); } rb.gravityScale=k; }); };
    c._restore=function(){ c._gs.forEach(function(rb){ try{ if(rb.isValid&&rb.__gs0!==undefined){ rb.gravityScale=rb.__gs0; rb.__gs0=undefined; } }catch(_){} }); pm.gravity=g0; c.setTimeScale(ts0); c.spikes(true); if(c._itemsOffSet){ gm._CreateBuffItem=c._itemsWas; } };
    return c;
  }
  function walkScene(fn){ function w(n){ fn(n); n.children.forEach(w); } try{ w(cc.director.getScene()); }catch(_){} }
  function applyCols(n){ n.getComponents(cc.PhysicsCollider).forEach(function(col){ try{ col.apply(); }catch(_){} }); }

  // ---------- 每帧 ----------
  function frame(){
    var cur=F.cur; if(!cur)return; var c=cur.ctx; if(!c.alive)return;
    var dt=cc.director.getDeltaTime();
    // 道具速率 / 关闭
    var gm=c.gm;
    if(valid(gm&&gm.node)){
      if(c.items.off){ if(!c._itemsOffSet){ c._itemsOffSet=true; c._itemsWas=gm._CreateBuffItem; } gm._CreateBuffItem=false; }
      else if(c.items.rate!==1&&typeof gm._itemTimer==="number"){ gm._itemTimer-=dt*(c.items.rate-1); }
    }
    if(c.bigCdMul!==1&&c.bigCdMul>0){
      c.players.forEach(function(n){ var j=c.joyOf(n); if(j&&!j.bigSkillState&&typeof j.bigSkillTimer==="number") j.bigSkillTimer+=dt*(1/c.bigCdMul-1); });
    }
    for(var i=0;i<c._ups.length;i++){ try{ c._ups[i](dt); }catch(e){ LOG("onUpdate 出错",c.def.id,e&&e.message); c._ups.splice(i,1); i--; } }
  }

  function stopCur(why){
    var cur=F.cur; if(!cur)return; F.cur=null;
    var c=cur.ctx; c.alive=false;
    c._timers.forEach(function(t){ if(t[0]==="i")clearInterval(t[1]); else clearTimeout(t[1]); });
    try{ cur.def.stop&&cur.def.stop(c); }catch(e){ LOG("stop 出错",cur.def.id,e&&e.message); }
    c._cleanups.forEach(function(f){ try{f();}catch(_){} });
    try{ c._restore(); }catch(_){}
    c._nodes.forEach(function(n){ if(n&&n.isValid)n.destroy(); });
    domClear();
    LOG("结束",cur.def.id,why||"");
  }
  function startField(def,gm){
    var c=makeCtx(def,gm);
    F.cur={def:def,ctx:c,gm:gm}; F.lastId=def.id;
    showBanner(def);
    LOG("开始",def.id);
    try{ def.start(c); }catch(e){ LOG("start 出错",def.id,e&&e.message); }
  }
  // 预选队列：localStorage "stickman.fieldQueue" = ["lava","random",...]，每局开打取第一个
  var QK="stickman.fieldQueue";
  F.queue=function(){ try{ var q=JSON.parse(localStorage.getItem(QK)||"[]"); return Array.isArray(q)?q:[]; }catch(_){ return []; } };
  F.saveQueue=function(q){ try{ if(q&&q.length)localStorage.setItem(QK,JSON.stringify(q.slice(0,5))); else localStorage.removeItem(QK); }catch(_){} };
  function roll(){
    var forced=F.force||(function(){ try{ return (location.search.match(/[?&]field=([\w-]+)/)||[])[1]||localStorage.getItem("stickman.field"); }catch(_){ return null; } })();
    F.rollPicked=true;
    if(forced&&F.byId[forced])return F.byId[forced];
    if(forced==="none")return null;
    var q=F.queue();
    if(q.length){
      var qid=q.shift(); F.saveQueue(q);
      LOG("预选队列取出",qid,"剩",q.length);
      if(F.byId[qid])return F.byId[qid];
      if(qid==="none")return null;
    }
    F.rollPicked=false;
    var n=F.list.length; if(!n)return null;
    var prob=n>=30?1:0.5;
    if(Math.random()>=prob)return null;
    var pool=F.list.filter(function(d){ return d.id!==F.lastId; }); if(!pool.length)pool=F.list;
    return pool[Math.floor(Math.random()*pool.length)];
  }


  // ---------- 决战时刻：一局超过 60 秒 → 伤害递增 + 四周缩圈 + 红边 + 大招冷却变快 ----------
  var OT=F.overtime={AT:60, on:false, t0:0, ctx:null, el:null};
  OT.mul=function(){ if(!OT.on)return 1; var s=(Date.now()-OT.t0)/1000-OT.AT; return Math.min(3,1.25+0.25*Math.floor(Math.max(0,s)/10)); };
  OT.begin=function(){ OT.stop(); OT.t0=Date.now(); };
  OT.stop=function(){
    if(OT.on){ OT.on=false; LOG("决战时刻结束"); }
    if(OT.ctx){ var c=OT.ctx; OT.ctx=null; c.alive=false; c._timers.forEach(function(t){ if(t[0]==="i")clearInterval(t[1]); else clearTimeout(t[1]); }); c._nodes.forEach(function(n){ if(n&&n.isValid)n.destroy(); }); }
    if(OT.el&&OT.el.parentNode)OT.el.parentNode.removeChild(OT.el); OT.el=null;
  };
  OT.start=function(gm){
    if(OT.on)return; OT.on=true; LOG("决战时刻开始");
    var c=OT.ctx=makeCtx({id:"overtime",name:"决战时刻"},gm);
    // 红边 + 提示
    var e=OT.el=document.createElement("div");
    e.style.cssText="position:fixed;inset:0;z-index:100015;pointer-events:none;box-shadow:inset 0 0 60px 18px rgba(255,40,40,.55);animation:otpulse 1.2s ease-in-out infinite";
    e.innerHTML="<style>@keyframes otpulse{0%,100%{opacity:.55}50%{opacity:1}}@keyframes otin{0%{transform:translate(-50%,-50%) scale(1.8);opacity:0}15%{transform:translate(-50%,-50%) scale(1);opacity:1}80%{opacity:1}100%{opacity:0}}</style>"+
      "<div style='position:fixed;left:50%;top:30%;transform:translate(-50%,-50%);text-align:center;font:900 clamp(28px,5vw,56px)/1.2 JCRound,\"PingFang SC\",sans-serif;color:#ff4a4a;text-shadow:0 0 12px rgba(0,0,0,.8),0 3px 0 #5a0000;animation:otin 2.6s forwards;white-space:nowrap'>⚔️ 决战时刻<div style='font-size:.36em;color:#ffe2a8;font-weight:700;margin-top:4px'>伤害越来越高 · 毒雾合拢 · 大招加速</div></div>"+
      "<div id='__otMul' style='position:fixed;left:50%;top:76px;transform:translateX(-50%);font:800 14px JCRound,\"PingFang SC\",sans-serif;color:#fff;background:rgba(150,0,0,.85);border:2px solid #ff6a6a;border-radius:999px;padding:3px 12px;white-space:nowrap'></div>";
    document.body.appendChild(e);
    var mulEl=e.querySelector("#__otMul");
    // 缩圈（本局场地已经是缩圈就不重复）
    var zone=!(F.cur&&F.cur.def.id==="shrinkzone");
    var r=c.mapRect(), total=r.width*0.4, dur=25, g=zone?c.graphics(cc.v2(0,0),282):null, lastHurt=[0,0];
    var ups=function(dt){
      if(!c.alive)return;
      // 大招冷却 ×2 速
      c.players.forEach(function(n){ var j=c.joyOf(n); if(j&&!j.bigSkillState&&typeof j.bigSkillTimer==="number") j.bigSkillTimer+=dt; });
      var m=OT.mul(), txt="伤害 ×"+m.toFixed(2).replace(/0$/,"");
      if(mulEl&&mulEl.textContent!==txt)mulEl.textContent=txt;
      if(!zone)return;
      var T=c.elapsed(), ins=total*Math.min(1,T/dur);
      var lA=c.toCanvas(cc.v2(r.x,r.y)), lB=c.toCanvas(cc.v2(r.x+ins,r.yMax)), rA=c.toCanvas(cc.v2(r.xMax-ins,r.y)), rB=c.toCanvas(cc.v2(r.xMax,r.yMax));
      var h=lB.y-lA.y, pulse=0.5+0.5*Math.sin(T*4);
      g.clear();
      if(ins>1){
        g.fillColor=cc.color(150,20,30,Math.round(110+30*pulse)); g.rect(lA.x,lA.y,lB.x-lA.x,h); g.rect(rA.x,rA.y,rB.x-rA.x,h); g.fill();
        g.strokeColor=cc.color(255,90,60,Math.round(150+100*pulse)); g.lineWidth=7;
        g.moveTo(lB.x,lA.y); g.lineTo(lB.x,lB.y); g.moveTo(rA.x,rA.y); g.lineTo(rA.x,rB.y); g.stroke();
      }
      c.players.forEach(function(n,i){
        if(c.isDead(n))return; var p=c.bodyPos(n); if(!p)return;
        if(ins>1&&(p.x<r.x+ins||p.x>r.xMax-ins)&&Date.now()-lastHurt[i]>500){ lastHurt[i]=Date.now(); c.hurtPct(n,4); c.toast("毒雾",n,cc.color(255,120,90),20); }
      });
    };
    c._otUp=ups;
  };
  function otFrame(){ var c=OT.ctx; if(c&&c.alive&&c._otUp){ try{ c._otUp(cc.director.getDeltaTime()); }catch(e){ LOG("决战出错",e&&e.message); } } }

  // ---------- 回合检测 ----------
  var roundKey=null, pendingAt=0;
  function poll(){
    if(!window.cc||!cc.director||!window.__require)return;
    patchSetDamage(); patchHurt();
    var gm=games(), C=cfg();
    var twoP=C&&String(C.gameChooseViewNumber)==="2"&&!C.suverModel;
    var ok=gm&&twoP&&valid(gm.player)&&valid(gm.enemy);
    if(ok)F._inMatch=true;
    else if(F._inMatch){ var sc=cc.director.getScene(); if(sc&&sc.name==="main"){ F._inMatch=false; if(F.queue().length){ F.saveQueue([]); LOG("一场结束，清空预选"); } } }
    if(!ok){ if(F.cur)stopCur("离开对局"); OT.stop(); OT.t0=0; roundKey=null; return; }
    var key=(gm.player.uuid||gm.player._id)+"|"+(gm.enemy.uuid||gm.enemy._id);
    if(key!==roundKey){ if(F.cur)stopCur("新回合"); OT.stop(); OT.t0=0; roundKey=key; pendingAt=Date.now()+600; return; }
    if(pendingAt&&Date.now()>=pendingAt&&C.gameStart!==false){
      pendingAt=0;
      OT.begin();
      var def=roll(); if(def){ startField(def,gm); if(F.cur)F.cur.picked=!!F.rollPicked; } else LOG("本局无场地");
      return;
    }
    if(dead(gm.player)||dead(gm.enemy)){ if(F.cur)stopCur("有人倒下"); if(OT.on||OT.ctx)OT.stop(); OT.t0=0; return; }
    if(OT.t0&&!OT.on&&Date.now()-OT.t0>=OT.AT*1000)OT.start(gm);
  }
  var hooked=false;
  setInterval(function(){
    try{
      if(!hooked&&window.cc&&cc.director&&cc.Director){ cc.director.on(cc.Director.EVENT_AFTER_UPDATE,frame); cc.director.on(cc.Director.EVENT_AFTER_UPDATE,otFrame); hooked=true; }
      poll();
    }catch(e){ LOG("poll 出错",e&&e.message); }
  },150);
  // 调试：__fields.test("lava") 立即在当前对局换成该场地
  F.test=function(id){ var gm=games(); if(!gm||!F.byId[id])return false; stopCur("test"); startField(F.byId[id],gm); if(F.cur)F.cur.picked=true; return true; };
  F.stop=function(){ stopCur("手动"); };
})();

// ================= 预选场地面板：不在对局中时左上角出现按钮，选好接下来 5 局的场地 =================
(function(){
  var F=window.__fields; if(!F||F.__picker)return; F.__picker=true;
  var btn=null, panel=null, slot=0;
  function inRound(){
    try{
      var c=cc.find("Canvas"), gm=c&&c.getComponent("Games");
      return !!(gm&&gm.player&&gm.player.isValid&&gm.enemy&&gm.enemy.isValid);
    }catch(_){ return false; }
  }
  function defs(){ return F.list.slice().sort(function(a,b){ return (a.no||0)-(b.no||0); }); }
  function label(id){ var d=F.byId[id]; return d?(d.emoji||"")+" "+d.name:"🎲 随机"; }
  function css(el,s){ el.style.cssText=s; return el; }
  function mkBtn(){
    btn=css(document.createElement("div"),"position:fixed;left:10px;top:10px;z-index:100040;padding:7px 12px;border-radius:999px;background:rgba(20,26,40,.88);color:#ffe08a;font:700 14px system-ui,'Microsoft YaHei',sans-serif;border:2px solid #ffcf4a;cursor:pointer;user-select:none;box-shadow:0 2px 8px rgba(0,0,0,.35)");
    btn.addEventListener("click",function(e){ e.stopPropagation(); open(); });
    document.body.appendChild(btn);
  }
  function refreshBtn(){
    if(!btn)mkBtn();
    var q=F.queue().filter(function(x){ return x!=="random"; });
    btn.textContent="🎯 预选场地"+(q.length?"（"+q.length+"）":"");
  }
  function close(){ if(panel&&panel.parentNode)panel.parentNode.removeChild(panel); panel=null; refreshBtn(); }
  function getQ(){ var q=F.queue(); while(q.length<5)q.push("random"); return q.slice(0,5); }
  function setSlot(id){
    var q=getQ(); q[slot]=id;
    var any=q.some(function(x){ return x!=="random"; });
    F.saveQueue(any?q:[]);
    slot=Math.min(4,slot+1); draw();
  }
  function draw(){
    if(!panel)return;
    var q=getQ(), box=panel.firstChild; box.innerHTML="";
    var h=document.createElement("div"); h.style.cssText="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;min-height:44px";
    h.innerHTML="<div style='font-size:19px;font-weight:800;color:#fff;margin-left:52px'>预选接下来 5 局的场地</div>";
    var x=css(document.createElement("div"),"position:absolute;left:10px;top:8px;width:44px;height:44px;border-radius:9px;background:linear-gradient(#b4b9c2,#8a909b);border:3px solid #4a4f58;color:#fff;font:900 26px/38px system-ui,sans-serif;text-align:center;cursor:pointer;box-shadow:0 3px 0 #4a4f58"); x.textContent="✕"; x.onclick=close; box.appendChild(x); box.appendChild(h);
    var tip=document.createElement("div"); tip.style.cssText="font-size:12px;color:#cfe4ff;margin-bottom:10px"; tip.textContent="点上面的格子选第几局，再点下面的场地。按顺序每局用掉一个；「随机」照常抽。自选的局不记进战斗日志。"; box.appendChild(tip);
    var row=css(document.createElement("div"),"display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin-bottom:12px");
    q.forEach(function(id,i){
      var c=css(document.createElement("div"),"cursor:pointer;border-radius:10px;padding:6px 4px;text-align:center;font-size:13px;font-weight:700;background:"+(i===slot?"#2f86d0":"#1d70b7")+";border:3px solid "+(i===slot?"#ffcf4a":"#58a6e3"));
      c.innerHTML="<div style='font-size:11px;color:#cfe4ff'>第"+(i+1)+"局</div><div style='white-space:nowrap;overflow:hidden;text-overflow:ellipsis'>"+label(id)+"</div>";
      c.onclick=function(){ slot=i; draw(); };
      row.appendChild(c);
    });
    box.appendChild(row);
    var grid=css(document.createElement("div"),"display:grid;grid-template-columns:repeat(auto-fill,minmax(104px,1fr));gap:6px;max-height:42vh;overflow-y:auto;padding-right:2px");
    [{id:"random",emoji:"🎲",name:"随机"}].concat(defs()).forEach(function(d){
      var on=q[slot]===d.id;
      var c=css(document.createElement("div"),"cursor:pointer;border-radius:10px;padding:8px 6px;font-size:13px;font-weight:700;border:3px solid "+(on?"#ffcf4a":"#58a6e3")+";background:"+(on?"#ffcf4a":"#1d70b7")+";color:"+(on?"#1b1b1b":"#fff")+";white-space:nowrap;overflow:hidden;text-overflow:ellipsis");
      c.title=d.desc||""; c.textContent=(d.emoji||"")+" "+d.name;
      c.onclick=function(){ setSlot(d.id); };
      grid.appendChild(c);
    });
    box.appendChild(grid);
    var bar=css(document.createElement("div"),"display:flex;gap:8px;justify-content:flex-end;margin-top:12px");
    function b(t,fn,main){ var e=css(document.createElement("div"),"cursor:pointer;padding:7px 14px;border-radius:8px;font-weight:700;font-size:14px;background:"+(main?"linear-gradient(#ffd54f,#ffa726)":"#1d70b7")+";border:3px solid "+(main?"#5d3a14":"#58a6e3")+";color:"+(main?"#5d3a14":"#fff")); e.textContent=t; e.onclick=fn; bar.appendChild(e); }
    var BL=window.__battlelog;
    if(BL&&BL.noLog){
      var nl=BL.noLog();
      var t=css(document.createElement("div"),"cursor:pointer;margin-right:auto;align-self:center;font-size:13px;color:"+(nl?"#ffcf4a":"#aab3c7"));
      t.textContent=(nl?"☑":"☐")+" 这台设备不记战斗日志";
      t.onclick=function(){ BL.noLog(!BL.noLog()); draw(); };
      bar.appendChild(t);
    }
    b("全部清空",function(){ F.saveQueue([]); slot=0; draw(); });
    b("完成",close,true);
    box.appendChild(bar);
  }
  function open(){
    if(panel)return;
    panel=css(document.createElement("div"),"position:fixed;inset:0;z-index:100050;background:rgba(0,0,0,.39);display:flex;align-items:center;justify-content:center;font-family:system-ui,'Microsoft YaHei',sans-serif");
    var box=css(document.createElement("div"),"width:min(560px,94vw);max-height:92vh;overflow:auto;background:#2564aa;color:#fff;border:4px solid #1a4f8c;border-radius:18px;padding:14px 16px;box-shadow:0 10px 40px rgba(0,0,0,.4);position:relative");
    panel.appendChild(box);
    panel.addEventListener("click",function(e){ if(e.target===panel)close(); });
    ["touchstart","touchend","mousedown","mouseup"].forEach(function(ev){ panel.addEventListener(ev,function(e){ e.stopPropagation(); }); });
    document.body.appendChild(panel);
    var q=F.queue(); slot=0; for(var i=0;i<5;i++){ if(!q[i]||q[i]==="random"){ slot=i; break; } }
    draw();
  }
  F.openPicker=open;
  setInterval(function(){
    try{
      if(!document.body||!window.cc||!cc.director)return;
      var show=!inRound()&&!window.__r23hideDom;
      refreshBtn();
      btn.style.display=show?"block":"none";
      if(inRound()&&panel)close();
    }catch(_){}
  },400);
  F.openPicker=open;
})();


// ---- 01_lowgravity.js ----
(function(){ try{
// 1 低重力：重力只有平时的三分之一，跳得高、落得慢，打一下飞很远
__fields.register({
  id:"lowgravity", no:1, name:"低重力", emoji:"🌙",
  desc:"重力只有平时六分之一，打一下飞很远",
  start:function(ctx){
    ctx.setGravity(ctx.gravity0.x/6, ctx.gravity0.y/6);   // 回合结束内核自动还原重力
  }
});

}catch(e){ try{ __fields.log('加载失败','01_lowgravity.js',e&&e.message); }catch(_){} } })();


// ---- 02_ice.js ----
(function(){ try{
// 2 冰面：两人身上所有碰撞体摩擦为 0，脚下打滑停不下；速度掉得太快就补回一部分惯性
__fields.register({
  id:"ice", no:2, name:"冰面", emoji:"❄️",
  desc:"地面结冰，停不下来",
  start:function(ctx){
    var cols=[], saved=[];
    ctx.players.forEach(function(n){
      if(!n||!n.isValid)return;
      n.getComponentsInChildren(cc.PhysicsCollider).forEach(function(col){
        cols.push(col); saved.push(col.friction);
        col.friction=0; try{ col.apply(); }catch(_){}
      });
    });
    ctx._iceCols=cols; ctx._iceSaved=saved;
    var last=ctx.players.map(function(){ return 0; });
    ctx.onUpdate(function(){
      ctx.players.forEach(function(n,i){
        if(ctx.isDead(n))return;
        var rb=ctx.bodyRb(n); if(!rb)return;
        var vx=rb.linearVelocity.x, L=last[i];
        // 还在朝同一方向滑，但速度突然掉了 15% 以上：补回一部分惯性（反向撞击不补）
        if(Math.abs(L)>40 && vx*L>0 && Math.abs(vx)<Math.abs(L)*0.97){
          var nv=L*0.995;
          ctx.parts(n).forEach(function(r){ r.linearVelocity=cc.v2(nv,r.linearVelocity.y); });
          last[i]=nv;
        } else last[i]=vx;
      });
    });
  },
  stop:function(ctx){
    var cols=ctx._iceCols||[], saved=ctx._iceSaved||[];
    cols.forEach(function(col,i){
      if(col&&col.isValid!==false){ col.friction=saved[i]; try{ col.apply(); }catch(_){} }
    });
  }
});

}catch(e){ try{ __fields.log('加载失败','02_ice.js',e&&e.message); }catch(_){} } })();


// ---- 03_wind.js ----
(function(){ try{
// 3 狂风：整局有风，每 8 秒换一次方向；换之前 1 秒屏幕中间给预警。风持续推两人，画面上有白色细线随风飘
__fields.register({
  id:"wind", no:3, name:"狂风", emoji:"🌬️",
  desc:"狂风大作，每8秒换一次方向",
  start:function(ctx){
    var W=ctx._wind={cur:ctx.pick([-1,1])};
    W.nxt=-W.cur; W.next=8; W.warned=false; W.warnNode=null;
    var rect=ctx.mapRect();
    var mid=ctx.toCanvas(cc.v2(rect.x+rect.width/2, rect.y+rect.height/2));
    var A=ctx.toCanvas(cc.v2(rect.x,rect.y)), B=ctx.toCanvas(cc.v2(rect.x+rect.width,rect.y+rect.height));

    // 风线（Canvas 坐标，画在人物后面）
    var g=ctx.graphics(cc.v2(0,0),290);
    var lines=[];
    if(g&&A&&B){
      for(var i=0;i<14;i++){
        lines.push({ x:A.x+Math.random()*(B.x-A.x), y:A.y+Math.random()*(B.y-A.y), len:60+Math.random()*90 });
      }
    }

    ctx.onUpdate(function(dt){
      var t=ctx.elapsed();
      // 换向预警：换之前 1 秒，屏幕中间显示下一次的风向
      if(!W.warned && t>=W.next-1){
        W.warned=true;
        if(mid){ W.warnNode=ctx.label(W.nxt>0?"风即将往右吹 →":"风即将往左吹 ←", mid, 64, cc.color(255,240,140,255), 440); }
      }
      // 换向
      if(t>=W.next){
        W.cur=W.nxt; W.nxt=-W.cur; W.next+=8; W.warned=false;
        if(W.warnNode&&W.warnNode.isValid)W.warnNode.destroy();
        W.warnNode=null;
      }
      // 给两人所有刚体加水平速度（约 250 px/s），风造成的速度上限 450
      var dir=W.cur, acc=800*dt;
      ctx.players.forEach(function(n){
        if(ctx.isDead(n))return;
        ctx.parts(n).forEach(function(rb){
          var v=rb.linearVelocity, along=v.x*dir;
          if(along<1100){
            var add=Math.min(acc, 1100-along);
            rb.linearVelocity=cc.v2(v.x+dir*add, v.y);
          }
        });
      });
      // 风线飘动
      if(g&&lines.length){
        g.clear();
        g.strokeColor=cc.color(255,255,255,150);
        g.lineWidth=3;
        lines.forEach(function(l){
          l.x+=dir*1100*dt;
          if(dir>0&&l.x>B.x){ l.x=A.x; l.y=A.y+Math.random()*(B.y-A.y); }
          if(dir<0&&l.x<A.x){ l.x=B.x; l.y=A.y+Math.random()*(B.y-A.y); }
          g.moveTo(l.x,l.y); g.lineTo(l.x-dir*l.len,l.y); g.stroke();
        });
      }
    });
  }
});

}catch(e){ try{ __fields.log('加载失败','03_wind.js',e&&e.message); }catch(_){} } })();


// ---- 04_tiny.js ----
(function(){ try{
// 4 小人国：双方都变小（缩到一半），整局
__fields.register({
  id:"tiny", no:4, name:"小人国", emoji:"🐜",
  desc:"双方都变小，整局",
  start:function(ctx){
    if(!ctx.R){ ctx.log("tiny: 没有特效库 ctx.R"); return; }
    ctx.players.forEach(function(n){
      ctx.R.applyScaleRoll(n,"shrink",3,600000);
      n.__shrunk=false;                       // 游戏对 __shrunk 为 true 的人会加速，这里不要加速
    });
  },
  stop:function(ctx){
    if(!ctx.R)return;
    ctx.players.forEach(function(n){ ctx.R.restoreScale(n); });
  }
});

}catch(e){ try{ __fields.log('加载失败','04_tiny.js',e&&e.message); }catch(_){} } })();


// ---- 05_giant.js ----
(function(){ try{
// 5 巨人国：双方都变大（放大 1.6 倍），整局
__fields.register({
  id:"giant", no:5, name:"巨人国", emoji:"🗿",
  desc:"双方都变大，整局",
  start:function(ctx){
    if(!ctx.R){ ctx.log("giant: 没有特效库 ctx.R"); return; }
    ctx.players.forEach(function(n){
      ctx.R.applyScaleRoll(n,"giant",2.3,600000);
    });
  },
  stop:function(ctx){
    if(!ctx.R)return;
    ctx.players.forEach(function(n){ ctx.R.restoreScale(n); });
  }
});

}catch(e){ try{ __fields.log('加载失败','05_giant.js',e&&e.message); }catch(_){} } })();


// ---- 06_glasscannon.js ----
(function(){ try{
// 6 玻璃大炮：双方开局只有一半血，伤害不变（只减当前血量，最大血量不动，百分比伤害照旧）
__fields.register({
  id:"glasscannon", no:6, name:"玻璃大炮", emoji:"💥",
  desc:"只剩四分之一血，伤害翻倍",
  start:function(ctx){
    ctx.onHit(function(v,dmg,info){ return info.terrain?dmg:dmg*2; });
    ctx.players.forEach(function(n){
      var h=ctx.hc(n); if(!h)return;
      h.hp=Math.min(h.hp,h.maxhp/4);
      try{ h.HealthBar.getComponent(cc.ProgressBar).progress=h.hp/h.maxhp; }catch(_){}
    });
  }
});

}catch(e){ try{ __fields.log('加载失败','06_glasscannon.js',e&&e.message); }catch(_){} } })();


// ---- 07_vampire.js ----
(function(){ try{
// 7 吸血场：武器打中人时，攻击者回复 30% 的伤害量的血（地形伤害不算）
__fields.register({
  id:"vampire", no:7, name:"吸血场", emoji:"🦇",
  desc:"打中人回复等量的血",
  start:function(ctx){
    ctx.onHit(function(victimHc,dmg,info){
      if(!info.terrain && info.attacker && dmg>0) ctx.heal(info.attacker, dmg*1.0);
      return dmg;
    });
  }
});

}catch(e){ try{ __fields.log('加载失败','07_vampire.js',e&&e.message); }catch(_){} } })();


// ---- 08_itemrain.js ----
(function(){ try{
// 8 道具丰收：道具刷新速度翻倍
__fields.register({
  id:"itemrain", no:8, name:"道具丰收", emoji:"🎁",
  desc:"道具像下雨一样刷",
  start:function(ctx){
    ctx.items.rate=5;
  }
});

}catch(e){ try{ __fields.log('加载失败','08_itemrain.js',e&&e.message); }catch(_){} } })();


// ---- 09_nofx.js ----
(function(){ try{
// 9 纯拳脚：不刷道具，开局把场上已有的道具清掉，只靠拳脚
__fields.register({
  id:"nofx", no:9, name:"纯拳脚", emoji:"🥊",
  desc:"不刷道具，只靠拳脚",
  start:function(ctx){
    ctx.items.off=true;
    var cn=ctx.canvas||cc.find("Canvas"), root=cn&&cn.getChildByName("Items");
    if(!root)return;
    root.children.slice().forEach(function(n){
      if(n&&n.isValid&&n.name==="BuffItem") n.active=false;
    });
  }
});

}catch(e){ try{ __fields.log('加载失败','09_nofx.js',e&&e.message); }catch(_){} } })();


// ---- 10_ultfest.js ----
(function(){ try{
// 10 大招狂欢：大招冷却只要五分之一
__fields.register({
  id:"ultfest", no:10, name:"大招狂欢", emoji:"⚡",
  desc:"大招冷却减半",
  start:function(ctx){
    ctx.bigCdMul=0.2;
  }
});

}catch(e){ try{ __fields.log('加载失败','10_ultfest.js',e&&e.message); }catch(_){} } })();


// ---- 11_meteors.js ----
(function(){ try{
// 11 流星天：整局随机落陨石，落点在某个玩家附近，红圈预警 0.8 秒后砸下
__fields.register({
  id:"meteors", no:11, name:"流星天", emoji:"☄️",
  desc:"陨石随机砸向附近，红圈先预警",
  start:function(ctx){
    if(!ctx.R){ ctx.log("meteors: 没有特效库 ctx.R"); return; }
    var idx=0;
    var WARN=800, FALL=500, RADIUS=260;

    function drop(){
      var alive=ctx.players.filter(function(n){ return !ctx.isDead(n) && ctx.bodyPos(n); });
      if(!alive.length)return;
      var base=ctx.pick(alive), bp=ctx.bodyPos(base);
      var wp=cc.v2(bp.x+ctx.rnd(-300,300), bp.y+ctx.rnd(-300,300));
      var cp=ctx.toCanvas(wp);
      if(!cp)return;
      var my=idx++;

      // 1. 红圈预警
      var g=ctx.graphics(cp,350);
      var gn=g&&g.node;
      if(g){
        g.lineWidth=6;
        g.strokeColor=cc.color(255,40,40,230);
        g.fillColor=cc.color(255,40,40,70);
        g.circle(0,0,RADIUS); g.fill(); g.stroke();
      }
      // 2. 预警结束：陨石落下（R.meteor 自己的 onHit 不可靠，这里不依赖它）
      ctx.after(WARN, function(){
        if(gn&&gn.isValid)gn.destroy();
        ctx.R.meteor(cp, my, function(){});
      });
      // 3. 预警结束 + 0.5 秒：判定伤害
      ctx.after(WARN+FALL, function(){
        ctx.players.forEach(function(n){
          if(ctx.isDead(n))return;
          var pc=ctx.canvasPt(n);
          if(!pc)return;
          var dx=pc.x-cp.x, dy=pc.y-cp.y;
          if(Math.sqrt(dx*dx+dy*dy)<=RADIUS){
            var dir=dx>=0?1:-1;
            ctx.hurtPct(n,16,dir*900,1100);
          }
        });
        ctx.R.impact(cp);
      });
    }

    function next(){
      ctx.after(ctx.rnd(1000,1800), function(){ drop(); next(); });
    }
    next();
  }
});

}catch(e){ try{ __fields.log('加载失败','11_meteors.js',e&&e.message); }catch(_){} } })();


// ---- 12_weaponswap.js ----
(function(){ try{
// 12 武器轮换：开局和之后每 15 秒，两人同时换一把随机武器（换之前 1 秒提示）
__fields.register({
  id:"weaponswap", no:12, name:"武器轮换", emoji:"🔁",
  desc:"每6秒两人同时换一把随机武器",
  start:function(ctx){
    function warnAll(){
      ctx.players.forEach(function(n){
        if(!ctx.isDead(n)) ctx.toast("1 秒后换武器", n);
      });
    }
    function swapAll(){
      ctx.players.forEach(function(n){
        if(!ctx.isDead(n)) ctx.applyItem(4, n);
      });
    }
    // 开局：先提示，1 秒后换第一次
    warnAll();
    ctx.after(1000, swapAll);
    // 之后：每 15 秒提示，提示后 1 秒换
    ctx.every(6000, function(){
      warnAll();
      ctx.after(1000, swapAll);
    });
  }
});

}catch(e){ try{ __fields.log('加载失败','12_weaponswap.js',e&&e.message); }catch(_){} } })();


// ---- 13_heavyhit.js ----
(function(){ try{
// 13 重击：打中人时击退力度×3.5，一碰就飞
__fields.register({
  id:"heavyhit", no:13, name:"重击", emoji:"🔨",
  desc:"击退力度翻倍，伤害不变",
  start:function(ctx){
    ctx.onHit(function(victimHc,dmg,info){
      if(!info.terrain && info.victim) ctx.scaleVelNextStep(info.victim,3.5);
      return dmg;
    });
  }
});

}catch(e){ try{ __fields.log('加载失败','13_heavyhit.js',e&&e.message); }catch(_){} } })();


// ---- 14_lava.js ----
(function(){ try{
// 14 岩浆：岩浆从地图底部慢慢涨，最多涨到地图三分之一高，碰到持续掉血
__fields.register({
  id:"lava", no:14, name:"岩浆", emoji:"🌋",
  desc:"岩浆从底部慢慢上涨，碰到就烫",
  start:function(ctx){
    var r=ctx.mapRect();                       // 世界坐标
    var bottom=r.y, startTop=r.y+r.height*0.12, maxTop=r.y+r.height*0.4, rise=15;   // 开局就有一层，15 秒涨到 40%
    var g=ctx.graphics(cc.v2(0,0),280);
    var lastHurt={};
    ctx.onUpdate(function(dt){
      var k=Math.min(1,ctx.elapsed()/rise), top=startTop+(maxTop-startTop)*k+Math.sin(ctx.elapsed()*2)*6;
      // 画（Canvas 坐标）
      var a=ctx.toCanvas(cc.v2(r.x,bottom)), b=ctx.toCanvas(cc.v2(r.x+r.width,top));
      g.clear();
      g.fillColor=cc.color(255,90,20,215); g.rect(a.x,a.y,b.x-a.x,b.y-a.y); g.fill();
      g.fillColor=cc.color(255,200,60,230); g.rect(a.x,b.y-10,b.x-a.x,10); g.fill();
      // 碰到：任一身体部件低于岩浆面
      ctx.players.forEach(function(n,i){
        if(ctx.isDead(n))return;
        var hit=ctx.parts(n).some(function(rb){ return ctx.partPos(rb).y<top; });
        if(hit&&ctx.now()-(lastHurt[i]||0)>500){ lastHurt[i]=ctx.now(); ctx.hurtPct(n,10); ctx.addVel(n,0,1000); }
      });
    });
  }
});

}catch(e){ try{ __fields.log('加载失败','14_lava.js',e&&e.message); }catch(_){} } })();


// ---- 15_shrinkzone.js ----
(function(){ try{
// 15 缩圈：毒雾从左右两边往中间收，60 秒收到只剩中间 30%，站在毒雾里持续掉血
__fields.register({
  id:"shrinkzone", no:15, name:"缩圈", emoji:"☠️",
  desc:"毒雾从两边往中间收，别被吞掉",
  start:function(ctx){
    var r=ctx.mapRect();
    var total=r.width*0.42, dur=15;                 // 每边最多收 35% 宽，剩中间 30%
    var g=ctx.graphics(cc.v2(0,0),280);
    var lastHurt=[0,0];
    var t0=ctx.elapsed();
    function inset(){ return total*Math.min(1,(ctx.elapsed()-t0)/dur); }
    ctx.onUpdate(function(dt){
      var ins=inset(), T=ctx.elapsed();
      var yb=r.y, yt=r.y+r.height;
      var lA=ctx.toCanvas(cc.v2(r.x,yb)), lB=ctx.toCanvas(cc.v2(r.x+ins,yt));
      var rA=ctx.toCanvas(cc.v2(r.x+r.width-ins,yb)), rB=ctx.toCanvas(cc.v2(r.x+r.width,yt));
      var h=lB.y-lA.y, pulse=0.5+0.5*Math.sin(T*3);
      g.clear();
      if(ins>1){
        g.fillColor=cc.color(110,40,170,Math.round(95+25*pulse));
        g.rect(lA.x,lA.y,lB.x-lA.x,h); g.rect(rA.x,rA.y,rB.x-rA.x,h); g.fill();
        g.fillColor=cc.color(90,220,90,Math.round(35+25*(1-pulse)));
        g.rect(lA.x,lA.y,(lB.x-lA.x)*0.6,h); g.rect(rB.x-(rB.x-rA.x)*0.6,rA.y,(rB.x-rA.x)*0.6,h); g.fill();
        // 边缘亮线
        g.strokeColor=cc.color(150,255,90,Math.round(120+100*pulse)); g.lineWidth=6;
        g.moveTo(lB.x,lA.y); g.lineTo(lB.x,lB.y); g.moveTo(rA.x,rA.y); g.lineTo(rA.x,rB.y); g.stroke();
        g.strokeColor=cc.color(230,255,200,230); g.lineWidth=2;
        g.moveTo(lB.x,lA.y); g.lineTo(lB.x,lB.y); g.moveTo(rA.x,rA.y); g.lineTo(rA.x,rB.y); g.stroke();
      }
      // 判定：躯干在雾里每 0.5 秒扣 3%
      ctx.players.forEach(function(n,i){
        if(ctx.isDead(n))return;
        var p=ctx.bodyPos(n); if(!p)return;
        if(ins>1&&(p.x<r.x+ins||p.x>r.x+r.width-ins)&&ctx.now()-lastHurt[i]>500){
          lastHurt[i]=ctx.now(); ctx.hurtPct(n,8); ctx.toast("毒雾",n,cc.color(170,255,110),20);
        }
      });
    });
  }
});

}catch(e){ try{ __fields.log('加载失败','15_shrinkzone.js',e&&e.message); }catch(_){} } })();


// ---- 17_planet.js ----
(function(){ try{
// 17 小行星：重力朝地图中心拉，人和道具都被吸向中央
__fields.register({
  id:"planet", no:17, name:"小行星", emoji:"🌍",
  desc:"重力朝地图中心，不再朝下",
  start:function(ctx){
    ctx.setGravity(0,0);
    var r=ctx.mapRect(), cx=r.x+r.width/2, cy=r.y+r.height/2, G=650;
    function pull(rb,dt){
      if(!rb||!rb.node||!rb.node.isValid)return;
      var p=cc.v2(); rb.getWorldPosition(p);
      var dx=cx-p.x, dy=cy-p.y, d=Math.sqrt(dx*dx+dy*dy); if(d<1)return;
      var v=rb.linearVelocity, a=G*dt/d;
      rb.linearVelocity=cc.v2(v.x+dx*a, v.y+dy*a);
    }
    ctx.onUpdate(function(dt){
      if(dt>0.1)dt=0.1;
      ctx.players.forEach(function(n){
        if(!n||!n.isValid)return;
        ctx.parts(n).forEach(function(rb){ pull(rb,dt); });
      });
      var items=ctx.canvas&&ctx.canvas.getChildByName("Items");
      if(items&&items.isValid){
        items.children.forEach(function(ch){ var rb=ch.getComponent(cc.RigidBody); if(rb)pull(rb,dt); });
      }
    });
  }
});

}catch(e){ try{ __fields.log('加载失败','17_planet.js',e&&e.message); }catch(_){} } })();


// ---- 18_invisible.js ----
(function(){ try{
// 18 隐形平台：地面/平台的图都看不见，人靠近的那一块才会亮；这局尖刺不扣血
__fields.register({
  id:"invisible", no:18, name:"隐形平台", emoji:"👻",
  desc:"平台看不见，靠近才会亮",
  start:function(ctx){
    var ents=[];
    function skip(n){ for(var p=n;p;p=p.parent){ if(p.name==="Walls"||p.group==="deads")return true; if(p.name==="Canvas")break; } return false; }
    var cv=cc.find("Canvas"), G=cv&&cv.getChildByName("Ground");
    if(G){
      G.getComponentsInChildren(cc.Sprite).forEach(function(sp){
        var sn=sp.node; if(skip(sn))return;
        ents.push({s:sn,orig:sn.opacity,a:0});
      });
    }
    ctx.spikes(false);
    ents.forEach(function(e){ e.s.opacity=0; });
    ctx.log("隐形平台图数",ents.length);
    ctx.onUpdate(function(dt){
      var pts=[];
      ctx.players.forEach(function(n){ if(ctx.isDead(n))return; ctx.parts(n).forEach(function(rb){ pts.push(ctx.partPos(rb)); }); });
      var M=90, step=255*5*dt;
      ents.forEach(function(e){
        if(!e.s.isValid)return;
        var b=null; try{ b=e.s.getBoundingBoxToWorld(); }catch(_){}
        var near=false;
        if(b){ for(var i=0;i<pts.length;i++){ var p=pts[i]; if(p.x>b.x-M&&p.x<b.xMax+M&&p.y>b.y-M&&p.y<b.yMax+M){ near=true; break; } } }
        var to=near?255:0;
        if(e.a<to)e.a=Math.min(to,e.a+step); else if(e.a>to)e.a=Math.max(to,e.a-step*0.5);
        e.s.opacity=Math.round(e.a*e.orig/255);
      });
    });
    ctx.onCleanup(function(){ ents.forEach(function(e){ if(e.s.isValid)e.s.opacity=e.orig; }); });
  }
});

}catch(e){ try{ __fields.log('加载失败','18_invisible.js',e&&e.message); }catch(_){} } })();


// ---- 19_hotpotato.js ----
(function(){ try{
// 19 烫手山芋：一颗倒计时炸弹绑在一个人身上，30 秒后在持有者身上爆炸（-50%），打中对方就能把炸弹传过去
__fields.register({
  id:"hotpotato", no:19, name:"烫手山芋", emoji:"💣",
  desc:"炸弹绑在身上，打中对方传过去",
  start:function(ctx){
    var FUSE=15, holder=null, left=FUSE, nextAt=0, nextTarget=null, lastPass=-9999;
    var bomb=ctx.sprite("/assets/icons/fields/hp_bomb.png",cc.v2(0,0),220,220,420);
    var lab=ctx.label("15",cc.v2(0,0),70,cc.Color.WHITE,425);
    if(bomb)bomb.active=false;
    if(lab)lab.active=false;
    function give(n){
      holder=n; left=FUSE;
      if(bomb)bomb.active=true;
      if(lab)lab.active=true;
      ctx.toast("你身上有炸弹！",n,new cc.Color(255,90,60));
    }
    ctx.after(800,function(){ give(ctx.pick(ctx.players)); });
    ctx.onHit(function(vhc,dmg,info){
      if(!holder||info.terrain)return dmg;
      if(info.attacker===holder&&vhc.node===ctx.opp(holder)&&ctx.now()-lastPass>1000){
        lastPass=ctx.now(); holder=vhc.node;
        ctx.toast("炸弹传给你！",holder,new cc.Color(255,90,60));
      }
      return dmg;
    });
    ctx.onUpdate(function(dt){
      if(nextAt&&ctx.now()>=nextAt){ nextAt=0; if(!ctx.isDead(nextTarget))give(nextTarget); }
      if(!holder||!bomb)return;
      var b=ctx.bodyPos(holder); if(!b)return;
      var c=ctx.toCanvas(b);
      left-=dt;
      var flash=left<=5&&Math.floor(left*6)%2===0;
      bomb.setPosition(c.x,c.y+200);
      bomb.color=flash?new cc.Color(255,70,70):cc.Color.WHITE;
      bomb.scale=1+(left<=5?0.12*Math.sin(left*20):0);
      lab.setPosition(c.x,c.y+190);
      lab.color=left<=5?new cc.Color(255,60,60):cc.Color.WHITE;
      lab.getComponent(cc.Label).string=String(Math.max(0,Math.ceil(left)));
      if(left<=0){
        var h=holder; holder=null; bomb.active=false; lab.active=false;
        ctx.R.impact(c,new cc.Color(255,120,30));
        ctx.R.drawRing(c,new cc.Color(255,120,30),150,10,500,0);
        ctx.hurtPct(h,60,0,900);
        nextTarget=ctx.opp(h); nextAt=ctx.now()+2000;
      }
    });
  }
});

}catch(e){ try{ __fields.log('加载失败','19_hotpotato.js',e&&e.message); }catch(_){} } })();


// ---- 20_crown.js ----
(function(){ try{
// 20 王冠：戴上王冠每秒回 1.5% 血、武器伤害 x1.3；戴冠者被打中王冠就掉落
__fields.register({
  id:"crown", no:20, name:"王冠", emoji:"👑",
  desc:"戴王冠回血增伤，被打中就掉",
  start:function(ctx){
    function findNode(root,names){ var r=null; (function w(n){ if(r)return; if(names.indexOf(n.name)>=0){ r=n; return; } for(var i=0;i<n.children.length;i++)w(n.children[i]); })(root); return r; }
    var headCache={};
    function headWorld(n){
      var i=n===ctx.p1?0:1, h=headCache[i];
      if(!h||!h.isValid){ h=headCache[i]=findNode(n,["head","Head"]); }
      if(h&&h.isValid)return h.convertToWorldSpaceAR(cc.v2(0,0));
      var b=ctx.bodyPos(n); return b?cc.v2(b.x,b.y+70):null;
    }
    var r=ctx.mapRect(), wearer=null, lockUntil=0;
    var pos=cc.v2(r.x+r.width/2,r.y+r.height*0.62);
    var cr=ctx.sprite("/assets/icons/fields/crown.png",ctx.toCanvas(pos),200,200,420);
    ctx.every(1000,function(){
      if(wearer&&!ctx.isDead(wearer)){ var h=ctx.hc(wearer); ctx.heal(wearer,h.maxhp*0.04); }
    });
    ctx.onHit(function(vhc,dmg,info){
      if(info.terrain)return dmg;
      if(wearer&&info.attacker===wearer&&vhc.node!==wearer)return dmg*2;
      if(wearer&&vhc.node===wearer){
        var b=ctx.bodyPos(wearer); wearer=null;
        if(b)pos=cc.v2(b.x,b.y+80);
        lockUntil=ctx.now()+800;
        ctx.toast("王冠掉了！",vhc.node,new cc.Color(255,210,60));
      }
      return dmg;
    });
    ctx.onUpdate(function(dt){
      if(!cr)return;
      var t=ctx.elapsed();
      if(wearer){
        var hw=headWorld(wearer);
        if(hw){ var c=ctx.toCanvas(hw); cr.setPosition(c.x,c.y+110); cr.opacity=255; cr.setContentSize(150,150); }
        return;
      }
      var locked=ctx.now()<lockUntil;
      var c2=ctx.toCanvas(pos);
      cr.setPosition(c2.x,c2.y+Math.sin(t*3)*8);
      cr.setContentSize(200,200);
      cr.opacity=locked?(Math.floor(t*12)%2?90:200):255;
      if(locked)return;
      var best=null, bd=160*160;
      ctx.players.forEach(function(n){
        if(ctx.isDead(n))return;
        var b=ctx.bodyPos(n); if(!b)return;
        var dx=b.x-pos.x, dy=b.y-pos.y, d=dx*dx+dy*dy;
        if(d<bd){ bd=d; best=n; }
      });
      if(best){ wearer=best; ctx.toast("戴上王冠！",best,new cc.Color(255,210,60)); }
    });
  }
});

}catch(e){ try{ __fields.log('加载失败','20_crown.js',e&&e.message); }catch(_){} } })();


// ---- 21_chest.js ----
(function(){ try{
// 21 宝箱：打开宝箱得到随机道具，然后宝箱瞬移到别处
__fields.register({
  id:"chest", no:21, name:"宝箱", emoji:"🧰",
  desc:"打开宝箱得道具，宝箱会瞬移",
  start:function(ctx){
    function findNode(root,names){ var r=null; (function w(n){ if(r)return; if(names.indexOf(n.name)>=0){ r=n; return; } for(var i=0;i<n.children.length;i++)w(n.children[i]); })(root); return r; }
    function strikePts(n){
      var out=[]; if(!ctx.valid(n))return out;
      n.getComponentsInChildren(cc.PhysicsCollider).forEach(function(c){
        var g=c.node.group; if(g!=="weapons1"&&g!=="weapons2")return;
        out.push(c.node.convertToWorldSpaceAR(cc.v2(0,0)));
        try{ var bb=c.getAABB(); out.push(cc.v2(bb.x+bb.width/2,bb.y+bb.height/2)); }catch(_){}
      });
      ["handL","handR"].forEach(function(nm){ var h=findNode(n,[nm]); if(h)out.push(h.convertToWorldSpaceAR(cc.v2(0,0))); });
      return out;
    }
    function struck(n,wp,rad){
      var ps=strikePts(n);
      for(var i=0;i<ps.length;i++){ var dx=ps[i].x-wp.x, dy=ps[i].y-wp.y; if(dx*dx+dy*dy<(rad+30)*(rad+30))return true; }
      return false;
    }
    var POOL=[0,1,2,3,7,38,64,70,80,85,101];
    var r=ctx.mapRect(), readyAt=0, RAD=110;
    function farFromPlayers(p){
      return ctx.players.every(function(n){
        var b=ctx.bodyPos(n); if(!b)return true;
        var dx=b.x-p.x, dy=b.y-p.y; return dx*dx+dy*dy>=300*300;
      });
    }
    function newPos(){
      var best=null;
      for(var i=0;i<40;i++){
        var p=cc.v2(ctx.rnd(r.x+80,r.xMax-80),ctx.rnd(r.y+80,r.yMax-80));
        if(farFromPlayers(p))return p;
        best=p;
      }
      return best;
    }
    var pos=newPos();
    var ch=ctx.sprite("/assets/icons/fields/chest.png",ctx.toCanvas(pos),260,260,420);
    ctx.onUpdate(function(dt){
      if(!ch)return;
      var t=ctx.elapsed(), now=ctx.now();
      var c=ctx.toCanvas(pos);
      ch.setPosition(c.x,c.y+Math.sin(t*3)*6);
      var ready=now>=readyAt;
      ch.opacity=ready?255:110;
      if(!ready)return;
      for(var i=0;i<2;i++){
        var n=ctx.players[i]; if(ctx.isDead(n))continue;
        if(struck(n,pos,RAD)){
          var cp=ctx.toCanvas(pos);
          ctx.applyItem(ctx.pick(POOL),n);
          ctx.R.impact(cp,new cc.Color(255,220,80));
          ctx.R.drawRing(cp,new cc.Color(255,220,80),120,8,450,0);
          ctx.toast("开箱！",n,new cc.Color(255,220,80));
          pos=newPos(); readyAt=now+1000;
          break;
        }
      }
    });
  }
});

}catch(e){ try{ __fields.log('加载失败','21_chest.js',e&&e.message); }catch(_){} } })();


// ---- 22_bounty.js ----
(function(){ try{
// 22 赏金：连续命中对方 3 次头上挂赏金，打中赏金的人回 15% 血并得随机道具
__fields.register({
  id:"bounty", no:22, name:"赏金", emoji:"💰",
  desc:"连中两次挂赏金，打中赏金得奖励",
  start:function(ctx){
    function findNode(root,names){ var r=null; (function w(n){ if(r)return; if(names.indexOf(n.name)>=0){ r=n; return; } for(var i=0;i<n.children.length;i++)w(n.children[i]); })(root); return r; }
    var headCache={};
    function headWorld(n){
      var i=n===ctx.p1?0:1, h=headCache[i];
      if(!h||!h.isValid){ h=headCache[i]=findNode(n,["head","Head"]); }
      if(h&&h.isValid)return h.convertToWorldSpaceAR(cc.v2(0,0));
      var b=ctx.bodyPos(n); return b?cc.v2(b.x,b.y+70):null;
    }
    function idx(n){ return n===ctx.p1?0:1; }
    var POOL=[0,1,2,3,7,38,64,70,80,85,101];
    var combo=[0,0], bounty=[false,false], tag=[];
    for(var k=0;k<2;k++){
      var s=ctx.sprite("/assets/icons/fields/bounty.png",cc.v2(0,0),64,64,425);
      if(s)s.active=false;
      tag.push(s);
    }
    ctx.onHit(function(vhc,dmg,info){
      if(info.terrain)return dmg;
      var v=vhc.node, a=info.attacker; if(!a)return dmg;
      var vi=idx(v), ai=idx(a);
      if(bounty[vi]){
        bounty[vi]=false; combo[0]=0; combo[1]=0;
        var ah=ctx.hc(a);
        if(ah)ctx.heal(a,ah.maxhp*0.35);
        ctx.applyItem(ctx.pick(POOL),a);
        ctx.toast("拿下赏金！",a,new cc.Color(255,215,0));
      } else {
        combo[ai]++; combo[vi]=0;
        if(combo[ai]>=2&&!bounty[ai]){
          bounty[ai]=true;
          ctx.toast("被悬赏了！",a,new cc.Color(255,215,0));
        }
      }
      return dmg;
    });
    ctx.onUpdate(function(dt){
      for(var i=0;i<2;i++){
        var s=tag[i]; if(!s)continue;
        var on=bounty[i]&&!ctx.isDead(ctx.players[i]);
        s.active=on;
        if(!on)continue;
        var hw=headWorld(ctx.players[i]); if(!hw)continue;
        var c=ctx.toCanvas(hw);
        s.setPosition(c.x,c.y+60+Math.sin(ctx.elapsed()*4)*5);
      }
    });
  }
});

}catch(e){ try{ __fields.log('加载失败','22_bounty.js',e&&e.message); }catch(_){} } })();


// ---- 23_ultonly.js ----
(function(){ try{
// 23 一刀流：普通攻击不扣血，只有大招能伤人（地形伤害、击退照常）
__fields.register({
  id:"ultonly", no:23, name:"一刀流", emoji:"🗡️",
  desc:"普通攻击不扣血，只有大招能伤人",
  start:function(ctx){
    // 大招释放后，子弹还要飞一会儿才打到人，所以大招结束后一段时间内的伤害都放行
    var BIG_WINDOW=3000;
    var bigUntil=[0,0];      // 每人：大招伤害放行到什么时候
    var wasBig=[false,false];
    var joys=[null,null];

    ctx.players.forEach(function(n,i){ ctx.toast("只有大招能伤人", n, null, 30); });

    ctx.onUpdate(function(dt){
      var now=ctx.now();
      ctx.players.forEach(function(n,i){
        if(!joys[i])joys[i]=ctx.joyOf(n);
        var jc=joys[i];
        if(!jc||!jc.isValid)return;
        var big=!!jc.bigSkillState;
        // 大招在释放那一刻结束（bigSkillState 变 false），此时子弹才生成
        if(wasBig[i] && !big) bigUntil[i]=now+BIG_WINDOW;
        if(big) bigUntil[i]=now+BIG_WINDOW;
        wasBig[i]=big;
      });
    });

    ctx.onHit(function(victimHc, dmg, info){
      if(info.terrain)return;                      // 地形伤害（尖刺、水）照常
      var idx=-1;
      ctx.players.forEach(function(n,i){ if(n===info.attacker)idx=i; });
      // info.attacker 是打人的一方（对手），看它是不是在大招时间窗里
      if(idx>=0 && ctx.now()<bigUntil[idx]) return undefined;   // 大招伤害放行
      return 0;                                    // 普通攻击：不扣血（击退仍然有）
    });
  }
});

}catch(e){ try{ __fields.log('加载失败','23_ultonly.js',e&&e.message); }catch(_){} } })();


// ---- 24_balloons.js ----
(function(){ try{
// 24 气球决斗：每人头上 3 个气球，被打中破一个，3 个全破直接输
__fields.register({
  id:"balloons", no:24, name:"气球决斗", emoji:"🎈",
  desc:"头上三个气球，全破就输",
  start:function(ctx){
    function findNode(root,names){ var r=null; (function w(n){ if(r)return; if(names.indexOf(n.name)>=0){ r=n; return; } for(var i=0;i<n.children.length;i++)w(n.children[i]); })(root); return r; }
    var headCache={};
    function headWorld(n){
      var i=n===ctx.p1?0:1, h=headCache[i];
      if(!h||!h.isValid){ h=headCache[i]=findNode(n,["head","Head"]); }
      if(h&&h.isValid)return h.convertToWorldSpaceAR(cc.v2(0,0));
      var b=ctx.bodyPos(n); return b?cc.v2(b.x,b.y+70):null;
    }
    function idx(n){ return n===ctx.p1?0:1; }
    var left=[3,3], lastPop=[-9999,-9999], bl=[[],[]];
    var tint=[new cc.Color(255,120,120),new cc.Color(120,180,255)];
    for(var i=0;i<2;i++){
      for(var j=0;j<3;j++){
        var s=ctx.sprite("/assets/icons/fields/balloon.png",cc.v2(0,0),130,150,425);
        if(s)s.color=tint[i];
        bl[i].push(s);
      }
    }
    ctx.onHit(function(vhc,dmg,info){
      if(info.terrain)return dmg;
      var i=idx(vhc.node);
      if(left[i]<=0||ctx.now()-lastPop[i]<600)return dmg;
      lastPop[i]=ctx.now(); left[i]--;
      var s=bl[i][left[i]];
      if(s&&s.isValid){ ctx.R.impact(s.getPosition(),new cc.Color(255,255,255)); s.active=false; }
      ctx.toast("啪！",vhc.node,new cc.Color(255,255,255));
      if(left[i]<=0){ var v=vhc.node; ctx.after(50,function(){ ctx.kill(v); }); }
      return dmg;
    });
    ctx.onUpdate(function(dt){
      var t=ctx.elapsed();
      for(var i=0;i<2;i++){
        var hw=headWorld(ctx.players[i]); if(!hw)continue;
        var c=ctx.toCanvas(hw);
        for(var j=0;j<left[i];j++){
          var s=bl[i][j]; if(!s||!s.isValid)continue;
          s.setPosition(c.x+(j-1)*95,c.y+170+(j===1?30:0)+Math.sin(t*3+j+i)*8);
        }
      }
    });
  }
});

}catch(e){ try{ __fields.log('加载失败','24_balloons.js',e&&e.message); }catch(_){} } })();


// ---- 25_rubberband.js ----
(function(){ try{
// 25 橡皮筋：两人被一根橡皮筋连着，拉太远会被拽回来
__fields.register({
  id:"rubberband", no:25, name:"橡皮筋", emoji:"🔗",
  desc:"两人被橡皮筋拴着，拉远会被拽回",
  start:function(ctx){
    var g=ctx.graphics(cc.v2(0,0),410), LEN=320, K=9, MAXDV=260;
    ctx.onUpdate(function(dt){
      if(dt>0.1)dt=0.1;
      g.clear();
      var a=ctx.bodyPos(ctx.p1), b=ctx.bodyPos(ctx.p2); if(!a||!b)return;
      var dx=b.x-a.x, dy=b.y-a.y, d=Math.sqrt(dx*dx+dy*dy); if(d<1)return;
      var ux=dx/d, uy=dy/d, ex=Math.max(0,d-LEN);
      if(ex>0&&!ctx.isDead(ctx.p1)&&!ctx.isDead(ctx.p2)){
        var va=ctx.bodyRb(ctx.p1).linearVelocity, vb=ctx.bodyRb(ctx.p2).linearVelocity;
        // 沿连线的「靠近对方」速度
        var appA=va.x*ux+va.y*uy, appB=-(vb.x*ux+vb.y*uy);
        var target=ex*K, f=Math.min(1,6*dt);
        var dvA=Math.max(0,Math.min(MAXDV,(target-appA)*f));
        var dvB=Math.max(0,Math.min(MAXDV,(target-appB)*f));
        if(dvA>0)ctx.addVel(ctx.p1,ux*dvA,uy*dvA);
        if(dvB>0)ctx.addVel(ctx.p2,-ux*dvB,-uy*dvB);
      }
      var t=Math.min(1,ex/350), pa=ctx.toCanvas(a), pb=ctx.toCanvas(b);
      g.strokeColor=cc.color(Math.round(80+175*t),Math.round(220-160*t),Math.round(90-40*t),230);
      g.lineWidth=Math.max(3,12-9*t);
      var sag=(1-Math.min(1,d/LEN))*60;   // 松的时候稍微下垂
      g.moveTo(pa.x,pa.y);
      g.quadraticCurveTo((pa.x+pb.x)/2,(pa.y+pb.y)/2-sag,pb.x,pb.y);
      g.stroke();
    });
  }
});

}catch(e){ try{ __fields.log('加载失败','25_rubberband.js',e&&e.message); }catch(_){} } })();


// ---- 26_nostop.js ----
(function(){ try{
// 26 不许停：站着不动超过 2 秒开始掉血，静止 1.3 秒起头上闪「⚠ 动起来」
__fields.register({
  id:"nostop", no:26, name:"不许停", emoji:"🏃",
  desc:"站着不动超过1秒就狂掉血",
  start:function(ctx){
    var hist=[[],[]];                 // 每人最近的躯干位置采样 {t,x,y}
    var lastMove=[ctx.now(),ctx.now()];
    var warnNode=[null,null];
    var stillMs=[0,0];

    ctx.onUpdate(function(dt){
      var now=ctx.now();
      ctx.players.forEach(function(n,i){
        var p=ctx.bodyPos(n);
        if(!p||ctx.isDead(n)){
          if(warnNode[i])warnNode[i].active=false;
          return;
        }
        // 与 0.3 秒前比较
        var h=hist[i];
        h.push({t:now,x:p.x,y:p.y});
        while(h.length>1 && h[1].t<=now-300) h.shift();
        var ref=h[0];
        if(now-ref.t>=250){
          var dist=Math.sqrt((p.x-ref.x)*(p.x-ref.x)+(p.y-ref.y)*(p.y-ref.y));
          if(dist>25) lastMove[i]=now;
        }
        stillMs[i]=now-lastMove[i];

        // 头上的提示
        if(stillMs[i]>=1300){
          if(!warnNode[i]){
            warnNode[i]=ctx.label("⚠ 动起来", cc.v2(0,0), 40, new cc.Color(255,210,60), 440);
          }
          var w=warnNode[i];
          if(w&&w.isValid){
            w.active=true;
            var cp=ctx.canvasPt(n);
            if(cp)w.setPosition(cp.x, cp.y+140);
            w.opacity=140+115*Math.abs(Math.sin(now/150));   // 闪烁
          }
        }else if(warnNode[i]){
          warnNode[i].active=false;
        }
      });
    });

    // 每 0.5 秒：静止超过 2 秒的人掉 2%
    ctx.every(500, function(){
      ctx.players.forEach(function(n,i){
        if(!ctx.isDead(n) && stillMs[i]>1200) ctx.hurtPct(n,6);
      });
    });
  }
});

}catch(e){ try{ __fields.log('加载失败','26_nostop.js',e&&e.message); }catch(_){} } })();


// ---- 27_coward.js ----
(function(){ try{
// 27 胆小鬼：两人距离超过 900px 时双方每秒掉 3%；超过 700px 时中间连线变红预警
__fields.register({
  id:"coward", no:27, name:"胆小鬼", emoji:"🐔",
  desc:"两人离太远就掉血，拉近才安全",
  start:function(ctx){
    var gfx=ctx.graphics(cc.v2(0,0),380);
    var FAR=700, WARN=550;

    function dist(){
      var a=ctx.bodyPos(ctx.p1), b=ctx.bodyPos(ctx.p2);
      if(!a||!b)return 0;
      return Math.sqrt((a.x-b.x)*(a.x-b.x)+(a.y-b.y)*(a.y-b.y));
    }

    ctx.onUpdate(function(dt){
      if(!gfx)return;
      gfx.clear();
      var d=dist();
      if(d<=WARN)return;
      var a=ctx.canvasPt(ctx.p1), b=ctx.canvasPt(ctx.p2);
      if(!a||!b)return;
      // 700 → 900 px 之间从黄变红
      var k=Math.min(1,(d-WARN)/(FAR-WARN));
      var r=255, g2=Math.round(220-180*k), b2=Math.round(80-60*k);
      gfx.lineWidth=6;
      gfx.strokeColor=cc.color(r,g2,b2,230);
      gfx.moveTo(a.x,a.y); gfx.lineTo(b.x,b.y); gfx.stroke();
    });

    // 每 0.5 秒：超过 900px 时双方各掉 1.5%（即每秒 3%）
    ctx.every(500, function(){
      if(dist()<=FAR)return;
      ctx.players.forEach(function(n){
        if(!ctx.isDead(n)) ctx.hurtPct(n,5);
      });
    });
  }
});

}catch(e){ try{ __fields.log('加载失败','27_coward.js',e&&e.message); }catch(_){} } })();


// ---- 28_bouncy.js ----
(function(){ try{
// 28 弹力人：落地会弹起来（下落速度越快弹得越高，上限 1100）
__fields.register({
  id:"bouncy", no:28, name:"弹力人", emoji:"🏀",
  desc:"落地会弹起来",
  start:function(ctx){
    var prevVy=[0,0], cool=[0,0];
    ctx.onUpdate(function(dt){
      var now=ctx.now();
      ctx.players.forEach(function(n,i){
        var rb=ctx.bodyRb(n);
        if(!rb){ prevVy[i]=0; return; }
        var vy=rb.linearVelocity.y;
        if(!ctx.isDead(n) && prevVy[i]<-200 && vy>-60 && now>=cool[i]){
          var up=Math.min(1700, Math.max(700,Math.abs(prevVy[i])*1.05));
          cool[i]=now+150;
          ctx.addVel(n,0,up);
        }
        prevVy[i]=vy;
      });
    });
  }
});

}catch(e){ try{ __fields.log('加载失败','28_bouncy.js',e&&e.message); }catch(_){} } })();


// ---- 30_shadow.js ----
(function(){ try{
// 30 影子：每人身后跟一个慢 2 秒的影子，碰到对手会咬一口
__fields.register({
  id:"shadow", no:30, name:"影子", emoji:"👥",
  desc:"身后影子慢2秒，碰到对手会扣血",
  start:function(ctx){
    var DELAY=2000, CAP=240, STRIDE=5;
    var canvas=ctx.canvas, S=[], tmp=[0,0,0];
    function collect(n){
      var out=[], bodyIdx=-1;
      n.getComponentsInChildren(cc.Sprite).forEach(function(sp){
        if(!sp.spriteFrame)return;
        var nm=sp.node.name;
        if(/weapon|gun|sword|skill|buff|shield|effect|bar/i.test(nm))return;
        if(nm==="body")bodyIdx=out.length;
        out.push(sp.node);
      });
      return {nodes:out,bodyIdx:bodyIdx};
    }
    ctx.players.forEach(function(n){
      var c=collect(n), m=c.nodes.length, sh=[];
      for(var k=0;k<m;k++){
        var src=c.nodes[k], sp=src.getComponent(cc.Sprite);
        var nd=ctx.node("shadowPart",cc.v2(0,-9999),395);
        var s=nd.addComponent(cc.Sprite); s.spriteFrame=sp.spriteFrame; s.sizeMode=cc.Sprite.SizeMode.CUSTOM;
        nd.setContentSize(src.width,src.height); nd.setAnchorPoint(src.anchorX,src.anchorY);
        nd.opacity=90; nd.color=cc.color(70,70,95); nd.active=false;
        sh.push(nd);
      }
      S.push({owner:n,src:c.nodes,body:c.bodyIdx,sh:sh,buf:new Float32Array(CAP*m*STRIDE),times:new Float64Array(CAP),head:0,count:0,m:m,cool:0});
    });
    function worldAS(nd){
      var ang=0,sx=1,sy=1,p=nd;
      while(p&&p!==canvas&&p.parent){ ang+=p.angle; sx*=p.scaleX; sy*=p.scaleY; p=p.parent; }
      tmp[0]=ang; tmp[1]=sx; tmp[2]=sy;
    }
    ctx.onUpdate(function(){
      var now=ctx.now();
      S.forEach(function(s){
        if(!s.owner.isValid)return;
        var m=s.m, W=m*STRIDE, base=s.head*W;
        s.times[s.head]=now;
        for(var k=0;k<m;k++){
          var nd=s.src[k], o=base+k*STRIDE;
          if(!nd.isValid||!nd.activeInHierarchy){ s.buf[o]=NaN; continue; }
          var p=ctx.toCanvas(nd.convertToWorldSpaceAR(cc.v2(0,0)));
          worldAS(nd);
          s.buf[o]=p.x; s.buf[o+1]=p.y; s.buf[o+2]=tmp[0]; s.buf[o+3]=tmp[1]; s.buf[o+4]=tmp[2];
        }
        s.head=(s.head+1)%CAP; if(s.count<CAP)s.count++;
        // 找 2 秒前的那一帧（最旧一帧不够老就不显示）
        var oldest=s.times[(s.head-s.count+CAP)%CAP], found=-1;
        if(now-oldest>=DELAY-150){
          for(var j=0;j<s.count;j++){
            var ii=(s.head-s.count+j+CAP)%CAP;
            if(s.times[ii]>=now-DELAY){ found=ii; break; }
          }
        }
        var bodyC=null, fb=found*W;
        for(var k2=0;k2<m;k2++){
          var d=s.sh[k2]; if(!d.isValid)continue;
          var o2=fb+k2*STRIDE;
          if(found<0||isNaN(s.buf[o2])){ if(d.active)d.active=false; continue; }
          if(!d.active)d.active=true;
          d.setPosition(s.buf[o2],s.buf[o2+1]); d.angle=s.buf[o2+2]; d.scaleX=s.buf[o2+3]; d.scaleY=s.buf[o2+4];
          if(k2===s.body)bodyC=cc.v2(s.buf[o2],s.buf[o2+1]);
        }
        // 影子躯干碰到对手
        if(bodyC&&now>s.cool){
          var foe=ctx.opp(s.owner);
          if(foe&&foe.isValid&&!ctx.isDead(foe)){
            var near=ctx.parts(foe).some(function(rb){
              var q=ctx.toCanvas(ctx.partPos(rb)), dx=q.x-bodyC.x, dy=q.y-bodyC.y; return dx*dx+dy*dy<3600;
            });
            if(near){
              s.cool=now+1000; ctx.hurtPct(foe,12); ctx.popText(foe,"-12%");
              try{ ctx.R.impact(bodyC,cc.color(120,120,200)); }catch(_){}
            }
          }
        }
      });
    });
  }
});

}catch(e){ try{ __fields.log('加载失败','30_shadow.js',e&&e.message); }catch(_){} } })();


// ---- 31_echo.js ----
(function(){ try{
// 31 回声：每次被武器打中，1 秒后同一个地方再响一次回声，还在原地就再挨一下
__fields.register({
  id:"echo", no:31, name:"回声", emoji:"🔊",
  desc:"挨打1秒后原地回声，不躲再扣血",
  start:function(ctx){
    ctx.onHit(function(hc,dmg,info){
      if(info.terrain||!info.victim)return dmg;
      var n=info.victim, wp=ctx.bodyPos(n); if(!wp)return dmg;
      var pct=Math.min(30,2*dmg/(hc.maxhp||100)*100), cp=ctx.toCanvas(wp);
      try{ ctx.R.drawRing(cp,cc.color(255,240,160,120),50,3,1000,0); }catch(_){}   // 预警小圈
      ctx.after(1000,function(){
        try{ ctx.R.drawRing(cp,cc.color(255,200,60,200),120,8,500,0); }catch(_){}
        if(!n.isValid||ctx.isDead(n))return;
        var p=ctx.bodyPos(n); if(!p)return;
        var dx=p.x-wp.x, dy=p.y-wp.y;
        if(dx*dx+dy*dy<=180*180){ ctx.hurtPct(n,pct); ctx.popText(n,"回声 -"+(Math.round(pct*10)/10)+"%"); }
      });
      return dmg;
    });
  }
});

}catch(e){ try{ __fields.log('加载失败','31_echo.js',e&&e.message); }catch(_){} } })();


// ---- 32_dark.js ----
(function(){ try{
// 32 天黑：只有两个人身边一圈亮，其他地方很暗
__fields.register({
  id:"dark", no:32, name:"天黑", emoji:"🌑",
  desc:"只有身边一圈亮，小心偷袭",
  start:function(ctx){
    var r=ctx.mapRect();
    var s=48, maxCells=1500;
    if((r.width/s)*(r.height/s)>maxCells)s=Math.sqrt(r.width*r.height/maxCells);
    var cols=Math.ceil(r.width/s), rows=Math.ceil(r.height/s);
    var o=ctx.toCanvas(cc.v2(r.x,r.y));          // 左下角（Canvas 坐标）
    var g=ctx.graphics(cc.v2(0,0),440);
    var LV=10, MAXA=0.97, R0=110, R1=240;        // 距离<R0 全亮，>R1 最暗，之间平滑
    var buckets=[]; for(var i=0;i<=LV;i++)buckets.push([]);
    var cx=[], cy=[];
    for(var c0=0;c0<cols;c0++)cx.push(o.x+(c0+0.5)*s);
    for(var j0=0;j0<rows;j0++)cy.push(o.y+(j0+0.5)*s);
    ctx.onUpdate(function(dt){
      var pts=[];
      ctx.players.forEach(function(n){ if(ctx.isDead(n))return; var p=ctx.canvasPt(n); if(p)pts.push(p); });
      for(var i=0;i<=LV;i++)buckets[i].length=0;
      for(var j=0;j<rows;j++){
        for(var c=0;c<cols;c++){
          var d=1e9;
          for(var k=0;k<pts.length;k++){ var dx=cx[c]-pts[k].x, dy=cy[j]-pts[k].y; var dd=dx*dx+dy*dy; if(dd<d)d=dd; }
          d=Math.sqrt(d);
          var t=(d-R0)/(R1-R0); if(t<=0)continue; if(t>1)t=1; t=t*t*(3-2*t);
          var lv=Math.round(t*LV); if(lv>0)buckets[lv].push(j*cols+c);
        }
      }
      g.clear();
      for(var l=1;l<=LV;l++){
        var b=buckets[l]; if(!b.length)continue;
        g.fillColor=cc.color(4,6,16,Math.round(255*MAXA*l/LV));
        for(var q=0;q<b.length;q++){ var id=b[q], rr=(id/cols)|0, cc2=id-rr*cols; g.rect(o.x+cc2*s-0.5,o.y+rr*s-0.5,s+1,s+1); }
        g.fill();
      }
    });
  }
});

}catch(e){ try{ __fields.log('加载失败','32_dark.js',e&&e.message); }catch(_){} } })();


// ---- 33_upsidedown.js ----
(function(){ try{
// 33 颠倒世界：画面转 180 度，按键方向不变
// 做法：每帧更新完后把主相机 zoomRatio 设成负数（= 画面转 180°），画完再改回正数，CameraCtrl 读到的永远是正的
__fields.register({
  id:"upsidedown", no:33, name:"颠倒世界", emoji:"🙃",
  desc:"画面整个转了180度，别按错",
  start:function(ctx){
    function find(){
      try{
        var cs=cc.Camera.cameras||[];
        for(var i=0;i<cs.length;i++){ if(cs[i].node&&cs[i].node.name==="MainCamera")return cs[i]; }
      }catch(_){}
      return null;
    }
    var on=true;
    function flip(){ if(!on)return; var c=find(); if(c&&c.zoomRatio>0)c.zoomRatio=-c.zoomRatio; }
    function unflip(){ var c=find(); if(c&&c.zoomRatio<0)c.zoomRatio=-c.zoomRatio; }
    cc.director.on(cc.Director.EVENT_AFTER_UPDATE,flip);
    cc.director.on(cc.Director.EVENT_AFTER_DRAW,unflip);
    ctx._udOff=function(){
      on=false;
      cc.director.off(cc.Director.EVENT_AFTER_UPDATE,flip);
      cc.director.off(cc.Director.EVENT_AFTER_DRAW,unflip);
      unflip();
    };
    ctx.onCleanup&&ctx.onCleanup(ctx._udOff);
  },
  stop:function(ctx){ if(ctx._udOff)ctx._udOff(); }
});

}catch(e){ try{ __fields.log('加载失败','33_upsidedown.js',e&&e.message); }catch(_){} } })();


// ---- 35_timetide.js ----
(function(){ try{
// 35 时间潮汐：游戏速度每 6 秒在慢（0.6 倍）和快（1.4 倍）之间切换，切换前 1 秒提示
__fields.register({
  id:"timetide", no:35, name:"时间潮汐", emoji:"⏳",
  desc:"时间忽慢忽快，每4秒切换",
  start:function(ctx){
    var SLOW=0.35, FAST=1.8, PERIOD=4;
    var lbl=ctx.label("",cc.v2(0,0),84,cc.color(255,255,255),445);
    var lab=lbl&&lbl.getComponent(cc.Label);
    if(lbl)lbl.active=false;
    function kAt(t){ return (Math.floor(t/PERIOD)%2===0)?SLOW:FAST; }
    function apply(k){
      ctx.setTimeScale(k);
      // 主程序关了物理累加器，每帧固定走一步，不跟 timeScale，所以手动缩步长
      cc.PhysicsManager.FIXED_TIME_STEP=(1/60)*k;
    }
    apply(SLOW);
    function center(){
      try{
        var cam=cc.Camera.main, w=cam.getScreenToWorldPoint(cc.v2(cc.winSize.width/2,cc.winSize.height/2));
        return ctx.toCanvas(w);
      }catch(_){ return cc.v2(0,0); }
    }
    ctx.onUpdate(function(dt){
      var t=ctx.elapsed(), k=kAt(t);
      apply(k);                                          // 每帧重设，防止主程序改掉
      var inP=t%PERIOD;
      if(lbl&&lab&&lbl.isValid){
        if(inP>=PERIOD-1){
          var next=kAt(t+1);
          lbl.active=true;
          lab.string=next===SLOW?"变慢":"变快";
          lbl.color=next===SLOW?cc.color(120,200,255):cc.color(255,170,60);
          var c=center(); lbl.setPosition(c.x,c.y+60);
          var f=inP-(PERIOD-1); lbl.opacity=Math.round(255*(1-Math.abs(f-0.5)*0.6));
        }else lbl.active=false;
      }
    });
  },
  stop:function(ctx){
    cc.PhysicsManager.FIXED_TIME_STEP=1/60;
  }
});

}catch(e){ try{ __fields.log('加载失败','35_timetide.js',e&&e.message); }catch(_){} } })();


// ---- 37_gravitywheel.js ----
(function(){ try{
// 37 重力轮盘：每 10 秒重力换个方向（上下左右），换之前 1 秒有箭头提示
__fields.register({
  id:"gravitywheel", no:37, name:"重力轮盘", emoji:"🧭",
  desc:"每6秒重力随机换方向",
  start:function(ctx){
    var G=560, cur=0;
    var dirs=[[0,-G,"⬇"],[0,G,"⬆"],[-G,0,"⬅"],[G,0,"➡"]];
    var r=ctx.mapRect(), cp=ctx.toCanvas(cc.v2(r.x+r.width/2,r.y+r.height/2));
    var arrow=null;
    function cycle(){
      ctx.after(5000,function(){
        var next; do{ next=Math.floor(Math.random()*4); }while(next===cur);
        arrow=ctx.label(dirs[next][2],cp,220,cc.color(255,230,80),440);
        ctx.after(1000,function(){
          if(arrow&&arrow.isValid)arrow.destroy();
          arrow=null;
          cur=next; ctx.setGravity(dirs[cur][0],dirs[cur][1]);
          cycle();
        });
      });
    }
    cycle();
  }
});

}catch(e){ try{ __fields.log('加载失败','37_gravitywheel.js',e&&e.message); }catch(_){} } })();


// ---- 39_pinball.js ----
(function(){ try{
// 39 弹球：一颗大铁球在场内直线弹跳，撞到人扣 12% 并撞飞
__fields.register({
  id:"pinball", no:39, name:"弹球", emoji:"⚪",
  desc:"大铁球满场弹，撞到扣血",
  start:function(ctx){
    var r=ctx.mapRect(), R=150, SPEED=1000, WARN=1.5;
    var a=ctx.bodyPos(ctx.p1), b=ctx.bodyPos(ctx.p2);
    var pos=(a&&b)?cc.v2((a.x+b.x)/2,Math.max(a.y,b.y)+260):cc.v2(r.x+r.width/2,r.y+r.height/2);
    pos.x=Math.max(r.x+R,Math.min(r.xMax-R,pos.x)); pos.y=Math.max(r.y+R,Math.min(r.yMax-R,pos.y));
    var ang=ctx.rnd(0.5,1.0)+ctx.pick([0,Math.PI/2,Math.PI,Math.PI*1.5]);
    var vx=Math.cos(ang)*SPEED, vy=Math.sin(ang)*SPEED, last=[-9999,-9999];
    var ball=ctx.sprite("/assets/icons/fields/pinball.png",ctx.toCanvas(pos),R*2,R*2,415);
    ctx.onUpdate(function(dt){
      if(dt>0.1)dt=0.1;
      var t=ctx.elapsed(), warm=t<WARN;
      pos.x+=vx*dt; pos.y+=vy*dt;
      if(pos.x-R<r.x){ pos.x=r.x+R; vx=Math.abs(vx); }
      if(pos.x+R>r.xMax){ pos.x=r.xMax-R; vx=-Math.abs(vx); }
      if(pos.y-R<r.y){ pos.y=r.y+R; vy=Math.abs(vy); }
      if(pos.y+R>r.yMax){ pos.y=r.yMax-R; vy=-Math.abs(vy); }
      if(ball){
        var c=ctx.toCanvas(pos), c2=ctx.toCanvas(cc.v2(pos.x+R*2,pos.y));
        var w=Math.abs(c2.x-c.x);
        if(w>1)ball.setContentSize(w,w);
        ball.setPosition(c.x,c.y);
        ball.angle=-t*200*(vx>0?1:-1);
        ball.opacity=warm?(Math.floor(t*10)%2?70:170):255;
      }
      if(warm)return;
      var sp=Math.sqrt(vx*vx+vy*vy)||1, nx=vx/sp, ny=vy/sp, now=ctx.now();
      for(var i=0;i<2;i++){
        var n=ctx.players[i];
        if(ctx.isDead(n)||now-last[i]<1000)continue;
        var hit=ctx.parts(n).some(function(rb){
          var p=ctx.partPos(rb), dx=p.x-pos.x, dy=p.y-pos.y;
          return dx*dx+dy*dy<R*R;
        });
        if(hit){
          last[i]=now;
          ctx.hurtPct(n,20,nx*1300,ny*1300+300);
          ctx.R.impact(ctx.toCanvas(ctx.bodyPos(n)||pos),new cc.Color(200,220,255));
        }
      }
    });
  }
});

}catch(e){ try{ __fields.log('加载失败','39_pinball.js',e&&e.message); }catch(_){} } })();


// ---- 41_hunter.js ----
(function(){ try{
// 41 猎人与猎物：一人当猎人（伤害×2），一人当猎物（跑得快、伤害×0.5），每 5 秒互换
__fields.register({
  id:"hunter", no:41, name:"猎人与猎物", emoji:"🎯",
  desc:"猎人伤害×3，猎物跑得快，5秒互换",
  start:function(ctx){
    var hunter=Math.random()<0.5?0:1, labels=[null,null];
    function mk(i){
      if(labels[i]&&labels[i].isValid)labels[i].destroy();
      labels[i]=ctx.label(i===hunter?"🎯猎人":"🐇猎物",cc.v2(0,-9999),30,i===hunter?cc.color(255,90,70):cc.color(120,230,120),435);
    }
    mk(0); mk(1);
    function cycle(){
      ctx.after(4000,function(){
        ctx.toast("1秒后互换身份",ctx.players[0],cc.color(255,230,120));
        ctx.toast("1秒后互换身份",ctx.players[1],cc.color(255,230,120));
        ctx.after(1000,function(){
          hunter=1-hunter; mk(0); mk(1);
          ctx.toast("你是猎人！",ctx.players[hunter],cc.color(255,120,90));
          cycle();
        });
      });
    }
    cycle();
    ctx.onHit(function(hc,dmg,info){
      var a=ctx.players.indexOf(info.attacker); if(a<0)return dmg;
      return a===hunter?dmg*3:dmg*0.3;
    });
    ctx.onUpdate(function(dt){
      for(var i=0;i<2;i++){
        var n=ctx.players[i], l=labels[i];
        if(l&&l.isValid&&n.isValid){ var p=ctx.canvasPt(n); if(p)l.setPosition(p.x,p.y+130); }
      }
      var prey=ctx.players[1-hunter];
      if(!prey||!prey.isValid||ctx.isDead(prey))return;
      var rb=ctx.bodyRb(prey); if(!rb)return;
      var vx=rb.linearVelocity.x, k=Math.pow(1.045,Math.min(dt,0.1)*60);
      if(Math.abs(vx)>60&&Math.abs(vx)<850){
        ctx.parts(prey).forEach(function(r){ var v=r.linearVelocity; r.linearVelocity=cc.v2(v.x*k,v.y); });
      }
    });
  }
});

}catch(e){ try{ __fields.log('加载失败','41_hunter.js',e&&e.message); }catch(_){} } })();


// ---- 42_acidrain.js ----
(function(){ try{
// 42 酸雨：整局下酸雨，头顶没有平台挡着就持续掉血；这局尖刺不扣血
__fields.register({
  id:"acidrain", no:42, name:"酸雨", emoji:"🌧️",
  desc:"头顶没遮挡会被酸雨淋伤",
  start:function(ctx){
    ctx.spikes(false);
    var r=ctx.mapRect();
    var N=60, drops=[];
    for(var i=0;i<N;i++)drops.push({u:Math.random(),v:Math.random(),s:1.0+Math.random()*0.8});
    var g=ctx.graphics(cc.v2(0,0),435);
    var wet=[false,false];
    function viewRect(){
      try{
        var cam=cc.Camera.main, a=cam.getScreenToWorldPoint(cc.v2(0,0)), b=cam.getScreenToWorldPoint(cc.v2(cc.winSize.width,cc.winSize.height));
        return {x0:Math.min(a.x,b.x),x1:Math.max(a.x,b.x),y0:Math.min(a.y,b.y),y1:Math.max(a.y,b.y)};
      }catch(_){ return {x0:r.x,x1:r.xMax,y0:r.y,y1:r.yMax}; }
    }
    function sheltered(n){
      var p=ctx.bodyPos(n); if(!p)return true;
      var res;
      // 用 All 再按碰撞组过滤：Closest 会先撞到人自己或武器
      try{ res=cc.director.getPhysicsManager().rayCast(p,cc.v2(p.x,r.yMax-4),cc.RayCastType.All); }catch(_){ return false; }
      if(!res)return false;
      for(var i=0;i<res.length;i++){ var nd=res[i].collider&&res[i].collider.node; if(nd&&nd.group==="ground")return true; }
      return false;
    }
    var tick=0;
    ctx.every(400,function(){
      tick++;
      ctx.players.forEach(function(n,i){
        wet[i]=false;
        if(ctx.isDead(n))return;
        if(sheltered(n))return;
        wet[i]=true;
        ctx.hurtPct(n,3.5);
        if(tick%3===0)ctx.toast("酸雨",n,cc.color(140,255,100),18);
      });
    });
    ctx.onUpdate(function(dt){
      var v=viewRect(), w=v.x1-v.x0, h=v.y1-v.y0;
      g.clear();
      g.strokeColor=cc.color(130,255,90,150); g.lineWidth=2;
      for(var i=0;i<N;i++){
        var d=drops[i];
        d.v-=d.s*0.9*dt; d.u-=0.03*dt;
        if(d.v<-0.05||d.u<0){ d.v=1.05; d.u=Math.random()*1.1; }
        var p=ctx.toCanvas(cc.v2(v.x0+d.u*w,v.y0+d.v*h));
        g.moveTo(p.x+7,p.y+26); g.lineTo(p.x,p.y);
      }
      g.stroke();
      g.fillColor=cc.color(150,255,100,200);
      ctx.players.forEach(function(n,k){
        if(!wet[k]||ctx.isDead(n))return;
        var c=ctx.canvasPt(n); if(!c)return;
        for(var j=0;j<3;j++)g.circle(c.x+(Math.random()-0.5)*50,c.y+(Math.random()-0.2)*70,2+Math.random()*2.5);
      });
      g.fill();
    });
  }
});

}catch(e){ try{ __fields.log('加载失败','42_acidrain.js',e&&e.message); }catch(_){} } })();


// ---- 43_recoil.js ----
(function(){ try{
// 43 后坐力：每次攻击都会把自己往反方向推，可以当空中冲刺
__fields.register({
  id:"recoil", no:43, name:"后坐力", emoji:"🔫",
  desc:"每次攻击自己会被反向推开",
  start:function(ctx){
    var wrapped=[];
    ctx.players.forEach(function(n){
      var j=ctx.joyOf(n); if(!j)return;
      var own=Object.prototype.hasOwnProperty.call(j,"showattack"), orig=j.showattack;
      if(typeof orig!=="function")return;
      j.showattack=function(){
        var ok=!cc.director.isPaused()&&this.attackState&&ctx.alive;
        var r=orig.apply(this,arguments);
        if(ok&&n.isValid&&!ctx.isDead(n)){
          var a=ctx.bodyPos(n), b=ctx.bodyPos(ctx.opp(n));
          if(a){
            var dx=b?b.x-a.x:1, dy=b?b.y-a.y:0, d=Math.sqrt(dx*dx+dy*dy)||1;
            ctx.addVel(n,-dx/d*1150,-dy/d*1150);
          }
        }
        return r;
      };
      wrapped.push({j:j,own:own,orig:orig});
    });
    ctx._recoilWrapped=wrapped;
  },
  stop:function(ctx){
    (ctx._recoilWrapped||[]).forEach(function(w){
      try{ if(w.own)w.j.showattack=w.orig; else delete w.j.showattack; }catch(_){}
    });
  }
});

}catch(e){ try{ __fields.log('加载失败','43_recoil.js',e&&e.message); }catch(_){} } })();


// ---- 45_blind.js ----
(function(){ try{
// 45 盲打：看不到双方血量（顶部血量框和人头上的血条都隐藏），结束时恢复
__fields.register({
  id:"blind", no:45, name:"盲打", emoji:"🙈",
  desc:"看不到双方血量",
  start:function(ctx){
    var hudEls=[], bars=[];
    ctx._blindHud=hudEls; ctx._blindBars=bars;
    ctx.onUpdate(function(){
      var hud=window.__liveHpHudR1;
      ["p1","p2"].forEach(function(k){
        var el=hud&&hud[k];
        if(el&&el.style){
          el.style.visibility="hidden";
          if(hudEls.indexOf(el)<0)hudEls.push(el);
        }
      });
      ctx.players.forEach(function(n){
        var h=ctx.hc(n), hb=h&&h.HealthBar;
        if(hb&&hb.isValid!==false){
          hb.active=false;
          if(bars.indexOf(hb)<0)bars.push(hb);
        }
      });
    });
  },
  stop:function(ctx){
    (ctx._blindHud||[]).forEach(function(el){ try{ el.style.visibility=""; }catch(_){} });
    (ctx._blindBars||[]).forEach(function(hb){ if(hb&&hb.isValid!==false)hb.active=true; });
  }
});

}catch(e){ try{ __fields.log('加载失败','45_blind.js',e&&e.message); }catch(_){} } })();


// ---- 46_portal.js ----
(function(){ try{
// 46 传送门：左右各一个传送门，踏进去就传到另一边并加速；每 12 秒换位置
__fields.register({
  id:"portal", no:46, name:"传送门", emoji:"🌀",
  desc:"踩进传送门瞬移并加速",
  start:function(ctx){
    var r=ctx.mapRect();
    var A=cc.v2(r.x+r.width*0.15,r.y+r.height*0.35);
    var B=cc.v2(r.x+r.width*0.85,r.y+r.height*0.35);
    var g=ctx.graphics(cc.v2(0,0),300);
    var cd=[0,0];
    var warnStart=-1, nextMove=12;
    function relocate(){
      var tries=0, a, b;
      do{
        a=cc.v2(r.x+r.width*ctx.rnd(0.08,0.92),r.y+r.height*ctx.rnd(0.25,0.6));
        b=cc.v2(r.x+r.width*ctx.rnd(0.08,0.92),r.y+r.height*ctx.rnd(0.25,0.6));
        tries++;
      }while(Math.abs(a.x-b.x)<r.width*0.35&&tries<30);
      if(Math.abs(a.x-b.x)<r.width*0.35){ a=cc.v2(r.x+r.width*0.15,a.y); b=cc.v2(r.x+r.width*0.85,b.y); }
      A=a; B=b;
    }
    function drawPortal(w,col,T,alpha){
      var c=ctx.toCanvas(w), i, rad, ph;
      g.fillColor=cc.color(col.r,col.g,col.b,Math.round(60*alpha));
      g.circle(c.x,c.y,180); g.fill();
      for(i=0;i<5;i++){
        ph=((T*0.9+i/5)%1);
        rad=180*(1-ph);
        g.strokeColor=cc.color(col.r,col.g,col.b,Math.round((255-120*ph)*alpha));
        g.lineWidth=14-ph*8;
        g.circle(c.x,c.y,rad); g.stroke();
      }
      // 旋转的弧
      g.strokeColor=cc.color(255,255,255,Math.round(230*alpha)); g.lineWidth=8;
      for(i=0;i<3;i++){
        var a0=T*4+i*2.094;
        g.arc(c.x,c.y,120,a0,a0+1.1,true); g.stroke();
      }
      g.fillColor=cc.color(20,10,40,Math.round(230*alpha));
      g.circle(c.x,c.y,38+6*Math.sin(T*6)); g.fill();
    }
    ctx.onUpdate(function(dt){
      var T=ctx.elapsed(), now=ctx.now(), alpha=1;
      if(T>=nextMove-0.8&&warnStart<0){ warnStart=T; ctx.toast("传送门要移动了",ctx.p1,cc.color(150,220,255),22); }
      if(warnStart>=0){
        alpha=Math.floor(T*14)%2?0.25:0.8;
        if(T>=nextMove){ relocate(); warnStart=-1; nextMove=T+12; alpha=1; cd[0]=cd[1]=now+300; }
      }
      g.clear();
      drawPortal(A,{r:60,g:160,b:255},T,alpha);
      drawPortal(B,{r:255,g:150,b:40},T+0.37,alpha);
      if(warnStart>=0)return;
      ctx.players.forEach(function(n,i){
        if(ctx.isDead(n))return;
        var p=ctx.bodyPos(n); if(!p||now<cd[i])return;
        var dA=(p.x-A.x)*(p.x-A.x)+(p.y-A.y)*(p.y-A.y);
        var dB=(p.x-B.x)*(p.x-B.x)+(p.y-B.y)*(p.y-B.y);
        var R2=110*110, dest=null, from=null;
        if(dA<R2){ dest=B; from=A; } else if(dB<R2){ dest=A; from=B; }
        if(!dest)return;
        cd[i]=now+1200;
        ctx.R.drawRing(ctx.toCanvas(from),cc.color(255,255,255),200,10,500,0);
        ctx.teleport(n,dest);
        ctx.scaleVelNextStep(n,1.3);
        ctx.R.drawRing(ctx.toCanvas(dest),cc.color(255,255,255),200,10,500,0);
        ctx.toast("传送！",n,cc.color(180,230,255),22);
      });
    });
  }
});

}catch(e){ try{ __fields.log('加载失败','46_portal.js',e&&e.message); }catch(_){} } })();


// ---- 47_quake.js ----
(function(){ try{
// 47 地震：每 7 秒一次，先预警 0.8 秒，再震 1.5 秒，不停把人震起来，站在地上的人掉血
__fields.register({
  id:"quake", no:47, name:"地震", emoji:"💥",
  desc:"每7秒地震，站地上的人掉血",
  start:function(ctx){
    var r=ctx.mapRect();
    var A=ctx.toCanvas(cc.v2(r.x,r.y)), B=ctx.toCanvas(cc.v2(r.x+r.width,r.y+r.height));
    var mid=ctx.toCanvas(cc.v2(r.x+r.width/2, r.y+r.height*0.6));
    var g=ctx.graphics(cc.v2(0,0),285);
    var lab=null;
    var state=0, nextKick=0, hurt=[false,false];
    var PERIOD=7, WARN=0.8, QUAKE=1.5;
    var cracks=[];
    function makeCracks(){
      cracks=[];
      if(!A||!B)return;
      for(var i=0;i<7;i++){
        var x=A.x+(B.x-A.x)*(0.08+0.84*Math.random()), y=A.y+10, pts=[[x,y]];
        for(var j=0;j<6;j++){ x+=(Math.random()-0.5)*110; y+=30+Math.random()*50; pts.push([x,y]); }
        cracks.push(pts);
      }
    }
    function velY(n){
      var ps=ctx.parts(n), s=0;
      if(!ps||!ps.length)return 999;
      for(var i=0;i<ps.length;i++)s+=ps[i].linearVelocity.y;
      return s/ps.length;
    }
    function killLab(){ if(lab&&lab.isValid)lab.destroy(); lab=null; }
    ctx.onUpdate(function(dt){
      var t=ctx.elapsed();
      var cyc=t%PERIOD, startT=PERIOD-WARN-QUAKE;
      g.clear();
      if(cyc<startT){ if(state!==0){ state=0; killLab(); } return; }
      var ph=cyc-startT;
      var shake=ph<WARN?(8+ph*20):26;
      if(state===0){
        state=1; makeCracks(); hurt=[false,false]; nextKick=WARN;
        if(mid)lab=ctx.label("地震！",mid,110,cc.color(255,90,40,255),445);
      }
      if(lab&&lab.isValid&&mid){ lab.setPosition(mid.x+(Math.random()-0.5)*shake*2, mid.y+(Math.random()-0.5)*shake*2); }
      g.lineWidth=ph<WARN?5:11;
      g.strokeColor=ph<WARN?cc.color(255,200,60,200):cc.color(255,60,30,255);
      for(var i=0;i<cracks.length;i++){
        var c=cracks[i];
        g.moveTo(c[0][0]+(Math.random()-0.5)*shake,c[0][1]);
        for(var j=1;j<c.length;j++)g.lineTo(c[j][0]+(Math.random()-0.5)*shake,c[j][1]+(Math.random()-0.5)*shake);
        g.stroke();
      }
      if(ph>=WARN&&ph<WARN+QUAKE&&ph>=nextKick){
        nextKick=ph+0.15;
        ctx.players.forEach(function(n,i){
          if(ctx.isDead(n))return;
          if(!hurt[i]&&Math.abs(velY(n))<60){ hurt[i]=true; ctx.hurtPct(n,5); }
          ctx.setVel(n, ctx.rnd(-400,400), ctx.rnd(700,1000));
        });
      }
      if(ph>=WARN+QUAKE){ state=0; killLab(); }
    });
  }
});

}catch(e){ try{ __fields.log('加载失败','47_quake.js',e&&e.message); }catch(_){} } })();


// ---- 48_repel.js ----
(function(){ try{
// 48 同极相斥：两人靠近到一定距离就互相排斥，靠得太近会被炸开并掉血
__fields.register({
  id:"repel", no:48, name:"同极相斥", emoji:"🧲",
  desc:"两人靠太近会被磁力弹开",
  start:function(ctx){
    var g=ctx.graphics(cc.v2(0,0),420);
    var NEAR=380, BURST=150, lastBurst=-99999;
    ctx.onUpdate(function(dt){
      var a=ctx.p1, b=ctx.p2;
      var pa=ctx.bodyPos(a), pb=ctx.bodyPos(b);
      if(!pa||!pb)return;
      var t=ctx.elapsed(), pulse=0.5+0.5*Math.sin(t*8);
      var dx=pb.x-pa.x, dy=pb.y-pa.y, d=Math.sqrt(dx*dx+dy*dy)||1;
      var close=d<NEAR;
      g.clear();
      [a,b].forEach(function(n){
        var c=ctx.canvasPt(n); if(!c||ctx.isDead(n))return;
        var rad=190+pulse*25+(close?20:0);
        g.lineWidth=close?10:5;
        g.strokeColor=close?cc.color(255,60,60,230):cc.color(80,160,255,170);
        g.fillColor=close?cc.color(255,60,60,60):cc.color(80,160,255,40);
        g.circle(c.x,c.y,rad); g.fill(); g.stroke();
        g.lineWidth=3; g.circle(c.x,c.y,rad*0.6); g.stroke();
      });
      if(ctx.isDead(a)||ctx.isDead(b))return;
      var ux=dx/d, uy=dy/d;
      if(Math.abs(dx)<1){ ux=ctx.pick([-1,1]); }
      if(close){
        var k=(NEAR-d)/NEAR, acc=Math.min(2500, 700+3000*k)*dt;
        ctx.addVel(a,-ux*acc,-uy*acc*0.4);
        ctx.addVel(b, ux*acc, uy*acc*0.4);
      }
      if(d<BURST&&ctx.now()-lastBurst>1000){
        lastBurst=ctx.now();
        var cp=ctx.toCanvas(cc.v2((pa.x+pb.x)/2,(pa.y+pb.y)/2));
        if(cp&&ctx.R){ ctx.R.impact(cp,cc.color(255,80,80,255)); ctx.R.drawRing(cp,cc.color(255,80,80,255),260,12,500,0); }
        var vya=Math.max(300,-uy*1100+300), vyb=Math.max(300,uy*1100+300);
        ctx.hurtPct(a,6,-ux*1100,vya);
        ctx.hurtPct(b,6, ux*1100,vyb);
        ctx.setVel(a,-ux*1100,vya);
        ctx.setVel(b, ux*1100,vyb);
      }
    });
  }
});

}catch(e){ try{ __fields.log('加载失败','48_repel.js',e&&e.message); }catch(_){} } })();


// ---- 49_tornado.js ----
(function(){ try{
// 49 龙卷风：一个大龙卷风在地面来回游走，被卷进去会被甩上天再扔出去
__fields.register({
  id:"tornado", no:49, name:"龙卷风", emoji:"🌪️",
  desc:"龙卷风满地乱走，卷进去会被扔飞",
  start:function(ctx){
    var r=ctx.mapRect();
    var x=r.x+r.width/2+ctx.rnd(-r.width*0.25,r.width*0.25);
    var dir=ctx.pick([-1,1]), SPEED=250, FUN=600, FADE=1.5;
    var floorY=r.y+20;
    var g=ctx.graphics(cc.v2(0,0),410);
    var caught=[null,null], cd=[0,0], nextTurn=ctx.rnd(2,4);
    ctx.onUpdate(function(dt){
      var t=ctx.elapsed();
      x+=dir*SPEED*dt;
      if(x<r.x+150){ x=r.x+150; dir=1; }
      if(x>r.xMax-150){ x=r.xMax-150; dir=-1; }
      if(t>nextTurn){ dir=ctx.pick([-1,1]); nextTurn=t+ctx.rnd(2,4); }
      var alpha=Math.min(1,t/FADE), active=t>=FADE;
      var base=ctx.toCanvas(cc.v2(x,floorY)), top=ctx.toCanvas(cc.v2(x,floorY+FUN));
      g.clear();
      if(base&&top){
        var H=top.y-base.y;
        for(var i=0;i<14;i++){
          var f=i/13, yy=base.y+H*f, w=40+f*130, sw=Math.sin(t*9+f*7)*w*0.3;
          g.lineWidth=14-f*4;
          g.strokeColor=cc.color(215-i*5,215-i*5,225,Math.floor(alpha*(active?230:160)));
          g.moveTo(base.x+sw-w,yy); g.lineTo(base.x+sw+w,yy+H/26*Math.cos(t*9+f*7)); g.stroke();
        }
        if(!active){
          g.strokeColor=cc.color(255,60,60,Math.floor(150+100*Math.sin(t*12)));
          g.lineWidth=6; g.circle(base.x,base.y,170); g.stroke();
        }
      }
      if(!active)return;
      ctx.players.forEach(function(n,i){
        if(ctx.isDead(n)){ caught[i]=null; return; }
        var bp=ctx.bodyPos(n); if(!bp)return;
        var c=caught[i];
        if(c){
          var e=t-c.t;
          if(e<0.7){
            ctx.setVel(n, Math.cos(e*20)*700+(x-bp.x)*3, 900);
          } else {
            ctx.setVel(n, ctx.pick([-1,1])*1300, 500);
            caught[i]=null; cd[i]=t+2;
          }
          return;
        }
        if(t<cd[i])return;
        if(Math.abs(bp.x-x)<150&&bp.y>floorY-100&&bp.y<floorY+FUN){
          caught[i]={t:t};
          ctx.hurtPct(n,8,0,900);
        }
      });
    });
  }
});

}catch(e){ try{ __fields.log('加载失败','49_tornado.js',e&&e.message); }catch(_){} } })();


// ---- 50_swap.js ----
(function(){ try{
// 50 位置互换：每 8 秒预警 1 秒后两人互换位置，并向上弹一下
__fields.register({
  id:"swap", no:50, name:"位置互换", emoji:"🔄",
  desc:"每8秒两人互换位置",
  start:function(ctx){
    var lbl=null, active=false, step=-1;
    var top=ctx.toCanvas(cc.v2(ctx.mapRect().x+ctx.mapRect().width/2,ctx.mapRect().y+ctx.mapRect().height*0.85));
    function setLbl(txt,col){
      if(!lbl||!lbl.isValid){ lbl=ctx.label(txt,top,150,col,440); }
      if(lbl){ var l=lbl.getComponent(cc.Label); if(l)l.string=txt; lbl.color=col; lbl.active=true; }
    }
    function hideLbl(){ if(lbl&&lbl.isValid)lbl.active=false; }
    function ringBoth(col,rad){
      ctx.players.forEach(function(n){
        var b=ctx.bodyPos(n); if(!b)return;
        ctx.R.drawRing(ctx.toCanvas(b),col,rad,12,300,0);
      });
    }
    function doSwap(){
      active=false; hideLbl();
      ringBoth(cc.color(255,255,255),260);
      ctx.swap();
      ctx.players.forEach(function(n){
        if(ctx.isDead(n))return;
        ctx.addVel(n,0,500);
        var b=ctx.bodyPos(n); if(b)ctx.R.drawRing(ctx.toCanvas(b),cc.color(255,220,80),260,12,400,0);
      });
    }
    function warn(){
      active=true; step=-1;
      var t0=ctx.now();
      var iv=function(){
        if(!active)return;
        var e=ctx.now()-t0, s=e<333?3:(e<667?2:1);
        if(s!==step){
          step=s; setLbl(String(s),cc.color(255,90,60));
          ringBoth(cc.color(255,80,60),200+40*(3-s));
          ctx.players.forEach(function(n){ ctx.toast("互换 "+s,n,cc.color(255,120,80),24); });
        }
        ctx.after(60,iv);
      };
      iv();
      ctx.after(1000,doSwap);
    }
    ctx.after(7000,warn);               // 第一次在 8 秒时发生
    ctx.every(8000,function(){ ctx.after(7000,warn); });
    ctx.onUpdate(function(dt){
      if(!active)return;
      var blink=Math.floor(ctx.elapsed()*12)%2;
      ctx.players.forEach(function(n){
        var b=ctx.bodyPos(n); if(!b)return;
        if(blink)ctx.R.drawRing(ctx.toCanvas(b),cc.color(255,200,60),140,8,120,0);
      });
    });
  }
});

}catch(e){ try{ __fields.log('加载失败','50_swap.js',e&&e.message); }catch(_){} } })();


// ---- 51_thunder.js ----
(function(){ try{
// 51 雷暴：每 3 秒盯上位置更高的人，头顶出现标记，0.9 秒后落雷
__fields.register({
  id:"thunder", no:51, name:"雷暴", emoji:"⚡",
  desc:"闪电劈向站得高的人",
  start:function(ctx){
    var r=ctx.mapRect();
    var g=ctx.graphics(cc.v2(0,0),430);
    var gb=ctx.graphics(cc.v2(0,0),435);
    var WARN=0.9, PERIOD=3, FADE=0.3;
    var target=null, warnStart=0, nextT=1.5, tx=null;
    var bolt=null, boltT=0, lab=null;
    function killLab(){ if(lab&&lab.isValid)lab.destroy(); lab=null; }
    function canvasScale(){
      var a=ctx.toCanvas(cc.v2(0,0)), b=ctx.toCanvas(cc.v2(100,0));
      return (a&&b)?Math.abs(b.x-a.x)/100:1;
    }
    function higher(){
      var best=null,by=-1e9;
      ctx.players.forEach(function(n){
        if(ctx.isDead(n))return;
        var p=ctx.bodyPos(n);
        if(p&&p.y>by){ by=p.y; best=n; }
      });
      return best;
    }
    function strike(wp){
      var cp=ctx.toCanvas(wp), top=ctx.toCanvas(cc.v2(wp.x,r.yMax));
      if(!cp||!top)return;
      var pts=[[top.x,top.y+80]], N=10;
      for(var i=1;i<N;i++){
        var f=i/N;
        pts.push([top.x+(cp.x-top.x)*f+(Math.random()-0.5)*90, top.y+80+(cp.y-top.y-80)*f]);
      }
      pts.push([cp.x,cp.y]);
      bolt=pts; boltT=ctx.elapsed();
      if(ctx.R){ ctx.R.impact(cp,cc.color(255,255,160,255)); ctx.R.drawRing(cp,cc.color(255,255,120,255),200,10,400,0); }
      ctx.players.forEach(function(n){
        if(ctx.isDead(n))return;
        var p=ctx.bodyPos(n); if(!p)return;
        var dx=p.x-wp.x, dy=p.y-wp.y;
        if(Math.sqrt(dx*dx+dy*dy)<160){ ctx.hurtPct(n,15,(dx>=0?1:-1)*300,900); }
      });
    }
    ctx.onUpdate(function(dt){
      var t=ctx.elapsed();
      g.clear(); gb.clear();
      if(!target&&t>=nextT){
        target=higher(); warnStart=t;
        if(target)lab=ctx.label("⚡",cc.v2(0,0),90,cc.color(255,240,60,255),440);
      }
      if(target){
        var e=t-warnStart;
        if(ctx.isDead(target)){ target=null; killLab(); nextT=t+PERIOD; }
        else {
          var bp=ctx.bodyPos(target), cp=bp&&ctx.toCanvas(bp);
          if(cp){
            var on=Math.sin(e*28)>-0.2;
            tx=cc.v2(bp.x,bp.y);
            g.lineWidth=8;
            g.strokeColor=cc.color(255,230,40,on?255:100);
            g.fillColor=cc.color(255,230,40,on?90:30);
            var rad=160*canvasScale();
            g.circle(cp.x,cp.y,rad); g.fill(); g.stroke();
            if(lab&&lab.isValid)lab.setPosition(cp.x,cp.y+rad+60);
          }
          if(e>=WARN){
            if(tx)strike(tx);
            target=null; killLab(); nextT=t+PERIOD;
          }
        }
      }
      if(bolt){
        var k=1-(t-boltT)/FADE;
        if(k<=0){ bolt=null; }
        else {
          gb.lineWidth=34; gb.strokeColor=cc.color(255,240,120,Math.floor(120*k));
          gb.moveTo(bolt[0][0],bolt[0][1]);
          for(var i=1;i<bolt.length;i++)gb.lineTo(bolt[i][0],bolt[i][1]);
          gb.stroke();
          gb.lineWidth=16; gb.strokeColor=cc.color(255,255,255,Math.floor(255*k));
          gb.moveTo(bolt[0][0],bolt[0][1]);
          for(var j=1;j<bolt.length;j++)gb.lineTo(bolt[j][0],bolt[j][1]);
          gb.stroke();
        }
      }
    });
  }
});

}catch(e){ try{ __fields.log('加载失败','51_thunder.js',e&&e.message); }catch(_){} } })();


// ---- 52_firetrail.js ----
(function(){ try{
// 52 火焰足迹：每个人走过的地方留下自己颜色的火，对手踩到就烧
__fields.register({
  id:"firetrail", no:52, name:"火焰足迹", emoji:"🔥",
  desc:"走过留火，踩对手的火掉血",
  start:function(ctx){
    var LIFE=3, RAD=55, CAP=120;
    var flames=[], lastPos=[null,null], lastDrop=[0,0], cool=[0,0];
    var g=ctx.graphics(cc.v2(0,0),405);
    ctx.onUpdate(function(dt){
      var t=ctx.elapsed(), now=ctx.now(), i, j, n;
      for(i=0;i<2;i++){
        n=ctx.players[i];
        var bp=ctx.bodyPos(n);
        if(!bp||ctx.isDead(n))continue;
        if(!lastPos[i]){ lastPos[i]=cc.v2(bp.x,bp.y); lastDrop[i]=t; }
        if(t-lastDrop[i]>=0.12){
          var dx=bp.x-lastPos[i].x, dy=bp.y-lastPos[i].y;
          if(dx*dx+dy*dy>625){
            flames.push({o:i,x:bp.x,y:bp.y-60,t:t,ph:Math.random()*6});
            if(flames.length>CAP)flames.shift();
            lastPos[i]=cc.v2(bp.x,bp.y);
          }
          lastDrop[i]=t;
        }
      }
      flames=flames.filter(function(f){ return t-f.t<LIFE; });
      g.clear();
      var c0=ctx.toCanvas(cc.v2(0,0)), c1=ctx.toCanvas(cc.v2(100,0));
      var s=Math.abs(c1.x-c0.x)/100||1;
      for(j=0;j<flames.length;j++){
        var f=flames[j], age=(t-f.t)/LIFE, a=1-age, c=ctx.toCanvas(cc.v2(f.x,f.y));
        var fl=1+0.18*Math.sin(t*25+f.ph), r=RAD*s*fl*(0.7+0.3*a);
        if(f.o===0){
          g.fillColor=cc.color(40,120,255,Math.floor(150*a)); g.circle(c.x,c.y,r); g.fill();
          g.fillColor=cc.color(120,220,255,Math.floor(210*a)); g.circle(c.x,c.y+r*0.15,r*0.6); g.fill();
          g.fillColor=cc.color(255,255,255,Math.floor(230*a)); g.circle(c.x,c.y+r*0.25,r*0.28); g.fill();
        }else{
          g.fillColor=cc.color(255,60,20,Math.floor(150*a)); g.circle(c.x,c.y,r); g.fill();
          g.fillColor=cc.color(255,170,30,Math.floor(210*a)); g.circle(c.x,c.y+r*0.15,r*0.6); g.fill();
          g.fillColor=cc.color(255,250,170,Math.floor(230*a)); g.circle(c.x,c.y+r*0.25,r*0.28); g.fill();
        }
      }
      for(i=0;i<2;i++){
        n=ctx.players[i];
        if(ctx.isDead(n)||now<cool[i])continue;
        var parts=ctx.parts(n), hit=false;
        for(j=0;j<flames.length&&!hit;j++){
          var f2=flames[j];
          if(f2.o===i)continue;
          for(var k=0;k<parts.length;k++){
            var p=ctx.partPos(parts[k]), ex=p.x-f2.x, ey=p.y-f2.y;
            if(ex*ex+ey*ey<RAD*RAD){ hit=true; break; }
          }
        }
        if(hit){
          cool[i]=now+400;
          ctx.hurtPct(n,6);
          ctx.addVel(n,0,450);
        }
      }
    });
  }
});

}catch(e){ try{ __fields.log('加载失败','52_firetrail.js',e&&e.message); }catch(_){} } })();


// ---- 53_sizebet.js ----
(function(){ try{
// 53 体型赌注：挨打变小、打人变大；体型越大伤害越高
__fields.register({
  id:"sizebet", no:53, name:"体型赌注", emoji:"📏",
  desc:"挨打变小，打人变大，越大越疼",
  start:function(ctx){
    if(!ctx.R){ ctx.log("sizebet: 没有特效库 ctx.R"); return; }
    var size=[1,1];
    function apply(i){
      var n=ctx.players[i], s=size[i];
      if(!n||!n.isValid)return;
      if(Math.abs(s-1)<0.01){ ctx.R.restoreScale(n); return; }
      if(s>1)ctx.R.applyScaleRoll(n,"giant",s,600000);
      else ctx.R.applyScaleRoll(n,"shrink",1/s,600000);
    }
    ctx.onHit(function(vhc,dmg,info){
      if(info.terrain||!(dmg>0))return dmg;
      var a=ctx.players.indexOf(info.attacker), v=ctx.players.indexOf(vhc.node);
      if(a<0||v<0)return dmg;
      var mult=size[a];
      var nv=Math.max(0.5,size[v]-0.15), na=Math.min(1.9,size[a]+0.15);
      if(nv!==size[v]){ size[v]=nv; apply(v); ctx.toast("变小!",vhc.node,cc.color(120,180,255)); }
      if(na!==size[a]){ size[a]=na; apply(a); ctx.toast("变大!",info.attacker,cc.color(255,150,80)); }
      return dmg*mult;
    });
  },
  stop:function(ctx){
    if(!ctx.R)return;
    ctx.players.forEach(function(n){ ctx.R.restoreScale(n); });
  }
});

}catch(e){ try{ __fields.log('加载失败','53_sizebet.js',e&&e.message); }catch(_){} } })();


// ---- 54_combo.js ----
(function(){ try{
// 54 连击狂热：连续打中对手不被反击，伤害越打越高（最高x3）
__fields.register({
  id:"combo", no:54, name:"连击狂热", emoji:"🥊",
  desc:"连续命中伤害叠加，被打断清零",
  start:function(ctx){
    var combo=[0,0], mult=[1,1], last=[-99999,-99999], labels=[null,null];
    function mkLabel(i){
      if(labels[i]&&labels[i].isValid)labels[i].destroy();
      labels[i]=ctx.label("",cc.v2(0,-9999),40,cc.color(255,170,40),435);
    }
    mkLabel(0); mkLabel(1);
    ctx.onHit(function(vhc,dmg,info){
      if(info.terrain||!(dmg>0))return dmg;
      var a=ctx.players.indexOf(info.attacker), v=ctx.players.indexOf(vhc.node);
      if(a<0||v<0)return dmg;
      combo[v]=0;
      var c=combo[a], m=Math.min(3,1+0.3*c);
      combo[a]=c+1; mult[a]=m; last[a]=ctx.now();
      return dmg*m;
    });
    ctx.onUpdate(function(dt){
      for(var i=0;i<2;i++){
        var n=ctx.players[i], l=labels[i];
        if(!l||!l.isValid||!n||!n.isValid)continue;
        var age=ctx.now()-last[i];
        if(combo[i]<2||age>2000||ctx.isDead(n)){ l.setPosition(0,-9999); continue; }
        var p=ctx.canvasPt(n); if(!p)continue;
        var cm=Math.min(combo[i],12);
        var lb=l.getComponent(cc.Label);
        if(lb){
          lb.string=combo[i]+"连击 ×"+mult[i].toFixed(1);
          lb.fontSize=44+cm*8; lb.lineHeight=lb.fontSize+8;
        }
        l.color=cm>=6?cc.color(255,60,40):cc.color(255,190,50);
        l.opacity=age>1200?Math.max(0,Math.floor(255*(2000-age)/800)):255;
        l.setPosition(p.x,p.y+170+cm*4);
      }
    });
  }
});

}catch(e){ try{ __fields.log('加载失败','54_combo.js',e&&e.message); }catch(_){} } })();


// ---- 55_laststand.js ----
(function(){ try{
// 55 背水一战：血越少伤害越高；掉到30%以下红光加速
__fields.register({
  id:"laststand", no:55, name:"背水一战", emoji:"😤",
  desc:"血越少伤害越高，残血爆发",
  start:function(ctx){
    var triggered=[false,false], boostEnd=[0,0], auras=[null,null];
    ctx.onHit(function(vhc,dmg,info){
      if(info.terrain||!(dmg>0)||!info.attacker)return dmg;
      var h=ctx.hc(info.attacker); if(!h||!(h.maxhp>0))return dmg;
      var miss=Math.max(0,Math.min(1,1-h.hp/h.maxhp));
      return dmg*(1+1.5*miss);
    });
    ctx.onUpdate(function(dt){
      var t=ctx.elapsed();
      for(var i=0;i<2;i++){
        var n=ctx.players[i]; if(!n||!n.isValid||ctx.isDead(n))continue;
        var h=ctx.hc(i===0?ctx.p1:ctx.p2); if(!h||!(h.maxhp>0))continue;
        if(!triggered[i]&&h.hp/h.maxhp<0.3){
          triggered[i]=true; boostEnd[i]=ctx.now()+1500;
          ctx.toast("背水一战!",n,cc.color(255,60,50));
          auras[i]=ctx.graphics(cc.v2(0,-9999),432);
        }
        if(triggered[i]){
          var g=auras[i], p=ctx.canvasPt(n);
          if(g&&g.isValid&&p){
            g.clear();
            var r=130+Math.sin(t*10)*14;
            g.fillColor=cc.color(255,40,30,50); g.circle(p.x,p.y,r); g.fill();
            g.strokeColor=cc.color(255,60,40,230); g.lineWidth=12;
            g.circle(p.x,p.y,r); g.stroke();
            g.strokeColor=cc.color(255,200,80,200); g.lineWidth=5;
            g.circle(p.x,p.y,r-16); g.stroke();
          }
          if(ctx.now()<boostEnd[i]){
            var rb=ctx.bodyRb(n);
            if(rb){
              var vx=rb.linearVelocity.x;
              if(Math.abs(vx)>60&&Math.abs(vx)<900){
                var k=Math.pow(1.05,Math.min(dt,0.1)*60);
                ctx.parts(n).forEach(function(r2){ var v=r2.linearVelocity; r2.linearVelocity=cc.v2(v.x*k,v.y); });
              }
            }
          }
        }
      }
    });
  }
});

}catch(e){ try{ __fields.log('加载失败','55_laststand.js',e&&e.message); }catch(_){} } })();


// ---- 56_flipside.js ----
(function(){ try{
// 56 天地颠倒：一人正常、一人往天上掉，每9秒互换
__fields.register({
  id:"flipside", no:56, name:"天地颠倒", emoji:"🔃",
  desc:"一人向上掉，每9秒互换",
  start:function(ctx){
    var flipped=Math.random()<0.5?0:1, labels=[null,null], warn=[null,null], warning=false;
    function applyG(){
      for(var i=0;i<2;i++){
        ctx.gravityScale(ctx.players[i],i===flipped?-1:1);
        var l=labels[i];
        if(l&&l.isValid){ l.destroy(); }
        labels[i]=ctx.label(i===flipped?"⬆":"⬇",cc.v2(0,-9999),60,i===flipped?cc.color(255,120,90):cc.color(120,200,255),435);
      }
    }
    applyG();
    ctx.toast("你向上掉!",ctx.players[flipped],cc.color(255,140,90));
    function cycle(){
      ctx.after(8000,function(){
        warning=true;
        for(var i=0;i<2;i++){
          warn[i]=ctx.label("🔃",cc.v2(0,-9999),110,cc.color(255,230,80),440);
          ctx.toast("1秒后颠倒!",ctx.players[i],cc.color(255,230,120));
        }
        ctx.after(1000,function(){
          warning=false;
          for(var j=0;j<2;j++){ if(warn[j]&&warn[j].isValid)warn[j].destroy(); warn[j]=null; }
          flipped=1-flipped; applyG();
          ctx.toast("你向上掉!",ctx.players[flipped],cc.color(255,140,90));
          cycle();
        });
      });
    }
    cycle();
    ctx.onUpdate(function(dt){
      var blink=Math.floor(ctx.elapsed()*8)%2===0;
      for(var i=0;i<2;i++){
        var n=ctx.players[i]; if(!n||!n.isValid)continue;
        var p=ctx.canvasPt(n); if(!p)continue;
        var l=labels[i]; if(l&&l.isValid)l.setPosition(p.x,p.y+130);
        var w=warn[i]; if(w&&w.isValid){ w.setPosition(p.x,p.y+260); w.opacity=blink?255:90; }
      }
    });
  }
});

}catch(e){ try{ __fields.log('加载失败','56_flipside.js',e&&e.message); }catch(_){} } })();


// ---- 57_collapse.js ----
(function(){ try{
// 57 塌方：平台被踩久了会抖动变红然后塌掉，4 秒后重新长回来（最宽的主地面不塌）
__fields.register({
  id:"collapse", no:57, name:"塌方", emoji:"🧱",
  desc:"平台踩久会塌，别站太久",
  start:function(ctx){
    var ents=[];
    function skip(n){ for(var p=n;p;p=p.parent){ if(p.name==="Walls"||p.group==="deads")return true; if(p.name==="Canvas")break; } return false; }
    var cv=cc.find("Canvas"), G=cv&&cv.getChildByName("Ground");
    var mr=ctx.mapRect(), maxW=mr.width*0.6;
    var seen=[];
    if(G){
      G.getComponentsInChildren(cc.PhysicsCollider).forEach(function(col){
        var n=col.node; if(!n||skip(n))return;
        if(seen.indexOf(n)>=0)return;
        var b=null; try{ b=n.getBoundingBoxToWorld(); }catch(_){}
        if(!b||b.width>maxW||b.width<=0)return;
        seen.push(n);
        var cols=n.getComponents(cc.PhysicsCollider), orig=[];
        cols.forEach(function(c){ orig.push(c.enabled); });
        ents.push({n:n,cols:cols,colOrig:orig,x:n.x,col0:n.color.clone(),op:n.opacity,
          st:0,stood:0,t:0,rb:n.getComponent(cc.RigidBody)});
      });
    }
    ctx.log("塌方平台数",ents.length);
    function setCols(e,on){
      e.cols.forEach(function(c,i){ if(c.isValid){ c.enabled=on?e.colOrig[i]:false; } });
    }
    function sync(e){ if(e.rb&&e.rb.syncPosition)e.rb.syncPosition(true); }
    function reset(e){
      if(!e.n.isValid)return;
      e.n.x=e.x; e.n.color=e.col0; e.n.opacity=e.op;
      sync(e);
    }
    ctx.onUpdate(function(dt){
      var pts=[];
      ctx.players.forEach(function(n){ if(ctx.isDead(n))return; ctx.parts(n).forEach(function(rb){ pts.push(ctx.partPos(rb)); }); });
      ents.forEach(function(e){
        var n=e.n; if(!n.isValid)return;
        var b=null; try{ b=n.getBoundingBoxToWorld(); }catch(_){}
        if(!b)return;
        // 抖动时节点 x 有偏移，用原始位置换算
        var dx=n.x-e.x, bx=b.x-dx, bxMax=b.xMax-dx;
        var on=false, inside=false, i, p;
        for(i=0;i<pts.length;i++){
          p=pts[i];
          if(p.x>bx-10&&p.x<bxMax+10){
            if(p.y>b.y&&p.y<b.yMax+40)on=true;
            if(p.y>b.y-20&&p.y<b.yMax+20)inside=true;
          }
        }
        if(e.st===0){
          if(on)e.stood+=dt;
          if(e.stood>=1.2){ e.st=1; e.t=0; }
        } else if(e.st===1){
          e.t+=dt;
          n.x=e.x+((Math.random()<0.5)?-6:6);
          n.color=cc.color(255,70,70);
          if(e.t>=0.6){
            e.st=2; e.t=0;
            n.x=e.x; n.color=e.col0; sync(e);
            setCols(e,false); n.opacity=0;
            var c=ctx.toCanvas(cc.v2((bx+bxMax)/2,(b.y+b.yMax)/2));
            ctx.R.impact(c,cc.color(200,170,120));
          }
        } else if(e.st===2){
          e.t+=dt;
          if(e.t>=4&&!inside){ e.st=3; e.t=0; }
        } else if(e.st===3){
          e.t+=dt;
          var k=Math.min(1,e.t/0.5);
          n.opacity=Math.round(e.op*k);
          n.color=(Math.floor(e.t*20)%2===0)?cc.color(255,70,70):e.col0;
          if(e.t>=0.5){
            if(inside){ e.t=0.5; }
            else{
              setCols(e,true); n.color=e.col0; n.opacity=e.op;
              e.st=0; e.stood=0; e.t=0;
            }
          }
        }
      });
    });
    ctx.onCleanup(function(){
      ents.forEach(function(e){
        if(!e.n.isValid)return;
        reset(e);
        e.cols.forEach(function(c,i){ if(c.isValid)c.enabled=e.colOrig[i]; });
      });
    });
  }
});

}catch(e){ try{ __fields.log('加载失败','57_collapse.js',e&&e.message); }catch(_){} } })();


// ---- 58_windmill.js ----
(function(){ try{
// 58 风车：场地中央一根巨大的旋转杆，被扫到扣血并被打飞
__fields.register({
  id:"windmill", no:58, name:"风车", emoji:"🎡",
  desc:"中央巨杆旋转，扫到被打飞",
  start:function(ctx){
    var r=ctx.mapRect();
    var px=r.x+r.width*0.5, py=r.y+r.height*0.45, half=r.width*0.55, TH=40, HIT=45;
    var SPD=100*Math.PI/180, ang=ctx.rnd(0,Math.PI), dir=1, lastFlip=0;
    var cool=[0,0];
    var g=ctx.graphics(cc.v2(0,0),410);
    ctx.onUpdate(function(dt){
      if(dt>0.1)dt=0.1;
      var t=ctx.elapsed(), now=ctx.now();
      if(t-lastFlip>=8){ lastFlip=t; dir=-dir; }
      ang+=dir*SPD*dt;
      var fade=Math.min(1,t/1.2), live=t>=1.2;
      var cs=Math.cos(ang), sn=Math.sin(ang);
      var ax=px-cs*half, ay=py-sn*half, bx=px+cs*half, by=py+sn*half;
      var A=ctx.toCanvas(cc.v2(ax,ay)), B=ctx.toCanvas(cc.v2(bx,by)), C=ctx.toCanvas(cc.v2(px,py));
      var c1=ctx.toCanvas(cc.v2(px+100,py)), s=Math.abs(c1.x-C.x)/100||1;
      var al=Math.floor(255*fade), w=TH*s;
      g.clear();
      g.lineCap=cc.Graphics.LineCap.ROUND;
      g.strokeColor=cc.color(255,200,60,al); g.lineWidth=w+14*s;
      g.moveTo(A.x,A.y); g.lineTo(B.x,B.y); g.stroke();
      g.strokeColor=cc.color(40,30,50,al); g.lineWidth=w;
      g.moveTo(A.x,A.y); g.lineTo(B.x,B.y); g.stroke();
      g.fillColor=cc.color(255,200,60,al); g.circle(C.x,C.y,36*s); g.fill();
      g.fillColor=cc.color(60,40,60,al); g.circle(C.x,C.y,22*s); g.fill();
      if(!live)return;
      var lx=bx-ax, ly=by-ay, L2=lx*lx+ly*ly;
      for(var i=0;i<2;i++){
        var n=ctx.players[i];
        if(ctx.isDead(n)||now<cool[i])continue;
        var parts=ctx.parts(n), best=null, bd=1e9;
        for(var k=0;k<parts.length;k++){
          var p=ctx.partPos(parts[k]);
          var u=((p.x-ax)*lx+(p.y-ay)*ly)/L2; u=u<0?0:(u>1?1:u);
          var qx=ax+lx*u, qy=ay+ly*u, dx=p.x-qx, dy=p.y-qy, d=Math.sqrt(dx*dx+dy*dy);
          if(d<bd){ bd=d; best={x:p.x,y:p.y,qx:qx,qy:qy}; }
        }
        if(best&&bd<HIT){
          cool[i]=now+800;
          var nx=-sn, ny=cs;
          var side=((best.x-px)*nx+(best.y-py)*ny)>=0?1:-1;
          var rx=best.qx-px, ry=best.qy-py;
          var tx=-ry*dir, ty=rx*dir;
          var tl=Math.sqrt(tx*tx+ty*ty)||1; tx/=tl; ty/=tl;
          var vx=nx*side+tx, vy=ny*side+ty, vl=Math.sqrt(vx*vx+vy*vy)||1;
          ctx.hurtPct(n,12,vx/vl*1300,vy/vl*1300+300);
          var bp=ctx.bodyPos(n);
          if(ctx.R&&bp)ctx.R.impact(ctx.toCanvas(bp),cc.color(255,200,60));
        }
      }
    });
  }
});

}catch(e){ try{ __fields.log('加载失败','58_windmill.js',e&&e.message); }catch(_){} } })();


// ---- 59_rewind.js ----
(function(){ try{
// 59 倒带：每 9 秒给两人各放一个锚点，3 秒后各自被拉回锚点并清零速度（血量不恢复）
__fields.register({
  id:"rewind", no:59, name:"倒带", emoji:"⏪",
  desc:"3秒后被拉回原地，血不回",
  start:function(ctx){
    var g=ctx.graphics(cc.v2(0,0),290);
    var anchors=[null,null], labels=[null,null], tEnd=0, on=false;
    function lblOf(i){
      if(!labels[i]||!labels[i].isValid){ labels[i]=ctx.label("倒带 3.0",cc.v2(0,0),44,cc.color(120,255,255),440); }
      return labels[i];
    }
    function drop(){
      on=true; tEnd=ctx.now()+3000;
      ctx.players.forEach(function(n,i){
        var b=ctx.isDead(n)?null:ctx.bodyPos(n);
        anchors[i]=b?cc.v2(b.x,b.y):null;
        if(b){ ctx.R.drawRing(ctx.toCanvas(b),cc.color(120,255,255),220,10,400,0); ctx.toast("锚点已设下",n,cc.color(120,255,255),22); }
      });
    }
    function fire(){
      on=false;
      ctx.players.forEach(function(n,i){
        var a=anchors[i]; anchors[i]=null;
        if(!a||ctx.isDead(n))return;
        var b=ctx.bodyPos(n);
        if(b)ctx.R.drawRing(ctx.toCanvas(b),cc.color(255,255,255),240,12,500,0);
        ctx.teleport(n,a);
        ctx.setVel(n,0,0);
        ctx.R.drawRing(ctx.toCanvas(a),cc.color(120,255,255),300,14,600,0);
        ctx.R.drawRing(ctx.toCanvas(a),cc.color(255,255,255),180,8,600,120);
        ctx.toast("倒带！",n,cc.color(120,255,255),26);
      });
      labels.forEach(function(l){ if(l&&l.isValid)l.active=false; });
    }
    ctx.after(4000,function(){ drop(); ctx.after(3000,fire); });   // 第一次 4 秒放锚，7 秒回
    ctx.every(9000,function(){
      if(ctx.elapsed()<8)return;
      drop(); ctx.after(3000,fire);
    });
    ctx.onUpdate(function(dt){
      g.clear();
      if(!on)return;
      var left=Math.max(0,(tEnd-ctx.now())/1000), T=ctx.elapsed();
      anchors.forEach(function(a,i){
        if(!a)return;
        var c=ctx.toCanvas(a), R=90, pulse=0.5+0.5*Math.sin(T*8);
        g.fillColor=cc.color(60,220,255,Math.round(50+40*pulse)); g.circle(c.x,c.y,R); g.fill();
        g.strokeColor=cc.color(120,255,255,255); g.lineWidth=8; g.circle(c.x,c.y,R); g.stroke();
        g.moveTo(c.x-R*0.7,c.y); g.lineTo(c.x+R*0.7,c.y); g.moveTo(c.x,c.y-R*0.7); g.lineTo(c.x,c.y+R*0.7); g.stroke();
        // 收缩的倒计时圈
        g.strokeColor=cc.color(255,255,255,200); g.lineWidth=5; g.circle(c.x,c.y,R+20+left*30); g.stroke();
        var ln=lblOf(i); ln.active=true; ln.setPosition(c.x,c.y+R+50);
        var l=ln.getComponent(cc.Label); if(l)l.string="倒带 "+left.toFixed(1);
      });
      for(var j=0;j<2;j++){ if(!anchors[j]&&labels[j]&&labels[j].isValid)labels[j].active=false; }
    });
  }
});

}catch(e){ try{ __fields.log('加载失败','59_rewind.js',e&&e.message); }catch(_){} } })();


// ---- 60_landmine.js ----
(function(){ try{
// 60 落地炸弹：每次落地都会在脚下留一颗炸弹，1.3 秒后爆炸，连自己也炸
__fields.register({
  id:"landmine", no:60, name:"落地炸弹", emoji:"💣",
  desc:"落地留炸弹，1.3秒后爆炸",
  start:function(ctx){
    var FUSE=1.3, BR=220, MAXB=8;
    var bombs=[], prevVy=[0,0], cool=[0,0];
    var g=ctx.graphics(cc.v2(0,0),408);
    function explode(b){
      b.dead=true;
      var c=ctx.toCanvas(cc.v2(b.x,b.y));
      var c1=ctx.toCanvas(cc.v2(b.x+BR,b.y)), rc=Math.abs(c1.x-c.x);
      if(ctx.R){
        ctx.R.drawRing(c,cc.color(255,150,30),rc,14,500,0);
        ctx.R.drawRing(c,cc.color(255,230,100),rc*0.6,10,400,0);
        ctx.R.impact(c,cc.color(255,150,30));
      }
      ctx.players.forEach(function(n){
        if(ctx.isDead(n))return;
        var bp=ctx.bodyPos(n); if(!bp)return;
        var dx=bp.x-b.x, dy=bp.y-b.y, d=Math.sqrt(dx*dx+dy*dy);
        if(d<BR){
          if(d<1){ dx=0; dy=1; d=1; }
          ctx.hurtPct(n,14,dx/d*1200,dy/d*1200+250);
        }
      });
    }
    ctx.onUpdate(function(dt){
      var t=ctx.elapsed(), now=ctx.now(), i, j;
      for(i=0;i<2;i++){
        var n=ctx.players[i], rb=ctx.bodyRb(n);
        if(!rb){ prevVy[i]=0; continue; }
        var vy=rb.linearVelocity.y;
        if(!ctx.isDead(n)&&prevVy[i]<-350&&vy>-60&&now>=cool[i]){
          var bp=ctx.bodyPos(n);
          if(bp){
            cool[i]=now+500;
            bombs.push({x:bp.x,y:bp.y,t:t,dead:false});
            var live=bombs.filter(function(b){return !b.dead;});
            if(live.length>MAXB)live[0].dead=true;
          }
        }
        prevVy[i]=vy;
      }
      g.clear();
      var s0=ctx.toCanvas(cc.v2(0,0)), s1=ctx.toCanvas(cc.v2(100,0)), s=Math.abs(s1.x-s0.x)/100||1;
      for(j=0;j<bombs.length;j++){
        var b=bombs[j];
        if(b.dead)continue;
        var age=t-b.t;
        if(age>=FUSE){ explode(b); continue; }
        var c=ctx.toCanvas(cc.v2(b.x,b.y)), k=age/FUSE;
        g.lineWidth=5*s;
        g.strokeColor=cc.color(255,60,30,Math.floor(120+100*k));
        g.circle(c.x,c.y,BR*s); g.stroke();
        g.strokeColor=cc.color(255,220,80,230); g.lineWidth=7*s;
        g.circle(c.x,c.y,BR*s*(1-k)); g.stroke();
        g.fillColor=cc.color(15,15,20,255); g.circle(c.x,c.y,45*s); g.fill();
        g.fillColor=cc.color(70,70,85,255); g.circle(c.x-14*s,c.y+14*s,12*s); g.fill();
        var blink=Math.floor(age*(6+10*k))%2===0;
        g.fillColor=blink?cc.color(255,40,40,255):cc.color(120,0,0,255);
        g.circle(c.x,c.y+50*s,14*s); g.fill();
      }
      bombs=bombs.filter(function(b){return !b.dead;});
    });
  }
});

}catch(e){ try{ __fields.log('加载失败','60_landmine.js',e&&e.message); }catch(_){} } })();
