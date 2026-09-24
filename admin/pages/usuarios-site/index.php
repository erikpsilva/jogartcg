<?php
require ROOT . '/admin/includes/auth_check.php';
require_once ROOT . '/config/database.php';
require_once ROOT . '/admin/includes/site_users.php';
$pdo = getDbConnection();
if (!canManageSettings($pdo, $_SESSION)) { http_response_code(403); echo 'Somente administradores podem gerenciar usuários do site.'; exit; }
if (!in_array($_SERVER['REQUEST_METHOD'], ['GET','POST'], true)) { header('Allow: GET, POST'); http_response_code(405); exit; }
$_SESSION['admin_csrf'] ??= bin2hex(random_bytes(32));
$isPost = $_SERVER['REQUEST_METHOD'] === 'POST';
$id = siteUserId($isPost ? ($_POST['id'] ?? null) : ($_GET['id'] ?? null));
$deleteView = ($isPost ? ($_POST['action'] ?? '') === 'delete' : ($_GET['acao'] ?? '') === 'excluir');
$problem = null; $errors = []; $user = null; $listing = null; $ready = false;
try {
    initializePlayerAccessSchema($pdo);
    $ready = true;
    if ($isPost) {
        try {
            $result = mutateSiteUser($pdo, $_SESSION, $_POST, $_FILES['photo'] ?? null);
            $_SESSION['site_users_flash'] = $result['deleted']
                ? 'Conta excluída permanentemente, junto com ' . $result['decks_removed'] . ' deck(s).'
                : 'Perfil atualizado.' . ($result['sessions_revoked'] ? ' As sessões anteriores foram encerradas; o jogador deverá entrar novamente.' : '');
            if (!empty($result['photo_cleanup_pending'])) $_SESSION['site_users_flash'] .= ' A limpeza do arquivo antigo de foto precisa ser conferida.';
            header('Location: ' . ADMIN_BASE_URL . '/usuarios-site' . ($result['deleted'] ? '' : '?id=' . $id), true, 303); exit;
        } catch (SiteUserProblem $error) { $problem = $error->getMessage(); $errors = $error->fields; http_response_code($error->status); }
    }
    if ($id) {
        $user = loadSiteUser($pdo, $id);
        if (!$user) { $problem = 'Usuário não encontrado. A conta pode ter sido excluída.'; http_response_code(404); }
    } elseif (array_key_exists('id', $_GET) || $isPost) {
        $problem = 'Usuário não encontrado.'; http_response_code(404);
    } else $listing = listSiteUsers($pdo, $_GET);
} catch (Throwable) { $ready = false; $problem = 'Não foi possível carregar os usuários. Confira o banco e a migração de permissões dos jogadores.'; http_response_code(503); }
$flash = $_SESSION['site_users_flash'] ?? null; unset($_SESSION['site_users_flash']);
function suEscape(mixed $value): string { return htmlspecialchars((string) $value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); }
function suAvatar(?string $photo): ?string { return isManagedProfilePhoto($photo) ? BASE_URL . '/' . $photo : null; }
function suDate(string $value): string { $date = strtotime($value); return $date ? date('d/m/Y H:i', $date) : '—'; }
function suField(string $key, string $label, string $type, string $value, array $errors, int $max = 190, bool $required = true): void {
    $error = $errors[$key] ?? ''; ?>
    <div class="formGroup__item"><label for="su-<?= suEscape($key) ?>"><?= suEscape($label) ?></label><input id="su-<?= suEscape($key) ?>" name="<?= suEscape($key) ?>" type="<?= suEscape($type) ?>" value="<?= suEscape($value) ?>" maxlength="<?= $max ?>" <?= $required ? 'required' : '' ?> <?= $type === 'password' ? 'autocomplete="new-password"' : '' ?> aria-invalid="<?= $error ? 'true' : 'false' ?>" aria-describedby="error-<?= suEscape($key) ?>"><span class="errorText <?= $error ? 'show' : '' ?>" id="error-<?= suEscape($key) ?>" aria-live="polite"><?= suEscape($error) ?></span></div>
<?php }
$values = $user ? ['firstName'=>$user['nome'],'lastName'=>$user['sobrenome'],'email'=>$user['email'],'cpf'=>$user['cpf'],'phone'=>$user['telefone'] ?? '', 'birthDate'=>$user['data_nascimento'],'status'=>$user['status'],'beta_tester'=>(bool)$user['beta_tester'], 'remove_photo'=>false] : [];
if ($isPost && !$deleteView && $user) {
    foreach (['firstName','lastName','email','cpf','phone','birthDate','status'] as $key) $values[$key] = siteUserText($_POST, $key);
    $values['beta_tester'] = ($_POST['beta_tester'] ?? '') === '1'; $values['remove_photo'] = ($_POST['remove_photo'] ?? '') === '1';
}
?>
<!doctype html><html lang="pt-BR"><head><title>Usuários do site · Admin · Jogar TCG</title><?php include ROOT . '/admin/includes/assets.php'; ?></head><body>
<?php include ROOT . '/admin/includes/header/header.php'; ?>
<div class="adminLayout"><?php include ROOT . '/admin/includes/sidebar/sidebar.php'; ?><main class="adminLayout__content siteUsers">
    <header class="adminPageHeading"><span class="adminEyebrow">Comunidade Jogar TCG</span><h1><?= $user ? ($deleteView ? 'Excluir conta' : 'Perfil do jogador') : 'Usuários do site' ?><span>.</span></h1><p><?= $user ? 'Gerencie os dados e o acesso desta conta do site.' : 'Todos os jogadores cadastrados, com controle de acesso ao beta.' ?></p></header>
    <?php if ($flash): ?><div class="formAlert formAlert--success" role="status"><?= suEscape($flash) ?></div><?php endif; ?>
    <?php if ($problem): ?><div class="formAlert formAlert--error" role="alert"><?= suEscape($problem) ?> <?php if ($id && $user): ?><a href="<?= adminUrl('usuarios-site', ['id' => $id]) ?>">Reabrir perfil</a><?php endif; ?></div><?php endif; ?>
    <?php if ($listing): ?>
    <div class="siteUsers__stats" aria-label="Resumo de cadastros"><article><strong><?= (int)$listing['stats']['total'] ?></strong><span>Usuários cadastrados</span></article><article><strong><?= (int)$listing['stats']['active'] ?></strong><span>Contas ativas</span></article><article><strong><?= (int)$listing['stats']['beta'] ?></strong><span>Beta testers</span></article></div>
    <form method="get" class="siteUsers__filters formGroup" action="<?= adminUrl('usuarios-site') ?>"><input type="hidden" name="p" value="usuarios-site" /><div class="formGroup__item siteUsers__search"><label for="su-search">Buscar jogador</label><input id="su-search" type="search" name="q" value="<?= suEscape($listing['q']) ?>" placeholder="Nome, e-mail ou CPF" maxlength="190"></div><div class="formGroup__item"><label for="su-status-filter">Status</label><select id="su-status-filter" name="status"><option value="">Todos</option value="ativo" <?= $listing['status']==='ativo'?'selected':'' ?>>Ativos</option><option value="inativo" <?= $listing['status']==='inativo'?'selected':'' ?>>Inativos</option></select></div><div class="formGroup__item"><label for="su-beta-filter">Acesso beta</label><select id="su-beta-filter" name="beta"><option value="">Todos</option><option value="1" <?= $listing['beta']==='1'?'selected':'' ?>>Beta testers</option><option value="0" <?= $listing['beta']==='0'?'selected':'' ?>>Sem acesso beta</option></select></div><button class="btn btn--primary" type="submit">Filtrar</button><a class="siteUsers__clear" href="<?= adminUrl('usuarios-site') ?>">Limpar</a></form>
    <div class="siteUsers__listHeading"><h2>Jogadores</h2><span><?= $listing['total'] ?> resultado(s)</span></div>
    <?php if (!$listing['users']): ?><div class="adminCard siteUsers__empty"><h2>Nenhum usuário encontrado</h2><p>Os novos cadastros do site aparecem aqui automaticamente. Experimente limpar os filtros.</p></div><?php else: ?>
    <div class="siteUsers__tableWrap"><table class="siteUsers__table"><caption class="siteUsers__srOnly">Usuários cadastrados no site</caption><thead><tr><th scope="col">Jogador</th><th scope="col">E-mail</th><th scope="col">Status / acesso</th><th scope="col">Cadastro</th><th scope="col">Perfil</th></tr></thead><tbody>
    <?php foreach ($listing['users'] as $player): $avatar = suAvatar($player['foto_perfil']); ?>
        <tr><td data-label="Jogador"><a class="siteUserIdentity" href="<?= adminUrl('usuarios-site', ['id' => '<?= (int)$player[']) ?>'id'] ?>"><span class="siteUserAvatar"><?php if ($avatar): ?><img src="<?= suEscape($avatar) ?>" alt="" loading="lazy"><?php else: ?><?= suEscape(mb_strtoupper(mb_substr($player['nome'],0,1))) ?><?php endif; ?></span><span><strong><?= suEscape($player['nome'].' '.$player['sobrenome']) ?></strong><small>#<?= (int)$player['id'] ?></small></span></a></td><td data-label="E-mail" class="siteUsers__email"><?= suEscape($player['email']) ?></td><td data-label="Status / acesso"><span class="siteUserBadge <?= $player['status']==='ativo'?'siteUserBadge--active':'' ?>"><?= $player['status']==='ativo'?'Ativo':'Inativo' ?></span><?php if ($player['beta_tester']): ?><span class="siteUserBadge siteUserBadge--beta">Beta tester</span><?php endif; ?></td><td data-label="Cadastro"><?= suEscape(suDate($player['created_at'])) ?></td><td><a class="btn btn--gray" href="<?= adminUrl('usuarios-site', ['id' => '<?= (int)$player[']) ?>'id'] ?>" aria-label="Abrir perfil de <?= suEscape($player['nome'].' '.$player['sobrenome']) ?>">Abrir perfil ↗</a></td></tr>
    <?php endforeach; ?></tbody></table></div>
    <?php endif; ?>
    <nav class="siteUsers__pagination" aria-label="Paginação dos usuários">
        <?php $query = ['q'=>$listing['q'],'status'=>$listing['status'],'beta'=>$listing['beta']]; if ($listing['page']>1): ?><a class="btn btn--gray" href="?<?= suEscape(http_build_query($query+['pagina'=>$listing['page']-1])) ?>">← Anterior</a><?php endif; ?><span>Página <?= $listing['page'] ?> de <?= $listing['pages'] ?></span><?php if ($listing['page']<$listing['pages']): ?><a class="btn btn--gray" href="?<?= suEscape(http_build_query($query+['pagina'=>$listing['page']+1])) ?>">Próxima →</a><?php endif; ?>
    </nav><p class="adminFootnote">Contas de jogador são separadas dos acessos administrativos. A marcação beta não concede acesso a este painel.</p>
    <?php elseif ($user): $deckCount = siteUserDeckCount($pdo, $id); $avatar = suAvatar($user['foto_perfil']); ?>
    <a class="siteUsers__back" href="<?= adminUrl('usuarios-site') ?>">← Voltar para usuários</a>
    <section class="siteUserSummary adminCard"><div class="siteUserIdentity"><span class="siteUserAvatar siteUserAvatar--large"><?php if ($avatar): ?><img src="<?= suEscape($avatar) ?>" alt="Foto do jogador"><?php else: ?><?= suEscape(mb_strtoupper(mb_substr($user['nome'],0,1))) ?><?php endif; ?></span><div><h2><?= suEscape($user['nome'].' '.$user['sobrenome']) ?></h2><p><?= suEscape($user['email']) ?></p><span class="siteUserBadge <?= $user['status']==='ativo'?'siteUserBadge--active':'' ?>"><?= $user['status']==='ativo'?'Ativo':'Inativo' ?></span><?php if ($user['beta_tester']): ?><span class="siteUserBadge siteUserBadge--beta">Beta tester</span><?php endif; ?></div></div><dl><div><dt>Conta</dt><dd>#<?= $id ?></dd></div><div><dt>Decks salvos</dt><dd><?= $deckCount ?></dd></div><div><dt>Cadastro</dt><dd><?= suEscape(suDate($user['created_at'])) ?></dd></div></dl></section>
    <?php if ($deleteView): ?>
    <form class="siteUserDanger formGroup" method="post" action="<?= adminUrl('usuarios-site', ['id' => $id, 'acao' => 'excluir']) ?>" novalidate data-site-user-form>
        <input type="hidden" name="csrf" value="<?= suEscape($_SESSION['admin_csrf']) ?>"><input type="hidden" name="id" value="<?= $id ?>"><input type="hidden" name="action" value="delete"><input type="hidden" name="revision" value="<?= suEscape($isPost ? siteUserText($_POST,'revision') : siteUserRevision($user)) ?>">
        <h2>Excluir permanentemente esta conta?</h2><p>Serão removidos o cadastro de <strong><?= suEscape($user['nome'].' '.$user['sobrenome']) ?></strong>, sua foto de perfil e <strong><?= $deckCount ?> deck(s)</strong> com suas listas. A sessão do jogador perderá acesso. As cartas do catálogo e as contas administrativas não serão alteradas.</p><p><strong>Esta ação não pode ser desfeita pelo painel.</strong> Para suspender o acesso sem apagar dados, volte ao perfil e selecione “Inativo”.</p>
        <?php suField('confirmation','Digite EXCLUIR para confirmar','text','',$errors,7); ?>
        <div class="siteUserActions"><a class="btn btn--gray" href="<?= adminUrl('usuarios-site', ['id' => $id]) ?>">Cancelar</a><button type="submit" class="btn btn--danger">Excluir conta e decks</button></div>
    </form>
    <?php else: ?>
    <form class="formGroup siteUserForm" method="post" enctype="multipart/form-data" action="<?= adminUrl('usuarios-site', ['id' => $id]) ?>" novalidate data-site-user-form>
        <input type="hidden" name="csrf" value="<?= suEscape($_SESSION['admin_csrf']) ?>"><input type="hidden" name="id" value="<?= $id ?>"><input type="hidden" name="action" value="save"><input type="hidden" name="revision" value="<?= suEscape($isPost ? siteUserText($_POST,'revision') : siteUserRevision($user)) ?>">
        <div class="formGroup__divisor"><h2>Dados cadastrais</h2></div><div class="siteUserForm__grid">
            <?php suField('firstName','Nome','text',$values['firstName'],$errors,80); suField('lastName','Sobrenome','text',$values['lastName'],$errors,120); suField('email','E-mail','email',$values['email'],$errors,190); suField('cpf','CPF','text',$values['cpf'],$errors,14); suField('phone','Telefone com DDD','tel',$values['phone'],$errors,16); suField('birthDate','Data de nascimento','date',$values['birthDate'],$errors,10); ?>
        </div><div class="siteUserForm__photo"><div class="formGroup__item"><label for="su-photo">Substituir foto de perfil</label><input id="su-photo" name="photo" type="file" accept="image/jpeg,image/png" aria-describedby="error-photo photo-help"><span class="errorText <?= isset($errors['photo'])?'show':'' ?>" id="error-photo" aria-live="polite"><?= suEscape($errors['photo']??'') ?></span><p id="photo-help">JPG ou PNG, até 5 MB e 20 megapixels. Deixe vazio para manter a foto atual.</p></div><?php if ($avatar): ?><label class="siteUserCheckbox"><input type="checkbox" name="remove_photo" value="1" <?= $values['remove_photo']?'checked':'' ?>> Remover foto atual</label><?php endif; ?><span class="errorText show"><?= suEscape($errors['remove_photo']??'') ?></span></div>
        <div class="formGroup__divisor"><h2>Acesso à plataforma</h2></div><div class="formGroup__item"><label for="su-status">Status da conta</label><select id="su-status" name="status" aria-describedby="error-status"><option value="ativo" <?= $values['status']==='ativo'?'selected':'' ?>>Ativo — pode entrar no site</option><option value="inativo" <?= $values['status']==='inativo'?'selected':'' ?>>Inativo — acesso suspenso</option></select><span class="errorText <?= isset($errors['status'])?'show':'' ?>" id="error-status"><?= suEscape($errors['status']??'') ?></span></div>
        <label class="settingSwitch" for="su-beta"><span><strong>Beta tester</strong><small>Libera o menu Jogar e a arena mesmo quando o jogo está desativado para o público. Exige conta ativa e login no site; não concede acesso ao admin.</small></span><input id="su-beta" type="checkbox" role="switch" name="beta_tester" value="1" <?= $values['beta_tester']?'checked':'' ?> aria-describedby="error-beta_tester"><i aria-hidden="true"></i></label><span class="errorText <?= isset($errors['beta_tester'])?'show':'' ?>" id="error-beta_tester"><?= suEscape($errors['beta_tester']??'') ?></span>
        <div class="formGroup__divisor"><h2>Alterar senha</h2></div><p class="siteUserForm__hint">A senha atual nunca é exibida. Preencha os dois campos somente para definir uma nova senha. Alterar senha, e-mail ou status encerra as sessões anteriores.</p><div class="siteUserForm__grid"><?php suField('newPassword','Nova senha','password','',$errors,72,false); suField('passwordConfirmation','Confirmar nova senha','password','',$errors,72,false); ?></div>
        <div class="siteUserActions"><a class="btn btn--gray" href="<?= adminUrl('usuarios-site') ?>">Voltar à lista</a><button class="btn btn--primary" type="submit">Salvar alterações</button></div>
    </form><section class="siteUserDanger adminCard"><h2>Excluir conta</h2><p>A exclusão é permanente e também remove os decks deste jogador. Você verá uma confirmação antes de continuar.</p><a class="btn btn--danger" href="<?= adminUrl('usuarios-site', ['id' => $id, 'acao' => 'excluir']) ?>">Excluir usuário</a></section>
    <?php endif; ?>
    <?php elseif (!$listing): ?><a class="btn btn--gray" href="<?= adminUrl('usuarios-site') ?>">Voltar para usuários</a><?php endif; ?>
</main></div><?php include ROOT . '/admin/includes/scripts.php'; ?><script src="<?= ADMIN_BASE_URL ?>/pages/usuarios-site/users.js?v=<?= filemtime(__DIR__.'/users.js') ?>" defer></script></body></html>
