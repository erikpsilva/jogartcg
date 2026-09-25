# The First Chapter — implementação inicial

Implementado localmente: mapa SVG do interior do castelo, nove salas, portraits do catálogo quando disponíveis, escolha permanente de um dos três starters S1, persistência em adventure_journeys e visualização completa do deck exclusivo. A API exige autenticação, adventure_access e CSRF na escolha; não recebe decks externos. INSERT IGNORE impede substituir a escolha. As tabelas de decks do Versus e saldos não são alteradas.

Atualização da loja: compra de boosters por 1.500 gold (preço lido de economy_settings), outros starters por 5.000 gold com compra única, escolha de 1–100 boosters por operação, confirmação, pacotes fechados persistentes, abertura com revelação e opção de pular, histórico para rever cada pacote e editor de deck com validação no servidor. Transações serializadas por carteira e identificador idempotente de compra. Sorteio 7 comuns/3 incomuns/2 raras, 1% por pacote de uma carta foil. Foil persistida por jogador/carta; repetida concede token. Efeito visual na coleção e abertura do castelo. Integração foil nas outras telas e resgate de tokens ainda pendentes.

Ainda NÃO implementado: batalhas da campanha, decks próprios dos inimigos, IA/dificuldade crescente, conclusão de fases, desbloqueio de ilhas, recompensas de gold/XP e integração do XP com o passe. Botões de batalha indisponíveis, sem vitória simulada.

Bloqueio de regras: scripts/audit-first-chapter.php encontrou habilidades pendentes em 6, 10 e 6 cartas dos starters S1-1, S1-2 e S1-3. O motor atual gameBuildCards ignora partes não reconhecidas; isso não deve validar conquistas/recompensas da campanha. Corrigir e testar essas habilidades antes de integrar a campanha ao motor PHP autoritativo. Nunca aceitar estado, vitória ou prêmio decidido pelo cliente.

Economia: gold geral da conta, deck e coleção exclusivos da aventura; preços definidos em config/economy.php e persistidos pelo painel Controle de XP e Gold. Compra de starter adiciona exatamente suas 60 cartas, sem booster extra e sem substituir o deck salvo. Testes scripts/test-castle-shop.php usam tabelas temporárias na sessão: nenhuma carteira real alterada.

Embalagens: arte oficial https://ravensburger.cloud/cms/gallery/s1-booster-wraps.png, encontrada em https://www.disneylorcana.com/en-US/product/the-first-chapter. Elsa, Mickey e Malévola (não Rainha Má). Exibidas por recorte CSS do asset preservado.

Ordem: Moana, Cruella, Mufasa, Aurora, Donald, Aladdin, Malévola, Elsa, Mickey. Alguns personagens podem não ter carta no primeiro set; avatar não define a legalidade do deck. Após vencer todas as nove fases, liberar Rise of the Floodborn e Into the Inklands. Não há desbloqueio por apenas visitar o castelo.
