;(function(){
  'use strict';
  var E=window.__stickmanEgg={
    version:'start-easteregg-r2', probability:0.05, round:0, active:null,
    names:['otto','frog'], textures:Object.create(null), frames:Object.create(null),
    preloadDone:false, preloadFailed:false, generation:0
  };
  var paths={otto:'/easteregg-otto-cutout.png',frog:'/easteregg-frog-cutout.png'};
  function log(msg){try{console.log('[EGG] '+msg);}catch(_){} }
  function nodeOk(n){return !!(n&&n.isValid&&n.activeInHierarchy);}
  function makeTexture(img){
    try{
      if(!window.cc||!cc.Texture2D)return null;
      var tex=new cc.Texture2D();
      if(tex.initWithElement)tex.initWithElement(img);
      if(tex.handleLoadedTexture)tex.handleLoadedTexture();
      return tex;
    }catch(_){return null;}
  }
  function makeFrame(tex){
    try{
      if(!window.cc||!cc.SpriteFrame)return null;
      if(cc.SpriteFrame.createWithTexture)return cc.SpriteFrame.createWithTexture(tex);
      return new cc.SpriteFrame(tex);
    }catch(_){return null;}
  }
  function finishImage(name,img,tries){
    var tex=makeTexture(img),frame=tex&&makeFrame(tex);
    if(!frame){
      if((tries||0)<40){setTimeout(function(){finishImage(name,img,(tries||0)+1);},100);return;}
      E.preloadFailed=true;log('skip '+name);return;
    }
    E.textures[name]=tex;E.frames[name]=frame;
    if(E.frames.otto&&E.frames.frog)E.preloadDone=true;
  }
  function preload(name){
    var img=new Image(); img.decoding='async'; img.onload=function(){finishImage(name,img,0);}; img.onerror=function(){E.preloadFailed=true;log('skip '+name);}; img.src=paths[name];
  }
  preload('otto');preload('frog');
  function spriteFor(human){
    if(!nodeOk(human))return null;
    var head=human.getChildByName&&human.getChildByName('head');
    if(!head)return null;
    var sp=head.getComponent&&head.getComponent(cc.Sprite);
    if(!sp&&head.getComponentInChildren)sp=head.getComponentInChildren(cc.Sprite);
    return sp?{head:head,sprite:sp}:null;
  }
  function restore(entry){
    if(!entry)return;
    try{
      if(entry.overlay&&entry.overlay.isValid)entry.overlay.destroy();
      if(entry.sprite&&entry.sprite.isValid){
        entry.sprite.enabled=entry.enabled;
        entry.sprite.spriteFrame=entry.frame;
        if(entry.sizeMode!==undefined)entry.sprite.sizeMode=entry.sizeMode;
        if(entry.trim!==undefined)entry.sprite.trim=entry.trim;
        if(entry.color)entry.sprite.color=entry.color;
      }
      if(entry.head&&entry.head.isValid){
        if(entry.width!==undefined)entry.head.width=entry.width;
        if(entry.height!==undefined)entry.head.height=entry.height;
      }
    }catch(_){}
  }
  function restoreAll(){
    if(!E.active)return;
    E.active.entries.forEach(restore);E.active=null;E.generation++;
  }
  function applyTo(human,frame){
    var s=spriteFor(human);if(!s)return null;
    var oldColor=s.sprite.color&&s.sprite.color.clone?s.sprite.color.clone():s.sprite.color;
    var entry={human:human,head:s.head,sprite:s.sprite,frame:s.sprite.spriteFrame,
      sizeMode:s.sprite.sizeMode,trim:s.sprite.trim,color:oldColor,
      width:s.head.width,height:s.head.height,enabled:s.sprite.enabled};
    try{
      var overlay=new cc.Node('eggHeadVisual');
      overlay.parent=s.sprite.node;overlay.setPosition(0,0);overlay.zIndex=100;
      var visual=overlay.addComponent(cc.Sprite);visual.sizeMode=cc.Sprite.SizeMode.CUSTOM;
      visual.spriteFrame=frame;
      overlay.setContentSize(Math.max(1,s.head.width)*2,Math.max(1,s.head.height)*2);
      entry.overlay=overlay;entry.visual=visual;s.sprite.enabled=false;
    }catch(_){if(entry.overlay&&entry.overlay.isValid)entry.overlay.destroy();s.sprite.enabled=entry.enabled;return null;}
    return entry;
  }
  function flash(name,token){
    var frame=E.frames[name];if(!frame)return;
    var im=document.createElement('img');im.alt='';im.src=paths[name];
    im.style.cssText='position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:100vw;height:100vh;object-fit:cover;z-index:2147483000;pointer-events:none;user-select:none;';
    document.body.appendChild(im);
    setTimeout(function(){if(im.parentNode)im.parentNode.removeChild(im);},900);
  }
  E.roundStart=function(games){
    restoreAll();E.round++;
    var n=E.round;
    if(Math.random()>=E.probability){log('round '+n+' skip');return;}
    var which=Math.random()<.5?'otto':'frog';
    if(!E.preloadDone||!E.frames[which]){log('round '+n+' skip');return;}
    games=games||((window.cc&&cc.find('Canvas').getComponent('Games'))||null);
    var people=[];
    if(games&&nodeOk(games.player))people.push(games.player);
    if(games&&nodeOk(games.enemy))people.push(games.enemy);
    if(!people.length){log('round '+n+' skip');return;}
    var entries=[];for(var i=0;i<people.length;i++){var e=applyTo(people[i],E.frames[which]);if(e)entries.push(e);}
    if(!entries.length){log('round '+n+' skip');return;}
    E.generation++;var token=E.generation;E.active={which:which,entries:entries,token:token};
    log('round '+n+' '+which);flash(which,token);
  };
  setInterval(function(){
    var a=E.active;if(!a)return;
    var stale=false;
    for(var i=0;i<a.entries.length;i++){
      var e=a.entries[i];
      if(!nodeOk(e.human)){stale=true;break;}
      try{
        if(!e.overlay||!e.overlay.isValid){stale=true;break;}
        e.sprite.enabled=false;
        if(e.visual.spriteFrame!==E.frames[a.which])e.visual.spriteFrame=E.frames[a.which];
        e.overlay.setContentSize(Math.max(1,e.head.width)*2,Math.max(1,e.head.height)*2);
      }catch(_){stale=true;break;}
    }
    if(stale)restoreAll();
  },160);
})();
