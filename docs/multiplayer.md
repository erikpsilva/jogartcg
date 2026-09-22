# Multiplayer online

Salas de dois jogadores com código de 6 dígitos. O servidor é autoritativo e o cliente nunca recebe o estado real da partida.

## Como funciona

```
Navegador ──long poll / POST──▶ PHP (api/rooms.php) ──stdin/stdout──▶ Node (árbitro)
                                 sessão, CSRF, salas,               services/game-server/dist/referee.js
                                 locks, revisão, MySQL              motor compartilhado (packages/game-core)
```

- **PHP** cuida de autenticação, CSRF, salas, assentos, transações (`SELECT … FOR UPDATE`), revisão e limpeza.
- **Árbitro Node** é uma CLI sem estado que roda o mesmo `game-core` da mesa contra o bot. Cada chamada recebe um JSON e devolve outro. Ele não guarda nada entre chamadas.
- A cada jogada aceita, o árbitro devolve o estado novo e a **visão pronta de cada assento**. O PHP grava as três no banco. Por isso o polling só lê o banco e nunca executa o Node.

### O que cada jogador recebe (`viewForSeat`)

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

1. Aplique `database/migrations/2026-09-21-multiplayer-rooms.sql`. A migration é idempotente.
2. Compile o motor e o árbitro com `npm run build`. O build do árbitro gera `services/game-server/dist/referee.bundle.mjs`, com o motor embutido e sem depender de `node_modules`. É esse arquivo que a release (`scripts/build-release.ps1`) envia para a produção, junto com um `.htaccess` que bloqueia `services/` para o navegador.
3. Confirme que o Apache enxerga o Node. No Windows, `C:\Program Files\nodejs\node.exe` é detectado sozinho. Em outro caminho, defina `JOGARTCG_NODE_BINARY`.

> **Hospedagem:** o servidor precisa de Node e de `proc_open` habilitado no PHP. Hospedagem compartilhada comum às vezes não oferece nenhum dos dois. O contrato do árbitro (JSON de entrada e de saída) foi feito para, se preciso, virar um endpoint HTTP em `services/game-server` sem mudar o PHP.

## Testes

```bash
node --test packages/game-core/engine.test.mjs packages/game-core/cards.test.mjs packages/game-core/tests/bot.test.mjs packages/game-core/tests/multiplayer.test.mjs
```

```bash
php tests/api/multiplayer_rooms_test.php
```

O teste de API usa HTTP real contra `http://localhost/jogartcg/api/v1` (troque com `JOGARTCG_API`). Ele cria usuários temporários `@mp-test.local` e remove tudo ao final. Precisa de pelo menos um deck Core salvo e ainda válido no banco. A suíte leva cerca de 30 s porque inclui a janela completa do long poll.
