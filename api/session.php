<?php

declare(strict_types=1);
require_once dirname(__DIR__) . '/config/player_access.php';
require_once dirname(__DIR__) . '/config/site_settings.php';

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
        // 403, nao 419: o Apache nao conhece o 419 e o transforma em 500.
        respond([
            'success' => false,
            'error' => 'invalid_csrf_token',
            'message' => 'Sua sessao mudou. Atualize a pagina e tente novamente.',
        ], 403);
    }
}

function currentUserId(): ?int
{
    startPlayerSession();
    return isset($_SESSION['user_id']) ? (int) $_SESSION['user_id'] : null;
}

function requireUserId(PDO $pdo): int
{
    $user = loadAuthenticatedPlayerRow($pdo);
    if ($user === null) {
        respond([
            'success' => false,
            'error' => 'authentication_required',
            'message' => 'Entre na sua conta para continuar.',
        ], 401);
    }
    return (int) $user['id'];
}

function avatarPublicUrl(?string $storedPath): ?string
{
    if (!$storedPath) {
        return null;
    }
    return (apiBasePath() ?: '') . '/' . ltrim($storedPath, '/');
}

function playerCanAccessShop(array $row): bool
{
    return !empty($row['id']);
}

function publicUser(array $row): array
{
    return [
        'id' => (int) $row['id'],
        'nome' => $row['nome'],
        'sobrenome' => $row['sobrenome'],
        'email' => $row['email'],
        'foto_perfil' => avatarPublicUrl($row['foto_perfil'] ?? null),
        'beta_tester' => (bool) ($row['beta_tester'] ?? false),
        'adventure_access' => true,
        'shop_access' => playerCanAccessShop($row),
    ];
}

function loadAuthenticatedPlayerRow(PDO $pdo): ?array
{
    $userId = currentUserId();
    if ($userId === null) {
        return null;
    }

    $statement = $pdo->prepare(
        'SELECT * FROM usuarios WHERE id = ? LIMIT 1'
    );
    $statement->execute([$userId]);
    $user = $statement->fetch();

    if (!$user || !playerSessionMatches($user, $_SESSION)) {
        unset($_SESSION['user_id'], $_SESSION['player_version'], $_SESSION['csrf_token']);
        return null;
    }
    return $user;
}

function loadCurrentUser(PDO $pdo): ?array
{
    $row = loadAuthenticatedPlayerRow($pdo);
    return $row ? publicUser($row) : null;
}

function viewerSiteSettings(PDO $pdo): array
{
    $settings = publicSiteSettings($pdo);
    $user = loadCurrentUser($pdo);
    return $settings + ['can_play' => playerMayPlay($settings['play_enabled'], $user), 'viewer_id' => $user['id'] ?? null];
}
