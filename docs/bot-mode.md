# Partidas locais contra o bot

Implementação incremental de 21/09/2026, preservando catálogo, contas, decks,
importação, identidade visual e a mesa de demonstração anterior.

## Acesso

- `#/jogar`: entrada autenticada, seleção de seu deck e do deck do bot.
- `#/jogar/bot`: partida automática, com retomada neste navegador e conta.
- `#/jogar/mesa-teste`: protótipo visual anterior, preservado.

Na preparação, escolha duas listas salvas válidas Core/Infinity, ou use
“Testar com duas listas prontas”. As listas de treino são de 60 cartas, não são
salvas na conta e estão centralizadas em `packages/game-core/src/training.ts`.
Criar/entrar em salas aparece como **Em breve**; não há multiplayer neste passo.

## O que o motor resolve

Regras baseadas nas [Comprehensive Rules 2.2.0 oficiais](https://files.disneylorcana.com/Comprehensive-Rules_2.2.0-EN.pdf):

- Embaralhamento determinístico por semente, primeiro jogador aleatório, mão
  inicial, troca inicial e compra (primeiro jogador pula sua primeira compra).
- Uma carta com tinteiro por turno; pagamento de tinta exaurindo recursos
  automaticamente; rejeição de custo insuficiente e ações fora da vez.
- Preparar, secar, lore de locais, efeitos de início, compra e fim de turno.
- Personagens, itens, ações, canções/canto conjunto, locais e movimentação paga.
- Explorar para ganhar lore; desafio a alvos permitidos; dano simultâneo,
  persistente e banimento; Resist, Challenger, Evasive, Alert e Bodyguard.
- Keywords padrão, inclusive Ward, Vanish, Support, Rush, Reckless, Singer,
  Boost e Shift numérico comum. Variantes especiais de Shift não estão completas.
- Fila de resolução, bolsa de gatilhos e escolhas de ordem/alvo/quantidade;
  efeitos opcionais; atributos e restrições contínuas e temporárias.
- Compra, descarte escolhido pelo afetado, recuperar do descarte, banir,
  devolver à mão, causar/remover dano, preparar/exaurir, ganhar/perder lore,
  modificar atributos e colocar o topo no tinteiro, nas redações reconhecidas.
- Vitória aos 20 lore, desistência e derrota por deck vazio ao terminar o
  próprio turno, conforme esta versão das regras.

Clique numa carta para ver imagem original, tradução, atributos atuais e ações
legais. As decisões obrigatórias bloqueiam Passar turno. O descarte de ambos os
lados pode ser consultado, mas recuperar exige um efeito válido.

## Limites explícitos

**Não é uma implementação completa de todas as cartas de Lorcana.** O compilador
reconheceu integralmente 1.140 das 3.242 impressões ativas do catálogo local
(947 nomes completos distintos). Isso mede reconhecimento, não prova todas as
combinações possíveis. O restante é recusado na preparação da partida, com a
habilidade pendente listada; não se ignora texto para tratar a carta como vanilla.

Veja `card-coverage.md` para cobertura reproduzível e famílias ausentes, e
`lorcana-rules.md` para regras, regressões e lacunas. Permanecem, entre outras,
substituições, variantes avançadas de Shift, efeitos dependentes, seleção privada
no deck, manipulações especiais de cartas embaixo e vários gatilhos históricos.
O texto de regras usado é o original inglês; traduções são apenas apresentação.

## Bot e segurança

O bot usa busca heurística determinística de duas decisões, limitada a 72
transições simuladas. Avalia vitória, ameaça de lore, trocas favoráveis, custos,
curva da mão e valor de campo. Não é um solucionador perfeito nem uma IA remota.
Sua projeção mascara mão adversária, ordem dos decks, tintas e cartas ocultas
embaixo, inclusive em contextos de efeitos; não escolhe com base nesses segredos.

As partidas rodam **localmente** e o estado JSON fica no armazenamento do
navegador, separado por ID da conta. É treino: sem ranking, apostas ou resultado
confiável para outro jogador. Um usuário pode alterar seu próprio estado local;
multiplayer exigirá autoridade no servidor, projeções privadas e comandos
validados. Nenhum segredo de banco ou chave privada foi adicionado ao cliente.

A API nova só lê dados, exige a sessão existente, valida propriedade do deck,
revalida o formato e responde com `Cache-Control: no-store`. Não altera decks,
contas ou banco. Consulte `game-api.md`. Não houve publicação em produção.

## Validação

```text
npm run test:game
npm run game:coverage
npm run test:game:catalog
npm run typecheck
npm run build:client
npm run mobile:sync
php tests/php/game-api.test.php
```

Os testes comuns não dependem do banco. Os dois comandos de catálogo fazem
apenas SELECT no MariaDB local do XAMPP, conforme as instruções de cobertura.

Evidências deste passo:

- 102 testes unitários/regressões (21 compilador, 49 motor, 32 bot).
- 15 testes HTTP da API em SQLite isolado, sem credenciais ou dados reais,
  cobrindo autenticação, propriedade, serialização, métodos e ausência de escrita.
- 12 partidas completas com as mesmas listas de treino da interface: 944
  decisões legais, 120 cartas físicas conservadas em cada passo, sem ciclos.
- Medições Node desktop: mediana 7,9 ms, p95 44,8 ms, máximo 72,4 ms nessa
  simulação. Não são medições de um celular físico.
- Navegador: seleção de decks e recusa de lista inválida; partida, tinta,
  pagamento, custo insuficiente, bot, secagem, combate com banimento, consulta
  do descarte, seleção de alvo e quantidade para cura, retomada após recarregar.
- Revisão visual desktop, tablet horizontal, celular horizontal e aviso de
  rotação em celular vertical. Build e sincronização não equivalem a testes em
  aparelhos Android/iOS físicos.
