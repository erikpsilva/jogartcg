<?php

declare(strict_types=1);
require_once __DIR__ . '/decks.php';

function starterCatalog(): array
{
    static $catalog;
    return $catalog ??= array_column(require dirname(__DIR__) . '/config/starter_decks.php', null, 'id');
}

function starterCardRows(PDO $pdo, array $starters): array
{
    $ids = [];
    foreach ($starters as $starter) foreach ($starter['cards'] as $card) $ids[$card['card_id']] = true;
    if (!$ids) return [];
    $query = $pdo->prepare('SELECT * FROM lorcana_cards WHERE active=1 AND source_id IN (' . implode(',', array_fill(0, count($ids), '?')) . ')');
    $query->execute(array_keys($ids));
    return array_column($query->fetchAll(), null, 'source_id');
}

function starterPayload(array $starter, array $rows, bool $detail = false): array
{
    $missing = array_values(array_filter(array_column($starter['cards'], 'card_id'), static fn(int $id): bool => !isset($rows[$id])));
    $payload = array_diff_key($starter, ['cards' => true]);
    $payload['total_cards'] = array_sum(array_column($starter['cards'], 'quantity'));
    $payload['available'] = $missing === [] && $payload['total_cards'] === 60;
    $payload['missing_cards'] = $missing;
    if ($detail) $payload['cards'] = array_map(static fn(array $entry): array => $entry + [
        'card' => isset($rows[$entry['card_id']]) ? cardSummary($rows[$entry['card_id']], 'pt-BR') : null,
    ], $starter['cards']);
    return $payload;
}

/** Atomic, ownership-scoped and retry-safe. The client supplies only the starter ID. */
function collectStarter(PDO $pdo, int $userId, array $starter): array
{
    $validated = validateDeckPayload($pdo, [
        'name' => mb_substr('Starter · ' . $starter['name'], 0, 100),
        'format' => 'preconstructed', 'cards' => $starter['cards'],
    ]);
    if ($validated['errors'] !== [] || $validated['total'] !== 60) {
        throw new DomainException('Algumas cartas ainda não estão disponíveis no catálogo. Atualize o catálogo antes de importar este deck.');
    }
    $pdo->beginTransaction();
    try {
        // Serialize imports for this account, including requests from different sessions.
        $lock = $pdo->prepare('SELECT id FROM usuarios WHERE id=? FOR UPDATE');
        $lock->execute([$userId]);
        if (!$lock->fetchColumn()) throw new OutOfBoundsException('user_not_found');
        $existing = $pdo->prepare('SELECT s.deck_id FROM starter_deck_collection s JOIN decks d ON d.id=s.deck_id AND d.usuario_id=s.usuario_id WHERE s.usuario_id=? AND s.starter_id=?');
        $existing->execute([$userId, $starter['id']]);
        $id = $existing->fetchColumn();
        if ($id) { $pdo->commit(); return ['deck_id' => (int) $id, 'created' => false]; }
        $insert = $pdo->prepare('INSERT INTO decks (usuario_id,nome,formato,status_validacao,total_cartas,cores_json,validation_json) VALUES (?,?,?,?,?,?,?)');
        $insert->execute([$userId, $validated['name'], $validated['format'], 'valido', 60,
            json_encode($validated['colors'], JSON_THROW_ON_ERROR), json_encode($validated['validation'], JSON_THROW_ON_ERROR)]);
        $id = (int) $pdo->lastInsertId();
        $cards = $pdo->prepare('INSERT INTO deck_cards (deck_id,card_source_id,quantidade) VALUES (?,?,?)');
        foreach ($validated['cards'] as $entry) $cards->execute([$id, $entry['card_id'], $entry['quantity']]);
        $pdo->prepare('INSERT INTO starter_deck_collection (usuario_id,starter_id,deck_id) VALUES (?,?,?)')->execute([$userId, $starter['id'], $id]);
        $pdo->commit();
        return ['deck_id' => $id, 'created' => true];
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $error;
    }
}

function handleStarterRoutes(PDO $pdo, array $segments, string $method): void
{
    if (($segments[1] ?? '') !== 'starter-decks') return;
    header('Cache-Control: no-store');
    $catalog = starterCatalog();
    if (count($segments) === 2 && $method === 'GET') {
        $rows = starterCardRows($pdo, $catalog);
        respond(['success' => true, 'data' => array_values(array_map(static fn(array $deck): array => starterPayload($deck, $rows), $catalog))]);
    }
    $starter = $catalog[$segments[2] ?? ''] ?? null;
    if (!$starter) respond(['success' => false, 'error' => 'starter_not_found', 'message' => 'Starter Deck não encontrado.'], 404);
    if (count($segments) === 3 && $method === 'GET') {
        respond(['success' => true, 'data' => starterPayload($starter, starterCardRows($pdo, [$starter]), true)]);
    }
    if (count($segments) === 4 && $segments[3] === 'collect' && $method === 'POST') {
        $userId = requireUserId($pdo);
        requireCsrf();
        try {
            $result = collectStarter($pdo, $userId, $starter);
        } catch (DomainException $error) {
            respond(['success' => false, 'error' => 'starter_unavailable', 'message' => $error->getMessage()], 409);
        } catch (Throwable $error) {
            error_log('Starter collection: ' . $error->getMessage());
            respond(['success' => false, 'error' => 'collection_unavailable', 'message' => 'Não foi possível salvar o deck. Tente novamente em instantes.'], 503);
        }
        respond(['success' => true, 'data' => $result], $result['created'] ? 201 : 200);
    }
    respond(['success' => false, 'error' => 'method_not_allowed'], 405);
}
