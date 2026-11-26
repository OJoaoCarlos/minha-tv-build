# Minha TV

Player IPTV para TVs Samsung com Tizen, no estilo de um app de streaming:
**TV ao vivo**, **Filmes** e **Séries**, cada um com suas categorias, além de
**Busca**, **Favoritos** e **Continuar assistindo**.

Usa a API Xtream Codes (`player_api.php`), a mesma conta do link M3U
`get.php?username=…&password=…` que os provedores entregam.

Feito e testado numa Samsung de 2017 (Tizen 3.0). Por isso o código é ES5 puro e
o CSS evita recursos que esse navegador não tem (variáveis CSS, grid, `gap` no flex,
`NodeList.forEach`).

## Recursos

- Menu lateral: Início, TV ao vivo, Filmes, Séries, Buscar, Favoritos, Ajustes
- Categorias à esquerda, canais/capas à direita, carregamento em lotes para listas grandes
- Detalhes de filme (sinopse, nota, duração) e de série (temporadas e episódios)
- Player com Samsung AVPlay: ao vivo com troca de canal (↑/↓, CH+/CH−),
  filmes/séries com pausa e avanço (← → 10 s, ◄◄ ►► 30 s), próximo episódio automático
- Continuar assistindo e favoritos salvos na TV (`localStorage`)
- Conteúdo adulto oculto por padrão (Ajustes)
- Formato da TV ao vivo: MPEG-TS ou HLS (Ajustes)
- Configuração pelo computador ou celular, sem digitar no controle
- Modo demo: digite `demo` no campo Servidor para testar sem conta

## Estrutura

```
minha-tv/            app Tizen (o que vai para o .wgt)
  config.xml         manifesto (id MinhaTVapp.MinhaTV, Tizen 3.0+)
  index.html
  css/app.css
  js/
    compat.js        polyfills para o navegador do Tizen 3.0
    util.js          utilidades
    store.js         conta, ajustes, favoritos, progresso
    api.js           cliente Xtream Codes
    demo.js          provedor de demonstração (streams públicos de teste)
    player.js        AVPlay (com <video> de reserva para testar no PC)
    nav.js           navegação pelo controle remoto
    app.js           telas e fluxo
ferramentas/
  configurar-tv.js   página no PC para enviar a conta para a TV
  servir-local.js    servidor estático para testar o app no navegador
```

## Instalar na TV

Pré-requisitos: TV em modo desenvolvedor (Apps → `1 2 3 4 5` → Developer Mode ON,
Host PC IP = IP do seu PC, reiniciar a TV) e o Tizen Studio CLI com um perfil de
certificado (`tizen certificate` + `tizen security-profiles add`).

```powershell
sdb connect <ip-da-tv>
tizen package -t wgt -s <perfil> -- .\minha-tv
tizen install -n ".\minha-tv\Minha TV.wgt" -s <ip-da-tv>:26101
```

Atualizações precisam ser assinadas com o **mesmo certificado** da primeira instalação.

> Dica: o Tizen Studio costuma falhar em caminhos com acento. Se o seu usuário do
> Windows tiver acento, copie a pasta `minha-tv` para um caminho simples (ex.: `C:\build\minha-tv`)
> antes de empacotar.

## Configurar a conta pelo computador

1. No PC (na mesma rede da TV):
   ```powershell
   node ferramentas\configurar-tv.js
   ```
2. Na TV, no Minha TV: **Configurar pelo computador ou celular**. Aparece um código de 6 números.
3. No navegador do PC, abra `http://localhost:8766`, digite o código e cole o link M3U.

Os dados ficam só na memória do programa, são entregues uma única vez para quem tem o
código, e o programa fecha sozinho depois disso.

No Windows, a porta precisa estar liberada para redes privadas (PowerShell como administrador):

```powershell
New-NetFirewallRule -DisplayName "Minha TV configurar 8766" -Direction Inbound -Protocol TCP -LocalPort 8766 -Action Allow -Profile Private
```

## Testar no navegador do PC

```powershell
node ferramentas\servir-local.js minha-tv 8765
```

Abra `http://localhost:8765`, digite `demo` no Servidor e use as setas, Enter e Esc
(Esc/Backspace = VOLTAR). No PC o vídeo usa o `<video>` do navegador, então streams HLS
podem não tocar; na TV quem toca é o AVPlay.

## Depurar na TV

```powershell
sdb shell 0 debug MinhaTVapp.MinhaTV 300   # mostra a porta do inspetor
sdb forward tcp:<porta> tcp:<porta>
```

Depois, `http://127.0.0.1:<porta>/json` lista a página para conectar pelo DevTools Protocol.
