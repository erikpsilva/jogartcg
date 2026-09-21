<?php

declare(strict_types=1);

function apiBasePath(): string
{
    $script = str_replace('\\', '/', (string) ($_SERVER['SCRIPT_NAME'] ?? '/api/index.php'));
    $position = strpos($script, '/api/');
    return $position === false ? '' : rtrim(substr($script, 0, $position), '/');
}

function startPlayerSession(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }

    $secure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');

    session_name('JOGARTCGSESSID');
    session_set_cookie_params([
        'lifetime' => 60 * 60 * 24 * 30,
        'path' => (apiBasePath() ?: '') . '/',
        'secure' => $secure,
        'httponly' => true,
        'samesite' => $secure ? 'None' : 'Lax',
    ]);
    session_start();
}

function csrfToken(): string
{
    startPlayerSession();
    if (empty($_SESSION['csrf_token'])) {
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    }
    return (string) $_SESSION['csrf_token'];
}

function requireCsrf(): void
{
    $provided = (string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? '');
    if ($provided === '' || !hash_equals(csrfToken(), $provided)) {
        respond([
            'success' => false,
            'error' => 'invalid_csrf_token',
            'message' => 'Sua sessao mudou. Atualize a pagina e tente novamente.',
        ], 419);
    }
}

function currentUserId(): ?int
{
    startPlayerSession();
    return isset($_SESSION['user_id']) ? (int) $_SESSION['user_id'] : null;
}

function requireUserId(): int
{
    $userId = currentUserId();
    if ($userId === null) {
        respond([
            'success' => false,
            'error' => 'authentication_required',
            'message' => 'Entre na sua conta para continuar.',
        ], 401);
    }
    return $userId;
}

function avatarPublicUrl(?string $storedPath): ?string
{
    if (!$storedPath) {
        return null;
    }
    return (apiBasePath() ?: '') . '/' . ltrim($storedPath, '/');
}

function publicUser(array $row): array
{
    return [
        'id' => (int) $row['id'],
        'nome' => $row['nome'],
        'sobrenome' => $row['sobrenome'],
        'email' => $row['email'],
        'foto_perfil' => avatarPublicUrl($row['foto_perfil'] ?? null),
    ];
}

function loadCurrentUser(PDO $pdo): ?array
{
    $userId = currentUserId();
    if ($userId === null) {
        return null;
    }

    $statement = $pdo->prepare(
        'SELECT id, nome, sobrenome, email, foto_perfil, status FROM usuarios WHERE id = ? LIMIT 1'
    );
    $statement->execute([$userId]);
    $user = $statement->fetch();

    if (!$user || $user['status'] !== 'ativo') {
        unset($_SESSION['user_id']);
        return null;
    }
    return publicUser($user);
}

