<?php

declare(strict_types=1);

/**
 * Compila o texto das cartas em regras e guarda em lorcana_cards.rules_json.
 *
 *   php bin/compile_card_rules.php
 *   php bin/compile_card_rules.php --sql=database/card_rules.sql
 *
 * Roda no ambiente de desenvolvimento, onde existe Node, e usa o mesmo compilador
 * do motor (packages/game-core). O site em producao nao executa nada disso: le a
 * coluna pronta. Rode depois de cada sincronizacao do catalogo.
 *
 * Com --sql, grava tambem um arquivo para importar no phpMyAdmin da producao,
 * que assim recebe as regras sem precisar de Node.
 */

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

ini_set('memory_limit', '1G');
set_time_limit(0);
require_once dirname(__DIR__) . '/config/database.php';

$projectRoot = dirname(__DIR__);
$node = getenv('JOGARTCG_NODE_BINARY') ?: 'node';
$compiler = $projectRoot . '/packages/game-core/dist/cards.js';
if (!is_file($compiler)) {
    fwrite(STDERR, "Compilador nao encontrado. Rode: npm run build:core\n");
    exit(1);
}

$pdo = getDbConnection();
$cards = $pdo->query(
    "SELECT source_id, name_en, type_en, full_text_en, abilities_en_json, effects_en_json
     FROM lorcana_cards WHERE active = 1 ORDER BY source_id"
)->fetchAll();

$payload = array_map(static fn(array $row): array => [
    'id' => (int) $row['source_id'],
    'original' => [
        'name' => $row['name_en'],
        'type' => $row['type_en'],
        'full_text' => $row['full_text_en'],
        'abilities' => $row['abilities_en_json'] !== null ? json_decode((string) $row['abilities_en_json'], true) : null,
        'effects' => $row['effects_en_json'] !== null ? json_decode((string) $row['effects_en_json'], true) : null,
    ],
], $cards);

$directory = sys_get_temp_dir() . '/jogartcg-rules-' . bin2hex(random_bytes(6));
mkdir($directory, 0770, true);
$inputPath = $directory . '/input.json';
$scriptPath = $directory . '/compile.mjs';
file_put_contents($inputPath, json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
// Caminho no formato de URL: no Windows as barras invertidas viram escapes no import.
$compilerUrl = 'file:///' . ltrim(str_replace('\\', '/', $compiler), '/');
file_put_contents($scriptPath, <<<JS
import { readFileSync } from 'node:fs';
import { compileCardRules } from '{$compilerUrl}';
const cards = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const out = cards.map((card) => ({ id: card.id, rules: compileCardRules(card) }));
process.stdout.write(JSON.stringify(out));
JS);

fwrite(STDOUT, 'Compilando as regras de ' . count($payload) . " cartas...\n");
$descriptors = [1 => ['pipe', 'w'], 2 => ['pipe', 'w']];
$process = proc_open([$node, $scriptPath, $inputPath], $descriptors, $pipes, $directory);
$output = is_resource($process) ? stream_get_contents($pipes[1]) : '';
$errors = is_resource($process) ? stream_get_contents($pipes[2]) : 'nao foi possivel iniciar o Node';
if (is_resource($process)) { fclose($pipes[1]); fclose($pipes[2]); proc_close($process); }
@unlink($inputPath); @unlink($scriptPath); @rmdir($directory);

$compiled = json_decode((string) $output, true);
if (!is_array($compiled)) {
    fwrite(STDERR, "Falha ao compilar: " . substr((string) $errors, 0, 2000) . "\n");
    exit(1);
}

$sqlPath = '';
foreach ($argv as $argument) {
    if (str_starts_with($argument, '--sql=')) $sqlPath = substr($argument, 6);
}

$update = $pdo->prepare('UPDATE lorcana_cards SET rules_json = ?, rules_supported = ? WHERE source_id = ?');
$supported = 0;
$statements = [];
$pdo->beginTransaction();
foreach ($compiled as $entry) {
    $rules = $entry['rules'] ?? null;
    // O motor exige regras completas; as demais ficam marcadas e fora das partidas.
    $ok = is_array($rules) && ($rules['supported'] ?? false) === true && ($rules['unsupported'] ?? []) === [];
    $encoded = json_encode($rules, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    $update->execute([$encoded, $ok ? 1 : 0, (int) $entry['id']]);
    if ($ok) $supported++;
    if ($sqlPath !== '') {
        $statements[] = sprintf('UPDATE `lorcana_cards` SET `rules_json`=%s,`rules_supported`=%d WHERE `source_id`=%d;',
            $pdo->quote($encoded), $ok ? 1 : 0, (int) $entry['id']);
    }
}
$pdo->commit();

if ($sqlPath !== '') {
    $header = "-- Regras compiladas das cartas, para importar no phpMyAdmin da producao.\n"
        . "-- Gerado por bin/compile_card_rules.php em " . date('Y-m-d H:i') . ".\n"
        . "-- Aplique antes database/migrations/2026-09-22-card-rules.sql.\n"
        . "SET NAMES utf8mb4;\nSTART TRANSACTION;\n";
    file_put_contents($sqlPath, $header . implode("\n", $statements) . "\nCOMMIT;\n");
    printf("Arquivo para a producao: %s (%.1f MB)\n", $sqlPath, filesize($sqlPath) / 1048576);
}

printf("Regras gravadas: %d cartas, %d com regras completas (%.1f%%).\n", count($compiled), $supported, $supported / max(1, count($compiled)) * 100);
