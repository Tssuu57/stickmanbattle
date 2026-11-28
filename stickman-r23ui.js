// r23g 选择界面整理：
// 1. 每个人一列：Passive / Weapon / Skin / Color，按钮不再压住「Player 1/2」，P2 的 Passive 和 P2 的 Weapon 对齐
// 2. 中间放「场地」「图鉴」两个原版样式按钮，左上角的 DOM 按钮和顶部 GUIDE 在选择界面里藏起来
// 3. 被动面板直接用原版武器面板（WeaponsView / WeaponsView2）做底：同样的背景、透明度、X 的位置、格子
// 4. 图鉴在游戏里打开（全屏浮层），不跳走
(function(){
  var PI=null; // 被动的中文名和说明
  function loadPI(){ fetch("/assets/passive_item_data.originalnamesr1.json?v=r23g").then(function(r){return r.json();}).then(function(d){ PI={}; (d.passives||[]).forEach(function(p){ PI[p.id]=p; }); }).catch(function(){ setTimeout(loadPI,3000); }); }
  loadPI();
  var cellSF=null; // 原版格子底图 cell_weapon

  // ---------- 原版样式的按钮 ----------
  function relabel(n,t){ n.getComponentsInChildren(cc.Label).forEach(function(l){ l.string=t; }); }
  function mkBtn(tpl,parent,name,text,x,y,fn){
    var b=cc.instantiate(tpl); b.name=name; b.parent=parent; b.setPosition(x,y);
    relabel(b,text);
    var ic=b.getChildByName("icon"); if(ic)ic.active=false;
    var bc=b.getComponent(cc.Button); if(bc)bc.clickEvents=[];
    b.on(cc.Node.EventType.TOUCH_END,function(){ fn(); });
    return b;
  }

  // ---------- 选择界面 ----------
  var ROWS={PassiveBtn:275,weaponsshopping:185,skinsshopping:95,ColorAllShopping:5};
  function fixCol(inner,n){
    if(!inner)return;
    var w=inner.getChildByName("weaponsshopping"); if(!w)return;
    for(var k in ROWS){ var c=inner.getChildByName(k==="PassiveBtn"?"PassiveBtn"+n:k); if(!c)continue; c.x=w.x; c.y=ROWS[k]; c.scale=1; }
    var pb=inner.getChildByName("PassiveBtn"+n);
    if(pb){ var o=(window.__passivesOrig||{})["p"+n]||"random", t=o==="random"||!PI||!PI[o]?"Passive":PI[o].name; if(pb.__lbl!==t){ pb.__lbl=t; relabel(pb,t); } }
  }
  function tickChoose(){
    var cvN=cc.find("Canvas/ChooseView"), on=!!(cvN&&cvN.active);
    window.__r23hideDom=true; // 预选场地按钮挪进选择界面
    var g=document.getElementById("__guideBtnDom"); if(g)g.style.display=on?"none":"";
    if(!on)return;
    var C=cvN.getComponent("ChooseView"); if(!C||!C.weapons1P)return;
    var cen=cvN.getChildByName("Center");
    fixCol(cen&&cen.getChildByName("player1")&&cen.getChildByName("player1").getChildByName("player1"),1);
    fixCol(cen&&cen.getChildByName("player2")&&cen.getChildByName("player2").getChildByName("player2"),2);
    var ui2=C.Players2UI;
    if(ui2&&!ui2.getChildByName("r23Field")){
      mkBtn(C.weapons1P.node,ui2,"r23Field","场地",0,-200,function(){ var F=window.__fields; if(F&&F.openPicker)F.openPicker(); });
      mkBtn(C.weapons1P.node,ui2,"r23Codex","图鉴",0,330,openTujian);
    }
    var fb=ui2&&ui2.getChildByName("r23Field");
    if(fb){ var F=window.__fields, q=F&&F.queue?F.queue().filter(function(x){return x!=="random";}):[], t=q.length?"场地 ("+q.length+")":"场地"; if(fb.__lbl!==t){ fb.__lbl=t; relabel(fb,t); } }
  }

  // ---------- 金色选中框 ----------
  function mark(tile,on){
    var m=tile.getChildByName("r23on");
    if(on&&!m){ m=new cc.Node("r23on"); m.parent=tile; var g=m.addComponent(cc.Graphics); g.lineWidth=8; g.strokeColor=new cc.Color(255,207,74); g.roundRect(-88,-88,176,176,16); g.stroke(); }
    if(m)m.active=!!on;
  }
  function label(parent,txt,y,w,h,size,col,bold){
    var n=new cc.Node("t"); n.parent=parent; n.setPosition(0,y); n.color=col||cc.Color.WHITE;
    var l=n.addComponent(cc.Label); l.overflow=cc.Label.Overflow.SHRINK; l.enableWrapText=true; n.setContentSize(w,h);
    l.string=txt; l.fontSize=size; l.lineHeight=Math.round(size*1.15); l.horizontalAlign=cc.Label.HorizontalAlign.CENTER; l.verticalAlign=cc.Label.VerticalAlign.CENTER;
    if(bold)l.enableBold=true;
    var o=n.addComponent(cc.LabelOutline); o.color=new cc.Color(18,52,98); o.width=bold?3:2;
    return n;
  }
  function tile(name,fn){
    var t=new cc.Node(name); t.setContentSize(180,180);
    var sp=t.addComponent(cc.Sprite); sp.sizeMode=cc.Sprite.SizeMode.CUSTOM; if(cellSF)sp.spriteFrame=cellSF;
    t.addComponent(cc.Button).transition=cc.Button.Transition.SCALE;
    t.on(cc.Node.EventType.TOUCH_END,fn); t.__r23tap=fn;
    return t;
  }
  function contentOf(panel){ var l=panel.getComponentsInChildren(cc.Layout)[0]; return l&&l.node; }
  function grabCell(content){ if(cellSF||!content)return; content.children.some(function(c){ var s=c.getComponent(cc.Sprite); if(s&&s.spriteFrame&&s.spriteFrame.name==="cell_weapon"){ cellSF=s.spriteFrame; return true; } }); }

  // ---------- 被动面板：原版武器面板做底 ----------
  var pasOpen=null;
  function openPassive(n){
    if(pasOpen&&pasOpen.isValid)return;
    cc.assetManager.getBundle("prefabs").load(n===1?"views/WeaponsView":"views/WeaponsView2",cc.Prefab,function(err,pf){
      if(err||!pf)return;
      var p=cc.instantiate(pf); p.name="r23Passive"+n; p.__r23pas=true; pasOpen=p;
      var ct0=contentOf(p); if(ct0)ct0.opacity=0;
      p.parent=cc.find("Canvas"); p.zIndex=5;
      var cl=p.getChildByName("bg")&&p.getChildByName("bg").getChildByName("close");
      if(cl){ var cb=cl.getComponent(cc.Button); if(cb)cb.clickEvents=[]; cl.on(cc.Node.EventType.TOUCH_END,function(){ p.destroy(); }); }
      setTimeout(function(){
        if(!p.isValid)return;
        p.getComponents(cc.Component).forEach(function(c){ var nm=c.__classname__||""; if(nm.indexOf("cc.")!==0)c.enabled=false; });
        var ct=contentOf(p); if(!ct)return;
        grabCell(ct); ct.destroyAllChildren(); ct.removeAllChildren();
        fillPassive(ct,n,p); ct.opacity=255;
        var sv=p.getComponentInChildren(cc.ScrollView); if(sv)sv.scrollToTop(0);
      },60);
    });
  }
  try{ Object.defineProperty(window,"__openPassive",{configurable:true,get:function(){ return openPassive; },set:function(){}}); }catch(e){ window.__openPassive=openPassive; } // 旧版面板后加载，别让它盖掉
  function fillPassive(ct,n,p){
    var key="p"+n, cur=(window.__passivesOrig||{})[key]||"random";
    var list=[{id:"random",name:"随机",desc:"每局随机一个"}];
    if(PI)for(var k in PI)if(k!=="random")list.push(PI[k]);
    list.forEach(function(it){
      var t=tile("pas_"+it.id,function(){
        window.__passives=window.__passives||{}; window.__passivesOrig=window.__passivesOrig||{};
        window.__passives[key]=it.id; window.__passivesOrig[key]=it.id;
        p.destroy();
      });
      t.parent=ct;
      if(it.id==="random"){ label(t,"?",10,160,110,90,cc.Color.WHITE,true); label(t,"随机",-62,160,40,28,new cc.Color(255,232,150),true); }
      else{ label(t,it.name,48,164,50,32,new cc.Color(255,232,150),true); label(t,it.desc||"",-28,164,100,21,cc.Color.WHITE,false); }
      mark(t,it.id===cur);
    });
    var lay=ct.getComponent(cc.Layout); if(lay)lay.updateLayout();
  }

  // ---------- 图鉴浮层 ----------
  var tj=null;
  function closeTujian(){ if(tj&&tj.parentNode)tj.parentNode.removeChild(tj); tj=null; }
  function openTujian(){
    if(tj)return;
    tj=document.createElement("div");
    tj.style.cssText="position:fixed;inset:0;z-index:100060;background:rgba(0,0,0,.39);display:flex;align-items:center;justify-content:center";
    var box=document.createElement("div");
    box.style.cssText="position:relative;width:min(1100px,96vw);height:94vh;background:#2564aa;border:4px solid #1a4f8c;border-radius:18px;overflow:hidden;box-shadow:0 10px 40px rgba(0,0,0,.4)";
    var fr=document.createElement("iframe"); fr.src="tujian"+(window.__HTM_EXT||".html")+"?embed=1"; fr.title="图鉴";
    fr.style.cssText="position:absolute;inset:0;width:100%;height:100%;border:0;background:#f6f7fb";
    var x=document.createElement("div"); x.textContent="✕";
    x.style.cssText="position:absolute;left:10px;top:8px;z-index:2;width:44px;height:44px;border-radius:9px;background:linear-gradient(#b4b9c2,#8a909b);border:3px solid #4a4f58;color:#fff;font:900 26px/38px system-ui,sans-serif;text-align:center;cursor:pointer;box-shadow:0 3px 0 #4a4f58;user-select:none";
    x.onclick=closeTujian;
    box.appendChild(fr); box.appendChild(x); tj.appendChild(box);
    tj.addEventListener("click",function(e){ if(e.target===tj)closeTujian(); });
    ["touchstart","touchend","mousedown","mouseup","wheel"].forEach(function(ev){ tj.addEventListener(ev,function(e){ e.stopPropagation(); }); });
    document.body.appendChild(tj);
  }
  window.__openTujian=openTujian; window.__closeTujian=closeTujian;
  document.addEventListener("keydown",function(e){ if(e.key==="Escape")closeTujian(); });

  setInterval(function(){
    try{ if(typeof cc==="undefined"||!cc.director||!cc.director.getScene())return; tickChoose(); }catch(e){ if(!window.__r23uiErr){ window.__r23uiErr=1; console.log("[r23ui]",e&&e.message); } }
  },250);
})();
