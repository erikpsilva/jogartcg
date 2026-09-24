<?php

declare(strict_types=1);

/**
 * Salas multiplayer.
 *
 *   POST /rooms                 cria sala (codigo de 6 digitos)      [CSRF]
 *   GET  /rooms/current         sala ativa do usuario (reconexao)
 *   POST /rooms/join            entra com { code }                   [CSRF]
 *   GET  /rooms/{id}            estado do lobby (+ visao da partida com ?view=1)
 *   GET  /rooms/{id}/poll       long polling: ?room_rev=&match_rev=
 *   POST /rooms/{id}/deck       escolhe deck { deckId }              [CSRF]
 *   POST /rooms/{id}/ready      confirma "Comecar" { ready }         [CSRF]
 *   POST /rooms/{id}/action     jogada { revision, action }          [CSRF]
 *   POST /rooms/{id}/leave      sai da sala / desiste                [CSRF]
 *
 * O servidor e autoritativo: assento vem da sessao, deck e sempre recarregado e
 * revalidado do banco, e toda jogada passa pelo arbitro de regras com a revisao
 * atual travada (SELECT ... FOR UPDATE).
 */

require_once __DIR__ . '/game.php';
require_once dirname(__DIR__) . '/config/multiplayer.php';

function roomError(string $error, string $message, int $status, array $extra = []): never
{
    respond(['success' => false, 'error' => $error, 'message' => $message] + $extra, $status);
}

/** Linha da sala e do assento do usuario; null quando ele nao pertence a sala. */
function loadRoomMembership(PDO $pdo, int $roomId, int $userId, bool $forUpdate = false): ?array
{
    $lock = $forUpdate ? ' FOR UPDATE' : '';
    $room = $pdo->prepare('SELECT * FROM salas WHERE id = ?' . $lock);
    $room->execute([$roomId]);
    $roomRow = $room->fetch();
    if (!$roomRow) return null;

    $seat = $pdo->prepare('SELECT * FROM sala_jogadores WHERE sala_id = ? AND usuario_id = ?' . $lock);
    $seat->execute([$roomId, $userId]);
    $seatRow = $seat->fetch();
    return $seatRow ? ['room' => $roomRow, 'seat' => $seatRow] : null;
}

function requireRoomMembership(PDO $pdo, int $roomId, int $userId, bool $forUpdate = false): array
{
    $membership = loadRoomMembership($pdo, $roomId, $userId, $forUpdate);
    // Mesma resposta para "nao existe" e "nao e sua": nao revela salas alheias.
    if ($membership === null) roomError('room_not_found', 'Sala nao encontrada.', 404);
    return $membership;
}

function touchSeat(PDO $pdo, int $roomId, int $userId): void
{
    $pdo->prepare('UPDATE sala_jogadores SET ultimo_contato = NOW() WHERE sala_id = ? AND usuario_id = ? AND ativo_usuario_id IS NOT NULL')
        ->execute([$roomId, $userId]);
}

function bumpRoomRevision(PDO $pdo, int $roomId): void
{
    $pdo->prepare('UPDATE salas SET revisao = revisao + 1 WHERE id = ?')->execute([$roomId]);
}

/** Encerra a sala, libera o codigo e os assentos. Deve rodar dentro de uma transacao. */
function closeRoom(PDO $pdo, int $roomId, string $reason): void
{
    $pdo->prepare(
        "UPDATE salas SET status = 'encerrada', codigo_aberto = NULL, motivo_encerramento = ?,
                encerrada_em = NOW(), revisao = revisao + 1
         WHERE id = ? AND status <> 'encerrada'"
    )->execute([$reason, $roomId]);
    $pdo->prepare('UPDATE sala_jogadores SET ativo_usuario_id = NULL, pronto = 0 WHERE sala_id = ?')->execute([$roomId]);
}

function seatNames(PDO $pdo, int $roomId): array
{
    $statement = $pdo->prepare('SELECT sj.assento, u.nome FROM sala_jogadores sj JOIN usuarios u ON u.id = sj.usuario_id WHERE sj.sala_id = ?');
    $statement->execute([$roomId]);
    $names = [1 => 'Jogador 1', 2 => 'Jogador 2'];
    foreach ($statement->fetchAll() as $row) $names[(int) $row['assento']] = (string) $row['nome'];
    return $names;
}

/**
 * Grava o resultado de uma operacao do arbitro na partida. Encerra a sala quando
 * o motor declara fim de jogo. Deve rodar dentro de uma transacao com a partida travada.
 */
function storeRefereeResult(PDO $pdo, array $match, array $result, ?int $seat, string $type, ?array $action): int
{
    $summary = $result['summary'];
    $finished = ($summary['phase'] ?? '') === 'finished';
    $revision = (int) $match['revisao'] + 1;

    $pdo->prepare(
        "UPDATE partidas SET estado_json = ?, visao_assento1 = ?, visao_assento2 = ?, revisao = ?,
                assento_decisao = ?, vencedor_assento = ?, motivo_fim = ?,
                status = ?, encerrada_em = IF(? = 'encerrada', NOW(), encerrada_em)
         WHERE id = ?"
    )->execute([
        json_encode($result['state'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        json_encode($result['views'][1] ?? $result['views']['1'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        json_encode($result['views'][2] ?? $result['views']['2'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        $revision,
        $summary['decisionSeat'],
        $summary['winnerSeat'],
        $finished ? ($type === 'abandono' ? 'abandono' : ($summary['finishReason'] ?? 'fim')) : null,
        $finished ? 'encerrada' : 'em_andamento',
        $finished ? 'encerrada' : 'em_andamento',
        (int) $match['id'],
    ]);
    $pdo->prepare('INSERT INTO partida_eventos (partida_id, revisao, assento, tipo, acao_json) VALUES (?, ?, ?, ?, ?)')
        ->execute([(int) $match['id'], $revision, $seat, $type, $action === null ? null : json_encode($action, JSON_UNESCAPED_UNICODE)]);

    if ($finished) closeRoom($pdo, (int) $match['sala_id'], $type === 'abandono' ? 'abandono' : 'fim_de_jogo');
    else bumpRoomRevision($pdo, (int) $match['sala_id']);
    return $revision;
}

/** Faz o assento desistir via motor (abandono ou saida voluntaria). Transacao com a partida travada. */
function concedeSeat(PDO $pdo, array $match, int $seat, string $type): void
{
    $result = callReferee($pdo, [
        'op' => 'apply', 'state' => json_decode((string) $match['estado_json'], true),
        'seat' => $seat, 'action' => ['type' => 'concede'], 'names' => seatNames($pdo, (int) $match['sala_id']),
    ]);
    storeRefereeResult($pdo, $match, $result, $seat, $type, ['type' => 'concede']);
}

/**
 * Limpeza preguicosa, executada no inicio das requisicoes de sala:
 * lobbies vencidos, jogadores que sumiram do lobby e partidas abandonadas.
 */
function sweepRooms(PDO $pdo): void
{
    // Lobbies que passaram do prazo sem comecar.
    $expired = $pdo->query("SELECT id FROM salas WHERE status = 'aguardando' AND expira_em < NOW()")->fetchAll(PDO::FETCH_COLUMN);
    foreach ($expired as $roomId) {
        $pdo->beginTransaction();
        $locked = $pdo->prepare("SELECT id FROM salas WHERE id = ? AND status = 'aguardando' AND expira_em < NOW() FOR UPDATE");
        $locked->execute([$roomId]);
        if ($locked->fetch()) closeRoom($pdo, (int) $roomId, 'expirada');
        $pdo->commit();
    }

    // Quem sumiu do lobby: criador fecha a sala, convidado apenas libera o assento.
    $absentLobby = $pdo->prepare(
        "SELECT sj.sala_id, sj.assento FROM sala_jogadores sj JOIN salas s ON s.id = sj.sala_id
         WHERE s.status = 'aguardando' AND sj.ativo_usuario_id IS NOT NULL
           AND sj.ultimo_contato < NOW() - INTERVAL ? SECOND"
    );
    $absentLobby->execute([MULTIPLAYER_LOBBY_ABSENCE_SECONDS]);
    foreach ($absentLobby->fetchAll() as $row) {
        $pdo->beginTransaction();
        $locked = $pdo->prepare("SELECT id FROM salas WHERE id = ? AND status = 'aguardando' FOR UPDATE");
        $locked->execute([$row['sala_id']]);
        if ($locked->fetch()) {
            $still = $pdo->prepare('SELECT 1 FROM sala_jogadores WHERE sala_id = ? AND assento = ? AND ultimo_contato < NOW() - INTERVAL ? SECOND');
            $still->execute([$row['sala_id'], $row['assento'], MULTIPLAYER_LOBBY_ABSENCE_SECONDS]);
            if ($still->fetch()) {
                if ((int) $row['assento'] === 1) {
                    closeRoom($pdo, (int) $row['sala_id'], 'abandonada');
                } else {
                    $pdo->prepare('DELETE FROM sala_jogadores WHERE sala_id = ? AND assento = 2')->execute([$row['sala_id']]);
                    $pdo->prepare('UPDATE sala_jogadores SET pronto = 0 WHERE sala_id = ?')->execute([$row['sala_id']]);
                    bumpRoomRevision($pdo, (int) $row['sala_id']);
                }
            }
        }
        $pdo->commit();
    }

    // Partidas: um lado sumiu -> o outro vence por abandono; os dois sumiram -> expira sem vencedor.
    $absentMatch = $pdo->prepare(
        "SELECT DISTINCT sj.sala_id FROM sala_jogadores sj JOIN salas s ON s.id = sj.sala_id
         WHERE s.status = 'em_jogo' AND sj.ultimo_contato < NOW() - INTERVAL ? SECOND"
    );
    $absentMatch->execute([MULTIPLAYER_MATCH_ABSENCE_SECONDS]);
    foreach ($absentMatch->fetchAll(PDO::FETCH_COLUMN) as $roomId) {
        $pdo->beginTransaction();
        try {
            $locked = $pdo->prepare("SELECT id FROM salas WHERE id = ? AND status = 'em_jogo' FOR UPDATE");
            $locked->execute([$roomId]);
            if (!$locked->fetch()) { $pdo->commit(); continue; }
            $matchStatement = $pdo->prepare("SELECT * FROM partidas WHERE sala_id = ? FOR UPDATE");
            $matchStatement->execute([$roomId]);
            $match = $matchStatement->fetch();
            $stale = $pdo->prepare('SELECT assento FROM sala_jogadores WHERE sala_id = ? AND ultimo_contato < NOW() - INTERVAL ? SECOND');
            $stale->execute([$roomId, MULTIPLAYER_MATCH_ABSENCE_SECONDS]);
            $staleSeats = array_map('intval', $stale->fetchAll(PDO::FETCH_COLUMN));

            if (!$match || count($staleSeats) >= 2) {
                if ($match) {
                    $pdo->prepare("UPDATE partidas SET status = 'encerrada', motivo_fim = 'expirada', encerrada_em = NOW() WHERE id = ?")->execute([$match['id']]);
                }
                closeRoom($pdo, (int) $roomId, 'expirada');
            } elseif (count($staleSeats) === 1) {
                concedeSeat($pdo, $match, $staleSeats[0], 'abandono');
            }
            $pdo->commit();
        } catch (Throwable $exception) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            error_log('[jogartcg] limpeza de sala falhou: ' . $exception->getMessage());
        }
    }
}

const ROOM_CLOSED_MESSAGES = [
    'expirada' => 'A sala expirou por inatividade.',
    'abandonada' => 'O criador saiu e a sala foi fechada.',
    'cancelada' => 'A sala foi fechada pelo criador.',
    'abandono' => 'A partida terminou porque um jogador se desconectou.',
    'fim_de_jogo' => 'A partida terminou.',
];

/** Visao publica da sala para um membro. Nunca inclui e-mail, CPF ou decks do outro. */
function roomPayload(PDO $pdo, int $roomId, int $userId, bool $includeView = false): array
{
    $membership = requireRoomMembership($pdo, $roomId, $userId);
    $room = $membership['room'];
    $mySeat = (int) $membership['seat']['assento'];

    $seats = $pdo->prepare(
        'SELECT sj.*, u.nome, u.foto_perfil, d.nome AS deck_nome, d.cores_json,
                (sj.ultimo_contato >= NOW() - INTERVAL ? SECOND) AS conectado
         FROM sala_jogadores sj
         JOIN usuarios u ON u.id = sj.usuario_id
         LEFT JOIN decks d ON d.id = sj.deck_id
         WHERE sj.sala_id = ? ORDER BY sj.assento'
    );
    $seats->execute([MULTIPLAYER_CONNECTED_SECONDS, $roomId]);
    $players = [];
    $you = null;
    foreach ($seats->fetchAll() as $row) {
        $isYou = (int) $row['usuario_id'] === $userId;
        $players[] = [
            'seat' => (int) $row['assento'],
            'name' => $row['nome'],
            'avatar' => avatarPublicUrl($row['foto_perfil']),
            'deck_selected' => $row['deck_id'] !== null,
            'ready' => (bool) $row['pronto'],
            'connected' => (bool) $row['conectado'],
            'you' => $isYou,
        ];
        // Cores do deck so depois do inicio: antes disso nada do deck adversario sai do servidor.
        if ($room['status'] !== 'aguardando') {
            $players[count($players) - 1]['colors'] = json_decode((string) ($row['cores_json'] ?? '[]'), true) ?: [];
        }
        if ($isYou) {
            $you = [
                'seat' => (int) $row['assento'],
                'deck' => $row['deck_id'] !== null ? ['id' => (int) $row['deck_id'], 'name' => $row['deck_nome']] : null,
                'ready' => (bool) $row['pronto'],
            ];
        }
    }

    $matchStatement = $pdo->prepare('SELECT id, revisao, status, assento_decisao, vencedor_assento, motivo_fim' . ($includeView ? ', visao_assento' . $mySeat . ' AS visao' : '') . ' FROM partidas WHERE sala_id = ?');
    $matchStatement->execute([$roomId]);
    $match = $matchStatement->fetch() ?: null;

    $reason = $room['motivo_encerramento'];
    $payload = [
        'id' => (int) $room['id'],
        'code' => $room['status'] === 'aguardando' ? $room['codigo'] : null,
        'status' => $room['status'],
        'revision' => (int) $room['revisao'],
        'closed_reason' => $reason,
        'closed_message' => $reason !== null ? (ROOM_CLOSED_MESSAGES[$reason] ?? 'A sala foi encerrada.') : null,
        'expires_at' => $room['status'] === 'aguardando' ? date(DATE_ATOM, strtotime((string) $room['expira_em'])) : null,
        'you' => $you,
        'players' => $players,
        'match' => $match ? [
            'revision' => (int) $match['revisao'],
            'status' => $match['status'],
            'decision_seat' => $match['assento_decisao'] !== null ? (int) $match['assento_decisao'] : null,
            'winner_seat' => $match['vencedor_assento'] !== null ? (int) $match['vencedor_assento'] : null,
            'finish_reason' => $match['motivo_fim'],
        ] : null,
    ];
    if ($includeView && $match) $payload['view'] = json_decode((string) $match['visao'], true);
    return $payload;
}

function currentRoomId(PDO $pdo, int $userId): ?int
{
    $statement = $pdo->prepare('SELECT sala_id FROM sala_jogadores WHERE ativo_usuario_id = ? LIMIT 1');
    $statement->execute([$userId]);
    $roomId = $statement->fetchColumn();
    return $roomId === false ? null : (int) $roomId;
}

/** Deck do proprio usuario, recarregado e revalidado do banco. Responde com erro se nao servir. */
function requirePlayableDeck(PDO $pdo, int $deckId, int $userId): array
{
    $deck = $deckId > 0 ? loadGameDeck($pdo, $deckId, $userId, 'pt-BR') : null;
    // Deck de outro usuario recebe a mesma resposta de deck inexistente.
    if ($deck === null) roomError('deck_not_found', 'Deck nao encontrado.', 404);
    if (!in_array($deck['format'], ['core', 'infinity'], true)) {
        roomError('unsupported_game_format', 'As salas aceitam decks Core ou Infinity.', 422);
    }
    if (!($deck['validation']['valid'] ?? false)) {
        roomError('invalid_deck', 'Este deck nao esta valido para jogar.', 422, ['issues' => $deck['validation']['issues'] ?? []]);
    }
    return $deck;
}

/** Inicia a partida quando os dois assentos confirmaram. Transacao com a sala travada. */
function startMatchIfReady(PDO $pdo, int $roomId): void
{
    $seats = $pdo->prepare('SELECT * FROM sala_jogadores WHERE sala_id = ? ORDER BY assento FOR UPDATE');
    $seats->execute([$roomId]);
    $rows = $seats->fetchAll();
    if (count($rows) !== 2 || !$rows[0]['pronto'] || !$rows[1]['pronto']) return;

    $decks = [];
    foreach ($rows as $row) {
        // Revalida no momento de iniciar: o deck pode ter sido editado depois da escolha.
        $deck = loadGameDeck($pdo, (int) $row['deck_id'], (int) $row['usuario_id'], 'pt-BR');
        if ($deck === null || !($deck['validation']['valid'] ?? false) || !in_array($deck['format'], ['core', 'infinity'], true)) {
            $pdo->prepare('UPDATE sala_jogadores SET pronto = 0, deck_id = NULL WHERE id = ?')->execute([$row['id']]);
            bumpRoomRevision($pdo, $roomId);
            return;
        }
        $decks[(int) $row['assento']] = $deck['cards'];
    }

    $result = callReferee($pdo, [
        'op' => 'create', 'decks' => $decks, 'seed' => random_int(1, 2147483647), 'names' => seatNames($pdo, $roomId),
    ]);
    $pdo->prepare(
        'INSERT INTO partidas (sala_id, estado_json, visao_assento1, visao_assento2, revisao, assento_decisao)
         VALUES (?, ?, ?, ?, 1, ?)'
    )->execute([
        $roomId,
        json_encode($result['state'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        json_encode($result['views'][1] ?? $result['views']['1'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        json_encode($result['views'][2] ?? $result['views']['2'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        $result['summary']['decisionSeat'],
    ]);
    $pdo->prepare('INSERT INTO partida_eventos (partida_id, revisao, assento, tipo) VALUES (?, 1, NULL, ?)')
        ->execute([(int) $pdo->lastInsertId(), 'inicio']);
    $pdo->prepare("UPDATE salas SET status = 'em_jogo', codigo_aberto = NULL, revisao = revisao + 1 WHERE id = ?")->execute([$roomId]);
}

function createRoom(PDO $pdo, int $userId): int
{
    for ($attempt = 0; $attempt < 20; $attempt++) {
        $code = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
        $pdo->beginTransaction();
        try {
            $pdo->prepare(
                'INSERT INTO salas (codigo, codigo_aberto, criador_id, expira_em) VALUES (?, ?, ?, NOW() + INTERVAL ? MINUTE)'
            )->execute([$code, $code, $userId, MULTIPLAYER_ROOM_WAIT_MINUTES]);
            $roomId = (int) $pdo->lastInsertId();
            $pdo->prepare(
                'INSERT INTO sala_jogadores (sala_id, usuario_id, assento, ativo_usuario_id, ultimo_contato) VALUES (?, ?, 1, ?, NOW())'
            )->execute([$roomId, $userId, $userId]);
            $pdo->commit();
            return $roomId;
        } catch (PDOException $exception) {
            $pdo->rollBack();
            if ($exception->getCode() !== '23000') throw $exception;
            if (str_contains($exception->getMessage(), 'uk_sala_jogadores_ativo')) {
                roomError('already_in_room', 'Voce ja esta em uma sala.', 409, ['room_id' => currentRoomId($pdo, $userId)]);
            }
            // Colisao de codigo com outra sala aberta: sorteia outro.
        }
    }
    throw new RuntimeException('Nao foi possivel gerar um codigo de sala unico.');
}

function joinRoom(PDO $pdo, int $userId, string $code): int
{
    if (!preg_match('/^\d{6}$/', $code)) roomError('invalid_code', 'Digite o codigo de 6 numeros da sala.', 422);

    $pdo->beginTransaction();
    try {
        $room = $pdo->prepare("SELECT * FROM salas WHERE codigo_aberto = ? AND status = 'aguardando' FOR UPDATE");
        $room->execute([$code]);
        $roomRow = $room->fetch();
        if (!$roomRow) {
            $pdo->rollBack();
            roomError('room_not_found', 'Nenhuma sala aberta com este codigo.', 404);
        }
        $roomId = (int) $roomRow['id'];

        $seats = $pdo->prepare('SELECT usuario_id, assento FROM sala_jogadores WHERE sala_id = ? FOR UPDATE');
        $seats->execute([$roomId]);
        $rows = $seats->fetchAll();
        foreach ($rows as $row) {
            if ((int) $row['usuario_id'] === $userId) {
                $pdo->rollBack();
                roomError('already_joined', 'Voce ja esta nesta sala.', 409, ['room_id' => $roomId]);
            }
        }
        if (count($rows) >= 2) {
            $pdo->rollBack();
            roomError('room_full', 'Esta sala ja esta completa.', 409);
        }

        $pdo->prepare(
            'INSERT INTO sala_jogadores (sala_id, usuario_id, assento, ativo_usuario_id, ultimo_contato) VALUES (?, ?, 2, ?, NOW())'
        )->execute([$roomId, $userId, $userId]);
        bumpRoomRevision($pdo, $roomId);
        $pdo->commit();
        return $roomId;
    } catch (PDOException $exception) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        if ($exception->getCode() === '23000' && str_contains($exception->getMessage(), 'uk_sala_jogadores_ativo')) {
            roomError('already_in_room', 'Voce ja esta em outra sala. Saia dela antes de entrar nesta.', 409, ['room_id' => currentRoomId($pdo, $userId)]);
        }
        if ($exception->getCode() === '23000') {
            // Outra pessoa ocupou o assento no mesmo instante.
            roomError('room_full', 'Esta sala ja esta completa.', 409);
        }
        throw $exception;
    }
}

/** Long polling: segura a resposta ate algo mudar ou o tempo acabar. */
function pollRoom(PDO $pdo, int $roomId, int $userId): never
{
    $knownRoom = (int) ($_GET['room_rev'] ?? 0);
    $knownMatch = (int) ($_GET['match_rev'] ?? 0);
    // Libera o arquivo de sessao: sem isso, este request bloquearia as jogadas do mesmo usuario.
    session_write_close();
    ignore_user_abort(false);
    set_time_limit(MULTIPLAYER_LONG_POLL_SECONDS + 15);

    $deadline = microtime(true) + MULTIPLAYER_LONG_POLL_SECONDS;
    $lastTouch = 0.0;
    $revisions = $pdo->prepare('SELECT s.revisao, p.revisao AS partida FROM salas s LEFT JOIN partidas p ON p.sala_id = s.id WHERE s.id = ?');
    do {
        if (microtime(true) - $lastTouch >= 10) { touchSeat($pdo, $roomId, $userId); $lastTouch = microtime(true); }
        $revisions->execute([$roomId]);
        $current = $revisions->fetch();
        $matchChanged = $current['partida'] !== null && (int) $current['partida'] !== $knownMatch;
        if ((int) $current['revisao'] !== $knownRoom || $matchChanged) {
            respond(['success' => true, 'changed' => true, 'data' => roomPayload($pdo, $roomId, $userId, $matchChanged)]);
        }
        if (connection_aborted()) exit;
        usleep(MULTIPLAYER_POLL_STEP_MICROSECONDS);
    } while (microtime(true) < $deadline);

    // Sem mudanca: devolve o lobby mesmo assim para atualizar os selos de conexao.
    respond(['success' => true, 'changed' => false, 'data' => roomPayload($pdo, $roomId, $userId, false)]);
}

function handleRoomRoutes(PDO $pdo, array $segments, string $method): void
{
    if (($segments[1] ?? '') !== 'rooms') return;
    header('Cache-Control: no-store');
    $userId = requireUserId($pdo);
    try { $playEnabled = playerMayPlay(publicSiteSettings($pdo)['play_enabled'], loadCurrentUser($pdo)); }
    catch (Throwable) { $playEnabled = false; }
    if (!$playEnabled) roomError('game_unavailable', 'O acesso ao jogo esta temporariamente desativado.', 503);

    $second = $segments[2] ?? '';
    $third = $segments[3] ?? '';
    $roomId = ctype_digit($second) ? (int) $second : null;
    if ($roomId !== null) touchSeat($pdo, $roomId, $userId);

    try {
        sweepRooms($pdo);
    } catch (Throwable $exception) {
        error_log('[jogartcg] limpeza de salas falhou: ' . $exception->getMessage());
    }

    try {
        if ($second === '' && $method === 'POST') {
            requireCsrf();
            $roomId = createRoom($pdo, $userId);
            respond(['success' => true, 'data' => roomPayload($pdo, $roomId, $userId)], 201);
        }
        if ($second === 'diagnostico' && $method === 'GET') {
        // Só para quem está logado. Mostra se o árbitro de regras está funcionando,
        // sem revelar caminho de arquivo ou detalhe do servidor.
        $started = microtime(true);
        $status = 'nao_testado';
        $detail = null;
        $compiled = ['compiladas' => 0, 'prontas' => 0];
        try {
            $counts = $pdo->query(
                'SELECT COUNT(rules_json) AS compiladas, SUM(rules_supported = 1) AS prontas
                 FROM lorcana_cards WHERE active = 1'
            )->fetch();
            $compiled = ['compiladas' => (int) $counts['compiladas'], 'prontas' => (int) $counts['prontas']];
            // Partida de teste com cartas reais: exercita o mesmo caminho de uma partida de verdade.
            $rows = $pdo->query(
                "SELECT source_id, name_en, full_name_en, type_en, cost, inkwell, strength, willpower, lore,
                        move_cost, subtypes_en_json, full_text_en
                 FROM lorcana_cards
                 WHERE active = 1 AND rules_supported = 1 AND type_en = 'Character'
                 ORDER BY source_id LIMIT 2"
            )->fetchAll();
            if (count($rows) < 2) throw new RefereeUnavailable('Catalogo sem regras compiladas: rode bin/compile_card_rules.php.');
            $entry = static fn(array $row): array => ['quantity' => 8, 'card' => [
                'id' => (int) $row['source_id'], 'name' => $row['name_en'], 'full_name' => $row['full_name_en'],
                'cost' => (int) $row['cost'], 'inkwell' => (bool) $row['inkwell'], 'strength' => (int) $row['strength'],
                'willpower' => (int) $row['willpower'], 'lore' => (int) $row['lore'], 'move_cost' => (int) $row['move_cost'],
                'image' => ['full' => '', 'thumbnail' => ''],
                'original' => [
                    'name' => $row['name_en'], 'full_name' => $row['full_name_en'], 'type' => $row['type_en'],
                    'full_text' => $row['full_text_en'], 'subtypes' => decodeJson($row['subtypes_en_json']) ?? [],
                ],
                'pt_br' => ['full_text' => $row['full_text_en']],
            ]];
            callReferee($pdo, [
                'op' => 'create', 'decks' => [1 => [$entry($rows[0])], 2 => [$entry($rows[1])]],
                'seed' => 1, 'names' => [1 => 'A', 2 => 'B'],
            ]);
            $status = 'ok';
        } catch (RefereeUnavailable $exception) {
            $status = 'falhou';
            $detail = $exception->getMessage();
        } catch (RuleViolation $exception) {
            $status = 'ok'; // respondeu, so recusou o teste
            $detail = $exception->getMessage();
        }
        respond(['success' => true, 'data' => [
            'modo' => 'php',
            'cartas_compiladas' => $compiled['compiladas'],
            'cartas_com_regras_completas' => $compiled['prontas'],
            'teste' => $status,
            'detalhe' => $detail,
            'tempo_ms' => (int) round((microtime(true) - $started) * 1000),
        ]]);
    }
    if ($second === 'current' && $method === 'GET') {
            $current = currentRoomId($pdo, $userId);
            if ($current !== null) touchSeat($pdo, $current, $userId);
            respond(['success' => true, 'data' => $current === null ? null : roomPayload($pdo, $current, $userId, true)]);
        }
        if ($second === 'join' && $method === 'POST') {
            requireCsrf();
            $payload = readRequestPayload();
            $roomId = joinRoom($pdo, $userId, trim((string) ($payload['code'] ?? '')));
            respond(['success' => true, 'data' => roomPayload($pdo, $roomId, $userId)]);
        }
        if ($roomId === null) roomError('endpoint_not_found', 'Rota nao encontrada.', 404);

        if ($third === '' && $method === 'GET') {
            respond(['success' => true, 'data' => roomPayload($pdo, $roomId, $userId, ($_GET['view'] ?? '') === '1')]);
        }
        if ($third === 'poll' && $method === 'GET') {
            requireRoomMembership($pdo, $roomId, $userId);
            pollRoom($pdo, $roomId, $userId);
        }
        if ($method !== 'POST') roomError('method_not_allowed', 'Metodo nao permitido.', 405);
        requireCsrf();
        $payload = readRequestPayload();

        if ($third === 'deck') {
            $deckId = (int) ($payload['deckId'] ?? 0);
            // Valida antes de travar: loadGameDeck e a leitura mais pesada.
            if ($deckId !== 0) requirePlayableDeck($pdo, $deckId, $userId);
            $pdo->beginTransaction();
            $membership = requireRoomMembership($pdo, $roomId, $userId, true);
            if ($membership['room']['status'] !== 'aguardando') {
                $pdo->rollBack();
                roomError('room_not_waiting', 'A partida ja comecou ou a sala foi encerrada.', 409);
            }
            // Trocar de deck sempre cancela a propria confirmacao.
            $pdo->prepare('UPDATE sala_jogadores SET deck_id = ?, pronto = 0 WHERE id = ?')
                ->execute([$deckId ?: null, $membership['seat']['id']]);
            bumpRoomRevision($pdo, $roomId);
            $pdo->commit();
            respond(['success' => true, 'data' => roomPayload($pdo, $roomId, $userId)]);
        }

        if ($third === 'ready') {
            $ready = filter_var($payload['ready'] ?? true, FILTER_VALIDATE_BOOLEAN);
            $pdo->beginTransaction();
            $membership = requireRoomMembership($pdo, $roomId, $userId, true);
            if ($membership['room']['status'] !== 'aguardando') {
                $pdo->rollBack();
                roomError('room_not_waiting', 'A partida ja comecou ou a sala foi encerrada.', 409);
            }
            if ($ready) {
                if ($membership['seat']['deck_id'] === null) {
                    $pdo->rollBack();
                    roomError('deck_required', 'Escolha um deck antes de confirmar.', 422);
                }
                // O deck pode ter sido editado depois de escolhido.
                $deck = loadGameDeck($pdo, (int) $membership['seat']['deck_id'], $userId, 'pt-BR');
                if ($deck === null || !($deck['validation']['valid'] ?? false) || !in_array($deck['format'], ['core', 'infinity'], true)) {
                    $pdo->rollBack();
                    roomError('invalid_deck', 'Este deck nao esta mais valido. Escolha outro.', 422, ['issues' => $deck['validation']['issues'] ?? []]);
                }
            }
            $pdo->prepare('UPDATE sala_jogadores SET pronto = ? WHERE id = ?')->execute([$ready ? 1 : 0, $membership['seat']['id']]);
            bumpRoomRevision($pdo, $roomId);
            if ($ready) startMatchIfReady($pdo, $roomId);
            $pdo->commit();
            respond(['success' => true, 'data' => roomPayload($pdo, $roomId, $userId, true)]);
        }

        if ($third === 'action') {
            $revision = filter_var($payload['revision'] ?? null, FILTER_VALIDATE_INT);
            $action = $payload['action'] ?? null;
            if ($revision === false || !is_array($action)) roomError('invalid_action', 'Jogada invalida.', 422);

            $pdo->beginTransaction();
            $membership = requireRoomMembership($pdo, $roomId, $userId, true);
            $matchStatement = $pdo->prepare('SELECT * FROM partidas WHERE sala_id = ? FOR UPDATE');
            $matchStatement->execute([$roomId]);
            $match = $matchStatement->fetch();
            if (!$match || $membership['room']['status'] !== 'em_jogo' || $match['status'] !== 'em_andamento') {
                $pdo->rollBack();
                roomError('match_not_active', 'Nao ha partida em andamento nesta sala.', 409);
            }
            if ((int) $match['revisao'] !== $revision) {
                // Envio duplicado ou baseado em uma mesa desatualizada: devolve a atual.
                $pdo->rollBack();
                roomError('stale_revision', 'A mesa mudou. Confira a jogada novamente.', 409, [
                    'data' => roomPayload($pdo, $roomId, $userId, true),
                ]);
            }
            try {
                $result = callReferee($pdo, [
                    'op' => 'apply', 'state' => json_decode((string) $match['estado_json'], true),
                    'seat' => (int) $membership['seat']['assento'], 'action' => $action, 'names' => seatNames($pdo, $roomId),
                ]);
            } catch (RuleViolation $violation) {
                $pdo->rollBack();
                roomError('illegal_action', $violation->getMessage(), 422);
            }
            unset($action['label'], $action['player']);
            storeRefereeResult($pdo, $match, $result, (int) $membership['seat']['assento'], 'acao', $action);
            $pdo->commit();
            respond(['success' => true, 'data' => roomPayload($pdo, $roomId, $userId, true)]);
        }

        if ($third === 'leave') {
            $pdo->beginTransaction();
            $membership = requireRoomMembership($pdo, $roomId, $userId, true);
            $room = $membership['room'];
            $seat = (int) $membership['seat']['assento'];
            if ($room['status'] === 'aguardando') {
                if ($seat === 1) {
                    closeRoom($pdo, $roomId, 'cancelada');
                } else {
                    $pdo->prepare('DELETE FROM sala_jogadores WHERE id = ?')->execute([$membership['seat']['id']]);
                    // O adversario mudou: quem ficou precisa confirmar de novo.
                    $pdo->prepare('UPDATE sala_jogadores SET pronto = 0 WHERE sala_id = ?')->execute([$roomId]);
                    bumpRoomRevision($pdo, $roomId);
                }
            } elseif ($room['status'] === 'em_jogo') {
                $matchStatement = $pdo->prepare('SELECT * FROM partidas WHERE sala_id = ? FOR UPDATE');
                $matchStatement->execute([$roomId]);
                $match = $matchStatement->fetch();
                if ($match && $match['status'] === 'em_andamento') concedeSeat($pdo, $match, $seat, 'desistencia');
                else closeRoom($pdo, $roomId, 'fim_de_jogo');
            } else {
                $pdo->prepare('UPDATE sala_jogadores SET ativo_usuario_id = NULL WHERE id = ?')->execute([$membership['seat']['id']]);
            }
            $pdo->commit();
            respond(['success' => true, 'message' => 'Voce saiu da sala.']);
        }

        roomError('endpoint_not_found', 'Rota nao encontrada.', 404);
    } catch (RefereeUnavailable $exception) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        error_log('[jogartcg] ' . $exception->getMessage());
        roomError('referee_unavailable', 'O servidor de regras esta indisponivel. Tente novamente em instantes.', 503);
    }
}
