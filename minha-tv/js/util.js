/* Small helpers shared by every module. */
var U = (function () {
    'use strict';

    function $(id) { return document.getElementById(id); }

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function el(tag, cls, html) {
        var e = document.createElement(tag);
        if (cls) e.className = cls;
        if (html != null) e.innerHTML = html;
        return e;
    }

    function toArray(d) {
        if (!d) return [];
        if (Object.prototype.toString.call(d) === '[object Array]') return d;
        if (typeof d === 'object') {
            var out = [];
            for (var k in d) if (d.hasOwnProperty(k)) out.push(d[k]);
            return out;
        }
        return [];
    }

    // "Ação" -> "acao": accent- and case-insensitive matching for search.
    function fold(s) {
        s = String(s || '').toLowerCase();
        try { s = s.normalize('NFD').replace(/[̀-ͯ]/g, ''); } catch (e) {}
        return s;
    }

    function pad2(n) { return (n < 10 ? '0' : '') + n; }

    function fmtTime(ms) {
        if (!ms || ms < 0 || !isFinite(ms)) ms = 0;
        var s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
        s = s % 60;
        return h > 0 ? h + ':' + pad2(m) + ':' + pad2(s) : m + ':' + pad2(s);
    }

    function fmtDuration(secs) {
        secs = parseInt(secs, 10);
        if (!secs || secs <= 0) return '';
        if (secs < 60) return secs + ' s';
        var h =Math.floor(secs / 3600), m = Math.round((secs % 3600) / 60);
        return h > 0 ? h + 'h ' + pad2(m) + 'min' : m + 'min';
    }

    function fmtDate(unixSecs) {
        var n = parseInt(unixSecs, 10);
        if (!n) return 'Sem vencimento';
        var d = new Date(n * 1000);
        return pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1) + '/' + d.getFullYear();
    }

    function initials(name) {
        var w = String(name || '').replace(/[^A-Za-z0-9À-ÿ ]/g, ' ').split(/\s+/);
        var out = '';
        for (var i = 0; i < w.length && out.length < 3; i++) if (w[i]) out += w[i].charAt(0);
        return out.toUpperCase() || 'TV';
    }

    function img(src, alt, onFail) {
        var i = document.createElement('img');
        i.alt = '';
        i.onerror = function () { i.onerror = null; if (i.parentNode) i.parentNode.removeChild(i); if (onFail) onFail(); };
        if (src) i.src = src; else setTimeout(i.onerror, 0);
        return i;
    }

    function debounce(fn, ms) {
        var t = null;
        return function () {
            var args = arguments, self = this;
            clearTimeout(t);
            t = setTimeout(function () { fn.apply(self, args); }, ms);
        };
    }

    var toastTimer = null;
    function toast(msg, ms) {
        var t = $('toast');
        t.textContent = msg;
        t.className = '';
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { t.className = 'hidden'; }, ms || 3000);
    }

    return { $: $, esc: esc, el: el, toArray: toArray, fold: fold, fmtTime: fmtTime,
             fmtDuration: fmtDuration, fmtDate: fmtDate, initials: initials, img: img,
             debounce: debounce, toast: toast, pad2: pad2 };
})();
