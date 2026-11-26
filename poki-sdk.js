window.PokiSDK = {
    init: function() { return Promise.resolve(); },
    gameplayStart: function() {},
    gameplayStop: function() {},
    commercialBreak: function() { return Promise.resolve(); },
    rewardedBreak: function() { return Promise.reject(); },
    happyTime: function() { return Promise.resolve(0); },
    setDebug: function() {},
    gameLoadingStart: function() {},
    gameLoadingProgress: function() {},
    gameLoadingFinished: function() {},
    withAdBreak: function(fn) { if (fn) fn(); },
    captureError: function() {}
};
console.log("PokiSDK stub loaded - all functions are no-op");
