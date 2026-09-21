<header class="header">
    <div class="header__logo">
        <button class="header__hamburger" id="toggleSidebar" type="button" aria-label="Abrir menu" aria-controls="adminSidebar" aria-expanded="false"><span></span><span></span><span></span></button>
        <a href="<?= ADMIN_BASE_URL ?>/inicio"><img src="<?= BASE_URL ?>/client/brand/logo-jogar-tcg.png" alt="Jogar TCG" /></a>
        <span class="header__caption">Painel administrativo</span>
    </div>
    <div class="header__user">
        <span class="header__user__name"><?= htmlspecialchars($_SESSION['usuario']['nome_completo']) ?></span>
        <a href="<?= BASE_URL ?>/client/#/cartas" class="header__site">Ver site <span aria-hidden="true">↗</span></a>
        <a href="<?= ADMIN_BASE_URL ?>/logout" class="btn btn--gray header__user__logout">Sair</a>
    </div>
</header>
