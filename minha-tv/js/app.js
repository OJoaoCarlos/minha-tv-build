/* Minha TV — screens, flow and playback.  ES5 for the Tizen 3.0 WebView. */
var App = (function () {
    'use strict';

    var $ = U.$, esc = U.esc;
    var VERSION = '1.0.0';
    var SCREENS = { home: 'scr-home', live: 'scr-live', movies: 'scr-movies', series: 'scr-series',
                    search: 'scr-search', favorites: 'scr-favorites', settings: 'scr-settings', detail: 'scr-detail' };
    var TITLES = { live: 'TV ao vivo', movies: 'Filmes', series: 'Séries' };
    var ADULT = /(xxx|adult|adulto|\+ ?18|18 ?\+|porn|erot|sexy|hot ?club)/i;

    var PLAY_SVG = '<svg viewBox="0 0 24 24"><path d="M7 4.5v15l12.5-7.5z"/></svg>';
    var STAR_SVG = '<svg viewBox="0 0 24 24"><path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z"/></svg>';
    var RESTART_SVG = '<svg viewBox="0 0 24 24"><path d="M12 4a8 8 0 11-7.7 10h2.1A6 6 0 1012 6v3L7.5 5 12 1z"/></svg>';
    var TILE_SVG = {
        live: '<svg viewBox="0 0 24 24"><path d="M2 6h20v13H2z M4 8v9h16V8z M7 21h10v1.5H7z M8.5 1.5l3.5 3.2 3.5-3.2 1 1.1L13.4 5.5h-2.8L7.5 2.6z" fill-rule="evenodd"/></svg>',
        movies: '<svg viewBox="0 0 24 24"><path d="M4 4h16v16H4z M6 6v2h2V6z M6 11v2h2v-2z M6 16v2h2v-2z M16 6v2h2V6z M16 11v2h2v-2z M16 16v2h2v-2z" fill-rule="evenodd"/></svg>',
        series: '<svg viewBox="0 0 24 24"><path d="M6 3h12v2H6z M4 7h16v2H4z M2 11h20v10H2z M10 13.5v5l4.5-2.5z" fill-rule="evenodd"/></svg>',
        search: '<svg viewBox="0 0 24 24"><path d="M10 3a7 7 0 015.6 11.2l5.1 5.1-1.4 1.4-5.1-5.1A7 7 0 1110 3zm0 2a5 5 0 100 10 5 5 0 000-10z"/></svg>'
    };

    var section = null, shown = null;
    var stack = [];               // overlays: {type:'detail'|'player', screen, focus}
    var wantFocus = {};
    var dirty = false;            // favorites / progress changed -> home & favorites re-render
    var lastBack = 0;
    var P = null;                 // current playback session

    /* ── Screens ───────────────────────────────────────────────────── */
    function showScreen(name) {
        for (var k in SCREENS) if (SCREENS.hasOwnProperty(k)) {
            var e = $(SCREENS[k]);
            if (k === name) e.classList.add('shown'); else e.classList.remove('shown');
        }
        shown = name;
    }
    function screenEl(name) { return $(SCREENS[name]); }
    function sideItem(name) { return document.querySelector('#sidebar .side-item[data-section="' + name + '"]'); }
    function inSidebar(el) { return !!el && $('sidebar').contains(el); }

    function markSide(name) {
        var items = document.querySelectorAll('#sidebar .side-item');
        for (var i = 0; i < items.length; i++) {
            if (items[i].getAttribute('data-section') === name) items[i].classList.add('active');
            else items[i].classList.remove('active');
        }
        $('sidebar')._last = sideItem(name);
    }

    function focusContent() {
        var scr = screenEl(shown);
        var g = scr.getAttribute('data-group') ? scr : scr.querySelector('[data-group]');
        if (g && Nav.focusGroup(g)) return true;
        if (Nav.focusFirst(scr)) return true;
        wantFocus[shown] = true;
        return false;
    }
    function contentReady(name) {
        var c = Nav.current();
        var lost = !c || inSidebar(c) || c.getBoundingClientRect().width === 0;
        if (wantFocus[name] && shown === name && lost) {
            wantFocus[name] = false;
            focusContent();
        }
    }

    /* ── Boot / setup ──────────────────────────────────────────────── */
    function boot() {
        fitDesktop();
        window.addEventListener('resize', fitDesktop);
        Nav.init();
        Nav.bindFields(document.body);
        Nav.onBack(back);
        initSidebar();
        initSetup();
        initSearch();
        initPlayerEvents();
        clock();
        setInterval(clock, 20000);
        document.addEventListener('visibilitychange', onVisibility);
        var a = Store.account();
        if (a) { Api.setAccount(a); enterMain(); refreshAccount(); }
        else showSetup('');
    }

    // In a desktop browser, scale the 1920x1080 layout to the window.
    function fitDesktop() {
        if (Player.isTV()) return;
        $('av').style.display = 'none';   // desktop browsers draw a plugin placeholder
        var s = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
        if (!(s > 0)) return;
        if (s > 0.98 && s < 1.02) s = 1;
        var t = 'scale(' + s + ')';
        var els = [$('app'), $('h5video')];
        for (var i = 0; i < els.length; i++) {
            els[i].style.webkitTransformOrigin = '0 0'; els[i].style.transformOrigin = '0 0';
            els[i].style.webkitTransform = t; els[i].style.transform = t;
        }
        Nav.setScale(s);
    }

    function clock() {
        var d = new Date();
        $('clock').textContent = U.pad2(d.getHours()) + ':' + U.pad2(d.getMinutes());
    }

    function setupMsg(text, ok) {
        var m = $('setup-msg');
        m.textContent = text || '';
        m.className = 'setup-msg' + (ok ? ' ok' : '');
    }

    function showSetup(msg) {
        closeAllOverlays();
        $('main').classList.add('hidden');
        $('setup').classList.remove('hidden');
        if (pairing && pairing.timer) clearTimeout(pairing.timer);
        pairing = null;
        $('pair').classList.add('hidden');
        $('setup-form').classList.remove('hidden');
        Nav.setScope($('setup'));
        var a = Store.account();
        if (a && a.server !== 'demo') { $('f-server').value = a.server; $('f-user').value = a.user; }
        setupMsg(msg);
        Nav.focusFirst($('setup'));
    }

    var loggingIn = false;
    function initSetup() {
        $('btn-login')._onEnter = doLogin;
        $('btn-pair')._onEnter = startPairing;
        $('btn-pair-cancel')._onEnter = stopPairing;
        $('btn-pair-retry')._onEnter = startPairing;
        document.querySelector('[data-input="f-link"]')._onCommit = function (v) {
            if (!v) return;
            var p = Api.parseLink(v);
            if (p) setupMsg('Link reconhecido. Selecione Entrar.', true);
            else setupMsg('Não reconheci esse link. Ele deve ter username= e password=.');
        };
    }

    function slimInfo(ui) {
        ui = ui || {};
        return { status: ui.status || '', exp: ui.exp_date || null, max: ui.max_connections || '', user: ui.username || '' };
    }

    /* Turn a full M3U link or separate fields into an account.
     * Returns {account} or {error}. */
    function accountFrom(link, server, user, pass) {
        link = String(link || '').replace(/^\s+|\s+$/g, '');
        if (link) {
            var p = Api.parseLink(link);
            if (!p) return { error: 'Link inválido: ele precisa ter username= e password=.' };
            return { account: { server: p.server, user: p.user, pass: p.pass }, output: p.output };
        }
        var a = { server: Api.normalizeServer(server), user: String(user || '').replace(/^\s+|\s+$/g, ''), pass: String(pass || '') };
        if (a.server === 'demo') { a.user = a.user || 'demo'; a.pass = a.pass || 'demo'; }
        if (!a.server || !a.user || !a.pass) return { error: 'Preencha servidor, usuário e senha.' };
        return { account: a, output: '' };
    }

    function loginWith(r, report, cb) {
        if (loggingIn) return;
        if (r.error) { report(r.error); cb(r.error); return; }
        var a = r.account;
        loggingIn = true;
        report('Conectando…', true);
        Api.setAccount(a);
        Api.login(function (err, d) {
            loggingIn = false;
            if (err) { report(err); cb(err); return; }
            if (/^(m3u8|hls)$/i.test(r.output)) Store.setSetting('liveFormat', 'm3u8');
            else if (/^ts$/i.test(r.output)) Store.setSetting('liveFormat', 'ts');
            a.info = slimInfo(d.user_info);
            Store.setAccount(a);
            $('f-pass').value = ''; $('f-link').value = '';
            setupMsg('');
            cb(null);
            enterMain();
        });
    }

    function doLogin() {
        loginWith(accountFrom($('f-link').value, $('f-server').value, $('f-user').value, $('f-pass').value),
                  setupMsg, function () {});
    }

    /* ── Pairing: a computer/phone on the same network sends the account ──
     * The PC runs ferramentas/configurar-tv.js (port 8766).  The TV finds it
     * by probing its own /24 subnet, shows a 6-digit code, and polls until
     * the user submits that code + the link on the PC page. */
    var PAIR_PORT = 8766, pairing = null;

    function getJson(url, timeout, cb) {
        var x = new XMLHttpRequest(), done = false;
        function fin(e, d) { if (done) return; done = true; cb(e, d); }
        try { x.open('GET', url, true); } catch (e) { fin('url'); return; }
        x.timeout = timeout;
        x.ontimeout = function () { fin('timeout'); };
        x.onerror = function () { fin('error'); };
        x.onload = function () {
            if (x.status !== 200) { fin('http ' + x.status); return; }
            try { fin(null, JSON.parse(x.responseText)); } catch (e) { fin('json'); }
        };
        x.send();
    }

    function tvSubnets(cb) {
        var called = false;
        function done(ip) {
            if (called) return;
            called = true;
            var m = /^(\d+\.\d+\.\d+)\.\d+$/.exec(ip || '');
            cb(m ? [m[1]] : ['192.168.0', '192.168.1', '10.0.0'], ip || '');
        }
        try { var ip = webapis.network.getIp(); if (ip) { done(ip); return; } } catch (e) {}
        try {
            tizen.systeminfo.getPropertyValue('WIFI_NETWORK', function (w) {
                if (w && w.ipAddress) { done(w.ipAddress); return; }
                try {
                    tizen.systeminfo.getPropertyValue('ETHERNET_NETWORK', function (n) { done(n && n.ipAddress); }, function () { done(''); });
                } catch (e2) { done(''); }
            }, function () { done(''); });
        } catch (e) { done(''); }
        setTimeout(function () { done(''); }, 3000);
    }

    function findPairHost(cb) {
        var last = null;
        try { last = localStorage.getItem('mtv_pairhost'); } catch (e) {}
        tvSubnets(function (subnets, selfIp) {
            var hosts = [];
            if (last) hosts.push(last);
            for (var s = 0; s < subnets.length; s++)
                for (var i = 1; i < 255; i++) {
                    var h = subnets[s] + '.' + i;
                    if (h !== selfIp && h !== last) hosts.push(h);
                }
            var idx = 0, active = 0, found = false;
            function next() {
                if (found) return;
                while (active < 40 && idx < hosts.length) probe(hosts[idx++]);
                if (active === 0 && idx >= hosts.length) cb(null);
            }
            function probe(h) {
                active++;
                getJson('http://' + h + ':' + PAIR_PORT + '/minhatv/ping', 1500, function (err, d) {
                    active--;
                    if (found) return;
                    if (!err && d && d.app === 'minhatv-pair') { found = true; cb(h); return; }
                    next();
                });
            }
            next();
        });
    }

    function pairStatus(text, hint) {
        $('pair-status').textContent = text || '';
        if (hint != null) $('pair-hint').textContent = hint;
    }

    function startPairing() {
        if (pairing && pairing.timer) clearTimeout(pairing.timer);
        var code = String(Math.floor(100000 + Math.random() * 900000));
        var my = pairing = { code: code, host: null, timer: null };
        $('pair-code').textContent = code.slice(0, 3) + ' ' + code.slice(3);
        $('setup-form').classList.add('hidden');
        $('pair').classList.remove('hidden');
        $('btn-pair-retry').classList.add('hidden');
        pairStatus('Procurando o computador na rede…', '');
        Nav.focus($('btn-pair-cancel'));
        findPairHost(function (host) {
            if (pairing !== my) return;
            if (!host) {
                pairStatus('Não encontrei o computador.',
                    'Confira se o programa de configuração está aberto no PC e se a TV e o PC estão na mesma rede.');
                $('btn-pair-retry').classList.remove('hidden');
                Nav.focus($('btn-pair-retry'));
                return;
            }
            my.host = host;
            try { localStorage.setItem('mtv_pairhost', host); } catch (e) {}
            pairStatus('Computador encontrado. Aguardando você enviar os dados…',
                'Pelo celular (mesma rede Wi-Fi), use o endereço http://' + host + ':' + PAIR_PORT);
            pollPairing(my);
        });
    }

    function stopPairing() {
        if (pairing && pairing.timer) clearTimeout(pairing.timer);
        pairing = null;
        $('pair').classList.add('hidden');
        $('setup-form').classList.remove('hidden');
        Nav.focus($('btn-pair'));
    }

    function pollPairing(my) {
        if (pairing !== my) return;
        getJson('http://' + my.host + ':' + PAIR_PORT + '/minhatv/config?code=' + my.code, 5000, function (err, d) {
            if (pairing !== my) return;
            if (!err && d && (d.link || d.server)) {
                pairStatus('Dados recebidos. Conectando ao provedor…');
                loginWith(accountFrom(d.link, d.server, d.user, d.pass),
                    function (msg) { pairStatus(msg); },
                    function (e) {
                        if (pairing !== my) return;
                        if (e) {
                            pairStatus(e + '. Confira os dados e envie de novo pelo computador.');
                            my.timer = setTimeout(function () { pollPairing(my); }, 2000);
                        } else {
                            pairing = null;
                            $('pair').classList.add('hidden');
                            $('setup-form').classList.remove('hidden');
                        }
                    });
                return;
            }
            my.timer = setTimeout(function () { pollPairing(my); }, 2000);
        });
    }

    function refreshAccount() {
        Api.login(function (err, d) {
            if (err) {
                if (/incorretos|Assinatura|negado/.test(err)) U.toast(err + ' — confira em Ajustes.', 6000);
                return;
            }
            var a = Store.account();
            if (a) { a.info = slimInfo(d.user_info); Store.setAccount(a); }
        });
    }

    function enterMain() {
        $('setup').classList.add('hidden');
        $('main').classList.remove('hidden');
        Nav.setScope($('main'));
        resetCatalog();
        goSection('home');
        if (!focusContent()) Nav.focus(sideItem('home'));
    }

    // Forget loaded lists (after login, settings change, "update lists").
    function resetCatalog() {
        var kinds = ['live', 'movies', 'series'];
        for (var i = 0; i < kinds.length; i++) {
            var scr = screenEl(kinds[i]);
            scr._loaded = false; scr._catEl = null; scr._tok = (scr._tok || 0) + 1;
            scr.querySelector('.col-cats').innerHTML = '';
            scr.querySelector('.col-items').innerHTML = '';
            scr.querySelector('.col-cats')._last = null;
        }
        searchIndex = null;
        $('f-search').value = '';
        $('scr-search').querySelector('.search-results').innerHTML = '';
    }

    /* ── Sidebar & sections ────────────────────────────────────────── */
    function initSidebar() {
        var items = document.querySelectorAll('#sidebar .side-item');
        for (var i = 0; i < items.length; i++) (function (it) {
            it._onEnter = function () {
                goSection(it.getAttribute('data-section'));
                focusContent();
            };
        })(items[i]);
    }

    function goSection(name) {
        closeAllOverlays();
        section = name;
        markSide(name);
        showScreen(name);
        if (name === 'home') renderHome();
        else if (name === 'live' || name === 'movies' || name === 'series') loadSplit(name);
        else if (name === 'search') renderSearchHint();
        else if (name === 'favorites') renderFavorites();
        else if (name === 'settings') renderSettings();
    }

    function closeAllOverlays() {
        if (P) stopPlayback();
        stack = [];
        $('scr-detail').innerHTML = '';
    }

    /* ── Back key ──────────────────────────────────────────────────── */
    function back() {
        if (P) { closePlayer(); return; }
        if (pairing) { stopPairing(); return; }
        if (!$('setup').classList.contains('hidden')) { exitPrompt(); return; }
        if (stack.length && stack[stack.length - 1].type === 'detail') { popDetail(); return; }
        var cur = Nav.current();
        if (!inSidebar(cur)) { Nav.focus(sideItem(section)); return; }
        if (section !== 'home') { goSection('home'); Nav.focus(sideItem('home')); return; }
        exitPrompt();
    }
    function exitPrompt() {
        if (Date.now() - lastBack < 2500) {
            try { tizen.application.getCurrentApplication().exit(); } catch (e) { try { window.close(); } catch (e2) {} }
            return;
        }
        lastBack = Date.now();
        U.toast('Pressione VOLTAR de novo para sair', 2500);
    }

    /* ── Helpers for cards ─────────────────────────────────────────── */
    function btn(label, svg, onEnter, cls) {
        var b = U.el('div', 'btn focusable' + (cls ? ' ' + cls : ''), (svg || '') + esc(label));
        b._onEnter = onEnter;
        return b;
    }

    function posterCard(name, icon, onEnter, progress, wide) {
        var c = U.el('div', 'card focusable' + (wide ? ' wide' : ''));
        var p = U.el('div', 'poster');
        p.appendChild(U.el('div', 'ph', esc(wide ? U.initials(name) : name)));
        if (icon) p.appendChild(U.img(icon));
        if (progress != null) {
            var bar = U.el('div', 'prog');
            var fill = U.el('div');
            fill.style.width = Math.max(3, Math.min(100, Math.round(progress * 100))) + '%';
            bar.appendChild(fill);
            p.appendChild(bar);
        }
        c.appendChild(p);
        c.appendChild(U.el('div', 'title', esc(name)));
        c._onEnter = onEnter;
        return c;
    }

    function favButton(item) {
        var f = U.el('div', 'fav-btn focusable' + (Store.isFav(item.type, item.id) ? ' on' : ''), STAR_SVG);
        f._onEnter = function () {
            var on = Store.toggleFav(item);
            if (on) f.classList.add('on'); else f.classList.remove('on');
            dirty = true;
            U.toast(on ? 'Adicionado aos favoritos' : 'Removido dos favoritos', 1800);
        };
        return f;
    }

    // Append items in batches; more are added as focus nears the end.
    function batchRender(container, list, make, batch) {
        var idx = 0;
        function more() {
            var end = Math.min(list.length, idx + batch);
            var frag = document.createDocumentFragment();
            for (; idx < end; idx++) frag.appendChild(make(list[idx], idx));
            container.appendChild(frag);
        }
        container._more = function (i) { if (idx < list.length && i >= idx - Math.ceil(batch / 2)) more(); };
        more();
    }

    function hideAdult() { return !!Store.setting('hideAdult'); }
    function filterCats(list) {
        if (!hideAdult()) return list;
        var out = [];
        for (var i = 0; i < list.length; i++) if (!ADULT.test(list[i].category_name || '')) out.push(list[i]);
        return out;
    }

    /* ── Live / Movies / Series: categories + items ────────────────── */
    function catApi(kind) { return kind === 'live' ? Api.liveCategories : kind === 'movies' ? Api.vodCategories : Api.seriesCategories; }
    function itemsApi(kind) { return kind === 'live' ? Api.liveStreams : kind === 'movies' ? Api.vodStreams : Api.seriesList; }

    function loadSplit(kind) {
        var scr = screenEl(kind);
        if (scr._loaded) return;
        scr._loaded = true;
        var cats = scr.querySelector('.col-cats'), items = scr.querySelector('.col-items');
        var head = '<div class="section-title">' + TITLES[kind] + '</div>';
        cats.innerHTML = head + '<div class="loading">Carregando categorias…</div>';
        items.innerHTML = '';
        var tok = scr._tok = (scr._tok || 0) + 1;
        catApi(kind)(function (err, list) {
            if (tok !== scr._tok) return;
            if (err) {
                scr._loaded = false;
                cats.innerHTML = head + '<div class="empty">' + esc(err) + '</div>';
                var r = btn('Tentar de novo', '', function () { loadSplit(kind); focusContent(); });
                cats.appendChild(r);
                contentReady(kind);
                return;
            }
            list = filterCats(list);
            cats.innerHTML = head;
            if (!list.length) { cats.innerHTML += '<div class="empty">Nenhuma categoria.</div>'; return; }
            var first = null;
            for (var i = 0; i < list.length; i++) (function (c) {
                var d = U.el('div', 'cat focusable', esc(c.category_name || 'Sem nome'));
                d._cat = c;
                d._onFocus = function () { scheduleCat(kind, d); };
                d._onEnter = function () { openCat(kind, d, true); };
                cats.appendChild(d);
                if (!first) first = d;
            })(list[i]);
            cats._last = first;
            openCat(kind, first, false);
            contentReady(kind);
        });
    }

    var catTimer = null;
    function scheduleCat(kind, d) {
        clearTimeout(catTimer);
        catTimer = setTimeout(function () { if (Nav.current() === d) openCat(kind, d, false); }, 380);
    }

    function openCat(kind, d, focusItems) {
        var scr = screenEl(kind), items = scr.querySelector('.col-items');
        if (scr._catEl === d) { if (focusItems) Nav.focusGroup(items); return; }
        if (scr._catEl) scr._catEl.classList.remove('selected');
        d.classList.add('selected');
        scr._catEl = d;
        var c = d._cat, tok = ++scr._tok;
        items.scrollTop = 0;
        items._last = null;
        items.innerHTML = '<div class="section-title">' + esc(c.category_name) + '</div><div class="loading">Carregando…</div>';
        itemsApi(kind)(c.category_id, function (err, list) {
            if (tok !== scr._tok) return;
            if (err) { items.innerHTML = '<div class="section-title">' + esc(c.category_name) + '</div><div class="empty">' + esc(err) + '</div>'; return; }
            renderItems(kind, items, list, c.category_name);
            if (focusItems) Nav.focusGroup(items);
        });
    }

    function renderItems(kind, items, list, catName) {
        items.innerHTML = '<div class="section-title">' + esc(catName) + ' <span class="section-sub">' + list.length + '</span></div>';
        if (!list.length) { items.innerHTML += '<div class="empty">Nada nesta categoria.</div>'; return; }
        if (kind === 'live') {
            var box = U.el('div', 'ch-list');
            items.appendChild(box);
            batchRender(box, list, function (ch, i) { return channelRow(ch, i, list, catName, box); }, 50);
        } else {
            var grid = U.el('div', 'grid');
            items.appendChild(grid);
            batchRender(grid, list, function (it, i) {
                var c = kind === 'movies'
                    ? posterCard(it.name, it.stream_icon, function () { openMovie(it); }, progressFraction('movie:' + it.stream_id))
                    : posterCard(it.name, it.cover, function () { openSeries(it); });
                c._onFocus = function () { grid._more(i); };
                return c;
            }, 35);
        }
    }

    function progressFraction(key) {
        var p = Store.progress(key);
        return p && p.dur > 0 ? p.pos / p.dur : null;
    }

    function channelRow(ch, i, list, ctxName, box) {
        var row = U.el('div', 'ch-row');
        var b = U.el('div', 'ch focusable',
            '<div class="ch-num">' + esc(ch.num || i + 1) + '</div><div class="ch-logo"></div><div class="ch-name">' + esc(ch.name) + '</div>');
        var lg = b.querySelector('.ch-logo');
        if (ch.stream_icon) lg.appendChild(U.img(ch.stream_icon, '', function () { lg.textContent = U.initials(ch.name); }));
        else lg.textContent = U.initials(ch.name);
        b._onEnter = function () { playLive(list, i, ctxName); };
        b._onFocus = function () { if (box) box._more(i); };
        row.appendChild(b);
        var f = favButton({ type: 'live', id: ch.stream_id, name: ch.name, icon: ch.stream_icon });
        f._onFocus = b._onFocus;
        row.appendChild(f);
        return row;
    }

    /* ── Detail screens ────────────────────────────────────────────── */
    function pushDetail() {
        stack.push({ type: 'detail', screen: shown, focus: Nav.current() });
        var d = $('scr-detail');
        d.innerHTML = '<div class="dt-body"><div class="loading">Carregando…</div></div>';
        d._tok = (d._tok || 0) + 1;
        showScreen('detail');
        return d._tok;
    }

    function popDetail() {
        var s = stack.pop();
        $('scr-detail').innerHTML = '';
        showScreen(s.screen);
        restoreAfterOverlay(s);
    }

    function restoreAfterOverlay(s) {
        if (dirty && (s.screen === 'home' || s.screen === 'favorites')) {
            dirty = false;
            if (s.screen === 'home') renderHome(); else renderFavorites();
            if (!focusContent()) Nav.focus(sideItem(section));
            return;
        }
        if (s.focus && document.body.contains(s.focus)) Nav.focus(s.focus);
        else if (!focusContent()) Nav.focus(sideItem(section));
    }

    function detailShell(bg, poster, title, meta, plot, extraCls) {
        var d = $('scr-detail');
        d.innerHTML =
            '<div class="dt-bg"></div><div class="dt-shade"></div>' +
            '<div class="dt-body' + (extraCls ? ' ' + extraCls : '') + '"><div class="dt-head"><div class="dt-poster"></div>' +
            '<div class="dt-info"><div class="dt-title">' + esc(title) + '</div><div class="dt-meta">' + meta + '</div>' +
            '<div class="dt-plot">' + esc(plot || '') + '</div><div class="dt-actions" data-group="actions"></div></div></div></div>';
        if (bg) d.querySelector('.dt-bg').style.backgroundImage = 'url("' + String(bg).replace(/"/g, '%22') + '")';
        if (poster) d.querySelector('.dt-poster').appendChild(U.img(poster));
        return d;
    }

    function metaLine(year, rating, dur, genre) {
        var parts = [];
        if (year) parts.push(esc(String(year).slice(0, 4)));
        var r = parseFloat(rating);
        if (r > 0) parts.push('<span class="rating">★ ' + esc(r.toFixed(1)) + '</span>');
        if (dur) parts.push(esc(dur));
        if (genre) parts.push(esc(genre));
        return parts.join(' &nbsp;·&nbsp; ');
    }

    function openMovie(m) {
        var tok = pushDetail();
        Api.vodInfo(m.stream_id, function (err, d) {
            var scr = $('scr-detail');
            if (tok !== scr._tok || shown !== 'detail') return;
            var info = (d && d.info) || {}, md = (d && d.movie_data) || {};
            var ext = md.container_extension || m.container_extension || 'mp4';
            var bg = (info.backdrop_path && U.toArray(info.backdrop_path)[0]) || info.movie_image || m.stream_icon;
            var dur = U.fmtDuration(info.duration_secs) || info.duration || '';
            detailShell(bg, info.movie_image || m.stream_icon, m.name,
                metaLine(info.releasedate || info.release_date || info.year, info.rating || m.rating, dur, info.genre),
                info.plot || info.description || (err ? 'Não foi possível carregar os detalhes.' : ''));
            var acts = scr.querySelector('.dt-actions');
            var key = 'movie:' + m.stream_id, pr = Store.progress(key);
            if (pr) {
                acts.appendChild(btn('Continuar de ' + U.fmtTime(pr.pos), PLAY_SVG, function () { playMovie(m, ext, pr.pos); }, 'primary'));
                acts.appendChild(btn('Do início', RESTART_SVG, function () { playMovie(m, ext, 0); }));
            } else {
                acts.appendChild(btn('Assistir', PLAY_SVG, function () { playMovie(m, ext, 0); }, 'primary'));
            }
            acts.appendChild(favToggleBtn({ type: 'movie', id: m.stream_id, name: m.name, icon: m.stream_icon, ext: ext }));
            Nav.focusFirst(acts);
        });
    }

    function favToggleBtn(item) {
        var b = btn('', STAR_SVG, null);
        function label() { b.innerHTML = STAR_SVG + (Store.isFav(item.type, item.id) ? 'Nos favoritos' : 'Favoritar'); }
        label();
        b._onEnter = function () {
            var on = Store.toggleFav(item);
            dirty = true;
            label();
            U.toast(on ? 'Adicionado aos favoritos' : 'Removido dos favoritos', 1800);
        };
        return b;
    }

    function seasonKeys(episodes) {
        var keys = [];
        for (var k in episodes) if (episodes.hasOwnProperty(k) && U.toArray(episodes[k]).length) keys.push(k);
        keys.sort(function (a, b) { return parseInt(a, 10) - parseInt(b, 10); });
        return keys;
    }

    // Flatten every episode in order, for "next episode" and resume.
    function episodeCtx(s, d) {
        var eps = (d && d.episodes) || {}, keys = seasonKeys(eps), list = [];
        for (var i = 0; i < keys.length; i++) {
            var arr = U.toArray(eps[keys[i]]);
            for (var j = 0; j < arr.length; j++) list.push({ ep: arr[j], season: keys[i] });
        }
        var info = (d && d.info) || {};
        return { seriesId: s.series_id, seriesName: s.name || info.name, cover: s.cover || info.cover, list: list, keys: keys, eps: eps };
    }
    function epIndex(ctx, epId) {
        for (var i = 0; i < ctx.list.length; i++) if (String(ctx.list[i].ep.id) === String(epId)) return i;
        return -1;
    }

    function openSeries(s) {
        var tok = pushDetail();
        Api.seriesInfo(s.series_id, function (err, d) {
            var scr = $('scr-detail');
            if (tok !== scr._tok || shown !== 'detail') return;
            var info = (d && d.info) || {};
            var ctx = episodeCtx(s, d);
            var bg = (info.backdrop_path && U.toArray(info.backdrop_path)[0]) || info.cover || s.cover;
            detailShell(bg, info.cover || s.cover, s.name || info.name,
                metaLine(info.releaseDate || info.releasedate || s.releaseDate, info.rating || s.rating,
                         ctx.keys.length ? ctx.keys.length + (ctx.keys.length > 1 ? ' temporadas' : ' temporada') : '', info.genre || s.genre),
                info.plot || s.plot || (err ? 'Não foi possível carregar a série.' : ''), 'dt-series');
            var acts = scr.querySelector('.dt-actions');

            // Most recently watched episode of this series
            var resume = null, resumeIdx = -1;
            for (var i = 0; i < ctx.list.length; i++) {
                var pr = Store.progress('ep:' + ctx.list[i].ep.id);
                if (pr && (!resume || pr.ts > resume.ts)) { resume = pr; resumeIdx = i; }
            }
            if (resume) {
                var it = ctx.list[resumeIdx];
                acts.appendChild(btn('Continuar T' + it.season + ' E' + (it.ep.episode_num || resumeIdx + 1), PLAY_SVG,
                    function () { playEpisode(ctx, resumeIdx, resume.pos); }, 'primary'));
            } else if (ctx.list.length) {
                acts.appendChild(btn('Assistir T' + ctx.list[0].season + ' E' + (ctx.list[0].ep.episode_num || 1), PLAY_SVG,
                    function () { playEpisode(ctx, 0, 0); }, 'primary'));
            }
            acts.appendChild(favToggleBtn({ type: 'series', id: s.series_id, name: s.name || info.name, icon: s.cover || info.cover }));

            var body = scr.querySelector('.dt-body');
            if (!ctx.list.length) {
                body.appendChild(U.el('div', 'empty', err ? esc(err) : 'Nenhum episódio disponível.'));
                Nav.focusFirst(acts);
                return;
            }
            var seasons = U.el('div', 'seasons hscroll');
            seasons.setAttribute('data-group', 'seasons');
            var sin = U.el('div', 'seasons-inner');
            seasons.appendChild(sin);
            var episodes = U.el('div', 'episodes vscroll');
            episodes.setAttribute('data-group', 'eps');
            body.appendChild(seasons);
            body.appendChild(episodes);

            var selected = null;
            var startSeason = resume ? ctx.list[resumeIdx].season : ctx.keys[0];
            for (var k = 0; k < ctx.keys.length; k++) (function (key) {
                var sb = U.el('div', 'season focusable', 'Temporada ' + esc(key));
                sb._onFocus = function () { pick(); };
                sb._onEnter = function () { pick(); Nav.focusGroup(episodes); };
                function pick() {
                    if (selected === sb) return;
                    if (selected) selected.classList.remove('selected');
                    selected = sb;
                    sb.classList.add('selected');
                    renderEpisodes(episodes, ctx, key);
                }
                sin.appendChild(sb);
                if (key === startSeason) { pick(); seasons._last = sb; }
            })(ctx.keys[k]);
            Nav.focusFirst(acts);
        });
    }

    function renderEpisodes(box, ctx, seasonKey) {
        box.innerHTML = '';
        box.scrollTop = 0;
        box._last = null;
        for (var i = 0; i < ctx.list.length; i++) {
            if (ctx.list[i].season !== seasonKey) continue;
            (function (idx) {
                var e = ctx.list[idx].ep, inf = e.info || {};
                var row = U.el('div', 'ep focusable',
                    '<div class="ep-num">E' + esc(e.episode_num || '') + '</div><div class="ep-title">' + esc(e.title || ('Episódio ' + (e.episode_num || ''))) + '</div>' +
                    '<div class="ep-dur">' + esc(U.fmtDuration(inf.duration_secs) || inf.duration || '') + '</div>');
                var f = progressFraction('ep:' + e.id);
                if (f != null) {
                    var bar = U.el('div', 'ep-prog'), fill = U.el('div');
                    fill.style.width = Math.max(3, Math.round(f * 100)) + '%';
                    bar.appendChild(fill);
                    row.appendChild(bar);
                }
                row._onEnter = function () {
                    var pr = Store.progress('ep:' + e.id);
                    playEpisode(ctx, idx, pr ? pr.pos : 0);
                };
                box.appendChild(row);
            })(i);
        }
    }

    /* ── Playback ──────────────────────────────────────────────────── */
    function playLive(list, idx, ctxName) {
        var ch = list[idx];
        startPlayer({ kind: 'live', list: list, idx: idx, ctxName: ctxName, title: ch.name,
                      sub: (ch.num ? 'Canal ' + ch.num + '  ·  ' : '') + (ctxName || ''),
                      url: Api.liveUrl(ch.stream_id) });
    }

    function playMovie(m, ext, startMs) {
        startPlayer({ kind: 'movie', title: m.name, sub: 'Filme', url: Api.movieUrl(m.stream_id, ext), startMs: startMs,
                      progressKey: 'movie:' + m.stream_id,
                      entry: { type: 'movie', id: m.stream_id, name: m.name, icon: m.stream_icon, ext: ext } });
    }

    function playEpisode(ctx, idx, startMs) {
        var it = ctx.list[idx], e = it.ep, ext = e.container_extension || 'mp4';
        var label = 'T' + it.season + ' E' + (e.episode_num || '');
        startPlayer({ kind: 'episode', title: ctx.seriesName, sub: label + '  ·  ' + (e.title || ''),
                      url: Api.episodeUrl(e.id, ext), startMs: startMs, progressKey: 'ep:' + e.id,
                      entry: { type: 'episode', id: e.id, name: ctx.seriesName + ' — ' + label, icon: ctx.cover, ext: ext,
                               seriesId: ctx.seriesId, seriesName: ctx.seriesName, season: it.season, epNum: e.episode_num },
                      next: idx + 1 < ctx.list.length ? function () { playEpisode(ctx, idx + 1, 0); } : null });
    }

    // Resume from a "Continue watching" card.
    function resumeEntry(e) {
        if (e.type === 'movie') { playMovie({ stream_id: e.id, name: e.name, stream_icon: e.icon }, e.ext, e.pos); return; }
        U.toast('Carregando…', 1500);
        Api.seriesInfo(e.seriesId, function (err, d) {
            var ctx = episodeCtx({ series_id: e.seriesId, name: e.seriesName, cover: e.icon }, d);
            var idx = err ? -1 : epIndex(ctx, e.id);
            if (idx < 0) {
                ctx = { seriesId: e.seriesId, seriesName: e.seriesName, cover: e.icon,
                        list: [{ ep: { id: e.id, episode_num: e.epNum, container_extension: e.ext, title: '' }, season: String(e.season) }] };
                idx = 0;
            }
            playEpisode(ctx, idx, e.pos);
        });
    }

    var osdTimer = null, seekTimer = null, zapTimer = null;

    function startPlayer(sess) {
        if (!P) stack.push({ type: 'player', screen: shown, focus: Nav.current() });
        else saveProgressNow(false);
        P = sess;
        var root = document.documentElement;
        if (!/\bplaying\b/.test(root.className)) root.className += ' playing';
        $('player-ui').classList.remove('hidden');
        Nav.setHandler(playerKey);
        paintInfo();
        showOsd();
        center('Carregando…');
        Player.open(sess.url, sess.startMs || 0);
    }

    function paintInfo() {
        $('pl-title').textContent = P.title || '';
        $('pl-sub').textContent = P.sub || '';
        var live = P.kind === 'live';
        if (live) { $('pl-live').classList.remove('hidden'); $('pl-progress').classList.add('hidden'); }
        else { $('pl-live').classList.add('hidden'); $('pl-progress').classList.remove('hidden'); }
        $('pl-hint').textContent = live
            ? '↑ ↓ trocar de canal   ·   VOLTAR sair'
            : 'OK pausar   ·   ← → 10 s   ·   ◄◄ ►► 30 s   ·   VOLTAR sair';
        $('pl-fill').style.width = '0';
        $('pl-pos').textContent = U.fmtTime(P.startMs || 0);
        $('pl-dur').textContent = '';
    }

    function center(html) {
        $('pl-center').innerHTML = html ? '<div class="msg">' + html + '</div>' : '';
    }

    function showOsd() {
        var ui = $('player-ui');
        ui.classList.remove('idle');
        clearTimeout(osdTimer);
        osdTimer = setTimeout(function () {
            if (P && !Player.isPaused() && P.seek == null) ui.classList.add('idle');
        }, 4500);
    }

    function updateBar() {
        if (!P || P.kind === 'live') return;
        var pos = P.seek != null ? P.seek : P.pos || 0, dur = P.dur || 0;
        $('pl-pos').textContent = U.fmtTime(pos);
        $('pl-dur').textContent = dur ? U.fmtTime(dur) : '';
        $('pl-fill').style.width = dur ? Math.min(100, pos / dur * 100) + '%' : '0';
        var mk = $('pl-seek');
        if (P.seek != null && dur) { mk.style.display = 'block'; mk.style.left = Math.min(100, P.seek / dur * 100) + '%'; }
        else mk.style.display = 'none';
    }

    function initPlayerEvents() {
        Player.on('buffering', function (b) { if (P && !P.error) center(b ? 'Carregando…' : (Player.isPaused() ? 'Pausado' : '')); });
        Player.on('ready', function () { if (P) { P.error = false; center(''); } });
        Player.on('time', function (pos, dur) {
            if (!P) return;
            if (pos > 0) P.pos = pos;
            if (dur > 0) P.dur = dur;
            updateBar();
            if (P.progressKey && Math.abs((P.pos || 0) - (P.lastSave || 0)) > 10000) saveProgressNow(false);
        });
        Player.on('complete', function () {
            if (!P) return;
            if (P.kind === 'live') { center('A transmissão terminou'); return; }
            saveProgressNow(true);
            if (P.next) { U.toast('Próximo episódio', 2000); P.next(); }
            else closePlayer();
        });
        Player.on('error', function (msg) {
            if (!P) return;
            P.error = true;
            var hint = P.kind === 'live' && Store.setting('liveFormat') === 'ts'
                ? '<br><span style="font-size:26px;color:#c9d3e4">Se continuar, mude o formato para HLS em Ajustes.</span>' : '';
            center(esc(msg) + hint + '<br><span style="font-size:26px;color:#c9d3e4">Pressione VOLTAR</span>');
            showOsd();
        });
    }

    function saveProgressNow(finished) {
        if (!P || !P.progressKey || !(P.dur > 0)) return;
        var e = P.entry, out = {};
        for (var k in e) if (e.hasOwnProperty(k)) out[k] = e[k];
        out.key = P.progressKey;
        out.pos = finished ? P.dur : (P.pos || 0);
        out.dur = P.dur;
        Store.saveProgress(out);
        P.lastSave = P.pos || 0;
        dirty = true;
    }

    function stopPlayback() {
        clearTimeout(seekTimer); clearTimeout(zapTimer); clearTimeout(osdTimer);
        saveProgressNow(false);
        Player.stop();
        P = null;
        document.documentElement.className = document.documentElement.className.replace(/\s*\bplaying\b/g, '');
        $('player-ui').classList.add('hidden');
        Nav.setHandler(null);
    }

    function closePlayer() {
        var liveIdx = P && P.kind === 'live' ? P.idx : -1;
        stopPlayback();
        var s = stack.pop();
        if (!s) return;
        if (shown !== s.screen) showScreen(s.screen);
        // After zapping, land on the channel that was playing last.
        if (liveIdx >= 0 && s.focus && s.focus.classList.contains('ch')) {
            var box = s.focus.parentNode && s.focus.parentNode.parentNode;
            var row = box && box.classList.contains('ch-list') ? box.children[liveIdx] : null;
            if (row && row.firstChild) s.focus = row.firstChild;
        }
        restoreAfterOverlay(s);
    }

    function seekBy(delta) {
        if (!P || !(P.dur > 0)) return;
        var base = P.seek != null ? P.seek : (P.pos || 0);
        P.seek = Math.max(0, Math.min(P.dur - 3000, base + delta));
        updateBar();
        clearTimeout(seekTimer);
        seekTimer = setTimeout(function () {
            if (!P || P.seek == null) return;
            Player.seekTo(P.seek);
            P.pos = P.seek;
            P.seek = null;
            updateBar();
            showOsd();
        }, 700);
    }

    function zap(d) {
        if (!P || !P.list || P.list.length < 2) return;
        var i = (P.idx + d + P.list.length) % P.list.length;
        P.idx = i;
        var ch = P.list[i];
        $('pl-title').textContent = ch.name;
        $('pl-sub').textContent = (ch.num ? 'Canal ' + ch.num + '  ·  ' : '') + (P.ctxName || '');
        center('Carregando…');
        clearTimeout(zapTimer);
        zapTimer = setTimeout(function () { if (P && P.idx === i) playLive(P.list, i, P.ctxName); }, 600);
    }

    function playerKey(name) {
        if (!P) return false;
        if (name === 'BACK' || name === 'STOP') { closePlayer(); return true; }
        showOsd();
        if (P.kind === 'live') {
            if (name === 'UP' || name === 'CHUP') zap(1);
            else if (name === 'DOWN' || name === 'CHDOWN') zap(-1);
            return true;
        }
        switch (name) {
            case 'ENTER': case 'PLAYPAUSE':
                center(Player.toggle() ? 'Pausado' : '');
                break;
            case 'PLAY': Player.play(); center(''); break;
            case 'PAUSE': Player.pause(); center('Pausado'); break;
            case 'LEFT': seekBy(-10000); break;
            case 'RIGHT': seekBy(10000); break;
            case 'RW': seekBy(-30000); break;
            case 'FF': seekBy(30000); break;
            case 'CHUP': if (P.next) P.next(); break;
        }
        return true;
    }

    function onVisibility() {
        if (!P) return;
        if (document.hidden) {
            saveProgressNow(false);
            if (P.kind === 'live') { Player.stop(); P.stopped = true; } else Player.suspend();
        } else {
            if (P.kind === 'live') { if (P.stopped) { P.stopped = false; Player.open(P.url, 0); } }
            else Player.restore();
        }
    }

    /* ── Home ──────────────────────────────────────────────────────── */
    function renderHome() {
        var scr = $('scr-home');
        scr.innerHTML = '';
        scr.scrollTop = 0;
        scr._last = null;
        dirty = false;

        var cont = Store.continueList();
        if (cont.length) {
            scr.appendChild(hRow('Continuar assistindo', cont, function (e) {
                return posterCard(e.type === 'episode' ? e.name : e.name, e.icon, function () { resumeEntry(e); }, e.dur ? e.pos / e.dur : null);
            }));
        }

        var tr = U.el('div', 'row');
        tr.appendChild(U.el('div', 'row-title', cont.length ? 'Navegar' : 'Bem-vindo'));
        var tiles = U.el('div', 'tiles');
        tiles.setAttribute('data-group', 'tiles');
        var defs = [['live', 'TV ao vivo', 't-live'], ['movies', 'Filmes', 't-movies'], ['series', 'Séries', 't-series'], ['search', 'Buscar', 't-search']];
        for (var i = 0; i < defs.length; i++) (function (d) {
            var t = U.el('div', 'tile focusable ' + d[2], TILE_SVG[d[0]] + '<div class="tile-name">' + d[1] + '</div>');
            t._onEnter = function () { goSection(d[0]); focusContent(); };
            tiles.appendChild(t);
        })(defs[i]);
        tr.appendChild(tiles);
        scr.appendChild(tr);

        var favLive = Store.favorites('live');
        if (favLive.length) scr.appendChild(hRow('Canais favoritos', favLive, function (f, i) {
            return posterCard(f.name, f.icon, function () { playLive(favChannels(favLive), i, 'Favoritos'); }, null, true);
        }, true));
        var favVod = Store.favorites('movie').concat(Store.favorites('series'));
        if (favVod.length) scr.appendChild(hRow('Filmes e séries favoritos', favVod, function (f) {
            return posterCard(f.name, f.icon, function () { openFav(f); });
        }));
    }

    function hRow(title, list, make, wide) {
        var row = U.el('div', 'row');
        row.appendChild(U.el('div', 'row-title', esc(title)));
        var h = U.el('div', 'hrow hscroll' + (wide ? ' wide-row' : ''));
        h.setAttribute('data-group', 'row');
        var inner = U.el('div', 'hrow-inner');
        for (var i = 0; i < list.length; i++) inner.appendChild(make(list[i], i));
        h.appendChild(inner);
        row.appendChild(h);
        return row;
    }

    function favChannels(favs) {
        var out = [];
        for (var i = 0; i < favs.length; i++) out.push({ stream_id: favs[i].id, name: favs[i].name, stream_icon: favs[i].icon });
        return out;
    }
    function openFav(f) {
        if (f.type === 'movie') openMovie({ stream_id: f.id, name: f.name, stream_icon: f.icon, container_extension: f.ext });
        else openSeries({ series_id: f.id, name: f.name, cover: f.icon });
    }

    /* ── Favorites ─────────────────────────────────────────────────── */
    function renderFavorites() {
        var scr = $('scr-favorites');
        scr.innerHTML = '<div class="section-title">Favoritos</div>';
        scr.scrollTop = 0;
        scr._last = null;
        var live = Store.favorites('live'), mv = Store.favorites('movie'), sr = Store.favorites('series');
        if (!live.length && !mv.length && !sr.length) {
            scr.innerHTML += '<div class="empty">Nada aqui ainda. Use a estrela nos canais, filmes e séries para adicionar.</div>';
            return;
        }
        if (live.length) scr.appendChild(hRow('Canais', live, function (f, i) {
            return posterCard(f.name, f.icon, function () { playLive(favChannels(live), i, 'Favoritos'); }, null, true);
        }, true));
        if (mv.length) scr.appendChild(hRow('Filmes', mv, function (f) { return posterCard(f.name, f.icon, function () { openFav(f); }, progressFraction('movie:' + f.id)); }));
        if (sr.length) scr.appendChild(hRow('Séries', sr, function (f) { return posterCard(f.name, f.icon, function () { openFav(f); }); }));
    }

    /* ── Search ────────────────────────────────────────────────────── */
    var searchIndex = null, indexWaiters = null;

    function initSearch() {
        var field = document.querySelector('[data-input="f-search"]');
        var run = U.debounce(function (v) { doSearch(v); }, 700);
        field._onInput = run;
        field._onCommit = function (v) { doSearch(v); };
    }

    function renderSearchHint() {
        var res = $('scr-search').querySelector('.search-results');
        if ($('f-search').value.replace(/\s/g, '').length >= 2) return;
        res.innerHTML = '<div class="empty">Selecione a barra acima, aperte OK e digite pelo menos 2 letras.<br>' +
            'A primeira busca carrega o catálogo completo e pode levar alguns segundos.</div>';
    }

    function adultCatIds(list) {
        var ids = {};
        for (var i = 0; i < list.length; i++) if (ADULT.test(list[i].category_name || '')) ids[list[i].category_id] = true;
        return ids;
    }

    function buildIndex(cb) {
        if (searchIndex) { cb(null, searchIndex); return; }
        if (indexWaiters) { indexWaiters.push(cb); return; }
        indexWaiters = [cb];
        var idx = { live: [], movie: [], series: [] }, pending = 6, firstErr = null, adult = { live: {}, movie: {}, series: {} };
        var raw = {};
        function done(err) {
            if (err && !firstErr) firstErr = err;
            if (--pending > 0) return;
            var hide = hideAdult();
            var add = function (type, list, idKey, iconKey) {
                for (var i = 0; i < list.length; i++) {
                    var it = list[i];
                    if (hide && adult[type][it.category_id]) continue;
                    idx[type].push({ id: it[idKey], n: it.name, f: U.fold(it.name), i: it[iconKey] || '', x: it.container_extension || '', num: it.num });
                }
            };
            add('live', raw.live || [], 'stream_id', 'stream_icon');
            add('movie', raw.movie || [], 'stream_id', 'stream_icon');
            add('series', raw.series || [], 'series_id', 'cover');
            raw = null;
            var ws = indexWaiters;
            indexWaiters = null;
            var empty = !idx.live.length && !idx.movie.length && !idx.series.length;
            if (!empty) searchIndex = idx;
            for (var w = 0; w < ws.length; w++) ws[w](empty ? (firstErr || 'Catálogo vazio') : null, idx);
        }
        Api.liveCategories(function (e, l) { adult.live = adultCatIds(l); done(e); });
        Api.vodCategories(function (e, l) { adult.movie = adultCatIds(l); done(e); });
        Api.seriesCategories(function (e, l) { adult.series = adultCatIds(l); done(e); });
        Api.allLive(function (e, l) { raw.live = l; done(e); });
        Api.allVod(function (e, l) { raw.movie = l; done(e); });
        Api.allSeries(function (e, l) { raw.series = l; done(e); });
    }

    var searchTok = 0;
    function doSearch(v) {
        var q = U.fold(String(v || '').replace(/^\s+|\s+$/g, ''));
        var res = $('scr-search').querySelector('.search-results');
        if (q.length < 2) { renderSearchHint(); return; }
        var tok = ++searchTok;
        if (!searchIndex) res.innerHTML = '<div class="loading">Carregando o catálogo para a busca…</div>';
        buildIndex(function (err, idx) {
            if (tok !== searchTok) return;
            if (err) { res.innerHTML = '<div class="empty">' + esc(err) + '</div>'; return; }
            var found = { live: [], movie: [], series: [] }, total = 0;
            var types = ['live', 'movie', 'series'];
            for (var t = 0; t < types.length; t++) {
                var list = idx[types[t]], out = found[types[t]];
                for (var i = 0; i < list.length && out.length < 40; i++) if (list[i].f.indexOf(q) !== -1) out.push(list[i]);
                total += out.length;
            }
            res.innerHTML = '';
            res.scrollTop = 0;
            res._last = null;
            if (!total) { res.innerHTML = '<div class="empty">Nada encontrado para “' + esc(v) + '”.</div>'; return; }
            if (found.live.length) {
                var chans = [];
                for (var c = 0; c < found.live.length; c++) chans.push({ stream_id: found.live[c].id, name: found.live[c].n, stream_icon: found.live[c].i, num: found.live[c].num });
                res.appendChild(hRow('Canais', chans, function (ch, i) {
                    return posterCard(ch.name, ch.stream_icon, function () { playLive(chans, i, 'Busca'); }, null, true);
                }, true));
            }
            if (found.movie.length) res.appendChild(hRow('Filmes', found.movie, function (m) {
                return posterCard(m.n, m.i, function () { openMovie({ stream_id: m.id, name: m.n, stream_icon: m.i, container_extension: m.x }); }, progressFraction('movie:' + m.id));
            }));
            if (found.series.length) res.appendChild(hRow('Séries', found.series, function (s) {
                return posterCard(s.n, s.i, function () { openSeries({ series_id: s.id, name: s.n, cover: s.i }); });
            }));
        });
    }

    /* ── Settings ──────────────────────────────────────────────────── */
    var logoutArmed = 0;
    function renderSettings() {
        var scr = $('scr-settings');
        var a = Store.account() || {}, inf = a.info || {};
        var host = a.server === 'demo' ? 'Demonstração' : String(a.server || '').replace(/^https?:\/\//, '');
        scr.innerHTML = '<div class="section-title">Ajustes</div>';
        scr._last = null;
        function info(k, v) { scr.appendChild(U.el('div', 'set-row info', '<div class="k">' + esc(k) + '</div><div class="v">' + esc(v) + '</div>')); }
        function action(k, vfn, fn) {
            var r = U.el('div', 'set-row focusable', '<div class="k">' + esc(k) + '</div><div class="v"></div>');
            var paint = function () { r.querySelector('.v').textContent = vfn ? vfn() : ''; };
            r._onEnter = function () { fn(); paint(); };
            paint();
            scr.appendChild(r);
            return r;
        }
        info('Servidor', host);
        info('Usuário', a.user || '');
        info('Assinatura', (inf.status ? inf.status + ' · ' : '') + 'vence em ' + U.fmtDate(inf.exp));
        if (inf.max) info('Telas simultâneas', inf.max);

        action('Formato da TV ao vivo', function () { return Store.setting('liveFormat') === 'm3u8' ? 'HLS (.m3u8)' : 'MPEG-TS (.ts)'; }, function () {
            Store.setSetting('liveFormat', Store.setting('liveFormat') === 'm3u8' ? 'ts' : 'm3u8');
            U.toast('Formato alterado. Vale para o próximo canal aberto.', 2500);
        });
        action('Ocultar conteúdo adulto', function () { return Store.setting('hideAdult') ? 'Sim' : 'Não'; }, function () {
            Store.setSetting('hideAdult', !Store.setting('hideAdult'));
            resetCatalog();
            U.toast('Listas serão recarregadas.', 2000);
        });
        action('Atualizar listas do provedor', null, function () {
            Api.setAccount(Store.account());
            resetCatalog();
            U.toast('Listas atualizadas. Abra TV ao vivo, Filmes ou Séries.', 2500);
        });
        action('Limpar “Continuar assistindo”', null, function () {
            Store.clearProgress();
            dirty = true;
            U.toast('Histórico apagado.', 2000);
        });
        action('Sair da conta', null, function () {
            if (Date.now() - logoutArmed < 3000) {
                Store.clearAccount();
                Api.setAccount(null);
                showSetup('Você saiu da conta.');
                return;
            }
            logoutArmed = Date.now();
            U.toast('Aperte OK de novo para sair da conta', 3000);
        });
        scr.appendChild(U.el('div', 'set-note',
            'Minha TV ' + VERSION + ' · feito para Samsung Tizen. Favoritos e “Continuar assistindo” ficam salvos nesta TV.'));
    }

    return { boot: boot };
})();

window.onload = App.boot;
