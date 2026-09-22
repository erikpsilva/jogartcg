<?php

declare(strict_types=1);

/**
 * Testes da importacao de decks (texto, CSV, JSON, DEK) contra o catalogo real.
 *
 *   php tests/api/deck_import_test.php
 *
 * Cobre o bug de "cartas aleatorias": colecao + numero nao identificam uma carta
 * sozinhos, porque impressoes promocionais (7/P2, 7/C1) repetem os da carta normal.
 */

chdir(dirname(__DIR__, 2));
require 'config/database.php';
require 'config/lorcana.php';
require 'api/payload.php';
require 'api/session.php';
require 'api/decks.php';

$pdo = getDbConnection();
$failures = 0;
$passes = 0;

function check(bool $condition, string $label, string $detail = ''): void
{
    global $failures, $passes;
    if ($condition) { $passes++; echo "  ✔ {$label}\n"; return; }
    $failures++;
    echo "  ✖ {$label}" . ($detail !== '' ? "\n      {$detail}" : '') . "\n";
}
function importText(PDO $pdo, string $content): array
{
    return resolveImportItems($pdo, importItemsFromContent($content));
}
function ids(array $result): array
{
    $ids = array_map(static fn(array $entry): int => (int) $entry['card']['id'], $result['cards']);
    sort($ids);
    return $ids;
}

echo "\nFormatos de texto de outros sites (200 cartas aleatorias)\n";
$sample = $pdo->query('SELECT * FROM lorcana_cards WHERE active=1 ORDER BY RAND(7) LIMIT 200')->fetchAll();
$formats = [
    '4 Nome' => static fn(array $c): string => "4 {$c['full_name_en']}",
    '4x Nome' => static fn(array $c): string => "4x {$c['full_name_en']}",
    'Nome x4' => static fn(array $c): string => "{$c['full_name_en']} x4",
    'Nome (4)' => static fn(array $c): string => "{$c['full_name_en']} (4)",
    'travessao e apostrofo curvo' => static fn(array $c): string => '4 ' . str_replace([' - ', "'"], [' – ', '’'], $c['full_name_en']),
    'minusculas' => static fn(array $c): string => '4 ' . strtolower($c['full_name_en']),
    'Nome (colecao) numero' => static fn(array $c): string => "4 {$c['full_name_en']} ({$c['set_code']}) {$c['number']}",
    'Nome [colecao-numero]' => static fn(array $c): string => "4 {$c['full_name_en']} [{$c['set_code']}-{$c['number']}]",
];
foreach ($formats as $label => $line) {
    $wrong = [];
    foreach ($sample as $card) {
        $result = importText($pdo, $line($card));
        $got = $result['cards'][0] ?? null;
        if (!$got || $got['quantity'] !== 4 || normalizedCardName((string) $got['card']['full_name']) !== normalizedCardName($card['full_name_en'])) {
            $wrong[] = $line($card) . ' -> ' . ($got ? "{$got['quantity']}x {$got['card']['full_name']}" : 'nao encontrada');
        }
    }
    check($wrong === [], "{$label}: carta e quantidade certas", $wrong[0] ?? '');
}

echo "\nImpressoes que dividem colecao e numero\n";
$line = '4 Mirabel Madrigal - Family Gatherer (5) 7';
$result = importText($pdo, $line);
check(($result['cards'][0]['card']['full_name'] ?? '') === 'Mirabel Madrigal - Family Gatherer', "\"{$line}\" nao vira outra carta da colecao 5 nº 7");

$rows = $pdo->query(
    'SELECT c.* FROM lorcana_cards c JOIN (SELECT set_code, number FROM lorcana_cards WHERE active=1
       GROUP BY set_code, number HAVING COUNT(DISTINCT full_name_en) > 1 LIMIT 40) a USING (set_code, number)
     WHERE c.active=1 ORDER BY c.source_id'
)->fetchAll();
$expected = array_map(static fn(array $row): int => (int) $row['source_id'], $rows);
sort($expected);
$deck = ['name' => 'Promos', 'format' => 'core', 'cards' => array_map(static fn(array $row): array => ['quantity' => 2, 'card' => cardSummary($row, 'pt-BR')], $rows)];
foreach (['csv', 'json', 'dek'] as $type) {
    check(ids(importText($pdo, exportDeckPayload($deck, $type)['content'])) === $expected, "exportar e reimportar {$type} devolve a impressao exata (" . count($rows) . ' cartas)');
}
$json = json_encode(['cards' => array_map(static fn(array $row): array => ['quantity' => 2, 'identifier' => $row['full_identifier']], $rows)], JSON_UNESCAPED_UNICODE);
check(ids(importText($pdo, $json)) === $expected, 'JSON com identificador completo ("7/P2 • EN • 5", "1 TFC • EN • 1/P1")');

echo "\nNome sem versao\n";
$result = importText($pdo, '4 Stitch');
check($result['cards'] === [] && str_contains($result['unmatched'][0] ?? '', 'informe a versão'), 'nome com varias versoes nao vira uma versao qualquer');

echo "\nIda e volta dos decks salvos\n";
foreach ($pdo->query('SELECT id, usuario_id, nome FROM decks ORDER BY id')->fetchAll() as $row) {
    $saved = loadDeck($pdo, (int) $row['id'], (int) $row['usuario_id']);
    $want = [];
    foreach ($saved['cards'] as $entry) $want[(int) $entry['card']['id']] = (int) $entry['quantity'];
    ksort($want);
    foreach (['csv', 'json', 'dek'] as $type) {
        $got = [];
        foreach (importText($pdo, exportDeckPayload($saved, $type)['content'])['cards'] as $entry) $got[(int) $entry['card']['id']] = (int) $entry['quantity'];
        ksort($got);
        check($got === $want, "deck {$row['id']} ({$row['nome']}) em {$type}");
    }
}

echo "\n{$passes} passaram, {$failures} falharam\n";
exit($failures === 0 ? 0 : 1);
