# Multiplayer online

Salas de dois jogadores com código de 6 dígitos. O servidor é autoritativo e o cliente nunca recebe o estado real da partida.

## Como funciona

```
Navegador ──long poll / POST──▶ PHP (api/rooms.php) ──────▶ motor de regras em PHP
                                 sessão, CSRF, salas,        config/game/*.php
                                 locks, revisão, MySQL       regras compiladas em lorcana_cards.rules_json
```

- **PHP** cuida de tudo: autenticação, CSRF, salas, assentos, transações (`SELECT … FOR UPDATE`), revisão, limpeza **e as regras do jogo**. O servidor precisa apenas de PHP e MySQL — não existe Node, processo externo ou serviço em outra máquina.
- **O motor** (`config/game/`) é um porte fiel do motor em TypeScript usado na mesa contra o bot, que continua rodando no navegador. `tests/game/engine_equivalence_test.php` prova que os dois jogam igual.
- A cada jogada aceita, o motor devolve o estado novo e a **visão pronta de cada assento**. O PHP grava as três no banco, então o polling só lê o banco.

### O motor em PHP

| Arquivo | O que faz |
|---|---|
| `config/game/rng.php` | sorteio mulberry32, idêntico bit a bit ao do JavaScript |
| `config/game/engine.php` | estado, atributos, efeitos contínuos, gatilhos, turno |
| `config/game/actions.php` | ações legais, jogar carta, decisões, `gameApplyAction` |
| `config/game/match.php` | assentos, montagem dos decks e `gameViewForSeat` |
| `config/multiplayer.php` | tempos das salas e `callReferee()`, a porta de entrada da API |

O motor não lê o texto impresso das cartas: ele usa as regras já compiladas na coluna `lorcana_cards.rules_json`. Quem compila é `bin/compile_card_rules.php`, que roda **no desenvolvimento** (onde existe Node) e grava o resultado no banco. Como em `buildGameCards`, uma frase que o compilador não reconheceu vira texto sem efeito automático, e a carta entra na mesa assim mesmo.

### O que cada jogador recebe (`gameViewForSeat`)

O estado é orientado para quem está vendo: `player` é sempre você e `bot`, o adversário. Por isso a mesa (`MatchTable`) é a mesma nos dois modos. Ficam de fora:

- a semente aleatória (`rng`), que permitiria prever embaralhamentos e compras;
- a mão e o deck do adversário, e também a ordem do seu próprio deck;
- a identidade das cartas no tinteiro, que ficam viradas para baixo;
- as opções de uma escolha pendente do adversário (só aparece que ele está escolhendo);
- e-mail, CPF e o nome do deck do adversário. As cores do deck só aparecem depois do início.

### Regras de integridade

- O assento vem da sessão. O `player` enviado pelo cliente é descartado.
- O motor só aceita uma ação idêntica a uma das suas ações legais para aquele assento.
- Toda jogada leva a `revision` em que foi escolhida. Revisão diferente da atual responde `409 stale_revision` com a mesa atual, o que cobre clique duplicado e jogada fora de ordem.
- O deck é recarregado e revalidado do banco ao escolher, ao confirmar e ao iniciar.
- `sala_jogadores.ativo_usuario_id` (índice único) garante no banco que ninguém ocupa dois assentos ativos.
- `salas.codigo_aberto` (índice único) garante que dois lobbies abertos nunca dividam o mesmo código.

### Tempos (`config/multiplayer.php`)

| Situação | Resultado |
|---|---|
| Lobby 30 min sem começar | sala `expirada` |
| Criador some do lobby por 90 s | sala `abandonada` |
| Convidado some do lobby por 90 s | assento liberado, criador precisa confirmar de novo |
| Jogador some da partida por 180 s | o outro vence por `abandono` |
| Os dois somem da partida | sala `expirada`, sem vencedor |

A limpeza roda sob demanda, no início de cada requisição de sala. Não há cron.

## Instalação

1. Aplique `database/migrations/2026-09-21-multiplayer-rooms.sql` e `database/migrations/2026-09-22-card-rules.sql`. As duas são idempotentes.
2. Gere as regras das cartas: `npm run build:core` e depois `php bin/compile_card_rules.php`. Isso preenche `rules_json` e `rules_supported`. Rode de novo a cada sincronização do catálogo.
3. Publique. A produção recebe `config/` inteiro (com `config/game/`) e o banco com a coluna `rules_json` preenchida. Nada de Node no servidor.

Confira em `/api/v1/rooms/diagnostico` (precisa estar logado): ele responde quantas cartas têm regras no banco e cria uma partida de teste com cartas reais.

## Testes

```bash
php tests/game/engine_equivalence_test.php
```

Joga partidas inteiras no motor em PHP e no motor original em JavaScript com a mesma semente e a mesma sequência de jogadas, comparando o estado depois de cada uma. São partidas aleatórias mais partidas dirigidas para cada mecânica (transformar, cantar, cantar juntos, impulsionar, guarda-costas, locais, desistência...), e ao final o teste lista as jogadas e decisões que exercitou. Só este teste precisa de Node.

```bash
php tests/api/multiplayer_rooms_test.php
```

Usa HTTP real contra `http://localhost/jogartcg/api/v1` (troque com `JOGARTCG_API`). Cria usuários temporários `@mp-test.local` e remove tudo ao final. Precisa de pelo menos um deck Core salvo e ainda válido no banco. Leva cerca de 30 s porque inclui a janela completa do long poll.

```bash
node --test packages/game-core/engine.test.mjs packages/game-core/cards.test.mjs packages/game-core/tests/bot.test.mjs packages/game-core/tests/multiplayer.test.mjs
```

Testes do motor em TypeScript, que continua sendo o da mesa contra o bot no navegador.
