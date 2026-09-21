<?php
declare(strict_types=1);
require_once dirname(__DIR__, 2) . '/config/site_settings.php';

function canManageSettings(PDO $pdo, array $session): bool
{
    $id = $session['usuario']['id'] ?? null;
    if (!is_int($id) && !(is_string($id) && ctype_digit($id))) return false;
    $statement = $pdo->prepare('SELECT nivel_acesso FROM admin_usuarios WHERE id = ?');
    $statement->execute([(int) $id]);
    return $statement->fetchColumn() === 'admin';
}

function validateSettingsChange(array $post, string $csrf): ?string
{
    if ($csrf === '' || !is_string($post['csrf'] ?? null) || !hash_equals($csrf, $post['csrf'])) {
        return 'Sua sessão de segurança expirou. Atualize a página e tente novamente.';
    }
    if (isset($post['play_enabled']) && $post['play_enabled'] !== '1') {
        return 'Escolha uma opção válida para o menu Jogar.';
    }
    return null;
}
