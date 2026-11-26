// ================= 资源路径修正层 =================
// 主包与各补丁层里大量硬编码 "/assets/..." 绝对路径（HUD 图标、拾取提示、
// 道具贴图、场地元素、光环等）。站点部署在 /stickmanbattle/ 子目录时，
// 绝对路径会解析到域名根 -> 全部 404，表现为图标破图 / 空白。
// 这里统一把站内绝对路径改写为“基于当前页面”的地址，兼容：
//   - GitHub Pages 项目页  https://host/stickmanbattle/
//   - 本地 http://127.0.0.1:8899/
//   - 离线 file:///.../开始游戏.html
// 开关：?asset=0 关闭本层；控制台 __assetPathFix.report() 看修正记录。
(function () {
  if (window.__assetPathFix) return;
  var ON = !/[?&]asset=0(&|$)/.test(location.search);
  var F = (window.__assetPathFix = { on: ON, fixed: 0, log: [], misses: [] });

  // "/assets/x.png" -> "<页面目录>/assets/x.png"
  function fix(u) {
    if (!ON || typeof u !== "string" || !u) return u;
    if (u.charCodeAt(0) !== 47) return u;      // 相对路径 / http(s) / data: 不动
    if (u.charCodeAt(1) === 47) return u;      // //cdn 协议相对
    if (u.indexOf("/stickmanbattle/") === 0) return u; // 已经是正确前缀
    var out;
    try { out = new URL(u.slice(1), location.href).href; }
    catch (_) { out = u.slice(1); }
    F.fixed++;
    if (F.log.length < 60) F.log.push("  " + u + "\n    -> " + out);
    return out;
  }
  F.fix = fix;

  function fixVal(v) { return typeof v === "string" ? fix(v) : v; }

  // 字典型全局（__guideThumbs / __itemIcons）：整体赋值与逐项写入都要拦，
  // 因为游戏里既有 window.__guideThumbs={...}，也有 window.__itemIcons[5]="..."。
  function hookDict(name) {
    var store = {};
    var src = window[name];
    if (src && typeof src === "object") { for (var k in src) store[k] = fixVal(src[k]); }
    function wrap(t) {
      try {
        return new Proxy(t, {
          set: function (o, key, val) { o[key] = fixVal(val); return true; }
        });
      } catch (_) { return t; }
    }
    var cur = wrap(store);
    try {
      Object.defineProperty(window, name, {
        configurable: true,
        get: function () { return cur; },
        set: function (nv) {
          var s = {};
          if (nv && typeof nv === "object") { for (var k in nv) s[k] = fixVal(nv[k]); }
          cur = wrap(s);
        }
      });
    } catch (_) {
      // 老浏览器兜底：至少把现有值修一遍
      if (src && typeof src === "object") { for (var k2 in src) src[k2] = fixVal(src[k2]); }
    }
  }
  hookDict("__guideThumbs");
  hookDict("__itemIcons");

  // Cocos 侧：所有远程贴图都走 cc.assetManager.loadRemote
  function hookCC() {
    try {
      var am = window.cc && cc.assetManager;
      if (!am || typeof am.loadRemote !== "function") return false;
      if (am.loadRemote.__assetFix) return true;
      var orig = am.loadRemote;
      var wrapped = function (url) {
        var args = Array.prototype.slice.call(arguments);
        try {
          if (Array.isArray(url)) args[0] = url.map(fix);
          else args[0] = fix(url);
        } catch (_) {}
        return orig.apply(this, args);
      };
      wrapped.__assetFix = true;
      am.loadRemote = wrapped;
      return true;
    } catch (_) { return false; }
  }

  // 已经插进 DOM 的破图（例如本层加载前就渲染出来的提示条）
  function sweep() {
    var list;
    try { list = document.querySelectorAll('img[src^="/assets/"]'); } catch (_) { return 0; }
    for (var i = 0; i < list.length; i++) {
      try { list[i].src = fix(list[i].getAttribute("src")); } catch (_) {}
    }
    return list.length;
  }
  F.sweep = sweep;

  // 兜底样式：万一还有漏网图标，不要显示浏览器破图，直接留白
  try {
    var st = document.createElement("style");
    st.textContent = "img[data-asset-miss]{visibility:hidden}";
    (document.head || document.documentElement).appendChild(st);
  } catch (_) {}

  F.report = function () {
    var out = "[资产路径修正] 已修正 " + F.fixed + " 处" + (ON ? "" : "（已关闭）");
    if (F.log.length) out += "\n最近：\n" + F.log.slice(-8).join("\n");
    if (F.misses.length) out += "\n加载失败：\n  " + F.misses.slice(0, 12).join("\n  ");
    console.log(out);
    return out;
  };

  var tries = 0;
  var iv = setInterval(function () {
    tries++;
    hookCC();
    sweep();
    if (cc_ready() || tries > 400) clearInterval(iv);
  }, 100);
  function cc_ready() { try { return !!(window.cc && cc.assetManager && cc.assetManager.loadRemote.__assetFix); } catch (_) { return false; } }

  // 页面可见后低频巡检（游戏会不断重建提示条）
  document.addEventListener("visibilitychange", function () { if (!document.hidden) sweep(); });
})();
