/* Thin wrapper over Samsung AVPlay, with an HTML5 <video> fallback so the
 * app can also be tried in a desktop browser.
 * Events: 'buffering'(bool) 'ready' 'time'(posMs, durMs) 'complete' 'error'(msg) */
var Player = (function () {
    'use strict';

    var av = null;
    function getAv() {
        if (!av && typeof webapis !== 'undefined' && webapis.avplay) av = webapis.avplay;
        return av;
    }
    var video = null;
    var handlers = {};
    var poll = null;
    var paused = false;
    var token = 0;

    function on(name, fn) { handlers[name] = fn; }
    function emit(name, a, b) { if (handlers[name]) { try { handlers[name](a, b); } catch (e) {} } }

    function startPoll() {
        stopPoll();
        poll = setInterval(function () { emit('time', position(), duration()); }, 1000);
    }
    function stopPoll() { if (poll) { clearInterval(poll); poll = null; } }

    function open(url, startMs) {
        getAv();
        stop();
        paused = false;
        var my = ++token;
        emit('buffering', true);
        if (av) avOpen(url, startMs || 0, my); else h5Open(url, startMs || 0, my);
    }

    function avOpen(url, startMs, my) {
        try { av.open(url); } catch (e) { emit('error', 'Não foi possível abrir o vídeo'); return; }
        try {
            av.setListener({
                onbufferingstart: function () { if (my === token) emit('buffering', true); },
                onbufferingcomplete: function () { if (my === token) emit('buffering', false); },
                onstreamcompleted: function () { if (my === token) emit('complete'); },
                onerror: function (e) { if (my === token) emit('error', 'Erro de reprodução (' + (e && e.message || e) + ')'); },
                onerrormsg: function (c, m) { if (my === token) emit('error', 'Erro de reprodução (' + (m || c) + ')'); }
            });
        } catch (e) {}
        try { av.setDisplayRect(0, 0, 1920, 1080); } catch (e) {}
        var ok = function () {
            if (my !== token) return;
            try { av.setDisplayRect(0, 0, 1920, 1080); } catch (e) {}
            try { av.setDisplayMethod('PLAYER_DISPLAY_MODE_LETTER_BOX'); } catch (e) {}
            try { av.play(); } catch (e) {}
            if (startMs > 0) { try { av.seekTo(startMs); } catch (e) {} }
            emit('buffering', false);
            emit('ready');
            startPoll();
        };
        var fail = function (err) {
            if (my !== token) return;
            emit('error', 'O vídeo não carregou (' + (err && err.message || err || 'erro') + ')');
        };
        try { av.prepareAsync(ok, fail); }
        catch (e) {
            try { av.prepare(); ok(); } catch (e2) { fail(e2.message || e2); }
        }
    }

    function h5Open(url, startMs, my) {
        video = video || document.getElementById('h5video');
        document.documentElement.className += ' h5';
        video.onwaiting = function () { if (my === token) emit('buffering', true); };
        video.onplaying = function () { if (my === token) emit('buffering', false); };
        video.onended = function () { if (my === token) emit('complete'); };
        video.onerror = function () { if (my === token) emit('error', 'Este navegador não reproduz esse formato'); };
        video.onloadedmetadata = function () {
            if (my !== token) return;
            if (startMs > 0) { try { video.currentTime = startMs / 1000; } catch (e) {} }
            emit('ready');
            startPoll();
        };
        video.src = url;
        var p = video.play();
        if (p && p.catch) p.catch(function () {});
    }

    function stop() {
        token++;
        stopPoll();
        if (av) {
            try { av.stop(); } catch (e) {}
            try { av.close(); } catch (e) {}
        } else if (video) {
            try { video.pause(); } catch (e) {}
            video.removeAttribute('src');
            try { video.load(); } catch (e) {}
            document.documentElement.className = document.documentElement.className.replace(/\s*h5/g, '');
        }
        paused = false;
    }

    function pause() {
        paused = true;
        if (av) { try { av.pause(); } catch (e) {} } else if (video) video.pause();
    }
    function play() {
        paused = false;
        if (av) { try { av.play(); } catch (e) {} } else if (video) video.play();
    }
    function toggle() { if (paused) play(); else pause(); return paused; }
    function isPaused() { return paused; }

    function position() {
        if (av) { try { return av.getCurrentTime() || 0; } catch (e) { return 0; } }
        return video ? Math.floor((video.currentTime || 0) * 1000) : 0;
    }
    function duration() {
        if (av) { try { return av.getDuration() || 0; } catch (e) { return 0; } }
        return video && isFinite(video.duration) ? Math.floor(video.duration * 1000) : 0;
    }
    function seekTo(ms) {
        var d = duration();
        if (d > 0) ms = Math.min(ms, d - 3000);
        ms = Math.max(0, ms);
        if (av) { try { av.seekTo(ms); } catch (e) {} }
        else if (video) { try { video.currentTime = ms / 1000; } catch (e) {} }
    }

    // Keep the video plane quiet while the app is in the background.
    function suspend() { if (av) { try { av.suspend(); } catch (e) { pause(); } } else pause(); }
    function restore() { if (av) { try { av.restore(); } catch (e) { play(); } } else play(); }

    return { on: on, open: open, stop: stop, pause: pause, play: play, toggle: toggle, isPaused: isPaused,
             position: position, duration: duration, seekTo: seekTo, suspend: suspend, restore: restore,
             isTV: function () { return !!getAv(); } };
})();
