<?php

declare(strict_types=1);

/**
 * Motor de regras do Disney Lorcana em PHP.
 *
 * Porte fiel de packages/game-core/src/engine.ts, para que as partidas online
 * rodem no proprio servidor PHP, sem depender de Node. O estado e um array
 * simples (o mesmo formato JSON do motor em JavaScript), e
 * tests/game/engine_equivalence_test.php joga partidas inteiras nos dois motores
 * comparando o estado depois de cada jogada.
 *
 * Diferenca de linguagem que guia todo o arquivo: em JavaScript um objeto
 * encontrado por `find` e uma referencia viva; em PHP arrays sao copiados, entao
 * localizamos a carta (jogador, zona, indice) e escrevemos de volta no estado.
 */

require_once __DIR__ . '/rng.php';

const GAME_PLAYERS = ['player', 'bot'];
const GAME_ZONES = ['deck', 'hand', 'field', 'inkwell', 'discard'];
const GAME_EFFECT_NAMES = [
    'draw' => 'comprar cartas', 'gainLore' => 'ganhar conhecimento', 'loseLore' => 'perder conhecimento',
    'damage' => 'causar dano', 'heal' => 'remover dano', 'banish' => 'banir', 'returnHand' => 'devolver à mão',
    'ready' => 'preparar', 'exert' => 'exaurir', 'buff' => 'alterar atributos', 'inkTop' => 'adicionar ao tinteiro',
    'recover' => 'recuperar do descarte', 'discard' => 'descartar',
];

final class GameRuleError extends RuntimeException {}

function gameOther(string $player): string { return $player === 'player' ? 'bot' : 'player'; }
function gameIsFinished(array $state): bool { return $state['phase'] === 'finished'; }
function gamePlayerName(string $player): string { return $player === 'player' ? 'Você' : 'Bot'; }
function gameEffectName(string $op): string { return GAME_EFFECT_NAMES[$op] ?? $op; }
function gameCardName(array $card): string { return ($card['displayName'] ?? '') ?: (($card['fullName'] ?? '') ?: $card['name']); }
function gameBaseName(string $name): string { return trim(preg_split('/\s[-–—]\s/u', $name)[0] ?? $name); }
function gameUid(array &$state, string $prefix): string { return $prefix . $state['nextId']++; }

function gameNote(array &$state, string $message): void
{
    $state['log'][] = $message;
    if (count($state['log']) > 1000) $state['log'] = array_values(array_slice($state['log'], -1000));
}

/** Localiza uma carta em qualquer zona: ['player' => , 'zone' => , 'index' => ]. */
function gameFind(array $state, string $iid): ?array
{
    foreach (GAME_PLAYERS as $player) {
        foreach (GAME_ZONES as $zone) {
            foreach ($state['players'][$player][$zone] as $index => $instance) {
                if ($instance['iid'] === $iid) return ['player' => $player, 'zone' => $zone, 'index' => $index];
            }
        }
    }
    return null;
}

function gameInstance(array $state, string $iid): ?array
{
    $found = gameFind($state, $iid);
    return $found === null ? null : $state['players'][$found['player']][$found['zone']][$found['index']];
}

function gameEmptyPlayer(): array
{
    return ['deck' => [], 'hand' => [], 'field' => [], 'inkwell' => [], 'discard' => [], 'lore' => 0,
        'inkedThisTurn' => false, 'mulliganDone' => false, 'mulliganReplaced' => 0, 'turns' => 0];
}

function gameFreshInstance(array &$state, array $card): array
{
    return ['iid' => gameUid($state, 'c'), 'card' => $card, 'exerted' => false, 'drying' => false,
        'damage' => 0, 'location' => null, 'stack' => []];
}

// --- atributos e efeitos continuos ------------------------------------------

function gameMatches(array $state, array $instance, ?array $filter, array $source): bool
{
    if (!$filter) return true;
    if (isset($filter['types']) && !in_array($instance['card']['type'], $filter['types'], true)) return false;
    if (isset($filter['subtypes'])) {
        foreach ($filter['subtypes'] as $subtype) if (!in_array($subtype, $instance['card']['subtypes'], true)) return false;
    }
    if (isset($filter['name']) && $instance['card']['name'] !== $filter['name'] && gameBaseName($instance['card']['name']) !== $filter['name']) return false;
    if (($filter['excludeSelf'] ?? false) && $instance['iid'] === $source['iid']) return false;
    if (isset($filter['damaged']) && ($instance['damage'] > 0) !== $filter['damaged']) return false;
    if (isset($filter['exerted']) && $instance['exerted'] !== $filter['exerted']) return false;
    if (isset($filter['costAtMost']) && $instance['card']['cost'] > $filter['costAtMost']) return false;
    if (isset($filter['strengthAtMost']) && gameStats($state, $instance['iid'])['strength'] > $filter['strengthAtMost']) return false;
    return true;
}

function gameConditionMet(array $state, array $context, ?array $condition): bool
{
    if (!$condition) return true;
    if ($condition['kind'] === 'selfDamaged') {
        $found = gameFind($state, $context['source']['iid']);
        $source = $found !== null && $found['zone'] === 'field'
            ? $state['players'][$found['player']]['field'][$found['index']]
            : $context['source'];
        return $source['damage'] > 0;
    }
    $count = 0;
    foreach ($state['players'][$context['player']]['field'] as $card) {
        if (gameMatches($state, $card, $condition['filter'] ?? null, $context['source'])) $count++;
    }
    return $count >= ($condition['countAtLeast'] ?? 1);
}

function gameOwners(string $player, string $owner): array
{
    if ($owner === 'you') return [$player];
    if ($owner === 'any') return GAME_PLAYERS;
    return [gameOther($player)];
}

function gameSelectedBy(array $state, array $target, array $context, array $instance, string $owner, string $zone): bool
{
    if ($target['kind'] === 'self') return $instance['iid'] === $context['source']['iid'];
    $zoneName = $zone === 'field' ? 'play' : $zone;
    return in_array($owner, gameOwners($context['player'], $target['owner']), true)
        && (!isset($target['zone']) || $target['zone'] === $zoneName)
        && gameMatches($state, $instance, $target['filter'] ?? null, $context['source']);
}

/** Alvos possiveis de um seletor: jogadores ou instancias de carta. */
function gameTargets(array $state, array $target, array $context, bool $protectWard = true): array
{
    if ($target['kind'] === 'player' || ($target['kind'] === 'chosen' && !isset($target['zone']) && !isset($target['filter']))) {
        return gameOwners($context['player'], $target['owner']);
    }
    $result = [];
    foreach (GAME_PLAYERS as $player) {
        foreach (['field', 'hand', 'discard'] as $zone) {
            $zoneName = $zone === 'field' ? 'play' : $zone;
            if ($target['kind'] !== 'self' && ($target['zone'] ?? 'play') !== $zoneName) continue;
            if ($target['kind'] === 'self' && $zone !== 'field') continue;
            foreach ($state['players'][$player][$zone] as $instance) {
                if (!gameSelectedBy($state, $target, $context, $instance, $player, $zone)) continue;
                if ($protectWard && $target['kind'] === 'chosen' && $zone === 'field' && $player !== $context['player']
                    && gameHasKeyword($state, $instance['iid'], 'Ward')) continue;
                $result[] = $instance['iid'];
            }
        }
    }
    return $result;
}

function gameEffectiveCost(array $state, string $iid, int $baseCost): int
{
    $found = gameFind($state, $iid);
    if ($found === null) return max(0, $baseCost);
    $instance = $state['players'][$found['player']][$found['zone']][$found['index']];
    $sources = [];
    foreach (GAME_PLAYERS as $player) {
        foreach ($state['players'][$player]['field'] as $source) $sources[] = ['player' => $player, 'source' => $source];
    }
    if ($found['zone'] === 'hand') $sources[] = ['player' => $found['player'], 'source' => $instance];

    foreach ($sources as $context) {
        foreach ($context['source']['card']['rules']['static'] as $rule) {
            if ($rule['kind'] !== 'costReduction') continue;
            // Habilidade de custo so vale a partir da mao quando fala de si mesma.
            if ($context['source']['iid'] === $iid && $found['zone'] === 'hand' && $rule['target']['kind'] !== 'self') continue;
            if (gameConditionMet($state, $context, $rule['condition'] ?? null)
                && gameSelectedBy($state, $rule['target'], $context, $instance, $found['player'], $found['zone'])) {
                $baseCost -= $rule['amount'];
            }
        }
    }
    return max(0, $baseCost);
}

/** Atributos atuais da carta, com modificadores temporarios e efeitos continuos. */
function gameStats(array $state, string $iid): array
{
    $found = gameFind($state, $iid);
    if ($found === null) throw new GameRuleError("Instância de carta desconhecida: {$iid}");
    $instance = $state['players'][$found['player']][$found['zone']][$found['index']];
    $card = $instance['card'];
    $stats = [
        'strength' => $card['strength'], 'willpower' => $card['willpower'], 'lore' => $card['lore'],
        'cost' => gameEffectiveCost($state, $iid, $card['cost']), 'moveCost' => $card['moveCost'],
        'keywords' => $card['rules']['keywords'], 'restrictions' => [],
    ];
    if ($found['zone'] === 'field') {
        foreach ($state['modifiers'] as $modifier) {
            if ($modifier['iid'] === $iid) $stats[$modifier['stat']] += $modifier['amount'];
        }
    }
    $sources = [];
    foreach (GAME_PLAYERS as $owner) {
        foreach ($state['players'][$owner]['field'] as $source) $sources[] = ['player' => $owner, 'source' => $source];
    }
    foreach ($sources as $context) {
        foreach ($context['source']['card']['rules']['static'] as $rule) {
            if ($found['zone'] !== 'field' || $rule['kind'] === 'costReduction') continue;
            if (!gameConditionMet($state, $context, $rule['condition'] ?? null)) continue;
            if (!gameSelectedBy($state, $rule['target'], $context, $instance, $found['player'], $found['zone'])) continue;
            if ($rule['kind'] === 'buff') {
                $times = isset($rule['per']) ? count(gameTargets($state, $rule['per'], $context, false)) : 1;
                $stats[$rule['stat']] += $rule['amount'] * $times;
            } elseif ($rule['kind'] === 'grantKeyword') {
                $keyword = ['keyword' => $rule['keyword']];
                if (isset($rule['value'])) $keyword['value'] = $rule['value'];
                if (isset($rule['sourceText'])) $keyword['sourceText'] = $rule['sourceText'];
                $stats['keywords'][] = $keyword;
            } elseif ($rule['kind'] === 'restriction') {
                $stats['restrictions'][] = $rule['restriction'];
            }
        }
    }
    if (($state['combat']['attacker'] ?? null) === $iid) {
        foreach ($stats['keywords'] as $keyword) {
            if ($keyword['keyword'] === 'Challenger') $stats['strength'] += $keyword['value'] ?? 0;
        }
    }
    foreach (['strength', 'willpower', 'lore', 'cost', 'moveCost'] as $stat) $stats[$stat] = max(0, $stats[$stat]);
    return $stats;
}

function gameHasKeyword(array $state, string $iid, string $keyword): bool
{
    foreach (gameStats($state, $iid)['keywords'] as $rule) if ($rule['keyword'] === $keyword) return true;
    return false;
}

function gameKeywordValue(array $state, string $iid, string $keyword): int
{
    $total = 0;
    foreach (gameStats($state, $iid)['keywords'] as $rule) if ($rule['keyword'] === $keyword) $total += $rule['value'] ?? 0;
    return $total;
}

function gameRestricted(array $state, string $iid, string $restriction): bool
{
    return in_array($restriction, gameStats($state, $iid)['restrictions'], true);
}

function gameAvailableInk(array $state, string $player): int
{
    $available = 0;
    foreach ($state['players'][$player]['inkwell'] as $card) if (!$card['exerted']) $available++;
    return $available;
}

function gameActiveDecisionPlayer(array $state): ?string
{
    if ($state['phase'] === 'finished') return null;
    return $state['pending']['player'] ?? $state['activePlayer'];
}

// --- decisoes pendentes ------------------------------------------------------

function gamePrompt(array &$state, array $pending, array $work): void
{
    $state['pending'] = ['id' => gameUid($state, 'd')] + $pending;
    $state['decision'] = $work;
}

function gameCardOption(array $state, string $iid): array
{
    if ($iid === 'player' || $iid === 'bot') return ['id' => $iid, 'label' => $iid === 'player' ? 'Você' : 'Bot'];
    $instance = gameInstance($state, $iid);
    return ['id' => $iid, 'iid' => $iid, 'cardId' => $instance['card']['id'], 'label' => gameCardName($instance['card'])];
}

function gameMulliganPrompt(array &$state, string $player): void
{
    $options = [];
    foreach ($state['players'][$player]['hand'] as $card) $options[] = gameCardOption($state, $card['iid']);
    gamePrompt($state, [
        'kind' => 'mulligan', 'player' => $player, 'label' => 'Escolha as cartas para trocar (ou mantenha a mão)',
        'options' => $options, 'min' => 0, 'max' => min(7, count($state['players'][$player]['deck'])),
    ], ['kind' => 'mulligan']);
}

// --- movimentacao de cartas ---------------------------------------------------

function gameDraw(array &$state, string $player, int $amount): void
{
    $cards = array_splice($state['players'][$player]['deck'], 0, $amount);
    foreach ($cards as $card) $state['players'][$player]['hand'][] = $card;
}

function gamePay(array &$state, string $player, int $amount): void
{
    if (gameAvailableInk($state, $player) < $amount) throw new GameRuleError('Tinta disponível insuficiente');
    foreach ($state['players'][$player]['inkwell'] as $index => $card) {
        if (!$card['exerted'] && $amount > 0) { $state['players'][$player]['inkwell'][$index]['exerted'] = true; $amount--; }
    }
}

function gameFinish(array &$state, ?string $winner, ?string $reason): void
{
    if ($state['resolvingAction'] !== null) {
        $state['players'][$state['resolvingAction']['player']]['discard'][] = $state['resolvingAction']['card'];
    }
    $state['phase'] = 'finished';
    $state['winner'] = $winner;
    $state['finishReason'] = $reason;
    $state['pending'] = null; $state['decision'] = null; $state['queue'] = []; $state['bag'] = [];
    $state['bagPlayer'] = null; $state['combat'] = null; $state['resolvingAction'] = null; $state['transition'] = null;
}

function gameAddAbility(array &$state, array $context, array $effects, string $label, bool $optional = false, ?array $condition = null): void
{
    $found = gameFind($state, $context['source']['iid']);
    $sourceStats = $found !== null && $found['zone'] === 'field'
        ? gameStats($state, $context['source']['iid'])
        : ($context['sourceStats'] ?? null);
    $entry = $context;
    if ($sourceStats !== null) $entry['sourceStats'] = $sourceStats;
    $entry['id'] = gameUid($state, 'b');
    $entry['effects'] = $effects;
    $entry['label'] = $label;
    $entry['optional'] = $optional;
    if ($condition !== null) $entry['condition'] = $condition;
    $state['bag'][] = $entry;
}

function gameTrigger(array &$state, string $player, array $source, string $event): void
{
    $context = ['player' => $player, 'source' => $source];
    foreach ($source['card']['rules']['triggered'] as $rule) {
        if ($rule['trigger'] !== $event) continue;
        if (($rule['turn'] ?? null) === 'yours' && $state['activePlayer'] !== $player) continue;
        if (($rule['turn'] ?? null) === 'opponents' && $state['activePlayer'] === $player) continue;
        $names = array_map(static fn(array $effect): string => gameEffectName($effect['op']), $rule['effects']);
        gameAddAbility($state, $context, $rule['effects'], gameCardName($source['card']) . ': ' . implode(', ', $names), $rule['optional'] ?? false, $rule['condition'] ?? null);
    }
}

function gameFlatten(array $instance): array
{
    $result = [$instance];
    foreach ($instance['stack'] as $under) foreach (gameFlatten($under) as $card) $result[] = $card;
    return $result;
}

function gameLeaveField(array &$state, string $iid, string $destination, bool $banished): void
{
    $found = gameFind($state, $iid);
    if ($found === null || $found['zone'] !== 'field') return;
    $player = $found['player'];
    $instance = $state['players'][$player]['field'][$found['index']];
    $snapshot = $instance;
    $sourceStats = gameStats($state, $iid);

    foreach ($state['bag'] as $index => $ability) {
        if ($ability['source']['iid'] === $iid) {
            $state['bag'][$index]['source'] = $snapshot;
            $state['bag'][$index]['sourceStats'] = $sourceStats;
        }
    }
    foreach ($state['queue'] as $index => $frame) {
        if ($frame['context']['source']['iid'] === $iid) {
            $state['queue'][$index]['context']['source'] = $snapshot;
            $state['queue'][$index]['context']['sourceStats'] = $sourceStats;
        }
    }
    $state['players'][$player]['field'] = array_values(array_filter(
        $state['players'][$player]['field'],
        static fn(array $card): bool => $card['iid'] !== $iid
    ));
    $state['modifiers'] = array_values(array_filter(
        $state['modifiers'],
        static fn(array $modifier): bool => $modifier['iid'] !== $iid
    ));
    foreach (GAME_PLAYERS as $owner) {
        foreach ($state['players'][$owner]['field'] as $index => $card) {
            if (($card['location'] ?? null) === $iid) $state['players'][$owner]['field'][$index]['location'] = null;
        }
    }
    foreach (gameFlatten($instance) as $card) {
        $card['exerted'] = false; $card['drying'] = false; $card['damage'] = 0; $card['location'] = null; $card['stack'] = [];
        unset($card['faceDown'], $card['boostedThisTurn']);
        $state['players'][$player][$destination][] = $card;
    }
    if ($banished) gameTrigger($state, $player, $snapshot, 'selfBanished');
}

function gameStateCheck(array &$state): void
{
    if (gameIsFinished($state)) return;
    $winners = [];
    foreach (GAME_PLAYERS as $player) if ($state['players'][$player]['lore'] >= 20) $winners[] = $player;
    if ($winners !== []) {
        gameFinish($state, count($winners) === 1 ? $winners[0] : $state['activePlayer'], 'lore');
        return;
    }
    // O conjunto letal e decidido antes de remover qualquer carta: combate e dano em area sao simultaneos.
    while (true) {
        $lethal = [];
        foreach (GAME_PLAYERS as $player) {
            foreach ($state['players'][$player]['field'] as $card) {
                if (in_array($card['card']['type'], ['Character', 'Location'], true)
                    && $card['damage'] >= gameStats($state, $card['iid'])['willpower']) {
                    $lethal[] = $card['iid'];
                }
            }
        }
        if ($lethal === []) break;
        foreach ($lethal as $cardId) gameLeaveField($state, $cardId, 'discard', true);
    }
}

// --- fluxo de turno -----------------------------------------------------------

function gameStartTurn(array &$state): void
{
    $state['phase'] = 'main';
    $state['transition'] = 'starting';
    $state['turn']++;
    $player = $state['activePlayer'];
    $state['players'][$player]['turns']++;
    $state['players'][$player]['inkedThisTurn'] = false;

    $dontReady = [];
    foreach ($state['players'][$player]['field'] as $card) {
        if (gameRestricted($state, $card['iid'], 'cantReadyAtStart')) $dontReady[$card['iid']] = true;
    }
    foreach (['field', 'inkwell'] as $zone) {
        foreach ($state['players'][$player][$zone] as $index => $card) {
            if (!isset($dontReady[$card['iid']])) $state['players'][$player][$zone][$index]['exerted'] = false;
            $state['players'][$player][$zone][$index]['drying'] = false;
        }
    }
    $turns = $state['players'][$player]['turns'];
    $state['modifiers'] = array_values(array_filter($state['modifiers'], static fn(array $modifier): bool =>
        !($modifier['duration'] === 'untilStartOfYourNextTurn' && $modifier['player'] === $player && $turns >= $modifier['expiresOnOwnTurn'])));

    foreach (GAME_PLAYERS as $owner) {
        foreach ($state['players'][$owner]['field'] as $card) gameTrigger($state, $owner, $card, 'start');
    }
    gameStateCheck($state);
    if (gameIsFinished($state)) return;
    foreach ($state['players'][$player]['field'] as $card) {
        if ($card['card']['type'] === 'Location') $state['players'][$player]['lore'] += gameStats($state, $card['iid'])['lore'];
    }
    gameStateCheck($state);
    if (gameIsFinished($state)) return;
    gameNote($state, "Turno {$state['turn']}: " . gamePlayerName($player));
}

function gameCompleteEnd(array &$state): void
{
    $player = $state['activePlayer'];
    $turns = $state['players'][$player]['turns'];
    $state['modifiers'] = array_values(array_filter($state['modifiers'], static fn(array $modifier): bool =>
        $modifier['duration'] !== 'thisTurn'
        && !($modifier['duration'] === 'untilEndOfYourNextTurn' && $modifier['player'] === $player && $turns >= $modifier['expiresOnOwnTurn'])));
    gameStateCheck($state);
    if ($state['phase'] === 'finished' || $state['bag'] !== []) return;
    if ($state['players'][$player]['deck'] === []) { gameFinish($state, gameOther($player), 'emptyDeck'); return; }
    $state['transition'] = null;
    $state['activePlayer'] = gameOther($player);
    gameStartTurn($state);
}

// --- efeitos ------------------------------------------------------------------

function gameEnqueue(array &$state, array $context, array $effects): void
{
    $frames = [];
    foreach ($effects as $effect) $frames[] = ['effect' => $effect, 'context' => $context];
    $state['queue'] = array_merge($frames, $state['queue']);
}

function gameResolveAbility(array &$state, array $ability, bool $accepted = false): void
{
    if (!gameConditionMet($state, $ability, $ability['condition'] ?? null)) return;
    if ($ability['optional'] && !$accepted) {
        gamePrompt($state, [
            'kind' => 'optional', 'player' => $ability['player'], 'label' => $ability['label'],
            'description' => $ability['description'] ?? ($ability['source']['card']['textPt'] ?? $ability['source']['card']['text']),
            'options' => [['id' => 'yes', 'label' => 'Usar efeito']], 'min' => 0, 'max' => 1,
        ], ['kind' => 'ability', 'ability' => $ability]);
        return;
    }
    if ($ability['support'] ?? false) {
        $found = gameFind($state, $ability['source']['iid']);
        $strength = $found !== null && $found['zone'] === 'field'
            ? gameStats($state, $ability['source']['iid'])['strength']
            : ($ability['sourceStats']['strength'] ?? $ability['source']['card']['strength']);
        $ability['effects'][0]['amount'] = $strength;
    }
    gameEnqueue($state, $ability, $ability['effects']);
}

function gameBeginEffect(array &$state, array $frame): void
{
    $effect = $frame['effect'];
    $context = $frame['context'];
    if (($effect['optional'] ?? false) && !($frame['accepted'] ?? false)) {
        gamePrompt($state, [
            'kind' => 'optional', 'player' => $context['player'],
            'label' => gameCardName($context['source']['card']) . ': ' . gameEffectName($effect['op']) . '?',
            'description' => $context['source']['card']['textPt'] ?? $context['source']['card']['text'],
            'options' => [['id' => 'yes', 'label' => 'Usar efeito']], 'min' => 0, 'max' => 1,
        ], ['kind' => 'optional', 'frame' => $frame]);
        return;
    }
    $eligible = gameTargets($state, $effect['target'], $context);
    if ($eligible === []) return;
    if ($effect['target']['kind'] === 'chosen') {
        $max = min($effect['target']['max'] ?? 1, count($eligible));
        $min = min($effect['target']['min'] ?? 1, $max);
        gamePrompt($state, [
            'kind' => 'targets', 'player' => $context['player'],
            'label' => gameCardName($context['source']['card']) . ': ' . gameEffectName($effect['op']),
            'description' => $context['source']['card']['textPt'] ?? $context['source']['card']['text'],
            'options' => array_map(static fn(string $iid): array => gameCardOption($state, $iid), $eligible),
            'min' => $min, 'max' => $max,
        ], ['kind' => 'targets', 'frame' => $frame]);
        return;
    }
    gamePrepareAmounts($state, $frame, $eligible, []);
}

function gamePrepareAmounts(array &$state, array $frame, array $chosen, array $amounts): void
{
    if (($frame['effect']['upTo'] ?? false) && count($amounts) < count($chosen)) {
        $target = $chosen[count($amounts)];
        $instance = gameInstance($state, $target);
        $maximum = $frame['effect']['op'] === 'heal'
            ? min($frame['effect']['amount'] ?? 0, $instance['damage'] ?? 0)
            : ($frame['effect']['amount'] ?? 0);
        $options = [];
        for ($amount = 0; $amount <= $maximum; $amount++) $options[] = ['id' => (string) $amount, 'label' => (string) $amount];
        gamePrompt($state, [
            'kind' => 'amount', 'player' => $frame['context']['player'],
            'label' => gameCardName($frame['context']['source']['card']) . ': quantidade (' . gameCardOption($state, $target)['label'] . ')',
            'description' => $frame['context']['source']['card']['textPt'] ?? $frame['context']['source']['card']['text'],
            'options' => $options, 'min' => 1, 'max' => 1,
        ], ['kind' => 'amount', 'frame' => $frame, 'targets' => $chosen, 'amounts' => $amounts]);
        return;
    }
    gameExecuteEffect($state, $frame, $chosen, $amounts);
}

function gameExecuteEffect(array &$state, array $frame, array $chosen, array $amounts): void
{
    $effect = $frame['effect'];
    $context = $frame['context'];

    if ($effect['op'] === 'damage') {
        // Todos os pacotes de dano sao calculados antes de aplicar qualquer um.
        $packets = [];
        foreach ($chosen as $index => $iid) {
            $found = gameFind($state, $iid);
            if ($found === null || $found['zone'] !== 'field') continue;
            $amount = $amounts[$index] ?? $effect['amount'] ?? 1;
            $packets[] = ['found' => $found, 'damage' => max(0, $amount - gameKeywordValue($state, $iid, 'Resist'))];
        }
        foreach ($packets as $packet) {
            $found = $packet['found'];
            $state['players'][$found['player']]['field'][$found['index']]['damage'] += $packet['damage'];
        }
        return;
    }

    foreach ($chosen as $index => $target) {
        $amount = $amounts[$index] ?? $effect['amount'] ?? 1;
        $isPlayer = in_array($target, GAME_PLAYERS, true);

        if ($effect['op'] === 'draw' && $isPlayer) {
            gameDraw($state, $target, $amount);
        } elseif (($effect['op'] === 'gainLore' || $effect['op'] === 'loseLore') && $isPlayer) {
            $delta = $effect['op'] === 'gainLore' ? $amount : -$amount;
            $state['players'][$target]['lore'] = max(0, $state['players'][$target]['lore'] + $delta);
        } elseif ($effect['op'] === 'inkTop' && $isPlayer) {
            foreach (array_splice($state['players'][$target]['deck'], 0, $amount) as $card) {
                $card['exerted'] = $effect['entersExerted'] ?? true;
                $state['players'][$target]['inkwell'][] = $card;
            }
        } elseif ($effect['op'] === 'discard' && $isPlayer) {
            $hand = $state['players'][$target]['hand'];
            if ($hand === [] || $amount === 0) continue;
            // Cada jogador escolhe o proprio descarte; os demais resolvem em seguida.
            if ($index + 1 < count($chosen)) {
                $pending = [];
                foreach (array_slice($chosen, $index + 1) as $next) {
                    $nextEffect = $effect;
                    $nextEffect['target'] = ['kind' => 'player', 'owner' => $next === $context['player'] ? 'you' : 'opponent'];
                    $pending[] = ['effect' => $nextEffect, 'context' => $context];
                }
                $state['queue'] = array_merge($pending, $state['queue']);
            }
            $count = min($amount, count($hand));
            gamePrompt($state, [
                'kind' => 'discard', 'player' => $target, 'label' => "Descartar {$count} carta(s)",
                'description' => $frame['context']['source']['card']['textPt'] ?? $frame['context']['source']['card']['text'],
                'options' => array_map(static fn(array $card): array => gameCardOption($state, $card['iid']), $hand),
                'min' => $count, 'max' => $count,
            ], ['kind' => 'discard', 'frame' => $frame, 'victim' => $target]);
            return;
        } else {
            $found = gameFind($state, $target);
            if ($found === null) continue;
            $zone = $found['zone'];
            if ($effect['op'] === 'heal' && $zone === 'field') {
                $damage = $state['players'][$found['player']]['field'][$found['index']]['damage'];
                $state['players'][$found['player']]['field'][$found['index']]['damage'] = max(0, $damage - $amount);
            } elseif ($effect['op'] === 'banish') {
                gameLeaveField($state, $target, 'discard', true);
            } elseif ($effect['op'] === 'returnHand') {
                gameLeaveField($state, $target, 'hand', false);
            } elseif ($effect['op'] === 'ready' && $zone === 'field') {
                $state['players'][$found['player']]['field'][$found['index']]['exerted'] = false;
            } elseif ($effect['op'] === 'exert' && $zone === 'field') {
                $state['players'][$found['player']]['field'][$found['index']]['exerted'] = true;
            } elseif ($effect['op'] === 'buff' && $zone === 'field') {
                $state['modifiers'][] = [
                    'iid' => $target, 'stat' => $effect['stat'], 'amount' => $amount, 'duration' => $effect['duration'],
                    'player' => $context['player'], 'createdTurn' => $state['turn'],
                    'expiresOnOwnTurn' => $state['players'][$context['player']]['turns'] + 1,
                ];
            } elseif ($effect['op'] === 'recover' && $zone === 'discard') {
                $card = $state['players'][$found['player']]['discard'][$found['index']];
                $state['players'][$found['player']]['discard'] = array_values(array_filter(
                    $state['players'][$found['player']]['discard'],
                    static fn(array $item): bool => $item['iid'] !== $target
                ));
                $state['players'][$found['player']]['hand'][] = $card;
            } elseif ($effect['op'] === 'discard' && $zone === 'hand') {
                $card = $state['players'][$found['player']]['hand'][$found['index']];
                $state['players'][$found['player']]['hand'] = array_values(array_filter(
                    $state['players'][$found['player']]['hand'],
                    static fn(array $item): bool => $item['iid'] !== $target
                ));
                $state['players'][$found['player']]['discard'][] = $card;
            }
        }
    }
}

function gameCombatDamage(array &$state): void
{
    $state['combat']['damageDone'] = true;
    $attacker = gameFind($state, $state['combat']['attacker']);
    $defender = gameFind($state, $state['combat']['defender']);
    if ($attacker === null || $defender === null || $attacker['zone'] !== 'field' || $defender['zone'] !== 'field') return;
    $attackerId = $state['combat']['attacker'];
    $defenderId = $state['combat']['defender'];
    $attack = gameStats($state, $attackerId);
    $defend = gameStats($state, $defenderId);
    $defenderCard = $state['players'][$defender['player']]['field'][$defender['index']];
    $outgoing = max(0, $attack['strength'] - gameKeywordValue($state, $defenderId, 'Resist'));
    $incoming = $defenderCard['card']['type'] === 'Character'
        ? max(0, $defend['strength'] - gameKeywordValue($state, $attackerId, 'Resist'))
        : 0;
    $state['players'][$defender['player']]['field'][$defender['index']]['damage'] += $outgoing;
    $state['players'][$attacker['player']]['field'][$attacker['index']]['damage'] += $incoming;
    gameStateCheck($state);
}

/** Resolve tudo que estiver pendente ate a proxima decisao de jogador ou o fim da partida. */
function gameDrain(array &$state): void
{
    $steps = 0;
    while ($state['phase'] !== 'finished' && $state['pending'] === null) {
        if (++$steps > 10000) throw new GameRuleError('A resolução dos efeitos excedeu o limite de segurança');
        if ($state['queue'] !== []) {
            $frame = array_shift($state['queue']);
            gameBeginEffect($state, $frame);
            continue;
        }
        if ($state['resolvingAction'] !== null) {
            $state['players'][$state['resolvingAction']['player']]['discard'][] = $state['resolvingAction']['card'];
            $state['resolvingAction'] = null;
        }
        // Uma sequencia impressa termina antes da checagem de estado ou de outra habilidade.
        gameStateCheck($state);
        if (gameIsFinished($state)) break;

        if ($state['bag'] !== []) {
            $hasBagPlayer = false;
            foreach ($state['bag'] as $ability) if ($ability['player'] === $state['bagPlayer']) { $hasBagPlayer = true; break; }
            $hasActive = false;
            foreach ($state['bag'] as $ability) if ($ability['player'] === $state['activePlayer']) { $hasActive = true; break; }
            $player = $state['bagPlayer'] !== null && $hasBagPlayer
                ? $state['bagPlayer']
                : ($hasActive ? $state['activePlayer'] : gameOther($state['activePlayer']));
            $state['bagPlayer'] = $player;
            $abilities = array_values(array_filter($state['bag'], static fn(array $ability): bool => $ability['player'] === $player));
            if (count($abilities) > 1) {
                gamePrompt($state, [
                    'kind' => 'order', 'player' => $player, 'label' => 'Escolha a próxima habilidade para resolver',
                    'options' => array_map(static fn(array $ability): array => [
                        'id' => $ability['id'], 'label' => $ability['label'],
                        'cardId' => $ability['source']['card']['id'], 'iid' => $ability['source']['iid'],
                    ], $abilities),
                    'min' => 1, 'max' => 1,
                ], ['kind' => 'order']);
            } else {
                $chosen = $abilities[0];
                $state['bag'] = array_values(array_filter($state['bag'], static fn(array $ability): bool => $ability['id'] !== $chosen['id']));
                gameResolveAbility($state, $chosen);
            }
            continue;
        }
        $state['bagPlayer'] = null;

        if ($state['combat'] !== null) {
            if (!$state['combat']['damageDone']) gameCombatDamage($state);
            else $state['combat'] = null;
            continue;
        }
        if ($state['transition'] === 'starting') {
            // Habilidades de inicio resolvem antes da compra normal (CR 3.2).
            $state['transition'] = null;
            if ($state['turn'] !== 1) gameDraw($state, $state['activePlayer'], 1);
            continue;
        }
        if ($state['transition'] === 'ending') { gameCompleteEnd($state); continue; }
        break;
    }
}

// --- criacao da partida --------------------------------------------------------

function gameValidateCard(array $card): void
{
    $rules = $card['rules'] ?? null;
    $fail = static function (string $detail) use ($card): void {
        throw new GameRuleError("Carta não suportada {$card['id']} ({$card['name']}): {$detail}");
    };
    if (!is_array($rules) || ($rules['supported'] ?? false) !== true || ($rules['unsupported'] ?? []) !== []) {
        $fail(implode('; ', $rules['unsupported'] ?? []) ?: 'regras compiladas ausentes');
    }
    if (!in_array($card['type'], ['Character', 'Item', 'Location', 'Action'], true)) $fail('tipo de carta desconhecido');
    foreach (['cost', 'strength', 'willpower', 'lore', 'moveCost'] as $stat) {
        if (!is_int($card[$stat] ?? null) || $card[$stat] < 0) $fail("atributo inválido: {$stat}");
    }
    if (($rules['sourceId'] ?? null) !== $card['id']) $fail('as regras compiladas pertencem a outra carta');
    foreach (['keywords', 'static', 'triggered', 'activated', 'action'] as $key) {
        if (!is_array($rules[$key] ?? null)) $fail("regras ausentes: {$key}");
    }
}

/**
 * Cria a partida com os dois decks ja expandidos em cartas do motor.
 * A semente precisa ser um inteiro: a mesma semente gera a mesma partida.
 */
function gameCreate(array $decks, int $seed): array
{
    foreach (GAME_PLAYERS as $player) {
        if (!is_array($decks[$player] ?? null) || count($decks[$player]) < 7) {
            throw new GameRuleError(gamePlayerName($player) . ' precisa de pelo menos 7 cartas');
        }
        foreach ($decks[$player] as $card) gameValidateCard($card);
    }
    $state = [
        'version' => 1, 'phase' => 'mulligan',
        'players' => ['player' => gameEmptyPlayer(), 'bot' => gameEmptyPlayer()],
        'activePlayer' => 'player', 'firstPlayer' => 'player', 'turn' => 0, 'winner' => null, 'finishReason' => null,
        'rng' => $seed & GAME_UINT32, 'nextId' => 1, 'pending' => null, 'decision' => null,
        'queue' => [], 'bag' => [], 'bagPlayer' => null, 'modifiers' => [], 'combat' => null,
        'resolvingAction' => null, 'transition' => null, 'log' => [],
    ];
    $state['firstPlayer'] = $state['activePlayer'] = gameRandom($state) < 0.5 ? 'player' : 'bot';
    foreach (GAME_PLAYERS as $player) {
        $deck = [];
        foreach ($decks[$player] as $card) $deck[] = gameFreshInstance($state, $card);
        $state['players'][$player]['deck'] = $deck;
        gameShuffle($state, $state['players'][$player]['deck']);
        gameDraw($state, $player, 7);
    }
    gameMulliganPrompt($state, $state['firstPlayer']);
    return $state;
}
