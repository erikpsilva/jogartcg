<?php

declare(strict_types=1);

/**
 * Acoes do motor de regras: o que cada jogador pode fazer e o que acontece
 * quando ele faz. Porte fiel da segunda metade de packages/game-core/src/engine.ts
 * (getLegalActions, playCard, choose e applyAction).
 */

require_once __DIR__ . '/engine.php';

const GAME_ACTION_LABELS = [
    'choose' => 'Escolher', 'mulligan' => 'Trocar cartas', 'ink' => 'Colocar no tinteiro', 'play' => 'Jogar',
    'shift' => 'Transformar', 'sing' => 'Cantar', 'quest' => 'Explorar', 'challenge' => 'Desafiar',
    'move' => 'Mover', 'activate' => 'Usar habilidade', 'boost' => 'Impulsionar',
    'endTurn' => 'Encerrar turno', 'concede' => 'Conceder',
];

function gameActionLabel(array $action): string
{
    return $action['label'] ?? (GAME_ACTION_LABELS[$action['type']] ?? $action['type']);
}

/** Identidade da acao sem o rotulo, para comparar a jogada recebida com a lista legal. */
function gameCanonical(array $action): string
{
    unset($action['label']);
    ksort($action, SORT_STRING);
    return json_encode($action, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}

function gameChallengeTargets(array $state, array $attacker, string $player): array
{
    if ($attacker['card']['type'] !== 'Character' || $attacker['exerted']
        || ($attacker['drying'] && !gameHasKeyword($state, $attacker['iid'], 'Rush'))
        || gameRestricted($state, $attacker['iid'], 'cantChallenge')) {
        return [];
    }
    $eligible = [];
    foreach ($state['players'][gameOther($player)]['field'] as $target) {
        if (gameRestricted($state, $target['iid'], 'cantBeChallenged')) continue;
        if (gameHasKeyword($state, $target['iid'], 'Evasive')
            && !gameHasKeyword($state, $attacker['iid'], 'Evasive')
            && !gameHasKeyword($state, $attacker['iid'], 'Alert')) continue;
        if ($target['card']['type'] === 'Location') { $eligible[] = $target; continue; }
        if ($target['card']['type'] === 'Character' && $target['exerted']) $eligible[] = $target;
    }
    $guards = [];
    foreach ($eligible as $target) {
        if ($target['card']['type'] === 'Character' && gameHasKeyword($state, $target['iid'], 'Bodyguard')) $guards[] = $target['iid'];
    }
    $result = [];
    foreach ($eligible as $target) {
        if ($target['card']['type'] === 'Location' || $guards === [] || in_array($target['iid'], $guards, true)) $result[] = $target;
    }
    return $result;
}

/** Subconjuntos de tamanho entre min e max, na mesma ordem e com o mesmo limite do motor original. */
function gameCombinations(array $items, int $min, int $max, int $limit = 128): array
{
    $result = [];
    $visit = static function (int $index, array $chosen) use (&$visit, &$result, $items, $min, $max, $limit): void {
        if (count($chosen) >= $min) $result[] = $chosen;
        if (count($chosen) >= $max || count($result) >= $limit) return;
        for ($i = $index; $i < count($items) && count($result) < $limit; $i++) {
            $next = $chosen;
            $next[] = $items[$i];
            $visit($i + 1, $next);
        }
    };
    $visit(0, []);
    return $result;
}

function gameSingingCost(array $state, array $card): int
{
    $cost = $card['card']['cost'];
    foreach (gameStats($state, $card['iid'])['keywords'] as $rule) {
        if ($rule['keyword'] === 'Singer') $cost = max($cost, $rule['value'] ?? 0);
    }
    return $cost;
}

function gameEligibleSingers(array $state, string $player): array
{
    $singers = [];
    foreach ($state['players'][$player]['field'] as $card) {
        if ($card['card']['type'] === 'Character' && !$card['exerted'] && !$card['drying']
            && !gameRestricted($state, $card['iid'], 'cantSing')) $singers[] = $card;
    }
    return $singers;
}

function gameSingerSelections(array $options, int $required): array
{
    // Conjunto limitado de escolhas executaveis; a interface pode mandar qualquer combinacao valida.
    $result = [];
    $keys = [];
    for ($start = 0; $start <= count($options); $start++) {
        if ($start === count($options)) {
            $ordered = $options;
        } else {
            $rest = $options;
            array_splice($rest, $start, 1);
            usort($rest, static fn(array $a, array $b): int => ($b['value'] ?? 0) <=> ($a['value'] ?? 0));
            $ordered = array_merge([$options[$start]], $rest);
        }
        $selection = [];
        $value = 0;
        foreach ($ordered as $option) {
            $selection[] = $option;
            $value += $option['value'] ?? 0;
            if ($value >= $required && $start !== count($options)) break;
        }
        $ids = array_map(static fn(array $option): string => (string) $option['id'], $selection);
        sort($ids, SORT_STRING);
        $key = implode(',', $ids);
        if ($value >= $required && !isset($keys[$key])) { $keys[$key] = true; $result[] = $selection; }
    }
    return $result;
}

/** Tudo que o jogador pode fazer agora. A interface e o bot usam a mesma lista. */
function gameLegalActions(array $state, ?string $player = null): array
{
    $player ??= gameActiveDecisionPlayer($state) ?? $state['activePlayer'];
    if ($state['phase'] === 'finished') return [];
    $actions = [];
    $add = static function (array $details, string $label) use (&$actions, $player): void {
        $actions[] = array_merge($details, ['player' => $player, 'label' => $label]);
    };

    if ($state['pending'] !== null) {
        if ($state['pending']['player'] === $player) {
            $pending = $state['pending'];
            $selections = ($state['decision']['kind'] ?? null) === 'singers'
                ? gameSingerSelections($pending['options'], $state['decision']['required'])
                : gameCombinations($pending['options'], $pending['min'], $pending['max']);
            foreach ($selections as $selection) {
                $label = $selection !== []
                    ? implode(' + ', array_map(static fn(array $option): string => $option['label'], $selection))
                    : ($pending['kind'] === 'mulligan' ? 'Manter a mão' : 'Não / passar');
                $add(['type' => 'choose', 'optionIds' => array_map(static fn(array $option): string => (string) $option['id'], $selection)], $label);
            }
        }
    } elseif ($state['phase'] === 'main' && $state['activePlayer'] === $player) {
        $own = $state['players'][$player];
        $ink = gameAvailableInk($state, $player);
        $singers = gameEligibleSingers($state, $player);

        foreach ($own['hand'] as $card) {
            $name = gameCardName($card['card']);
            if (!$own['inkedThisTurn'] && $card['card']['inkwell']) $add(['type' => 'ink', 'iid' => $card['iid']], "Tinteiro: {$name}");
            if (gameStats($state, $card['iid'])['cost'] <= $ink) {
                $add(['type' => 'play', 'iid' => $card['iid']], "Jogar: {$name}");
                if (gameHasKeyword($state, $card['iid'], 'Bodyguard')) {
                    $add(['type' => 'play', 'iid' => $card['iid'], 'exerted' => true], "Jogar exaurido: {$name}");
                }
            }
            if ($card['card']['type'] === 'Character') {
                foreach ($card['card']['rules']['keywords'] as $shift) {
                    if ($shift['keyword'] !== 'Shift') continue;
                    $cost = gameEffectiveCost($state, $card['iid'], $shift['value'] ?? 0);
                    if ($cost > $ink) continue;
                    foreach ($own['field'] as $target) {
                        if ($target['card']['type'] !== 'Character') continue;
                        if (gameBaseName($target['card']['name']) !== ($shift['shiftName'] ?? gameBaseName($card['card']['name']))) continue;
                        $add(['type' => 'shift', 'iid' => $card['iid'], 'onto' => $target['iid'], 'cost' => $cost],
                            "Transformar: {$name} sobre " . gameCardName($target['card']));
                    }
                }
            }
            if ($card['card']['type'] === 'Action' && in_array('Song', $card['card']['subtypes'], true)) {
                $together = null;
                foreach ($card['card']['rules']['keywords'] as $rule) if ($rule['keyword'] === 'Sing Together') { $together = $rule; break; }
                if ($together !== null) {
                    $total = 0;
                    foreach ($singers as $singer) $total += gameSingingCost($state, $singer);
                    if ($singers !== [] && $total >= $together['value']) {
                        $add(['type' => 'sing', 'iid' => $card['iid'], 'singers' => []], "Cantar juntos: {$name} (escolher personagens)");
                    }
                } else {
                    foreach ($singers as $singer) {
                        if (gameSingingCost($state, $singer) >= $card['card']['cost']) {
                            $add(['type' => 'sing', 'iid' => $card['iid'], 'singers' => [$singer['iid']]],
                                "Cantar: {$name} (" . gameCardName($singer['card']) . ')');
                        }
                    }
                }
            }
        }

        $mustChallenge = false;
        foreach ($own['field'] as $card) {
            $name = gameCardName($card['card']);
            if ($card['card']['type'] === 'Character') {
                if (!$card['exerted'] && !$card['drying'] && !gameHasKeyword($state, $card['iid'], 'Reckless')
                    && !gameRestricted($state, $card['iid'], 'cantQuest')) {
                    $add(['type' => 'quest', 'iid' => $card['iid']], "Explorar: {$name}");
                }
                $opponents = gameChallengeTargets($state, $card, $player);
                if ($opponents !== [] && gameHasKeyword($state, $card['iid'], 'Reckless')) $mustChallenge = true;
                foreach ($opponents as $target) {
                    $add(['type' => 'challenge', 'iid' => $card['iid'], 'target' => $target['iid']],
                        "Desafiar: {$name} → " . gameCardName($target['card']));
                }
                foreach ($own['field'] as $location) {
                    if ($location['card']['type'] === 'Location' && $location['iid'] !== $card['location']
                        && gameStats($state, $location['iid'])['moveCost'] <= $ink) {
                        $add(['type' => 'move', 'iid' => $card['iid'], 'location' => $location['iid']],
                            "Mover: {$name} → " . gameCardName($location['card']));
                    }
                }
            }
            if (($card['boostedThisTurn'] ?? null) !== $state['turn']) {
                foreach (gameStats($state, $card['iid'])['keywords'] as $boost) {
                    if ($boost['keyword'] === 'Boost' && $boost['value'] <= $ink) {
                        $add(['type' => 'boost', 'iid' => $card['iid'], 'cost' => $boost['value']], "Impulsionar: {$name}");
                    }
                }
            }
            foreach ($card['card']['rules']['activated'] as $index => $ability) {
                if (($ability['cost']['ink'] ?? 0) > $ink) continue;
                if (($ability['cost']['exert'] ?? false)
                    && ($card['exerted'] || ($card['card']['type'] === 'Character' && $card['drying']))) continue;
                $names = array_map(static fn(array $effect): string => gameEffectName($effect['op']), $ability['effects']);
                $add(['type' => 'activate', 'iid' => $card['iid'], 'ability' => $index], "{$name}: " . implode(', ', $names));
            }
        }
        if (!$mustChallenge) $add(['type' => 'endTurn'], 'Encerrar turno');
    }
    $add(['type' => 'concede'], 'Conceder');
    return $actions;
}

// --- execucao das jogadas -------------------------------------------------------

function gameStatsForHand(array $state, array $card, string $player): int
{
    $state['players'][$player]['hand'][] = $card;
    return gameStats($state, $card['iid'])['cost'];
}

function gameRemoveFrom(array &$state, string $player, string $zone, string $iid): void
{
    $state['players'][$player][$zone] = array_values(array_filter(
        $state['players'][$player][$zone],
        static fn(array $card): bool => $card['iid'] !== $iid
    ));
}

function gamePlayCard(array &$state, array $action): void
{
    $player = $action['player'];
    $card = null;
    foreach ($state['players'][$player]['hand'] as $item) if ($item['iid'] === $action['iid']) { $card = $item; break; }
    if ($card === null) throw new GameRuleError('A carta não está na mão');

    if ($action['type'] === 'sing' && $action['singers'] === []) {
        $required = 0;
        foreach ($card['card']['rules']['keywords'] as $rule) if ($rule['keyword'] === 'Sing Together') $required = $rule['value'];
        $options = [];
        foreach (gameEligibleSingers($state, $player) as $singer) {
            $cost = gameSingingCost($state, $singer);
            $options[] = array_merge(gameCardOption($state, $singer['iid']), [
                'value' => $cost, 'label' => gameCardName($singer['card']) . " ({$cost})",
            ]);
        }
        $values = array_map(static fn(array $option): int => $option['value'], $options);
        rsort($values, SORT_NUMERIC);
        $minimum = 0; $sum = 0;
        foreach ($values as $value) { $minimum++; $sum += $value; if ($sum >= $required) break; }
        gamePrompt($state, [
            'kind' => 'singers', 'player' => $player,
            'label' => 'Cantar ' . gameCardName($card['card']) . ": somar pelo menos {$required} de custo",
            'options' => $options, 'min' => $minimum, 'max' => count($options),
        ], ['kind' => 'singers', 'iid' => $card['iid'], 'required' => $required]);
        return;
    }

    gameRemoveFrom($state, $player, 'hand', $card['iid']);
    if ($action['type'] === 'sing') {
        foreach ($action['singers'] as $iid) {
            $found = gameFind($state, $iid);
            if ($found !== null) $state['players'][$found['player']][$found['zone']][$found['index']]['exerted'] = true;
        }
    } else {
        gamePay($state, $player, $action['type'] === 'shift' ? $action['cost'] : gameStatsForHand($state, $card, $player));
    }

    if ($action['type'] === 'shift') {
        $base = null;
        foreach ($state['players'][$player]['field'] as $item) if ($item['iid'] === $action['onto']) { $base = $item; break; }
        if ($base === null) throw new GameRuleError('A carta para transformar não está em jogo');
        $card['exerted'] = $base['exerted'];
        $card['drying'] = $base['drying'];
        $card['damage'] = $base['damage'];
        $card['location'] = $base['location'];
        $card['stack'] = [$base];
        foreach ($state['players'][$player]['field'] as $index => $item) {
            if ($item['iid'] === $base['iid']) $state['players'][$player]['field'][$index] = $card;
        }
        foreach ($state['modifiers'] as $index => $modifier) {
            if ($modifier['iid'] === $base['iid']) $state['modifiers'][$index]['iid'] = $card['iid'];
        }
    } elseif ($card['card']['type'] === 'Action') {
        $state['resolvingAction'] = ['player' => $player, 'card' => $card];
        gameEnqueue($state, ['player' => $player, 'source' => $card], $card['card']['rules']['action']);
    } else {
        $card['drying'] = $card['card']['type'] === 'Character';
        $card['exerted'] = $action['type'] === 'play' && ($action['exerted'] ?? null) === true;
        $state['players'][$player]['field'][] = $card;
    }
    gameTrigger($state, $player, gameInstance($state, $card['iid']) ?? $card, 'play');
    gameNote($state, gamePlayerName($player) . ': ' . gameActionLabel($action));
}

function gameChoose(array &$state, array $action): void
{
    $pending = $state['pending'];
    $work = $state['decision'];
    if ($pending === null || $work === null || $pending['player'] !== $action['player'] || !is_array($action['optionIds'] ?? null)) {
        throw new GameRuleError('Não há uma decisão correspondente');
    }
    $ids = array_values($action['optionIds']);
    $available = array_map(static fn(array $option): string => (string) $option['id'], $pending['options']);
    $unknown = false;
    foreach ($ids as $id) if (!in_array($id, $available, true)) $unknown = true;
    if (count(array_unique($ids)) !== count($ids) || count($ids) < $pending['min'] || count($ids) > $pending['max'] || $unknown) {
        throw new GameRuleError('Seleção de decisão inválida');
    }
    $state['pending'] = null;
    $state['decision'] = null;

    if ($work['kind'] === 'mulligan') {
        $player = $action['player'];
        $replacements = [];
        foreach ($state['players'][$player]['hand'] as $card) if (in_array($card['iid'], $ids, true)) $replacements[] = $card;
        $state['players'][$player]['hand'] = array_values(array_filter(
            $state['players'][$player]['hand'],
            static fn(array $card): bool => !in_array($card['iid'], $ids, true)
        ));
        // As cartas trocadas nao podem voltar na compra: primeiro compra, depois devolve.
        gameDraw($state, $player, count($replacements));
        foreach ($replacements as $card) $state['players'][$player]['deck'][] = $card;
        $state['players'][$player]['mulliganReplaced'] = count($replacements);
        $state['players'][$player]['mulliganDone'] = true;
        if (!$state['players'][gameOther($player)]['mulliganDone']) {
            gameMulliganPrompt($state, gameOther($player));
        } else {
            // Os dois terminam a compra antes de qualquer deck alterado ser embaralhado.
            foreach ([$state['firstPlayer'], gameOther($state['firstPlayer'])] as $owner) {
                if ($state['players'][$owner]['mulliganReplaced']) gameShuffle($state, $state['players'][$owner]['deck']);
            }
            gameStartTurn($state);
        }
    } elseif ($work['kind'] === 'order') {
        $ability = null;
        foreach ($state['bag'] as $entry) if ($entry['id'] === $ids[0]) { $ability = $entry; break; }
        $state['bag'] = array_values(array_filter($state['bag'], static fn(array $entry): bool => $entry['id'] !== $ability['id']));
        gameResolveAbility($state, $ability);
    } elseif ($work['kind'] === 'ability') {
        if ($ids !== []) gameResolveAbility($state, $work['ability'], true);
    } elseif ($work['kind'] === 'optional') {
        if ($ids !== []) gameBeginEffect($state, array_merge($work['frame'], ['accepted' => true]));
    } elseif ($work['kind'] === 'targets') {
        if ($work['frame']['context']['source']['card']['type'] === 'Action') {
            foreach ($ids as $iid) {
                $target = gameFind($state, $iid);
                if ($target !== null && $target['zone'] === 'field' && $target['player'] !== $work['frame']['context']['player']
                    && gameHasKeyword($state, $iid, 'Vanish')) {
                    $instance = $state['players'][$target['player']]['field'][$target['index']];
                    gameAddAbility($state, ['player' => $target['player'], 'source' => $instance],
                        [['op' => 'banish', 'target' => ['kind' => 'self', 'owner' => 'you', 'zone' => 'play']]],
                        'Desvanecer: ' . gameCardName($instance['card']));
                }
            }
        }
        gamePrepareAmounts($state, $work['frame'], $ids, []);
    } elseif ($work['kind'] === 'amount') {
        gamePrepareAmounts($state, $work['frame'], $work['targets'], array_merge($work['amounts'], [(int) $ids[0]]));
    } elseif ($work['kind'] === 'discard') {
        $victim = $work['victim'];
        foreach ($state['players'][$victim]['hand'] as $card) {
            if (in_array($card['iid'], $ids, true)) $state['players'][$victim]['discard'][] = $card;
        }
        $state['players'][$victim]['hand'] = array_values(array_filter(
            $state['players'][$victim]['hand'],
            static fn(array $card): bool => !in_array($card['iid'], $ids, true)
        ));
    } elseif ($work['kind'] === 'singers') {
        $eligible = gameEligibleSingers($state, $action['player']);
        $total = 0;
        foreach ($ids as $iid) {
            $singer = null;
            foreach ($eligible as $card) if ($card['iid'] === $iid) { $singer = $card; break; }
            if ($singer === null) throw new GameRuleError("Os cantores precisam somar pelo menos {$work['required']} de custo");
            $total += gameSingingCost($state, $singer);
        }
        if ($total < $work['required']) throw new GameRuleError("Os cantores precisam somar pelo menos {$work['required']} de custo");
        gamePlayCard($state, ['type' => 'sing', 'player' => $action['player'], 'iid' => $work['iid'], 'singers' => $ids]);
    }
}

/** Aplica uma jogada e devolve o novo estado. O estado recebido nao e alterado. */
function gameApplyAction(array $input, array $action): array
{
    if (!isset($action['type']) || !in_array($action['player'] ?? null, GAME_PLAYERS, true)) {
        throw new GameRuleError('Jogador da ação inválido');
    }
    if ($input['phase'] === 'finished') throw new GameRuleError('A partida já terminou');
    $state = $input;

    if ($action['type'] === 'concede') {
        gameFinish($state, gameOther($action['player']), 'concede');
        return $state;
    }
    if ($action['type'] === 'mulligan') {
        if (($state['pending']['kind'] ?? null) !== 'mulligan') throw new GameRuleError('A troca da mão inicial só está disponível uma vez');
        gameChoose($state, ['type' => 'choose', 'player' => $action['player'], 'optionIds' => $action['replace']]);
    } elseif ($action['type'] === 'choose') {
        gameChoose($state, $action);
    } else {
        $legal = null;
        $wanted = gameCanonical($action);
        foreach (gameLegalActions($input, $action['player']) as $candidate) {
            if (gameCanonical($candidate) === $wanted) { $legal = $candidate; break; }
        }
        if ($legal === null) throw new GameRuleError('Ação inválida: ' . gameActionLabel($action));
        $player = $action['player'];

        if ($action['type'] === 'ink') {
            $card = null;
            foreach ($state['players'][$player]['hand'] as $item) if ($item['iid'] === $action['iid']) { $card = $item; break; }
            gameRemoveFrom($state, $player, 'hand', $card['iid']);
            $card['exerted'] = false;
            $state['players'][$player]['inkwell'][] = $card;
            $state['players'][$player]['inkedThisTurn'] = true;
        } elseif (in_array($action['type'], ['play', 'shift', 'sing'], true)) {
            gamePlayCard($state, $legal);
        } elseif ($action['type'] === 'quest') {
            $found = gameFind($state, $action['iid']);
            $state['players'][$player]['field'][$found['index']]['exerted'] = true;
            $card = $state['players'][$player]['field'][$found['index']];
            $state['players'][$player]['lore'] += gameStats($state, $card['iid'])['lore'];
            gameTrigger($state, $player, $card, 'selfQuest');
            if (gameHasKeyword($state, $card['iid'], 'Support')) {
                gameAddAbility($state, ['player' => $player, 'source' => $card], [[
                    'op' => 'buff', 'stat' => 'strength', 'amount' => gameStats($state, $card['iid'])['strength'],
                    'duration' => 'thisTurn',
                    'target' => ['kind' => 'chosen', 'owner' => 'any', 'zone' => 'play',
                        'filter' => ['types' => ['Character'], 'excludeSelf' => true]],
                ]], 'Suporte: ' . gameCardName($card['card']), true);
                $state['bag'][count($state['bag']) - 1]['support'] = true;
            }
        } elseif ($action['type'] === 'challenge') {
            $found = gameFind($state, $action['iid']);
            $state['players'][$player]['field'][$found['index']]['exerted'] = true;
            $card = $state['players'][$player]['field'][$found['index']];
            $state['combat'] = ['attacker' => $card['iid'], 'defender' => $action['target'], 'damageDone' => false];
            gameTrigger($state, $player, $card, 'challenge');
        } elseif ($action['type'] === 'move') {
            gamePay($state, $player, gameStats($state, $action['location'])['moveCost']);
            $found = gameFind($state, $action['iid']);
            $state['players'][$player]['field'][$found['index']]['location'] = $action['location'];
        } elseif ($action['type'] === 'activate') {
            $found = gameFind($state, $action['iid']);
            $card = $state['players'][$player]['field'][$found['index']];
            $ability = $card['card']['rules']['activated'][$action['ability']];
            $context = ['player' => $player, 'source' => $card];
            gamePay($state, $player, $ability['cost']['ink'] ?? 0);
            if ($ability['cost']['exert'] ?? false) $state['players'][$player]['field'][$found['index']]['exerted'] = true;
            if ($ability['cost']['banish'] ?? false) gameLeaveField($state, $card['iid'], 'discard', true);
            if ($ability['optional'] ?? false) {
                gameResolveAbility($state, array_merge($context, [
                    'effects' => $ability['effects'], 'optional' => true, 'id' => gameUid($state, 'b'),
                    'label' => gameCardName($card['card']) . ': usar habilidade?',
                ]));
            } else {
                gameEnqueue($state, $context, $ability['effects']);
            }
        } elseif ($action['type'] === 'boost') {
            $found = gameFind($state, $action['iid']);
            gamePay($state, $player, $action['cost']);
            $underneath = array_shift($state['players'][$player]['deck']);
            if ($underneath !== null) {
                $underneath['faceDown'] = true;
                $state['players'][$player]['field'][$found['index']]['stack'][] = $underneath;
                $state['players'][$player]['field'][$found['index']]['boostedThisTurn'] = $state['turn'];
            }
        } elseif ($action['type'] === 'endTurn') {
            $state['transition'] = 'ending';
            foreach (GAME_PLAYERS as $owner) {
                foreach ($state['players'][$owner]['field'] as $card) gameTrigger($state, $owner, $card, 'end');
            }
        }
    }
    gameDrain($state);
    return $state;
}
