<?php

declare(strict_types=1);

/**
 * Testes de API das salas multiplayer, via HTTP real contra o Apache local.
 *
 *   php tests/api/multiplayer_rooms_test.php
 *   JOGARTCG_API=http://localhost/jogartcg/api/v1 php tests/api/multiplayer_rooms_test.php
 *
 * Cria usuarios temporarios (e-mails @mp-test.local), exercita as regras e
 * remove tudo no final, inclusive se um teste falhar.
 */

chdir(dirname(__DIR__, 2));
require 'config/database.php';

$base = rtrim(getenv('JOGARTCG_API') ?: 'http://localhost/jogartcg/api/v1', '/');
$pdo = getDbConnection();
$failures = 0;
$passes = 0;
$tag = bin2hex(random_bytes(3));

final class Client
{
    public string $csrf = '';
    private string $cookieFile;
    public function __construct(private string $base, public string $name)
    {
        $this->cookieFile = tempnam(sys_get_temp_dir(), 'mp');
    }
    public function request(string $method, string $path, ?array $body = null): array
    {
        $handle = $this->handle($method, $path, $body);
        $raw = curl_exec($handle);
        $status = curl_getinfo($handle, CURLINFO_RESPONSE_CODE);
        curl_close($handle);
        return ['status' => $status, 'body' => json_decode((string) $raw, true) ?? ['raw' => $raw]];
    }
    public function handle(string $method, string $path, ?array $body = null): CurlHandle
    {
        $handle = curl_init($this->base . $path);
        $headers = ['Accept: application/json', 'Origin: http://localhost'];
        if ($this->csrf !== '') $headers[] = 'X-CSRF-Token: ' . $this->csrf;
        if ($body !== null) $headers[] = 'Content-Type: application/json';
        curl_setopt_array($handle, [
            CURLOPT_CUSTOMREQUEST => $method, CURLOPT_RETURNTRANSFER => true, CURLOPT_HTTPHEADER => $headers,
            CURLOPT_COOKIEJAR => $this->cookieFile, CURLOPT_COOKIEFILE => $this->cookieFile, CURLOPT_TIMEOUT => 60,
        ]);
        if ($body !== null) curl_setopt($handle, CURLOPT_POSTFIELDS, json_encode($body));
        return $handle;
    }
}

function check(bool $condition, string $label, mixed $detail = null): void
{
    global $failures, $passes;
    if ($condition) { $passes++; echo "  ✔ {$label}\n"; return; }
    $failures++;
    echo "  ✖ {$label}\n";
    if ($detail !== null) echo '      ' . substr(json_encode($detail, JSON_UNESCAPED_UNICODE), 0, 600) . "\n";
}
function section(string $title): void { echo "\n{$title}\n"; }

/** @return array{0: Client, 1: int} */
function makeUser(PDO $pdo, string $base, string $name, string $tag): array
{
    $email = strtolower("{$name}-{$tag}@mp-test.local");
    $password = 'Teste!' . bin2hex(random_bytes(6));
    // CPF sintetico e unico por execucao; apenas os usuarios de teste o usam.
    $cpf = str_pad((string) random_int(0, 99999999999), 11, '0', STR_PAD_LEFT);
    $pdo->prepare(
        "INSERT INTO usuarios (nome, sobrenome, email, telefone, cpf, data_nascimento, senha_hash, beta_tester)
         VALUES (?, 'Teste', ?, '11999999999', ?, '1990-01-01', ?, 1)"
    )->execute([$name, $email, $cpf, password_hash($password, PASSWORD_BCRYPT)]);
    $client = new Client($base, $name);
    $login = $client->request('POST', '/auth/login', ['email' => $email, 'password' => $password]);
    if ($login['status'] !== 200) throw new RuntimeException("Login de {$name} falhou: " . json_encode($login));
    $client->csrf = $login['body']['data']['csrf_token'];
    return [$client, (int) $pdo->lastInsertId()];
}

function saveDeck(Client $client, string $name, array $cards): int
{
    $response = $client->request('POST', '/decks', ['name' => $name, 'format' => 'core', 'cards' => $cards]);
    if ($response['status'] !== 201) throw new RuntimeException("Deck {$name} nao salvo: " . json_encode($response));
    return (int) $response['body']['data']['id'];
}

$users = [];
try {
    [$ana, $anaId] = $users[] = makeUser($pdo, $base, 'Ana', $tag);
    [$bia, $biaId] = $users[] = makeUser($pdo, $base, 'Bia', $tag);
    [$caio] = $users[] = makeUser($pdo, $base, 'Caio', $tag);
    [$duda] = $users[] = makeUser($pdo, $base, 'Duda', $tag);

    // Lista valida: a primeira lista salva no banco que a API ainda aceita hoje
    // (um deck marcado como valido pode ter deixado de ser pela rotacao do formato).
    $cards = null;
    foreach ($pdo->query("SELECT id FROM decks WHERE formato = 'core' ORDER BY id")->fetchAll(PDO::FETCH_COLUMN) as $candidate) {
        $list = $pdo->query("SELECT card_source_id AS card_id, quantidade AS quantity FROM deck_cards WHERE deck_id = " . (int) $candidate)->fetchAll();
        $probe = $ana->request('POST', '/decks', ['name' => 'Deck Ana', 'format' => 'core', 'cards' => $list]);
        if ($probe['status'] === 201) { $cards = $list; $anaDeck = (int) $probe['body']['data']['id']; break; }
    }
    if ($cards === null) throw new RuntimeException('Nenhum deck Core salvo no banco e valido hoje para montar os testes.');
    $anaDeck2 = saveDeck($ana, 'Deck Ana 2', $cards);
    $biaDeck = saveDeck($bia, 'Deck Bia', $cards);
    // A API nao salva decks invalidos; um deck salvo pode ficar invalido depois
    // (rotacao, banimento). Simulamos esse caso direto no banco.
    $pdo->prepare("INSERT INTO decks (usuario_id, nome, formato, status_validacao, total_cartas) VALUES (?, 'Deck desatualizado', 'core', 'valido', 8)")->execute([$biaId]);
    $biaInvalid = (int) $pdo->lastInsertId();
    $pdo->prepare('INSERT INTO deck_cards (deck_id, card_source_id, quantidade) VALUES (?, ?, ?)')->execute([$biaInvalid, $cards[0]['card_id'], 4]);
    $pdo->prepare('INSERT INTO deck_cards (deck_id, card_source_id, quantidade) VALUES (?, ?, ?)')->execute([$biaInvalid, $cards[1]['card_id'], 4]);

    section('Codigo invalido');
    $response = $ana->request('POST', '/rooms/join', ['code' => '12ab']);
    check($response['status'] === 422 && $response['body']['error'] === 'invalid_code', 'formato invalido e recusado (422)', $response);
    $response = $ana->request('POST', '/rooms/join', ['code' => '000000']);
    check($response['status'] === 404 && $response['body']['error'] === 'room_not_found', 'codigo sem sala aberta e recusado (404)', $response);
    $validCsrf = $ana->csrf;
    $ana->csrf = 'token-errado';
    $csrf = $ana->request('POST', '/rooms', []);
    check($csrf['status'] === 403 && $csrf['body']['error'] === 'invalid_csrf_token', 'criar sala sem CSRF valido e recusado (403)', $csrf);
    $ana->csrf = $validCsrf;

    section('Criacao e entrada');
    $response = $ana->request('POST', '/rooms', []);
    $room = $response['body']['data'];
    $roomId = $room['id'];
    check($response['status'] === 201 && preg_match('/^\d{6}$/', (string) $room['code']) === 1, 'sala criada com codigo de 6 digitos', $response);
    check($room['you']['seat'] === 1 && count($room['players']) === 1, 'criador ocupa o assento 1');
    $again = $ana->request('POST', '/rooms', []);
    check($again['status'] === 409 && $again['body']['error'] === 'already_in_room', 'usuario em sala nao cria outra (409)', $again);

    $response = $ana->request('POST', '/rooms/join', ['code' => $room['code']]);
    check($response['status'] === 409 && $response['body']['error'] === 'already_joined', 'criador nao entra duas vezes na propria sala', $response);
    $response = $bia->request('POST', '/rooms/join', ['code' => $room['code']]);
    check($response['status'] === 200 && $response['body']['data']['you']['seat'] === 2, 'segundo jogador entra no assento 2', $response);
    $response = $bia->request('POST', '/rooms/join', ['code' => $room['code']]);
    check($response['status'] === 409 && $response['body']['error'] === 'already_joined', 'tentativa de entrar duas vezes e recusada', $response);

    section('Sala lotada');
    $response = $caio->request('POST', '/rooms/join', ['code' => $room['code']]);
    check($response['status'] === 409 && $response['body']['error'] === 'room_full', 'terceiro jogador recebe sala lotada', $response);

    section('Privacidade');
    $view = $ana->request('GET', "/rooms/{$roomId}")['body'];
    $text = json_encode($view);
    check(!str_contains($text, '@mp-test.local') && !str_contains($text, 'cpf'), 'lobby nao expoe e-mail nem CPF');
    $outsider = $caio->request('GET', "/rooms/{$roomId}");
    check($outsider['status'] === 404, 'quem nao e da sala nao consegue le-la (404)', $outsider);

    section('Escolha de deck');
    $response = $bia->request('POST', "/rooms/{$roomId}/ready", ['ready' => true]);
    check($response['status'] === 422 && $response['body']['error'] === 'deck_required', 'confirmar sem deck e recusado', $response);
    $response = $bia->request('POST', "/rooms/{$roomId}/deck", ['deckId' => $anaDeck]);
    check($response['status'] === 404 && $response['body']['error'] === 'deck_not_found', 'deck de outro usuario e recusado como inexistente', $response);
    $response = $bia->request('POST', "/rooms/{$roomId}/deck", ['deckId' => $biaInvalid]);
    check($response['status'] === 422 && $response['body']['error'] === 'invalid_deck', 'deck invalido e recusado', $response);

    section('Troca de deck cancela a confirmacao');
    $ana->request('POST', "/rooms/{$roomId}/deck", ['deckId' => $anaDeck]);
    $response = $ana->request('POST', "/rooms/{$roomId}/ready", ['ready' => true]);
    check($response['body']['data']['you']['ready'] === true, 'criador confirma "Comecar"', $response);
    $bia->request('POST', "/rooms/{$roomId}/deck", ['deckId' => $biaDeck]);
    $seen = $bia->request('GET', "/rooms/{$roomId}")['body']['data']['players'];
    check($seen[0]['ready'] === true && $seen[1]['deck_selected'] === true && $seen[0]['deck_selected'] === true, 'cada um ve o estado do outro sem ver o deck');
    check(!str_contains(json_encode($seen), 'Deck Ana'), 'nome do deck do adversario nao aparece');
    $response = $ana->request('POST', "/rooms/{$roomId}/deck", ['deckId' => $anaDeck2]);
    check($response['body']['data']['you']['ready'] === false, 'trocar de deck desfaz a confirmacao', $response);
    check($response['body']['data']['status'] === 'aguardando', 'partida nao comeca com so um confirmado');

    section('Confirmacao dos dois');
    $ana->request('POST', "/rooms/{$roomId}/ready", ['ready' => true]);
    $response = $bia->request('POST', "/rooms/{$roomId}/ready", ['ready' => true]);
    $data = $response['body']['data'] ?? [];
    check(($data['status'] ?? '') === 'em_jogo' && ($data['match']['revision'] ?? 0) === 1, 'partida inicia quando os dois confirmam', $response);
    check(array_key_exists('code', $data) && $data['code'] === null, 'codigo deixa de ser exibido/aceito apos o inicio');
    $response = $caio->request('POST', '/rooms/join', ['code' => $room['code']]);
    check($response['status'] === 404, 'codigo de sala em jogo nao aceita entrada', $response);

    $view = $data['view'] ?? [];
    $opponentHand = $view['state']['players']['bot']['hand'] ?? [];
    check(count($opponentHand) === 7 && array_sum(array_map(static fn($c) => $c['card']['id'], $opponentHand)) === 0, 'mao do adversario chega oculta');
    check(($view['state']['rng'] ?? -1) === 0, 'semente aleatoria nao e enviada');

    section('Acao fora do turno e revisao');
    $decisionSeat = $data['match']['decision_seat'];
    [$active, $idle] = $decisionSeat === 1 ? [$ana, $bia] : [$bia, $ana];
    $response = $idle->request('POST', "/rooms/{$roomId}/action", ['revision' => 1, 'action' => ['type' => 'choose', 'optionIds' => []]]);
    check($response['status'] === 422 && $response['body']['error'] === 'illegal_action', 'jogada de quem nao esta na vez e recusada', $response);
    $response = $idle->request('POST', "/rooms/{$roomId}/action", ['revision' => 1, 'action' => ['type' => 'choose', 'optionIds' => [], 'player' => 'player']]);
    check($response['status'] === 422, 'forjar o campo "player" nao ajuda', $response);
    $response = $active->request('POST', "/rooms/{$roomId}/action", ['revision' => 0, 'action' => ['type' => 'choose', 'optionIds' => []]]);
    check($response['status'] === 409 && $response['body']['error'] === 'stale_revision', 'revisao desatualizada e recusada (409)', $response);
    check(($response['body']['data']['match']['revision'] ?? 0) === 1, 'resposta de revisao desatualizada traz a mesa atual');
    $response = $active->request('POST', "/rooms/{$roomId}/action", ['revision' => 1, 'action' => ['type' => 'choose', 'optionIds' => []]]);
    check($response['status'] === 200 && $response['body']['data']['match']['revision'] === 2, 'jogada valida avanca para a revisao 2', $response);
    $response = $active->request('POST', "/rooms/{$roomId}/action", ['revision' => 1, 'action' => ['type' => 'choose', 'optionIds' => []]]);
    check($response['status'] === 409, 'reenvio duplicado da mesma jogada e recusado', $response);

    section('Polling e reconexao');
    $started = microtime(true);
    $response = $idle->request('GET', "/rooms/{$roomId}/poll?room_rev=0&match_rev=1");
    check($response['body']['changed'] === true && isset($response['body']['data']['view']) && microtime(true) - $started < 3, 'poll responde na hora quando ha revisao nova');
    $response = $bia->request('GET', '/rooms/current');
    $current = $response['body']['data'];
    check(($current['id'] ?? 0) === $roomId && ($current['match']['revision'] ?? 0) === 2 && isset($current['view']['state']), 'reconexao devolve a sala e a mesa atual', $response);
    $concurrent = curl_multi_init();
    $pollHandle = $bia->handle('GET', "/rooms/{$roomId}/poll?room_rev={$current['revision']}&match_rev=2");
    curl_multi_add_handle($concurrent, $pollHandle);
    do { curl_multi_exec($concurrent, $running); usleep(20000); } while ($running && microtime(true) - $started < 0.5);
    $blockedStart = microtime(true);
    $bia->request('GET', "/rooms/{$roomId}");
    check(microtime(true) - $blockedStart < 3, 'poll longo nao trava outras requisicoes da mesma sessao');
    curl_multi_remove_handle($concurrent, $pollHandle);
    curl_multi_close($concurrent);

    section('Abandono durante a partida');
    $pdo->prepare('UPDATE sala_jogadores SET ultimo_contato = NOW() - INTERVAL 10 MINUTE WHERE sala_id = ? AND assento = 2')->execute([$roomId]);
    $response = $ana->request('GET', "/rooms/{$roomId}");
    $data = $response['body']['data'];
    check($data['status'] === 'encerrada' && $data['closed_reason'] === 'abandono' && $data['match']['winner_seat'] === 1, 'quem ficou vence por abandono', $data);
    check($ana->request('GET', '/rooms/current')['body']['data'] === null, 'sala encerrada libera o jogador para outra');

    section('Expiracao do lobby');
    $response = $caio->request('POST', '/rooms', []);
    $expiring = $response['body']['data'];
    $pdo->prepare('UPDATE salas SET expira_em = NOW() - INTERVAL 1 MINUTE WHERE id = ?')->execute([$expiring['id']]);
    $data = $caio->request('GET', "/rooms/{$expiring['id']}")['body']['data'];
    check($data['status'] === 'encerrada' && $data['closed_reason'] === 'expirada' && $data['code'] === null, 'lobby vencido e encerrado como expirado', $data);
    $response = $duda->request('POST', '/rooms/join', ['code' => $expiring['code']]);
    check($response['status'] === 404, 'codigo de sala expirada nao aceita entrada', $response);

    section('Saida do convidado no lobby');
    $room = $ana->request('POST', '/rooms', [])['body']['data'];
    $bia->request('POST', '/rooms/join', ['code' => $room['code']]);
    $ana->request('POST', "/rooms/{$room['id']}/deck", ['deckId' => $anaDeck]);
    $ana->request('POST', "/rooms/{$room['id']}/ready", ['ready' => true]);
    $response = $bia->request('POST', "/rooms/{$room['id']}/leave", []);
    $data = $ana->request('GET', "/rooms/{$room['id']}")['body']['data'];
    check($response['status'] === 200 && count($data['players']) === 1 && $data['you']['ready'] === false, 'convidado sai, assento libera e o criador reconfirma');
    $ana->request('POST', "/rooms/{$room['id']}/leave", []);
    $data = $ana->request('GET', "/rooms/{$room['id']}")['body']['data'];
    check($data['status'] === 'encerrada' && $data['closed_reason'] === 'cancelada', 'criador sai e a sala fecha');

    section('Entrada simultanea');
    $room = $caio->request('POST', '/rooms', [])['body']['data'];
    $multi = curl_multi_init();
    $handles = [$bia->handle('POST', '/rooms/join', ['code' => $room['code']]), $duda->handle('POST', '/rooms/join', ['code' => $room['code']])];
    foreach ($handles as $handle) curl_multi_add_handle($multi, $handle);
    do { curl_multi_exec($multi, $running); curl_multi_select($multi, 0.1); } while ($running);
    $statuses = array_map(static fn($handle) => curl_getinfo($handle, CURLINFO_RESPONSE_CODE), $handles);
    sort($statuses);
    check($statuses === [200, 409], 'dois entrando ao mesmo tempo: exatamente um consegue', $statuses);
    $seats = $pdo->prepare('SELECT COUNT(*) FROM sala_jogadores WHERE sala_id = ?');
    $seats->execute([$room['id']]);
    check((int) $seats->fetchColumn() === 2, 'a sala termina com exatamente 2 assentos');
    curl_multi_close($multi);

    section('Long poll sem mudancas (aguarda a janela do servidor)');
    $current = $caio->request('GET', "/rooms/{$room['id']}")['body']['data'];
    $started = microtime(true);
    $response = $caio->request('GET', "/rooms/{$room['id']}/poll?room_rev={$current['revision']}&match_rev=0");
    $elapsed = microtime(true) - $started;
    check($response['status'] === 200 && $response['body']['changed'] === false, 'sem mudanca o poll responde changed=false', $response);
    check($elapsed >= 15 && $elapsed < 30, sprintf('o poll segura a conexao pela janela (%.1fs)', $elapsed));
} catch (Throwable $exception) {
    $failures++;
    echo "\n✖ Erro inesperado: {$exception->getMessage()}\n";
} finally {
    // Limpeza: salas, assentos, partidas e decks saem em cascata com os usuarios.
    $ids = array_map(static fn($user) => $user[1], $users);
    if ($ids) $pdo->exec('DELETE FROM usuarios WHERE id IN (' . implode(',', array_map('intval', $ids)) . ')');
    $leftovers = (int) $pdo->query("SELECT COUNT(*) FROM usuarios WHERE email LIKE '%@mp-test.local'")->fetchColumn();
    echo "\nUsuarios de teste restantes: {$leftovers}\n";
}

echo "\n{$passes} passaram, {$failures} falharam\n";
exit($failures === 0 ? 0 : 1);
