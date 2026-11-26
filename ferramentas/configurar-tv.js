// Configurar Minha TV pelo computador.
//
//   node configurar-tv.js
//
// Abre uma página em http://localhost:8766 onde você digita o código que
// aparece na TV e cola o link do seu provedor.  A TV (app Minha TV, botão
// "Configurar pelo computador ou celular") encontra este PC na rede e busca
// os dados uma única vez.
//
// Segurança: os dados ficam só na memória, nunca são gravados nem impressos
// no terminal; cada envio vale 10 minutos e só é entregue a quem tiver o
// código de 6 dígitos; depois da entrega o programa se encerra sozinho.

'use strict';
const http = require('http');
const os = require('os');

const PORT = 8766;
const TTL_MS = 10 * 60 * 1000;
const IDLE_EXIT_MS = 30 * 60 * 1000;
const keep = process.argv.includes('--manter');

const pending = new Map();          // code -> { cfg, exp }
let idleTimer = null;
function touch() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => { console.log('Encerrado por inatividade (30 min).'); process.exit(0); }, IDLE_EXIT_MS);
}

function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces()))
    for (const a of list || [])
      if (a.family === 'IPv4' && !a.internal) out.push(a.address);
  return out;
}

function json(res, status, obj) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(obj));
}

const PAGE = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Configurar Minha TV</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #0d1424; color: #fff; font: 17px/1.5 system-ui, Segoe UI, Arial, sans-serif; }
  main { max-width: 560px; margin: 0 auto; padding: 40px 16px 60px; }
  h1 { font-size: 28px; margin: 0 0 6px; }
  h1 span { display: inline-block; width: 0; height: 0; border-top: 11px solid transparent; border-bottom: 11px solid transparent; border-left: 18px solid #3d7bff; margin-right: 10px; }
  p { color: #aab6cc; margin: 0 0 24px; }
  label { display: block; font-weight: 600; margin: 18px 0 6px; }
  input, textarea { width: 100%; background: #151f33; color: #fff; border: 2px solid #26334f; border-radius: 10px; padding: 12px 14px; font: inherit; }
  input:focus, textarea:focus { outline: none; border-color: #3d7bff; }
  #code { font-size: 30px; letter-spacing: 10px; text-align: center; }
  textarea { min-height: 96px; resize: vertical; word-break: break-all; }
  details { margin-top: 18px; color: #aab6cc; }
  summary { cursor: pointer; }
  button { margin-top: 26px; width: 100%; background: #2b5fd9; color: #fff; border: 0; border-radius: 10px; padding: 14px; font: inherit; font-weight: 700; cursor: pointer; }
  button:hover { background: #3d7bff; }
  #msg { margin-top: 18px; min-height: 26px; }
  .ok { color: #9fe3b0; } .err { color: #ffb4b4; }
  small { color: #7f8ba3; display: block; margin-top: 30px; }
</style></head>
<body><main>
  <h1><span></span>Configurar Minha TV</h1>
  <p>Na TV, abra o Minha TV e escolha <b>Configurar pelo computador ou celular</b>. Depois preencha abaixo.</p>
  <form id="f" autocomplete="off">
    <label for="code">Código que aparece na TV</label>
    <input id="code" inputmode="numeric" maxlength="7" placeholder="000 000" required>
    <label for="link">Link M3U do seu provedor</label>
    <textarea id="link" spellcheck="false" placeholder="http://servidor/get.php?username=...&amp;password=..."></textarea>
    <details><summary>Prefiro preencher servidor, usuário e senha separados</summary>
      <label for="server">Servidor</label><input id="server" spellcheck="false" placeholder="http://servidor:porta">
      <label for="user">Usuário</label><input id="user" spellcheck="false">
      <label for="pass">Senha</label><input id="pass" type="password">
    </details>
    <button type="submit">Enviar para a TV</button>
    <div id="msg"></div>
  </form>
  <small>Os dados vão direto para a sua TV pela rede local. Nada é salvo neste computador.</small>
</main>
<script>
  var f = document.getElementById('f'), msg = document.getElementById('msg');
  function v(id) { return document.getElementById(id).value.trim(); }
  // http://localhost:8766/?code=123456 -> code already filled in, cursor on the link
  var pre = /[?&]code=(\\d{6})/.exec(location.search);
  if (pre) { document.getElementById('code').value = pre[1].slice(0, 3) + ' ' + pre[1].slice(3); document.getElementById('link').focus(); }
  else document.getElementById('code').focus();
  f.addEventListener('submit', function (e) {
    e.preventDefault();
    var body = { code: v('code').replace(/\\D/g, ''), link: v('link'), server: v('server'), user: v('user'), pass: document.getElementById('pass').value };
    if (body.code.length !== 6) { msg.className = 'err'; msg.textContent = 'Digite os 6 números que aparecem na TV.'; return; }
    if (!body.link && !(body.server && body.user && body.pass)) { msg.className = 'err'; msg.textContent = 'Cole o link ou preencha servidor, usuário e senha.'; return; }
    msg.className = ''; msg.textContent = 'Enviando…';
    fetch('/minhatv/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d.ok) { msg.className = 'ok'; msg.textContent = 'Pronto! Os dados vão aparecer na TV em alguns segundos.'; document.getElementById('link').value = ''; document.getElementById('pass').value = ''; }
        else { msg.className = 'err'; msg.textContent = d.error || 'Não deu certo.'; }
      })
      .catch(function () { msg.className = 'err'; msg.textContent = 'O programa no computador não respondeu. Ele ainda está aberto?'; });
  });
</script>
</body></html>`;

const server = http.createServer((req, res) => {
  touch();
  const url = new URL(req.url, 'http://x');
  const now = Date.now();
  for (const [c, p] of pending) if (p.exp < now) pending.delete(c);

  if (req.method === 'GET' && url.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(PAGE);
  }
  if (req.method === 'GET' && url.pathname === '/minhatv/ping') return json(res, 200, { app: 'minhatv-pair' });

  if (req.method === 'POST' && url.pathname === '/minhatv/send') {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 8192) req.destroy(); });
    req.on('end', () => {
      let d;
      try { d = JSON.parse(body); } catch (e) { return json(res, 400, { ok: false, error: 'Dados inválidos.' }); }
      const code = String(d.code || '').replace(/\D/g, '');
      if (code.length !== 6) return json(res, 400, { ok: false, error: 'Código inválido.' });
      const cfg = {};
      for (const k of ['link', 'server', 'user', 'pass']) if (typeof d[k] === 'string' && d[k].trim()) cfg[k] = k === 'pass' ? d[k] : d[k].trim();
      if (!cfg.link && !(cfg.server && cfg.user && cfg.pass)) return json(res, 400, { ok: false, error: 'Faltam dados.' });
      pending.set(code, { cfg, exp: now + TTL_MS });
      console.log('Dados recebidos do navegador. Aguardando a TV buscar…');
      json(res, 200, { ok: true });
    });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/minhatv/config') {
    const code = String(url.searchParams.get('code') || '');
    const p = pending.get(code);
    if (!p) return json(res, 404, { waiting: true });
    pending.delete(code);
    json(res, 200, p.cfg);
    console.log('Dados entregues à TV.' + (keep ? '' : ' Encerrando em 3 segundos.'));
    if (!keep) setTimeout(() => process.exit(0), 3000);
    return;
  }

  json(res, 404, { error: 'not found' });
});

server.listen(PORT, '0.0.0.0', () => {
  touch();
  console.log('Configurar Minha TV está aberto.');
  console.log('  Neste computador: http://localhost:' + PORT);
  for (const ip of lanAddresses()) console.log('  Pelo celular:     http://' + ip + ':' + PORT);
  console.log('Fecha sozinho depois de entregar os dados à TV (ou após 30 min sem uso).');
});
server.on('error', e => { console.log('Não consegui abrir a porta ' + PORT + ': ' + e.message); process.exit(1); });
