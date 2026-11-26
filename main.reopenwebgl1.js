(function () {
'use strict';

var startupSettings = window._CCSettings;
var bootState = 'idle';
var gameRunStarted = false;
var onStartEntered = false;

function startupFail(stage, detail, error, autoRecover) {
    bootState = 'failed';
    if (window.__gameStartup && typeof window.__gameStartup.fail === 'function') {
        window.__gameStartup.fail(stage, detail, error, { autoRecover: !!autoRecover });
    } else {
        console.error('[STARTUP]', stage, detail || '', error || '');
    }
}

window.boot = function () {
    if (bootState === 'loading' || bootState === 'running' || bootState === 'ready') {
        if (window.__gameStartup) {
            window.__gameStartup.ignoredBootCalls = (window.__gameStartup.ignoredBootCalls || 0) + 1;
        }
        console.warn('[STARTUP] Duplicate boot ignored:', bootState);
        return;
    }
    if (bootState === 'failed') {
        console.warn('[STARTUP] Same-document retry refused; recovery uses a fresh document.');
        return;
    }

    var settings = startupSettings;
    if (!settings) {
        startupFail('配置读取', 'window._CCSettings 不存在。', null, true);
        return;
    }
    if (!window.cc || !cc.assetManager || !cc.game) {
        startupFail('引擎初始化', 'Cocos 引擎对象未就绪。', null, true);
        return;
    }

    bootState = 'loading';
    if (window.__gameStartup) {
        window.__gameStartup.bootCalls = (window.__gameStartup.bootCalls || 0) + 1;
        window.__gameStartup.phase = 'assets';
    }
    window._CCSettings = undefined;

    var onProgress = null;
    var RESOURCES = cc.AssetManager.BuiltinBundleName.RESOURCES;
    var INTERNAL = cc.AssetManager.BuiltinBundleName.INTERNAL;
    var MAIN = cc.AssetManager.BuiltinBundleName.MAIN;

    function setLoadingDisplay () {
        var splash = document.getElementById('splash');
        if (!splash) return;
        var progressBar = splash.querySelector('.progress-bar span');
        onProgress = function (finish, total) {
            var percent = total ? 100 * finish / total : 0;
            if (progressBar) {
                progressBar.style.width = (percent / 2).toFixed(2) + '%';
                try {
                    window.__splashControl = {
                        setBootProgress: function (p) { try { progressBar.style.width = (p * 50).toFixed(2) + '%'; } catch (_) {} },
                        setLoadProgress: function (p) { try { progressBar.style.width = (50 + p * 50).toFixed(2) + '%'; } catch (_) {} },
                        hide: function () { try { splash.style.display = 'none'; } catch (_) {} }
                    };
                } catch (_) {}
            }
        };
        splash.style.display = 'block';
        if (progressBar) progressBar.style.width = '0%';

        cc.director.once(cc.Director.EVENT_AFTER_SCENE_LAUNCH, function () {
            /* Splash is hidden by the original Load scene. */
        });
    }

    var onStart = function () {
        if (onStartEntered) {
            console.warn('[STARTUP] Duplicate onStart ignored.');
            return;
        }
        onStartEntered = true;
        if (window.__gameStartup) window.__gameStartup.phase = 'scene';

        try {
            cc.view.enableRetina(true);
            cc.view.resizeWithBrowserSize(true);

            if (cc.sys.isBrowser) setLoadingDisplay();

            if (cc.sys.isMobile) {
                if (settings.orientation === 'landscape') {
                    cc.view.setOrientation(cc.macro.ORIENTATION_LANDSCAPE);
                }
                else if (settings.orientation === 'portrait') {
                    cc.view.setOrientation(cc.macro.ORIENTATION_PORTRAIT);
                }
                cc.view.enableAutoFullScreen([
                    cc.sys.BROWSER_TYPE_BAIDU,
                    cc.sys.BROWSER_TYPE_BAIDU_APP,
                    cc.sys.BROWSER_TYPE_WECHAT,
                    cc.sys.BROWSER_TYPE_MOBILE_QQ,
                    cc.sys.BROWSER_TYPE_MIUI,
                    cc.sys.BROWSER_TYPE_HUAWEI,
                    cc.sys.BROWSER_TYPE_UC
                ].indexOf(cc.sys.browserType) < 0);
            }

            if (cc.sys.isBrowser && cc.sys.os === cc.sys.OS_ANDROID) {
                cc.assetManager.downloader.maxConcurrency = 2;
                cc.assetManager.downloader.maxRequestsPerFrame = 2;
            }

            var launchScene = settings.launchScene;
            var bundle = cc.assetManager.bundles.find(function (candidate) {
                return candidate.getSceneInfo(launchScene);
            });
            if (!bundle) {
                startupFail('场景定位', '找不到启动场景所在 bundle：' + launchScene, null, true);
                return;
            }

            bundle.loadScene(launchScene, null, onProgress, function (err, scene) {
                if (err) {
                    startupFail('场景加载', err.message || String(err), err, true);
                    return;
                }
                try {
                    cc.director.runSceneImmediate(scene);
                    if (cc.sys.isBrowser) {
                        var canvas = document.getElementById('GameCanvas');
                        if (canvas) canvas.style.visibility = '';
                        var div = document.getElementById('GameDiv');
                        if (div) div.style.backgroundImage = '';
                    }
                    bootState = 'ready';
                    if (window.__gameStartup && typeof window.__gameStartup.markReady === 'function') {
                        window.__gameStartup.markReady();
                    }
                    console.log('Success to load scene: ' + launchScene);
                } catch (sceneError) {
                    startupFail('场景启动', sceneError.message || String(sceneError), sceneError, true);
                }
            });
        } catch (startError) {
            startupFail('引擎启动回调', startError.message || String(startError), startError, true);
        }
    };

    var option = {
        id: 'GameCanvas',
        debugMode: settings.debug ? cc.debug.DebugMode.INFO : cc.debug.DebugMode.ERROR,
        showFPS: settings.debug,
        frameRate: 60,
        groupList: settings.groupList,
        collisionMatrix: settings.collisionMatrix
    };

    try {
        cc.assetManager.init({
            bundleVers: settings.bundleVers,
            remoteBundles: settings.remoteBundles,
            server: settings.server
        });
    } catch (initError) {
        startupFail('资源管理器初始化', initError.message || String(initError), initError, true);
        return;
    }

    var roots = [{ key: 'internal', name: INTERNAL }];
    if (settings.hasResourcesBundle) roots.push({ key: 'resources', name: RESOURCES });
    var required = roots.length + 1;
    var completed = Object.create(null);
    var completedCount = 0;
    var aborted = false;
    var mainBundleRequested = false;

    function runGameOnce() {
        if (aborted || mainBundleRequested) return;
        mainBundleRequested = true;
        cc.assetManager.loadBundle(MAIN, function (err) {
            if (aborted) return;
            if (err) {
                aborted = true;
                startupFail('主资源包加载', err.message || String(err), err, true);
                return;
            }
            if (gameRunStarted) {
                console.warn('[STARTUP] Duplicate cc.game.run prevented.');
                return;
            }
            gameRunStarted = true;
            bootState = 'running';
            if (window.__gameStartup) {
                window.__gameStartup.runCalls = (window.__gameStartup.runCalls || 0) + 1;
                window.__gameStartup.phase = 'renderer';
            }
            try {
                cc.game.run(option, onStart);
            } catch (runError) {
                aborted = true;
                var status = runError && runError.statusMessage;
                if (!status && window.__gameStartup && window.__gameStartup.lastContextCreationError) {
                    status = window.__gameStartup.lastContextCreationError.statusMessage;
                }
                startupFail('WebGL 启动', status || runError.message || String(runError), runError, true);
            }
        });
    }

    function complete(key, err) {
        if (aborted || completed[key]) return;
        completed[key] = true;
        if (err) {
            aborted = true;
            startupFail('基础资源加载', key + ': ' + (err.message || String(err)), err, true);
            return;
        }
        completedCount++;
        if (completedCount === required) runGameOnce();
    }

    try {
        cc.assetManager.loadScript(settings.jsList.map(function (x) { return 'src/' + x; }), function (err) {
            complete('scripts', err);
        });
        roots.forEach(function (root) {
            cc.assetManager.loadBundle(root.name, function (err) {
                complete(root.key, err);
            });
        });
    } catch (loadError) {
        aborted = true;
        startupFail('基础资源调度', loadError.message || String(loadError), loadError, true);
    }
};

if (window.jsb) {
    var isRuntime = (typeof loadRuntime === 'function');
    if (isRuntime) {
        require('src/settings.21c9d.js');
        require('src/cocos2d-runtime.js');
        if (CC_PHYSICS_BUILTIN || CC_PHYSICS_CANNON) require('src/physics.js');
        require('jsb-adapter/engine/index.js');
    }
    else {
        require('src/settings.21c9d.js');
        require('src/cocos2d-jsb.js');
        if (CC_PHYSICS_BUILTIN || CC_PHYSICS_CANNON) require('src/physics.js');
        require('jsb-adapter/jsb-engine.js');
    }
    cc.macro.CLEANUP_IMAGE_CACHE = true;
    window.boot();
}
})();
