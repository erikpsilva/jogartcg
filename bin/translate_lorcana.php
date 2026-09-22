<?php

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

ini_set('memory_limit', '768M');
set_time_limit(0);

require_once dirname(__DIR__) . '/config/database.php';

function translationJson(?string $value): mixed
{
    return $value === null || $value === '' ? null : json_decode($value, true, 512, JSON_THROW_ON_ERROR);
}

function encodedTranslation(mixed $value): ?string
{
    return $value === null ? null : json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
}

function optionValue(array $arguments, string $name): ?string
{
    foreach ($arguments as $argument) {
        if (str_starts_with($argument, $name . '=')) {
            return substr($argument, strlen($name) + 1);
        }
    }
    return null;
}

$projectRoot = dirname(__DIR__);
$python = optionValue($argv, '--python') ?: getenv('LORCANA_PYTHON_BIN') ?: 'python';
$vendorPath = $projectRoot . '/.tools/python';
$modelPath = $projectRoot . '/.tools/models/translate-en_pt-1_9';
$limit = max(0, (int) (optionValue($argv, '--limit') ?? 0));
// --all: refaz tudo (inclusive revisoes antigas) com a politica atual de traducao.
// --ids=1,2,3: so estas cartas. --dry-run: mostra o resultado sem gravar.
$retranslateAll = in_array('--all', $argv, true);
$dryRun = in_array('--dry-run', $argv, true);
$onlyIds = array_values(array_filter(array_map('intval', explode(',', (string) (optionValue($argv, '--ids') ?? '')))));

if (!is_dir($vendorPath) || !is_dir($modelPath . '/model')) {
    fwrite(STDERR, "Tradutor local nao instalado em .tools. Consulte o README.\n");
    exit(1);
}

$pdo = getDbConnection();
$limitSql = $limit > 0 ? ' LIMIT ' . $limit : '';
$cardFilter = $onlyIds ? 'source_id IN (' . implode(',', $onlyIds) . ')' : ($retranslateAll ? '1 = 1' : "translation_status = 'pending'");
$setFilter = $onlyIds ? '1 = 0' : ($retranslateAll ? '1 = 1' : "translation_status = 'pending'");
$sets = $pdo->query(
    "SELECT code, name_en, type_en FROM lorcana_sets WHERE active = 1 AND {$setFilter} ORDER BY number, code{$limitSql}"
)->fetchAll();
$cards = $pdo->query(
    "SELECT source_id, name_en, version_en, type_en, color_en, rarity_en, story_en,
            subtypes_en_json, subtypes_text_en, keyword_abilities_en_json, abilities_en_json,
            effects_en_json, full_text_en, flavor_text_en, clarifications_en_json, errata_en_json
     FROM lorcana_cards WHERE active = 1 AND {$cardFilter} ORDER BY source_id{$limitSql}"
)->fetchAll();

if (!$sets && !$cards) {
    fwrite(STDOUT, "Nenhuma traducao pendente.\n");
    exit(0);
}

// Termos que o tradutor nao pode mexer, tirados do catalogo inteiro (nao so do lote):
// nomes de personagens, itens e locais citados nos efeitos, e todos os subtipos.
$names = $pdo->query("SELECT DISTINCT name_en FROM lorcana_cards WHERE type_en <> 'Action' AND name_en <> ''")->fetchAll(PDO::FETCH_COLUMN);
$subtypes = [];
foreach ($pdo->query('SELECT subtypes_en_json FROM lorcana_cards WHERE subtypes_en_json IS NOT NULL')->fetchAll(PDO::FETCH_COLUMN) as $json) {
    foreach (translationJson($json) ?? [] as $subtype) $subtypes[$subtype] = true;
}
$payload = ['sets' => [], 'cards' => [], 'glossary' => ['names' => $names, 'subtypes' => array_keys($subtypes)]];
foreach ($sets as $set) {
    $payload['sets'][] = [
        'code' => $set['code'],
        'name' => $set['name_en'],
        'type' => $set['type_en'],
    ];
}
foreach ($cards as $card) {
    $payload['cards'][] = [
        'id' => (int) $card['source_id'],
        'name' => $card['name_en'],
        'version' => $card['version_en'],
        'type' => $card['type_en'],
        'color' => $card['color_en'],
        'rarity' => $card['rarity_en'],
        'story' => $card['story_en'],
        'subtypes' => translationJson($card['subtypes_en_json']),
        'subtypes_text' => $card['subtypes_text_en'],
        'keyword_abilities' => translationJson($card['keyword_abilities_en_json']),
        'abilities' => translationJson($card['abilities_en_json']),
        'effects' => translationJson($card['effects_en_json']),
        'full_text' => $card['full_text_en'],
        'flavor_text' => $card['flavor_text_en'],
        'clarifications' => translationJson($card['clarifications_en_json']),
        'errata' => translationJson($card['errata_en_json']),
    ];
}

$tempDirectory = sys_get_temp_dir() . '/jogartcg-lorcana-' . bin2hex(random_bytes(6));
if (!mkdir($tempDirectory, 0770, true) && !is_dir($tempDirectory)) {
    throw new RuntimeException('Nao foi possivel criar o diretorio temporario.');
}
$inputPath = $tempDirectory . '/input.json';
$outputPath = $tempDirectory . '/output.json';
file_put_contents($inputPath, json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR));

$command = sprintf(
    'set "PYTHONPATH=%s" && %s %s %s %s --model %s',
    str_replace('%', '%%', $vendorPath),
    escapeshellarg($python),
    escapeshellarg($projectRoot . '/tools/translate_lorcana.py'),
    escapeshellarg($inputPath),
    escapeshellarg($outputPath),
    escapeshellarg($modelPath)
);

fwrite(STDOUT, sprintf("Traduzindo %d colecoes e %d cartas...\n", count($sets), count($cards)));
passthru($command, $exitCode);
if ($exitCode !== 0 || !is_file($outputPath)) {
    @unlink($inputPath);
    @rmdir($tempDirectory);
    fwrite(STDERR, "O processo de traducao falhou.\n");
    exit(1);
}

$translated = json_decode(file_get_contents($outputPath), true, 512, JSON_THROW_ON_ERROR);
$engine = (string) ($translated['engine'] ?? 'argos-translate-en-pt-1.9');
$fallbacks = $translated['fallbacks'] ?? [];

if ($dryRun) {
    foreach ($translated['cards'] ?? [] as $card) {
        $title = $card['name'] . ($card['version'] ? ' - ' . $card['version'] : '');
        fwrite(STDOUT, "\n#{$card['id']} {$title}\n  " . ($card['subtypes_text'] ?? '') . "\n");
        fwrite(STDOUT, preg_replace('/^/m', '  ', (string) ($card['full_text'] ?? '')) . "\n");
        if (!empty($card['flavor_text'])) fwrite(STDOUT, '  ~ ' . $card['flavor_text'] . "\n");
    }
    fwrite(STDOUT, "\nTrechos mantidos em ingles (tradutor perdeu um termo protegido): " . count($fallbacks) . "\n");
    foreach ($fallbacks as $text) fwrite(STDOUT, "  - {$text}\n");
    @unlink($inputPath);
    @unlink($outputPath);
    @rmdir($tempDirectory);
    exit(0);
}

$setStatement = $pdo->prepare(
    "UPDATE lorcana_sets SET name_pt_br = ?, type_pt_br = ?, translation_status = 'automatic' WHERE code = ?"
);
$cardStatement = $pdo->prepare(
    "UPDATE lorcana_cards SET
        name_pt_br = ?, version_pt_br = ?, full_name_pt_br = ?, type_pt_br = ?, color_pt_br = ?,
        rarity_pt_br = ?, story_pt_br = ?, subtypes_pt_br_json = ?, subtypes_text_pt_br = ?,
        keyword_abilities_pt_br_json = ?, abilities_pt_br_json = ?, effects_pt_br_json = ?,
        full_text_pt_br = ?, flavor_text_pt_br = ?, clarifications_pt_br_json = ?, errata_pt_br_json = ?,
        translation_status = 'automatic', translation_engine = ?, translated_at = NOW()
     WHERE source_id = ?"
);

$pdo->beginTransaction();
try {
    foreach ($translated['sets'] ?? [] as $set) {
        $setStatement->execute([$set['name'] ?? null, $set['type'] ?? null, $set['code']]);
    }
    foreach ($translated['cards'] ?? [] as $card) {
        $name = $card['name'] ?? null;
        $version = $card['version'] ?? null;
        $fullName = trim((string) $name . ($version ? ' - ' . $version : ''));
        $cardStatement->execute([
            $name,
            $version,
            $fullName,
            $card['type'] ?? null,
            $card['color'] ?? null,
            $card['rarity'] ?? null,
            $card['story'] ?? null,
            encodedTranslation($card['subtypes'] ?? null),
            $card['subtypes_text'] ?? null,
            encodedTranslation($card['keyword_abilities'] ?? null),
            encodedTranslation($card['abilities'] ?? null),
            encodedTranslation($card['effects'] ?? null),
            $card['full_text'] ?? null,
            $card['flavor_text'] ?? null,
            encodedTranslation($card['clarifications'] ?? null),
            encodedTranslation($card['errata'] ?? null),
            $engine,
            (int) $card['id'],
        ]);
    }
    $pdo->commit();
} catch (Throwable $exception) {
    $pdo->rollBack();
    throw $exception;
} finally {
    @unlink($inputPath);
    @unlink($outputPath);
    @rmdir($tempDirectory);
}

fwrite(STDOUT, sprintf("Traducao automatica salva: %d colecoes e %d cartas.\n", count($sets), count($cards)));
if ($fallbacks) {
    fwrite(STDOUT, count($fallbacks) . " trecho(s) mantidos em ingles porque o tradutor perdeu um termo protegido.\n");
}
