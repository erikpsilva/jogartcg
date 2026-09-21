<?php
declare(strict_types=1);

/** Additive migration, invoked only by an authenticated administrator/CLI. */
function initializePlayerAccessSchema(PDO $pdo): void
{
    $sqlite = $pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'sqlite';
    $columns = $sqlite
        ? array_column($pdo->query('PRAGMA table_info(usuarios)')->fetchAll(PDO::FETCH_ASSOC), 'name')
        : $pdo->query('SHOW COLUMNS FROM usuarios')->fetchAll(PDO::FETCH_COLUMN);
    foreach (['beta_tester' => 'TINYINT NOT NULL DEFAULT 0', 'session_version' => 'INT NOT NULL DEFAULT 1'] as $column => $definition) {
        if (in_array($column, $columns, true)) continue;
        try { $pdo->exec("ALTER TABLE usuarios ADD COLUMN {$column} {$definition}"); }
        catch (PDOException $error) {
            // A second admin request may have installed the same column concurrently.
            if (($error->errorInfo[1] ?? null) !== 1060) throw $error;
        }
    }
}

function playerSessionMatches(array $row, array $session): bool
{
    return ($row['status'] ?? '') === 'ativo'
        && (int) ($session['user_id'] ?? 0) === (int) $row['id']
        && (int) ($session['player_version'] ?? 1) === (int) ($row['session_version'] ?? 1);
}

function playerMayPlay(bool $publicEnabled, ?array $user): bool
{
    return $publicEnabled || ($user !== null && (bool) ($user['beta_tester'] ?? false));
}
