/* ==========================================================================
   stickman-settings.r1.js —— 设置面板：配色 / 图标 / Graphics 子页面
   --------------------------------------------------------------------------
   主面板第四行 Graphics 不再是「一键开关」，点进去是独立子页面，四行各自调节：

     Texture       High / Low          纹理 mipmap（缩小采样的细节）
     Resolution    High / Mid / Low    画布像素比上限（渲染分辨率）
     Frame Rate    60 / 30             帧率上限
     FPS Display   On / Off            右上角实时帧率

   面板底板是运行时 canvas 画的 160×160 九宫格（圆角 30 + 4px 描边），
   配色深墨绿 #33413A + 近黑描边，与和纸米黄背景一致；图标统一染成面板底色。
   所有状态存 localStorage，进游戏自动套用。
   ========================================================================== */
(function () {
  "use strict";

  var CFG = { grow: 74, titleDrop: 30, startY: 82, step: 113, label: "Graphics" };
  var K = {
    tex: "stickman.mipmapOn",
    res: "stickman.resLevel",
    fps: "stickman.fps",
    fpsShow: "stickman.fpsShow"
  };
  // 画布总像素上限：2.1M ≈ 1920×1080，1.4M ≈ 1568×882，0.9M ≈ 1257×707
  var RES_PX = [2.1e6, 1.4e6, 0.9e6];
  var RES_NAME = ["High", "Mid", "Low"];

  var LOG = function () {
    try { console.log.apply(console, ["[SET]"].concat([].slice.call(arguments))); } catch (e) {}
  };

  function req(n) { try { return window.__require(n); } catch (e) { return null; } }

  function lsGet(k, d) {
    try { var v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; }
  }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  /* ---------------------------- 四项设置 ---------------------------- */

  function mipOn() {
    if (typeof window.__mipOn === "function") return window.__mipOn();
    return lsGet(K.tex, "1") !== "0";
  }
  function setMip(v) {
    if (typeof window.__mipSet === "function") return window.__mipSet(v);
    lsSet(K.tex, v ? "1" : "0");
    return v;
  }

  function resLevel() {
    var v = parseInt(lsGet(K.res, "0"), 10);
    return isNaN(v) ? 0 : Math.max(0, Math.min(2, v));
  }
  function applyRes(lv) {
    lv = Math.max(0, Math.min(2, lv | 0));
    try {
      var w = window.innerWidth || 1, h = window.innerHeight || 1;
      var r = Math.max(0.5, Math.min(2, Math.sqrt(RES_PX[lv] / (w * h))));
      // 已经是目标值就别再动：setContentSize 会重建画布，反复触发会掉帧
      if (Math.abs((cc.view._maxPixelRatio || 2) - r) < 0.01) return;
      cc.view._maxPixelRatio = r;
      cc.view.enableRetina(true);
      if (cc.view._resizeEvent) cc.view._resizeEvent(true);
    } catch (e) { LOG("applyRes 失败", e && e.message); }
  }

  function fpsLimit() { return parseInt(lsGet(K.fps, "60"), 10) === 30 ? 30 : 60; }
  function applyFps(v) {
    try {
      if (!cc.game || !cc.game.setFrameRate) return;
      var cur = cc.game.config && cc.game.config.frameRate;
      if (typeof cur === "number" && Math.abs(cur - v) < 0.5) return;
      cc.game.setFrameRate(v);
    } catch (e) {}
  }

  /* 右上角 FPS 读数：只在开启时挂一次监听 */
  var fpsNode = null, fpsAcc = 0, fpsN = 0, fpsHooked = false;
  function buildFps() {
    if (fpsNode && fpsNode.isValid) return fpsNode;
    try {
      var cv = cc.find("Canvas");
      if (!cv) return null;
      var n = new cc.Node("FpsLabel");
      n.parent = cv;
      n.anchorX = 0.5; n.anchorY = 0.5;
      var l = n.addComponent(cc.Label);
      l.fontSize = 26;
      l.lineHeight = 30;
      l.horizontalAlign = cc.Label.HorizontalAlign.RIGHT;
      l.verticalAlign = cc.Label.VerticalAlign.CENTER;
      l.overflow = cc.Label.Overflow.CLAMP;
      l.string = "-- FPS";
      n.color = new cc.Color(0x3A, 0x4A, 0x40);
      // Label 会给节点改尺寸，所以宽度放在最后设
      n.setContentSize(140, 32);
      var vs = cc.view.getVisibleSize();
      // 右上角：右边留 22，顶边留 26（anchor 居中，故减去半宽半高）
      n.setPosition(vs.width / 2 - 92, vs.height / 2 - 42);
      // 设置面板的遮罩是全屏的，FPS 必须压在它上面，用 zIndex 而不是 siblingIndex
      n.zIndex = 999;
      n.active = false;
      fpsNode = n;
      if (!fpsHooked) {
        fpsHooked = true;
        cc.director.on(cc.Director.EVENT_AFTER_UPDATE, function () {
          if (!fpsNode || !fpsNode.isValid || !fpsNode.active) return;
          var dt = cc.director.getDeltaTime();
          fpsAcc += dt; fpsN++;
          if (fpsAcc >= 0.5) {
            var v = Math.round(fpsN / fpsAcc);
            fpsNode.getComponent(cc.Label).string = v + " FPS";
            fpsAcc = 0; fpsN = 0;
          }
        });
      }
    } catch (e) { LOG("FPS 标签创建失败", e && e.message); return null; }
    return fpsNode;
  }
  function setFpsShow(on) {
    on = !!on;
    if (!on && (!fpsNode || !fpsNode.isValid)) return;   // 关着又没建过，不必建
    var n = buildFps();
    if (!n) return;
    if (n.active !== on) { n.active = on; fpsAcc = 0; fpsN = 0; }
    if (on) {
      n.zIndex = 999;
      try { n.setSiblingIndex(n.parent.children.length - 1); } catch (e) {}
    }
  }

  /* ---------------------------- 着色工具 ---------------------------- */

  /* 把单色图标整体染色：画进 canvas，再用 source-in 覆盖颜色 */
  var tintCache = {};
  function tint(sf, color) {
    if (!sf) return null;
    color = color || "#ffffff";
    if (sf.__tintColor === color) return sf;
    var key = (sf._uuid || sf.name || "sf") + "|" + color;
    if (tintCache[key]) return tintCache[key];
    try {
      var tex = sf.getTexture();
      var img = tex && tex.getHtmlElementObj && tex.getHtmlElementObj();
      if (!img || !img.width) return null;
      var cv = document.createElement("canvas");
      cv.width = img.width;
      cv.height = img.height;
      var g = cv.getContext("2d");
      g.drawImage(img, 0, 0);
      g.globalCompositeOperation = "source-in";
      g.fillStyle = color;
      g.fillRect(0, 0, cv.width, cv.height);
      var nt = new cc.Texture2D();
      nt.initWithElement(cv);
      nt.handleLoadedTexture(true);
      var nf = new cc.SpriteFrame(nt, sf.getRect(), sf.isRotated(), sf.getOffset(), sf.getOriginalSize());
      nf.__tintColor = color;
      tintCache[key] = nf;
      return nf;
    } catch (e) {
      return null;
    }
  }

  function makeFrame(draw, S) {
    try {
      var cv = document.createElement("canvas");
      cv.width = cv.height = S;
      draw(cv.getContext("2d"), S);
      var tex = new cc.Texture2D();
      tex.initWithElement(cv);
      tex.handleLoadedTexture(true);
      return new cc.SpriteFrame(tex);
    } catch (e) { return null; }
  }

  /* 圆片：指示灯用 canvas 画，边缘比 cc.Graphics 干净 */
  var dotFrame = null;
  function circleFrame() {
    if (dotFrame) return dotFrame;
    dotFrame = makeFrame(function (g, S) {
      g.beginPath();
      g.arc(S / 2, S / 2, S / 2 - 1.5, 0, Math.PI * 2);
      g.fillStyle = "#ffffff";
      g.fill();
    }, 64);
    return dotFrame;
  }

  /* 行背景条：略亮于面板底的圆角块 */
  var rowFrame = null;
  function rowFrameGet() {
    if (rowFrame) return rowFrame;
    var R = 18, S = 64;
    rowFrame = makeFrame(function (g) {
      g.beginPath();
      g.moveTo(R, 0);
      g.lineTo(S - R, 0);
      g.quadraticCurveTo(S, 0, S, R);
      g.lineTo(S, S - R);
      g.quadraticCurveTo(S, S, S - R, S);
      g.lineTo(R, S);
      g.quadraticCurveTo(0, S, 0, S - R);
      g.lineTo(0, R);
      g.quadraticCurveTo(0, 0, R, 0);
      g.closePath();
      g.fillStyle = "#3E4C45";
      g.fill();
    }, S);
    if (rowFrame) {
      rowFrame.insetLeft = rowFrame.insetRight = R + 4;
      rowFrame.insetTop = rowFrame.insetBottom = R + 4;
    }
    return rowFrame;
  }

  /* 右侧的「›」箭头：表示点进去 */
  var chevFrame = null;
  function chevronFrame() {
    if (chevFrame) return chevFrame;
    var S = 48;
    chevFrame = makeFrame(function (g) {
      g.strokeStyle = "#EDE3C8";
      g.lineWidth = 5;
      g.lineCap = "round";
      g.lineJoin = "round";
      g.globalAlpha = 0.55;
      g.beginPath();
      g.moveTo(S * 0.36, S * 0.24);
      g.lineTo(S * 0.64, S * 0.5);
      g.lineTo(S * 0.36, S * 0.76);
      g.stroke();
    }, S);
    return chevFrame;
  }

  /* ---------------------------- 面板底板 ---------------------------- */
  var THEME = {
    fill:  "#33413A",
    edge:  "#1C2420",
    title: "#F6EEDC",
    text:  "#EDE3C8",
    icon:  "#33413A",
    value: "#F6EEDC"
  };

  function hx(h) {
    h = String(h).replace("#", "");
    return new cc.Color(parseInt(h.substr(0, 2), 16),
                        parseInt(h.substr(2, 2), 16),
                        parseInt(h.substr(4, 2), 16), 255);
  }

  var panelFrame = null;
  function panelFrameGet() {
    if (panelFrame) return panelFrame;
    var S = 160, R = 30, LW = 4;
    panelFrame = makeFrame(function (g) {
      function rr(x, y, w, h, r) {
        g.beginPath();
        g.moveTo(x + r, y);
        g.lineTo(x + w - r, y);
        g.quadraticCurveTo(x + w, y, x + w, y + r);
        g.lineTo(x + w, y + h - r);
        g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        g.lineTo(x + r, y + h);
        g.quadraticCurveTo(x, y + h, x, y + h - r);
        g.lineTo(x, y + r);
        g.quadraticCurveTo(x, y, x + r, y);
        g.closePath();
      }
      rr(LW / 2, LW / 2, S - LW, S - LW, R);
      g.fillStyle = THEME.edge;
      g.fill();
      rr(LW * 1.5, LW * 1.5, S - LW * 3, S - LW * 3, R - LW);
      g.fillStyle = THEME.fill;
      g.fill();
    }, S);
    if (panelFrame) {
      panelFrame.insetLeft = panelFrame.insetRight = R + LW;
      panelFrame.insetTop = panelFrame.insetBottom = R + LW;
    }
    return panelFrame;
  }

  function paintText(root) {
    for (var i = 0; i < root.children.length; i++) {
      var c = root.children[i];
      if (c.name === "Title") continue;
      if (c.getComponent(cc.Label)) c.color = hx(THEME.text);
      else if (c.children.length) paintText(c);
    }
  }

  function applyTheme(avNode) {
    var sf = panelFrameGet();
    if (!sf) return false;
    ["Popup", "PopupCredits", "PopupGraphics"].forEach(function (nm) {
      var n = avNode.getChildByName(nm);
      if (!n) return;
      var s = n.getComponent(cc.Sprite);
      if (s) {
        s.spriteFrame = sf;
        s.sizeMode = cc.Sprite.SizeMode.CUSTOM;
        s.type = cc.Sprite.Type.SLICED;
      }
      var t = n.getChildByName("Title");
      if (t && t.getComponent(cc.Label)) t.color = hx(THEME.title);
      paintText(n);
    });
    // Credits 面板原本 720 宽，正文却有 766 宽，直接溢出到面板外
    var pc = avNode.getChildByName("PopupCredits");
    if (pc) {
      if (pc.width < 829) pc.width = 830;
      var back = pc.getChildByName("back");
      if (back) back.x = 383;
    }
    return true;
  }

  /* ---------------------------- 主面板四行 ---------------------------- */

  function tintIcons(btns) {
    ["musicBtn", "creditsBtn", "privacyBtn", "gfxBtn"].forEach(function (nm) {
      var b = btns && btns.getChildByName(nm);
      var ic = b && b.getChildByName("Icon");
      var sp = ic && ic.getComponent(cc.Sprite);
      if (sp && sp.spriteFrame) {
        var nf = tint(sp.spriteFrame, THEME.icon);
        if (nf) sp.spriteFrame = nf;
      }
    });
  }

  /* ---------------------------- Graphics 子页面 ---------------------------- */

  var PW = 560;                // 子面板宽
  var ROW_W = 470, ROW_H = 92, ROW_STEP = 112;
  // 面板高度跟着行数走：以后往 OPTIONS 里加项，面板自动变高，不用改这里
  function panelH() { return 200 + ROW_STEP * OPTIONS.length; }
  var ROW_TOP = -212;          // 第一行的 y

  var OPTIONS = [
    {
      id: "tex",
      name: "Texture",
      vals: ["High", "Low"],
      get: function () { return mipOn() ? 0 : 1; },
      set: function (i) { setMip(i === 0); }
    },
    {
      id: "res",
      name: "Resolution",
      vals: RES_NAME,
      get: function () { return resLevel(); },
      set: function (i) { lsSet(K.res, String(i)); applyRes(i); }
    },
    {
      id: "fps",
      name: "Frame Rate",
      vals: ["60", "30"],
      get: function () { return fpsLimit() === 60 ? 0 : 1; },
      set: function (i) { var v = i === 0 ? 60 : 30; lsSet(K.fps, String(v)); applyFps(v); }
    },
    {
      id: "fpsShow",
      name: "FPS Display",
      vals: ["On", "Off"],
      get: function () { return lsGet(K.fpsShow, "0") === "1" ? 0 : 1; },
      set: function (i) { lsSet(K.fpsShow, i === 0 ? "1" : "0"); setFpsShow(i === 0); }
    }
  ];

  function makeLabel(tpl, text, size, w, h, align, color) {
    var n = cc.instantiate(tpl);
    n.name = "lbl";
    n.setContentSize(w, h);
    var l = n.getComponent(cc.Label);
    if (l) {
      l.string = text;
      l.fontSize = size;
      l.lineHeight = Math.round(size * 1.1);
      l.horizontalAlign = align;
      l.verticalAlign = cc.Label.VerticalAlign.CENTER;
      l.overflow = cc.Label.Overflow.CLAMP;
    }
    var tl = n.getComponent("TranslateLbl");
    if (tl) tl.enabled = false;
    n.color = color;
    return n;
  }

  function buildGfxPanel(avNode, pop) {
    if (avNode.__gfxPanel && avNode.__gfxPanel.isValid) return avNode.__gfxPanel;
    var pc = avNode.getChildByName("PopupCredits");
    var tpl = pc && pc.getChildByName("Title");
    if (!tpl) return null;

    var PH = panelH();
    var n = new cc.Node("PopupGraphics");
    n.parent = avNode;
    n.anchorX = 0.5; n.anchorY = 1;
    n.setContentSize(PW, PH);
    n.setPosition(0, pop.y);

    // 顺序要紧：Sprite 赋图时会按图片原始尺寸改节点大小，所以尺寸放最后设
    var sf = panelFrameGet();
    var sp = n.addComponent(cc.Sprite);
    sp.sizeMode = cc.Sprite.SizeMode.CUSTOM;
    sp.type = cc.Sprite.Type.SLICED;
    sp.spriteFrame = sf;
    n.setContentSize(PW, PH);

    // 标题
    var title = makeLabel(tpl, "Graphics", 60, 360, 76, cc.Label.HorizontalAlign.CENTER, hx(THEME.title));
    title.name = "Title";
    title.parent = n;
    title.setPosition(0, -88);

    // 关闭按钮：复用主面板的 home
    var homeTpl = pop.getChildByName("home");
    if (homeTpl) {
      var back = cc.instantiate(homeTpl);
      back.name = "back";
      back.parent = n;
      back.setPosition(258, -35);
      var bk = back.getComponent(cc.Button);
      if (bk) bk.clickEvents = [];
      back.on("click", function () { closeGfx(avNode); });
    }

    // 四行
    var rows = [];
    OPTIONS.forEach(function (opt, i) {
      var y = ROW_TOP - ROW_STEP * i;
      var row = new cc.Node("row_" + opt.id);
      row.parent = n;
      row.anchorX = 0.5; row.anchorY = 0.5;
      row.setContentSize(ROW_W, ROW_H);
      row.setPosition(0, y);

      var rs = row.addComponent(cc.Sprite);
      var rf = rowFrameGet();
      rs.sizeMode = cc.Sprite.SizeMode.CUSTOM;
      rs.type = cc.Sprite.Type.SLICED;
      if (rf) rs.spriteFrame = rf;
      row.setContentSize(ROW_W, ROW_H);

      var nameL = makeLabel(tpl, opt.name, 42, 290, 60, cc.Label.HorizontalAlign.LEFT, hx(THEME.text));
      nameL.parent = row;
      nameL.anchorX = 0;
      nameL.setPosition(-ROW_W / 2 + 28, 0);

      var valL = makeLabel(tpl, opt.vals[opt.get()], 42, 150, 60, cc.Label.HorizontalAlign.RIGHT, hx(THEME.value));
      valL.parent = row;
      valL.anchorX = 1;
      valL.setPosition(ROW_W / 2 - 28, 0);

      rows.push({ opt: opt, node: row, val: valL });

      row.on(cc.Node.EventType.TOUCH_END, function () {
        opt.set((opt.get() + 1) % opt.vals.length);
        // 以实际生效的值为准：?mip=0 时 Texture 点不动，就别显示成已改
        var now = opt.get();
        var lb = valL.getComponent(cc.Label);
        if (lb) lb.string = opt.vals[now];
        LOG("Graphics →", opt.name, "=", opt.vals[now]);
      });
    });

    n.active = false;
    avNode.__gfxPanel = n;
    avNode.__gfxRows = rows;
    return n;
  }

  function openGfx(avNode) {
    var pop = avNode.getChildByName("Popup");
    var n = buildGfxPanel(avNode, pop);
    if (!n) return;
    // 每次打开都按当前存档刷新一遍，避免和地址栏参数、外部改动脱节
    (avNode.__gfxRows || []).forEach(function (r) {
      var lb = r.val.getComponent(cc.Label);
      if (lb) lb.string = r.opt.vals[r.opt.get()];
    });
    pop.active = false;
    n.active = true;
    LOG("打开 Graphics 子页面");
  }

  function closeGfx(avNode) {
    var pop = avNode.getChildByName("Popup");
    var n = avNode.__gfxPanel;
    if (n) n.active = false;
    if (pop) pop.active = true;
  }

  /* ---------------------------- 注入 ---------------------------- */

  function inject(av) {
    var node = av && av.node;
    if (!node) return;
    var pop = node.getChildByName("Popup");
    if (!pop) return;
    if (!node.__themeDone) {
      try { if (applyTheme(node)) node.__themeDone = 1; }
      catch (e) { LOG("配色失败", e && e.message); }
    }
    var btns = pop.getChildByName("buttons");
    if (!btns) return;
    try { tintIcons(btns); } catch (e) { LOG("图标染色失败", e && e.message); }
    if (node.__gfxDone) return;
    if (btns.getChildByName("gfxBtn")) { node.__gfxDone = 1; return; }

    var mb = btns.getChildByName("musicBtn");
    var ml = btns.getChildByName("MusicLbl");
    if (!mb || !ml) return;

    // 1) 面板加高：底边钉住，向上生长
    var b0 = pop.getBoundingBoxToWorld();
    pop.height = pop.height + CFG.grow;
    var b1 = pop.getBoundingBoxToWorld();
    pop.y += (b0.y - b1.y);

    // 2) 标题跟着面板中心上移了，补回来
    var title = pop.getChildByName("Title");
    if (title) title.y -= CFG.titleDrop;

    // 3) 原有三行压缩重排
    [["musicBtn", "MusicLbl"], ["creditsBtn", "creditsLbl"], ["privacyBtn", "privacyLbl"]]
      .forEach(function (pair, i) {
        var b = btns.getChildByName(pair[0]);
        var l = btns.getChildByName(pair[1]);
        if (b) b.y = CFG.startY - CFG.step * i;
        if (l) l.y = CFG.startY - CFG.step * i;
      });

    // 4) 克隆第四行
    var gBtn = cc.instantiate(mb);
    gBtn.name = "gfxBtn";
    var gLbl = cc.instantiate(ml);
    gLbl.name = "gfxLbl";
    btns.addChild(gBtn);
    btns.addChild(gLbl);
    gBtn.y = CFG.startY - CFG.step * 3;
    gLbl.y = CFG.startY - CFG.step * 3;

    var lb = gLbl.getComponent(cc.Label);
    if (lb) lb.string = CFG.label;
    var tl = gLbl.getComponent("TranslateLbl");
    if (tl) tl.enabled = false;

    var btn = gBtn.getComponent(cc.Button);
    if (btn) btn.clickEvents = [];

    // 5) 图标换成齿轮
    var iconNode = gBtn.getChildByName("Icon");
    if (iconNode) {
      var sp = iconNode.getComponent(cc.Sprite);
      var src = cc.find("Canvas/MainView/TopPanel/Setting/Icon");
      var ssf = src && src.getComponent(cc.Sprite) && src.getComponent(cc.Sprite).spriteFrame;
      if (sp && ssf) {
        var nf = tint(ssf, THEME.icon);
        if (nf) sp.spriteFrame = nf;
      }
    }

    // 6) 行尾的「›」，提示这一行能点进去（原先是开关用的圆点）
    var arrow = new cc.Node("gfxArrow");
    arrow.parent = btns;
    arrow.setContentSize(24, 32);
    var asp = arrow.addComponent(cc.Sprite);
    var afr = chevronFrame();
    asp.sizeMode = cc.Sprite.SizeMode.CUSTOM;
    if (afr) asp.spriteFrame = afr;
    arrow.setContentSize(24, 32);
    arrow.setPosition(198, CFG.startY - CFG.step * 3);

    // 7) 点进去
    gBtn.on("click", function () { openGfx(node); });

    node.__gfxDone = 1;
    LOG("设置面板已加入 Graphics 项（子页面）");
  }

  function refreshIcons(av) {
    var n = av && av.node;
    var pop = n && n.getChildByName("Popup");
    var btns = pop && pop.getChildByName("buttons");
    if (btns) tintIcons(btns);
  }

  function patch() {
    var M = req("AudioView");
    var P = M && M.default && M.default.prototype;
    if (!P) return false;
    if (!P.__setR1) {
      var oLoad = P.onLoad;
      P.onLoad = function () {
        if (oLoad) oLoad.call(this);
        try { inject(this); } catch (e) { LOG("注入失败", e && e.message); }
      };
      // 面板每次显示都回到主页面，别把上次的子页面状态带进来
      var oEnable = P.onEnable;
      P.onEnable = function () {
        if (oEnable) oEnable.call(this);
        try {
          var n = this.node, pop = n.getChildByName("Popup");
          if (pop) pop.active = true;
          if (n.__gfxPanel) n.__gfxPanel.active = false;
        } catch (e) {}
      };
      var oStart = P.start;
      P.start = function () {
        if (oStart) oStart.call(this);
        try { refreshIcons(this); } catch (e) {}
      };
      var oMusic = P.OnMusicBtn;
      P.OnMusicBtn = function () {
        if (oMusic) oMusic.call(this);
        try { refreshIcons(this); } catch (e) {}
      };
      P.__setR1 = true;
    }
    var n = cc.find("Canvas/AudioView");
    if (n) {
      var av = n.getComponent("AudioView");
      if (av) inject(av);
    }
    return true;
  }

  /* ---------------------------- 启动 ---------------------------- */

  // 分辨率：先按存档应用一次；窗口变化时补一次（晚于 fixes 的 60ms 重算）
  var resTimer = 0;
  function reapplyRes() {
    clearTimeout(resTimer);
    resTimer = setTimeout(function () { applyRes(resLevel()); }, 260);
  }
  window.addEventListener("resize", reapplyRes);
  ["fullscreenchange", "webkitfullscreenchange"].forEach(function (e) {
    document.addEventListener(e, reapplyRes);
  });

  function applyAll() {
    applyRes(resLevel());
    applyFps(fpsLimit());
    setFpsShow(lsGet(K.fpsShow, "0") === "1");
  }

  var tries = 0;
  var timer = setInterval(function () {
    if (window.cc && cc.director && window.__require) {
      // 引擎自己的初始化会把画布尺寸和帧率再设一遍，所以开头几次要补
      applyAll();
      [400, 1200, 2600].forEach(function (t) { setTimeout(applyAll, t); });
      try {
        cc.director.on(cc.Director.EVENT_AFTER_SCENE_LAUNCH, function () {
          setTimeout(applyAll, 220);
        });
      } catch (e) {}
      if (patch()) clearInterval(timer);
    } else if (++tries > 1200) clearInterval(timer);
  }, 50);
})();
