# Estratégia dos bots

Atualização local: 2026-09-25.

## Pontos de entrada

- Versus local: `packages/game-core/src/bot.ts`, `chooseBotAction`.
- Servidor/aventura: `config/game/bot.php`, `gameBotAction`. O adaptador da aventura chama esse módulo; novos bots no servidor devem reutilizá-lo.

Ambos usam ações legais do motor, avaliação de posição e busca limitada a três decisões: até 24 ações iniciais, 6 × 8 respostas próprias e 6 × 2 × 4 continuações (120 simulações). Não é busca exaustiva nem promessa de jogada ótima. A escolha é recalculada após cada ação e cada alvo.

Avaliam vitória imediata, ameaça visível de conhecimento no próximo turno, remoções, atributos atuais, resistência/evasão/protetores, risco de desafios, mão inicial, curva de custos, tinta e valor das cartas preservadas. Habilidades gratuitas sem benefício são evitadas. Empates usam identidade da ação, não o texto traduzido.

## Informação limitada

Antes da busca, as identidades das cartas dos dois decks e da mão adversária são substituídas por cartas desconhecidas. A semente real não entra na simulação. Cartas viradas para baixo em pilhas e fontes de habilidades são ocultadas. A mão própria e cartas públicas podem ser consideradas. Não usa a ordem real de compra para escolher jogadas.

## Verificação

- Testes táticos TS: vitória, ameaça letal, Resist, Evasive, Bodyguard, alvo múltiplo, mulligan, descarte, não repetição e informação oculta.
- Auditoria de catálogo TS: 12 partidas completas, 966 decisões, sem travamento ou perda/duplicação de cartas na amostra medida.
- PHP: testes táticos e 12 partidas comparativas com os três starters, alternando os lados. Venceu 12/12 contra o seletor anterior de prioridades fixas. É uma amostra pequena e não demonstra força contra jogadores humanos.
- Medição local inicial: PHP p95 ~241 ms/decisão; TS catálogo p95 ~70 ms. Não são medições em celular. Tabuleiros muito cheios podem ser mais lentos.

## Limitações

Os motores PHP e TS permanecem separados; devem receber testes ao alterar regras. Não há inferência probabilística de mão rival nem busca exaustiva de respostas adversárias. Trechos de habilidades ainda não automatizados pelo motor continuam limitando a estratégia. Esta mudança não implementa essas habilidades e não altera recompensas ou baralhos dos jogadores.
