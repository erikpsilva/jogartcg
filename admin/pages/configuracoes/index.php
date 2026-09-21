<?php
require ROOT . '/admin/includes/auth_check.php';
require_once ROOT . '/config/database.php';
require_once ROOT . '/admin/includes/settings.php';
$pdo = getDbConnection();
if (!canManageSettings($pdo, $_SESSION)) {
    http_response_code(403);
    echo 'Somente administradores podem alterar as configurações.';
    exit;
}
$_SESSION['admin_csrf'] ??= bin2hex(random_bytes(32));
$settingsError = null;
$settingsReady = false;
try {
    initializeSiteSettings($pdo);
    $settingsReady = true;
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $settingsError = validateSettingsChange($_POST, $_SESSION['admin_csrf']);
        if ($settingsError === null) {
            savePlaySetting($pdo, isset($_POST['play_enabled']));
            $_SESSION['settings_saved'] = true;
            header('Location: ' . ADMIN_BASE_URL . '/configuracoes', true, 303);
            exit;
        }
        http_response_code(422);
    }
    $playEnabled = publicSiteSettings($pdo)['play_enabled'];
} catch (Throwable $error) {
    $settingsReady = false;
    $playEnabled = false;
    $settingsError = 'Não foi possível acessar as configurações. Confira a conexão e a permissão de criar a tabela site_settings no banco.';
    http_response_code(503);
}
$settingsSaved = !empty($_SESSION['settings_saved']);
unset($_SESSION['settings_saved']);
?>
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><title>Configurações · Admin · Jogar TCG</title><?php include ROOT . '/admin/includes/assets.php'; ?></head>
<body>
<?php include ROOT . '/admin/includes/header/header.php'; ?>
<div class="adminLayout">
    <?php include ROOT . '/admin/includes/sidebar/sidebar.php'; ?>
    <main class="adminLayout__content">
        <header class="adminPageHeading"><span class="adminEyebrow">Controle da plataforma</span><h1>Configurações<span>.</span></h1><p>Defina o que fica disponível para os jogadores.</p></header>
        <?php if ($settingsSaved): ?><div class="formAlert formAlert--success" role="status">Configurações salvas. O acesso ao jogo está <?= $playEnabled ? 'ativado' : 'desativado' ?>.</div><?php endif; ?>
        <?php if ($settingsError): ?><div class="formAlert formAlert--error" role="alert"><?= htmlspecialchars($settingsError) ?></div><?php endif; ?>
        <form class="settingsPanel" method="post" action="<?= ADMIN_BASE_URL ?>/configuracoes">
            <input type="hidden" name="csrf" value="<?= htmlspecialchars($_SESSION['admin_csrf']) ?>">
            <div class="settingsPanel__heading"><span class="adminIcon" aria-hidden="true">◇</span><div><h2>Acesso à arena</h2><p>Disponibilidade do menu e da mesa de jogo.</p></div><span class="statusPill <?= $playEnabled ? 'statusPill--on' : '' ?>"><?= $playEnabled ? 'Ativado' : 'Desativado' ?></span></div>
            <label class="settingSwitch" for="play-enabled"><span><strong>Ativar menu Jogar</strong><small>Mostra o menu no site e permite abrir a arena, o treino contra o bot e a mesa de teste.</small></span><input type="checkbox" role="switch" id="play-enabled" name="play_enabled" value="1" <?= $playEnabled ? 'checked' : '' ?> <?= !$settingsReady ? 'disabled' : '' ?>><i aria-hidden="true"></i></label>
            <div class="settingsNotice"><span aria-hidden="true">↳</span><p>Ao desativar, os links para jogar são ocultados e o acesso direto à arena fica indisponível para o público. <strong>Beta testers ativos e logados continuam com acesso.</strong> Gerencie essa permissão em <a href="<?= ADMIN_BASE_URL ?>/usuarios-site">Usuários do site</a>. O catálogo e os decks continuam funcionando normalmente.</p></div>
            <div class="settingsPanel__footer"><p>A configuração vale para o ambiente em que este admin está aberto. Páginas já abertas verificam a alteração em até 15 segundos.</p><button class="btn btn--primary" type="submit" <?= !$settingsReady ? 'disabled' : '' ?>>Salvar configurações</button></div>
        </form>
        <p class="adminFootnote">Nenhum deck, carta ou conta será apagado ao alterar esta opção.</p>
    </main>
</div>
<?php include ROOT . '/admin/includes/scripts.php'; ?>
</body></html>
