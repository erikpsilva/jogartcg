<?php

declare(strict_types=1);

/**
 * Prova que o motor em PHP joga exatamente como o motor original em JavaScript.
 *
 *   php tests/game/engine_equivalence_test.php [partidas aleatorias] [jogadas]
 *
 * Duas baterias, todas com cartas reais do catalogo:
 *  - partidas aleatorias, do primeiro descarte ate alguem vencer;
 *  - partidas dirigidas, com decks montados para cair em cada mecanica
 *    (transformar, cantar, cantar juntos, impulsionar, guarda-costas, locais...).
 *
 * Em todas elas a mesma sequencia de jogadas roda nos dois motores e comparamos a
 * impressao digital do estado depois de cada jogada; na primeira diferenca,
 * mostramos o caminho exato do campo divergente. O Node so e usado aqui, no
 * desenvolvimento: o site em producao roda apenas o motor em PHP.
 */

chdir(dirname(__DIR__, 2));
ini_set('memory_limit', '1G');
set_time_limit(0);
require_once 'config/database.php';
require_once 'config/game/match.php';

$randomMatches = max(0, (int) ($argv[1] ?? 8));
$maxSteps = max(1, (int) ($argv[2] ?? 400));
$node = getenv('JOGARTCG_NODE_BINARY') ?: 'node';

/** Forma canonica: chaves ordenadas e objeto vazio igual a lista vazia (igual ao replay.mjs). */
function canonicalValue(mixed $value): mixed
{
    if (!is_array($value)) return $value;
    if ($value === []) return [];
    if (array_is_list($value)) return array_map('canonicalValue', $value);
    ksort($value, SORT_STRING);
    return array_map('canonicalValue', $value);
}
function fingerprint(mixed $value): string
{
    return sha1(json_encode(canonicalValue($value), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
}
/** Caminho do primeiro campo diferente entre dois estados canonicos. */
function firstDifference(mixed $mine, mixed $theirs, string $path = ''): ?string
{
    if (is_array($mine) && is_array($theirs)) {
        foreach (array_values(array_unique(array_merge(array_keys($mine), array_keys($theirs)))) as $key) {
            if (!array_key_exists($key, $mine)) return "{$path}.{$key}: só no motor JavaScript";
            if (!array_key_exists($key, $theirs)) return "{$path}.{$key}: só no motor PHP";
            $difference = firstDifference($mine[$key], $theirs[$key], "{$path}.{$key}");
            if ($difference !== null) return $difference;
        }
        return null;
    }
    if ($mine === $theirs) return null;
    $show = static fn(mixed $value): string => is_scalar($value) || $value === null ? var_export($value, true) : gettype($value);
    return "{$path}: PHP " . $show($mine) . ' x JS ' . $show($theirs);
}

// --- cartas -----------------------------------------------------------------------

const CARD_COLUMNS = 'source_id, name_en, full_name_en, full_name_pt_br, type_en, cost, inkwell, strength, willpower,
    lore, move_cost, subtypes_en_json, image_full_url, image_thumbnail_url, full_text_en, full_text_pt_br, rules_json';

function engineCard(array $row): array
{
    $rules = json_decode((string) $row['rules_json'], true);
    // Mesma politica de gameBuildCards: o que o compilador nao entendeu vira texto
    // sem efeito automatico, e a carta entra na mesa assim mesmo.
    if (($rules['supported'] ?? false) !== true || ($rules['unsupported'] ?? []) !== []) {
        $rules['supported'] = true;
        $rules['unsupported'] = [];
    }
    return [
        'id' => (int) $row['source_id'],
        'name' => $row['name_en'],
        'fullName' => $row['full_name_en'],
        'displayName' => $row['full_name_pt_br'] ?: $row['full_name_en'],
        'type' => $row['type_en'],
        'cost' => (int) $row['cost'],
        'inkwell' => (bool) $row['inkwell'],
        'strength' => (int) $row['strength'],
        'willpower' => (int) $row['willpower'],
        'lore' => (int) $row['lore'],
        'moveCost' => (int) ($row['move_cost'] ?? 0),
        'subtypes' => json_decode((string) ($row['subtypes_en_json'] ?: '[]'), true) ?: [],
        'image' => $row['image_full_url'] ?: ($row['image_thumbnail_url'] ?: ''),
        'text' => $row['full_text_en'] ?: '',
        'textPt' => $row['full_text_pt_br'] ?: ($row['full_text_en'] ?: ''),
        'rules' => $rules,
    ];
}

$pdo = getDbConnection();
$rows = $pdo->query(
    'SELECT ' . CARD_COLUMNS . " FROM lorcana_cards
     WHERE active = 1 AND rules_supported = 1 AND type_en IN ('Character','Action','Item','Location')
     ORDER BY source_id"
)->fetchAll();
if (count($rows) < 60) {
    fwrite(STDERR, "Poucas cartas com regras compiladas. Rode: php bin/compile_card_rules.php\n");
    exit(1);
}
/** Cartas baratas e inkaveis: enchem o deck sem mudar a mecanica em teste. */
$filler = array_values(array_filter($rows, static fn(array $row): bool => (bool) $row['inkwell'] && (int) $row['cost'] <= 3));

/** Deck de 60 cartas (30 nomes x2), variando o ponto de partida a cada partida. */
function buildDeck(array $rows, int $offset): array
{
    $deck = [];
    $step = max(1, intdiv(count($rows), 31));
    for ($index = 0; $index < 30; $index++) {
        $card = engineCard($rows[($offset + $index * $step) % count($rows)]);
        $deck[] = $card;
        $deck[] = $card;
    }
    return $deck;
}

/**
 * Deck centrado nas cartas escolhidas, completado com cartas baratas.
 * Quando existem poucas cartas com a mecanica, $copies aumenta a presenca delas
 * para o caminho aparecer de fato na partida.
 */
function focusedDeck(array $chosen, array $filler, int $offset, int $copies = 2): array
{
    $deck = [];
    foreach ($chosen as $row) {
        $card = engineCard($row);
        for ($copy = 0; $copy < $copies; $copy++) $deck[] = $card;
    }
    for ($index = 0; count($deck) < 60; $index++) {
        $card = engineCard($filler[($offset + $index) % count($filler)]);
        $deck[] = $card;
        $deck[] = $card;
    }
    return array_slice($deck, 0, 60);
}

/** Cartas cujas regras compiladas contem um trecho (palavra-chave, efeito...). */
function cardsMatching(PDO $pdo, string $needle, int $limit): array
{
    $statement = $pdo->prepare(
        'SELECT ' . CARD_COLUMNS . " FROM lorcana_cards
         WHERE active = 1 AND rules_supported = 1 AND rules_json LIKE ?
         ORDER BY source_id LIMIT {$limit}"
    );
    $statement->execute(['%' . $needle . '%']);
    return $statement->fetchAll();
}

// --- uma partida ---------------------------------------------------------------------

/**
 * Joga uma partida nos dois motores e compara passo a passo.
 * Devolve [ok, resumo]; acumula a cobertura por tipo de jogada e de decisao.
 */
function runMatch(string $title, array $decks, int $seed, int $maxSteps, string $node, array &$coverage, array $prefer = []): bool
{
    try {
        $state = gameCreate($decks, $seed);
    } catch (Throwable $error) {
        echo "  ✖ {$title}: o motor em PHP nao criou a partida: {$error->getMessage()}\n";
        return false;
    }

    // Sorteio proprio para escolher as jogadas, separado do sorteio da partida.
    $picker = ['rng' => $seed ^ 0x5bf03635];
    $actions = [];
    $hashes = [fingerprint($state)];
    for ($step = 0; $step < $maxSteps; $step++) {
        $legal = gameLegalActions($state);
        $options = array_values(array_filter($legal, static fn(array $action): bool => $action['type'] !== 'concede'));
        if ($options === []) break;
        // Na partida dirigida, a mecanica em teste tem preferencia sempre que estiver disponivel.
        $preferred = array_values(array_filter($options, static fn(array $action): bool => in_array($action['type'], $prefer, true)));
        $pool = $preferred !== [] ? $preferred : $options;
        $action = $pool[(int) floor(gameRandom($picker) * count($pool))];
        unset($action['label']);
        $coverage['jogadas'][$action['type']] = ($coverage['jogadas'][$action['type']] ?? 0) + 1;
        if ($state['pending'] !== null) {
            $kind = $state['decision']['kind'];
            $coverage['decisoes'][$kind] = ($coverage['decisoes'][$kind] ?? 0) + 1;
        }
        $state = gameApplyAction($state, $action);
        $actions[] = $action;
        $hashes[] = fingerprint($state);
        if ($state['phase'] === 'finished') break;
    }
    // A desistencia tambem precisa bater: encerra a partida que ficou pelo caminho.
    if ($state['phase'] !== 'finished') {
        $action = ['type' => 'concede', 'player' => gameActiveDecisionPlayer($state) ?? $state['activePlayer']];
        $coverage['jogadas']['concede'] = ($coverage['jogadas']['concede'] ?? 0) + 1;
        $state = gameApplyAction($state, $action);
        $actions[] = $action;
        $hashes[] = fingerprint($state);
    }

    $inputPath = tempnam(sys_get_temp_dir(), 'engine') . '.json';
    file_put_contents($inputPath, json_encode(['decks' => $decks, 'seed' => $seed, 'actions' => $actions],
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    $replay = escapeshellarg($node) . ' ' . escapeshellarg('tests/game/support/replay.mjs') . ' ' . escapeshellarg($inputPath);
    $reference = json_decode((string) shell_exec($replay), true);
    if (!is_array($reference)) {
        @unlink($inputPath);
        fwrite(STDERR, "Nao foi possivel rodar o motor de referencia (Node disponivel? npm run build:core?).\n");
        exit(1);
    }

    $divergence = null;
    foreach ($hashes as $step => $hash) {
        if (($reference['hashes'][$step] ?? null) !== $hash) { $divergence = $step; break; }
    }
    if ($divergence === null && $reference['error'] !== null) $divergence = $reference['error']['step'];

    if ($divergence === null) {
        @unlink($inputPath);
        $ending = $state['phase'] === 'finished' ? ", fim: {$state['finishReason']}" : '';
        echo '  ✔ ' . $title . ': ' . count($actions) . " jogadas identicas nos dois motores (turno {$state['turn']}{$ending})\n";
        return true;
    }

    $label = $divergence === 0 ? 'na criacao da partida' : "na jogada {$divergence}";
    $what = $divergence > 0 && isset($actions[$divergence - 1])
        ? ' (' . json_encode($actions[$divergence - 1], JSON_UNESCAPED_UNICODE) . ')'
        : '';
    echo "  ✖ {$title}: divergencia {$label}{$what}\n";
    if (($reference['error']['step'] ?? null) === $divergence) {
        echo "      o motor JavaScript recusou a jogada: {$reference['error']['message']}\n";
        @unlink($inputPath);
        return false;
    }
    // Replica ate o passo divergente nos dois motores para mostrar o campo exato.
    $detail = json_decode((string) shell_exec($replay . ' ' . escapeshellarg((string) $divergence)), true);
    @unlink($inputPath);
    $mine = gameCreate($decks, $seed);
    for ($step = 0; $step < $divergence; $step++) $mine = gameApplyAction($mine, $actions[$step]);
    echo '      ' . (firstDifference(canonicalValue($mine), $detail['state'] ?? null) ?? 'estados diferentes, campo nao identificado') . "\n";
    return false;
}

// --- baterias ---------------------------------------------------------------------

$failures = 0;
$coverage = ['jogadas' => [], 'decisoes' => []];

echo "Partidas aleatorias\n";
for ($match = 1; $match <= $randomMatches; $match++) {
    $decks = ['player' => buildDeck($rows, $match * 13), 'bot' => buildDeck($rows, 500 + $match * 29)];
    if (!runMatch("partida {$match}", $decks, 1000 + $match * 7717, $maxSteps, $node, $coverage)) $failures++;
}

// Cada mecanica com um deck proprio dos dois lados, para o caminho aparecer de fato.
$focus = [
    'transformar' => '"keyword":"Shift"',
    'cantar' => '"keyword":"Singer"',
    'cantar juntos' => '"keyword":"Sing Together"',
    'guarda-costas' => '"keyword":"Bodyguard"',
    // Varias cartas disparando no mesmo momento: o jogador escolhe a ordem de resolucao.
    'ordem das habilidades' => '"trigger":"start"',
    'esquiva' => '"keyword":"Evasive"',
    'imprudente' => '"keyword":"Reckless"',
    'resistir' => '"keyword":"Resist"',
    'desafiante' => '"keyword":"Challenger"',
    'vigilancia' => '"keyword":"Ward"',
    'desvanecer' => '"keyword":"Vanish"',
    'apoio' => '"keyword":"Support"',
    'locais' => '"kind":"restriction"',
];
echo "\nPartidas dirigidas\n";
$seed = 90000;
foreach ($focus as $title => $needle) {
    $chosen = cardsMatching($pdo, $needle, 14);
    if ($chosen === []) { echo "  – {$title}: nenhuma carta com essa regra no catalogo\n"; continue; }
    if ($needle === '"keyword":"Shift"') {
        // Transformar so acontece com a carta de origem em jogo: cada carta entra com o seu par.
        $partner = $pdo->prepare('SELECT ' . CARD_COLUMNS . " FROM lorcana_cards
            WHERE active = 1 AND rules_supported = 1 AND name_en = ? AND rules_json NOT LIKE '%\"keyword\":\"Shift\"%'
            ORDER BY cost, source_id LIMIT 1");
        $pairs = [];
        foreach ($chosen as $row) {
            $partner->execute([$row['name_en']]);
            $base = $partner->fetch();
            if ($base) { $pairs[] = $row; $pairs[] = $base; }
        }
        $chosen = array_slice($pairs, 0, 24);
    }
    // Locais precisam entrar inteiros: a consulta por regra nao os alcanca.
    if ($title === 'locais') {
        $locations = $pdo->query('SELECT ' . CARD_COLUMNS . " FROM lorcana_cards
            WHERE active = 1 AND rules_supported = 1 AND type_en = 'Location' ORDER BY move_cost, source_id LIMIT 10")->fetchAll();
        $chosen = array_merge($locations, array_slice($chosen, 0, 8));
    }
    $prefer = ['transformar' => ['shift'], 'cantar' => ['sing'], 'cantar juntos' => ['sing'],
        'locais' => ['move'], 'apoio' => ['quest'], 'ordem das habilidades' => ['play']][$title] ?? [];
    $copies = count($chosen) >= 8 ? 2 : 8;
    $decks = ['player' => focusedDeck($chosen, $filler, 3, $copies), 'bot' => focusedDeck($chosen, $filler, 17, $copies)];
    if (!runMatch($title, $decks, $seed += 131, $maxSteps, $node, $coverage, $prefer)) $failures++;
}

// Regras parciais: o jogo real aceita cartas com frases que o compilador nao entendeu,
// tratando-as como texto sem efeito automatico. Impulsionar so existe nesse grupo.
echo "\nPartidas com regras parciais\n";
$partial = [
    'impulsionar' => '{"keyword":"Boost"',
    'texto nao reconhecido' => '"unsupported":["',
];
foreach ($partial as $title => $needle) {
    $statement = $pdo->prepare('SELECT ' . CARD_COLUMNS . " FROM lorcana_cards
        WHERE active = 1 AND rules_supported = 0 AND rules_json LIKE ? ORDER BY cost, source_id LIMIT 16");
    $statement->execute(['%' . $needle . '%']);
    $chosen = $statement->fetchAll();
    if ($chosen === []) { echo "  – {$title}: nenhuma carta nesse grupo\n"; continue; }
    $decks = ['player' => focusedDeck($chosen, $filler, 5), 'bot' => focusedDeck($chosen, $filler, 23)];
    $prefer = $title === 'impulsionar' ? ['boost'] : [];
    if (!runMatch($title, $decks, $seed += 131, $maxSteps, $node, $coverage, $prefer)) $failures++;
}

// Desistencia: a unica jogada que encerra a partida fora das regras normais.
echo "\nPartida encerrada por desistencia\n";
$decks = ['player' => buildDeck($rows, 91), 'bot' => buildDeck($rows, 613)];
if (!runMatch('desistencia', $decks, 424242, 18, $node, $coverage)) $failures++;

// Cobertura: um teste que nunca passa por um caminho nao prova nada sobre ele.
foreach (['jogadas' => 'Jogadas', 'decisoes' => 'Decisões'] as $key => $title) {
    ksort($coverage[$key]);
    $parts = [];
    foreach ($coverage[$key] as $name => $count) $parts[] = "{$name}={$count}";
    echo "\n  {$title} exercitadas: " . ($parts === [] ? 'nenhuma' : implode(', ', $parts)) . "\n";
}

echo $failures === 0
    ? "\nMotor em PHP identico ao motor em JavaScript.\n"
    : "\n{$failures} partida(s) com divergencia.\n";
exit($failures === 0 ? 0 : 1);
