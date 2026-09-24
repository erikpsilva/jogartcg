<?php
declare(strict_types=1);

// CLI only. Uses disposable test accounts and deletes only its own fixtures.
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
chdir(dirname(__DIR__, 2));
require 'config/database.php';
require 'api/payload.php';
require 'api/starters.php';
$pdo = getDbConnection();
$users = [];
$passes = 0;
function verify(bool $condition, string $label): void {
    global $passes;
    if (!$condition) throw new RuntimeException($label);
    $passes++;
}
function requestApi(string $path, string $method = 'GET', ?string $cookie = null, ?string $csrf = null, array $body = []): array {
    $base = getenv('JOGARTCG_TEST_API') ?: 'http://localhost/jogartcg/api/index.php';
    $curl = curl_init($base . '?r=' . rawurlencode('/v1' . $path));
    $headers = ['Content-Type: application/json'];
    if ($csrf !== null) $headers[] = 'X-CSRF-Token: ' . $csrf;
    if ($cookie !== null) $headers[] = 'Cookie: ' . $cookie;
    curl_setopt_array($curl, [CURLOPT_RETURNTRANSFER => true, CURLOPT_HEADER => true, CURLOPT_CUSTOMREQUEST => $method, CURLOPT_HTTPHEADER => $headers, CURLOPT_TIMEOUT => 15]);
    if ($method !== 'GET') curl_setopt($curl, CURLOPT_POSTFIELDS, json_encode($body));
    $raw = curl_exec($curl);
    if ($raw === false) throw new RuntimeException('HTTP transport failed');
    $status = curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
    $size = curl_getinfo($curl, CURLINFO_HEADER_SIZE);
    $header = substr($raw, 0, $size);
    $json = json_decode(substr($raw, $size), true, 512, JSON_THROW_ON_ERROR);
    preg_match_all('/Set-Cookie:\s*(JOGARTCGSESSID=[^;]+)/i', $header, $matches);
    curl_close($curl);
    return ['status' => $status, 'payload' => $json, 'cookie' => $matches[1] ? end($matches[1]) : $cookie];
}
try {
    $catalog = starterCatalog();
    verify(count($catalog) === 23, 'All 23 starters are present');
    $rows = starterCardRows($pdo, $catalog);
    foreach ($catalog as $starter) {
        $detail = starterPayload($starter, $rows, true);
        verify($detail['available'] && $detail['total_cards'] === 60, $starter['id'] . ' complete 60-card list');
        verify(is_file($starter['cover']) && getimagesize($starter['cover']) !== false, $starter['id'] . ' valid local cover');
        $validated = validateDeckPayload($pdo, ['name' => $starter['name'], 'format' => 'preconstructed', 'cards' => $starter['cards']]);
        verify($validated['validation']['valid'], $starter['id'] . ' valid preconstructed deck');
    }
    $broken = starterPayload($catalog['S1-1'], [], true);
    verify(!$broken['available'] && count($broken['missing_cards']) > 0, 'Missing cards block import availability');
    foreach ([1, 2] as $n) {
        $suffix = bin2hex(random_bytes(6));
        $email = 'starter-test-' . $suffix . '@example.invalid';
        $password = bin2hex(random_bytes(18));
        $statement = $pdo->prepare('INSERT INTO usuarios(nome,sobrenome,email,cpf,data_nascimento,senha_hash) VALUES(?,?,?,?,?,?)');
        $statement->execute(['StarterTest', 'Disposable', $email, (string) random_int(10000000000, 99999999999), '1990-01-01', password_hash($password, PASSWORD_DEFAULT)]);
        $users[] = (int) $pdo->lastInsertId();
        if ($n === 1) { $loginEmail = $email; $loginPassword = $password; }
    }
    $starter = $catalog['S1-1'];
    $first = collectStarter($pdo, $users[0], $starter);
    $again = collectStarter($pdo, $users[0], $starter);
    verify($first['created'] && !$again['created'] && $first['deck_id'] === $again['deck_id'], 'Retry does not duplicate');
    $saved = loadDeck($pdo, $first['deck_id'], $users[0]);
    verify($saved !== null && $saved['total_cards'] === 60 && $saved['format'] === 'preconstructed', 'Saved into Meus Decks');
    $expected = [];
    foreach ($starter['cards'] as $c) $expected[$c['card_id']] = ($expected[$c['card_id']] ?? 0) + $c['quantity'];
    $actual = [];
    foreach ($saved['cards'] as $c) $actual[$c['card']['id']] = $c['quantity'];
    ksort($expected); ksort($actual);
    verify($expected === $actual, 'Exact card IDs and quantities persisted');
    verify(loadDeck($pdo, $first['deck_id'], $users[1]) === null, 'Other account cannot read imported deck');
    $other = collectStarter($pdo, $users[1], $starter);
    verify($other['created'] && $other['deck_id'] !== $first['deck_id'], 'Each account owns its copy');
    $pdo->prepare('UPDATE decks SET nome=? WHERE id=?')->execute(['Edited starter fixture', $first['deck_id']]);
    verify(collectStarter($pdo, $users[0], $starter)['deck_id'] === $first['deck_id'], 'Editing a saved deck does not cause duplicates');
    $pdo->prepare('DELETE FROM decks WHERE id=? AND usuario_id=?')->execute([$first['deck_id'], $users[0]]);
    verify(collectStarter($pdo, $users[0], $starter)['created'], 'Deleting allows collecting again');
    verify(requestApi('/starter-decks')['status'] === 200, 'Public listing');
    verify(count(requestApi('/starter-decks')['payload']['data']) === 23, 'HTTP lists all starters');
    verify(requestApi('/starter-decks/S1-1')['payload']['data']['total_cards'] === 60, 'HTTP detail');
    verify(requestApi('/starter-decks/invalid')['status'] === 404, 'Invalid ID is not found');
    verify(requestApi('/starter-decks/S1-1/collect', 'POST')['status'] === 401, 'Anonymous import denied');
    $login = requestApi('/auth/login', 'POST', null, null, ['email' => $loginEmail, 'password' => $loginPassword]);
    verify($login['status'] === 200 && !empty($login['cookie']), 'Test session established');
    verify(requestApi('/starter-decks/S1-2/collect', 'POST', $login['cookie'])['status'] === 403, 'CSRF required');
    $result = requestApi('/starter-decks/S1-2/collect', 'POST', $login['cookie'], $login['payload']['data']['csrf_token'], ['cards' => [['card_id' => 1, 'quantity' => 999]], 'usuario_id' => $users[1]]);
    verify($result['status'] === 201, 'Authenticated canonical import accepted');
    $deck = loadDeck($pdo, $result['payload']['data']['deck_id'], $users[0]);
    verify($deck['total_cards'] === 60 && loadDeck($pdo, $deck['id'], $users[1]) === null, 'Forged quantities and user ID ignored');
    echo "PASS: {$passes} checks.\n";
} finally {
    foreach ($users as $id) $pdo->prepare('DELETE FROM usuarios WHERE id=? AND email LIKE ?')->execute([$id, 'starter-test-%@example.invalid']);
    echo 'Disposable test accounts cleaned up.' . PHP_EOL;
}
