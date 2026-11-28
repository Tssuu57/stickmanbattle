/* ==========================================================================
   stickman-mipmap.r1.js  —— 纹理 mipmap 补丁（低配机专用画质修复）
   --------------------------------------------------------------------------
   问题：角色四肢贴图 111×464 显示成 15×60（缩小 4~5.5 倍），武器图集
         1024×1024 显示成 17×95（缩小 60 倍）。这些纹理全部只有双线性过滤
         （MIN_FILTER=9729），没有 mipmap。缩小时每个屏幕像素只从源图抓
         1 个点，跳着采样 → 边缘断点、粗细不匀、走动时闪烁。

   做法：对满足 2 的幂尺寸（POT）的纹理，补生成 mipmap 链并把缩小过滤
         切到 LINEAR_MIPMAP_LINEAR。WebGL1 下 NPOT 纹理不允许生成 mipmap，
         所以只能覆盖 POT 的那部分（角色头 256²、武器图集 1024² 等）。
         NPOT 的角色躯干/四肢已在资源侧重排为 128×512，同样进入覆盖范围。

   成本：显存约 +33%（仅对 POT 纹理），运行时零额外开销；缩小时读的
         是 1/4、1/16 的小图，纹理 cache 命中率上升、带宽下降。
         对低配机是净收益。

   关闭：在地址后加 ?mip=0
   ========================================================================== */
(function () {
  "use strict";

  var Q = (location.search || "");
  if (/[?&]mip=0(?:&|$)/.test(Q)) return;          // 手动关闭
  if (window.__MIP_INSTALLED) return;
  window.__MIP_INSTALLED = true;

  var LOG = function () {
    try { console.log.apply(console, ["[MIP]"].concat([].slice.call(arguments))); } catch (e) {}
  };

  var LINEAR = 9729;
  var LINEAR_MIPMAP_LINEAR = 9987;

  function isPOT(n) { return n > 0 && (n & (n - 1)) === 0; }

  function applyOne(tex, gl) {
    if (!tex || tex.__mipDone) return 0;
    var w = tex.width | 0, h = tex.height | 0;
    if (w < 32 || h < 32) return 0;                 // 太小的没意义
    if (!isPOT(w) || !isPOT(h)) return 0;           // WebGL1 下 NPOT 不能 mipmap
    var gt = tex._texture;
    if (!gt || !gt._glID) return 0;                 // 还没上传
    tex.__mipDone = 1;
    try {
      gl.bindTexture(gl.TEXTURE_2D, gt._glID);
      gl.hint(gl.GENERATE_MIPMAP_HINT, gl.NICEST);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, LINEAR);
      // 同步引擎侧缓存，避免后续 _setTexInfo 把参数改回去
      gt._minFilter = LINEAR_MIPMAP_LINEAR;
      gt._magFilter = LINEAR;
      gt._mipFilter = LINEAR_MIPMAP_LINEAR;
      gt._genMipmap = true;
      tex._minFilter = LINEAR_MIPMAP_LINEAR;
      tex._magFilter = LINEAR;
      tex._mipFilter = LINEAR_MIPMAP_LINEAR;
      tex._mipmaps = true;
      tex._genMipmaps = true;
      return 1;
    } catch (e) {
      return 0;
    }
  }

  var stat = { n: 0, gl: null };

  function sweep() {
    if (!window.cc || !cc.director || !cc.game) return 0;
    var gl = cc.game._renderContext;
    if (!gl || !gl.generateMipmap) return 0;
    var scene = cc.director.getScene();
    if (!scene) return 0;
    var added = 0;
    var stack = [scene];
    var guard = 0;
    while (stack.length && guard++ < 4000) {
      var n = stack.pop();
      var s = n.getComponent && n.getComponent(cc.Sprite);
      if (s && s.spriteFrame) {
        try {
          var t = s.spriteFrame.getTexture();
          if (t) added += applyOne(t, gl);
        } catch (e) {}
      }
      var ch = n.children;
      for (var i = 0; i < ch.length; i++) stack.push(ch[i]);
    }
    if (added) {
      stat.n += added;
      if (stat.n <= 24) LOG("+", added, "个纹理已开 mipmap，累计", stat.n);
    }
    return added;
  }

  function boot() {
    if (!window.cc || !cc.director || !cc.game) return false;
    if (window.__MIP_BOOTED) return true;
    window.__MIP_BOOTED = true;

    // 场景切换后补扫（角色/武器/UI 都是按场景动态创建的）
    try {
      cc.director.on(cc.Director.EVENT_AFTER_SCENE_LAUNCH, function () {
        setTimeout(sweep, 60);
        setTimeout(sweep, 400);
        setTimeout(sweep, 1200);
      });
    } catch (e) {}

    // 兜底轮询：进场、换页、换武器都可能晚于场景事件
    var t0 = Date.now(), iv = setInterval(function () {
      sweep();
      if (Date.now() - t0 > 45000) { clearInterval(iv); LOG("扫描结束，共", stat.n, "个纹理"); }
    }, 900);
    setTimeout(sweep, 500);
    LOG("已装载，POT 纹理将启用 mipmap（?mip=0 可关闭）");
    return true;
  }

  var tries = 0;
  var timer = setInterval(function () {
    if (boot()) clearInterval(timer);
    else if (++tries > 600) clearInterval(timer);
  }, 50);
})();
