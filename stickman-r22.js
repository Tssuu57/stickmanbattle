// ================= r22（2026-11-25）大改：被动/道具/场地全部改名 + 新被动 + 新道具 + 新场地 =================
// 伤害钩子 window.__r22dmg 由 index.fixr12.js 的 setDamage 在其他被动倍率之后调用。
(function(){
  if(window.__r22)return;
  var R=window.__r22={v:"r22"};
  function LOG(){ try{ (window.__logs||(window.__logs=[])).push("[r22] "+[].slice.call(arguments).join(" ")); if(window.__logs.length>300)window.__logs.shift(); }catch(_){} }
  function games(){ if(typeof cc==="undefined"||!cc.find)return null; var c=cc.find("Canvas"); return c&&c.getComponent("Games"); }
  function valid(n){ return !!(n&&n.isValid); }
  function hcOf(n){ return valid(n)?n.getComponent("HumanController"):null; }
  function dead(n){ var h=hcOf(n); return !h||h.isDead||!(h.hp>0); }
  function pasOf(n){ var P=window.__passives||{}, g=games(); if(!g)return null; return n===g.player?P.p1:(n===g.enemy?P.p2:null); }
  function oppOf(n){ var g=games(); if(!g)return null; return n===g.player?g.enemy:(n===g.enemy?g.player:null); }
  function bodyRb(n){ var b=valid(n)&&n.getChildByName("body"); return b&&b.getComponent(cc.RigidBody); }
  function pos(n){ var rb=bodyRb(n); if(!rb)return null; var p=cc.v2(); rb.getWorldPosition(p); return p; }
  function dist(a,b){ var p=pos(a), q=pos(b); if(!p||!q)return 99999; return Math.sqrt((p.x-q.x)*(p.x-q.x)+(p.y-q.y)*(p.y-q.y)); }
  function parts(n){ return valid(n)?n.getComponentsInChildren(cc.RigidBody):[]; }
  function toast(t,n,c,s){ try{ window.__toastNearPlayer&&window.__toastNearPlayer(t,n,c||new cc.Color(255,230,120),s||24); }catch(_){} }
  function bar(h){ try{ h.HealthBar.getComponent(cc.ProgressBar).progress=Math.max(0,h.hp)/h.maxhp; }catch(_){} }
  function heal(n,a){ var h=hcOf(n); if(!h||h.isDead)return; h.hp=Math.min(h.maxhp,h.hp+a); bar(h); }
  function hurt(n,pct,vx,vy,src){ var fx=window.__fixR1; if(!fx||!fx.hurt)return false; window.__blSrc=src||"r22"; try{ return fx.hurt(n,pct,vx,vy); }catch(e){ LOG("hurt",e&&e.message); return false; }finally{ window.__blSrc=null; } }
  function moveBy(n,dx,dy){ try{ window.__fixR1&&window.__fixR1.moveHumanBy&&window.__fixR1.moveHumanBy(n,dx,dy); }catch(_){} }
  function joyOf(n){ var c=cc.find("Canvas"); var js=c?c.getComponentsInChildren("JoyStick"):[]; for(var i=0;i<js.length;i++){ var h=js[i].human2; if(h&&(h===n||h.node===n))return js[i]; } return null; }
  function canvasPt(w){ var c=cc.find("Canvas"); return w&&c?c.convertToNodeSpaceAR(w):null; }
  function ring(n,color,worldR){
    var RT=window.__selectedItemRuntime, w=pos(n); if(!RT||!w)return;
    var c=canvasPt(w), c1=canvasPt(cc.v2(w.x+worldR,w.y)); if(!c||!c1)return;
    try{ RT.drawRing(c,color,Math.abs(c1.x-c.x),10,450,0); RT.impact&&RT.impact(c,color); }catch(_){}
  }
  function airborne(n){ var rb=bodyRb(n); return !!(rb&&Math.abs(rb.linearVelocity.y)>90); }

  // ======================= 名字表 =======================
  var PASSIVES=[
    ["doubleJump","云行者","空中可以一直跳；在空中出手更疼"],
    ["spikeImmune","圣盾使","不怕地形伤害，减速、沉默这类控制对你没用"],
    ["lifesteal","嗜血者","打中人就回血"],
    ["quickUlt","疾风使","大招转好得更快"],
    ["thorns","荆棘之甲","打你的人自己也会疼"],
    ["reviveOnce","不死鸟","每回合第一次倒下会带点血站起来"],
    ["berserker","浴血狂战","血越少，打人越疼"],
    ["shieldRegen","自愈者","一直在慢慢回血"],
    ["weaponMaster","军械师","手里的武器会定时换新"],
    ["mirrorImage","分身术士","放大招时常常带出一个替身"],
    ["evasion","闪避大师","有时能直接躲开攻击"],
    ["kamikaze","亡命同归","快死时拉对手一起炸"],
    ["counterStrike","复仇铁卫","挨打之后，下一下打回去特别疼"],
    ["firstStrike","先登勇士","开局一小段时间伤害很高，要抢先手"],
    ["rage","双倍奉还","打人越多，下一招越猛"],
    ["cursed","诅咒者","一直在掉血，换来很高的伤害"],
    ["bigBoy","巨化者","块头大、更耐打、打人更疼，但也更容易被打中"],
    ["tinyBoy","小精灵","个子小、跑得快、大招充得快，偶尔能躲开攻击"],
    ["silly","煞笔","彩蛋：偶尔会醉到极点，这一回合乱抽道具、时不时打出暴击"],
    ["mage","咒术师","大招几乎能一直放，但每一下都不太疼"],
    ["gambler","赌命者","每一下打多疼全看运气，偶尔直接斩杀"],
    ["alchemist","诡术师","吃道具时常常多送一个随机效果"],
    ["foodie","食客","吃道具还能回血"],
    ["pyromancer","烈焰术士","打中让对手着火，持续掉血"],
    ["frostlord","寒冰领主","打中让对手变慢，连续打还能把他冻住"],
    ["bulwark","磐石","站着不动会长出护盾，一动就没了"],
    ["echo","回响","受到的伤害慢慢结算，这期间回的血能抵掉"],
    ["gravitywell","引力使","放大招时把对手吸过来"],
    ["compound","电光侠","活得越久，跑得越快、打得越疼"],
    ["disarmer","缴械师","打中时有机会打掉对手的武器"],
    ["parasite","共鸣者","对手吃道具时，你常常也能蹭到一份"],
    ["ironHead","铁头","特别扛大招，普通攻击也少疼一点"],
    ["scavenger","拾荒者","吃到的道具常常会再来一次"],
    ["itemFlow","引流","时不时自动得到一个道具效果"],
    ["forbiddenContract","禁咒契约","血很少，但只要你活着，对手就放不出大招"],
    ["oneShot","一击必杀","很脆，但每一下都能打掉对手一大块血，几下就能结束战斗"],
    ["assassin","恶作剧之心","血很少，但隔一会儿的第一下特别疼，打完就跑"],
    ["ironwall","头鸟坚壁","再重的一下也只掉一点点血，不怕被秒"],
    ["hunter","刽子手","对手残血时你打得特别狠"],
    ["conjurer","背刺者","挨打时有时会闪到对手背后"],
    ["stomp","翱翔者","从高处落下会砸地，把身边的对手震飞"],
    ["sniper","神射手","离对手越远打得越疼"],
    ["brawler","燔天之时","贴着对手打时很耐打"],
    ["combo","苍羽一梦","连续打中越打越疼，停手就清零"],
    ["spark","恶曜开眼","打中会给对手留雷印，叠满就爆炸"],
    ["tesla","飞雷神","隔一会儿放一圈电，把靠近的对手电开"],
    ["absorber","蓄电池","挨打会给自己的大招充能"],
    ["rewind","音火锻淬","每回合一次，快死时把血倒回到几秒前"]
  ];
  var REMOVED={unyielding:1,executioner:1,trickster:1,airDash:1};
  R.PASSIVES=PASSIVES; R.REMOVED=REMOVED;

  var ITEMS={},ITEM_TXT={};
  [[0,"金创药","回血","马上回一大口血"],
   [1,"格挡","免伤一次","下一次挨打完全不疼"],
   [2,"霸王丹","伤害暴涨","接下来一小会儿打人非常疼"],
   [3,"奥义连发","大招不冷却","很短的时间里大招可以连着放"],
   [4,"换兵","换武器","马上换一把随机武器"],
   [5,"召唤援兵","召唤小弟","叫来一个小弟帮你打"],
   [7,"羽翼","飞行","一小会儿不受重力，可以到处飞"],
   [8,"护身符","濒死复活","快死时自动救你一命，还会短暂无敌"],
   [9,"天机匣","随机效果","随机得到一个道具效果"],
   [10,"巨化","变大","变大，更耐打也更疼"],
   [11,"缩骨","变小","变小，跑得快、大招转得快"],
   [13,"时停","时停","除了你，全场都停住"],
   [21,"飞爪","拉过来","一下把对手钩到面前"],
   [30,"瞬移背刺","闪到背后","瞬间闪到对手背后"],
   [33,"换血","交换血量","和对手互换血量，残血时能翻盘"],
   [37,"顺手牵羊","抢武器","抢走对手的武器，他要空手一会儿"],
   [38,"反射结界","反伤","一小会儿内挨的打全部弹回去"],
   [51,"定时炸弹","炸弹","在脚下放一颗炸弹，过一会儿炸开"],
   [52,"断兵","缴械","砸掉对手的武器，他要空手一会儿"],
   [64,"血牙","打中回血","下一次打中回一大口血，这一下也更疼"],
   [70,"冰冻术","减速","对手一阵子变得很慢"],
   [73,"千斤坠","变重","对手变得很重，跳不起来"],
   [74,"禁言","封大招","对手一阵子放不了大招"],
   [80,"无敌金身","无敌","一小会儿完全无敌"],
   [85,"轻身","轻盈","一阵子跳得更高，挨打也没那么疼"],
   [100,"易容","伪装","变成和对手一样的样子"],
   [101,"夺命","偷血","从对手身上偷一块血"],
   [103,"孤注一掷","赌命","血量要么翻倍，要么减半"],
   [110,"乱神","反向操作","对手一阵子左右方向反了"],
   [125,"移魂","换被动","你的被动随机换成另一个"],
   [130,"陨石雨","流星雨","一串陨石从天上砸下来"],
   [131,"激光炮","激光","射出一道激光，打得很疼"],
   [150,"移形换位","位置互换","和对手瞬间换位置"],
   [160,"排山掌","拍飞","一巴掌把对手拍上天"],
   [200,"三重奥义","连放大招","马上连着放好几次大招"],
   [201,"回城","回到原地","过一会儿传回吃道具的地方，适合跑路"],
   [203,"止战结界","圈里不能出手","在圈里谁都不能发起攻击"],
   [210,"漩涡","吸住对手","在对手身边开个漩涡，把他往里吸并持续掉血"],
   [211,"冰面","对手打滑","对手脚下结冰，停不下来"],
   [212,"磁暴","吸道具","把场上道具都吸过来，还送你一个随机效果"],
   [213,"技能连发","小招不冷却","一阵子小招可以一直放"],
   [214,"弹射靴","落地震飞","一阵子跳得更高，重重落地会震开对手"],
   [215,"缩小射线","对手变小","射中对手让他变小，武器也变短"],
   [216,"地刺","埋地刺","在脚下埋几根地刺，对手踩到会被弹飞"],
   [217,"回旋刃","打两下","扔出去打一下，飞回来再打一下"]
  ].forEach(function(a){ ITEMS[a[0]]=a[1]; ITEM_TXT[a[0]]=[a[2],a[3]]; });
  // 新道具
  var NEW_ITEMS=[
    {state:218,emoji:"🧨",name:"连环雷",short:"连炸",detail:"在对手身上连着炸好几下"},
    {state:219,emoji:"💨",name:"冲撞",short:"撞飞",detail:"朝对手猛冲，撞到就把他撞飞"},
    {state:220,emoji:"🔗",name:"共生",short:"分担伤害",detail:"一阵子你挨的打有一半算到对手头上"},
    {state:221,emoji:"🥊",name:"蓄力拳",short:"重拳",detail:"接下来几下打得特别重"},
    {state:222,emoji:"🌪️",name:"旋风",short:"吹飞",detail:"一阵旋风把对手卷上天再甩出去"},
    {state:223,emoji:"🔋",name:"能量涌动",short:"大招充满",detail:"大招马上充满"}
  ];
  NEW_ITEMS.forEach(function(it){ ITEMS[it.state]=it.name; ITEM_TXT[it.state]=[it.short,it.detail]; it.icon="/assets/icons/r22/item_"+it.state+".png?v=r24"; });
  R.ITEMS=ITEMS;

  var FIELDS={},FIELD_DESC={};
  [["lowgravity","月球漫步","重力很小，一打就飞老远"],
   ["ice","溜冰场","地面结冰，停不下来"],
   ["wind","台风天","狂风一直吹，还会换方向"],
   ["tiny","缩小光线","两个人都变小"],
   ["giant","大块头","两个人都变大"],
   ["glasscannon","一碰就碎","血很少但打人很疼，几下定胜负"],
   ["vampire","血月","打中人就回血"],
   ["itemrain","道具雨","道具像下雨一样掉"],
   ["nofx","原汁原味","没有道具，只靠真本事"],
   ["ultfest","大招派对","大招转得特别快"],
   ["meteors","天降陨石","陨石会砸下来，看到红圈快躲"],
   ["weaponswap","武器乱换","隔一会儿两人一起换武器"],
   ["heavyhit","千斤重拳","一打就飞，小心被打出去"],
   ["lava","火山口","岩浆从下面慢慢涨上来，碰到就烫"],
   ["shrinkzone","毒圈","毒雾从两边往中间收"],
   ["planet","迷你星球","重力朝着中间，绕着星球打"],
   ["invisible","看不见的路","平台是隐形的，靠近才看得见"],
   ["hotpotato","传炸弹","炸弹绑在身上，打中对手才能传过去"],
   ["crown","抢王冠","戴着王冠回血又加伤害，被打中就掉"],
   ["chest","寻宝","打开宝箱拿道具，宝箱会乱跑"],
   ["bounty","悬赏令","连续打中对手就会被悬赏，打中悬赏的人有奖励"],
   ["ultonly","只准放大招","普通攻击不掉血，只有大招能伤人"],
   ["balloons","扎气球","头上有气球，全被扎破就输"],
   ["rubberband","拴在一起","两人被绳子拴着，跑远会被拽回来"],
   ["nostop","停下就疼","站着不动会一直掉血"],
   ["coward","不许逃","两人离太远就会掉血"],
   ["bouncy","果冻人","落地会弹起来"],
   ["shadow","影子跟班","身后跟着影子，碰到对手会伤人"],
   ["echo","回响","挨打的地方过一会儿会再疼一次，要挪开"],
   ["dark","停电了","只有身边一圈是亮的，小心偷袭"],
   ["upsidedown","头朝下","整个画面倒过来了，别按错"],
   ["timetide","忽快忽慢","时间一会儿快一会儿慢"],
   ["gravitywheel","重力乱转","重力方向会突然改变"],
   ["pinball","弹珠台","大铁球满场乱弹，撞到会掉血"],
   ["hunter","刽子手","一个当猎人很疼，一个当猎物跑得快，隔一会儿互换"],
   ["acidrain","毒雨","头顶没遮挡就会被毒雨淋伤"],
   ["recoil","打人自退","每次出手自己会被往后推"],
   ["blind","摸黑打","看不到双方的血量"],
   ["portal","任意门","踩进传送门会瞬移还加速"],
   ["quake","地动山摇","时不时地震，站在地上的人会掉血"],
   ["repel","磁铁相斥","两人靠太近会被弹开"],
   ["tornado","龙卷风暴","龙卷风满场乱走，卷进去会被甩飞"],
   ["swap","乾坤挪移","两人隔一会儿就互换位置"],
   ["thunder","雷雨天","闪电专劈站得高的人"],
   ["firetrail","脚底着火","走过的地方会着火，踩到对手的火会掉血"],
   ["sizebet","大小随机","挨打变小，打人变大，越大越疼"],
   ["combo","苍羽一梦","连续打中越打越疼，被打断就清零"],
   ["laststand","残血爆发","血越少打人越疼"],
   ["flipside","上下翻转","有一个人是往上掉的，过一会儿互换"],
   ["collapse","地板塌了","平台踩久了会塌"],
   ["windmill","大风车","中间有根大杆一直转，扫到会被打飞"],
   ["rewind","音火锻淬","过一会儿会被拉回原来的位置，血不回来"],
   ["landmine","落地开花","落地的地方会留下炸弹，过一会儿炸"],
   ["bullettime","子弹时间","时不时全场变成慢动作"],
   ["healspring","生命之泉","正中间有回血光柱，大家都想站进去"],
   ["ragetime","伤害递增","打得越久伤害越高，拖不起"],
   ["ghosts","幽灵","两个人都几乎看不见，挨打才现形"],
   ["randomtp","空间错乱","两人时不时被随机传送"],
   ["marathon","持久战","两人的血都变多了，要慢慢磨"],
   ["sharedpain","同生共死","打对手自己也会疼，想清楚再出手"]
  ].forEach(function(a){ FIELDS[a[0]]=a[1]; FIELD_DESC[a[0]]=a[2]; });
  R.FIELDS=FIELDS;

  // ======================= 名字同步（数据会被异步覆盖，所以一直对齐） =======================
  function syncNames(){
    var P=window.__PASSIVES;
    if(P&&P.length){
      for(var i=P.length-1;i>=0;i--){ if(REMOVED[P[i].id])P.splice(i,1); }
      PASSIVES.forEach(function(x){
        var e=null; for(var j=0;j<P.length;j++){ if(P[j].id===x[0]){ e=P[j]; break; } }
        if(!e)P.push({id:x[0],name:x[1],desc:x[2]}); else if(e.name!==x[1]||e.desc!==x[2]){ e.name=x[1]; e.desc=x[2]; }
      });
      var ps=window.__passives||{};
      ["p1","p2"].forEach(function(k){ if(ps[k]&&REMOVED[ps[k]]){ ps[k]=PASSIVES[Math.floor(Math.random()*PASSIVES.length)][0]; if(window.__passivesOrig&&window.__passivesOrig[k]&&REMOVED[window.__passivesOrig[k]])window.__passivesOrig[k]=ps[k]; } });
    }
    var D=window.__ITEM_DATA;
    if(D&&D.length){
      NEW_ITEMS.forEach(function(it){ if(!D.some(function(x){return x.state===it.state;})) D.push({state:it.state,emoji:it.emoji,name:it.name,short:it.short,detail:it.detail}); });
      D.forEach(function(x){
        if(ITEMS[x.state]&&x.name!==ITEMS[x.state])x.name=ITEMS[x.state];
        var dd=ITEM_TXT[x.state]; if(dd&&x.detail!==dd[1]){ x.short=dd[0]; x.detail=dd[1]; }
      });
    }
    var F=window.__fields;
    if(F&&F.byId){ for(var id in FIELDS){ var d=F.byId[id]; if(d&&(d.name!==FIELDS[id]||d.desc!==FIELD_DESC[id])){ d.name=FIELDS[id]; d.desc=FIELD_DESC[id]; } } }
  }
  R.syncNames=syncNames;

  // ======================= 伤害钩子（由 setDamage 调用） =======================
  window.__r22dmg=function(dmg,atkP,defP,vicHc,atkHc){
    if(!(dmg>0)||!vicHc||!vicHc.node)return dmg;
    var vic=vicHc.node, att=atkHc&&atkHc.node, now=Date.now();
    var vp=defP||pasOf(vic);
    // ---- 攻击方 ----
    if(att&&valid(att)&&!dead(att)&&dmg<200){
      if(atkP==="assassin"&&now-(att.__r22as||0)>=4000){ att.__r22as=now; dmg*=2.5; toast("🗡️ 恶作剧之心 ×2.5",att,new cc.Color(200,120,255),28); }
      if(atkP==="oneShot"&&dmg>=3&&vicHc.maxhp>0)dmg=Math.max(dmg,vicHc.maxhp*0.2);
      if(atkP==="hunter"&&vicHc.hp<vicHc.maxhp*0.35){ dmg*=1.8; if(now-(att.__r22hu||0)>1500){ att.__r22hu=now; toast("🎯 刽子手",att,new cc.Color(255,90,60),26); } }
      if(atkP==="gambler"){
        if(Math.random()<0.04&&!vicHc.isDead){ dmg=Math.max(dmg,vicHc.hp+1); toast("🎲 斩！",vic,new cc.Color(255,50,50),32); }
        else { var k=[0.5,0.75,1,1.25,1.5,2,2.5][Math.floor(Math.random()*7)]; dmg*=k; if(k>=2)toast("🎲 ×"+k,att,new cc.Color(255,210,60),24); }
      }
      if(atkP==="doubleJump"&&airborne(att))dmg*=1.3;
      if(atkP==="sniper"){ var d1=dist(att,vic); dmg*=1+0.7*Math.max(0,Math.min(1,(d1-150)/650)); }
      if(atkP==="combo"){
        att.__r22cn=(now-(att.__r22ct||0)<2000)?Math.min(6,(att.__r22cn||1)+1):1; att.__r22ct=now;
        dmg*=1+0.12*(att.__r22cn-1);
        if(att.__r22cn>=3)toast("👊 连击 ×"+att.__r22cn,att,new cc.Color(255,170,60),22+att.__r22cn);
      }
      if(atkP==="spark"&&Math.random()<0.4){
        vic.__r22mk=(vic.__r22mk||0)+1;
        if(vic.__r22mk>=3){ vic.__r22mk=0; setTimeout(function(){ if(!valid(vic)||dead(vic))return; ring(vic,new cc.Color(120,200,255),220); var a=pos(att),b=pos(vic),sx=(a&&b&&b.x<a.x)?-1:1; hurt(vic,12,sx*900,700,"被动:恶曜开眼"); toast("⚡ 恶曜开眼爆炸",vic,new cc.Color(120,200,255),30); },0); }
        else toast("⚡ 恶曜开眼 "+vic.__r22mk+"/3",vic,new cc.Color(140,210,255),20);
      }
      if(atkP==="frostlord"){ att.__r22fc=(att.__r22fc||0)+1; if(att.__r22fc%4===0){ vic.__r22frz=now+1000; toast("🧊 冻住",vic,new cc.Color(150,220,255),28); } }
      if(atkHc.__r22punch>0){ atkHc.__r22punch--; dmg*=1.6; toast("🥊 蓄力拳 ("+atkHc.__r22punch+")",att,new cc.Color(255,120,80),24); }
      if(atkHc.__r22bt){ atkHc.__r22bt=false; dmg*=1.5; }
    }
    // ---- 防守方 ----
    if(vp==="tinyBoy"&&Math.random()<0.2){ toast("💨 躲开",vic,new cc.Color(200,255,200),22); return 0; }
    if(vp==="conjurer"&&att&&now>(vic.__r22cj||0)&&Math.random()<0.25){
      vic.__r22cj=now+2500;
      setTimeout(function(){ var a=pos(vic), b=pos(att); if(!a||!b)return; var side=(a.x<b.x)?1:-1; moveBy(vic,b.x+side*140-a.x,b.y+40-a.y); },0);
      toast("✨ 背刺者",vic,new cc.Color(220,170,255),26); return 0;
    }
    if(vp==="brawler"&&att&&dist(att,vic)<260)dmg*=0.65;
    if(vicHc.__featherEnd&&now<vicHc.__featherEnd)dmg*=0.75;
    if(vp==="absorber"){ var j=joyOf(vic); if(j&&!j.bigSkillState)j.bigSkillTimer+=Math.min(3,dmg*0.08); }
    if(vicHc.__r22share&&now<vicHc.__r22share&&att&&valid(att)){ var half=dmg*0.5; dmg-=half; var ah=hcOf(att); if(ah){ var pct=Math.max(1,Math.round(half/ah.maxhp*100)); setTimeout(function(){ if(valid(att))hurt(att,pct,undefined,undefined,"道具:有难同当"); },0); } }
    if(vp==="ironwall"&&dmg>18){ dmg=18; if(now-(vic.__r22iw||0)>1200){ vic.__r22iw=now; toast("🛡️ 头鸟坚壁",vic,new cc.Color(200,200,220),24); } }
    return Math.round(dmg);
  };

  // ======================= 每 0.1 秒：被动 =======================
  function tickPlayer(n){
    if(!valid(n))return;
    var h=hcOf(n), p=pasOf(n), now=Date.now(); if(!h)return;
    if(n.__r22frz&&now<n.__r22frz){ parts(n).forEach(function(rb){ var v=rb.linearVelocity; rb.linearVelocity=cc.v2(0,Math.min(v.y,0)); }); }
    if(h.isDead)return;
    if(p==="assassin"&&!n.__r22hp&&h.maxhp>=90){ n.__r22hp=true; h.maxhp=70; h.hp=Math.min(h.hp,70); bar(h); }
    if(p==="stomp"){
      var rb=bodyRb(n);
      if(rb){
        var vy=rb.linearVelocity.y;
        if((n.__r22vy||0)<-650&&vy>-120&&now>(n.__r22st||0)){
          n.__r22st=now+1200; ring(n,new cc.Color(255,160,60),300);
          var o=oppOf(n);
          if(o&&!dead(o)&&dist(n,o)<300){ var a=pos(n),b=pos(o),sx=(a&&b&&b.x<a.x)?-1:1; hurt(o,8,sx*1100,900,"被动:翱翔者"); toast("☄️ 翱翔者",n,new cc.Color(255,160,60),28); }
        }
        n.__r22vy=vy;
      }
    }
    if(p==="tesla"){
      if(!n.__r22ts)n.__r22ts=now+3000;
      if(now>=n.__r22ts){
        n.__r22ts=now+6000; ring(n,new cc.Color(120,220,255),280);
        var o2=oppOf(n);
        if(o2&&!dead(o2)&&dist(n,o2)<280){ var a2=pos(n),b2=pos(o2),sx2=(a2&&b2&&b2.x<a2.x)?-1:1; hurt(o2,6,sx2*1300,500,"被动:雷域"); toast("⚡ 电到了",o2,new cc.Color(120,220,255),24); }
      }
    }
    if(p==="rewind"){
      var hist=n.__r22h||(n.__r22h=[]); hist.push([now,h.hp]); while(hist.length&&now-hist[0][0]>6000)hist.shift();
      if(!n.__r22rw&&h.hp>0&&h.hp<h.maxhp*0.25){
        var back=null; for(var i=0;i<hist.length;i++){ if(now-hist[i][0]>=4500){ back=hist[i][1]; } }
        if(back===null&&hist.length)back=hist[0][1];
        if(back>h.hp){ n.__r22rw=true; h.hp=Math.min(h.maxhp,back); bar(h); ring(n,new cc.Color(160,255,200),200); toast("⏪ 音火锻淬",n,new cc.Color(160,255,200),32); }
      }
    }
  }
  function tick(){
    try{ syncNames(); }catch(e){ LOG("sync",e&&e.message); }
    var g=games(); if(!g)return;
    try{ tickPlayer(g.player); tickPlayer(g.enemy); }catch(e){ LOG("tick",e&&e.message); }
  }

  // ======================= 新道具 =======================
  function itemFx(state,me){
    var o=oppOf(me), now=Date.now();
    if(state===218){
      if(!o)return; var k=0;
      var iv=setInterval(function(){ if(k++>=3||!valid(o)||dead(o)){ clearInterval(iv); return; } ring(o,new cc.Color(255,120,40),180); hurt(o,6,(Math.random()<0.5?-1:1)*600,700,"道具:连环雷"); },450);
    }else if(state===219){
      if(!o)return; var a=pos(me), b=pos(o); if(!a||!b)return;
      var sx=b.x>a.x?1:-1;
      parts(me).forEach(function(rb){ rb.linearVelocity=cc.v2(sx*2600,300); });
      setTimeout(function(){ if(!valid(me)||!valid(o)||dead(o))return; if(dist(me,o)<330){ hurt(o,10,sx*1800,900,"道具:冲撞"); toast("💥 撞飞",o,new cc.Color(255,200,80),28); } },260);
    }else if(state===220){
      var h=hcOf(me); if(h)h.__r22share=now+8000; toast("🔗 共生",me,new cc.Color(255,150,200),24);
    }else if(state===221){
      var h2=hcOf(me); if(h2)h2.__r22punch=3;
    }else if(state===222){
      if(!o)return; var a3=pos(me), b3=pos(o), sx3=(a3&&b3&&b3.x<a3.x)?-1:1;
      parts(o).forEach(function(rb){ rb.linearVelocity=cc.v2(0,2200); });
      setTimeout(function(){ if(valid(o))parts(o).forEach(function(rb){ rb.linearVelocity=cc.v2(sx3*2400,-300); }); },350);
    }else if(state===223){
      var j=joyOf(me); if(j&&!j.bigSkillState){ j.bigSkillTimer=Math.max(j.bigSkillTimer,j.bigSkillNextInterval||8); }
      toast("🔋 大招充满",me,new cc.Color(120,255,160),26);
    }
  }
  var POOL_GOOD=[0,1,2,4,7,8,10,11,38,64,70,74,80,85,101,130,131];
  function installItems(){
    if(!window.__applyItemToOne||!window.__itemIcons||!window.__itemTextureCache||!window.__ITEM_DATA)return false;
    if(!installItems.icons){ installItems.icons=true; NEW_ITEMS.forEach(function(it){
      window.__itemIcons[it.state]=it.icon; if(window.__guideThumbs)window.__guideThumbs[it.state]=it.icon;
      cc.assetManager.loadRemote(it.icon,{ext:".png"},function(e,t){ if(!e&&t)window.__itemTextureCache[it.state]=new cc.SpriteFrame(t); else LOG("图标失败",it.state); });
    }); }
    if(window.__applyItemToOne.__r22)return true;
    var prev=window.__applyItemToOne;
    var f=function(state,n){
      var me=(window.__fixR1&&window.__fixR1.resolveHuman)?window.__fixR1.resolveHuman(n):n;
      if(state>=218&&state<=223){
        if(!valid(me))return;
        try{ if(window.__showItemToast)window.__showItemToast(state,me); }catch(_){}
        try{ itemFx(state,me); }catch(e){ LOG("新道具",state,e&&e.message); }
        return;
      }
      var r=prev.apply(this,arguments);
      try{
        var h=hcOf(me);
        if(state===64&&h)h.__r22bt=true;
        if(state===212&&valid(me)){ var s=POOL_GOOD[Math.floor(Math.random()*POOL_GOOD.length)]; setTimeout(function(){ if(valid(me)&&!dead(me))window.__applyItemToOne(s,me); },600); }
      }catch(_){}
      return r;
    };
    f.__r22=true; f.__fixHuman=true; f.__blItem=true;
    window.__applyItemToOne=f;
    LOG("道具已装");
    return true;
  }

  // ======================= 新场地 =======================
  function installFields(){
    var F=window.__fields; if(!F||!F.register)return false;
    if(F.byId.bullettime)return true;
    F.register({ id:"bullettime", no:61, name:"子弹时间", emoji:"⏱️", desc:"每隔一会儿，全场慢动作 2 秒",
      start:function(ctx){
        var nextT=6;
        ctx.onUpdate(function(){
          var t=ctx.elapsed();
          if(t>=nextT){ nextT=t+9; ctx.setTimeScale(0.35); ctx.players.forEach(function(n){ ctx.toast("⏱️ 慢动作",n,new cc.Color(180,220,255),26); });
            setTimeout(function(){ if(ctx.alive)ctx.setTimeScale(1); },700); }
        });
        ctx.onCleanup(function(){ ctx.setTimeScale(1); });
      }});
    F.register({ id:"healspring", no:62, name:"生命之泉", emoji:"⛲", desc:"场地正中间有一道回血光柱，站进去每秒回 4 血",
      start:function(ctx){
        var r=ctx.mapRect(), cx=r.x+r.width/2, HW=170;
        var g=ctx.graphics(cc.v2(0,0),120);
        ctx.every(250,function(){ ctx.players.forEach(function(n){ var p=ctx.bodyPos(n); if(p&&Math.abs(p.x-cx)<HW&&!ctx.isDead(n))ctx.heal(n,1); }); });
        ctx.onUpdate(function(){
          if(!g)return; g.clear();
          var a=ctx.toCanvas(cc.v2(cx-HW,r.y)), b=ctx.toCanvas(cc.v2(cx+HW,r.y+r.height)); if(!a||!b)return;
          var al=60+Math.floor(30*Math.sin(Date.now()/300));
          g.fillColor=cc.color(90,255,150,al); g.rect(a.x,a.y,b.x-a.x,b.y-a.y); g.fill();
        });
      }});
    F.register({ id:"ragetime", no:63, name:"伤害递增", emoji:"📈", desc:"时间越久伤害越高，40 秒后翻倍，最多 ×3",
      start:function(ctx){
        var shown=1;
        ctx.onHit(function(hc,d,info){ if(info.terrain)return d; var k=Math.min(3,1+ctx.elapsed()/40); return d*k; });
        ctx.every(1000,function(){ var k=Math.floor(Math.min(3,1+ctx.elapsed()/40)*2)/2; if(k>shown){ shown=k; ctx.players.forEach(function(n){ ctx.toast("📈 伤害 ×"+k,n,new cc.Color(255,140,80),26); }); } });
      }});
    F.register({ id:"ghosts", no:64, name:"幽灵", emoji:"👻", desc:"两个人都快看不见了，挨打时才现形",
      start:function(ctx){
        var until=[0,0];
        ctx.onHit(function(hc,d,info){ var i=ctx.players.indexOf(info.victim); if(i>=0)until[i]=Date.now()+800; return d; });
        ctx.onUpdate(function(){ ctx.players.forEach(function(n,i){ if(ctx.valid(n))n.opacity=Date.now()<until[i]?255:45; }); });
        ctx.onCleanup(function(){ ctx.players.forEach(function(n){ if(ctx.valid(n))n.opacity=255; }); });
      }});
    F.register({ id:"randomtp", no:65, name:"空间错乱", emoji:"🌀", desc:"每 7 秒两个人被随机传送到别的地方",
      start:function(ctx){
        var r=ctx.mapRect();
        ctx.every(7000,function(){
          ctx.players.forEach(function(n){ if(ctx.isDead(n))return; ctx.toast("🌀 传送",n,new cc.Color(200,160,255),24); });
          ctx.after(600,function(){ ctx.players.forEach(function(n){ if(ctx.isDead(n))return; ctx.teleport(n,cc.v2(r.x+r.width*ctx.rnd(0.15,0.85),r.y+r.height*ctx.rnd(0.45,0.8))); }); });
        });
      }});
    F.register({ id:"marathon", no:66, name:"持久战", emoji:"🫀", desc:"双方血量上限翻倍，慢慢打",
      start:function(ctx){
        ctx.after(400,function(){ ctx.players.forEach(function(n){ var h=ctx.hc(n); if(!h||h.isDead)return; h.maxhp*=2; h.hp=h.maxhp; bar(h); }); });
      }});
    F.register({ id:"sharedpain", no:67, name:"同生共死", emoji:"🔗", desc:"你打对手一下，自己也疼三分之一",
      start:function(ctx){
        ctx.onHit(function(hc,d,info){
          if(info.terrain||!info.attacker)return d;
          var a=info.attacker, ah=ctx.hc(a); if(!ah||ah.isDead)return d;
          var pct=Math.max(1,Math.round(d/3/ah.maxhp*100));
          setTimeout(function(){ if(ctx.alive&&!ctx.isDead(a))ctx.hurtPct(a,pct); },0);
          return d;
        });
      }});
    LOG("新场地已装");
    return true;
  }

  var tries=0;
  var boot=setInterval(function(){
    tries++;
    var ok1=false, ok2=false;
    try{ ok1=(tries>25)&&installItems(); }catch(e){ LOG("installItems",e&&e.message); }
    try{ ok2=installFields(); }catch(e){ LOG("installFields",e&&e.message); }
    if((ok1&&ok2)||tries>600){ clearInterval(boot); LOG("boot",ok1,ok2); }
  },200);
  // 别的脚本以后再包一层也没关系：每秒检查，r22 不在最外层就再包一次
  setInterval(function(){ try{ if(window.__applyItemToOne&&!window.__applyItemToOne.__r22&&installItems.icons)installItems(); }catch(_){} },1000);
  setInterval(tick,100);
})();

// r24b：道具图标加载失败会一直缺（原来只在开局加载一次），缺图标的道具就不会刷出来 → 新道具显得特别多。这里每 3 秒补加载一次。
(function(){
  var tries={};
  setInterval(function(){
    try{
      if(typeof cc==="undefined"||!cc.assetManager)return;
      var ID=window.__ITEM_DATA, IC=window.__itemIcons, C=window.__itemTextureCache, B=window.__BLOCKED_STATES||{};
      if(!ID||!IC||!C)return;
      ID.forEach(function(it){
        var s=it.state; if(s<3||B[s]||C[s]||!IC[s])return;
        var n=tries[s]||0; if(n>=20||tries["busy"+s])return;
        tries[s]=n+1; tries["busy"+s]=true;
        var url=IC[s]+(IC[s].indexOf("?")<0?"?":"&")+"r="+n;
        cc.assetManager.loadRemote(url,{ext:url.indexOf(".svg")>0?".svg":".png"},function(e,t){
          tries["busy"+s]=false;
          if(!e&&t&&!C[s]){ C[s]=new cc.SpriteFrame(t); try{ console.log("[r24b] 补上道具图标",s); }catch(x){} }
        });
      });
    }catch(e){}
  },3000);
})();
