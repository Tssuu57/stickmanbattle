// ================= 音效增强层 =================
// 原包音效问题：命中类音效比 BGM 低 12~15dB（sword2 -25dB / harp -27dB vs battle -12.5dB），
// 基本被音乐盖死；且命中声 0.98s 太长、无低频、无随机化、无并发控制。
// 本层做五件事：
//   1 音量重平衡：按感知响度逐条补偿，音乐降到合理位，重击时侧链避让
//   2 命中合成层：低频冲击 + 瞬态 + 中频实体，按伤害分档，与顿帧/震屏对齐
//   3 补缺失音：跳跃起跳气流、落地闷响、击杀下坠、连击升调
//   4 混音卫生：同类限流、并发上限、软限幅、尾部收束，混战不糊
//   5 立体声定位 + 音高随机，消除机械重复
// 不改 Cocos 打包产物；WebAudio 不可用时自动回退原逻辑。
(function () {
  "use strict";
  if (window.__audio) return;
  if (/[?&]audio=0/.test(location.search)) return;

  var A = {
    v: "audio-r1", on: true, ready: false, loading: false,
    ctx: null, master: null, limiter: null,
    clips: {}, bufs: {}, playing: 0, maxVoice: 24,
    last: {}, lastHitX: 0,
    stats: { play: {}, synth: 0, skip: 0, drop: 0, land: 0, swing: 0, combo: 0 },
    combo: 0, comboAt: 0, lastChime: 0, userOn: true, musicName: "", duckUntil: 0, internal: false
  };
  window.__audio = A;

  function log() {
    try {
      (window.__logs || (window.__logs = [])).push("[audio] " + [].slice.call(arguments).join(" "));
      if (window.__logs.length > 300) window.__logs.shift();
    } catch (_) {}
  }

  // ---------------- 配置 ----------------
  var CFG = {
    master: 0.85,
    // g=增益补偿  jit=音高随机  gap=同类最小间隔ms  cut=尾部收束(s)  pan=是否定位
    fx: {
      sword2:    { g: 1.65, jit: 0.09, gap: 36,  cut: 0.50, pan: 1 },
      inhit:     { g: 1.6, jit: 0.06, gap: 48,  pan: 1 },
      click:     { g: 3.2, jit: 0.02, gap: 22 },
      jump:      { g: 2.8, jit: 0.07, gap: 150, cut: 0.30 },
      item:      { g: 1.6, jit: 0.05, gap: 70 },
      harp:      { g: 4.6, jit: 0.05, gap: 60,  cut: 1.00, pan: 1 },
      skill:     { g: 1.45, jit: 0.04, gap: 100 },
      scepter:   { g: 1.3, jit: 0.04, gap: 80,  pan: 1 },
      explosion: { g: 1.1, jit: 0.03, gap: 110, pan: 1 },
      guitar:    { g: 1.55, jit: 0.04, gap: 100, pan: 1 },
      finish:    { g: 1.05, jit: 0,    gap: 300 },
      battle:    { g: 1.0,  jit: 0,    gap: 0 },
      bgm:       { g: 1.0,  jit: 0,    gap: 0 }
    },
    music: { battle: 0.30, bgm: 0.40 },     // 原统一 0.5，把音效压死
    duck: { hold: 0.45, ms: 180 },          // 重击时 BGM 瞬降
    hit: {                                  // 打击合成层（频段按手机外放可播范围调）
      thumpGain: 0.52, thumpF0: 195, thumpF1: 82,
      crackGain: 0.26, bodyGain: 0.20,
      light: 0.55, mid: 0.8, heavy: 1.0, kill: 1.3
    },
    combo: { window: 1150, from: 3, gain: 0.075 },
    swing: { enabled: false, threshold: 900, gap: 150 }
  };

  // ---------------- 音频上下文 ----------------
  function ensureCtx() {
    if (A.ctx) {
      if (A.ctx.state === "suspended" && A.ctx.resume) A.ctx.resume();
      return A.ctx;
    }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { A.ctx = new AC(); } catch (e) { log("ctx fail " + e.message); return null; }
    var ctx = A.ctx;
    A.master = ctx.createGain();
    A.master.gain.value = CFG.master;
    A.limiter = ctx.createDynamicsCompressor();
    A.limiter.threshold.value = -3;
    A.limiter.knee.value = 0;
    A.limiter.ratio.value = 20;
    A.limiter.attack.value = 0.001;
    A.limiter.release.value = 0.14;
    // 软饱和：连击叠加时不会硬削，同时给打击加一点谐波厚度
    var shaper = ctx.createWaveShaper();
    var n = 2048, curve = new Float32Array(n);
    for (var i = 0; i < n; i++) {
      var x = (i * 2) / n - 1;
      var a = Math.abs(x), sg = x < 0 ? -1 : 1;
      // 0.7 以下完全线性，之上软膝压缩，端点硬限 0.995 防削波
      var y = a <= 0.7 ? a : 0.7 + 0.3 * Math.tanh(((a - 0.7) / 0.3) * 2);
      curve[i] = sg * Math.min(0.995, y);
    }
    shaper.curve = curve;
    shaper.oversample = "2x";
    A.shaper = shaper;
    A.master.connect(A.limiter);
    A.limiter.connect(shaper);
    shaper.connect(ctx.destination);
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  function unlock() { var c = ensureCtx(); if (c && c.state === "suspended") c.resume(); }
  ["pointerdown", "touchstart", "mousedown", "keydown"].forEach(function (ev) {
    window.addEventListener(ev, unlock, { passive: true });
  });

  // ---------------- 资源 ----------------
  var PATH = {
    click: "MenuAudios/click", bgm: "MenuAudios/bgm",
    finish: "audios/finish", jump: "audios/jump", item: "audios/item",
    explosion: "audios/explosion", sword2: "audios/sword2", guitar: "audios/guitar",
    scepter: "audios/scepter", inhit: "audios/inhit", harp: "audios/harp",
    battle: "audios/battle", skill: "audios/skill"
  };

  function bundle() {
    try { return cc.assetManager && cc.assetManager.getBundle("res"); } catch (_) { return null; }
  }

  function registerClip(clip, forceName) {
    if (!clip) return;
    var name = forceName || clip.name;
    if (!name) return;
    A.clips[name] = clip;
    var na = clip._nativeAsset;
    if (na && typeof AudioBuffer !== "undefined" && na instanceof AudioBuffer) {
      A.bufs[name] = na;
    } else if (na && typeof na === "string") {
      decodeUrl(name, na);
    } else if (na && na.src) {
      decodeUrl(name, na.src);
    }
  }

  function decodeUrl(name, url) {
    var ctx = ensureCtx(); if (!ctx) return;
    try {
      fetch(url).then(function (r) { return r.arrayBuffer(); })
        .then(function (ab) { return ctx.decodeAudioData(ab); })
        .then(function (buf) { if (!A.bufs[name]) A.bufs[name] = buf; })
        .catch(function () {});
    } catch (_) {}
  }

  function preload() {
    if (A.ready || A.loading) return A.ready;
    var b = bundle();
    if (!b) return false;
    A.loading = true;
    var dirs = ["audios", "MenuAudios"], left = dirs.length;
    dirs.forEach(function (d) {
      try {
        b.loadDir(d, cc.AudioClip, function (err, arr) {
          if (!err && arr) arr.forEach(function (c) { registerClip(c); });
          if (--left === 0) {
            A.ready = true; A.loading = false;
            log("预载完成 clips=" + Object.keys(A.clips).length + " bufs=" + Object.keys(A.bufs).length);
          }
        });
      } catch (e) {
        if (--left === 0) { A.ready = true; A.loading = false; }
      }
    });
    return A.ready;
  }

  function loadOne(name, cb) {
    if (A.clips[name]) { registerClip(A.clips[name], name); return cb && cb(A.clips[name]); }
    var b = bundle(), p = PATH[name];
    if (!b || !p) return cb && cb(null);
    try {
      b.load(p, cc.AudioClip, function (err, c) {
        if (!err && c) { registerClip(c, name); cb && cb(c); }
        else cb && cb(null);
      });
    } catch (_) { cb && cb(null); }
  }

  // ---------------- 播放 ----------------
  function panFor(x) {
    if (typeof x !== "number" || !isFinite(x)) return 0;
    return Math.max(-0.45, Math.min(0.45, (x / 700) * 0.45));
  }

  function tail(g, t0, cut, gainVal) {
    g.gain.setValueAtTime(gainVal, t0 + cut);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + cut + 0.09);
  }

  // 原生回退：WebAudio 不可用 / buffer 异常时，仍能出声（音量 ≤1）
  function legacy(name, gain) {
    try {
      var clip = A.clips[name];
      if (clip && cc.audioEngine) cc.audioEngine.playEffect(clip, false, Math.min(1, gain || 1));
    } catch (_) {}
  }

  function playBuf(name, opt) {
    opt = opt || {};
    if (!A.on) return false;
    var ctx = ensureCtx(); if (!ctx) { legacy(name, 1); return false; }
    if (ctx.state !== "running") { try { ctx.resume(); } catch (_) {} return false; }
    var buf = A.bufs[name];
    if (!buf) {
      if (!opt._retry) loadOne(name, function () {
        if (A.bufs[name]) { var o = {}; for (var k in opt) o[k] = opt[k]; o._retry = 1; playBuf(name, o); }
        else legacy(name, 0.9);
      });
      return false;
    }
    var cfg = CFG.fx[name] || { g: 1, jit: 0.03, gap: 45 };
    var now = Date.now();
    if (cfg.gap && A.last[name] && now - A.last[name] < cfg.gap) { A.stats.skip++; return true; }
    if (A.playing >= A.maxVoice) { A.stats.drop++; return false; }
    A.last[name] = now;

    var t0 = ctx.currentTime + 0.002;
    var rate = 1 + (Math.random() * 2 - 1) * (cfg.jit || 0);
    var gainVal = (opt.gain || 1) * (cfg.g || 1);
    var src = ctx.createBufferSource();
    try { src.buffer = buf; } catch (_) { legacy(name, 0.9); return false; }
    if (src.playbackRate) src.playbackRate.value = rate;
    var g = ctx.createGain();
    g.gain.setValueAtTime(gainVal, t0);
    src.connect(g);

    var outNode = g;
    if (cfg.pan && ctx.createStereoPanner) {
      var p = ctx.createStereoPanner();
      p.pan.value = opt.pan != null ? opt.pan : panFor(opt.x != null ? opt.x : A.lastHitX);
      g.connect(p); outNode = p;
    }
    outNode.connect(A.master);

    var dur = buf.duration / rate;
    var cut = opt.cut || cfg.cut;
    var stopAt = t0 + dur;
    if (cut && dur > cut + 0.12) {
      tail(g, t0, cut, gainVal);
      stopAt = t0 + cut + 0.11;
    }

    A.playing++;
    src.onended = function () {
      A.playing = Math.max(0, A.playing - 1);
      try { src.disconnect(); g.disconnect(); if (outNode !== g) outNode.disconnect(); } catch (_) {}
    };
    try { src.start(t0); src.stop(stopAt + 0.02); }
    catch (_) { A.playing = Math.max(0, A.playing - 1); return false; }

    A.stats.play[name] = (A.stats.play[name] || 0) + 1;
    return true;
  }

  // ---------------- 合成音色 ----------------
  var noiseBuf = null;
  function noise(ctx) {
    if (noiseBuf && noiseBuf.sampleRate === ctx.sampleRate) return noiseBuf;
    var len = Math.floor(ctx.sampleRate * 0.5);
    var b = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = b.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    noiseBuf = b;
    return b;
  }

  // 合成音专用：未解锁时直接放弃，避免 resume 后一次性爆发
  function sctx() {
    var c = ensureCtx();
    if (!c || c.state !== "running") return null;
    return c;
  }

  function route(ctx, g, x) {
    var out = g;
    if (ctx.createStereoPanner) {
      var p = ctx.createStereoPanner();
      p.pan.value = panFor(x);
      g.connect(p); out = p;
    }
    out.connect(A.master);
    return out;
  }

  // 低频冲击 = 重量
  function thump(str, x) {
    var ctx = sctx(); if (!ctx) return;
    var t = ctx.currentTime + 0.001;
    var o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(CFG.hit.thumpF0 - 30 * str, t);
    o.frequency.exponentialRampToValueAtTime(CFG.hit.thumpF1, t + 0.12);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(CFG.hit.thumpGain * str, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15 + 0.06 * str);
    o.connect(g); route(ctx, g, x);
    o.start(t); o.stop(t + 0.30);
    A.stats.synth++;
  }

  // 瞬态噪声 = 锐度
  function crack(str, x) {
    var ctx = sctx(); if (!ctx) return;
    var t = ctx.currentTime + 0.001;
    var s = ctx.createBufferSource(); s.buffer = noise(ctx);
    var hp = ctx.createBiquadFilter();
    hp.type = "highpass"; hp.frequency.value = 1700 + 900 * str;
    var g = ctx.createGain();
    g.gain.setValueAtTime(CFG.hit.crackGain * str, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.055);
    s.connect(hp); hp.connect(g); route(ctx, g, x);
    s.start(t); s.stop(t + 0.07);
  }

  // 中频实体 = 实在感
  function bodyHit(str, x) {
    var ctx = sctx(); if (!ctx) return;
    var t = ctx.currentTime + 0.001;
    var o = ctx.createOscillator();
    o.type = "triangle";
    o.frequency.setValueAtTime(300 - 50 * str, t);
    o.frequency.exponentialRampToValueAtTime(185, t + 0.055);
    var g = ctx.createGain();
    g.gain.setValueAtTime(CFG.hit.bodyGain * str, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.085);
    o.connect(g); route(ctx, g, x);
    o.start(t); o.stop(t + 0.10);
  }

  function onHit(dmg, x, kill) {
    if (!A.on) return;
    var d = Math.min(Math.max(dmg || 1, 1), 120);
    var str = kill ? CFG.hit.kill : d >= 25 ? CFG.hit.heavy : d >= 12 ? CFG.hit.mid : CFG.hit.light;
    str *= 0.9 + Math.min(d / 60, 1) * 0.2;
    thump(str, x);
    crack(str * 0.9, x);
    bodyHit(str * 0.7, x);
    if (str >= CFG.hit.heavy) duckMusic();
    if (kill) deathTone(x);

    var now = Date.now();
    if (now - A.comboAt < CFG.combo.window) A.combo++; else A.combo = 1;
    A.comboAt = now;
    // 每 3 连击响一次，避免连续叮叮声盖住打击本体
    if (A.combo >= CFG.combo.from && (A.combo - CFG.combo.from) % 3 === 0 && now - A.lastChime > 280) {
      A.lastChime = now;
      comboChime(A.combo, x);
    }
  }

  function comboChime(n, x) {
    var ctx = sctx(); if (!ctx) return;
    var t = ctx.currentTime + 0.001;
    var semi = Math.min((n - CFG.combo.from) * 2, 24);
    var o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(880 * Math.pow(2, semi / 12), t);
    var g = ctx.createGain();
    var v = CFG.combo.gain * Math.min(1 + (n - CFG.combo.from) * 0.15, 2.2);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.20);
    o.connect(g); route(ctx, g, x);
    o.start(t); o.stop(t + 0.22);
    A.stats.combo++;
  }

  function deathTone(x) {
    var ctx = sctx(); if (!ctx) return;
    var t = ctx.currentTime + 0.02;
    var o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(300, t);
    o.frequency.exponentialRampToValueAtTime(48, t + 0.38);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    o.connect(g); route(ctx, g, x);
    o.start(t); o.stop(t + 0.5);
  }

  function landTone(power, x) {
    if (!A.on) return;
    var ctx = sctx(); if (!ctx) return;
    var t = ctx.currentTime + 0.001;
    var p = Math.max(0.25, Math.min(power, 1));
    var o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(52, t + 0.09);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.23 * p, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    o.connect(g); route(ctx, g, x);
    o.start(t); o.stop(t + 0.14);

    var s = ctx.createBufferSource(); s.buffer = noise(ctx);
    var bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 900; bp.Q.value = 0.7;
    var ng = ctx.createGain();
    ng.gain.setValueAtTime(0.09 * p, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.10);
    s.connect(bp); bp.connect(ng); ng.connect(A.master);
    s.start(t); s.stop(t + 0.12);
    A.stats.land++;
  }

  function whoosh(power, x) {
    if (!A.on) return;
    var ctx = sctx(); if (!ctx) return;
    var t = ctx.currentTime + 0.001;
    var s = ctx.createBufferSource(); s.buffer = noise(ctx);
    var bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.Q.value = 1.1;
    bp.frequency.setValueAtTime(520, t);
    bp.frequency.exponentialRampToValueAtTime(2600, t + 0.07);
    bp.frequency.exponentialRampToValueAtTime(700, t + 0.16);
    var g = ctx.createGain();
    var v = 0.15 * Math.max(0.3, Math.min(power, 1));
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.035);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.17);
    s.connect(bp); bp.connect(g); route(ctx, g, x);
    s.start(t); s.stop(t + 0.19);
    A.stats.swing++;
  }

  // ---------------- 音乐 ----------------
  function musicBase(name) {
    name = name || A.musicName;
    return CFG.music[name] != null ? CFG.music[name] : 0.40;
  }

  function applyMusic(v) {
    try {
      A.internal = true;
      cc.audioEngine.setMusicVolume(Math.max(0, Math.min(1, v)));
    } catch (_) {}
    A.internal = false;
  }

  function duckMusic() {
    if (!A.musicName || !A.userOn) return;
    var now = Date.now();
    if (now < A.duckUntil - CFG.duck.ms + 70) return;
    A.duckUntil = now + CFG.duck.ms;
    applyMusic(musicBase() * (1 - CFG.duck.hold));
    setTimeout(function () {
      if (Date.now() >= A.duckUntil - 10) applyMusic(A.userOn ? musicBase() : 0);
    }, CFG.duck.ms + 30);
  }

  // ---------------- Hook ----------------
  function hookAudioManager() {
    // 打包后类名被混淆（getClassByName 拿不到），必须走模块引用
    var mod = null;
    try { mod = window.__require && window.__require("AudioManager"); } catch (_) {}
    var AM = mod && (mod.default || mod.AudioManager);
    if (!AM) { try { AM = cc.js.getClassByName("AudioManager"); } catch (_) {} }
    if (!AM || !AM.prototype) return false;
    var P = AM.prototype;
    if (P.__audioHook) { A.amInst = A.amInst || (mod && mod.audioManager) || null; return true; }

    P.playEffect = function (name) {
      try {
        if (!A.on) return;
        if (name === "sword2") { playBuf(name, { x: A.lastHitX }); return; }
        if (name === "inhit") { playBuf(name, { gain: 0.7, x: A.lastHitX }); return; }
        if (name === "click" || name === "finish" || name === "item" || name === "jump") { playBuf(name); return; }
        if (name === "skill" || name === "scepter" || name === "guitar") {
          whoosh(0.85, A.lastHitX);
        }
        playBuf(name, { x: A.lastHitX });
      } catch (e) { log("playEffect " + (e && e.message)); }
    };
    P.__audioHook = true;

    P.playMusic = function (name) {
      A.musicName = name;
      log("playMusic " + name);
      var start = function (clip) {
        if (!clip) return;
        try { cc.audioEngine.stopMusic(); } catch (_) {}
        try { cc.audioEngine.playMusic(clip, true); } catch (e) { log("music " + e.message); }
        applyMusic(A.userOn ? musicBase(name) : 0);
      };
      if (A.clips[name]) start(A.clips[name]);
      else if (this._audios && this._audios.get && this._audios.get(name)) start(this._audios.get(name));
      else loadOne(name, start);
    };

    P.setAudioVolume = function (v) {
      A.userOn = !(typeof v === "number" && v <= 0.001);
      A.on = A.userOn;
      applyMusic(A.userOn ? musicBase() : 0);
    };
    P.setEffectVolume = function (v) {
      A.userOn = !(typeof v === "number" && v <= 0.001);
      A.on = A.userOn;
      applyMusic(A.userOn ? musicBase() : 0);
    };
    log("AudioManager 已接管");
    return true;
  }

  // 引擎层音乐拦截：防止 AudioManager 之外直接调 playMusic 漏掉接管
  function hookEngineMusic() {
    try {
      var e = cc.audioEngine;
      if (!e || e.__audioMusicHook) return;
      var op = e.playMusic, os = e.stopMusic;
      e.playMusic = function (clip) {
        try { if (clip && clip.name) A.musicName = clip.name; } catch (_) {}
        var r = op.apply(e, arguments);
        applyMusic(A.userOn ? musicBase() : 0);
        return r;
      };
      e.stopMusic = function () {
        A.musicName = "";
        return os.apply(e, arguments);
      };
      e.__audioMusicHook = true;
    } catch (_) {}
  }

  // 外部直接改音乐音量时映射到本层基准，避免被拉回 0.5
  function patchEngineVolume() {
    try {
      var e = cc.audioEngine;
      if (!e || e.__audioVolHook) return;
      var orig = e.setMusicVolume;
      e.setMusicVolume = function (v) {
        if (A.internal) return orig.call(e, v);
        if (typeof v === "number" && v <= 0.001) { A.userOn = false; return orig.call(e, 0); }
        if (A.userOn) A.userOn = true;
        return orig.call(e, A.musicName ? musicBase() : Math.min(v || 0, 0.5));
      };
      e.setMusicVolume.__audioVolHook = true;
    } catch (_) {}
  }

  // 受击：伤害 / 位置 / 击杀
  function hookHuman() {
    if (A.dmgHooked) return true;
    var M = null;
    try { M = window.__require && window.__require("HumanController"); } catch (_) {}
    var P = M && M.default && M.default.prototype;
    if (!P || !P.setDamage) return false;
    if (P.setDamage.__audioHook) { A.dmgHooked = true; return true; }
    var prev = P.setDamage;
    var wrapped = function (dmg) {
      var before = this && typeof this.hp === "number" ? this.hp : 0;
      if (this && this.node) A.lastHitX = this.node.x;
      var ret = prev.apply(this, arguments);
      try {
        var after = this && typeof this.hp === "number" ? this.hp : 0;
        var real = before - after;
        if (real > 0.5 && this.node && this.node.isValid) {
          onHit(real, this.node.x, after <= 0 && before > 0);
        }
      } catch (e) { log("hook " + (e && e.message)); }
      return ret;
    };
    for (var k in prev) { try { wrapped[k] = prev[k]; } catch (_) {} }
    wrapped.__audioHook = true;
    P.setDamage = wrapped;
    A.dmgHooked = true;
    log("受击钩子就绪");
    return true;
  }

  // 落地：Human.lateUpdate 里 _bodyState 由 Air 回 Ground
  var landedAt = 0;
  function hookHumanMotion() {
    if (A.motionHooked) return true;
    var M = null;
    try { M = window.__require && window.__require("Human"); } catch (_) {}
    var P = M && M.default && M.default.prototype;
    if (!P || !P.lateUpdate) return false;
    if (P.lateUpdate.__audioMotion) { A.motionHooked = true; return true; }
    var prev = P.lateUpdate;
    var wrapped = function () {
      var ret = prev.apply(this, arguments);
      try {
        var st = this._bodyState;
        var pv = this.__audioBodyState;
        this.__audioBodyState = st;
        if (pv === 1 && st === 0 && this.node && this.node.isValid) {
          var now = Date.now();
          if (now - landedAt > 90) {
            landedAt = now;
            var rb = this._BodyrigidBody;
            var vy = rb && rb.linearVelocity ? Math.abs(rb.linearVelocity.y) : 600;
            landTone(Math.min(1, vy / 900) + 0.2, this.node.x);
          }
        }
      } catch (_) {}
      return ret;
    };
    for (var k in prev) { try { wrapped[k] = prev[k]; } catch (_) {} }
    wrapped.__audioMotion = true;
    P.lateUpdate = wrapped;
    A.motionHooked = true;
    log("落地检测就绪");
    return true;
  }

  // 挥击检测（默认关闭：待机摆臂会误报，改为技能起手风声）
  var swingAt = 0;
  function tickSwing() {
    if (!CFG.swing.enabled) return;
    if (!A.on) return;
    var gm = null;
    try {
      var c = cc.find("Canvas");
      gm = c && c.getComponent("Games");
    } catch (_) {}
    if (!gm || !gm.player || !gm.player.isValid) return;
    var h = null;
    try { h = gm.player.getComponent("Human") || gm.player.getComponent("HumanController"); } catch (_) {}
    if (!h || !h.node) return;
    var hand = null;
    try { hand = h.node.getChildByName("handR"); } catch (_) {}
    if (!hand) return;
    var rb = null;
    try { rb = hand.getComponent(cc.RigidBody); } catch (_) {}
    if (!rb || rb.angularVelocity == null) return;
    var av = Math.abs(rb.angularVelocity);
    var prev = h.__audioHandAV;
    h.__audioHandAV = av;
    if (prev != null && prev < CFG.swing.threshold && av > CFG.swing.threshold * 1.8) {
      var now = Date.now();
      if (now - swingAt > CFG.swing.gap) {
        swingAt = now;
        whoosh(Math.min(1, av / 1400), h.node.x);
      }
    }
  }

  // ---------------- 战斗 BGM ----------------
  // 原包只留了 battle.mp3 却没有调用点（战斗全程静音），这里补上循环播放
  var bgmTickAt = 0;
  function bgmTick() {
    if (!A.ready || !A.bufs.battle) return;
    var now = Date.now();
    if (now - bgmTickAt < 700) return;
    bgmTickAt = now;
    var inBattle = false;
    try {
      var mv = cc.find("Canvas/MainView");
      var gm = cc.find("Canvas").getComponent("Games");
      inBattle = !!(mv && mv.activeInHierarchy && gm && gm.player && gm.player.isValid);
    } catch (_) {}
    if (inBattle) {
      if (A.musicName !== "battle") {
        try {
          if (!A.on || !A.userOn) return;
          cc.audioEngine.stopMusic();
          cc.audioEngine.playMusic(A.clips.battle, true);
          A.musicName = "battle";
          applyMusic(CFG.music.battle);
          log("战斗 BGM 启动");
        } catch (_) {}
      }
    } else if (A.musicName === "battle") {
      try { cc.audioEngine.stopMusic(); } catch (_) {}
      A.musicName = "";
    }
  }

  // ---------------- 启动 ----------------
  function readUserAudio() {
    try {
      var M = window.__require && window.__require("UserProfile");
      var up = M && (M.userProfile || (M.default && M.default.instance));
      var v = up && up.data && up.data.audioNumber;
      if (typeof v === "number" && v <= 0.001) { A.on = false; A.userOn = false; }
    } catch (_) {}
  }

  function boot() {
    readUserAudio();
    var tries = 0;
    var iv = setInterval(function () {
      tries++;
      var hooked = hookAudioManager();
      preload();
      patchEngineVolume();
      hookEngineMusic();
      hookHuman();
      hookHumanMotion();
      if (hooked && A.ready) {
        clearInterval(iv);
        setInterval(tickSwing, 60);
        setInterval(bgmTick, 900);
        // 进场时若音乐已在播但没经过本层，补一次音量校准
        try {
          if (!A.musicName && A.ctx) {
            var mv = cc.audioEngine.getMusicVolume();
            if (mv > 0.001) A.musicName = "bgm";
          }
          if (A.musicName) applyMusic(A.userOn ? musicBase() : 0);
        } catch (_) {}
        log("音效层就绪");
      }
      if (tries > 600) clearInterval(iv);
    }, 120);
  }

  A.play = function (n) { return playBuf(n); };
  A.hit = onHit;
  A.land = landTone;
  A.status = function () {
    return {
      ready: A.ready, clips: Object.keys(A.clips), bufs: Object.keys(A.bufs),
      playing: A.playing, stats: JSON.parse(JSON.stringify(A.stats)),
      music: A.musicName, userOn: A.userOn, ctx: A.ctx ? A.ctx.state : null
    };
  };

  if (typeof cc !== "undefined" && cc.director) boot();
  else {
    var t = 0;
    var iv2 = setInterval(function () {
      if (typeof cc !== "undefined" && cc.director) { clearInterval(iv2); boot(); }
      else if (++t > 400) clearInterval(iv2);
    }, 100);
  }
})();
