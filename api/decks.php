<?php

declare(strict_types=1);

require_once __DIR__ . '/session.php';
require_once dirname(__DIR__) . '/config/deck_formats.php';

function colorsFromCard(array $card): array
{
    $colors = decodeJson($card['colors_json'] ?? null);
    if (is_array($colors) && $colors !== []) return array_values(array_filter(array_map('strval', $colors)));
    return $card['color_en'] ? preg_split('/\s*[-+]\s*/', (string) $card['color_en']) ?: [] : [];
}

function formatAllowsCard(PDO $pdo, array $card, string $formatKey): bool
{
    if (!in_array($formatKey, ['core', 'infinity'], true)) return true;
    $property = $formatKey === 'core' ? 'Core' : 'Infinity';
    $allowed = decodeJson($card['allowed_in_formats_json'] ?? null);
    if (($allowed[$property]['allowed'] ?? false) === true) return true;

    // Uma reimpressao legal torna qualquer impressao do mesmo nome completo legal.
    $statement = $pdo->prepare('SELECT allowed_in_formats_json FROM lorcana_cards WHERE active=1 AND full_name_en=?');
    $statement->execute([$card['full_name_en']]);
    foreach ($statement->fetchAll(PDO::FETCH_COLUMN) as $json) {
        $printing = decodeJson(is_string($json) ? $json : null);
        if (($printing[$property]['allowed'] ?? false) === true) return true;
    }
    return false;
}

function validateDeckPayload(PDO $pdo, array $payload): array
{
    $name = trim((string) ($payload['name'] ?? ''));
    $format = deckFormat((string) ($payload['format'] ?? 'core'));
    $rawCards = is_array($payload['cards'] ?? null) ? $payload['cards'] : [];
    $errors = [];
    if ($name === '' || mb_strlen($name) > 100) $errors[] = 'Informe um nome de deck com ate 100 caracteres.';
    if ($format === null) { $errors[] = 'Formato de deck invalido.'; $format = deckFormats()['core']; }

    $quantities = [];
    foreach ($rawCards as $entry) {
        if (!is_array($entry)) continue;
        $id = (int) ($entry['card_id'] ?? $entry['id'] ?? 0);
        $quantity = (int) ($entry['quantity'] ?? $entry['quantidade'] ?? 0);
        if ($id > 0 && $quantity > 0) $quantities[$id] = ($quantities[$id] ?? 0) + $quantity;
    }
    if (count($quantities) > 500) $errors[] = 'O deck possui cartas diferentes demais para ser processado.';

    $cards = [];
    if ($quantities !== []) {
        $placeholders = implode(',', array_fill(0, count($quantities), '?'));
        $statement = $pdo->prepare("SELECT * FROM lorcana_cards WHERE active=1 AND source_id IN ({$placeholders})");
        $statement->execute(array_keys($quantities));
        foreach ($statement->fetchAll() as $card) $cards[(int) $card['source_id']] = $card;
    }

    $normalized = []; $colors = []; $copiesByFullName = []; $total = 0;
    foreach ($quantities as $id => $quantity) {
        if (!isset($cards[$id])) { $errors[] = "A carta #{$id} nao existe mais no catalogo."; continue; }
        $card = $cards[$id]; $fullName = (string) $card['full_name_en'];
        $copiesByFullName[$fullName] = ($copiesByFullName[$fullName] ?? 0) + $quantity;
        $normalized[] = ['card_id' => $id, 'quantity' => $quantity];
        $total += $quantity;
        foreach (colorsFromCard($card) as $color) $colors[(string) $color] = true;
        if (!formatAllowsCard($pdo, $card, $format['key'])) $errors[] = "{$fullName} nao esta legal no formato {$format['label']}.";
        if (in_array($fullName, $format['banned_cards'], true)) $errors[] = "{$fullName} esta banida no formato {$format['label']}.";
    }

    if ($format['maximum_copies'] !== null) {
        foreach ($copiesByFullName as $fullName => $quantity) {
            $limit = (int) $format['maximum_copies'];
            foreach ($cards as $card) {
                if ($card['full_name_en'] === $fullName && $card['max_copies_in_deck'] !== null) $limit = max($limit, (int) $card['max_copies_in_deck']);
            }
            if ($quantity > $limit) $errors[] = "{$fullName} permite no maximo {$limit} copia(s), somando todas as impressoes.";
        }
    }

    $ruleIssues = [];
    if ($total < $format['minimum_cards']) $ruleIssues[] = 'Adicione mais ' . ($format['minimum_cards'] - $total) . " carta(s) para atingir o minimo de {$format['minimum_cards']}.";
    if ($format['maximum_cards'] !== null && $total > $format['maximum_cards']) $ruleIssues[] = "O formato {$format['label']} usa exatamente {$format['maximum_cards']} cartas.";
    if ($format['maximum_colors'] !== null && count($colors) > $format['maximum_colors']) $ruleIssues[] = "O formato {$format['label']} permite no maximo {$format['maximum_colors']} cores de tinta.";

    return [
        'name' => $name, 'format' => $format['key'], 'cards' => $normalized,
        'colors' => array_keys($colors), 'total' => $total, 'errors' => array_values(array_unique($errors)),
        'validation' => [
            'valid' => $errors === [] && $ruleIssues === [],
            'issues' => array_values(array_unique(array_merge($errors, $ruleIssues))),
            'format' => $format, 'checked_at' => gmdate('c'),
        ],
    ];
}

function deckRowPayload(array $row): array
{
    return [
        'id' => (int) $row['id'], 'name' => $row['nome'], 'format' => $row['formato'],
        'status' => $row['status_validacao'], 'total_cards' => (int) $row['total_cartas'],
        'colors' => decodeJson($row['cores_json']) ?: [],
        'validation' => decodeJson($row['validation_json']) ?: ['valid' => false, 'issues' => []],
        'created_at' => $row['created_at'], 'updated_at' => $row['updated_at'],
    ];
}

function loadDeck(PDO $pdo, int $deckId, int $userId): ?array
{
    $statement = $pdo->prepare('SELECT * FROM decks WHERE id=? AND usuario_id=? LIMIT 1');
    $statement->execute([$deckId, $userId]); $row = $statement->fetch();
    if (!$row) return null;
    $payload = deckRowPayload($row);
    $cardsStatement = $pdo->prepare('SELECT dc.quantidade,c.* FROM deck_cards dc JOIN lorcana_cards c ON c.source_id=dc.card_source_id WHERE dc.deck_id=? ORDER BY c.type_en,c.cost,c.full_name_en');
    $cardsStatement->execute([$deckId]);
    $payload['cards'] = array_map(static fn(array $card): array => ['quantity' => (int) $card['quantidade'], 'card' => cardSummary($card, 'pt-BR')], $cardsStatement->fetchAll());
    return $payload;
}

function persistDeck(PDO $pdo, ?int $deckId, int $userId, array $validated): int
{
    $validationJson = json_encode($validated['validation'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    $colorsJson = json_encode($validated['colors'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    $status = $validated['validation']['valid'] ? 'valido' : 'rascunho';
    $pdo->beginTransaction();
    try {
        if ($deckId === null) {
            $statement = $pdo->prepare('INSERT INTO decks (usuario_id,nome,formato,status_validacao,total_cartas,cores_json,validation_json) VALUES (?,?,?,?,?,?,?)');
            $statement->execute([$userId, $validated['name'], $validated['format'], $status, $validated['total'], $colorsJson, $validationJson]);
            $deckId = (int) $pdo->lastInsertId();
        } else {
            $owner = $pdo->prepare('SELECT 1 FROM decks WHERE id=? AND usuario_id=?'); $owner->execute([$deckId, $userId]);
            if (!$owner->fetchColumn()) throw new OutOfBoundsException('deck_not_found');
            $statement = $pdo->prepare('UPDATE decks SET nome=?,formato=?,status_validacao=?,total_cartas=?,cores_json=?,validation_json=? WHERE id=? AND usuario_id=?');
            $statement->execute([$validated['name'], $validated['format'], $status, $validated['total'], $colorsJson, $validationJson, $deckId, $userId]);
            $pdo->prepare('DELETE FROM deck_cards WHERE deck_id=?')->execute([$deckId]);
        }
        $insert = $pdo->prepare('INSERT INTO deck_cards (deck_id,card_source_id,quantidade) VALUES (?,?,?)');
        foreach ($validated['cards'] as $entry) $insert->execute([$deckId, $entry['card_id'], $entry['quantity']]);
        $pdo->commit(); return $deckId;
    } catch (Throwable $exception) { if ($pdo->inTransaction()) $pdo->rollBack(); throw $exception; }
}

function duplicateDeck(PDO $pdo, int $deckId, int $userId): ?int
{
    $deck = loadDeck($pdo, $deckId, $userId); if (!$deck) return null;
    $validated = validateDeckPayload($pdo, [
        'name' => mb_substr($deck['name'] . ' (copia)', 0, 100), 'format' => $deck['format'],
        'cards' => array_map(static fn(array $entry): array => ['card_id' => $entry['card']['id'], 'quantity' => $entry['quantity']], $deck['cards']),
    ]);
    return persistDeck($pdo, null, $userId, $validated);
}

function importItemsFromContent(string $content): array
{
    $content = trim($content); if ($content === '') return [];
    $decoded = json_decode($content, true); $items = [];
    if (is_array($decoded)) {
        $source = isset($decoded['cards']) && is_array($decoded['cards']) ? $decoded['cards'] : $decoded;
        foreach ($source as $key => $item) {
            if (is_numeric($item) && is_string($key)) { $items[] = ['quantity' => (int) $item, 'identifier' => $key]; continue; }
            if (!is_array($item)) continue;
            $items[] = [
                'quantity' => (int) ($item['quantity'] ?? $item['count'] ?? $item['qty'] ?? 1),
                'id' => (int) ($item['card_id'] ?? $item['id'] ?? $item['source_id'] ?? 0),
                'identifier' => trim((string) ($item['identifier'] ?? $item['full_identifier'] ?? $item['cardNumber'] ?? '')),
                'set' => trim((string) ($item['set_code'] ?? $item['set'] ?? '')),
                'number' => (int) ($item['number'] ?? 0),
                'name' => trim((string) ($item['full_name'] ?? $item['full_name_en'] ?? $item['name'] ?? $item['card'] ?? '')),
            ];
        }
        return $items;
    }
    $lines = preg_split('/\R/', $content) ?: [];
    if ($lines !== [] && preg_match('/^(?:quantity|qty)[,;]/i', trim($lines[0]))) {
        $delimiter = str_contains($lines[0], ';') ? ';' : ',';
        $headers = array_map(static fn(string $value): string => strtolower(trim($value)), str_getcsv(array_shift($lines), $delimiter));
        foreach ($lines as $line) {
            $values = str_getcsv($line, $delimiter); if (count($values) < 2) continue;
            $row = array_combine($headers, array_pad($values, count($headers), '')); if (!is_array($row)) continue;
            $items[] = [
                'quantity' => (int) ($row['quantity'] ?? $row['qty'] ?? 1),
                'id' => (int) ($row['card_id'] ?? $row['id'] ?? 0),
                'identifier' => trim((string) ($row['identifier'] ?? $row['full_identifier'] ?? '')),
                'set' => trim((string) ($row['set'] ?? $row['set_code'] ?? '')), 'number' => (int) ($row['number'] ?? 0),
                'name' => trim((string) ($row['name'] ?? $row['card'] ?? $row['full_name'] ?? '')),
            ];
        }
        return $items;
    }
    foreach ($lines as $line) {
        $line = trim($line, " \t\n\r\0\x0B,;");
        if ($line === '' || str_starts_with($line, '#') || preg_match('/^(deck|cards?|main deck|sideboard)\s*:?$/i', $line)) continue;
        if (preg_match('/^(?:\"?quantity\"?[,;]|qty[,;])/i', $line)) continue;
        $quantity = 1;
        if (preg_match('/^(\d+)\s*(?:x|[,;])?\s+(.+?)$/iu', $line, $matches)) { $quantity = (int) $matches[1]; $line = trim($matches[2]); }
        elseif (preg_match('/^(\d+)\s*[,;]\s*(.+)$/u', $line, $matches)) { $quantity = (int) $matches[1]; $line = trim($matches[2], " \t\""); }
        // Quantidade no fim, usada por alguns sites: "Nome x4" ou "Nome (4)".
        elseif (preg_match('/^(.+?)\s+[x×]\s*(\d+)$/iu', $line, $matches) || preg_match('/^(.+?)\s*\((\d+)\)$/u', $line, $matches)) { $quantity = (int) $matches[2]; $line = trim($matches[1]); }
        $set = ''; $number = 0;
        if (preg_match('/\(([A-Za-z0-9]+)\)\s*#?(\d+)\s*$/', $line, $match)) { $set = $match[1]; $number = (int) $match[2]; $line = trim(substr($line, 0, -strlen($match[0]))); }
        $items[] = ['quantity' => $quantity, 'name' => trim($line, " \t\""), 'set' => $set, 'number' => $number];
    }
    return $items;
}

function importDreambornUrl(string $url): array
{
    $parts = parse_url($url);
    if (($parts['scheme'] ?? '') !== 'https' || strtolower((string) ($parts['host'] ?? '')) !== 'dreamborn.ink' || !preg_match('#^/decks/[A-Za-z0-9_-]+/?$#', (string) ($parts['path'] ?? ''))) throw new InvalidArgumentException('Use um link publico de deck do Dreamborn.ink.');
    $context = stream_context_create(['http' => ['timeout' => 10, 'user_agent' => 'JogarTCG/1.0', 'follow_location' => 0], 'ssl' => ['verify_peer' => true, 'verify_peer_name' => true]]);
    $html = @file_get_contents($url, false, $context, 0, 2 * 1024 * 1024);
    if (!is_string($html) || $html === '') throw new RuntimeException('Nao foi possivel ler esse deck publico.');
    if (preg_match_all('/\"([A-Za-z0-9+\/=]{100,})\"/', $html, $matches)) {
        foreach ($matches[1] as $candidate) {
            $decoded = base64_decode($candidate, true);
            if (!is_string($decoded) || !preg_match('/\$\d+\|/', $decoded)) continue;
            $items = [];
            foreach (explode('|', $decoded) as $entry) if (preg_match('/^(.+)\$(\d+)$/', $entry, $parts)) $items[] = ['quantity' => (int) $parts[2], 'name' => str_replace('_', ' - ', $parts[1])];
            if ($items !== []) return $items;
        }
    }
    throw new RuntimeException('O Dreamborn nao publicou uma lista legivel nesse link.');
}

function normalizedCardName(string $value): string
{
    return preg_replace('/[^a-z0-9]+/', '', strtolower(iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $value) ?: $value)) ?? '';
}

/**
 * Resolve linhas importadas em cartas do catalogo.
 *
 * Coleção + número NAO identifica uma carta sozinho: as impressoes promocionais
 * (7/P2, 7/C1) repetem a colecao e o numero da carta normal (7/204). Por isso o
 * nome manda, e colecao/numero servem so para escolher entre impressoes do mesmo
 * nome. Sem nome, vale a impressao normal da colecao.
 */
function resolveImportItems(PDO $pdo, array $items): array
{
    $resolved = []; $unmatched = [];
    $byId = $pdo->prepare('SELECT * FROM lorcana_cards WHERE active=1 AND source_id=? LIMIT 1');
    // Impressao normal da colecao ("7/204") antes das promocionais ("7/P2").
    $bySetNumber = $pdo->prepare("SELECT * FROM lorcana_cards WHERE active=1 AND set_code=? AND number=? ORDER BY (full_identifier REGEXP '^[0-9]+/[0-9]+ ') DESC, source_id");
    $byIdentifier = $pdo->prepare("SELECT * FROM lorcana_cards WHERE active=1 AND REPLACE(REPLACE(full_identifier, '·', '•'), ' ', '') = ? LIMIT 1");
    $byFullName = $pdo->prepare('SELECT * FROM lorcana_cards WHERE active=1 AND (full_name_en=? OR full_name_pt_br=?) ORDER BY source_id LIMIT 1');
    $versionsOf = $pdo->prepare('SELECT DISTINCT full_name_en FROM lorcana_cards WHERE active=1 AND (name_en=? OR name_pt_br=?) LIMIT 3');
    $normalizedNames = null;
    foreach ($items as $item) {
        $quantity = max(0, (int) ($item['quantity'] ?? 0)); if ($quantity < 1) continue;
        $card = false; $id = (int) ($item['id'] ?? 0);
        if ($id > 0) { $byId->execute([$id]); $card = $byId->fetch(); }
        $identifier = (string) ($item['identifier'] ?? ''); $set = (string) ($item['set'] ?? ''); $number = (int) ($item['number'] ?? 0);
        // Identificador completo ("7/204 • EN • 5", "1 TFC • EN • 1/P1"): o formato varia
        // entre impressoes, entao tenta o valor exato antes de interpretar "colecao-numero".
        if (!$card && $identifier !== '') { $byIdentifier->execute([str_replace([' ', '·'], ['', '•'], $identifier)]); $card = $byIdentifier->fetch(); }
        if (!$card && preg_match('/^0*([A-Za-z0-9]+)[-\/]0*(\d+)$/', $identifier, $match)) { $set = $match[1]; $number = (int) $match[2]; }
        $printings = [];
        if (!$card && $set !== '' && $number > 0) { $bySetNumber->execute([ltrim($set, '0') ?: '0', $number]); $printings = $bySetNumber->fetchAll(); }

        $name = preg_replace('/\s+[\[(].*?[\])]\s*$/u', '', trim((string) ($item['name'] ?? ''))) ?: '';
        $named = false;
        if (!$card && $name !== '') {
            $byFullName->execute([$name, $name]); $named = $byFullName->fetch();
            if (!$named) {
                if ($normalizedNames === null) {
                    $normalizedNames = [];
                    foreach ($pdo->query('SELECT * FROM lorcana_cards WHERE active=1 ORDER BY source_id')->fetchAll() as $candidate) {
                        foreach (['full_name_en', 'full_name_pt_br'] as $column) {
                            $value = (string) ($candidate[$column] ?? '');
                            if ($value !== '') $normalizedNames[normalizedCardName($value)] ??= $candidate;
                        }
                    }
                }
                $named = $normalizedNames[normalizedCardName($name)] ?? false;
            }
            if (!$named) {
                // So o nome base ("Stitch"): aceita apenas se existir uma unica versao.
                $versionsOf->execute([$name, $name]); $versions = $versionsOf->fetchAll(PDO::FETCH_COLUMN);
                if (count($versions) === 1) { $byFullName->execute([$versions[0], $versions[0]]); $named = $byFullName->fetch(); }
                elseif (count($versions) > 1) { $unmatched[] = "{$quantity}x {$name} (informe a versão, ex.: {$versions[0]})"; continue; }
            }
        }

        if (!$card && $named) {
            // Colecao/numero so escolhe a impressao certa entre as que tem este nome.
            $card = $named;
            foreach ($printings as $printing) {
                if (normalizedCardName((string) $printing['full_name_en']) === normalizedCardName((string) $named['full_name_en'])) { $card = $printing; break; }
            }
        } elseif (!$card && $printings && $name === '') {
            $card = $printings[0];
        }
        if (!$card) { $unmatched[] = $quantity . 'x ' . ($name ?: $identifier ?: ($set !== '' ? "coleção {$set} nº {$number}" : "carta #{$id}")); continue; }
        $cardId = (int) $card['source_id'];
        if (!isset($resolved[$cardId])) $resolved[$cardId] = ['quantity' => 0, 'card' => cardSummary($card, 'pt-BR')];
        $resolved[$cardId]['quantity'] += $quantity;
    }
    return ['cards' => array_values($resolved), 'unmatched' => array_values(array_unique($unmatched))];
}

function exportDeckPayload(array $deck, string $type): array
{
    $safeName = trim(preg_replace('/[^a-z0-9_-]+/i', '-', strtolower($deck['name'])) ?: 'deck', '-'); $rows = $deck['cards'];
    if ($type === 'json' || $type === 'dek') {
        $data = ['schema' => 'jogartcg-deck/v1', 'name' => $deck['name'], 'format' => $deck['format'], 'cards' => array_map(static fn(array $entry): array => ['quantity' => $entry['quantity'], 'card_id' => $entry['card']['id'], 'set_code' => $entry['card']['set_code'], 'number' => $entry['card']['number'], 'full_name' => $entry['card']['full_name']], $rows)];
        return ['filename' => $safeName . '.' . $type, 'mime_type' => 'application/json', 'content' => json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)];
    }
    if ($type === 'csv') {
        // card_id e identifier distinguem impressoes que dividem colecao, numero e nome.
        $lines = ['quantity,set,number,name,card_id,identifier'];
        $quote = static fn(?string $value): string => '"' . str_replace('"', '""', (string) $value) . '"';
        foreach ($rows as $entry) $lines[] = implode(',', [$entry['quantity'], $entry['card']['set_code'], $entry['card']['number'], $quote($entry['card']['full_name']), $entry['card']['id'], $quote($entry['card']['full_identifier'] ?? '')]);
        return ['filename' => $safeName . '.csv', 'mime_type' => 'text/csv;charset=utf-8', 'content' => implode("\r\n", $lines)];
    }
    return ['filename' => $safeName . '.txt', 'mime_type' => 'text/plain;charset=utf-8', 'content' => implode("\r\n", array_map(static fn(array $entry): string => $entry['quantity'] . ' ' . $entry['card']['full_name'], $rows))];
}

function handleDeckRoutes(PDO $pdo, array $segments, string $method): void
{
    if (($segments[1] ?? '') !== 'decks') return;
    header('Cache-Control: no-store'); $third = $segments[2] ?? ''; $fourth = $segments[3] ?? '';
    if ($third === 'formats' && $method === 'GET') respond(['success' => true, 'data' => array_values(deckFormats()), 'rules_updated_at' => '2026-07-14']);
    $userId = requireUserId($pdo);
    if ($third === 'import' && $method === 'POST') {
        requireCsrf(); $payload = readRequestPayload();
        try { $items = !empty($payload['url']) ? importDreambornUrl(trim((string) $payload['url'])) : importItemsFromContent((string) ($payload['content'] ?? '')); respond(['success' => true, 'data' => resolveImportItems($pdo, $items)]); }
        catch (InvalidArgumentException|RuntimeException $exception) { respond(['success' => false, 'error' => 'import_failed', 'message' => $exception->getMessage()], 422); }
    }
    if ($method === 'GET' && $third === '') { $statement = $pdo->prepare('SELECT * FROM decks WHERE usuario_id=? ORDER BY updated_at DESC,id DESC'); $statement->execute([$userId]); respond(['success' => true, 'data' => array_map('deckRowPayload', $statement->fetchAll())]); }
    if ($method === 'GET' && ctype_digit($third) && $fourth === 'export') { $deck = loadDeck($pdo, (int) $third, $userId); if (!$deck) respond(['success' => false, 'error' => 'deck_not_found'], 404); $type = in_array($_GET['type'] ?? 'txt', ['txt','csv','json','dek'], true) ? (string) $_GET['type'] : 'txt'; respond(['success' => true, 'data' => exportDeckPayload($deck, $type)]); }
    if ($method === 'GET' && ctype_digit($third) && $fourth === '') { $deck = loadDeck($pdo, (int) $third, $userId); if (!$deck) respond(['success' => false, 'error' => 'deck_not_found', 'message' => 'Deck nao encontrado.'], 404); respond(['success' => true, 'data' => $deck]); }
    if ($method === 'POST' && ctype_digit($third) && $fourth === 'duplicate') { requireCsrf(); $newId = duplicateDeck($pdo, (int) $third, $userId); if ($newId === null) respond(['success' => false, 'error' => 'deck_not_found'], 404); respond(['success' => true, 'message' => 'Deck duplicado com sucesso.', 'data' => loadDeck($pdo, $newId, $userId)], 201); }
    if (($method === 'POST' && $third === '') || ($method === 'PUT' && ctype_digit($third) && $fourth === '')) {
        requireCsrf(); $validated = validateDeckPayload($pdo, readRequestPayload());
        if ($validated['errors'] !== []) respond(['success' => false, 'error' => 'validation_failed', 'message' => 'O deck possui cartas ilegais para o formato escolhido.', 'errors' => $validated['errors'], 'validation' => $validated['validation']], 422);
        try { $deckId = persistDeck($pdo, $method === 'PUT' ? (int) $third : null, $userId, $validated); } catch (OutOfBoundsException) { respond(['success' => false, 'error' => 'deck_not_found'], 404); }
        respond(['success' => true, 'message' => $method === 'POST' ? 'Deck salvo com sucesso.' : 'Deck atualizado com sucesso.', 'data' => loadDeck($pdo, $deckId, $userId)], $method === 'POST' ? 201 : 200);
    }
    if ($method === 'DELETE' && ctype_digit($third) && $fourth === '') { requireCsrf(); $statement = $pdo->prepare('DELETE FROM decks WHERE id=? AND usuario_id=?'); $statement->execute([(int) $third, $userId]); if ($statement->rowCount() === 0) respond(['success' => false, 'error' => 'deck_not_found'], 404); respond(['success' => true, 'message' => 'Deck excluido.']); }
    respond(['success' => false, 'error' => 'endpoint_not_found'], 404);
}
