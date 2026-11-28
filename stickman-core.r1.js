/* =========================================================================
 * P4 统一内核  stickman-core.r1.js
 *  目的：把和风主题各补丁脚本各自的 setInterval 轮询，收敛到一个统一调度器。
 *  - 单一 setInterval 驱动所有注册任务，各任务按自己的 interval 节流
 *  - 任务间用 try/catch 隔离，一个出错不影响其它
 *  - TOKENS：集中和风色表（文档化 + 供新脚本引用，不改现有脚本实际色值）
 *  - SKIP：跨脚本优先级表，解决多脚本互相覆写节点的问题
 *  - report()：一个入口看所有子脚本状态
 *
 *  兼容性：各脚本通过 window.__skinCore.add() 注册。若本内核未加载/被禁用，
 *  各脚本自带 fallback 退回原生 setInterval，行为与改造前完全一致。
 *  开关：?core=0 关闭内核（各脚本自动走 fallback）
 *  状态：window.__skinCore.report()
 * ========================================================================= */
;(function () {
  'use strict';
  if (/[?&]core=0/.test(location.search || '')) return;
  if (window.__skinCore) return;

  // ---- TOKENS：和风浅色主题色表（集中登记，现有脚本仍用自己的字面量）----
  var TOKENS = {
    paper:      '#F6EFDC',   // 主纸色
    paperLite:  '#FBF7E9',   // 纸色高光
    ink:        '#2E3A34',   // 淡墨（描边/正文）
    pine:       '#6E9A7C',   // 松叶绿
    akane:      '#C05A4A',   // 茜红
    akaneDeep:  '#7A3A30',   // 深茜
    goldTea:    '#FFD45A',   // 金茶
    goldLite:   '#FFE9A8',   // 浅金茶
    blueSky:    '#58A6E3'    // 青磁（天空/冷色）
  };

  var T = window.__skinCore = {
    version: 'skin-core-r1',
    TOKENS: TOKENS,
    jobs: {},        // name -> {fn, ms, last, runs, err, paused}
    SKIP: {},        // 跨脚本优先级：key -> owner
    started: false,
    ticks: 0,

    // 注册周期任务；同名覆盖。返回句柄
    add: function (name, fn, ms) {
      ms = ms || 100;
      T.jobs[name] = { fn: fn, ms: ms, last: 0, runs: 0, err: '', paused: false };
      return name;
    },

    // 延迟一次性（首触发用），仍用原生 setTimeout，但统一在这里便于统计
    once: function (fn, ms) {
      setTimeout(function () {
        try { fn(); } catch (e) {}
      }, ms || 0);
    },

    // 跨脚本优先级登记：owner 声明接管 key
    claim: function (key, owner) { T.SKIP[key] = owner; },
    isClaimed: function (key) { return !!T.SKIP[key]; },

    pause: function (name) { if (T.jobs[name]) T.jobs[name].paused = true; },
    resume: function (name) { if (T.jobs[name]) T.jobs[name].paused = false; },

    report: function () {
      var jobs = {};
      for (var k in T.jobs) {
        var j = T.jobs[k];
        jobs[k] = { ms: j.ms, runs: j.runs, err: j.err, paused: j.paused };
      }
      return { version: T.version, ticks: T.ticks, jobs: jobs, SKIP: T.SKIP };
    },

    // 调试：手动跑一遍所有任务（不等待节流）
    flush: function () {
      for (var k in T.jobs) runOne(k, T.jobs[k]);
    }
  };

  function runOne(name, j) {
    if (j.paused) return;
    try {
      j.fn();
      j.runs++;
      j.err = '';
    } catch (e) {
      j.err = String(e && e.message || e);
    }
  }

  // 单一驱动：25ms 心跳，各任务按 ms 节流
  function driver() {
    T.ticks++;
    var now = Date.now();
    for (var k in T.jobs) {
      var j = T.jobs[k];
      if (now - j.last < j.ms) continue;
      j.last = now;
      runOne(k, j);
    }
  }

  // 首帧尽早启动
  setInterval(driver, 25);
  T.started = true;
})();
