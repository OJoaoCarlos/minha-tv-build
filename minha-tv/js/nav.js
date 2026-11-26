/* Remote-control navigation.
 *  - Arrow keys move focus to the nearest `.focusable` in that direction.
 *  - Containers with [data-group] remember their last focused child, so
 *    going back into a column lands where you left it.
 *  - `.vscroll` / `.hscroll` ancestors scroll to keep the focus in view.
 *  - Text fields (.field[data-input]) open the TV keyboard only on OK. */
var Nav = (function () {
    'use strict';

    var K = { LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, ENTER: 13, BACK: 10009,
              PLAYPAUSE: 10252, PLAY: 415, PAUSE: 19, STOP: 413, FF: 417, RW: 412,
              CHUP: 427, CHDOWN: 428, RED: 403, GREEN: 404, YELLOW: 405, BLUE: 406, INFO: 457 };
    var IME_DONE = 65376, IME_CANCEL = 65385;
    // Desktop keyboard equivalents, for testing in a browser.
    var PC = { 8: 'BACK', 27: 'BACK', 33: 'CHUP', 34: 'CHDOWN', 32: 'PLAYPAUSE', 70: 'FF', 82: 'RW' };
    var NAMES = {};
    for (var k in K) if (K.hasOwnProperty(k)) NAMES[K[k]] = k;

    var cur = null, scope = null, handler = null, backFn = null, editing = null, scale = 1;

    function setScope(el) { scope = el; }
    function setHandler(fn) { handler = fn; }
    function onBack(fn) { backFn = fn; }
    function setScale(s) { scale = s || 1; }
    function current() { return cur && document.body.contains(cur) ? cur : null; }
    function isEditing() { return !!editing; }

    function rect(el) { return el.getBoundingClientRect(); }
    function visible(el) { var r = rect(el); return r.width > 0 && r.height > 0; }
    function inScope(el) { return !scope || scope.contains(el); }

    function groupOf(el) {
        var g = el.parentNode;
        while (g && g.getAttribute) { if (g.getAttribute('data-group')) return g; g = g.parentNode; }
        return null;
    }

    function focus(el, noScroll) {
        if (!el) return;
        if (cur && cur !== el) cur.classList.remove('focused');
        cur = el;
        el.classList.add('focused');
        var g = el.parentNode;
        while (g && g.getAttribute) { if (g.getAttribute('data-group')) g._last = el; g = g.parentNode; }
        if (!noScroll) ensureVisible(el);
        if (el._onFocus) el._onFocus(el);
    }

    function focusFirst(root) {
        root = root || scope || document.body;
        var list = root.querySelectorAll('.focusable');
        for (var i = 0; i < list.length; i++) if (visible(list[i])) { focus(list[i]); return true; }
        return false;
    }

    // Focus what this group remembers, else its first visible item.
    function focusGroup(groupEl) {
        if (!groupEl) return false;
        var last = groupEl._last;
        if (last && groupEl.contains(last) && visible(last)) { focus(last); return true; }
        return focusFirst(groupEl);
    }

    function ensureVisible(el) {
        var p = el.parentNode;
        while (p && p.classList) {
            if (p.classList.contains('vscroll')) scrollV(p, el);
            if (p.classList.contains('hscroll')) scrollH(p, el);
            p = p.parentNode;
        }
    }
    function scrollV(sc, el) {
        var sr = rect(sc), er = rect(el), pad = 50;
        var top = (er.top - sr.top) / scale + sc.scrollTop, bottom = top + er.height / scale;
        if (top - pad < sc.scrollTop) sc.scrollTop = top < 260 ? 0 : top - pad - 40;
        else if (bottom + pad > sc.scrollTop + sc.clientHeight) sc.scrollTop = bottom + pad - sc.clientHeight;
    }
    function scrollH(sc, el) {
        var sr = rect(sc), er = rect(el), pad = 40;
        var left = (er.left - sr.left) / scale + sc.scrollLeft, right = left + er.width / scale;
        if (left - pad < sc.scrollLeft) sc.scrollLeft = Math.max(0, left - pad);
        else if (right + pad > sc.scrollLeft + sc.clientWidth) sc.scrollLeft = right + pad - sc.clientWidth;
    }

    function move(dir) {
        var c0 = current();
        if (!c0 || !visible(c0)) { focusFirst(); return; }
        if (c0._onMove && c0._onMove(dir) === true) return;
        var c = rect(c0), cx = c.left + c.width / 2, cy = c.top + c.height / 2;
        var list = (scope || document.body).querySelectorAll('.focusable');
        var best = null, bestScore = Infinity;
        for (var i = 0; i < list.length; i++) {
            var e = list[i];
            if (e === c0) continue;
            var r = rect(e);
            if (r.width <= 0 || r.height <= 0) continue;
            var ex = r.left + r.width / 2, ey = r.top + r.height / 2, primary, ortho, align;
            if (dir === 'RIGHT') {
                if (ex <= cx + 1 || r.left < c.left + 1) continue;
                primary = Math.max(0, r.left - c.right);
                ortho = Math.max(0, r.top - c.bottom, c.top - r.bottom);
                align = Math.abs(ey - cy);
            } else if (dir === 'LEFT') {
                if (ex >= cx - 1 || r.right > c.right - 1) continue;
                primary = Math.max(0, c.left - r.right);
                ortho = Math.max(0, r.top - c.bottom, c.top - r.bottom);
                align = Math.abs(ey - cy);
            } else if (dir === 'DOWN') {
                if (ey <= cy + 1 || r.top < c.top + 1) continue;
                primary = Math.max(0, r.top - c.bottom);
                ortho = Math.max(0, r.left - c.right, c.left - r.right);
                align = Math.abs(r.left - c.left);
            } else {
                if (ey >= cy - 1 || r.bottom > c.bottom - 1) continue;
                primary = Math.max(0, c.top - r.bottom);
                ortho = Math.max(0, r.left - c.right, c.left - r.right);
                align = Math.abs(r.left - c.left);
            }
            var score = primary + ortho * 4 + align * 0.05;
            if (score < bestScore) { bestScore = score; best = e; }
        }
        if (!best) { if (c0._onEdge) c0._onEdge(dir); return; }
        var gFrom = groupOf(c0), gTo = groupOf(best);
        if (gTo && gTo !== gFrom && !gTo.contains(c0)) {
            var last = gTo._last;
            if (last && last !== best && gTo.contains(last) && visible(last)) best = last;
        }
        focus(best);
    }

    function enter() {
        var c0 = current();
        if (!c0) return;
        if (c0.getAttribute('data-input')) { edit(c0); return; }
        if (c0._onEnter) c0._onEnter(c0);
    }

    /* ── Text fields ── */
    function edit(field) {
        var inp = document.getElementById(field.getAttribute('data-input'));
        if (!inp) return;
        editing = inp;
        field.classList.add('editing');
        try { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); } catch (e) {}
    }
    function bindFields(root) {
        var fields = root.querySelectorAll('.field[data-input]');
        for (var i = 0; i < fields.length; i++) (function (field) {
            var inp = document.getElementById(field.getAttribute('data-input'));
            if (!inp || inp._bound) return;
            inp._bound = true;
            inp.addEventListener('blur', function () {
                field.classList.remove('editing');
                if (editing === inp) editing = null;
                if (field._onCommit) field._onCommit(inp.value);
            });
            inp.addEventListener('input', function () { if (field._onInput) field._onInput(inp.value); });
        })(fields[i]);
    }

    function onKey(e) {
        var code = e.keyCode || e.which;
        if (editing) {
            if (code === 13 || code === IME_DONE || code === IME_CANCEL || code === K.BACK || code === 27) {
                e.preventDefault();
                editing.blur();
            } else if (code === K.UP || code === K.DOWN) {
                e.preventDefault();
                editing.blur();
                move(code === K.UP ? 'UP' : 'DOWN');
            }
            return;
        }
        var name = NAMES[code] || PC[code];
        if (!name) return;
        e.preventDefault();
        if (handler && handler(name, e) === true) return;
        switch (name) {
            case 'LEFT': case 'RIGHT': case 'UP': case 'DOWN': move(name); break;
            case 'ENTER': enter(); break;
            case 'BACK': if (backFn) backFn(); break;
            default:
                var c0 = current();
                if (c0 && c0._onKey) c0._onKey(name);
        }
    }

    function registerTvKeys() {
        if (typeof tizen === 'undefined' || !tizen.tvinputdevice) return;
        var keys = ['MediaPlayPause', 'MediaPlay', 'MediaPause', 'MediaStop', 'MediaFastForward', 'MediaRewind',
                    'ChannelUp', 'ChannelDown', 'ColorF0Red', 'ColorF1Green', 'ColorF2Yellow', 'ColorF3Blue', 'Info'];
        for (var i = 0; i < keys.length; i++) { try { tizen.tvinputdevice.registerKey(keys[i]); } catch (e) {} }
    }

    function init() {
        registerTvKeys();
        document.addEventListener('keydown', onKey, true);
        // Mouse support for desktop testing
        document.addEventListener('mouseover', function (e) {
            var t = e.target.closest ? e.target.closest('.focusable') : null;
            if (t && t !== cur && inScope(t) && !editing) focus(t, true);
        });
        document.addEventListener('click', function (e) {
            var t = e.target.closest ? e.target.closest('.focusable') : null;
            if (!t || !inScope(t)) return;
            focus(t, true);
            enter();
        });
    }

    return { K: K, init: init, focus: focus, focusFirst: focusFirst, focusGroup: focusGroup, current: current,
             move: move, setScope: setScope, setHandler: setHandler, onBack: onBack, setScale: setScale,
             bindFields: bindFields, isEditing: isEditing, edit: edit };
})();
