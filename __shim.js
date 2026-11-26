/* =========================================================================
 * Stickman Battle 离线运行中间层
 * 作用：拦截浏览器对 /assets/** 等资源的请求，改从内联数据包 (window.__PK) 读取，
 *      从而绕开 file:// 协议下 XHR 被禁止、WebGL 纹理被判定跨源的限制。
 * 必须在游戏任何脚本之前加载。
 * ========================================================================= */
(function () {
  'use strict';

  var PK = window.__PK || { files: {} };
  var FILES = PK.files || {};

  // basename 索引（兜底匹配用）
  var byBase = {};
  for (var k in FILES) {
    if (!Object.prototype.hasOwnProperty.call(FILES, k)) continue;
    var b = k.split('/').pop();
    (byBase[b] || (byBase[b] = [])).push(k);
  }

  // 当前页面的部署子路径（GitHub Pages 常为 /仓库名/，本地/file:// 为 /）
  var BASE_DIR = (function () {
    var p = location.pathname || '/';
    try { p = decodeURIComponent(p); } catch (e) { /* 保留原样 */ }
    return p.replace(/[^\/]*$/, '');           // 取目录部分，保留首尾斜杠
  })();

  function normalize(u) {
    u = String(u == null ? '' : u).replace(/\\/g, '/');
    // 去掉协议 + 主机（file:///a/b → /a/b）
    u = u.replace(/^[a-zA-Z][a-zA-Z0-9+.\-]*:\/\/[^\/]*/, '');
    u = u.split('#')[0].split('?')[0];
    try { u = decodeURIComponent(u); } catch (e) { /* 保留原样 */ }
    // 去掉部署子路径前缀（/stickmanbattle/a.js → a.js）
    if (BASE_DIR.length > 1) {
      if (u.indexOf(BASE_DIR) === 0) {
        u = u.slice(BASE_DIR.length);
      } else {
        var bd = BASE_DIR.replace(/^\/+/, '');
        if (bd && u.indexOf(bd) === 0) u = u.slice(bd.length);
      }
    }
    u = u.replace(/^\.\//, '').replace(/^\/+/, '');
    // 只保留从 assets/ 起算的部分
    var i = u.indexOf('assets/');
    if (i > 0) u = u.slice(i);
    return u;
  }

  function lookup(u) {
    var key = normalize(u);
    if (Object.prototype.hasOwnProperty.call(FILES, key)) return FILES[key];
    var base = key.split('/').pop();
    var cands = byBase[base];
    if (cands && cands.length === 1) return FILES[cands[0]];
    // 后缀匹配（防目录层级差异）
    for (var kk in FILES) {
      if (kk.length > key.length && kk.slice(-key.length - 1) === '/' + key) return FILES[kk];
    }
    // 记录未命中的资源，便于排查
    (window.__PK_MISS || (window.__PK_MISS = [])).push(key);
    return null;
  }

  function b64ToBytes(b64) {
    var bin = atob(b64);
    var n = bin.length;
    var arr = new Uint8Array(n);
    for (var i = 0; i < n; i++) arr[i] = bin.charCodeAt(i);
    return arr;
  }

  function b64ToText(b64) {
    var bytes = b64ToBytes(b64);
    if (window.TextDecoder) {
      try { return new TextDecoder('utf-8').decode(bytes); } catch (e) { /* fallthrough */ }
    }
    var s = '';
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    try { return decodeURIComponent(escape(s)); } catch (e) { return s; }
  }

  function dataURI(entry) {
    return 'data:' + (entry.m || 'application/octet-stream') + ';base64,' + entry.d;
  }

  // 把绝对路径 /assets/x 改成相对 ./assets/x，其余原样
  function fixUrl(u) {
    u = String(u == null ? '' : u);
    if (!u) return u;
    if (/^[a-zA-Z][a-zA-Z0-9+.\-]*:/.test(u)) return u;   // 已带协议
    if (u.charAt(0) === '/' && u.charAt(1) !== '/') return '.' + u;
    return u;
  }

  /* ------------------------- 1. XMLHttpRequest ------------------------- */
  var NativeXHR = window.XMLHttpRequest;

  function ShimXHR() {
    this.readyState = 0;
    this.status = 0;
    this.statusText = '';
    this.response = null;
    this.responseText = '';
    this.responseType = '';
    this.responseURL = '';
    this.timeout = 0;
    this.withCredentials = false;
    this.upload = { addEventListener: function () {}, removeEventListener: function () {} };
    this._listeners = {};
    this._url = '';
    this._mime = '';
    this._aborted = false;
    this.onreadystatechange = null;
    this.onload = null;
    this.onerror = null;
    this.onprogress = null;
    this.onloadstart = null;
    this.onloadend = null;
    this.ontimeout = null;
  }

  ShimXHR.prototype.addEventListener = function (t, fn) {
    (this._listeners[t] || (this._listeners[t] = [])).push(fn);
  };
  ShimXHR.prototype.removeEventListener = function (t, fn) {
    var ls = this._listeners[t];
    if (!ls) return;
    var i = ls.indexOf(fn);
    if (i >= 0) ls.splice(i, 1);
  };
  ShimXHR.prototype._emit = function (t) {
    var ev = { type: t, target: this, currentTarget: this };
    var h = this['on' + t];
    if (typeof h === 'function') { try { h.call(this, ev); } catch (e) {} }
    var ls = this._listeners[t];
    if (ls) for (var i = 0; i < ls.length; i++) { try { ls[i].call(this, ev); } catch (e) {} }
  };
  ShimXHR.prototype._setReady = function (s) {
    this.readyState = s;
    this._emit('readystatechange');
  };
  ShimXHR.prototype.open = function (method, url) {
    this._url = url;
    this.responseURL = String(url);
    this._setReady(1);
  };
  ShimXHR.prototype.setRequestHeader = function () {};
  ShimXHR.prototype.getResponseHeader = function (n) {
    return String(n).toLowerCase() === 'content-type' ? (this._mime || null) : null;
  };
  ShimXHR.prototype.getAllResponseHeaders = function () {
    return this._mime ? 'content-type: ' + this._mime + '\r\n' : '';
  };
  ShimXHR.prototype.overrideMimeType = function () {};
  ShimXHR.prototype.abort = function () { this._aborted = true; };

  ShimXHR.prototype.send = function () {
    var self = this;
    this._emit('loadstart');
    var entry = lookup(this._url);

    if (!entry) {
      // 包里没有 -> 交给原生请求（在线版加载历史版本时走这里）
      try {
        var x = new NativeXHR();
        x.open('GET', fixUrl(this._url), true);
        var want = this.responseType;
        // json 由本层自己解析：原生在 responseType='json' 时无法读 responseText
        try { x.responseType = (want && want !== 'json') ? want : ''; } catch (e) {}
        x.onload = function () {
          if (self._aborted) return;
          self.status = x.status; self.statusText = x.statusText;
          if (want === 'json') {
            try { self.responseText = x.responseText; } catch (e) { self.responseText = ''; }
            try { self.response = JSON.parse(self.responseText); } catch (e) { self.response = null; }
          } else {
            self.response = x.response;
            try { self.responseText = x.responseText; } catch (e) { self.responseText = ''; }
          }
          try { self._mime = x.getResponseHeader('content-type') || ''; } catch (e) {}
          self._setReady(4);
          self._emit('load'); self._emit('loadend');
        };
        x.onerror = function () {
          if (self._aborted) return;
          self.status = 404; self.statusText = 'Not Found';
          self._setReady(4);
          self._emit('error'); self._emit('loadend');
        };
        x.send();
      } catch (err) {
        if (self._aborted) return;
        self.status = 404; self.statusText = 'Not Found';
        self._setReady(4);
        self._emit('error'); self._emit('loadend');
      }
      return;
    }

    this._mime = entry.m || '';
    var text = b64ToText(entry.d);

    if (this.responseType === 'json') {
      this.responseText = text;
      try { this.response = JSON.parse(text); } catch (e) { this.response = null; }
    } else if (this.responseType === 'arraybuffer') {
      this.responseText = '';
      this.response = b64ToBytes(entry.d).buffer;
    } else if (this.responseType === 'blob') {
      this.responseText = '';
      try { this.response = new Blob([b64ToBytes(entry.d)], { type: this._mime }); }
      catch (e) { this.response = null; }
    } else {
      this.responseText = text;
      this.response = text;
    }

    this.status = 200;
    this.statusText = 'OK';
    this._setReady(4);
    setTimeout(function () {
      if (self._aborted) return;
      self._emit('load');
      self._emit('loadend');
    }, 0);
  };

  window.XMLHttpRequest = ShimXHR;

  /* --------------------------- 2. <img> ----------------------------- */
  var imgDesc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
  if (imgDesc && imgDesc.set) {
    Object.defineProperty(HTMLImageElement.prototype, 'src', {
      configurable: true,
      enumerable: imgDesc.enumerable,
      get: function () { return imgDesc.get.call(this); },
      set: function (v) {
        var e = lookup(v);
        imgDesc.set.call(this, e ? dataURI(e) : fixUrl(v));
      }
    });
  }

  /* ------------------------ 3. <audio> / <video> -------------------- */
  if (window.HTMLMediaElement) {
    var mediaDesc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'src');
    if (mediaDesc && mediaDesc.set) {
      Object.defineProperty(HTMLMediaElement.prototype, 'src', {
        configurable: true,
        enumerable: mediaDesc.enumerable,
        get: function () { return mediaDesc.get.call(this); },
        set: function (v) {
          var e = lookup(v);
          mediaDesc.set.call(this, e ? dataURI(e) : fixUrl(v));
        }
      });
    }
  }

  /* ------------------------- 4. <script> / <link> -------------------- */
  var scriptDesc = Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype, 'src');
  if (scriptDesc && scriptDesc.set) {
    Object.defineProperty(HTMLScriptElement.prototype, 'src', {
      configurable: true,
      enumerable: scriptDesc.enumerable,
      get: function () { return scriptDesc.get.call(this); },
      set: function (v) { scriptDesc.set.call(this, fixUrl(v)); }
    });
  }
  var linkDesc = Object.getOwnPropertyDescriptor(HTMLLinkElement.prototype, 'href');
  if (linkDesc && linkDesc.set) {
    Object.defineProperty(HTMLLinkElement.prototype, 'href', {
      configurable: true,
      enumerable: linkDesc.enumerable,
      get: function () { return linkDesc.get.call(this); },
      set: function (v) { linkDesc.set.call(this, fixUrl(v)); }
    });
  }

  /* ------------------- 4.5 setAttribute 兜底 ------------------------ */
  // 有些代码用 setAttribute('src', ...) 而非 .src = ...，会绕过上面的拦截
  var origSetAttr = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function (name, value) {
    var n = String(name).toLowerCase();
    try {
      if (n === 'src' && this instanceof HTMLImageElement) {
        var e = lookup(value);
        return origSetAttr.call(this, name, e ? dataURI(e) : fixUrl(value));
      }
      if (n === 'src' && this instanceof HTMLScriptElement) {
        return origSetAttr.call(this, name, fixUrl(value));
      }
      if (n === 'href' && this instanceof HTMLLinkElement) {
        return origSetAttr.call(this, name, fixUrl(value));
      }
    } catch (err) { /* 交给原生 */ }
    return origSetAttr.call(this, name, value);
  };

  /* --------------------------- 5. fetch ----------------------------- */
  var nativeFetch = window.fetch;
  if (nativeFetch) {
    window.fetch = function (input, init) {
      var url = typeof input === 'string' ? input : (input && input.url) || '';
      var e = lookup(url);
      if (e) {
        var mime = e.m || 'application/octet-stream';
        return Promise.resolve(new Response(b64ToBytes(e.d), {
          status: 200, statusText: 'OK',
          headers: { 'Content-Type': mime }
        }));
      }
      return nativeFetch.call(window, input, init).catch(function (err) {
        // file:// 下原生 fetch 必然失败，转成明确错误
        throw err;
      });
    };
  }

  // 调试：暴露查询接口
  window.__PKStat = function () {
    var n = 0;
    for (var k in FILES) n++;
    return { packed: n };
  };
  console.log('[OFFLINE] 资源拦截层已就绪，内联资源 ' + window.__PKStat().packed + ' 个');
})();
