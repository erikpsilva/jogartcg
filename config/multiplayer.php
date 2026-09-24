<?php

declare(strict_types=1);

/**
 * Salas multiplayer: tempos de espera e o arbitro de regras.
 *
 * O cliente faz long polling de ate MULTIPLAYER_LONG_POLL_SECONDS; cada poll
 * renova a presenca. Um jogador so e considerado ausente depois de perder
 * varios polls seguidos, para que uma oscilacao de rede nao encerre a sala.
 *
 * O arbitro roda dentro do proprio PHP (config/game/), com o motor de regras
 * portado do motor original em TypeScript. Nao existe processo externo: o site
 * precisa apenas de PHP e MySQL. tests/game/engine_equivalence_test.php prova
 * que os dois motores jogam exatamente igual.
 */

require_once __DIR__ . '/game/match.php';

const MULTIPLAYER_ROOM_WAIT_MINUTES = 30;       // lobby sem inicio expira
const MULTIPLAYER_LOBBY_ABSENCE_SECONDS = 90;   // saiu do lobby sem avisar
const MULTIPLAYER_MATCH_ABSENCE_SECONDS = 180;  // desconectado durante a partida
const MULTIPLAYER_CONNECTED_SECONDS = 30;       // selo "conectado" para o adversario
const MULTIPLAYER_LONG_POLL_SECONDS = 20;
const MULTIPLAYER_POLL_STEP_MICROSECONDS = 500000;

/** O arbitro nao pode decidir a partida (deck sem regras, estado corrompido...). */
final class RefereeUnavailable extends RuntimeException {}
/** A jogada fere as regras; a mensagem e mostrada ao jogador. */
final class RuleViolation extends RuntimeException {}

/** Estado, resumo e a visao de cada assento, no formato que a API grava e devolve. */
function refereeReply(array $state, array $names): array
{
    return [
        'ok' => true,
        'state' => $state,
        'summary' => gameMatchSummary($state),
        'views' => [
            1 => gameViewForSeat($state, 1, ['opponent' => $names[2]]),
            2 => gameViewForSeat($state, 2, ['opponent' => $names[1]]),
        ],
    ];
}

/**
 * Executa uma operacao do arbitro de regras.
 *
 *   ['op' => 'create', 'decks' => [1 => itens, 2 => itens], 'seed' => int, 'names' => [1 => ..., 2 => ...]]
 *   ['op' => 'apply', 'state' => estado, 'seat' => 1|2, 'action' => jogada, 'names' => [...]]
 *
 * @throws RuleViolation      quando o motor recusa a jogada
 * @throws RefereeUnavailable quando a partida nao pode ser decidida
 */
function callReferee(PDO $pdo, array $request): array
{
    $names = $request['names'];
    try {
        if (($request['op'] ?? '') === 'create') {
            $seed = $request['seed'] ?? null;
            if (!is_int($seed)) throw new RefereeUnavailable('Semente inválida.');
            return refereeReply(gameCreateSeated($pdo, $request['decks'], $seed), $names);
        }
        if (($request['op'] ?? '') === 'apply') {
            $seat = $request['seat'] ?? null;
            if ($seat !== 1 && $seat !== 2) throw new RefereeUnavailable('Assento inválido.');
            return refereeReply(gameApplySeatAction($request['state'], $seat, $request['action']), $names);
        }
        throw new RefereeUnavailable('Operação desconhecida.');
    } catch (GameRuleError $error) {
        // Numa jogada, e recusa de regra e a mensagem ja esta escrita para o jogador.
        // Na criacao, e problema do deck ou do catalogo: ninguem fez nada errado na mesa.
        if (($request['op'] ?? '') === 'apply') throw new RuleViolation($error->getMessage());
        error_log('[jogartcg] arbitro nao criou a partida: ' . $error->getMessage());
        throw new RefereeUnavailable($error->getMessage());
    } catch (RefereeUnavailable | RuleViolation $error) {
        throw $error;
    } catch (Throwable $error) {
        error_log('[jogartcg] arbitro falhou: ' . $error->getMessage());
        throw new RefereeUnavailable('Nao foi possivel decidir a jogada.');
    }
}
