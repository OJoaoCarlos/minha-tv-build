/* Xtream Codes API client (player_api.php) — the same login the provider's
 * get.php M3U link uses, but with real Live / Movies / Series categories. */
var Api = (function () {
    'use strict';

    var acc = null;          // {server, user, pass}
    var cache = {}, order = [];
    var MAX_LISTS = 14;      // stream lists kept in memory (category lists always kept)

    function setAccount(a) { acc = a; cache = {}; order = []; }
    function isDemo() { return !!acc && acc.server === 'demo'; }
    function enc(s) { return encodeURIComponent(s); }
    function base() { return acc.server.replace(/\/+$/, ''); }

    /* "servidor.com:8080", "http://servidor.com:8080/get.php?..." -> "http://servidor.com:8080" */
    function normalizeServer(s) {
        s = String(s || '').replace(/^\s+|\s+$/g, '');
        if (!s) return '';
        if (s.toLowerCase() === 'demo') return 'demo';
        if (!/^https?:\/\//i.test(s)) s = 'http://' + s;
        var m = /^(https?:\/\/[^\/?#\s]+)/i.exec(s);
        return m ? m[1] : '';
    }

    /* Full M3U link -> {server, user, pass, output} or null */
    function parseLink(link) {
        link = String(link || '').replace(/^\s+|\s+$/g, '');
        var server = normalizeServer(link);
        var q = link.split('?')[1] || '';
        var get = function (name) {
            var m = new RegExp('(?:^|&)' + name + '=([^&#]*)', 'i').exec(q);
            if (!m) return '';
            try { return decodeURIComponent(m[1].replace(/\+/g, ' ')); } catch (e) { return m[1]; }
        };
        var user = get('username'), pass = get('password');
        if (!server || !user || !pass) return null;
        return { server: server, user: user, pass: pass, output: get('output') };
    }

    function xhrJson(url, cb, timeoutMs) {
        var done = false;
        var x = new XMLHttpRequest();
        function finish(err, data) { if (done) return; done = true; cb(err, data); }
        try { x.open('GET', url, true); } catch (e) { finish('Endereço do servidor inválido'); return; }
        x.timeout = timeoutMs || 30000;
        x.ontimeout = function () { finish('O servidor demorou demais para responder'); };
        x.onerror = function () { finish('Sem conexão com o servidor'); };
        x.onload = function () {
            if (x.status >= 200 && x.status < 300) {
                var d = null;
                try { d = JSON.parse(x.responseText); } catch (e) { finish('Resposta inválida do servidor'); return; }
                finish(null, d);
            } else if (x.status === 401 || x.status === 403) {
                finish('Acesso negado pelo servidor (usuário/senha ou assinatura)');
            } else {
                finish('Erro do servidor (HTTP ' + x.status + ')');
            }
        };
        x.send();
    }

    function call(action, extra, cb, timeoutMs) {
        if (!acc) { cb('Sem conta configurada'); return; }
        if (isDemo()) { Demo.call(action, extra, cb); return; }
        var url = base() + '/player_api.php?username=' + enc(acc.user) + '&password=' + enc(acc.pass) +
                  (action ? '&action=' + action : '') + (extra ? '&' + extra : '');
        xhrJson(url, cb, timeoutMs);
    }

    function remember(key, data, isList) {
        cache[key] = data;
        if (!isList) return;
        order.push(key);
        while (order.length > MAX_LISTS) delete cache[order.shift()];
    }

    function cached(key, action, extra, isList, cb) {
        if (cache.hasOwnProperty(key)) { var d = cache[key]; setTimeout(function () { cb(null, d); }, 0); return; }
        call(action, extra, function (err, d) {
            if (!err) remember(key, d, isList);
            cb(err, d);
        });
    }

    function login(cb) {
        call('', '', function (err, d) {
            if (err) { cb(err); return; }
            if (!d || !d.user_info) { cb('Esse servidor não respondeu como um painel Xtream'); return; }
            var ui = d.user_info;
            if (String(ui.auth) === '0') { cb('Usuário ou senha incorretos'); return; }
            if (ui.status && /expired|banned|disabled/i.test(ui.status)) { cb('Assinatura ' + ui.status + ' no provedor'); return; }
            cb(null, d);
        }, 20000);
    }

    function list(fn) { return function (err, d) { fn(err, err ? [] : U.toArray(d)); }; }

    return {
        setAccount: setAccount, normalizeServer: normalizeServer, parseLink: parseLink, isDemo: isDemo, login: login,
        liveCategories: function (cb) { cached('lc', 'get_live_categories', '', false, list(cb)); },
        vodCategories: function (cb) { cached('vc', 'get_vod_categories', '', false, list(cb)); },
        seriesCategories: function (cb) { cached('sc', 'get_series_categories', '', false, list(cb)); },
        liveStreams: function (cat, cb) { cached('ls' + cat, 'get_live_streams', 'category_id=' + enc(cat), true, list(cb)); },
        vodStreams: function (cat, cb) { cached('vs' + cat, 'get_vod_streams', 'category_id=' + enc(cat), true, list(cb)); },
        seriesList: function (cat, cb) { cached('ss' + cat, 'get_series', 'category_id=' + enc(cat), true, list(cb)); },
        vodInfo: function (id, cb) { call('get_vod_info', 'vod_id=' + enc(id), cb); },
        seriesInfo: function (id, cb) { cached('si' + id, 'get_series_info', 'series_id=' + enc(id), true, cb); },
        // Whole catalogue, for search (big; not cached here — App keeps a slim index)
        allLive: function (cb) { call('get_live_streams', '', list(cb), 90000); },
        allVod: function (cb) { call('get_vod_streams', '', list(cb), 90000); },
        allSeries: function (cb) { call('get_series', '', list(cb), 90000); },

        liveUrl: function (id) {
            if (isDemo()) return Demo.liveUrl(id);
            var fmt = Store.setting('liveFormat') === 'm3u8' ? 'm3u8' : 'ts';
            return base() + '/live/' + enc(acc.user) + '/' + enc(acc.pass) + '/' + id + '.' + fmt;
        },
        movieUrl: function (id, ext) {
            if (isDemo()) return Demo.movieUrl(id);
            return base() + '/movie/' + enc(acc.user) + '/' + enc(acc.pass) + '/' + id + '.' + (ext || 'mp4');
        },
        episodeUrl: function (id, ext) {
            if (isDemo()) return Demo.episodeUrl(id);
            return base() + '/series/' + enc(acc.user) + '/' + enc(acc.pass) + '/' + id + '.' + (ext || 'mp4');
        }
    };
})();
