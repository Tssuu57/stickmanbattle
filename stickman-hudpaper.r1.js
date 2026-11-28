/* =========================================================================
 * 战斗 HUD 零碎收尾（P1 第 4 项）
 * 1) 右上暂停键 / 暂停后的返回·继续键：白线方框 -> 纸白牌 + 墨绿图标
 * 2) 角色头顶被动名：纸白描边 + 降不透明度，不再抢画面
 * 3) 回合数字 fieldLabel：白字 -> 墨绿 + 纸白描边，浅底上读得清
 * 开关：?hudpaper=0 关闭；状态：window.__hudPaper.report()
 * ========================================================================= */
;(function () {
  'use strict';
  if (/[?&]hudpaper=0/.test(location.search || '')) return;
  if (window.__hudPaper) return;

  var T = window.__hudPaper = { v: 'hudpaper-r1', made: 0, swapped: 0, err: '' };
  T.report = function () { return { v: T.v, made: T.made, swapped: T.swapped, err: T.err }; };

  var B64 = {
    stop_paper: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAMgAAADICAYAAACtWK6eAAAD/0lEQVR4nO3arXLbUBSFUaUTlIcpMgoOCMjjBhQEBxnlYYqLPOPxuNu6P5Kv5LVQp02tC843R5IzTQAAAAAAAPv0dM+L/349vN7z+mzHz/fx+x7XXTUQQdDLWsGsEogwWMrSoSwayK0wjl+ff5a8PvtxePt4T/++VCiLBJLCEAWtUiy9Q+keyLU4RMFSrsXSM5KugVzGIQzWchlKr0i6BGJrMIIltsmvlv88TeJgHNfmrvUNatMGcUvFqHrdcjVvkBNxMJJe81gdyPn2EAcjOp/L2lutqkB8M84W1cxtcSCeO9iSy/ksjaTpGUQcbEHLnBYF4rmDrap9Hun2Fgv2aHYgtgdbV7NFbBAIZgXitS57NGeuizeI2yu2rHR+3WJBIBAIbgbi7RV7U/I2ywaBQCAQCAQCgUAgEAgEAoFAIBAIBAKBQCAQCAQCgUAgEAgEAoFAIBAIBAKBQCAQCAQCgUAgEAgEAoFAIBAIBAKBQCAQCAQCgUAgEAgEAoFAIBAIBAKBQCAQPN/7AFt2ePv4O+fnjl+fL3s+w57ZIJXmDmbpz27tDHsnkAo1w9Z7QEc4wyMQSKGWIes1oCOc4VEIpECP4Wr9jBHO8EgEAoFAIBAIBAKBQCAQCAQCgUAgEAgEAoFAIBAIBAKBQCAQCAQCgUAgEAgEAoFAIBAIBAKBQCAQCAQCgUAgEAgEAoFAIBAIBAKBQCAQCAQCgUAgEAgEAoFAIBAIBAKBQCAQCAQCgUAgEAgEAoFAIBAIBAKBQCAQCAQCgUAgEAgEAoFAIBAIBAKBQCAQCAQCgUAgEAgEAoFAIBAIBAKBQCAFjl+fL/f+jBHO8EgEUqhluHoN5ghneBQCqVAzZL0Hc4QzPAKBVCoZtqUGc4Qz7N3zvQ+wZSMM3Qhn2DMbBAKBQCAQCAQCgUAgEAgEAoFAIBAIBAKBQCAQCAQCgUAgEAgEAoFAIBAIBAKBQCAQCAQCgUAgEAgEAoFAIBAIBAKBQCAQCAQCgUAgEAgEAoFAIBAIBAKBQHAzkJ/v4/fpz4e3j/dljwPLO5/j8/m+xgaBQCAQFAfiNostK53fWYHcuk+DLZoz126xIJgdiLdZbF3J26sTGwSCokBsEbaqZntMU+MGEQlb0DKnxYFc1icSRnY5n6VvZKs2iNe+bFHN3FbfYnkeYXS1zx3nur3FEgkj6TWPT60f8Pv18Hr5d8evzz+tnws1roXR8kjQvEGuXdw24R56xzFNHTbIucttYpOwlta3Vf/TNZBpcsvFupbYGue6BzJN1yM5EQut0i18768gFgnkJIUyTWJhvlvPtUt9N7doICe3QoFaS39pvUogJ0Khl7V+m2PVQC4Jhrn8ehMAAAAAABX+ATO7RgFMiLfSAAAAAElFTkSuQmCC',
    home_paper: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAMgAAADICAYAAACtWK6eAAAFcklEQVR4nO3dvXLTShiA4eXMqTJzboXKVeoUFLlcFxSuU7niLk7NDDUFaHCM8lnS7kor7fNUEBLLEd+bleSfpAQAAAAAAHBMn7bc+Ofn0/OW22c/vr1d37bY7qqBCIJS1gpmlUCEQS21Q6kayKMwrpfz15rb5zhOL69fon+vFUqVQKIwREGuKJbSoRQPZCwOUVDLWCwlIykayH0cwmAt96GUiqRIIFYNWlBjNfkn54tTEgftGJu73CuoWSuIQypaVeqQK3sFGYiDlpSax8WB3K4e4qBFt3O59FBrUSAeGWePlszt7ECcd7An9/M5N5KscxBxsAc5czorEOcd7NXS85FiV7HgiCYHYvVg75asIlYQCEwKxGVdjmjKXM9eQRxesWdz59chFgQEAoGHgbh6xdHMuZplBYGAQCAgEAgIBAICgYBAICAQCAgEAgKBgEAgIBAICAQCAoGAQCAgEAgIBAICgYBAICAQCAgEAgKBgEAgIBAICAQCAoGAQCAgEAgIBAICgYBAIPDv1neAX04vrz9u/369nJ+2ui/8IZCN3Ydx/3GhbMshVuM+Coh1CGRDU4dfJNsRyEbmDr1ItiGQDSwddpGsTyAryx1ykaxLICsqNdwiWY9AVlJ6qEWyDoGsoNYwi6Q+gVRWe4hFUpdAKlpreEVSj6eaVLDFwHpqSh1WkMK2/mm+9faPRiAFtTKcrdyPIxBIIaWGstQhkkjKEEgBpeMQSTsEkqnWyiGSNggkQ+3DKpFsTyALlRi66+X89CiCKZ8zhUiWEcgCpeKo+fljRDKfQGbaIo7cr7slknkEMsOWcZT6+pREModAJmohjpK3I5JpBDJBS3GUvD2RPCaQB1qMo+TtiiQmkEDLcZS8fZF8TCAf2EMcJbcjknECGbGnOEpuTyR/E8idPcZRcrsieU8gv51eXn/sOY6S2y+1L45AIKm913Lk8iTHcroP5GhxDERSRteBHDWOgUjydRvI0eMYiCRPl4H0EsdAJMt1F0hvcQxEskxXgaz1KsBWeXXifN0EcoTHOEoRyXTdBNLCC5VaYn9M000gKW37UtcW2R+PdRVIStu8WULL7I9Yl+/ufr2cn2r8CuaWhqfGOUJL399aultBBj3+Z+fodX91G0hK9d/RcG/sj791HUhK9d4Td6/sj/e6DySl8u+qvnf2xx8C+c0wvGd//CIQCAgEAgKBgEAgIBAICAQCXT4Xa2P/FbiN7wVugwmsIBAQCAQEAgGBQEAgEBAIBAQCAYFAQCAQEAgEBAIBgUBAIBAQCAQEAgGvByloyvvhXi/n7NeD9PK7OVpgBYGAQCAgEAgIBAICgYBAIOAy78pOL6//b30fxng393FWkA/0NDA9fa9zCQQCAgn08JO1h+8xh3OQB4YBOtrTO4QxjRVkouvl/HSUoTrK97EGK8hMhqsvVhAICAQCAoGAQCAgEAgIBAICgYBAICAQCAgEAgKBgEAgIBAICAQCAoGAQCAgEAgIBAICgYBAICAQCAgEAgKBgEAg8DCQb2/Xt+HPp5fXL3XvDtR3O8e38z3GCgIBgUBgdiAOs9izufM7KZBHx2mwR1Pm2iEWBCYH4moWezfn6tXACgKBWYFYRdirJatHSpkriEjYg5w5nR3IfX0ioWX38zn3iuyiFcRlX/ZoydwuPsRyPkLrlp533Cp2FUsktKTUPH7KvYHPz6fn+49dL+evubcLS4yFkXNKkL2CjG3casIWSseRUoEV5Nb9amIlYS25V6s+UjSQlBxysa4aq8at4oGkNB7JQCzkig7hSz8EUSWQQRRKSmJhukfntbUem6sayOBRKLBU7QetVwlkIBRKWevZHKsGck8wTOXpTQAAAAAALPATPkFp0EyGZ84AAAAASUVORK5CYII=',
    run_paper: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAMgAAADICAYAAACtWK6eAAAEjUlEQVR4nO3arXIbSQCF0cnWon2YICNjgwA/rkFAsJFRHiZ4wZYSlay9mp/ume6ec1AqqVgC/dVtjTxNAAAAAAAAY/py5It/fX56PvL16cfP94/3I15310AEQSl7BbNLIMKgltqhVA3kURgfP96+13x9xvH08vot/XutUKoEksIQBVulWEqHUjyQe3GIglruxVIykqKB3MYhDPZyG0qpSIoEYjVoQY01+WvLf54mcdCOe+du6xPUTQviSkWrSl25Ni/IhThoSanzuDqQ6/UQBy26Ppdrr1qrAvHNOD1ac24XB+JzBz25PZ9LI9n0GUQc9GDLOV0UiM8d9Grt55FiT7FgRLMDsR70bs2KWBAIZgXisS4jmnOuFy+I6xU9W3p+XbEgEAgEDwPx9IrRLHmaZUEgEAgEAoFAIBAIBAKBQCAQCAQCgUAgEAgEAoFAIBAIBAKBQCAQCAQCgUAgEAgEAoFAIBAIBAKBQCAQCAQCgUAgEAgEAoFAIBAIBAKBQCAQCAQCgUA2enp5/XX0e6AegRTw9PL6SyhjEkhBIhmPQAqzJmMRSCVCGYNAKhNJ3wSyA2vSL4HsSCj9EcgBRNIPgRzEmvRBIAcTStsE0giRtEkgDbEm7RFIg4TSDoE0TCTHE0jjrMmxBNIJoRxDIJ0Ryb4E0iFrsh+BdEwo9QlkACKpRyCDsCZ1CGQwQilLIIMSSRkCGZg12U4gJyCU9QRyIiJZTiAnY02WEchJCWUegZycSDKBYE0CgfCbUD4TCJ+I5A+BcJc1+Y9AiM4eikCY5ayRCITZzrgmfx/9BujHx4+3f45+D3uzIMxyxjimyYLwwFnDuBAId509jAtXLD4Rxx8WhN+E8ZlAEEbginVy4sgsyEkJYx6BnIwwlnHFOhFxLGdBTkAY6wlkYMLYzhVrUOIow4IMRhhlCWQQwqjDFWsA4qjHgnRMGPUJpEPC2I8rVmfEsS8L0glhHEMgjRPGsVyxGiaO41mQBgmjHQJpiDDa44rVCHG0yYIcTBhtE8hBhNEHV6wDiKMfFmRHwuiPQHYgjH65YlUmjr5ZkEqEMQaBFCaMsbhiFSSO8ViQAoQxLguykTjGJhAIBAKBQCAQCAQCgUAgEAgEAoFAIBAIBAKBQCAQCAQCgUAgEAgEAoFAIBAIBAKBQCAQCAQCgUAgEAgEAoFAIBAIBAKBQCAQCAQCgUAgEAgEAoFA8DCQn+8f75c/P728fqv7dqC+63N8fb7vsSAQCASCxYG4ZtGzped3ViCP7mnQoznn2hULgtmBeJpF75Y8vbqwIBAsCsSK0Ks16zFNGxdEJPRgyzldHMhtfSKhZbfnc+kT2VUL4rEvPVpzbldfsXweoXVrP3dcK/YUSyS0pNR5/LL1B3x9fnq+/buPH2/ft/5cWONeGFs+EmxekHsvbk04Quk4pqnAgly7XRNLwl62Pq36P0UDmSZXLvZVYzWuFQ9kmu5HciEWtkpX+NJfQVQJ5CKFMk1iYb5Hn2trfTdXNZCLR6HAWrW/tN4lkAuhUMpev82xayC3BMNcfr0JAAAAAIAV/gWqo7cRMRMhzAAAAABJRU5ErkJggg=='
  };

  var cache = {};
  (function () {
    for (var k in B64) {
      (function (nm) {
        var o = cache[nm] = { done: false, el: new Image() };
        o.el.onload = function () { o.done = true; };
        o.el.onerror = function () { T.err = 'img:' + nm; };
        o.el.src = B64[nm];
      })(k);
    }
  })();

  var NEWF = {};
  function build(nm) {
    if (NEWF[nm]) return NEWF[nm];
    var it = cache[nm];
    if (!it || !it.done || !it.el.width) return null;
    try {
      var el = it.el;
      var tex = new cc.Texture2D();
      tex.initWithElement(el);
      tex.handleLoadedTexture();
      var sf = new cc.SpriteFrame();
      sf.setTexture(tex);
      sf.setRect(cc.rect(0, 0, el.width, el.height));
      sf.setOriginalSize(cc.size(el.width, el.height));
      sf.name = nm;
      NEWF[nm] = sf;
      T.made++;
    } catch (e) { T.err = 'build:' + (e && e.message); }
    return NEWF[nm];
  }

  function comp(n, name) {
    try { return n && n.isValid ? n.getComponent(name) : null; } catch (_) { return null; }
  }

  // 加纸白描边（只加一次），让墨绿字在浅底上有「印在纸上」的边
  function paperEdge(n, w) {
    if (!n || n.__hpEdge) return;
    var lb = comp(n, cc.Label);
    if (!lb) return;
    var ol = comp(n, cc.LabelOutline) || n.addComponent(cc.LabelOutline);
    if (!ol) return;
    ol.color = new cc.Color(0xFA, 0xF6, 0xE8);
    ol.width = w || 2;
    n.__hpEdge = 1;
  }

  // ---- 1. 三个图标按钮 ----
  var BTNS = [
    ['Canvas/MainView/Stop', 'stop_paper', 56],
    ['Canvas/MainView/StopView/Home', 'home_paper', 56],
    ['Canvas/MainView/StopView/Run', 'run_paper', 56]
  ];
  function fixBtns() {
    for (var i = 0; i < BTNS.length; i++) {
      var path = BTNS[i][0], nm = BTNS[i][1], dy = BTNS[i][2];
      var n = cc.find(path);
      if (!n || !n.activeInHierarchy) continue;
      // 暂停键往下让 28 屏幕像素（设计单位 56），躲开顶部被动说明长条
      // 回合重开时原版会把 y 写回，所以记基准值并反复校正
      if (dy) {
        if (n.__hpY0 == null) n.__hpY0 = n.y;
        if (n.y === n.__hpY0) n.y = n.__hpY0 - dy;
      }
      var sp = comp(n, cc.Sprite);
      var f = build(nm);
      if (!sp || !f || sp.spriteFrame === f) continue;
      var w = n.width || 100, h = n.height || 100;
      if (sp.sizeMode !== cc.Sprite.SizeMode.CUSTOM) sp.sizeMode = cc.Sprite.SizeMode.CUSTOM;
      sp.spriteFrame = f;
      n.setContentSize(w, h);
      T.swapped++;
    }
  }

  // ---- 2. 头顶被动名 ----
  function fixNames() {
    ['Canvas/humans/StickMan1/Centers/passiveLbl',
     'Canvas/humans/enemy/Centers/passiveLbl'].forEach(function (p) {
      var n = cc.find(p);
      if (!n || !n.activeInHierarchy) return;
      var lb = comp(n, cc.Label);
      if (!lb) return;
      paperEdge(n, 2);
      // 颜色统一压到墨绿，不透明度降到 72%：看得见但不抢
      if (n.color.r !== 0x2E || n.color.g !== 0x3A) n.color = new cc.Color(0x2E, 0x3A, 0x34);
      if (n.opacity !== 184) n.opacity = 184;
    });
  }

  // ---- 3. 回合数字 ----
  function fixField() {
    var n = cc.find('Canvas/fieldLabel');
    if (!n || !n.activeInHierarchy) return;
    var lb = comp(n, cc.Label);
    if (!lb) return;
    paperEdge(n, 3);
    if (n.color.r !== 0x2E || n.color.g !== 0x3A) n.color = new cc.Color(0x2E, 0x3A, 0x34);
  }

  function apply() {
    if (!window.cc || !cc.director) return;
    try { fixBtns(); } catch (e) { T.err = 'btn:' + (e && e.message); }
    try { fixNames(); } catch (e) { T.err = 'name:' + (e && e.message); }
    try { fixField(); } catch (e) { T.err = 'field:' + (e && e.message); }
  }

  setInterval(apply, 500);
})();
