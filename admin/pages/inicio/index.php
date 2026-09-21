<?php include ROOT . '/admin/includes/auth_check.php'; ?>
<!DOCTYPE html>
<html lang="pt-BR">
<head>
<title>Jogar TCG - Admin - Início</title>
<?php include ROOT . '/admin/includes/assets.php'; ?>
</head>
<body>

<?php include ROOT . '/admin/includes/header/header.php'; ?>

<div class="adminLayout">
    <?php include ROOT . '/admin/includes/sidebar/sidebar.php'; ?>
    <main class="adminLayout__content">

        <section class="adminInicio">
            <header class="adminPageHeading"><span class="adminEyebrow">Painel Jogar TCG</span><h1>Sua plataforma<span>.</span></h1><p>Gerencie o acesso à arena e os dados da administração.</p></header>
            <div class="adminCards">
                <?php if ($_SESSION['usuario']['nivel_acesso'] === 'admin'): ?>
                <article class="adminCard"><span class="adminIcon" aria-hidden="true"><i class="fa-solid fa-users"></i></span><h2>Usuários do site</h2><p>Consulte os jogadores, edite seus perfis e libere o acesso aos beta testers.</p><a class="btn btn--primary" href="<?= ADMIN_BASE_URL ?>/usuarios-site">Gerenciar usuários</a></article>
                <article class="adminCard"><span class="adminIcon" aria-hidden="true">◇</span><h2>Configurações</h2><p>Ative ou desative o menu Jogar e controle a disponibilidade da arena.</p><a class="btn btn--primary" href="<?= ADMIN_BASE_URL ?>/configuracoes">Gerenciar configurações</a></article>
                <?php endif; ?>
                <article class="adminCard"><span class="adminIcon" aria-hidden="true">↗</span><h2>A plataforma em jogo</h2><p>Consulte o catálogo, confira as cartas e acompanhe a experiência dos jogadores.</p><a class="btn btn--gray" href="<?= BASE_URL ?>/client/#/cartas">Abrir o site</a></article>
            </div>
        </section>

    </main>
</div>

<?php include ROOT . '/admin/includes/footer/footer.php'; ?>
<?php include ROOT . '/admin/includes/scripts.php'; ?>

</body>
</html>
