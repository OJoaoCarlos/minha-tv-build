/* Everything the app remembers, in localStorage on the TV:
 * the account, settings, favorites and "continue watching" positions. */
var Store = (function () {
    'use strict';

    var P = 'mtv_';

    function get(k, def) {
        try {
            var v = localStorage.getItem(P + k);
            return v === null ? def : JSON.parse(v);
        } catch (e) { return def; }
    }
    function set(k, v) { try { localStorage.setItem(P + k, JSON.stringify(v)); } catch (e) {} }
    function del(k) { try { localStorage.removeItem(P + k); } catch (e) {} }

    /* ── Account ── {server, user, pass, info} */
    function account() { return get('account', null); }
    function setAccount(a) { set('account', a); }
    function clearAccount() { del('account'); }

    /* ── Settings ── */
    var DEFAULTS = { liveFormat: 'ts', hideAdult: true };
    function setting(k) {
        var s = get('settings', {});
        return s.hasOwnProperty(k) ? s[k] : DEFAULTS[k];
    }
    function setSetting(k, v) { var s = get('settings', {}); s[k] = v; set('settings', s); }

    /* ── Favorites ── [{type:'live'|'movie'|'series', id, name, icon, ext}] */
    function favorites(type) {
        var all = get('favs', []);
        if (!type) return all;
        var out = [];
        for (var i = 0; i < all.length; i++) if (all[i].type === type) out.push(all[i]);
        return out;
    }
    function favIndex(all, type, id) {
        for (var i = 0; i < all.length; i++) if (all[i].type === type && String(all[i].id) === String(id)) return i;
        return -1;
    }
    function isFav(type, id) { return favIndex(get('favs', []), type, id) !== -1; }
    function toggleFav(item) {
        var all = get('favs', []);
        var i = favIndex(all, item.type, item.id);
        if (i === -1) all.unshift({ type: item.type, id: item.id, name: item.name, icon: item.icon || '', ext: item.ext || '' });
        else all.splice(i, 1);
        set('favs', all);
        return i === -1;
    }

    /* ── Continue watching ──
     * key 'movie:<id>' or 'ep:<episodeId>' ->
     * {key, type:'movie'|'episode', id, name, icon, ext, pos, dur, ts,
     *  seriesId, seriesName, season, epNum} */
    function progressAll() { return get('progress', {}); }
    function progress(key) { return progressAll()[key] || null; }
    function saveProgress(entry) {
        if (!entry || !entry.key) return;
        var all = progressAll();
        if (entry.dur > 0 && entry.pos / entry.dur > 0.95) {
            delete all[entry.key];                    // finished: drop it
        } else if (entry.pos > 15000) {               // ignore the first seconds
            entry.ts = Date.now();
            all[entry.key] = entry;
        }
        // keep the newest 60
        var keys = [];
        for (var k in all) if (all.hasOwnProperty(k)) keys.push(k);
        if (keys.length > 60) {
            keys.sort(function (a, b) { return all[b].ts - all[a].ts; });
            for (var j = 60; j < keys.length; j++) delete all[keys[j]];
        }
        set('progress', all);
    }
    function removeProgress(key) { var all = progressAll(); delete all[key]; set('progress', all); }
    function clearProgress() { del('progress'); }

    // One card per movie, and one per series (its latest episode).
    function continueList() {
        var all = progressAll(), list = [], seen = {};
        for (var k in all) if (all.hasOwnProperty(k)) list.push(all[k]);
        list.sort(function (a, b) { return b.ts - a.ts; });
        var out = [];
        for (var i = 0; i < list.length; i++) {
            var e = list[i];
            var group = e.type === 'episode' ? 's:' + e.seriesId : e.key;
            if (seen[group]) continue;
            seen[group] = true;
            out.push(e);
            if (out.length >= 20) break;
        }
        return out;
    }

    return { account: account, setAccount: setAccount, clearAccount: clearAccount,
             setting: setting, setSetting: setSetting,
             favorites: favorites, isFav: isFav, toggleFav: toggleFav,
             progress: progress, saveProgress: saveProgress, removeProgress: removeProgress,
             clearProgress: clearProgress, continueList: continueList };
})();
