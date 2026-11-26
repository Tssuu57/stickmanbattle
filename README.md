# Stickman Battle — 网页版

火柴人战斗（Stickman Battle）的纯前端离线副本，可直接在浏览器中游玩。

- **在线地址**：https://tssuu57.github.io/stickmanbattle/
- **本地打开**：直接用静态服务器托管本目录即可（见下方说明）

## 在线游玩

打开 https://tssuu57.github.io/stickmanbattle/ 即可，首次加载约需下载 8MB（整目录 14MB），之后浏览器会缓存。

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


## 音效层

原包音效的问题不是"没有音效"，而是**响度层级丢了**：命中声比 BGM 低 12~15dB，基本被音乐盖住；命中音 0.98s 太长，和武器 0.5s 冷却对不上；战斗全程其实没有 BGM（`battle.mp3` 在包里但没人调用）。

`stickman-audio.r1.js` 在补丁层重建了这套声音，不重新打包任何资源：

| 模块 | 做法 |
|---|---|
| 响度重平衡 | 逐条增益（sword2 ×1.65 / harp ×4.6 / click ×3.2），战斗 BGM 0.5→0.30，重击时侧链避让 180ms |
| 打击合成层 | 低频冲击 195→82Hz + 瞬态噪声 + 中频实体，按伤害分四档，与顿帧/震屏同源 |
| 缺失反馈 | 落地闷响、击杀下坠、连击升调（每 3 连击）、技能起手风声 |
| 混音卫生 | 同类限流（sword2 36ms）、并发上限 24、尾部收束 0.98s→0.5s、软饱和守 0.995 |
| 空间感 | 按命中点横向位置做 ±0.45 立体声定位，音高随机 ±9% |

调试开关：`?audio=0` 关闭整层（回落原音效）。

## 资源路径修正层

主包与各补丁层里硬编码了大量 `"/assets/..."` 绝对路径（HUD 图标、拾取提示、道具贴图、场地元素、被动光环等）。这类路径以域名根为基准，站点部署在 `/stickmanbattle/` 子目录时会解析到 `https://host/assets/...`，**全部 404**，表现为图标破图或空白。

`stickman-assets.r1.js` 在补丁层统一改写：

- `__guideThumbs` / `__itemIcons` 两个字典用 Proxy 拦截，整体赋值与逐项写入都会转成"基于当前页面"的地址
- 包装 `cc.assetManager.loadRemote`，Cocos 侧远程贴图一并修正
- 兼容三种部署：GitHub Pages 项目页、本地 `http://127.0.0.1:port/`、离线 `file://`
- 遗漏的 `<img>` 会被巡检修正；加载失败时隐藏而非显示浏览器破图

调试开关：`?asset=0` 关闭本层；控制台 `__assetPathFix.report()` 查看修正记录。

## 手感层与打击感层

- `stickman-feel.r1.js`：起步蹬地冲量、跳跃蓄力 0.62s→0.3s、受击硬直与击退、镜头跟随收紧。`?feel=0` 关闭。
- `stickman-juice.r1.js`：受击顿帧、分级震屏、伤害飘字、残血红边、击杀白闪。`?juice=0` 关闭。
- `stickman-nosolo.r1.js`：隐藏单人入口。`?nosolo=0` 查看原版布局。

## 结算定格

原版结算只把 `MainView`（HUD/摇杆）隐藏，战斗逻辑和物理照旧在跑。摇杆被隐藏后收不到 `touchend`，`_endTouch` 不会被调用，`checkChange` 与 `_PlayerState=Run` 一直留着；`Human.lateUpdate` 只要状态不是 `Idel` 就每帧 `RunToAddForce`（3000+ 水平力），于是没人操作角色也会自己走。

`stickman-fixes.r1.js` 末尾的结算段处理这件事：

- 结算出现（`gameConfig.isShowFinishView`）时收杆：活人走原版 `_endTouch`（复位摇杆 + `setAble` 回站立），死人只清输入
- 清掉残留跑动状态并把水平惯性收到 15%，避免结算后继续滑行
- 420ms 后关闭 `PhysicsManager`，整个世界定格（尸体也不会被残余力推着动）
- 新一局、换场景、点 OK 返回时自动恢复物理与 AI

调试开关：`?endfix=0` 关闭本段；控制台 `__endFreeze.report()` 查看状态。

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
