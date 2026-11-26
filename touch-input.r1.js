(function () {
  'use strict';
  window.__installTouchBridge = function () {
    var manager = window.cc && cc.internal && cc.internal.inputManager;
    if (!manager || manager.__touchBridgePatched) return;
    manager.__touchBridgePatched = true;
    var original = manager.registerSystemEvent;
    manager.registerSystemEvent = function (canvas) {
      if ((navigator.maxTouchPoints || navigator.msMaxTouchPoints || 0) > 0 || 'ontouchstart' in window) cc.sys.capabilities.touches = true;
      var result = original.apply(this, arguments);
      if (!canvas || canvas.__touchBridgeInstalled) return result;
      canvas.style.touchAction = 'none';
      canvas.style.msTouchAction = 'none';
      canvas.style.webkitUserSelect = 'none';
      canvas.style.userSelect = 'none';
      if (!window.PointerEvent) return result;
      canvas.__touchBridgeInstalled = true;
      var input = this, active = Object.create(null);
      function sample(event) {
        return {identifier: 100000 + event.pointerId, clientX: event.clientX, clientY: event.clientY, pageX: event.pageX, pageY: event.pageY};
      }
      function touches(samples) {
        input._updateCanvasBoundingRect();
        var rect = input._canvasBoundingRect, body = document.body;
        rect.adjustedLeft = rect.left - ((body && body.scrollLeft) || window.scrollX || 0);
        rect.adjustedTop = rect.top - ((body && body.scrollTop) || window.scrollY || 0);
        return input.getTouchesByEvent({changedTouches: samples}, rect);
      }
      function handle(kind, event) {
        if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return;
        var id = event.pointerId;
        if (kind !== 'begin' && !active[id]) return;
        if (kind === 'begin' && active[id]) return;
        var point = sample(event);
        if (event.cancelable) event.preventDefault();
        event.stopImmediatePropagation();
        if (kind === 'begin') {
          active[id] = point;
          try { canvas.setPointerCapture(id); } catch (_) {}
          try { canvas.focus({preventScroll: true}); } catch (_) { canvas.focus(); }
          input.handleTouchesBegin(touches([point]));
        } else if (kind === 'move') {
          active[id] = point; input.handleTouchesMove(touches([point]));
        } else {
          delete active[id];
          if (kind === 'end') input.handleTouchesEnd(touches([point]));
          else input.handleTouchesCancel(touches([point]));
          try { if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id); } catch (_) {}
        }
      }
      [['pointerdown','begin'],['pointermove','move'],['pointerup','end'],['pointercancel','cancel'],['lostpointercapture','cancel']].forEach(function (pair) {
        canvas.addEventListener(pair[0], function (event) { handle(pair[1], event); }, {capture:true, passive:false});
      });
      // Pointer-capable browsers may also emit legacy touch events for the same finger.
      ['touchstart','touchmove','touchend','touchcancel'].forEach(function (name) {
        canvas.addEventListener(name, function (event) {
          if (event.cancelable) event.preventDefault();
          event.stopImmediatePropagation();
        }, {capture:true, passive:false});
      });
      ['mousedown','mousemove','mouseup'].forEach(function (name) {
        canvas.addEventListener(name, function (event) {
          if (event.sourceCapabilities && event.sourceCapabilities.firesTouchEvents) {
            if (event.cancelable) event.preventDefault();
            event.stopImmediatePropagation();
          }
        }, {capture:true, passive:false});
      });
      function cancelAll() {
        var points = Object.keys(active).map(function (id) { return active[id]; });
        active = Object.create(null);
        if (points.length) input.handleTouchesCancel(touches(points));
      }
      window.addEventListener('blur', cancelAll);
      document.addEventListener('visibilitychange', function () { if (document.hidden) cancelAll(); });
      console.log('[INPUT] Direct multi-touch enabled; keyboard and mouse retained');
      return result;
    };
  };
})();
