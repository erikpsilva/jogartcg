<?php

declare(strict_types=1);

/**
 * Camada multijogador do motor em PHP: assentos, montagem dos decks e a visao
 * que cada jogador recebe. Porte de packages/game-core/src/multiplayer.ts e de
 * buildGameCards (deck-cards.ts).
 *
 * O motor chama os dois lados de 'player' e 'bot'. Online, o assento 1 e sempre
 * 'player' e o assento 2 e sempre 'bot'; tudo que sai para o cliente passa por
 * gameViewForSeat, que gira o estado para o proprio jogador ser 'player' e apaga
 * toda informacao escondida.
 */

require_once __DIR__ . '/actions.php';

const GAME_ACTION_TYPES = ['choose', 'mulligan', 'ink', 'play', 'shift', 'sing', 'quest', 'challenge', 'move', 'activate', 'boost', 'endTurn', 'concede'];

function gameSeatPlayer(int $seat): string { return $seat === 1 ? 'player' : 'bot'; }
function gamePlayerSeat(string $player): int { return $player === 'player' ? 1 : 2; }

/**
 * Expande um deck salvo em cartas do motor. As regras vem prontas do banco
 * (lorcana_cards.rules_json), compiladas por bin/compile_card_rules.php.
 *
 * @param array $entries itens de loadGameDeck: ['quantity' => int, 'card' => array]
 */
function gameBuildCards(PDO $pdo, array $entries): array
{
    $ids = [];
    foreach ($entries as $entry) $ids[] = (int) $entry['card']['id'];
    $ids = array_values(array_unique($ids));
    $rules = [];
    if ($ids !== []) {
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $statement = $pdo->prepare("SELECT source_id, rules_json FROM lorcana_cards WHERE source_id IN ({$placeholders})");
        $statement->execute($ids);
        foreach ($statement->fetchAll() as $row) {
            $decoded = $row['rules_json'] !== null ? json_decode((string) $row['rules_json'], true) : null;
            if (is_array($decoded)) $rules[(int) $row['source_id']] = $decoded;
        }
    }

    $cards = [];
    foreach ($entries as $entry) {
        $card = $entry['card'];
        $id = (int) $card['id'];
        $compiled = $rules[$id] ?? null;
        if ($compiled === null) {
            throw new GameRuleError('Carta sem regras compiladas: ' . ($card['full_name'] ?? $card['name'] ?? $id));
        }
        // Mantem tudo que o compilador entendeu e trata apenas as frases nao reconhecidas
        // como texto sem efeito automatico, para decks reais entrarem na mesa.
        if (($compiled['supported'] ?? false) !== true || ($compiled['unsupported'] ?? []) !== []) {
            $compiled['supported'] = true;
            $compiled['unsupported'] = [];
        }
        $definition = [
            'id' => $id,
            'name' => ($card['original']['name'] ?? '') ?: $card['name'],
            'fullName' => ($card['original']['full_name'] ?? '') ?: $card['full_name'],
            'displayName' => $card['full_name'],
            'type' => $card['original']['type'],
            'cost' => (int) ($card['cost'] ?? 0),
            'inkwell' => (bool) $card['inkwell'],
            'strength' => (int) ($card['strength'] ?? 0),
            'willpower' => (int) ($card['willpower'] ?? 0),
            'lore' => (int) ($card['lore'] ?? 0),
            'moveCost' => (int) ($card['move_cost'] ?? 0),
            'subtypes' => $card['original']['subtypes'] ?? [],
            'image' => ($card['image']['full'] ?? '') ?: (($card['image']['thumbnail'] ?? '') ?: ''),
            'text' => ($card['original']['full_text'] ?? '') ?: '',
            'textPt' => ($card['pt_br']['full_text'] ?? '') ?: (($card['original']['full_text'] ?? '') ?: ''),
            'rules' => $compiled,
        ];
        for ($copy = 0; $copy < (int) $entry['quantity']; $copy++) $cards[] = $definition;
    }
    return $cards;
}

/** Cria a partida com o deck de cada assento. A mesma semente gera a mesma partida. */
function gameCreateSeated(PDO $pdo, array $decks, int $seed): array
{
    return gameCreate([
        'player' => gameBuildCards($pdo, $decks[1]),
        'bot' => gameBuildCards($pdo, $decks[2]),
    ], $seed);
}

/**
 * Aplica uma jogada em nome de um assento. O 'player' e o 'label' enviados pelo
 * cliente sao descartados: o assento vem da sessao autenticada e o motor so aceita
 * acoes identicas a uma das suas proprias acoes legais para aquele lado.
 */
function gameApplySeatAction(array $state, int $seat, mixed $input): array
{
    if (!is_array($input) || !is_string($input['type'] ?? null) || !in_array($input['type'], GAME_ACTION_TYPES, true)) {
        throw new GameRuleError('Ação desconhecida.');
    }
    unset($input['label'], $input['player']);
    $input['player'] = gameSeatPlayer($seat);
    return gameApplyAction($state, $input);
}

function gameMatchSummary(array $state): array
{
    $decision = gameActiveDecisionPlayer($state);
    return [
        'phase' => $state['phase'],
        'turn' => $state['turn'],
        'decisionSeat' => $decision !== null ? gamePlayerSeat($decision) : null,
        'winnerSeat' => $state['winner'] !== null ? gamePlayerSeat($state['winner']) : null,
        'finishReason' => $state['finishReason'],
    ];
}

function gameHiddenCard(): array
{
    return [
        'id' => 0, 'name' => '', 'type' => 'Character', 'cost' => 0, 'inkwell' => false, 'strength' => 0,
        'willpower' => 0, 'lore' => 0, 'moveCost' => 0, 'subtypes' => [], 'image' => '', 'text' => '',
        'rules' => ['sourceId' => 0, 'keywords' => [], 'static' => [], 'triggered' => [], 'activated' => [],
            'action' => [], 'unsupported' => [], 'supported' => true],
    ];
}

function gameHiddenInstance(string $iid, bool $exerted = false): array
{
    return ['iid' => $iid, 'card' => gameHiddenCard(), 'exerted' => $exerted, 'drying' => false,
        'damage' => 0, 'location' => null, 'stack' => [], 'faceDown' => true];
}

/** Carta visivel, mas o que estiver virado para baixo embaixo dela (Boost) continua escondido. */
function gameVisibleInstance(array $instance, string $prefix): array
{
    $stack = [];
    foreach ($instance['stack'] as $index => $under) {
        $stack[] = ($under['faceDown'] ?? false) ? gameHiddenInstance("{$prefix}:{$index}") : $under;
    }
    $instance['stack'] = $stack;
    return $instance;
}

/** Estado e acoes do ponto de vista de um assento: o dono sempre aparece como 'player'. */
function gameViewForSeat(array $state, int $seat, array $names): array
{
    $me = gameSeatPlayer($seat);
    $orient = static fn(string $player): string => $player === $me ? 'player' : 'bot';
    $nameOf = static fn(string $player): string => $player === $me ? 'Você' : $names['opponent'];
    // O motor sempre escreve 'Você' para o lado do assento 1 e 'Bot' para o assento 2.
    $nameOfEngineLabel = static fn(string $label): string => $nameOf($label === 'Você' ? 'player' : 'bot');

    $zones = static function (string $owner) use ($state, $me): array {
        $real = $state['players'][$owner];
        $tag = $owner === $me ? 'you' : 'opp';
        $zone = $real;
        // Ninguem pode saber a ordem de nenhum deck, nem do proprio.
        $zone['deck'] = [];
        foreach ($real['deck'] as $index => $ignored) $zone['deck'][] = gameHiddenInstance("x:{$tag}:deck:{$index}");
        $zone['hand'] = [];
        foreach ($real['hand'] as $index => $card) {
            $zone['hand'][] = $owner === $me
                ? gameVisibleInstance($card, "x:{$tag}:hand:{$card['iid']}")
                : gameHiddenInstance("x:{$tag}:hand:{$index}");
        }
        // Consulta privada do proprio tinteiro. Nunca revelar a tinta do adversario.
        $zone['inkwell'] = [];
        foreach ($real['inkwell'] as $index => $card) {
            $zone['inkwell'][] = $owner === $me
                ? gameVisibleInstance($card, "x:{$tag}:ink:{$card['iid']}")
                : gameHiddenInstance("x:{$tag}:ink:{$index}", $card['exerted']);
        }
        $zone['field'] = [];
        foreach ($real['field'] as $card) $zone['field'][] = gameVisibleInstance($card, "x:{$tag}:stack:{$card['iid']}");
        $zone['discard'] = [];
        foreach ($real['discard'] as $card) $zone['discard'][] = gameVisibleInstance($card, "x:{$tag}:discard:{$card['iid']}");
        return $zone;
    };
    $players = ['player' => $zones($me), 'bot' => $zones($me === 'player' ? 'bot' : 'player')];
    $visibleIds = [];
    foreach (array_merge($players['player']['field'], $players['bot']['field']) as $card) $visibleIds[$card['iid']] = true;

    $pending = null;
    if ($state['pending'] !== null && $state['pending']['player'] === $me) {
        $pending = $state['pending'];
        $pending['player'] = 'player';
        $options = [];
        foreach ($state['pending']['options'] as $option) {
            if ($option['id'] === 'player' || $option['id'] === 'bot') $option['label'] = $nameOfEngineLabel($option['label']);
            $options[] = $option;
        }
        $pending['options'] = $options;
    } elseif ($state['pending'] !== null) {
        // Mostra que o adversario esta escolhendo, nunca quais sao as opcoes.
        $pending = ['id' => $state['pending']['id'], 'kind' => $state['pending']['kind'], 'player' => 'bot',
            'label' => 'O adversário está escolhendo', 'options' => [], 'min' => 0, 'max' => 0];
    }

    $log = [];
    foreach ($state['log'] as $line) {
        $line = preg_replace_callback('/^(Turno \d+: )(Você|Bot)$/u',
            static fn(array $match): string => $match[1] . $nameOfEngineLabel($match[2]), $line);
        $log[] = preg_replace_callback('/^(Você|Bot): /u',
            static fn(array $match): string => $nameOfEngineLabel($match[1]) . ': ', $line);
    }

    $modifiers = [];
    foreach ($state['modifiers'] as $modifier) {
        if (!isset($visibleIds[$modifier['iid']])) continue;
        $modifier['player'] = $orient($modifier['player']);
        $modifiers[] = $modifier;
    }

    $oriented = [
        'version' => $state['version'], 'phase' => $state['phase'], 'players' => $players,
        'activePlayer' => $orient($state['activePlayer']), 'firstPlayer' => $orient($state['firstPlayer']),
        'turn' => $state['turn'], 'winner' => $state['winner'] !== null ? $orient($state['winner']) : null,
        'finishReason' => $state['finishReason'],
        // A semente deixaria o cliente prever todo embaralhamento e toda compra.
        'rng' => 0, 'nextId' => 0,
        'pending' => $pending,
        // O trabalho interno de resolucao cita cartas escondidas; o cliente nunca precisa dele.
        'decision' => null, 'queue' => [], 'bag' => [], 'bagPlayer' => null,
        'modifiers' => $modifiers,
        'combat' => $state['combat'],
        'resolvingAction' => $state['resolvingAction'] !== null
            ? ['player' => $orient($state['resolvingAction']['player']), 'card' => $state['resolvingAction']['card']]
            : null,
        'transition' => $state['transition'],
        'log' => $log,
    ];

    $legal = [];
    if ($state['phase'] !== 'finished') {
        foreach (gameLegalActions($state, $me) as $action) {
            // As decisoes pendentes sao respondidas pelo dialogo, com os ids das opcoes.
            if ($action['type'] === 'choose') continue;
            $action['player'] = 'player';
            $legal[] = $action;
        }
    }
    $decision = gameActiveDecisionPlayer($state);
    return ['seat' => $seat, 'state' => $oriented, 'legal' => $legal,
        'decisionSeat' => $decision !== null ? gamePlayerSeat($decision) : null];
}
