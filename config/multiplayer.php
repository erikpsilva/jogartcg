<?php

declare(strict_types=1);

/**
 * Tempos das salas multiplayer (segundos, salvo indicacao).
 *
 * O cliente faz long polling de ate MULTIPLAYER_LONG_POLL_SECONDS; cada poll
 * renova a presenca. Um jogador so e considerado ausente depois de perder
 * varios polls seguidos, para que uma oscilacao de rede nao encerre a sala.
 */
const MULTIPLAYER_ROOM_WAIT_MINUTES = 30;       // lobby sem inicio expira
const MULTIPLAYER_LOBBY_ABSENCE_SECONDS = 90;   // saiu do lobby sem avisar
const MULTIPLAYER_MATCH_ABSENCE_SECONDS = 180;  // desconectado durante a partida
const MULTIPLAYER_CONNECTED_SECONDS = 30;       // selo "conectado" para o adversario
const MULTIPLAYER_LONG_POLL_SECONDS = 20;
const MULTIPLAYER_POLL_STEP_MICROSECONDS = 500000;
const MULTIPLAYER_REFEREE_TIMEOUT_SECONDS = 20;

/**
 * Binario do Node usado pelo arbitro de regras.
 * Configure JOGARTCG_NODE_BINARY quando o Node nao estiver no PATH do Apache.
 */
function multiplayerNodeBinary(): string
{
    $configured = getenv('JOGARTCG_NODE_BINARY') ?: ($_SERVER['JOGARTCG_NODE_BINARY'] ?? '');
    if (is_string($configured) && $configured !== '') {
        return $configured;
    }
    // O Apache do XAMPP costuma rodar sem o PATH do usuario no Windows.
    $windowsDefault = 'C:\\Program Files\\nodejs\\node.exe';
    if (PHP_OS_FAMILY === 'Windows' && is_file($windowsDefault)) {
        return $windowsDefault;
    }
    return 'node';
}

/**
 * Prefere o pacote unico (motor embutido, sem node_modules): e o unico que a
 * release envia, porque o link de workspace para o game-core nao sobrevive ao FTP.
 */
function multiplayerRefereeScript(): string
{
    $dist = dirname(__DIR__) . '/services/game-server/dist';
    $bundle = $dist . '/referee.bundle.mjs';
    return is_file($bundle) ? $bundle : $dist . '/referee.js';
}

final class RefereeUnavailable extends RuntimeException {}
final class RuleViolation extends RuntimeException {}

/**
 * Executa uma operacao no arbitro de regras (motor compartilhado em TypeScript).
 *
 * @throws RuleViolation     quando o motor recusa a jogada (mensagem para o jogador)
 * @throws RefereeUnavailable quando o processo nao pode ser executado
 */
function callReferee(array $request): array
{
    $script = multiplayerRefereeScript();
    if (!is_file($script)) {
        throw new RefereeUnavailable('Arbitro de regras nao compilado: ' . $script);
    }

    $pipes = [];
    $process = proc_open(
        [multiplayerNodeBinary(), $script],
        [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']],
        $pipes,
        dirname($script)
    );
    if (!is_resource($process)) {
        throw new RefereeUnavailable('Nao foi possivel iniciar o Node.');
    }

    $started = microtime(true);
    // O arbitro le a entrada inteira antes de escrever, entao escrever tudo
    // primeiro e depois ler nao trava os pipes.
    fwrite($pipes[0], json_encode($request, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR));
    fclose($pipes[0]);
    $stdout = stream_get_contents($pipes[1]);
    $stderr = stream_get_contents($pipes[2]);
    fclose($pipes[1]);
    fclose($pipes[2]);
    $exitCode = proc_close($process);

    if (microtime(true) - $started > MULTIPLAYER_REFEREE_TIMEOUT_SECONDS) {
        error_log('[jogartcg] arbitro lento: ' . round(microtime(true) - $started, 2) . 's');
    }

    $decoded = is_string($stdout) ? json_decode($stdout, true) : null;
    if (!is_array($decoded)) {
        error_log('[jogartcg] arbitro falhou (exit ' . $exitCode . '): ' . substr((string) $stderr, 0, 2000));
        throw new RefereeUnavailable('Resposta invalida do arbitro de regras.');
    }
    if (($decoded['ok'] ?? false) !== true) {
        throw new RuleViolation((string) ($decoded['error'] ?? 'Jogada recusada.'));
    }
    return $decoded;
}
