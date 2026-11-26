# Stickman Battle — 网页版

火柴人战斗（Stickman Battle）的纯前端离线副本，可直接在浏览器中游玩。

- **在线地址**：https://tssuu57.github.io/stickmanbattle/
- **本地打开**：直接用静态服务器托管本目录即可（见下方说明）

## 在线游玩

打开 https://tssuu57.github.io/stickmanbattle/ 即可，首次加载需要下载约 39MB 资源，之后浏览器会缓存。

支持 Chrome / Edge / Firefox 等现代浏览器，**需要开启硬件加速**（游戏依赖 WebGL 渲染）。

## 本地运行

因为游戏通过 XHR 加载资源，不能用 `file://` 直接双击打开（会被浏览器 CORS 拦截），需要起一个本地服务器：

```bash
# Python
python3 -m http.server 8000

# 或 Node
npx serve .
```

然后访问 `http://localhost:8000/`。

> 如果只是想双击就玩，请使用 `stickman-offline` 离线版目录（资源已内联为 data URI，无需服务器）。

## 目录结构

```
.
├── index.html                      # 游戏入口
├── __shim.js                       # 资源拦截层（关键，勿删）
├── pack/                           # 内联资源包，5 个分片
│   ├── __manifest.js
│   └── pack-00.js … pack-04.js
├── assets/                         # 引擎资源目录（字体、图标、bundle 配置）
│   ├── JCRound.ttf                 # 中文字体
│   └── main/ internal/ res/ …
├── src/settings.fixr12.js          # Cocos 项目配置
├── cocos2d-js-min.reopenwebgl1.js  # Cocos Creator 2.4.15 引擎
├── main.reopenwebgl1.js            # 启动脚本
├── stickman-*.js                   # 游戏逻辑补丁（带中文注释）
├── style-mobile.25fc5.css          # 页面样式
└── .nojekyll                       # 关闭 Jekyll（否则 __shim.js 会被忽略）
```


## 版本切换

首页左上角有版本切换入口，默认加载最新版 `fixr12`。

- 点击按钮 → 展开 30 个历史构建版本（含日期与改动说明）
- 选中后自动以 `?v=<版本名>` 重新加载
- 也可直接访问 `?v=fixr6` 这样的地址

历史版本文件位于 `assets/main/index.<版本>.js` 与 `config.<版本>.json`，按需加载，不选则不会下载。

> 本地 `file://` 打开时仅内置最新版，切换入口会置灰并提示。

## 技术说明

浏览器的 `file://` 协议有三重限制：XHR 读本地 JSON 被 CORS 拦截、`fetch` 不支持 file scheme、本地图片作为 WebGL 纹理被判为跨源污染。

本项目的做法是把配置、图片、音频全部编码为 data URI 存进 `pack/*.js`，再由 `__shim.js` 接管 `XMLHttpRequest` / `Image` / `Audio` / `fetch` 的请求，直接从内存返回，从而完全绕开文件读取限制。

字体走 CSS `@font-face`（`file://` 下允许），因此保留为独立文件，避免 15MB 的 base64 膨胀。

`__shim.js` 会自动识别部署子路径（GitHub Pages 的 `/stickmanbattle/`），因此放在仓库根目录或子目录都能正常工作。

## 二次开发

- 改玩法逻辑：编辑 `stickman-*.js`（带中文注释，通过 `window.__xxx` 挂全局对象），保存刷新即生效
- 改数值配置：`src/settings.fixr12.js`
- 改贴图/JSON：修改 `assets/` 下文件后，需重新生成资源包
- 引擎版本：Cocos Creator 2.4.15，`main.reopenwebgl1.js` 为启停逻辑

## 说明

本项目仅作个人学习与技术研究用途，游戏版权归原作者所有。如需商用或公开分发，请先获得授权。
