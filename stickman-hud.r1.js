// ================= 双人对战 HUD（简洁版） =================
// 顶部左右：P1/P2 血条 + 被动 + 身上状态；顶部中间：本局场地 + 场上道具
// 双人模式时藏起旧的血量框、左右大面板、旧场地标签；其他模式不动
(function(){
  if(window.__hud2)return;
  var HUD=window.__hud2={on:true};
  function req(n){ try{ return window.__require(n); }catch(_){ return null; } }
  function cfg(){ var m=req("ConfigManager"); return m&&m.gameConfig; }
  function games(){ try{ var c=cc.find("Canvas"); return c&&c.getComponent("Games"); }catch(_){ return null; } }
  function valid(n){ return !!(n&&n.isValid); }
  function hcOf(n){ try{ return valid(n)?n.getComponent("HumanController"):null; }catch(_){ return null; } }

  var FONT="JCRound,'PingFang SC','Microsoft YaHei',system-ui,sans-serif";
  var COL={p1:"#4fd2ff",p2:"#ff6b6b"};
  var root=null, el={};
  function css(e,s){ e.style.cssText=s; return e; }
  function div(p,s,cls){ var d=document.createElement("div"); if(s)d.style.cssText=s; if(p)p.appendChild(d); return d; }

  function build(){
    root=div(document.body,"position:fixed;left:0;right:0;top:0;z-index:100025;pointer-events:none;user-select:none;font-family:"+FONT+";color:#fff");
    var st=document.createElement("style");
    st.textContent=
      "@keyframes hud2shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-3px)}75%{transform:translateX(3px)}}"+
      "@keyframes hud2low{0%,100%{filter:brightness(1)}50%{filter:brightness(1.6)}}"+
      ".hud2card{position:absolute;top:8px;display:flex;flex-direction:column;gap:4px;max-width:min(36vw,330px)}"+
      ".hud2row{display:flex;align-items:center;gap:6px}"+
      ".hud2tag{font-weight:800;font-size:15px;text-shadow:0 1px 2px rgba(0,0,0,.7);min-width:22px}"+
      ".hud2bar{position:relative;flex:1;min-width:110px;width:min(22vw,210px);height:14px;border-radius:7px;background:rgba(10,14,24,.72);border:2px solid rgba(255,255,255,.85);overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.4)}"+
      ".hud2trail,.hud2fill{position:absolute;top:0;bottom:0;left:0;border-radius:5px}"+
      ".hud2trail{background:#fff;transition:width .5s ease .25s}"+
      ".hud2fill{transition:width .12s linear}"+
      ".hud2num{font-weight:800;font-size:15px;min-width:28px;text-align:center;text-shadow:0 1px 2px rgba(0,0,0,.8)}"+
      ".hud2chips{display:flex;flex-wrap:wrap;gap:4px}"+
      ".hud2chip{font-size:12px;line-height:1;padding:4px 7px;border-radius:999px;background:rgba(10,14,24,.68);border:1px solid rgba(255,255,255,.25);white-space:nowrap}"+
      ".hud2desc{font-size:12px;line-height:1.35;color:#eef2fa;background:rgba(10,14,24,.78);padding:4px 9px;border-radius:7px;transition:opacity .4s;max-width:280px}"+".hud2chip[data-d]{pointer-events:auto;cursor:pointer}.hud2field{pointer-events:auto;cursor:pointer}"+".hud2fdesc{font-size:12px;line-height:1.35;color:#ffe9a8;background:rgba(10,14,24,.78);padding:4px 10px;border-radius:7px;transition:opacity .4s;max-width:300px;text-align:center}"+
      ".hud2center{position:absolute;top:8px;left:50%;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:4px}"+
      "@keyframes hud2pop{from{transform:scale(.6);opacity:0}to{transform:scale(1);opacity:1}}"+
      // 拾取提示：大卡片 → 小胶囊（只留图标+名字），放在血条下面
      "div[aria-live=polite][style*='top: 14%']{top:104px!important;width:auto!important;max-width:42vw;gap:4px!important}"+
      "div[aria-live=polite][style*='top: 14%'][style*='right: 12px']{align-items:flex-end;right:96px!important}"+
      "div[aria-live=polite][style*='top: 14%']>div{padding:3px 12px 3px 4px!important;gap:6px!important;border-width:2px!important;border-radius:16px!important;background:rgba(10,14,24,.8)!important;animation:hud2pop .2s ease-out}"+
      "div[aria-live=polite][style*='top: 14%']>div>img{width:24px!important;height:24px!important}"+
      "div[aria-live=polite][style*='top: 14%']>div>div>div:first-child{display:none!important}"+"div[aria-live=polite][style*='top: 14%']>div>div>div:nth-child(3){font-size:11px!important;line-height:1.25!important;opacity:.85;white-space:normal!important;max-width:34vw}"+
      "div[aria-live=polite][style*='top: 14%']>div>div>div:nth-child(2){font-size:14px!important;line-height:1.2!important}"+
      ".hud2field{font-weight:800;font-size:15px;padding:4px 12px;border-radius:999px;background:rgba(10,14,24,.78);border:2px solid #ffd45a;color:#ffe9a8;white-space:nowrap}";
    root.appendChild(st);
    ["p1","p2"].forEach(function(k){
      var right=k==="p2";
      var c=div(root,""); c.className="hud2card"; c.style[right?"right":"left"]="10px"; if(right)c.style.alignItems="flex-end";
      var r1=div(c,""); r1.className="hud2row"; if(right)r1.style.flexDirection="row-reverse";
      var tg=div(r1,"color:"+COL[k]); tg.className="hud2tag"; tg.textContent=k.toUpperCase();
      var bar=div(r1,""); bar.className="hud2bar";
      var trail=div(bar,""); trail.className="hud2trail";
      var fill=div(bar,"background:linear-gradient(180deg,"+COL[k]+","+(right?"#d94848":"#2a9fd6")+")"); fill.className="hud2fill";
      if(right){ trail.style.left="auto"; trail.style.right="0"; fill.style.left="auto"; fill.style.right="0"; }
      var num=div(r1,""); num.className="hud2num";
      var chips=div(c,""); chips.className="hud2chips"; if(right)chips.style.justifyContent="flex-end";
      var desc=div(c,""); desc.className="hud2desc"; if(right)desc.style.textAlign="right";
      el[k]={card:c,bar:bar,fill:fill,trail:trail,num:num,chips:chips,desc:desc,hp:null,chipSig:"",descUntil:0,passive:null};
    });
    var cen=div(root,""); cen.className="hud2center";
    el.field=div(cen,""); el.field.className="hud2field";
    el.items=div(cen,""); el.items.className="hud2chips"; el.items.style.justifyContent="center"; el.items.style.maxWidth="34vw";
    el.fdesc=div(cen,""); el.fdesc.className="hud2fdesc"; el.fdescUntil=0;
    el.itemSig=""; el.fieldSig="";
    // 点胶囊 → 显示它的介绍
    root.addEventListener("pointerdown",function(ev){
      var t=ev.target; while(t&&t!==root&&!(t.dataset&&(t.dataset.d!==undefined||t===el.field)))t=t.parentNode;
      if(!t||t===root)return; ev.stopPropagation();
      if(t===el.field){ el.fdescUntil=Date.now()+5000; return; }
      var k=t.dataset.k, txt=t.dataset.d; if(!txt)return;
      if(k&&el[k]){ el[k].desc.textContent=txt; el[k].descUntil=Date.now()+5000; }
      else { el.fdesc.textContent=txt; el.fdescUntil=Date.now()+5000; el.fdescCustom=true; }
    },true);
  }
  function destroy(){ if(root&&root.parentNode)root.parentNode.removeChild(root); root=null; el={}; }

  // ---------- 数据 ----------
  function itemData(){ var o={}; (window.__ITEM_DATA||[]).forEach(function(it){ o[it.state]=it; o["n:"+it.name]=it; }); return o; }
  function icon(it){
    if(!it)return "";
    var u=(window.__guideThumbs||{})[it.state]||(window.__itemIcons||{})[it.state];
    if(u){
      try{ if(window.__assetPathFix)u=window.__assetPathFix.fix(u); }catch(_){}
      u=String(u).replace(/'/g,"%27");
      return "<img src='"+u+"' alt='' onerror=\"this.style.display='none'\" style='width:16px;height:16px;object-fit:contain;vertical-align:-3px;margin-right:3px'>";
    }
    return it.emoji?it.emoji+" ":"";
  }
  function passiveOf(k){
    var id=window.__passives&&window.__passives[k]; if(!id)return null;
    var L=window.__PASSIVES||[]; for(var i=0;i<L.length;i++)if(L[i].id===id)return L[i];
    return {id:id,name:id,desc:""};
  }
  function fieldStates(){
    var out=[];
    try{
      var it=cc.find("Canvas/Items"); if(!it)return out;
      it.children.forEach(function(n){
        if(!n||!n.isValid||!n.active||(n.name!=="BuffItem"&&n.name!=="BuffItems"))return;
        var cs=n.getComponents(cc.Component);
        for(var j=0;j<cs.length;j++){ if(cs[j].iconAll!==undefined&&cs[j].state!=null){ if(out.indexOf(cs[j].state)<0)out.push(cs[j].state); break; } }
      });
    }catch(_){}
    try{ var FI=window.__fieldItems||{}; for(var k in FI){ var v=FI[k]; if(v!=null&&out.indexOf(v)<0)out.push(v); } }catch(_){}
    return out;
  }
  // 从旧面板里读「状态」行（旧面板仍在后台算，只是隐藏）
  function buffsFrom(panel){
    var out=[];
    try{
      var ct=panel&&panel.isValid&&panel.__content; if(!ct)return out;
      var sec="";
      ct.children.forEach(function(row){
        var l=row.getComponent(cc.Label), t=row.getChildByName("txt"), s;
        if(l){ s=l.string.replace(/\n/g,""); if(/状态/.test(s))sec="buff"; else if(/场上道具/.test(s))sec="field"; else if(/━/.test(s))sec=""; return; }
        if(sec==="buff"&&t){ s=t.getComponent(cc.Label).string.replace(/\n/g,""); var m=s.match(/\s(\d+)s$/); out.push({name:s.split(/[:：]/)[0].replace(/\s\d+s$/,"").trim(),sec:m?+m[1]:null}); }
      });
    }catch(_){}
    return out;
  }

  // ---------- 刷新 ----------
  function esc(t){ return String(t==null?"":t).replace(/&/g,"&amp;").replace(/'/g,"&#39;").replace(/"/g,"&quot;").replace(/</g,"&lt;"); }
  function setHp(k,h){
    var e=el[k]; if(!e)return;
    // r21c：盲打场地 → 血条和数字都不显示
    var FC=window.__fields&&window.__fields.cur, blind=!!(FC&&FC.def&&FC.def.id==="blind");
    var vis=blind?"hidden":"";
    if(e.bar&&e.bar.style.visibility!==vis)e.bar.style.visibility=vis;
    if(e.num.style.visibility!==vis)e.num.style.visibility=vis;
    if(blind){ e.card.style.animation="none"; e.hp=null; return; }
    var max=Math.max(1,+h.maxhp||100), raw=+h.hp, hp=(!isFinite(raw)||raw<=0||h.isDead)?0:Math.min(raw,max);
    var p=hp/max*100;
    if(e.hp!==null&&hp<e.hp-0.05){ e.card.style.animation="none"; void e.card.offsetWidth; e.card.style.animation="hud2shake .25s"; }
    if(e.hp===null||hp<e.hp){ e.fill.style.width=p+"%"; e.trail.style.width=p+"%"; }
    else { e.fill.style.width=p+"%"; e.trail.style.width=p+"%"; }
    e.fill.style.animation=p<=30&&hp>0?"hud2low .8s infinite":"none";
    var txt=String(Math.ceil(hp));
    if(e.num.textContent!==txt)e.num.textContent=txt;
    e.hp=hp;
  }
  function chipsFor(k,ID,panel){
    var e=el[k], arr=[], P=passiveOf(k), now=Date.now(), seen={};
    if(P)arr.push("<span class='hud2chip' data-k='"+k+"' data-d='"+esc("被动「"+P.name+"」："+(P.desc||""))+"' style='border-color:"+COL[k]+";color:#ffe39a'>🦸 "+P.name+"</span>");
    buffsFrom(panel).forEach(function(b){
      var it=ID["n:"+b.name], d=it?(it.detail||it.short||""):"";
      seen[b.name]=1;
      // 新吃到的道具：说明显示 3.5 秒
      if(e.buffs&&!e.buffs[b.name]&&d&&now>=e.descUntil-2000){ e.desc.textContent=(it.emoji||"")+" "+b.name+"："+d; e.descUntil=now+3500; }
      arr.push("<span class='hud2chip' data-k='"+k+"' data-d='"+esc(b.name+"："+d)+"'>"+icon(it)+b.name+(b.sec!=null?" <b style='color:#ffd45a'>"+b.sec+"</b>":"")+"</span>");
    });
    e.buffs=seen;
    var sig=arr.join("");
    if(sig!==e.chipSig){ e.chips.innerHTML=sig; e.chipSig=sig; }
    // 被动说明：每局开始显示 6 秒
    var pid=P&&P.id;
    if(pid!==e.passive){ e.passive=pid; e.descUntil=now+6000; e.desc.textContent=P&&P.desc?"被动「"+P.name+"」："+P.desc:""; }
    var show=now<e.descUntil&&e.desc.textContent;
    e.desc.style.opacity=show?"1":"0"; e.desc.style.display=e.desc.textContent?"block":"none";
  }
  var lastRound=null;
  function tick(){
    var C=cfg(), gm=games();
    var twoP=C&&String(C.gameChooseViewNumber)==="2"&&!C.suverModel&&C.gameStart!==false;
    var ok=HUD.on&&twoP&&gm&&valid(gm.player)&&valid(gm.enemy);
    var oldTag=document.getElementById("__fieldTag");
    if(!ok){ if(root)destroy(); lastRound=null; if(oldTag)oldTag.style.display=""; return; }
    if(!root)build();
    // 藏旧的
    var L=window.__liveHpHudR1; if(L){ if(L.p1)L.p1.style.display="none"; if(L.p2)L.p2.style.display="none"; }
    [window.__itemPanel,window.__itemPanelR].forEach(function(p){ if(p&&p.isValid&&p.opacity!==0)p.opacity=0; });
    if(oldTag)oldTag.style.display="none";
    var rk=(gm.player.uuid||"")+"|"+(gm.enemy.uuid||"");
    if(rk!==lastRound){ lastRound=rk; el.p1.hp=null; el.p2.hp=null; el.p1.passive=undefined; el.p2.passive=undefined; }
    var ID=itemData();
    var h1=hcOf(gm.player), h2=hcOf(gm.enemy);
    if(h1)setHp("p1",h1); if(h2)setHp("p2",h2);
    chipsFor("p1",ID,window.__itemPanel); chipsFor("p2",ID,window.__itemPanelR);
    // 场地
    var F=window.__fields, d=F&&F.cur&&F.cur.def, fs=d?(d.emoji||"")+" "+d.name:"";
    if(fs!==el.fieldSig){ el.field.textContent=fs?fs+"  ⓘ":""; el.field.style.display=fs?"block":"none"; el.fieldSig=fs; el.fdescUntil=0; el.fdescCustom=false; }
    if(!el.fdescCustom){ var ft=d&&d.desc?d.desc:""; if(el.fdesc.textContent!==ft)el.fdesc.textContent=ft; }
    var fshow=Date.now()<el.fdescUntil&&el.fdesc.textContent;
    el.fdesc.style.opacity=fshow?"1":"0"; el.fdesc.style.display=el.fdesc.textContent?"block":"none";
    if(!fshow)el.fdescCustom=false;
    // 场上道具：只放图标+名字
    var items=fieldStates().slice(0,4).map(function(s){ var it=ID[s]; return "<span class='hud2chip' data-d='"+esc(it?it.name+"："+(it.detail||it.short||""):"")+"'>"+(it?icon(it)+it.name+(it.short?" <span style='opacity:.75;font-size:11px'>"+it.short+"</span>":""):"道具"+s)+"</span>"; }).join("");
    if(items!==el.itemSig){ el.items.innerHTML=items; el.itemSig=items; }
  }
  setInterval(function(){ try{ if(window.cc&&cc.director&&document.body)tick(); }catch(e){ try{ (window.__logs||(window.__logs=[])).push("[hud2] "+(e&&e.message)); }catch(_){} } },100);
})();
