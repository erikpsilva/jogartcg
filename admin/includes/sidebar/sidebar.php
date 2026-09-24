<aside class="sidebar" id="adminSidebar">
    <div class="sidebar__heading"><span>Administração</span><button type="button" id="closeSidebar" aria-label="Fechar menu">×</button></div>
    <nav class="sidebar__nav" aria-label="Menu administrativo">
        <ul class="sidebar__menu">

            <li class="sidebar__item">
                <a href="<?= BASE_URL ?>/admin/inicio"
                   class="sidebar__link <?= ($subRoute === 'inicio') ? 'sidebar__link--active' : '' ?>">
                    <i class="fa-solid fa-gauge-high" aria-hidden="true"></i> Visão geral
                </a>
            </li>

            <li class="sidebar__item">
                <a href="<?= BASE_URL ?>/admin/meusdados"
                   class="sidebar__link <?= ($subRoute === 'meusdados') ? 'sidebar__link--active' : '' ?>">
                    <i class="fa-regular fa-user" aria-hidden="true"></i> Meus dados
                </a>
            </li>

            <?php if ($_SESSION['usuario']['nivel_acesso'] === 'admin'): ?>
            <li class="sidebar__item">
                <a href="<?= adminUrl('usuarios-site') ?>" class="sidebar__link <?= $subRoute === 'usuarios-site' ? 'sidebar__link--active' : '' ?>"><i class="fa-solid fa-users" aria-hidden="true"></i> Usuários do site</a>
            </li>
            <li class="sidebar__item">
                <a href="<?= adminUrl('configuracoes') ?>" class="sidebar__link <?= $subRoute === 'configuracoes' ? 'sidebar__link--active' : '' ?>"><i class="fa-solid fa-sliders" aria-hidden="true"></i> Configurações</a>
            </li>
            <li class="sidebar__item">
                <a href="<?= BASE_URL ?>/admin/cadastrarusuario"
                   class="sidebar__link <?= ($subRoute === 'cadastrarusuario') ? 'sidebar__link--active' : '' ?>">
                    <i class="fa-solid fa-user-plus" aria-hidden="true"></i> Cadastrar usuário
                </a>
            </li>
            <?php endif; ?>

        </ul>
    </nav>
    <div class="sidebar__note"><span class="sidebar__note-dot"></span><span>Jogar TCG<small>Gestão da plataforma</small></span></div>
</aside>

<div class="sidebar__overlay" id="sidebarOverlay"></div>
