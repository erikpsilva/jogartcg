<?php

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

function expect(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

function requestGame(string $base, string $path, ?int $user = 7, string $method = 'GET'): array
{
    $headers = ['Accept: application/json', 'Connection: close'];
    if ($user !== null) $headers[] = 'X-Fixture-User: ' . $user;
    $context = stream_context_create(['http' => [
        'method' => $method, 'header' => implode("\r\n", $headers),
        'ignore_errors' => true, 'follow_location' => 0, 'timeout' => 3,
    ]]);
    $body = @file_get_contents($base . '/api/v1/game' . $path, false, $context);
    expect(is_string($body), 'Fixture server did not respond');
    $rawHeaders = $http_response_header ?? [];
    preg_match('/\s(\d{3})\s/', $rawHeaders[0] ?? '', $status);
    $responseHeaders = [];
    foreach (array_slice($rawHeaders, 1) as $header) {
        $parts = explode(':', $header, 2);
        if (count($parts) === 2) $responseHeaders[strtolower($parts[0])] = trim($parts[1]);
    }
    expect(in_array('no-store', array_map('trim', explode(',', $responseHeaders['cache-control'] ?? '')), true), 'Missing HTTP Cache-Control: no-store');
    expect(($responseHeaders['x-fixture-unchanged'] ?? '') === '1', 'Fixture rows changed or snapshot verification did not run');
    expect(str_starts_with($responseHeaders['content-type'] ?? '', 'application/json'), 'Response is not JSON');
    return [
        'status' => (int) ($status[1] ?? 0), 'headers' => $responseHeaders,
        'body' => json_decode($body, true, 512, JSON_THROW_ON_ERROR),
    ];
}

function cardWithId(array $entries, int $id): array
{
    foreach ($entries as $entry) if ($entry['card']['id'] === $id) return $entry['card'];
    throw new RuntimeException('Expected card not found');
}

$server = null;
$pipes = [];
$failed = 0;
try {
    expect(PHP_VERSION_ID >= 80100, 'PHP 8.1 or newer is required');
    expect(extension_loaded('pdo_sqlite') && extension_loaded('mbstring'), 'Enable pdo_sqlite and mbstring in the local PHP configuration');
    expect(is_callable('proc_open'), 'Local PHP must allow proc_open');
    expect((bool) ini_get('allow_url_fopen'), 'Local PHP must allow loopback HTTP via allow_url_fopen');
    $socket = @stream_socket_server('tcp://127.0.0.1:0', $errno, $error);
    expect(is_resource($socket), 'Cannot reserve a local loopback port');
    $address = stream_socket_get_name($socket, false);
    fclose($socket);
    expect(is_string($address), 'Cannot determine the loopback address');
    $command = [PHP_BINARY];
    if (is_string(php_ini_loaded_file())) array_push($command, '-c', php_ini_loaded_file());
    array_push($command, '-d', 'display_errors=0', '-d', 'log_errors=0', '-S', $address, '-t', __DIR__, __DIR__ . '/game-api-router.php');
    // Windows pipes do not reliably support nonblocking reads. Discard server logs
    // so a full log pipe cannot stall an otherwise successful HTTP test run.
    $nullDevice = PHP_OS_FAMILY === 'Windows' ? 'NUL' : '/dev/null';
    $server = proc_open($command, [0 => ['pipe', 'r'], 1 => ['file', $nullDevice, 'a'], 2 => ['file', $nullDevice, 'a']], $pipes, __DIR__, null, ['bypass_shell' => true]);
    expect(is_resource($server), 'Cannot start the local fixture server');
    fclose($pipes[0]);
    $ready = false;
    $deadline = microtime(true) + 5;
    do {
        $connection = @stream_socket_client('tcp://' . $address, $errno, $error, 0.1);
        if (is_resource($connection)) { fclose($connection); $ready = true; break; }
        if (!proc_get_status($server)['running']) break;
        usleep(50000);
    } while (microtime(true) < $deadline);
    expect($ready, 'Local fixture server failed to start');
    $base = 'http://' . $address;
    $get = static fn(string $path, ?int $user = 7, string $method = 'GET'): array => requestGame($base, $path, $user, $method);

    $tests = [
        'anonymous deck requires authentication and no-store' => static function () use ($get): void {
            $response = $get('/decks/101', null);
            expect($response['status'] === 401 && $response['body']['error'] === 'authentication_required', 'Anonymous deck access was not denied');
            expect(!isset($response['body']['data']), 'Anonymous response leaked data');
        },
        'anonymous catalog requires authentication and no-store' => static function () use ($get): void {
            $response = $get('/catalog', null);
            expect($response['status'] === 401 && $response['body']['error'] === 'authentication_required', 'Anonymous catalog access was not denied');
        },
        'owned deck refreshes validation and summary without writes' => static function () use ($get): void {
            $response = $get('/decks/101'); $deck = $response['body']['data'];
            expect($response['status'] === 200 && $response['body']['success'] === true, 'Owned deck unavailable');
            expect($deck['validation']['valid'] === true && $deck['validation']['issues'] === [], 'Stale validation returned');
            expect($deck['validation']['format']['key'] === 'core' && strtotime($deck['validation']['checked_at']) !== false, 'Missing current validation metadata');
            expect($deck['status'] === 'valido' && $deck['total_cards'] === 60 && $deck['colors'] === ['Amber'], 'Stale summary returned');
            expect(count($deck['cards']) === 15 && $deck['cards'][0]['quantity'] === 4, 'Wrong saved quantities');
            expect($deck['created_at'] === '2026-01-01' && $deck['updated_at'] === '2026-01-02', 'Saved timestamps changed');
        },
        'another owner and nonexistent deck are indistinguishable' => static function () use ($get): void {
            $foreign = $get('/decks/101', 8); $missing = $get('/decks/999');
            expect($foreign['status'] === 404 && $missing['status'] === 404, 'Ownership or missing-deck status is wrong');
            expect($foreign['body'] === $missing['body'], 'Ownership is disclosed through differing errors');
        },
        'English rule structures survive localized serialization' => static function () use ($get): void {
            $card = cardWithId($get('/decks/101')['body']['data']['cards'], 1);
            expect($card['type'] === 'Personagem' && $card['original']['type'] === 'Character', 'English rule type was translated');
            expect($card['original']['abilities'] === [['type' => 'activated', 'name' => 'HELP', 'costs' => ['exert'], 'costsText' => 'exert', 'effect' => 'Draw a card.', 'fullText' => 'HELP Draw a card.']], 'Ability fields were lost');
            expect($card['original']['effects'] === ['Draw a card.'] && $card['original']['keyword_abilities'] === ['Ward'], 'Effects or keywords changed');
            expect($card['original']['subtypes'] === ['Hero'] && $card['subtypes'] === ['Heroi'], 'Raw/display subtypes conflated');
            expect($card['pt_br']['full_text'] === 'AJUDA Compre uma carta.', 'Stored Portuguese text lost');
        },
        'English display and missing translation fallback' => static function () use ($get): void {
            $english = $get('/decks/101?lang=en');
            $card = cardWithId($english['body']['data']['cards'], 1);
            expect($english['body']['language'] === 'en' && $card['name'] === 'Hero' && $card['subtypes'] === ['Hero'], 'English display failed');
            $fallback = cardWithId($get('/decks/101?fixture=untranslated')['body']['data']['cards'], 1);
            expect($fallback['name'] === 'Hero' && $fallback['type'] === 'Character' && $fallback['subtypes'] === ['Hero'], 'Missing translation did not fall back');
            expect($fallback['pt_br']['name'] === null, 'Raw Portuguese null was replaced');
        },
        'numeric booleans nulls and image metadata preserve contract' => static function () use ($get): void {
            $card = cardWithId($get('/decks/101')['body']['data']['cards'], 1);
            expect($card['id'] === 1 && $card['cost'] === 2 && $card['strength'] === 2 && $card['inkwell'] === true, 'Wrong scalar JSON types');
            expect($card['move_cost'] === null && $card['version'] === null && $card['original']['errata'] === null, 'Nullable fields changed');
            expect($card['max_copies_in_deck'] === 4 && $card['colors'] === ['Amber'], 'Gameplay defaults changed');
            expect($card['image'] === ['full' => 'https://example.invalid/card.png', 'thumbnail' => 'https://example.invalid/thumb.png', 'full_foil' => null], 'Image metadata changed');
        },
        'private row and owner fields never reach either response' => static function () use ($get): void {
            foreach (['/decks/101', '/catalog'] as $path) {
                $json = json_encode($get($path)['body'], JSON_THROW_ON_ERROR);
                foreach (['INTERNAL_SENTINEL', 'HASH_SENTINEL', 'source_payload_json', 'source_hash', 'usuario_id', 'validation_json'] as $forbidden) {
                    expect(!str_contains($json, $forbidden), 'Internal field leaked: ' . $forbidden);
                }
            }
        },
        'inactive cards invalidate and omit unavailable definitions' => static function () use ($get): void {
            $response = $get('/decks/101?fixture=inactive'); $deck = $response['body']['data'];
            expect($response['status'] === 200 && $deck['validation']['valid'] === false, 'Inactive card did not invalidate');
            expect($deck['status'] === 'rascunho' && $deck['total_cards'] === 56 && count($deck['cards']) === 14, 'Inactive definition returned');
            expect(str_contains(implode(' ', $deck['validation']['issues']), '#1'), 'Inactive reference did not reach validation');
        },
        'missing references still reach validation' => static function () use ($get): void {
            $deck = $get('/decks/101?fixture=missing')['body']['data'];
            expect($deck['validation']['valid'] === false && str_contains(implode(' ', $deck['validation']['issues']), '#1'), 'Missing reference silently discarded');
            expect($deck['total_cards'] === 56 && count($deck['cards']) === 14, 'Missing card totals are incorrect');
        },
        'catalog includes legal reprints and excludes unsupported pools' => static function () use ($get): void {
            $response = $get('/catalog'); $cards = $response['body']['data'];
            expect($response['status'] === 200 && array_column($cards, 'id') === [...range(1, 16), 21], 'Catalog eligibility or order is incorrect');
            $song = $cards[count($cards) - 1];
            expect($song['original']['type'] === 'Action' && $song['original']['subtypes'] === ['Song'], 'Song compiler input is incorrect');
            expect(isset($song['original'], $song['pt_br'], $song['image']), 'Catalog differs from deck detail contract');
        },
        'owned Pack Rush is blocked after ownership check' => static function () use ($get): void {
            $owned = $get('/decks/101?fixture=pack_rush'); $foreign = $get('/decks/101?fixture=pack_rush', 8);
            expect($owned['status'] === 422 && $owned['body']['error'] === 'unsupported_game_format', 'Pack Rush bootstrap was allowed');
            expect($foreign['status'] === 404 && $foreign['body']['error'] === 'deck_not_found', 'Pack Rush check disclosed another owner deck');
        },
        'write methods are rejected and cannot modify fixtures' => static function () use ($get): void {
            foreach (['POST', 'PUT', 'DELETE'] as $method) foreach (['/decks/101', '/catalog'] as $path) {
                $response = $get($path, 7, $method);
                expect($response['status'] === 405 && $response['body']['error'] === 'method_not_allowed', 'Write method accepted');
                expect(($response['headers']['allow'] ?? '') === 'GET', 'Missing Allow: GET');
            }
        },
        'disabled play blocks authenticated game bootstrap' => static function () use ($get): void {
            foreach (['/decks/101', '/catalog'] as $path) {
                $response = $get($path . '?fixture=play_disabled');
                expect($response['status'] === 503 && $response['body']['error'] === 'game_unavailable', 'Disabled game was accessible');
                expect(!isset($response['body']['data']), 'Disabled game leaked its payload');
            }
        },
        'active beta tester bypasses disabled public play' => static function () use ($get): void {
            foreach (['/decks/101','/catalog'] as $path) expect($get($path . '?fixture=beta_play_disabled')['status'] === 200, 'Beta access was not granted');
        },
        'revoked beta cannot bootstrap with an existing session' => static function () use ($get): void {
            $response = $get('/catalog?fixture=beta_revoked');
            expect($response['status'] === 503 && !isset($response['body']['data']), 'Revoked beta was still allowed');
        },
        'inactive deleted and credential-revoked players lose API access' => static function () use ($get): void {
            foreach (['inactive_beta','deleted_player','password_revoked'] as $fixture) {
                $response = $get('/catalog?fixture=' . $fixture);
                expect($response['status'] === 401 && !isset($response['body']['data']), 'Invalid player session was accepted');
            }
        },
        'unknown and surplus route segments do not match' => static function () use ($get): void {
            foreach (['/unknown', '/decks/101/extra', '/catalog/extra'] as $path) {
                $response = $get($path);
                expect($response['status'] === 404 && $response['body']['error'] === 'endpoint_not_found', 'Loose route match');
            }
        },
        'invalid identifiers cannot select an owned deck' => static function () use ($get): void {
            foreach (['0', '-1', 'nope', '99999999999999999999999999'] as $id) {
                $response = $get('/decks/' . $id);
                expect($response['status'] === 404 && !isset($response['body']['data']), 'Invalid identifier selected a deck');
            }
        },
    ];
    echo '1..' . count($tests) . PHP_EOL;
    $number = 0;
    foreach ($tests as $name => $test) {
        $number++;
        try { $test(); echo "ok {$number} - {$name}" . PHP_EOL; }
        catch (Throwable $error) { $failed++; echo "not ok {$number} - {$name}: " . $error->getMessage() . PHP_EOL; }
    }
    echo '# ' . (count($tests) - $failed) . '/' . count($tests) . ' passed; fixture data only; every request checked no-store and unchanged rows.' . PHP_EOL;
} catch (Throwable $error) {
    $failed++;
    fwrite(STDERR, 'Game API tests: ' . $error->getMessage() . PHP_EOL);
} finally {
    if (is_resource($server)) proc_terminate($server);
    foreach ($pipes as $pipe) if (is_resource($pipe)) fclose($pipe);
    if (is_resource($server)) proc_close($server);
}
exit($failed === 0 ? 0 : 1);
