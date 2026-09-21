<aside class="sidebar">
    <nav class="sidebar__nav">
        <ul class="sidebar__menu">

            <li class="sidebar__item">
                <a href="<?= BASE_URL ?>/admin/inicio"
                   class="sidebar__link <?= ($subRoute === 'inicio') ? 'sidebar__link--active' : '' ?>">
                    Início
                </a>
            </li>

            <li class="sidebar__item">
                <a href="<?= BASE_URL ?>/admin/meusdados"
                   class="sidebar__link <?= ($subRoute === 'meusdados') ? 'sidebar__link--active' : '' ?>">
                    Meus Dados
                </a>
            </li>

            <?php if ($_SESSION['usuario']['nivel_acesso'] === 'admin'): ?>
            <li class="sidebar__item">
                <a href="<?= BASE_URL ?>/admin/cadastrarusuario"
                   class="sidebar__link <?= ($subRoute === 'cadastrarusuario') ? 'sidebar__link--active' : '' ?>">
                    Cadastrar Usuário
                </a>
            </li>
            <?php endif; ?>

        </ul>
    </nav>
</aside>

<div class="sidebar__overlay" id="sidebarOverlay"></div>
