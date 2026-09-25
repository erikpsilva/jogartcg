# Batalhas do castelo — beta local

Implementado em 2026-09-25 para Moana (S1-1), Cruella (S1-2) e Mufasa (S1-3).

- Estado persistido no servidor; baralho da aventura copiado no início da partida.
- Uma batalha ativa por jogador, serializada pelo bloqueio da carteira. Enfrentar retoma a batalha ativa.
- Ações autenticadas com CSRF, revisão e validação pelo motor PHP. Resultado não é informado pelo cliente.
- Estado público usa `gameViewForSeat`: mão adversária, ordem dos decks e semente não são expostas.
- Primeira vitória: 100 XP/500 gold; repetição: 60 XP/100 gold; derrota: 20 XP/0 gold. Valores lidos do controle de economia.
- Três conclusões diárias da aventura concedem a missão de 250 XP uma vez por data de Brasília. Desistência é derrota e conta como conclusão.
- Resultados atualizam carteira, progresso de fase e XP do passe; o concedente de XP aplica foil ao cruzar nível.
- Fases 4–9 não possuem batalha disponível. Não foram inventados decks.

## Limitações explícitas

O motor existente preserva regras compiladas, mas ignora trechos de habilidades ainda não suportados. O início da fase avisa que a batalha é beta; a mesa lista as cartas afetadas. Não considerar implementação completa das regras oficiais dos starters.

Bot usa avaliação tática e busca limitada a três decisões no módulo compartilhado do servidor (ver `bot-strategy.md`). Não há garantia de jogada ótima. Partidas podem ser guardadas sem prazo de abandono.

Missões de Versus e bônus por todas as missões continuam pendentes de integração.

## Validação

`scripts/test-adventure-battles.php`: isolamento entre usuários, revisão, retomada, primeiro resultado/repetição, progressão, missão única e simulação completa com os três starters. Tabelas temporárias; nenhum resultado é aplicado a contas reais pelos testes.

Build nativo e lint PHP executados. Validação visual no navegador não realizada nesta etapa. Migração aplicada apenas no banco local, sem reset ou publicação.
