<?php

declare(strict_types=1);

require_once __DIR__ . '/decks.php';
require_once dirname(__DIR__) . '/config/site_settings.php';
require_once __DIR__ . '/payload.php';

/** Public card detail only: never serialize a database row or source_payload_json. */
function gameCardDetail(array $row, string $language): array
{
    $card = cardSummary($row, $language);
    foreach (['original' => 'en', 'pt_br' => 'pt_br'] as $block => $suffix) {
        $text = [];
        foreach (['name', 'version', 'full_name', 'type', 'color', 'rarity', 'story', 'subtypes_text', 'full_text', 'flavor_text'] as $field) {
            $text[$field] = $row[$field . '_' . $suffix] ?? null;
        }
        foreach (['subtypes', 'keyword_abilities', 'abilities', 'effects', 'clarifications', 'errata'] as $field) {
            $text[$field] = decodeJson($row[$field . '_' . $suffix . '_json'] ?? null);
        }
        $card[$block] = $text;
    }
    $card['subtypes'] = $language === 'en'
        ? $card['original']['subtypes']
        : ($card['pt_br']['subtypes'] ?? $card['original']['subtypes']);
    $card['colors'] = colorsFromCard($row);
    $card['move_cost'] = $row['move_cost'] !== null ? (int) $row['move_cost'] : null;
    foreach (['artists', 'foil_types', 'allowed_in_formats'] as $field) {
        $card[$field] = decodeJson($row[$field . '_json'] ?? null);
    }
    $card['allowed_in_tournaments_from_date'] = $row['allowed_in_tournaments_from_date'];
    $card['translation_engine'] = $row['translation_engine'];
    $card['translated_at'] = $row['translated_at'];
    return $card;
}

/** Read and revalidate the owned deck without updating its saved validation. */
function loadGameDeck(PDO $pdo, int $deckId, int $userId, string $language): ?array
{
    $statement = $pdo->prepare('SELECT * FROM decks WHERE id=? AND usuario_id=? LIMIT 1');
    $statement->execute([$deckId, $userId]);
    $row = $statement->fetch();
    if (!$row) return null;

    // Read the saved references independently so unavailable cards still reach validation.
    $items = $pdo->prepare('SELECT card_source_id AS card_id, quantidade AS quantity FROM deck_cards WHERE deck_id=? ORDER BY card_source_id');
    $items->execute([$deckId]);
    $validated = validateDeckPayload($pdo, [
        'name' => $row['nome'], 'format' => $row['formato'], 'cards' => $items->fetchAll(),
    ]);

    $cards = $pdo->prepare('SELECT dc.quantidade, c.* FROM deck_cards dc JOIN lorcana_cards c ON c.source_id=dc.card_source_id WHERE dc.deck_id=? AND c.active=1 ORDER BY c.type_en,c.cost,c.full_name_en,c.source_id');
    $cards->execute([$deckId]);
    $deck = deckRowPayload($row);
    $deck['format'] = $validated['format'];
    $deck['status'] = $validated['validation']['valid'] ? 'valido' : 'rascunho';
    $deck['total_cards'] = $validated['total'];
    $deck['colors'] = $validated['colors'];
    $deck['validation'] = $validated['validation'];
    $deck['cards'] = array_map(static fn(array $card): array => [
        'quantity' => (int) $card['quantidade'], 'card' => gameCardDetail($card, $language),
    ], $cards->fetchAll());
    return $deck;
}

/** All active ordinary printings playable in at least one constructed format. */
function gameCatalog(PDO $pdo, string $language): array
{
    $rows = $pdo->query("SELECT * FROM lorcana_cards WHERE active=1 AND type_en IN ('Action','Character','Item','Location') ORDER BY source_id")->fetchAll();
    $formats = deckFormats();
    $legalNames = [];
    foreach ($rows as $row) {
        $allowed = decodeJson($row['allowed_in_formats_json']);
        foreach (['core' => 'Core', 'infinity' => 'Infinity'] as $key => $property) {
            if (($allowed[$property]['allowed'] ?? false) === true
                && !in_array($row['full_name_en'], $formats[$key]['banned_cards'], true)) {
                $legalNames[$row['full_name_en']] = true;
            }
        }
    }
    $cards = [];
    foreach ($rows as $row) {
        // A legal reprint makes earlier printings of the same full name playable.
        if (isset($legalNames[$row['full_name_en']])) $cards[] = gameCardDetail($row, $language);
    }
    return $cards;
}

function handleGameRoutes(PDO $pdo, array $segments, string $method): void
{
    if (($segments[1] ?? '') !== 'game') return;
    header('Cache-Control: no-store');
    $userId = requireUserId($pdo);
    try { $playEnabled = playerMayPlay(publicSiteSettings($pdo)['play_enabled'], loadCurrentUser($pdo)); }
    catch (Throwable) { $playEnabled = false; }
    if (!$playEnabled) {
        respond(['success' => false, 'error' => 'game_unavailable', 'message' => 'O acesso ao jogo está temporariamente desativado.'], 503);
    }
    if ($method !== 'GET') {
        header('Allow: GET');
        respond(['success' => false, 'error' => 'method_not_allowed'], 405);
    }
    $language = ($_GET['lang'] ?? '') === 'en' ? 'en' : 'pt-BR';
    if (count($segments) === 3 && $segments[2] === 'catalog') {
        respond(['success' => true, 'language' => $language, 'data' => gameCatalog($pdo, $language)]);
    }
    if (count($segments) === 4 && $segments[2] === 'decks' && ctype_digit($segments[3])) {
        $deckId = filter_var($segments[3], FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
        $deck = $deckId === false ? null : loadGameDeck($pdo, $deckId, $userId, $language);
        if ($deck === null) respond(['success' => false, 'error' => 'deck_not_found', 'message' => 'Deck nao encontrado.'], 404);
        if ($deck['format'] === 'pack_rush') {
            respond([
                'success' => false,
                'error' => 'unsupported_game_format',
                'message' => 'O formato Pack Rush ainda nao e suportado pelo jogo local.',
            ], 422);
        }
        respond(['success' => true, 'language' => $language, 'data' => $deck]);
    }
    respond(['success' => false, 'error' => 'endpoint_not_found'], 404);
}
