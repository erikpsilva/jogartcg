# Continuação: árbitro na produção e ícones nos textos das cartas (21/09/2026)

Projeto `C:\xampp\htdocs\jogartcg` (Windows/XAMPP, produção KingHost em https://www.jogartcg.com.br). Este documento resume o que já foi feito nesta rodada para que a próxima sessão continue sem refazer nada. Tudo está só no ambiente local, sem commit, push ou deploy; o último commit continua `07bc2ba`. Não faça commit, push ou deploy sem pedido explícito, e não navegue pelas telas: o usuário faz o teste visual.

## 1. Erro "O servidor de regras esta indisponivel" ao começar partida online

**Sintoma relatado:** na produção, com a sala criada e os dois jogadores dentro, ao clicar em "Começar" aparecia `O servidor de regras esta indisponivel. Tente novamente em instantes.`

**Onde nasce:** criar e entrar na sala não usam o árbitro. Ele é chamado por `callReferee()` (`config/multiplayer.php`) em três pontos de `api/rooms.php`: `startMatchIfReady()` (quando o segundo jogador confirma "Começar"), cada jogada (`action`) e a desistência (`concedeSeat()`). Qualquer falha ao executar o Node vira `RefereeUnavailable` e responde 503 com essa mensagem; a transação é desfeita, então a confirmação do jogador não fica gravada.

**Causa confirmada:** `scripts/build-release.ps1` só enviava `.htaccess`, `index.php`, `api`, `client`, `admin`, `assets/fontawesome` e `config`. O árbitro (`services/game-server/dist/referee.js`, que está no `.gitignore` por ser `dist/`) e o motor (`packages/game-core`) nunca iam para a produção. Mesmo enviando a pasta, o `referee.js` importa `@jogartcg/game-core` por um link simbólico de workspace em `node_modules`, que o FTP não reproduz.

**Correção feita:**
- `services/game-server/package.json`: `build` agora roda `tsc` e em seguida `bundle:referee`, que usa o esbuild (já presente em `node_modules` como dependência do Vite) para gerar `services/game-server/dist/referee.bundle.mjs` (~80 KB), com o motor embutido e sem imports externos.
- `config/multiplayer.php`: `multiplayerRefereeScript()` prefere `referee.bundle.mjs` e cai para `referee.js` se o pacote não existir.
- `scripts/build-release.ps1`: roda `build:core` e `build:server`, falha se o pacote não for gerado, copia-o para `.deploy/release/services/game-server/dist/` e cria `.deploy/release/services/.htaccess` com `Require all denied`.
- `docs/multiplayer.md`: passo de instalação atualizado.

**Validado:** 107/107 testes do motor; `php tests/api/multiplayer_rooms_test.php` com 44/44 passando via Apache já usando o pacote; release gerada localmente com o pacote dentro; o pacote copiado para uma pasta fora do projeto (sem `node_modules`) executou e o motor respondeu.

**Pendente (não verificado, depende da hospedagem):** a KingHost precisa ter Node no servidor e `proc_open` habilitado no PHP. Depois do deploy, se o erro continuar, o motivo exato está no log de erros do PHP com prefixo `[jogartcg] arbitro` (ex.: `Arbitro de regras nao compilado`, `Nao foi possivel iniciar o Node`, `arbitro falhou (exit N)`). Node fora do caminho padrão: definir `JOGARTCG_NODE_BINARY`. Sem Node na hospedagem, a alternativa prevista em `docs/multiplayer.md` é servir o árbitro por HTTP em `services/game-server`, mantendo o mesmo contrato JSON. Não sonde a produção sem pedido do usuário.

## 2. Símbolos do Lorcana como ícones nos textos das cartas

Pedido original em `docs/CLAUDE_ICONES_LORCANA.md` (a seção "Resultado" no fim dele já registra o que foi feito). Referências do usuário em `images/icons/*.png`: formas pretas puras sobre fundo transparente, sem branco opaco.

**Mapeamento (pela semântica dos dados, convenção LorcanaJSON, não por semelhança visual):**

| Caractere | Ícone | Rótulo acessível |
|---|---|---|
| `¤` | iconStrength | Força |
| `⛉` | iconWillpower | Vontade |
| `◊` | iconLore | História |
| `⟳` | iconExert | Exaurir |
| `⬡` | iconInk | Tinta (é o `{I}`; não é a moldura do custo) |
| `◉` | iconInkable | Tinteiro ("carta com ◉" = pode ir ao tinteiro) |

`iconCost` não tem caractere correspondente nos textos e ficou sem uso.

**Implementação:**
- Os PNGs são usados como máscara CSS (`mask-image` + `-webkit-mask-image`, `background-color: currentColor`): forma original, cor herdada do texto, tamanho `1.05em` alinhado à linha. Não houve vetorização (sem ferramenta de traçado fiel disponível; o pedido permite os PNGs nesse caso). Evitei `url()` dentro de variável CSS porque o caminho relativo pode ser resolvido contra a página.
- React: componente único `apps/game-client/src/components/CardText.tsx`. Divide o texto nos seis caracteres; o resto continua texto comum escapado pelo React (sem `innerHTML`); `\n` vira `<br>`. Aplicado em `CardDetailPage.tsx` (PT e EN), `DeckBuilderPage.tsx` (PT, EN, esclarecimentos e erratas), `GameTablePage.tsx` e `MatchTable.tsx` (texto da carta, texto original e `pending.description` do diálogo de efeito). Estilo `.card-symbol` no fim de `apps/game-client/src/styles/app.less`.
- Ícones do app: `apps/game-client/src/assets/card-icons/{strength,willpower,lore,exert,ink,inkable}.png` (128 px, gerados das referências com ffmpeg, alfa preservado). O Vite os empacota com hash em `client/assets/` (o de Lore, pequeno, sai embutido no CSS).
- PWA: `apps/game-client/vite.config.ts` ganhou `workbox.globPatterns: ['**/*.{js,css,html}', 'assets/*.png']` para os ícones funcionarem offline (o padrão do Workbox não incluía PNG).
- PHP: `includes/card_symbols.php` com `cardTextHtml()` (escapa com `htmlspecialchars`, troca os caracteres pelas marcações de ícone e aplica `nl2br`). Usado em `pages/carta-renderizada/index.php` e `pages/carta-traduzida/index.php`. Estilo em `pages/carta-traduzida/card-translation.less` apontando para `../images/icons/icon*.png`, compilado em `styles/style.min.css`. Observação: essas páginas PHP hoje não têm rota ativa (o `index.php` da raiz só redireciona para `/client/#/cartas`) e não entram na release.
- Banco e motor intocados: os caracteres continuam no banco e em `packages/game-core/src/cards.ts`.

**Validado:** `npm run typecheck`, `npm run build:client`, `npm run mobile:sync`, 107/107 testes do motor, `php -l` nos PHP alterados, teste do helper PHP e do componente React com texto real e malicioso (nenhuma tag injetada), e renderização das páginas PHP pela linha de comando com cartas contendo cada símbolo (todos viram ícone, nenhum caractere cru sobra). `npx gulp compileLessRoot` não funciona neste projeto (a tarefa não é exportada no `gulpfile.js`); o CSS foi compilado com o mesmo pipeline `gulp-less` + `gulp-clean-css`.

**Lacuna nos dados (não corrigida, por instrução de não alterar o banco):** a tradução automática antiga apagou `⛉` e `◉` dos textos em português (40 textos com `⛉` e 5 com `◉` em inglês; nenhum em português) e trocou `◉` por `□` em 2 habilidades PT (cartas 1830 e 1884). `tools/translate_lorcana.py` agora protege `(⟳|◊|⬡|¤|⛉|◉)`; os textos já gravados só se corrigem retraduzindo essas cartas. Python não está instalado nesta máquina, então o tradutor não foi executado.

## Arquivos desta rodada

Modificados: `config/multiplayer.php`, `scripts/build-release.ps1`, `services/game-server/package.json`, `docs/multiplayer.md`, `docs/CLAUDE_ICONES_LORCANA.md`, `apps/game-client/src/components/MatchTable.tsx`, `apps/game-client/src/pages/CardDetailPage.tsx`, `apps/game-client/src/pages/DeckBuilderPage.tsx`, `apps/game-client/src/pages/GameTablePage.tsx`, `apps/game-client/src/styles/app.less`, `apps/game-client/vite.config.ts`, `pages/carta-renderizada/index.php`, `pages/carta-traduzida/index.php`, `pages/carta-traduzida/card-translation.less`, `styles/style.min.css`, `tools/translate_lorcana.py`, build versionado em `client/` (`index.html`, `sw.js`, `assets/`).

Novos: `apps/game-client/src/components/CardText.tsx`, `apps/game-client/src/assets/card-icons/` (6 PNGs), `includes/card_symbols.php`, este documento.

## Próximos passos

1. Publicar: `npm run deploy:check` (simula e lista os arquivos; deve aparecer `services/game-server/dist/referee.bundle.mjs` e `services/.htaccess`) e, com autorização do usuário, `npm run deploy`.
2. Testar na produção uma sala com dois usuários até a mesa abrir. Se o erro persistir, ler o log do PHP (prefixo `[jogartcg]`) e tratar Node/`proc_open` na KingHost.
3. Opcional: retraduzir as cartas que perderam `⛉`/`◉` quando houver Python disponível.
