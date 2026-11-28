(function () {
  "use strict";
  if (window.__subR1 && window.__subR1.on) return;
  if (/[?&]sub=0/.test(location.search)) { window.__subR1 = { on: 0 }; return; }

  var IMG = {"active_skill": "data:image/png;base64,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", "active_super": "data:image/png;base64,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", "attackBack": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGUAAABlCAYAAABUfC3PAAAD8UlEQVR42u2dvWvjQBDFX0RI5eDFhQnEIFIYXJiAq6vzl1+dKhBSBK4IAh8YF2GDxRWurliZCEeWVtJ+jOz3QCRFEkXzY2aetSvN1f7fBgOSKr6OAdxa/PwOwFfxvR7KRV4LBzAGMAUwKo6+yotjW8ASCepKWKakBYQJgJsA59sD+CwgZYTyE8SdgHhsJACKBUUBmAG4D5QRXTLoL4B1jBIXGooCMBeSFW2y509IOCGhLAE8YLj6APB2LlBSAAuhZapLWXv33XN8QlEAVo6srDTlAF58lTRfUFIAjzh/vfrIGh9Qns40O+qy5rdUKArArzPpHV16zbOrcpYQiBPdFNevpGTKpfSPYH0mIRDneiziEgUKgXgCkxCIPDBdoCgCaQVG+YZycFmUvVq7sqTDCW4Y50522QuUJwLpBebJNZQUl3XrxIdGto3fBgobe+DGbwNlxVg61aovFJatCGWsCcqCMfSiRVcoS7otr25s2RaKwrA3OQxBD6ea/ikoc8YsiOa2UBSGtS9ryLqrypYqKDPGKqhmNlDuGaegum+CktJxRXFiaR2UKWMURdM6KGzw8Rp+JZSUsYmqtAoKS5eQElaGMmFcompyDEXRdYlwYaoMZcyYiNC4DIX9RFBfOUDhQpYMjQhFMBTFWIiSShgDeUrovOQ5sAR2bwOiwumW5Uto+aIIhSIUQqEIhVAoQrlwKDuGQZR2Cb7f20vJ0BfLl9DypRkGUdKHTMkZCxHKy+6LUARC2TIeIrQtQ6EDE+K8ylA0zHsQqXjaH0xX2RJ/Mi5R9Vm2xGBfkdNPjqFkjEtUZVVQADMBgQqvzfEnerCEySldVVAyurAoriurgwKYCTtUOP2IdxWUNeMUVGsbKJoNP2iD1zZQADODivKvyjifgqJhZlBR/vSBE2tZdSuPb3RiXh3XyaFrTcvB74yfF9XGtQlKBi6AuVaOhltaNhsnXhhHp2qMpw0UDTM9h+qvV1hsVLHdYsQyFqBstYUCmLF5dGPd3Zb12MG2m/GeCaYTkOc2v9AWim57Aqr9/Mcu21bZ+B03dhdQDo2fYJqBdFpi77PBm2A8AOkLhWA8AAGAawf/RAazs+/Sh6g5G+rs6vkUfeF22emUbc6jd/NJXew8+rIuZYxt7/7hq6fU9ZnVmWZNDnO3V/v4474y5ThrFmdiAvYwC1Ret/iGgHLQEsMeKfWBmiXcoUIBzPsq5xjWoIMNzK4THeqEoaGU4cxgBrpILGt7mJ2La0R4ejoWlOOeMxWSPRuYzdZRHwuRAKUK0CRQBu1hnqCKDkIylOMSNy4gjRxZ67w4toVl1xIvXDKUU6BQwLJ5S+wO308+66Fc5H+97fLPUw2GRAAAAABJRU5ErkJggg==", "bg_shop_angle10": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAYAAADDPmHLAAADDElEQVR42u3aMU7rQBRG4YyVTdDSsQIKGiREh2AHlCwqJTsApUNIaSiygnRp3zLyqjzlGcczdsYwjr9TOUpkWfc/c+dO5DAbgNVysZshO7cPLyH3PYPQpy1DEPq0ZQhDBX9z9ySZjHx9vg0iQsgVvsDLEKKrBOHU8AVfnghdJAiCn7YIlfDPg6ZMUma10CV8wY+zG7R1gjBU+NvNWhIZuby6HkSCed/2Egu+6wMjb11v7p6Sjo4htvpTwxd8mSIcStDUBeZ9BgfB//5W0Kfuq+ViV5cgnLLvbzdrwRfQEWIZtM0DVd99X/jldITYwN2WZdWn9Qt/fBIc6/RVV2OEP04JjmVaKd20CV2OfbHV//H++md/ff/4fKG8+UitbSyj+rGwGuIBmz6jzNomC2DvP8+BsPJa13RZLRe7KmVSTFn99X3JDJCPrrVt6wL1jOdDPijKr61j4MQhAAFAABAABAABQAAQAAQAAUAAEAAEAAFAABAABAABQAAQAAQAAUAAEAAEAAFAABAABAABQAAQAAQAAUAAEAAEAAFAABAABAABQAAQAAQAAUAAEAAEAAFAABAABAABQAAQAAQAAUAAEAAEAAFAABAABAABQAAQAAQAAUAAEAAEAAFAABAABAABQAAQAN+Z57zZx/vrn/31/ePzhfKWX9v/OsDX51vjjy6vrmfbzTr5AZs+I0/4KbXdbtazy6vrxu/qGVe3Dy9BiafJ7cNLSJ4BUroAfp+21T/oEFjfl8wA+Riytv/a/2q52O2vb+6eshmGclb/4f6/3/odA/0PEJ8UzQLntfobBehyGiDBuAe/w6yrrsaQYHzht2X5bdUfDoOxgXD/AHsh8LPBp9S9Hn6908+b2kNdglgnIEJ5wcda/9EO0PVYqCOUG3zTsa/OPPVGqRLUOwLy0HVBxWa4aAfoMw+gDGL7frIATRIQYTzBpxzvo/8ENt0gtb2g7PCTOoBucJ7B9xLgmAREKCP4ruH3EqBNAkL8fOCnhN9bgC4iYHhOeasr2+tgZBhP6IMIQIbxhH7IX4ErgJ/CHIiSAAAAAElFTkSuQmCC", "btn_grey": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAALwAAADACAYAAAC+qQkRAAADWElEQVR4nO3aK1IrURRA0eaNiwEgkSgEAsGAEAgEColkAAzsKaogdDrd+UCn9lqOFH0Tsevk1K0MAwDA2bs4xaGPV5fXpziXlof3j7djn3m04EXOKR0r/oOCFzl/4ZD4/+37oNj5K4e0t3jCz3mz26fn170+DXzxcn93s+t/lk77RcFPxS5yTmkq/iXRzw5+W+xC5zdtC39u9LN2eLGzFtuam7vX75zwYwcJnTUYm/a7Jv3khBc7azbW4q5Jv+haUuyszdImtwbvnp1zNdXuaPBWGc7JktVm1kojdtZubqN7/7QAztGP4De/Ckx3zsVmq2NrjQlPiuBJ+Ra8dYZzt2utMeFJETwpgidF8KQInhTBkyJ4UgRPiuBJETwpgidF8KQInhTBkyJ4UgRPiuBJETwpgidF8KQInhTBkyJ4UgRPiuBJETwpgidF8KQInhTBkyJ4UgRPiuBJETwpgidF8KQInhTBkyJ4UgRPiuBJETwpgidF8KQInhTBkyJ4UgRPiuBJETwpgidF8KQInhTBkyJ4UgRPiuBJETwpgidF8KQInhTBkyJ4UgRPiuBJETwpgidF8KQInhTBkyJ4UgRPiuBJETwpgidF8KQInhTBkyJ4UgRPiuBJETwpgidF8KQInhTBkyJ4UgRPiuBJETwpgidF8KQInhTBkyJ4UgRPiuBJETwpgidF8KQInhTBkyJ4UgRPiuBJETwpgidF8KQInhTBkyJ4UgRPiuBJETwpgidF8KQInhTBkyJ4UgRPiuBJETwpgidF8KQInhTBkyJ4UgRPiuBJETwpgidF8KQInhTBkyJ4UgRPiuBJETwpgidF8KQInhTBkyJ4UgRPiuBJETwpgidF8KQInpRvwT+8f7x9/fvl/u7mVz8NHGiz2c2mTXhSBE/Kj+CtNZyrXevMMJjwxMwK3pRn7eY2Ohr82FeB6FmrsTbHGh6GiQm/7QFYu6l2F+3wpjxrs7TJyeCtNqzZklXm08Wcgx+vLq/HXr99en6d8zwc07ahO2cNn7XSbDvItOe3HRL7MMyc8J+2TfphMO05ranhuuSCZVHwwzAd/SfxcwxzNoilt4mLg/80J3w4lX2vzff+aYF7ev7KIe3tPeE3mfic0rEG7NGC/0r8HIMtAgBg1H+6osFoAJDlhQAAAABJRU5ErkJggg==", "skill_icon": "data:image/png;base64,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", "super": "data:image/png;base64,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"};

  // 九宫格边距（源图像素）
  var INS = {
    bg_shop_angle10: [40, 40, 40, 40],
    btn_grey: [26, 26, 26, 26]
  };

  var T = { made: 0, swapped: 0, recolored: 0, err: "" };
  window.__subR1 = {
    on: 1,
    report: function () {
      return { made: T.made, swapped: T.swapped, recolored: T.recolored, err: T.err };
    }
  };

  var cache = {};
  function img(name) {
    if (cache[name]) return cache[name];
    var o = cache[name] = { el: new Image(), done: false };
    o.el.onload = function () { o.done = true; };
    o.el.onerror = function () { T.err = "img:" + name; };
    o.el.src = IMG[name];
    return o;
  }
  for (var k in IMG) img(k);

  var NEWF = {};
  function buildFrame(nm) {
    var it = cache[nm];
    if (!it || !it.done || !it.el.width) return null;
    var el = it.el;
    try {
      var tex = new cc.Texture2D();
      tex.initWithElement(el);
      tex.handleLoadedTexture();
      var sf = new cc.SpriteFrame();
      sf.setTexture(tex);
      sf.setRect(cc.rect(0, 0, el.width, el.height));
      sf.setOriginalSize(cc.size(el.width, el.height));
      var ins = INS[nm];
      if (ins) {
        sf.insetLeft = ins[0]; sf.insetTop = ins[1];
        sf.insetRight = ins[2]; sf.insetBottom = ins[3];
      }
      sf.name = nm;
      T.made++;
      return sf;
    } catch (e) { T.err = "frame:" + nm; return null; }
  }

  function applySprite(sp) {
    var sf = sp.spriteFrame;
    if (!sf) return;
    var nm = sf.name || sf._name;
    if (!nm || !IMG[nm]) return;
    if (NEWF[nm] && sp.spriteFrame === NEWF[nm]) return;
    var nf = NEWF[nm];
    if (!nf) {
      nf = buildFrame(nm);
      if (!nf) return;
      NEWF[nm] = nf;
    }
    sp.spriteFrame = nf;
    if (INS[nm]) {
      sp.type = cc.Sprite.Type.SLICED;
      sp.sizeMode = cc.Sprite.SizeMode.CUSTOM;
    }
    T.swapped++;
  }

  // 面板滚动条：深蓝底 / 亮蓝滑块 -> 淡墨 / 深青
  var COL = [
    [[0x13, 0x4A, 0x8C], [0xDD, 0xD2, 0xB4]],
    [[0x58, 0xA6, 0xE3], [0x3E, 0x6E, 0x8E]]
  ];

  function eq(c, a) { return c && c.r === a[0] && c.g === a[1] && c.b === a[2]; }

  // 技能冷却遮罩别压得太黑，否则浅底上按钮变成灰饼
  function softenMask(n) {
    if (n.name !== "mask") return;
    var pn = n.parent && n.parent.name;
    if (!pn || !/^item\d/.test(pn)) return;
    if (n.opacity !== 108) n.opacity = 108;
  }

  // 技能按钮文字加纸白描边，深底浅底都认得出
  function labelOutline(n) {
    var lb = n.getComponent && n.getComponent(cc.Label);
    if (!lb) return;
    var pn = n.parent && n.parent.name;
    if (!pn || !/^item\d/.test(pn)) return;
    if (n.__subOutline) return;
    try {
      var ol = n.getComponent(cc.LabelOutline) || n.addComponent(cc.LabelOutline);
      ol.color = new cc.Color(0xFA, 0xF6, 0xE8);
      ol.width = 2;
      n.__subOutline = 1;
    } catch (e) { T.err = "outline:" + (e && e.message); }
  }

  function walk(n) {
    var sp = n.getComponent && n.getComponent(cc.Sprite);
    if (sp) applySprite(sp);
    softenMask(n);
    labelOutline(n);

    var c = n.color;
    if (c) {
      for (var i = 0; i < COL.length; i++) {
        if (eq(c, COL[i][0])) {
          var t = COL[i][1];
          n.color = new cc.Color(t[0], t[1], t[2]);
          T.recolored++;
          break;
        }
      }
    }
    var ch = n.children;
    for (var j = 0; j < ch.length; j++) walk(ch[j]);
  }

  // ---------- DOM 浮层（场地选择 / 图鉴 / 被动）改和风色 ----------
  // 这些面板是临时用内联样式拼出来的，只能按颜色值整体重映射
  var RGBMAP = {
    "37,100,170": "251,247,233",   // 面板底 #2564aa -> 纸白
    "29,112,183": "241,234,212",   // 格子底 #1d70b7 -> 淡纸
    "47,134,208": "230,218,184",   // 选中格 #2f86d0
    "88,166,227": "207,194,162",   // 格子边框 #58a6e3
    "26,79,140":  "192,180,154",   // 面板边框 #1a4f8c
    "255,207,74": "201,162,39",    // 金高亮 #ffcf4a
    "255,213,79": "192,90,74",     // 金渐变上 -> 茜红
    "255,167,38": "160,70,58",     // 金渐变下 -> 深茜红
    "93,58,20":   "250,246,232",   // 主按钮字/边 -> 纸白
    "255,255,255": "46,58,52",     // 正文白 -> 墨绿
    "207,228,255": "123,131,120",  // 提示淡蓝 -> 灰绿
    "170,179,199": "150,158,146",  // 次要文字
    "27,27,27":   "46,58,52",      // 选中态黑字
    "180,185,194": "232,223,198",  // 灰按钮上 #b4b9c2
    "138,144,155": "207,196,168",  // 灰按钮下 #8a909b
    "74,79,88":   "176,164,136",   // 灰按钮边框 #4a4f58
    "20,26,40":   "192,90,74",     // 预选场地按钮底 -> 茜红
    "255,224,138": "250,246,232",  // 其文字 -> 纸白
    "246,247,251": "46,58,52"      // 亮白文字
  };

  function mapRgbStr(m) {
    var nums = m.match(/[\d.]+/g);
    if (!nums || nums.length < 3) return m;
    var rep = RGBMAP[nums[0] + "," + nums[1] + "," + nums[2]];
    if (!rep) return m;
    return nums.length > 3
      ? "rgba(" + rep + "," + nums[3] + ")"
      : "rgb(" + rep + ")";
  }

  function mapHex(m, h) {
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var r = parseInt(h.slice(0, 2), 16),
        g = parseInt(h.slice(2, 4), 16),
        b = parseInt(h.slice(4, 6), 16);
    var rep = RGBMAP[r + "," + g + "," + b];
    return rep ? "rgb(" + rep + ")" : m;
  }

  function mapStyle(s) {
    if (!s || (s.indexOf("#") < 0 && s.indexOf("rgb") < 0)) return s;
    return s.replace(/rgba?\([^)]*\)/g, mapRgbStr)
            .replace(/#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g, mapHex);
  }

  function themeTree(el) {
    if (!el || el.nodeType !== 1) return;
    if (el.__subT) return;
    el.__subT = 1;
    var t = el.getAttribute && el.getAttribute("style");
    if (t) {
      var nt = mapStyle(t);
      if (nt !== t) el.setAttribute("style", nt);
    }
    var kids = el.children;
    for (var i = 0; i < kids.length; i++) themeTree(kids[i]);
  }

  var SKIP_ID = /^(__juice|__guide|__slowTip|__themeCss|__subCss|__waCss)/;

  function domScan() {
    var kids = document.body && document.body.children;
    if (!kids) return;
    for (var i = 0; i < kids.length; i++) {
      var el = kids[i];
      if (el.nodeType !== 1 || el.tagName !== "DIV") continue;
      if (el.id && SKIP_ID.test(el.id)) continue;
      var cs;
      try { cs = getComputedStyle(el); } catch (e) { continue; }
      if (cs.position !== "fixed") continue;
      var z = parseInt(cs.zIndex, 10) || 0;
      if (z < 10000) continue;
      themeTree(el);
    }
    // 左上角「预选场地」胶囊
    if (btnPick && !btnPick.__subT) {
      btnPick.__subT = 1;
      btnPick.style.cssText = mapStyle(btnPick.style.cssText);
    }
  }

  var btnPick = null;
  function findPickBtn() {
    var kids = document.body.children;
    for (var i = 0; i < kids.length; i++) {
      var el = kids[i];
      if (el.nodeType === 1 && el.tagName === "DIV" && !el.id &&
          /预选场地/.test(el.textContent || "") &&
          /position:\s*fixed/.test(el.getAttribute("style") || "")) {
        btnPick = el;
        el.__subT = 0;
        return;
      }
    }
  }

  setInterval(function () { findPickBtn(); domScan(); }, 700);

  function tick() {
    if (!window.cc || !cc.director) return;
    var sc = cc.director.getScene();
    if (!sc) return;
    try { walk(sc); } catch (e) { T.err = "walk:" + (e && e.message); }
  }
  setInterval(tick, 160);
  setTimeout(tick, 700);
})();
