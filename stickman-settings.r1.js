/* ==========================================================================
   stickman-settings.r1.js  —— 设置面板加入「Graphics」画面开关
   --------------------------------------------------------------------------
   在原有的 Music / Credits / Privacy 下面加第四行，用来控制纹理 mipmap。
   面板高度 +74 并钉住底边，标题下移 30，四行按 113 的间距重排。

   状态存 localStorage["stickman.mipmapOn"]，默认开启（与线上默认一致）。
   点击即时生效，不需要刷新：__mipSet() 会就地补 mipmap 或还原双线性。
   地址栏带 ?mip=0 时该开关锁死为关闭（调试用）。

   图标复用顶栏的齿轮（icon_settings），运行时把纹理染成白色，与相邻的
   Music/Credits/Privacy 三个白图标保持同一视觉。

   配色：原版面板是亮蓝底 + 深蓝描边，与和纸米黄背景冲突。这里把底板换成
   深墨绿（#33413A）配近黑描边，文字改米色，与标题原有的深墨色系一致。
   底板是运行时用 canvas 画的九宫格（圆角 30 + 4px 描边），不新增图片资源。
   ========================================================================== */
(function () {
  "use strict";

  var KEY = "stickman.mipmapOn";
  var CFG = { grow: 74, titleDrop: 30, startY: 82, step: 113, label: "Graphics" };

  var LOG = function () {
    try { console.log.apply(console, ["[SET]"].concat([].slice.call(arguments))); } catch (e) {}
  };

  function req(n) { try { return window.__require(n); } catch (e) { return null; } }

  function mipOn() {
    if (typeof window.__mipOn === "function") return window.__mipOn();
    try { return localStorage.getItem(KEY) !== "0"; } catch (e) { return true; }
  }
  function setMip(v) {
    if (typeof window.__mipSet === "function") return window.__mipSet(v);
    try { localStorage.setItem(KEY, v ? "1" : "0"); } catch (e) {}
    return v;
  }

  /* 把单色图标染成白色：先画进 canvas，再用 source-in 整体覆盖 */
  var tinted = null;
  function tint(sf) {
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
      g.fillStyle = "#ffffff";
      g.fillRect(0, 0, cv.width, cv.height);
      var nt = new cc.Texture2D();
      nt.initWithElement(cv);
      nt.handleLoadedTexture(true);
      return new cc.SpriteFrame(nt, sf.getRect(), sf.isRotated(), sf.getOffset(), sf.getOriginalSize());
    } catch (e) {
      return null;
    }
  }

  /* 指示灯用 canvas 画抗锯齿圆，比 cc.Graphics 干净 */
  var dotFrame = null;
  function circleFrame() {
    if (dotFrame) return dotFrame;
    try {
      var S = 64;
      var cv = document.createElement("canvas");
      cv.width = cv.height = S;
      var g = cv.getContext("2d");
      g.beginPath();
      g.arc(S / 2, S / 2, S / 2 - 1.5, 0, Math.PI * 2);
      g.fillStyle = "#ffffff";
      g.fill();
      var nt = new cc.Texture2D();
      nt.initWithElement(cv);
      nt.handleLoadedTexture(true);
      dotFrame = new cc.SpriteFrame(nt);
    } catch (e) { dotFrame = null; }
    return dotFrame;
  }

  /* ---------------- 面板配色：亮蓝 → 深墨绿和风纸 ---------------- */
  var THEME = {
    fill:  "#33413A",   // 面板底色
    edge:  "#1C2420",   // 描边
    title: "#F6EEDC",   // 标题
    text:  "#EDE3C8"    // 正文与图标标签
  };

  function hx(h) {
    h = String(h).replace("#", "");
    return new cc.Color(parseInt(h.substr(0, 2), 16),
                        parseInt(h.substr(2, 2), 16),
                        parseInt(h.substr(4, 2), 16), 255);
  }

  /* 一张 160×160 的九宫格：四角固定，中间纯色拉伸 */
  var panelFrame = null;
  function panelFrameGet() {
    if (panelFrame) return panelFrame;
    try {
      var S = 160, R = 30, LW = 4;
      var cv = document.createElement("canvas");
      cv.width = cv.height = S;
      var g = cv.getContext("2d");
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
      // 外圈描边
      rr(LW / 2, LW / 2, S - LW, S - LW, R);
      g.fillStyle = THEME.edge;
      g.fill();
      // 内层底色
      rr(LW * 1.5, LW * 1.5, S - LW * 3, S - LW * 3, R - LW);
      g.fillStyle = THEME.fill;
      g.fill();

      var tex = new cc.Texture2D();
      tex.initWithElement(cv);
      tex.handleLoadedTexture(true);
      var sf = new cc.SpriteFrame(tex);
      sf.insetLeft = sf.insetRight = R + LW;
      sf.insetTop = sf.insetBottom = R + LW;
      panelFrame = sf;
    } catch (e) {
      panelFrame = null;
    }
    return panelFrame;
  }

  function paintText(root) {
    for (var i = 0; i < root.children.length; i++) {
      var c = root.children[i];
      if (c.name === "Title") continue;          // 标题单独用更亮的一档
      if (c.getComponent(cc.Label)) c.color = hx(THEME.text);
      else if (c.children.length) paintText(c);
    }
  }

  function applyTheme(avNode) {
    var sf = panelFrameGet();
    if (!sf) return false;
    ["Popup", "PopupCredits"].forEach(function (nm) {
      var n = avNode.getChildByName(nm);
      if (!n) return;
      var s = n.getComponent(cc.Sprite);
      if (s) {
        s.spriteFrame = sf;
        s.type = cc.Sprite.Type.SLICED;
      }
      var t = n.getChildByName("Title");
      if (t && t.getComponent(cc.Label)) t.color = hx(THEME.title);
      paintText(n);
    });
    // Credits 面板原本 720 宽，正文却有 766 宽，直接溢出到面板外。
    // 原版深色字压在米黄背景上还看得见，换成米色字后就消失了，所以加宽面板。
    var pc = avNode.getChildByName("PopupCredits");
    if (pc) {
      if (pc.width < 829) pc.width = 830;
      var back = pc.getChildByName("back");
      if (back) back.x = 383;          // 关闭按钮跟着右移，保持探出面板右上角
    }
    return true;
  }

  function paint(btn, lbl, on) {
    var ic = btn && btn.getChildByName("Icon");
    if (ic) ic.opacity = on ? 255 : 92;
    if (lbl) lbl.node.opacity = on ? 255 : 128;
    // 右下角的指示灯：金=开，灰=关
    var dot = btn && btn.getChildByName("gfxDot");
    if (dot) dot.color = on ? new cc.Color(0xE8, 0xC2, 0x5A) : new cc.Color(0x5E, 0x6A, 0x76);
  }

  function inject(av) {
    var node = av && av.node;
    if (!node) return;
    var pop = node.getChildByName("Popup");
    if (!pop) return;
    // 面板配色：独立于 Graphics 行，成功一次后打标
    if (!node.__themeDone) {
      try { if (applyTheme(node)) node.__themeDone = 1; }
      catch (e) { LOG("配色失败", e && e.message); }
    }
    if (node.__gfxDone) return;
    var btns = pop.getChildByName("buttons");
    if (!btns) return;
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

    // 4) 克隆出第四行（复用 Music 行的样式）
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

    // 克隆体带着原按钮的 clickEvents（指向 OnMusicBtn），必须清掉
    var btn = gBtn.getComponent(cc.Button);
    if (btn) btn.clickEvents = [];

    // 5) 图标换成白色齿轮
    var iconNode = gBtn.getChildByName("Icon");
    if (iconNode) {
      var sp = iconNode.getComponent(cc.Sprite);
      var src = cc.find("Canvas/MainView/TopPanel/Setting/Icon");
      var ssf = src && src.getComponent(cc.Sprite) && src.getComponent(cc.Sprite).spriteFrame;
      if (sp && ssf) {
        if (!tinted) tinted = tint(ssf);
        if (tinted) sp.spriteFrame = tinted;
      }
    }

    // 6) 状态与点击
    var dotNode = new cc.Node("gfxDot");
    dotNode.parent = gBtn;
    dotNode.setPosition(27, -27);
    var dsp = dotNode.addComponent(cc.Sprite);
    var dfr = circleFrame();
    if (dfr) dsp.spriteFrame = dfr;
    dsp.sizeMode = cc.Sprite.SizeMode.CUSTOM;
    dotNode.setContentSize(16, 16);

    paint(gBtn, lb, mipOn());
    gBtn.on("click", function () {
      var next = !mipOn();
      setMip(next);
      paint(gBtn, lb, next);
      LOG("Graphics →", next ? "ON" : "OFF");
    });

    node.__gfxDone = 1;
    LOG("设置面板已加入 Graphics 项，当前", mipOn() ? "ON" : "OFF");
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
      P.__setR1 = true;
    }
    // 面板可能已经建好了
    var n = cc.find("Canvas/AudioView");
    if (n) {
      var av = n.getComponent("AudioView");
      if (av) inject(av);
    }
    return true;
  }

  var tries = 0;
  var timer = setInterval(function () {
    if (window.cc && cc.director && window.__require && patch()) clearInterval(timer);
    else if (++tries > 1200) clearInterval(timer);
  }, 50);
})();
