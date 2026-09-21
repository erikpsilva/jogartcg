<?php

declare(strict_types=1);

// This fixture router is never used by Apache/the application or shipped in releases.
if (PHP_SAPI !== 'cli-server') {
    http_response_code(404);
    exit;
}

require_once dirname(__DIR__, 2) . '/api/game.php';

function fixtureDatabase(string $scenario): PDO
{
    $pdo = new PDO('sqlite::memory:', null, null, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    $pdo->exec('CREATE TABLE usuarios (id INTEGER PRIMARY KEY, nome TEXT, sobrenome TEXT, email TEXT, foto_perfil TEXT, status TEXT, beta_tester INTEGER DEFAULT 0, session_version INTEGER DEFAULT 1)');
    $pdo->exec("INSERT INTO usuarios (id,nome,sobrenome,email,status) VALUES (7,'Fixture','Player','player@example.invalid','ativo'), (8,'Other','Player','other@example.invalid','ativo')");
    $base = [
        'source_id' => 1, 'set_code' => '1', 'number' => 1, 'cost' => 2,
        'inkwell' => 1, 'strength' => 2, 'willpower' => 3, 'lore' => 1,
        'move_cost' => null, 'max_copies_in_deck' => null, 'active' => 1,
        'colors_json' => '["Amber"]', 'artists_json' => '["Fixture Artist"]',
        'foil_types_json' => null,
        'allowed_in_formats_json' => '{"Core":{"allowed":true},"Infinity":{"allowed":true}}',
        'allowed_in_tournaments_from_date' => null,
        'image_full_url' => 'https://example.invalid/card.png',
        'image_thumbnail_url' => 'https://example.invalid/thumb.png',
        'image_full_foil_url' => null, 'translation_status' => 'reviewed',
        'translation_engine' => 'fixture', 'translated_at' => null,
        'source_payload_json' => 'INTERNAL_SENTINEL', 'source_hash' => 'HASH_SENTINEL',
    ];
    foreach (['en', 'pt_br'] as $suffix) {
        foreach (['name', 'version', 'full_name', 'type', 'color', 'rarity', 'story', 'subtypes_text', 'full_text', 'flavor_text'] as $field) {
            $base[$field . '_' . $suffix] = null;
        }
        foreach (['subtypes', 'keyword_abilities', 'abilities', 'effects', 'clarifications', 'errata'] as $field) {
            $base[$field . '_' . $suffix . '_json'] = null;
        }
    }
    $base = array_replace($base, [
        'name_en' => 'Hero', 'full_name_en' => 'Hero - 1', 'type_en' => 'Character',
        'color_en' => 'Amber', 'name_pt_br' => 'Heroi', 'full_name_pt_br' => 'Heroi - 1',
        'type_pt_br' => 'Personagem', 'full_text_en' => 'HELP Draw a card.',
        'full_text_pt_br' => 'AJUDA Compre uma carta.',
        'subtypes_en_json' => '["Hero"]', 'subtypes_pt_br_json' => '["Heroi"]',
        'keyword_abilities_en_json' => '["Ward"]',
        'abilities_en_json' => '[{"type":"activated","name":"HELP","costs":["exert"],"costsText":"exert","effect":"Draw a card.","fullText":"HELP Draw a card."}]',
        'effects_en_json' => '["Draw a card."]',
    ]);
    $columns = [];
    foreach ($base as $column => $value) {
        $columns[] = '"' . $column . '" ' . (in_array($column, ['source_id', 'active', 'cost', 'number'], true) ? 'INTEGER' : 'TEXT');
    }
    $pdo->exec('CREATE TABLE lorcana_cards (' . implode(',', $columns) . ')');
    $insert = $pdo->prepare('INSERT INTO lorcana_cards VALUES (' . implode(',', array_fill(0, count($base), '?')) . ')');
    for ($id = 1; $id <= 15; $id++) {
        $row = array_replace($base, ['source_id' => $id, 'full_name_en' => 'Hero - ' . $id]);
        $insert->execute(array_values($row));
    }
    $extras = [
        // Earlier printing of a legal name remains playable.
        ['source_id' => 16, 'allowed_in_formats_json' => '{"Core":{"allowed":false},"Infinity":{"allowed":false}}'],
        ['source_id' => 17, 'full_name_en' => 'Quest Only', 'allowed_in_formats_json' => '{"Core":{"allowed":false},"Infinity":{"allowed":false}}'],
        ['source_id' => 18, 'active' => 0],
        ['source_id' => 19, 'full_name_en' => 'Hiram Flaversham - Toymaker', 'allowed_in_formats_json' => '{"Core":{"allowed":false},"Infinity":{"allowed":true}}'],
        ['source_id' => 20, 'full_name_en' => 'Unknown Type', 'type_en' => 'Unknown'],
        ['source_id' => 21, 'full_name_en' => 'Fixture Song', 'type_en' => 'Action', 'subtypes_en_json' => '["Song"]', 'subtypes_pt_br_json' => '["Cancao"]'],
    ];
    foreach ($extras as $extra) $insert->execute(array_values(array_replace($base, $extra)));

    $pdo->exec('CREATE TABLE decks (id INTEGER, usuario_id INTEGER, nome TEXT, formato TEXT, status_validacao TEXT, total_cartas INTEGER, cores_json TEXT, validation_json TEXT, created_at TEXT, updated_at TEXT)');
    $pdo->exec('CREATE TABLE deck_cards (deck_id INTEGER, card_source_id INTEGER, quantidade INTEGER)');
    $pdo->prepare('INSERT INTO decks VALUES (?,?,?,?,?,?,?,?,?,?)')->execute([
        101, 7, 'Fixture Deck', 'core', 'rascunho', 1, '[]',
        '{"valid":false,"issues":["stale"]}', '2026-01-01', '2026-01-02',
    ]);
    for ($id = 1; $id <= 15; $id++) {
        $pdo->prepare('INSERT INTO deck_cards VALUES (101,?,4)')->execute([$id]);
    }
    if ($scenario === 'inactive') $pdo->exec('UPDATE lorcana_cards SET active=0 WHERE source_id=1');
    if ($scenario === 'missing') $pdo->exec('DELETE FROM lorcana_cards WHERE source_id=1');
    if ($scenario === 'untranslated') $pdo->exec('UPDATE lorcana_cards SET name_pt_br=NULL, full_name_pt_br=NULL, type_pt_br=NULL, subtypes_pt_br_json=NULL');
    if ($scenario === 'pack_rush') {
        $pdo->exec("UPDATE decks SET formato='pack_rush'");
        $pdo->exec('DELETE FROM deck_cards WHERE card_source_id>6');
    }
    if (in_array($scenario, ['play_disabled','beta_play_disabled','beta_revoked','inactive_beta'], true)) {
        initializeSiteSettings($pdo);
        savePlaySetting($pdo, false);
    }
    if (in_array($scenario, ['beta_play_disabled','inactive_beta'], true)) $pdo->exec('UPDATE usuarios SET beta_tester=1 WHERE id=7');
    if ($scenario === 'inactive_beta') $pdo->exec("UPDATE usuarios SET status='inativo' WHERE id=7");
    if ($scenario === 'deleted_player') $pdo->exec('DELETE FROM usuarios WHERE id=7');
    if ($scenario === 'password_revoked') $pdo->exec('UPDATE usuarios SET session_version=2 WHERE id=7');
    // Even the synthetic database rejects writes during the actual request.
    $pdo->exec('PRAGMA query_only=ON');
    return $pdo;
}

function fixtureSnapshot(PDO $pdo): string
{
    $data = [];
    foreach (['decks', 'deck_cards', 'lorcana_cards', 'usuarios'] as $table) {
        $data[$table] = $pdo->query('SELECT * FROM ' . $table . ' ORDER BY rowid')->fetchAll();
    }
    return hash('sha256', json_encode($data, JSON_THROW_ON_ERROR));
}

try {
    // Real requireUserId(), with synthetic sessions that never read/write session files.
    session_set_save_handler(new class implements SessionHandlerInterface {
        public function open(string $path, string $name): bool { return true; }
        public function close(): bool { return true; }
        public function read(string $id): string { return ''; }
        public function write(string $id, string $data): bool { return true; }
        public function destroy(string $id): bool { return true; }
        public function gc(int $max_lifetime): int { return 0; }
    }, true);
    session_start(['use_cookies' => 0, 'use_strict_mode' => 1, 'cache_limiter' => '']);
    $fixtureUser = $_SERVER['HTTP_X_FIXTURE_USER'] ?? '';
    if (in_array($fixtureUser, ['7', '8'], true)) $_SESSION['user_id'] = (int) $fixtureUser;

    $pdo = fixtureDatabase((string) ($_GET['fixture'] ?? ''));
    $before = fixtureSnapshot($pdo);
    ob_start(static function (string $body) use ($pdo, $before): string {
        $unchanged = hash_equals($before, fixtureSnapshot($pdo));
        header('X-Fixture-Unchanged: ' . ($unchanged ? '1' : '0'));
        if (!$unchanged) {
            http_response_code(500);
            return '{"success":false,"error":"fixture_mutated"}';
        }
        return $body;
    });
    header('Content-Type: application/json; charset=utf-8');
    // Ensure the handler itself overrides public caching; session startup cannot mask it.
    header('Cache-Control: public, max-age=300');
    $path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
    $segments = explode('/', trim((string) $path, '/'));
    if (array_shift($segments) !== 'api' || ($segments[0] ?? '') !== 'v1') {
        respond(['success' => false, 'error' => 'fixture_route_not_found'], 404);
    }
    handleGameRoutes($pdo, $segments, $_SERVER['REQUEST_METHOD']);
    respond(['success' => false, 'error' => 'endpoint_not_found'], 404);
} catch (Throwable) {
    respond(['success' => false, 'error' => 'fixture_failure'], 500);
}
