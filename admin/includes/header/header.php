<header class="header">
    <div class="container-fluid">
        <div class="row header__row">

            <div class="col-6 header__logo">
                <button class="header__hamburger" id="toggleSidebar">
                    <span></span>
                    <span></span>
                    <span></span>
                </button>
                <img src="<?= ADMIN_BASE_URL ?>/images/logo.png" alt="logo" />
            </div>

            <div class="col-6 header__user">
                <span class="header__user__name">
                    <?= htmlspecialchars($_SESSION['usuario']['nome_completo']) ?>
                </span>
                <a href="<?= BASE_URL ?>/admin/logout" class="btn btn--gray header__user__logout">
                    Sair
                </a>
            </div>

        </div>
    </div>
</header>
