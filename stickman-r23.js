// r23 (2026-11-25)：meme 大头 + meme 武器。每回合开局两边强制随机戴一个 meme 头；皮肤菜单里的皮肤图也换成 meme。
(function(){
  "use strict";
  var BASE="/assets/icons/r23/heads/";
  var LIST=[["h00","熊猫头"],["h01","滑稽"],["h02","狗头"],["h03","斜眼柴犬"],["h04","委屈柴犬"],["h05","流汗黄豆"],["h06","呵呵"],["h07","吃瓜"],["h08","蘑菇头"],["h09","臭脸猫"],["h10","香蕉猫"],["h11","嫌弃白猫"],["h12","哈基米"],["h13","哭哭点赞猫"],["h14","二哈"],["h15","震惊脸"],["h16","傻笑海星"],["h17","嘲讽脸"],["h18","社会猪"],["h19","胖胖龙"],["h20","腮红熊"],["h21","土拨鼠"],["h22","尴尬猴"],["h23","绅士熊"],["h24","摩艾"],["h25","骷髅"],["h26","贱笑脸"],["h27","狂笑脸"],["h28","暴怒脸"],["h29","大鹅"],["h30","斗鸡眼"],["h31","坏笑猫"],["h32","淡定猫"],["h33","悲伤蛙"],["h34","咕咕鸽"],["h35","柠檬精"],["h36","问号脸"],["h37","小丑"],["h38","书呆子"],["h39","戴墨镜"]];
  var HEADS=false; // 2026-11-25 用户要恢复原版头像：meme 头关掉（奶蛙版存在 stickman-r23.js.naiwa）
  var SF={}, loaded=0;
  window.__r23={LIST:LIST,SF:SF,cur:{}};
  function LOG(){ try{ console.log.apply(console,["[r23]"].concat([].slice.call(arguments))); }catch(e){} }
  function load(){
    function one(id,tries){
      cc.assetManager.loadRemote(BASE+id+".png?v=r23h",{ext:".png"},function(e,t){
        if(!e&&t){ SF[id]=new cc.SpriteFrame(t); loaded++; }
        else if(tries<4) setTimeout(function(){ one(id,tries+1); },800*(tries+1));
        else LOG("头像失败",id,e&&e.message);
      });
    }
    LIST.forEach(function(it,i){ setTimeout(function(){ one(it[0],0); },i*60); });
  }
  function games(){ try{ var c=cc.find("Canvas"); return c&&c.getComponent("Games"); }catch(e){ return null; } }
  function toast(t,n,col){ try{ if(window.__toastNearPlayer)window.__toastNearPlayer(t,n,col||new cc.Color(255,230,120),26); }catch(e){} }
  function center(n){ var p=n&&n.isValid&&n.getChildByName("present"); return p&&p.getChildByName("Center"); }
  function put(n,id){
    var c=center(n), sf=SF[id]; if(!c||!sf)return false;
    var sp=c.getComponent(cc.Sprite); if(!sp)return false;
    c.active=true; sp.sizeMode=cc.Sprite.SizeMode.CUSTOM; sp.spriteFrame=sf; c.width=146; c.height=146; c.scale=0.68; c.angle=0;
    n.__r23head=id; return true;
  }
  function pick(not){ var ids=LIST.map(function(x){return x[0];}).filter(function(x){return x!==not&&SF[x];}); return ids[Math.floor(Math.random()*ids.length)]; }
  function nameOf(id){ for(var i=0;i<LIST.length;i++)if(LIST[i][0]===id)return LIST[i][1]; return id; }
  var lastP=null, lastE=null;
  function tick(){
    if(typeof cc==="undefined"||(HEADS&&loaded<10))return;
    var g=games(); if(!g||!g.player||!g.enemy||!g.player.isValid||!g.enemy.isValid)return;
    if(g.player!==lastP||g.enemy!==lastE){
      lastP=g.player; lastE=g.enemy;
      var a=pick(null), b=pick(a);
      window.__r23.cur={p1:a,p2:b};
      wcur.p1=null; wcur.p2=null; wroot.p1=null; wroot.p2=null; fpend.p1=fpend.p2=true; // 武器在 tickW 里看到新武器时抽
      if(HEADS){ put(g.player,a); put(g.enemy,b); } else window.__r23.cur={};
      var P=g.player,E=g.enemy;
      if(HEADS)setTimeout(function(){ if(P.isValid)toast("🎭 "+nameOf(a),P); if(E.isValid)toast("🎭 "+nameOf(b),E); },700);
      return;
    }
    tickW(g);
    // 游戏自己的初始化可能晚一点又把皮肤写回去：盯住
    [[g.player,window.__r23.cur.p1],[g.enemy,window.__r23.cur.p2]].forEach(function(x){
      var c=center(x[0]); if(!c||!x[1])return; var sp=c.getComponent(cc.Sprite);
      if(!c.active||!sp||sp.spriteFrame!==SF[x[1]])put(x[0],x[1]);
    });
  }

  // ======================= meme 武器 =======================
  // 每回合两边的武器各套一个 meme 外观，打中人有各自的搞笑效果（概率触发，有冷却）
  var WBASE="/assets/icons/r23/w/";
  var WL=[["toast","彩虹吐司"],["hammer","贱笑锤"],["nokia","诺基亚"],["rev","反转卡"],["bonk","BONK 球棒"],["stonks","Stonks"],["chicken","橡皮鸡"]];
  var WSF={}, wcur={}, wroot={}, ORIG_N=40; // 原版随机池 40 把（allBlue_0~39），meme 武器和它们放进同一个池子，每把概率一样
  window.__r23.WL=WL; window.__r23.WSF=WSF; window.__r23.wcur=wcur; window.__r23.wroot=wroot; var forced=window.__r23.forced={p1:null,p2:null}, fpend={p1:false,p2:false}; // 武器面板里自选的 meme 武器（只管开局那把，局中换武器照常随机）
  try{ var fs=JSON.parse(localStorage.getItem("r23.forced")||"{}"); forced.p1=fs.p1||null; forced.p2=fs.p2||null; }catch(e){}
  function loadW(){ WL.forEach(function(it,i){ (function one(t){ cc.assetManager.loadRemote(WBASE+it[0]+".png?v=r23h",{ext:".png"},function(e,tx){ if(!e&&tx)WSF[it[0]]=new cc.SpriteFrame(tx); else if(t<4)setTimeout(function(){one(t+1);},800*(t+1)); }); })(0); }); }
  function wname(id){ for(var i=0;i<WL.length;i++)if(WL[i][0]===id)return WL[i][1]; return id; }
  function wpick(not){ var a=WL.map(function(x){return x[0];}).filter(function(x){return x!==not&&WSF[x];}); return a[Math.floor(Math.random()*a.length)]; }
  function weaponOf(root){ var w=root.getComponent("Weapon"); if(w)return w; var b=root.getChildByName("body"); return b&&b.getComponent("Weapon"); }
  function skinWeapon(root,id){
    var sf=WSF[id]; if(!sf)return;
    var best=null, area=0;
    root.getComponentsInChildren(cc.Sprite).forEach(function(sp){
      if(sp.node.name==="r23meme")return;
      var a=sp.node.width*sp.node.height; if(sp.spriteFrame&&a>area){ area=a; best=sp.node; }
      sp.enabled=false;
    });
    if(!best)return;
    var o=root.__r23o;
    if(!o||!o.isValid||o.parent!==best){
      if(o&&o.isValid)o.destroy();
      o=new cc.Node("r23meme"); var sp=o.addComponent(cc.Sprite); sp.sizeMode=cc.Sprite.SizeMode.CUSTOM; o.parent=best; root.__r23o=o;
    }
    var sp2=o.getComponent(cc.Sprite); sp2.spriteFrame=sf;
    var side=Math.max(64,Math.min(180,Math.sqrt(area)*1.8));
    o.width=side; o.height=side; o.setPosition(0,0); o.opacity=255;
    root.__r23w=id;
  }
  function tickW(g){
    var cv=cc.find("Canvas"); if(!cv)return;
    cv.children.forEach(function(root){
      if(!root.active)return; var w=weaponOf(root); if(!w)return;
      var own=w.human, key=own===g.player?"p1":(own===g.enemy?"p2":null); if(!key)return;
      var lr=wroot[key];
      if(root!==lr&&!(lr&&lr.isValid&&lr.active&&lr.parent)){ // 这个人换了一把新武器（开局或局中换武器）：在同一个池子里抽
        wroot[key]=root;
        var nm=Object.keys(WSF).length, other=wcur[key==="p1"?"p2":"p1"];
        var fz=fpend[key]&&forced[key]&&WSF[forced[key]]?forced[key]:null; fpend[key]=false;
        wcur[key]=fz||(Math.random()<nm/(ORIG_N+nm)?wpick(other):null);
        if(wcur[key]){ (function(n,t){ setTimeout(function(){ if(n.isValid)toast("武器："+t,n,new cc.Color(180,255,180)); },1200); })(own,wname(wcur[key])); }
      }
      var id=wcur[key];
      if(!id){ // 这回合用原版武器：如果之前套过 meme，还原
        if(root.__r23w){ var oo=root.__r23o; if(oo&&oo.isValid)oo.destroy(); root.__r23o=null; root.__r23w=null;
          root.getComponentsInChildren(cc.Sprite).forEach(function(sp){ sp.enabled=true; }); }
        return; }
      var o=root.__r23o, bad=!o||!o.isValid||root.__r23w!==id;
      if(!bad){ root.getComponentsInChildren(cc.Sprite).forEach(function(sp){ if(sp.enabled&&sp.node!==o)bad=true; }); }
      if(bad)skinWeapon(root,id);
    });
  }
  function push(n,vx,vy){ if(!n||!n.isValid)return; n.getComponentsInChildren(cc.RigidBody).forEach(function(rb){ var v=rb.linearVelocity; rb.linearVelocity=cc.v2(v.x+vx,v.y+vy); }); }
  function side(a,b){ try{ var pa=a.getChildByName("body").convertToWorldSpaceAR(cc.v2()), pb=b.getChildByName("body").convertToWorldSpaceAR(cc.v2()); return pb.x>=pa.x?1:-1; }catch(e){ return 1; } }
  var C=function(r,g,b){ return new cc.Color(r,g,b); };
  // 返回新伤害
  function onHit(id,dmg,att,vic,atkHc,vicHc){
    var now=Date.now(), d=side(att,vic);
    if(now<(att.__r23cd||0)||Math.random()>0.35)return dmg;
    att.__r23cd=now+1300;
    switch(id){
      case "toast": toast("🌈 吐司起飞~",vic,C(255,150,220)); push(vic,1200*d,700); break;
      case "hammer": toast("😏 贱笑一锤",vic,C(240,240,240)); if(atkHc&&!atkHc.isDead){ atkHc.hp=Math.min(atkHc.maxhp,atkHc.hp+Math.max(3,dmg*0.4)); } break;
      case "nokia": toast("📱 诺基亚：坚不可摧",vic,C(120,180,255)); dmg*=1.4; vic.__r22frz=now+500; break;
      case "rev": toast("🔄 反转！",vic,C(255,90,90)); try{ window.__fixR1&&window.__fixR1.swapPos&&window.__fixR1.swapPos(att,vic); }catch(e){} break;
      case "bonk": toast("🏏 BONK！",vic,C(255,230,60)); vic.__r22frz=now+1000; break;
      case "stonks": toast("📈 Stonks",att,C(90,230,120)); dmg*=1.3; break;
      case "chicken": toast("🐔 咯咯哒！",vic,C(255,80,80)); push(vic,200*d,2100); break;
    }
    return dmg;
  }
  function hookDmg(){
    var f=window.__r22dmg; if(!f||f.__r23)return;
    var nf=function(dmg,atkP,defP,vicHc,atkHc){
      var r=f.apply(this,arguments);
      try{
        if(r>0&&atkHc&&vicHc&&atkHc.node&&vicHc.node){
          var g=games(), att=atkHc.node, vic=vicHc.node;
          var id=g&&(att===g.player?wcur.p1:(att===g.enemy?wcur.p2:null));
          if(id){ r=Math.round(onHit(id,r,att,vic,atkHc,vicHc)); }
        }
      }catch(e){ LOG("onHit",e&&e.message); }
      return r;
    };
    nf.__r23=true; window.__r22dmg=nf;
  }
  // 皮肤菜单：Skin_N → 第 N 个 meme
  function patchAtlas(){
    try{
      var cm=window.__require&&window.__require("ConfigManager"); var gc=cm&&cm.gameConfig; var at=gc&&gc.AllSkins;
      if(!at||at.__r23)return !!(at&&at.__r23);
      var orig=at.getSpriteFrame.bind(at);
      at.getSpriteFrame=function(k){
        var m=/^Skin_(\d+)$/.exec(k||""); if(m){ var it=LIST[(+m[1])%LIST.length]; if(SF[it[0]])return SF[it[0]]; }
        return orig(k);
      };
      at.__r23=true; LOG("皮肤图集已换成 meme"); return true;
    }catch(e){ return false; }
  }
  var boot=setInterval(function(){
    if(typeof cc==="undefined"||!cc.assetManager)return;
    clearInterval(boot); if(HEADS)load(); loadW();
    setInterval(function(){ try{ tick(); }catch(e){ LOG("tick",e&&e.message); } },200);
    if(HEADS)var pa=setInterval(function(){ if(patchAtlas())clearInterval(pa); },500);
    setInterval(hookDmg,500);
  },200);
})();
