/* Demo provider: type "demo" as the server to try the app without an
 * account.  It answers like an Xtream Codes panel and plays public test
 * streams (Mux and Apple HLS test streams, Blender open-movie files,
 * test-videos.co.uk clips). */
var Demo = (function () {
    'use strict';

    var TV = 'https://test-videos.co.uk/vids/';
    var BBB_POSTER = 'https://peach.blender.org/wp-content/uploads/poster_bunny_bunnysize.jpg';
    var HLS_BBB = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8';
    var HLS_TOS = 'https://test-streams.mux.dev/tos_ismc/main.m3u8';
    var HLS_APPLE = 'https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_ts/master.m3u8';

    // [name, url, poster, year, genre, seconds, vod category]
    var MOVIES = [
        ['Big Buck Bunny', HLS_BBB, BBB_POSTER, 2008, 'Animação, Comédia', 596, '12'],
        ['Tears of Steel', HLS_TOS, '', 2012, 'Ficção científica', 734, '11'],
        ['Sintel (trailer)', 'https://download.blender.org/durian/trailer/sintel_trailer-720p.mp4', '', 2010, 'Animação, Aventura', 52, '12'],
        ['Apple BipBop', HLS_APPLE, '', 2016, 'Teste técnico', 1800, '13'],
        ['Big Buck Bunny (10 s)', TV + 'bigbuckbunny/mp4/h264/720/Big_Buck_Bunny_720_10s_1MB.mp4', BBB_POSTER, 2008, 'Curta', 10, '11'],
        ['Jellyfish (10 s)', TV + 'jellyfish/mp4/h264/720/Jellyfish_720_10s_1MB.mp4', '', 2015, 'Natureza', 10, '13'],
        ['Sintel (10 s)', TV + 'sintel/mp4/h264/720/Sintel_720_10s_1MB.mp4', '', 2010, 'Curta', 10, '12']
    ];
    var LIVE_SRC = [HLS_BBB, HLS_APPLE, HLS_TOS];

    var liveCats = [
        { category_id: '1', category_name: 'Notícias' },
        { category_id: '2', category_name: 'Esportes' },
        { category_id: '3', category_name: 'Filmes 24h' },
        { category_id: '4', category_name: 'Infantil' },
        { category_id: '9', category_name: 'XXX Adultos' }
    ];
    var vodCats = [
        { category_id: '11', category_name: 'Lançamentos' },
        { category_id: '12', category_name: 'Animação' },
        { category_id: '13', category_name: 'Documentários' }
    ];
    var seriesCats = [
        { category_id: '21', category_name: 'Séries de Animação' },
        { category_id: '22', category_name: 'Curtas' }
    ];
    // series id -> seasons -> movie indexes
    var SERIES = {
        '900': { name: 'Contos Abertos', cat: '21', cover: BBB_POSTER, seasons: [[0, 1], [2, 6]],
                 plot: 'Série de demonstração com filmes abertos da Blender Foundation divididos em temporadas.', genre: 'Animação', year: '2010', rating: '8.1' },
        '901': { name: 'Grandes Curtas', cat: '22', cover: '', seasons: [[4, 5, 6]],
                 plot: 'Clipes curtos de demonstração reunidos em uma série.', genre: 'Curta', year: '2015', rating: '6.4' }
    };

    var live = [], vod = [], series = [], n = 1;
    var names = { '1': ['Notícias 24', 'Jornal Agora', 'Info Brasil', 'Mundo News', 'Economia TV', 'Tempo Real'],
                  '2': ['Esporte Total', 'Futebol HD', 'Arena 1', 'Arena 2', 'Fight Club TV', 'Motor Max', 'Tênis Plus', 'Basquete 24'],
                  '3': ['Cine Ação', 'Cine Drama', 'Cine Comédia', 'Cine Terror'],
                  '4': ['Kids Fun', 'Desenhos 24h', 'Baby TV'],
                  '9': ['Adulto 1'] };
    for (var c in names) if (names.hasOwnProperty(c)) {
        for (var i = 0; i < names[c].length; i++) {
            live.push({ num: n, name: names[c][i], stream_type: 'live', stream_id: 100 + n, stream_icon: '', category_id: c });
            n++;
        }
    }
    for (var m = 0; m < MOVIES.length; m++) {
        vod.push({ num: m + 1, name: MOVIES[m][0], stream_type: 'movie', stream_id: 500 + m, stream_icon: MOVIES[m][2],
                   rating: (6 + (m % 4) * 0.7).toFixed(1), category_id: MOVIES[m][6], container_extension: 'mp4' });
    }
    for (var sid in SERIES) if (SERIES.hasOwnProperty(sid)) {
        var S = SERIES[sid];
        series.push({ num: series.length + 1, name: S.name, series_id: parseInt(sid, 10), cover: S.cover, category_id: S.cat,
                      plot: S.plot, genre: S.genre, releaseDate: S.year, rating: S.rating });
    }

    function param(extra, name) {
        var r = new RegExp('(?:^|&)' + name + '=([^&]*)').exec(extra || '');
        return r ? decodeURIComponent(r[1]) : null;
    }
    function byCat(list, cat) {
        if (cat == null) return list.slice();
        var out = [];
        for (var i = 0; i < list.length; i++) if (String(list[i].category_id) === String(cat)) out.push(list[i]);
        return out;
    }

    // Episode ids encode series, season and movie: 7 + series(0/1) + season + movie index
    function seriesInfo(id) {
        var S = SERIES[String(id)];
        if (!S) return { seasons: [], episodes: {}, info: {} };
        var episodes = {}, seasons = [];
        for (var s = 0; s < S.seasons.length; s++) {
            var list = [];
            for (var e = 0; e < S.seasons[s].length; e++) {
                var mi = S.seasons[s][e], mv = MOVIES[mi];
                list.push({ id: String(70000 + (String(id) === '900' ? 0 : 1000) + (s + 1) * 100 + mi), episode_num: e + 1, season: s + 1,
                            title: mv[0], container_extension: 'mp4', info: { duration_secs: mv[5], movie_image: mv[2] } });
            }
            episodes[String(s + 1)] = list;
            seasons.push({ season_number: s + 1, name: 'Temporada ' + (s + 1) });
        }
        return { seasons: seasons, episodes: episodes,
                 info: { name: S.name, cover: S.cover, plot: S.plot, genre: S.genre, releaseDate: S.year, rating: S.rating } };
    }

    function call(action, extra, cb) {
        var cat = param(extra, 'category_id'), d;
        switch (action) {
            case '':
                d = { user_info: { auth: 1, status: 'Active', username: 'demo', exp_date: null, max_connections: '1',
                                   active_cons: '0', allowed_output_formats: ['m3u8', 'ts'] },
                      server_info: { url: 'demo', timezone: 'America/Sao_Paulo' } };
                break;
            case 'get_live_categories': d = liveCats; break;
            case 'get_vod_categories': d = vodCats; break;
            case 'get_series_categories': d = seriesCats; break;
            case 'get_live_streams': d = byCat(live, cat); break;
            case 'get_vod_streams': d = byCat(vod, cat); break;
            case 'get_series': d = byCat(series, cat); break;
            case 'get_vod_info':
                var mi = parseInt(param(extra, 'vod_id'), 10) - 500, mv = MOVIES[mi];
                d = mv ? { info: { movie_image: mv[2], genre: mv[4], releasedate: String(mv[3]), duration_secs: mv[5],
                                   rating: vod[mi].rating, plot: 'Conteúdo aberto usado para demonstrar o app. Na sua conta real aparecem aqui a sinopse e os dados do filme.' },
                           movie_data: { stream_id: 500 + mi, name: mv[0], container_extension: 'mp4' } } : {};
                break;
            case 'get_series_info': d = seriesInfo(param(extra, 'series_id')); break;
            default: d = [];
        }
        setTimeout(function () { cb(null, JSON.parse(JSON.stringify(d))); }, 150);
    }

    function liveUrl(id) { return LIVE_SRC[id % LIVE_SRC.length]; }
    function movieUrl(id) { var mv = MOVIES[parseInt(id, 10) - 500]; return mv ? mv[1] : HLS_BBB; }
    function episodeUrl(id) { var mv = MOVIES[parseInt(id, 10) % 100]; return mv ? mv[1] : HLS_BBB; }

    return { call: call, liveUrl: liveUrl, movieUrl: movieUrl, episodeUrl: episodeUrl };
})();
