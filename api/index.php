<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/config/database.php';
require_once dirname(__DIR__) . '/config/lorcana.php';
require_once __DIR__ . '/payload.php';
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/decks.php';
require_once __DIR__ . '/game.php';
require_once dirname(__DIR__) . '/config/site_settings.php';

header('Content-Type: application/json; charset=utf-8');
$origin = (string) ($_SERVER['HTTP_ORIGIN'] ?? '');
$allowedOrigins = [
    'http://localhost', 'http://localhost:3000', 'http://localhost:5173',
    'http://127.0.0.1', 'http://127.0.0.1:3000', 'http://127.0.0.1:5173',
    'capacitor://localhost', 'https://localhost', 'https://www.jogartcg.com.br',
];
if ($origin !== '' && in_array(rtrim($origin, '/'), $allowedOrigins, true)) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Vary: Origin');
}
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Accept, Content-Type, X-CSRF-Token');
header('Cache-Control: public, max-age=300');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$requestMethod = $_SERVER['REQUEST_METHOD'];

// O catalogo continua somente leitura. POST existe apenas para /auth.
if (!in_array($requestMethod, ['GET', 'POST', 'PUT', 'DELETE'], true)) {
    respond(['success' => false, 'error' => 'method_not_allowed'], 405);
}

function filterOptions(PDO $pdo, string $column, string $language): array
{
    $allowedColumns = ['color', 'type', 'rarity'];
    if (!in_array($column, $allowedColumns, true)) {
        return [];
    }

    $rows = $pdo->query(
        "SELECT DISTINCT {$column}_en AS english, {$column}_pt_br AS portuguese
         FROM lorcana_cards
         WHERE active = 1 AND {$column}_en IS NOT NULL AND {$column}_en <> ''"
    )->fetchAll();

    $options = [];
    foreach ($rows as $row) {
        $label = localized($row['english'], $row['portuguese'], $language);
        if ($column === 'color' && $language !== 'en') {
            $label = str_replace(
                ['Amber', 'Amethyst', 'Emerald', 'Ruby', 'Sapphire', 'Steel', '-'],
                ['Âmbar', 'Ametista', 'Esmeralda', 'Rubi', 'Safira', 'Aço', ' + '],
                (string) $row['english']
            );
        }
        if ($label !== null && $label !== '') {
            $options[$row['english']] = ['value' => $row['english'], 'label' => $label];
        }
    }
    uasort($options, static fn(array $left, array $right): int => strnatcasecmp($left['label'], $right['label']));
    return array_values($options);
}

$requestPath = parse_url($_SERVER['REQUEST_URI'] ?? '/api/v1', PHP_URL_PATH) ?: '/api/v1';
$apiPosition = strpos($requestPath, '/api/');
$route = $apiPosition === false ? '' : trim(substr($requestPath, $apiPosition + 5), '/');
$segments = $route === '' ? [] : explode('/', $route);

if (($segments[0] ?? '') !== 'v1') {
    respond([
        'success' => true,
        'name' => 'Jogar TCG Lorcana API',
        'version' => 'v1',
        'endpoints' => [
            '/api/v1/status',
            '/api/v1/settings',
            '/api/v1/sets',
            '/api/v1/filters',
            '/api/v1/cards',
            '/api/v1/cards/{id}',
            '/api/v1/auth/register',
            '/api/v1/auth/available',
            '/api/v1/decks/formats',
            '/api/v1/decks',
            '/api/v1/decks/{id}',
            '/api/v1/decks/{id}/duplicate',
            '/api/v1/decks/{id}/export',
            '/api/v1/decks/import',
            '/api/v1/game/decks/{id}',
            '/api/v1/game/catalog',
        ],
    ]);
}

$resource = $segments[1] ?? '';
$pdo = getDbConnection();

if ($resource === 'settings') {
    header('Cache-Control: private, no-store');
    header('Vary: Cookie', false);
    if ($requestMethod !== 'GET') respond(['success' => false, 'error' => 'method_not_allowed'], 405);
    if (count($segments) !== 2) respond(['success' => false, 'error' => 'endpoint_not_found'], 404);
    try { respond(['success' => true, 'data' => viewerSiteSettings($pdo)]); }
    catch (Throwable $error) { respond(['success' => false, 'error' => 'settings_unavailable'], 503); }
}

// Contas de jogador. Retorna sozinho quando a rota e de /auth.
handleAuthRoutes($pdo, $segments, $requestMethod);
handleDeckRoutes($pdo, $segments, $requestMethod);
handleGameRoutes($pdo, $segments, $requestMethod);

// Fora de /auth a API permanece somente leitura.
if ($requestMethod !== 'GET') {
    respond(['success' => false, 'error' => 'method_not_allowed'], 405);
}

if ($resource === 'status') {
    $state = $pdo->query('SELECT * FROM lorcana_sync_state WHERE id = 1')->fetch();
    $counts = $pdo->query(
        'SELECT
            (SELECT COUNT(*) FROM lorcana_sets WHERE active = 1) AS sets_count,
            (SELECT COUNT(*) FROM lorcana_cards WHERE active = 1) AS cards_count,
            (SELECT COUNT(*) FROM lorcana_cards WHERE active = 1 AND translation_status = "pending") AS pending_translations'
    )->fetch();
    respond([
        'success' => true,
        'data' => [
            'source' => LORCANA_SOURCE_NAME,
            'source_generated_at' => $state['source_generated_at'] ?? null,
            'format_version' => $state['format_version'] ?? null,
            'last_checked_at' => $state['last_checked_at'] ?? null,
            'last_synced_at' => $state['last_synced_at'] ?? null,
            'last_status' => $state['last_status'] ?? null,
            'sets' => (int) ($counts['sets_count'] ?? 0),
            'cards' => (int) ($counts['cards_count'] ?? 0),
            'pending_translations' => (int) ($counts['pending_translations'] ?? 0),
        ],
    ]);
}

$language = strtolower((string) ($_GET['lang'] ?? LORCANA_DEFAULT_LANGUAGE));
$language = $language === 'en' ? 'en' : 'pt-BR';

if ($resource === 'sets') {
    $rows = $pdo->query('SELECT * FROM lorcana_sets WHERE active = 1 ORDER BY number IS NULL, number, release_date, code')->fetchAll();
    $data = array_map(static function (array $row) use ($language): array {
        return [
            'code' => $row['code'],
            'number' => $row['number'] !== null ? (int) $row['number'] : null,
            'name' => localized($row['name_en'], $row['name_pt_br'], $language),
            'name_original' => $row['name_en'],
            'type' => localized($row['type_en'], $row['type_pt_br'], $language),
            'prerelease_date' => $row['prerelease_date'],
            'release_date' => $row['release_date'],
            'has_all_cards' => (bool) $row['has_all_cards'],
            'allowed_in_formats' => decodeJson($row['allowed_in_formats_json']),
            'card_counts' => decodeJson($row['card_counts_json']),
            'translation_status' => $row['translation_status'],
        ];
    }, $rows);
    respond(['success' => true, 'language' => $language, 'data' => $data]);
}

if ($resource === 'filters') {
    $costs = $pdo->query(
        'SELECT DISTINCT cost FROM lorcana_cards WHERE active = 1 AND cost IS NOT NULL ORDER BY cost'
    )->fetchAll(PDO::FETCH_COLUMN);

    respond([
        'success' => true,
        'language' => $language,
        'data' => [
            'colors' => filterOptions($pdo, 'color', $language),
            'types' => filterOptions($pdo, 'type', $language),
            'rarities' => filterOptions($pdo, 'rarity', $language),
            'costs' => array_map('intval', $costs),
        ],
    ]);
}

if ($resource === 'cards' && isset($segments[2]) && ctype_digit($segments[2])) {
    $stmt = $pdo->prepare('SELECT * FROM lorcana_cards WHERE source_id = ? AND active = 1');
    $stmt->execute([(int) $segments[2]]);
    $row = $stmt->fetch();
    if (!$row) {
        respond(['success' => false, 'error' => 'card_not_found'], 404);
    }

    $data = cardSummary($row, $language);
    $data += [
        'original' => [
            'name' => $row['name_en'],
            'version' => $row['version_en'],
            'full_name' => $row['full_name_en'],
            'type' => $row['type_en'],
            'color' => $row['color_en'],
            'rarity' => $row['rarity_en'],
            'story' => $row['story_en'],
            'subtypes' => decodeJson($row['subtypes_en_json']),
            'subtypes_text' => $row['subtypes_text_en'],
            'full_text' => $row['full_text_en'],
            'flavor_text' => $row['flavor_text_en'],
            'abilities' => decodeJson($row['abilities_en_json']),
            'effects' => decodeJson($row['effects_en_json']),
            'clarifications' => decodeJson($row['clarifications_en_json']),
            'errata' => decodeJson($row['errata_en_json']),
        ],
        'pt_br' => [
            'name' => $row['name_pt_br'],
            'version' => $row['version_pt_br'],
            'full_name' => $row['full_name_pt_br'],
            'type' => $row['type_pt_br'],
            'color' => $row['color_pt_br'],
            'rarity' => $row['rarity_pt_br'],
            'story' => $row['story_pt_br'],
            'subtypes' => decodeJson($row['subtypes_pt_br_json']),
            'subtypes_text' => $row['subtypes_text_pt_br'],
            'full_text' => $row['full_text_pt_br'],
            'flavor_text' => $row['flavor_text_pt_br'],
            'abilities' => decodeJson($row['abilities_pt_br_json']),
            'effects' => decodeJson($row['effects_pt_br_json']),
            'clarifications' => decodeJson($row['clarifications_pt_br_json']),
            'errata' => decodeJson($row['errata_pt_br_json']),
        ],
        'move_cost' => $row['move_cost'] !== null ? (int) $row['move_cost'] : null,
        'max_copies_in_deck' => $row['max_copies_in_deck'] !== null ? (int) $row['max_copies_in_deck'] : null,
        'artists' => decodeJson($row['artists_json']),
        'foil_types' => decodeJson($row['foil_types_json']),
        'images' => decodeJson($row['images_json']),
        'allowed_in_formats' => decodeJson($row['allowed_in_formats_json']),
        'allowed_in_tournaments_from_date' => $row['allowed_in_tournaments_from_date'],
        'translation_engine' => $row['translation_engine'],
        'translated_at' => $row['translated_at'],
    ];
    respond(['success' => true, 'language' => $language, 'data' => $data]);
}

if ($resource === 'cards') {
    $page = max(1, (int) ($_GET['page'] ?? 1));
    $perPage = min(LORCANA_API_MAX_PAGE_SIZE, max(1, (int) ($_GET['per_page'] ?? 24)));
    $offset = ($page - 1) * $perPage;
    $conditions = ['active = 1'];
    $params = [];

    if (isset($_GET['set']) && $_GET['set'] !== '') {
        $conditions[] = 'set_code = :set';
        $params['set'] = (string) $_GET['set'];
    }
    foreach (['color', 'type', 'rarity'] as $queryKey) {
        if (isset($_GET[$queryKey]) && $_GET[$queryKey] !== '') {
            $conditions[] = "({$queryKey}_en = :{$queryKey}_en OR {$queryKey}_pt_br = :{$queryKey}_pt)";
            $params[$queryKey . '_en'] = (string) $_GET[$queryKey];
            $params[$queryKey . '_pt'] = (string) $_GET[$queryKey];
        }
    }
    if (isset($_GET['inkwell']) && in_array((string) $_GET['inkwell'], ['0', '1'], true)) {
        $conditions[] = 'inkwell = :inkwell';
        $params['inkwell'] = (int) $_GET['inkwell'];
    }
    if (isset($_GET['cost']) && $_GET['cost'] !== '' && ctype_digit((string) $_GET['cost'])) {
        $conditions[] = 'cost = :cost';
        $params['cost'] = (int) $_GET['cost'];
    }
    if (isset($_GET['format']) && in_array((string) $_GET['format'], ['core', 'infinity'], true)) {
        $formatProperty = $_GET['format'] === 'core' ? 'Core' : 'Infinity';
        $legalSetRows = $pdo->query('SELECT code,allowed_in_formats_json FROM lorcana_sets WHERE active=1')->fetchAll();
        $legalSets = [];
        foreach ($legalSetRows as $setRow) {
            $setFormats = decodeJson($setRow['allowed_in_formats_json'] ?? null);
            if (($setFormats[$formatProperty]['allowed'] ?? false) === true) $legalSets[] = (string) $setRow['code'];
        }
        if ($legalSets === []) {
            $conditions[] = '1=0';
        } else {
            $formatPlaceholders = [];
            foreach ($legalSets as $index => $setCode) { $key = 'format_set_' . $index; $formatPlaceholders[] = ':' . $key; $params[$key] = $setCode; }
            $conditions[] = 'full_name_en IN (SELECT legal_printing.full_name_en FROM lorcana_cards legal_printing WHERE legal_printing.active=1 AND legal_printing.set_code IN (' . implode(',', $formatPlaceholders) . '))';
        }
        if ($_GET['format'] === 'infinity') $conditions[] = "full_name_en <> 'Hiram Flaversham - Toymaker'";
    }
    if (isset($_GET['q']) && trim((string) $_GET['q']) !== '') {
        $conditions[] = '(name_en LIKE :query OR full_name_en LIKE :query OR name_pt_br LIKE :query
                          OR full_name_pt_br LIKE :query OR full_text_en LIKE :query
                          OR full_text_pt_br LIKE :query OR flavor_text_en LIKE :query
                          OR flavor_text_pt_br LIKE :query)';
        $params['query'] = '%' . trim((string) $_GET['q']) . '%';
    }

    $where = implode(' AND ', $conditions);
    $countStatement = $pdo->prepare("SELECT COUNT(*) FROM lorcana_cards WHERE {$where}");
    $countStatement->execute($params);
    $total = (int) $countStatement->fetchColumn();

    $sql = "SELECT source_id, set_code, number, name_en, name_pt_br, version_en, version_pt_br,
                   full_name_en, full_name_pt_br, type_en, type_pt_br, color_en, color_pt_br,
                   rarity_en, rarity_pt_br, cost, inkwell, strength, willpower, lore,
                   image_full_url, image_thumbnail_url, image_full_foil_url, translation_status,
                   max_copies_in_deck
            FROM lorcana_cards WHERE {$where}
            ORDER BY
                CASE WHEN set_code REGEXP '^[0-9]+$' THEN 0 ELSE 1 END,
                CAST(set_code AS UNSIGNED), set_code, number, source_id
            LIMIT :limit OFFSET :offset";
    $statement = $pdo->prepare($sql);
    foreach ($params as $key => $value) {
        $statement->bindValue(':' . $key, $value, is_int($value) ? PDO::PARAM_INT : PDO::PARAM_STR);
    }
    $statement->bindValue(':limit', $perPage, PDO::PARAM_INT);
    $statement->bindValue(':offset', $offset, PDO::PARAM_INT);
    $statement->execute();
    $rows = $statement->fetchAll();

    respond([
        'success' => true,
        'language' => $language,
        'pagination' => [
            'page' => $page,
            'per_page' => $perPage,
            'total' => $total,
            'total_pages' => $total === 0 ? 0 : (int) ceil($total / $perPage),
        ],
        'data' => array_map(static fn(array $row): array => cardSummary($row, $language), $rows),
    ]);
}

respond(['success' => false, 'error' => 'endpoint_not_found'], 404);
