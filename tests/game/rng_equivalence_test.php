<?php

declare(strict_types=1);

/**
 * Prova que o sorteio em PHP produz exatamente a mesma sequencia do motor em
 * JavaScript. Roda os dois e compara numero a numero.
 *
 *   php tests/game/rng_equivalence_test.php
 *
 * Precisa do Node apenas para gerar a referencia; o site em producao nao usa Node.
 */

chdir(dirname(__DIR__, 2));
require 'config/game/rng.php';

$node = getenv('JOGARTCG_NODE_BINARY') ?: 'node';
$script = <<<'JS'
const AMOUNT = 20000;
function random(state) {
  state.rng = (state.rng + 0x6d2b79f5) >>> 0;
  let value = state.rng;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}
function shuffle(state, cards) {
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(random(state) * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
}
const out = { sequences: {}, shuffles: {} };
for (const seed of [1, 7, 42, 999983, 2147483647]) {
  const state = { rng: seed >>> 0 };
  out.sequences[seed] = Array.from({ length: AMOUNT }, () => random(state));
  const deck = Array.from({ length: 60 }, (_, index) => index);
  const shuffleState = { rng: seed >>> 0 };
  shuffle(shuffleState, deck);
  out.shuffles[seed] = { deck, rng: shuffleState.rng };
}
process.stdout.write(JSON.stringify(out));
JS;

$temporary = tempnam(sys_get_temp_dir(), 'rng') . '.mjs';
file_put_contents($temporary, $script);
$reference = shell_exec(escapeshellarg($node) . ' ' . escapeshellarg($temporary));
@unlink($temporary);
$expected = json_decode((string) $reference, true);
if (!is_array($expected)) {
    fwrite(STDERR, "Nao foi possivel gerar a referencia em JavaScript (Node disponivel?).\n");
    exit(1);
}

$failures = 0;
foreach ($expected['sequences'] as $seed => $numbers) {
    $state = ['rng' => (int) $seed];
    $mismatch = null;
    foreach ($numbers as $index => $number) {
        $mine = gameRandom($state);
        if ($mine !== $number) { $mismatch = "posicao {$index}: PHP {$mine} x JS {$number}"; break; }
    }
    if ($mismatch === null) {
        echo "  ✔ semente {$seed}: " . count($numbers) . " numeros identicos\n";
    } else {
        echo "  ✖ semente {$seed}: {$mismatch}\n";
        $failures++;
    }
}

foreach ($expected['shuffles'] as $seed => $result) {
    $state = ['rng' => (int) $seed];
    $deck = range(0, 59);
    gameShuffle($state, $deck);
    if ($deck === $result['deck'] && $state['rng'] === $result['rng']) {
        echo "  ✔ semente {$seed}: embaralhamento de 60 cartas identico\n";
    } else {
        echo "  ✖ semente {$seed}: embaralhamento diferente\n";
        echo '      PHP: ' . implode(',', array_slice($deck, 0, 12)) . "...\n";
        echo '      JS : ' . implode(',', array_slice($result['deck'], 0, 12)) . "...\n";
        $failures++;
    }
}

echo $failures === 0 ? "\nSorteio identico nos dois motores.\n" : "\n{$failures} divergencia(s).\n";
exit($failures === 0 ? 0 : 1);
