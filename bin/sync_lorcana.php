<?php

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

ini_set('memory_limit', '768M');
set_time_limit(0);

require_once dirname(__DIR__) . '/config/database.php';
require_once dirname(__DIR__) . '/config/lorcana.php';
require_once dirname(__DIR__) . '/config/card_images.php';
require_once dirname(__DIR__) . '/config/card_groups.php';

function logLine(string $message): void
{
    fwrite(STDOUT, '[' . date('Y-m-d H:i:s') . '] ' . $message . PHP_EOL);
}

function fetchUrl(string $url): string
{
    $curl = curl_init($url);
    curl_setopt_array($curl, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_CONNECTTIMEOUT => 15,
        CURLOPT_TIMEOUT => 180,
        CURLOPT_USERAGENT => 'JogarTCG-LorcanaSync/1.0',
        CURLOPT_HTTPHEADER => ['Accept: application/json'],
    ]);

    $body = curl_exec($curl);
    $status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
    $error = curl_error($curl);
    curl_close($curl);

    if (!is_string($body) || $status !== 200) {
        throw new RuntimeException("Falha ao consultar {$url}. HTTP {$status}. {$error}");
    }

    return $body;
}

function jsonValue(mixed $value): ?string
{
    if ($value === null) {
        return null;
    }

    return json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
}

function dateValue(mixed $value): ?string
{
    return is_string($value) && preg_match('/^\d{4}-\d{2}-\d{2}/', $value)
        ? substr($value, 0, 10)
        : null;
}

function intValue(array $data, string $key): ?int
{
    return isset($data[$key]) && is_numeric($data[$key]) ? (int) $data[$key] : null;
}

$force = in_array('--force', $argv, true);
$pdo = getDbConnection();
$pdo->exec("SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci");

$runId = null;

try {
    logLine('Consultando metadados do LorcanaJSON...');
    $metadataJson = fetchUrl(LORCANA_METADATA_URL);
    $metadata = json_decode($metadataJson, true, 32, JSON_THROW_ON_ERROR);
    $generatedAt = $metadata['generatedOn'] ?? null;
    $formatVersion = $metadata['formatVersion'] ?? null;

    if (!is_string($generatedAt) || !is_string($formatVersion)) {
        throw new RuntimeException('Metadados do LorcanaJSON incompletos.');
    }

    $state = $pdo->query('SELECT * FROM lorcana_sync_state WHERE id = 1')->fetch();
    $pdo->prepare(
        'UPDATE lorcana_sync_state SET last_checked_at = NOW(), last_error = NULL WHERE id = 1'
    )->execute();

    if (!$force && $state && $state['source_generated_at'] === str_replace('T', ' ', $generatedAt)) {
        $stmt = $pdo->prepare(
            "INSERT INTO lorcana_sync_runs (status, source_generated_at, format_version, started_at, finished_at)
             VALUES ('skipped', ?, ?, NOW(), NOW())"
        );
        $stmt->execute([str_replace('T', ' ', $generatedAt), $formatVersion]);
        logLine('Nenhuma atualizacao encontrada.');
        exit(0);
    }

    $stmt = $pdo->prepare(
        "INSERT INTO lorcana_sync_runs (status, source_generated_at, format_version)
         VALUES ('running', ?, ?)"
    );
    $stmt->execute([str_replace('T', ' ', $generatedAt), $formatVersion]);
    $runId = (int) $pdo->lastInsertId();

    logLine('Baixando catalogo completo...');
    $catalogJson = fetchUrl(LORCANA_ALL_CARDS_URL);
    $checksum = hash('sha256', $catalogJson);
    $catalog = json_decode($catalogJson, true, 512, JSON_THROW_ON_ERROR);

    if (!isset($catalog['sets'], $catalog['cards']) || !is_array($catalog['sets']) || !is_array($catalog['cards'])) {
        throw new RuntimeException('O catalogo recebido nao possui sets e cards validos.');
    }

    $setSql = <<<'SQL'
        INSERT INTO lorcana_sets (
            code, number, name_en, type_en, prerelease_date, release_date,
            allowed_in_tournaments_from_date, has_all_cards, allowed_in_formats_json,
            card_counts_json, active, source_hash
        ) VALUES (
            :code, :number, :name_en, :type_en, :prerelease_date, :release_date,
            :tournament_date, :has_all_cards, :formats, :counts, 1, :source_hash
        ) ON DUPLICATE KEY UPDATE
            name_pt_br = IF(source_hash <> VALUES(source_hash), NULL, name_pt_br),
            type_pt_br = IF(source_hash <> VALUES(source_hash), NULL, type_pt_br),
            translation_status = IF(source_hash <> VALUES(source_hash), 'pending', translation_status),
            number = VALUES(number), name_en = VALUES(name_en), type_en = VALUES(type_en),
            prerelease_date = VALUES(prerelease_date), release_date = VALUES(release_date),
            allowed_in_tournaments_from_date = VALUES(allowed_in_tournaments_from_date),
            has_all_cards = VALUES(has_all_cards), allowed_in_formats_json = VALUES(allowed_in_formats_json),
            card_counts_json = VALUES(card_counts_json), active = 1, source_hash = VALUES(source_hash)
        SQL;

    $cardSql = <<<'SQL'
        INSERT INTO lorcana_cards (
            source_id, base_id, set_code, number, code, full_identifier,
            name_en, version_en, full_name_en, simple_name, type_en, color_en,
            colors_json, rarity_en, story_en, cost, inkwell, strength, willpower,
            lore, move_cost, max_copies_in_deck, subtypes_en_json, subtypes_text_en,
            keyword_abilities_en_json, abilities_en_json, effects_en_json, full_text_en,
            flavor_text_en, clarifications_en_json, errata_en_json, artists_json,
            artists_text, foil_types_json, variant, image_full_url, image_thumbnail_url,
            image_full_foil_url, images_json, allowed_in_formats_json,
            allowed_in_tournaments_from_date, source_payload_json, active, source_hash
        ) VALUES (
            :source_id, :base_id, :set_code, :number, :code, :full_identifier,
            :name_en, :version_en, :full_name_en, :simple_name, :type_en, :color_en,
            :colors_json, :rarity_en, :story_en, :cost, :inkwell, :strength, :willpower,
            :lore, :move_cost, :max_copies, :subtypes_json, :subtypes_text,
            :keywords_json, :abilities_json, :effects_json, :full_text,
            :flavor_text, :clarifications_json, :errata_json, :artists_json,
            :artists_text, :foil_types_json, :variant, :image_full, :image_thumbnail,
            :image_full_foil, :images_json, :formats_json, :tournament_date,
            :source_payload, 1, :source_hash
        ) ON DUPLICATE KEY UPDATE
            name_pt_br = IF(source_hash <> VALUES(source_hash), NULL, name_pt_br),
            version_pt_br = IF(source_hash <> VALUES(source_hash), NULL, version_pt_br),
            full_name_pt_br = IF(source_hash <> VALUES(source_hash), NULL, full_name_pt_br),
            type_pt_br = IF(source_hash <> VALUES(source_hash), NULL, type_pt_br),
            color_pt_br = IF(source_hash <> VALUES(source_hash), NULL, color_pt_br),
            rarity_pt_br = IF(source_hash <> VALUES(source_hash), NULL, rarity_pt_br),
            story_pt_br = IF(source_hash <> VALUES(source_hash), NULL, story_pt_br),
            subtypes_pt_br_json = IF(source_hash <> VALUES(source_hash), NULL, subtypes_pt_br_json),
            subtypes_text_pt_br = IF(source_hash <> VALUES(source_hash), NULL, subtypes_text_pt_br),
            keyword_abilities_pt_br_json = IF(source_hash <> VALUES(source_hash), NULL, keyword_abilities_pt_br_json),
            abilities_pt_br_json = IF(source_hash <> VALUES(source_hash), NULL, abilities_pt_br_json),
            effects_pt_br_json = IF(source_hash <> VALUES(source_hash), NULL, effects_pt_br_json),
            full_text_pt_br = IF(source_hash <> VALUES(source_hash), NULL, full_text_pt_br),
            flavor_text_pt_br = IF(source_hash <> VALUES(source_hash), NULL, flavor_text_pt_br),
            clarifications_pt_br_json = IF(source_hash <> VALUES(source_hash), NULL, clarifications_pt_br_json),
            errata_pt_br_json = IF(source_hash <> VALUES(source_hash), NULL, errata_pt_br_json),
            translation_status = IF(source_hash <> VALUES(source_hash), 'pending', translation_status),
            translation_engine = IF(source_hash <> VALUES(source_hash), NULL, translation_engine),
            translated_at = IF(source_hash <> VALUES(source_hash), NULL, translated_at),
            base_id = VALUES(base_id), set_code = VALUES(set_code), number = VALUES(number),
            code = VALUES(code), full_identifier = VALUES(full_identifier), name_en = VALUES(name_en),
            version_en = VALUES(version_en), full_name_en = VALUES(full_name_en),
            simple_name = VALUES(simple_name), type_en = VALUES(type_en), color_en = VALUES(color_en),
            colors_json = VALUES(colors_json), rarity_en = VALUES(rarity_en), story_en = VALUES(story_en),
            cost = VALUES(cost), inkwell = VALUES(inkwell), strength = VALUES(strength),
            willpower = VALUES(willpower), lore = VALUES(lore), move_cost = VALUES(move_cost),
            max_copies_in_deck = VALUES(max_copies_in_deck), subtypes_en_json = VALUES(subtypes_en_json),
            subtypes_text_en = VALUES(subtypes_text_en), keyword_abilities_en_json = VALUES(keyword_abilities_en_json),
            abilities_en_json = VALUES(abilities_en_json), effects_en_json = VALUES(effects_en_json),
            full_text_en = VALUES(full_text_en), flavor_text_en = VALUES(flavor_text_en),
            clarifications_en_json = VALUES(clarifications_en_json), errata_en_json = VALUES(errata_en_json),
            artists_json = VALUES(artists_json), artists_text = VALUES(artists_text),
            foil_types_json = VALUES(foil_types_json), variant = VALUES(variant),
            image_full_url = VALUES(image_full_url), image_thumbnail_url = VALUES(image_thumbnail_url),
            image_full_foil_url = VALUES(image_full_foil_url), images_json = VALUES(images_json),
            allowed_in_formats_json = VALUES(allowed_in_formats_json),
            allowed_in_tournaments_from_date = VALUES(allowed_in_tournaments_from_date),
            source_payload_json = VALUES(source_payload_json), active = 1, source_hash = VALUES(source_hash)
        SQL;

    $pdo->beginTransaction();
    $pdo->exec('UPDATE lorcana_cards SET active = 0');
    $pdo->exec('UPDATE lorcana_sets SET active = 0');
    $setStatement = $pdo->prepare($setSql);
    $cardStatement = $pdo->prepare($cardSql);

    $setCount = 0;
    foreach ($catalog['sets'] as $code => $set) {
        if (!is_array($set) || !isset($set['name'])) {
            continue;
        }
        $hash = hash('sha256', jsonValue($set) ?? '');
        $setStatement->execute([
            'code' => (string) $code,
            'number' => intValue($set, 'number'),
            'name_en' => (string) $set['name'],
            'type_en' => $set['type'] ?? null,
            'prerelease_date' => dateValue($set['prereleaseDate'] ?? null),
            'release_date' => dateValue($set['releaseDate'] ?? null),
            'tournament_date' => dateValue($set['allowedInTournamentsFromDate'] ?? null),
            'has_all_cards' => !empty($set['hasAllCards']) ? 1 : 0,
            'formats' => jsonValue($set['allowedInFormats'] ?? null),
            'counts' => jsonValue($set['cardCounts'] ?? null),
            'source_hash' => $hash,
        ]);
        $setCount++;
    }

    $cardCount = 0;
    foreach ($catalog['cards'] as $card) {
        if (!is_array($card) || !isset($card['id'], $card['setCode'], $card['name'], $card['type'])) {
            continue;
        }

        $payload = $card;
        unset($payload['externalLinks'], $payload['historicData']);
        $payloadJson = jsonValue($payload);
        $images = is_array($card['images'] ?? null) ? $card['images'] : [];

        $cardStatement->execute([
            'source_id' => (int) $card['id'],
            'base_id' => intValue($card, 'baseId'),
            'set_code' => (string) $card['setCode'],
            'number' => intValue($card, 'number'),
            'code' => $card['code'] ?? null,
            'full_identifier' => $card['fullIdentifier'] ?? null,
            'name_en' => (string) $card['name'],
            'version_en' => $card['version'] ?? null,
            'full_name_en' => (string) ($card['fullName'] ?? $card['name']),
            'simple_name' => $card['simpleName'] ?? null,
            'type_en' => (string) $card['type'],
            'color_en' => $card['color'] ?? null,
            'colors_json' => jsonValue($card['colors'] ?? null),
            'rarity_en' => $card['rarity'] ?? null,
            'story_en' => $card['story'] ?? null,
            'cost' => intValue($card, 'cost'),
            'inkwell' => !empty($card['inkwell']) ? 1 : 0,
            'strength' => intValue($card, 'strength'),
            'willpower' => intValue($card, 'willpower'),
            'lore' => intValue($card, 'lore'),
            'move_cost' => intValue($card, 'moveCost'),
            'max_copies' => intValue($card, 'maxCopiesInDeck'),
            'subtypes_json' => jsonValue($card['subtypes'] ?? null),
            'subtypes_text' => $card['subtypesText'] ?? null,
            'keywords_json' => jsonValue($card['keywordAbilities'] ?? null),
            'abilities_json' => jsonValue($card['abilities'] ?? null),
            'effects_json' => jsonValue($card['effects'] ?? null),
            'full_text' => $card['fullText'] ?? null,
            'flavor_text' => $card['flavorText'] ?? null,
            'clarifications_json' => jsonValue($card['clarifications'] ?? null),
            'errata_json' => jsonValue($card['errata'] ?? null),
            'artists_json' => jsonValue($card['artists'] ?? null),
            'artists_text' => $card['artistsText'] ?? null,
            'foil_types_json' => jsonValue($card['foilTypes'] ?? null),
            'variant' => $card['variant'] ?? null,
            'image_full' => $images['full'] ?? null,
            'image_thumbnail' => $images['thumbnail'] ?? null,
            'image_full_foil' => $images['fullFoil'] ?? null,
            'images_json' => jsonValue($images ?: null),
            'formats_json' => jsonValue($card['allowedInFormats'] ?? null),
            'tournament_date' => dateValue($card['allowedInTournamentsFromDate'] ?? null),
            'source_payload' => $payloadJson,
            'source_hash' => hash('sha256', $payloadJson ?? ''),
        ]);
        $cardCount++;

        if ($cardCount % 500 === 0) {
            logLine("{$cardCount} cartas processadas...");
        }
    }

    $stateStatement = $pdo->prepare(
        "UPDATE lorcana_sync_state SET
            source_generated_at = ?, format_version = ?, source_checksum = ?,
            last_checked_at = NOW(), last_synced_at = NOW(), last_status = 'success', last_error = NULL
         WHERE id = 1"
    );
    $stateStatement->execute([str_replace('T', ' ', $generatedAt), $formatVersion, $checksum]);
    $pdo->commit();
    // Os links acabaram de ser regravados pela fonte: reaplica as imagens substitutas.
    applyCardImageOverrides($pdo);
    // Cartas novas podem ser artes novas de cartas existentes.
    computePrintGroups($pdo);

    $finishStatement = $pdo->prepare(
        "UPDATE lorcana_sync_runs SET status = 'success', source_checksum = ?,
            sets_processed = ?, cards_processed = ?, finished_at = NOW() WHERE id = ?"
    );
    $finishStatement->execute([$checksum, $setCount, $cardCount, $runId]);
    logLine("Sincronizacao concluida: {$setCount} colecoes e {$cardCount} cartas.");
} catch (Throwable $exception) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }

    if ($runId !== null) {
        $stmt = $pdo->prepare(
            "UPDATE lorcana_sync_runs SET status = 'failed', error_message = ?, finished_at = NOW() WHERE id = ?"
        );
        $stmt->execute([$exception->getMessage(), $runId]);
    }
    $stmt = $pdo->prepare(
        "UPDATE lorcana_sync_state SET last_checked_at = NOW(), last_status = 'failed', last_error = ? WHERE id = 1"
    );
    $stmt->execute([$exception->getMessage()]);

    fwrite(STDERR, $exception->getMessage() . PHP_EOL);
    exit(1);
}

