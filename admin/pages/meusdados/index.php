<?php include ROOT . '/admin/includes/auth_check.php'; ?>
<?php
$partes    = explode(' ', $_SESSION['usuario']['nome_completo'], 2);
$nome      = $partes[0];
$sobrenome = $partes[1] ?? '';
$isAdmin   = $_SESSION['usuario']['nivel_acesso'] === 'admin';
$disabled  = $isAdmin ? '' : 'disabled';
?>
<!DOCTYPE html>
<html lang="pt-BR">
<head>
<title>Jogar TCG - Admin - Meus Dados</title>
<?php include ROOT . '/admin/includes/assets.php'; ?>
</head>
<body>

<?php include ROOT . '/admin/includes/header/header.php'; ?>

<div class="adminLayout">
    <?php include ROOT . '/admin/includes/sidebar/sidebar.php'; ?>
    <main class="adminLayout__content">

        <section class="meusDados">
            <div class="row">
                <div class="col-md-12">
                    <header class="adminPageHeading"><span class="adminEyebrow">Sua conta administrativa</span><h1>Meus dados<span>.</span></h1><p>Mantenha seus dados de acesso atualizados.</p></header>
                </div>
            </div>
            <div class="formGroup">
                <div class="row">

                    <div class="col-md-12 formGroup__divisor">
                        <h3>Dados <span>pessoais</span></h3>
                    </div>

                    <div class="col-md-4">
                        <div class="formGroup__item">
                            <label for="userName">Nome</label>
                            <input class="input" type="text" id="userName" name="userName"
                                   value="<?= htmlspecialchars($nome) ?>" placeholder="Seu primeiro nome" />
                            <span class="errorText">Digite um nome válido</span>
                        </div>
                    </div>

                    <div class="col-md-4">
                        <div class="formGroup__item">
                            <label for="userLastName">Sobrenome</label>
                            <input class="input" type="text" id="userLastName" name="userLastName"
                                   value="<?= htmlspecialchars($sobrenome) ?>" placeholder="Seu sobrenome" />
                            <span class="errorText">Digite um sobrenome válido</span>
                        </div>
                    </div>

                    <div class="col-md-4">
                        <div class="formGroup__item">
                            <label for="userCpf">CPF</label>
                            <input class="input" type="text" id="userCpf" name="userCpf"
                                   value="<?= htmlspecialchars($_SESSION['usuario']['cpf']) ?>"
                                   placeholder="___.___.___-__" <?= $disabled ?> />
                            <span class="errorText">Digite um CPF válido</span>
                        </div>
                    </div>

                    <div class="col-md-8">
                        <div class="formGroup__item">
                            <label for="userEmail">E-mail</label>
                            <input class="input" type="text" id="userEmail" name="userEmail"
                                   value="<?= htmlspecialchars($_SESSION['usuario']['email']) ?>"
                                   placeholder="Seu e-mail" />
                            <span class="errorText">Digite um e-mail válido</span>
                        </div>
                    </div>

                    <div class="col-md-4">
                        <div class="formGroup__item">
                            <label for="userLevelAccess">Nível de acesso</label>
                            <select class="input" id="userLevelAccess" name="userLevelAccess" <?= $disabled ?>>
                                <option value="admin"  <?= $_SESSION['usuario']['nivel_acesso'] === 'admin'  ? 'selected' : '' ?>>ADMIN</option>
                                <option value="editor" <?= $_SESSION['usuario']['nivel_acesso'] === 'editor' ? 'selected' : '' ?>>EDITOR</option>
                                <option value="leitor" <?= $_SESSION['usuario']['nivel_acesso'] === 'leitor' ? 'selected' : '' ?>>LEITOR</option>
                            </select>
                        </div>
                    </div>

                    <div class="col-md-12 formGroup__divisor">
                        <h3>Senha de <span>acesso</span></h3>
                    </div>

                    <div class="col-md-12">
                        <p class="meusDados__senhaAviso">Preencha somente se desejar alterar sua senha.</p>
                    </div>

                    <div class="col-md-6">
                        <div class="formGroup__item">
                            <label for="userPassword">Nova senha</label>
                            <input class="input" type="password" id="userPassword" name="userPassword"
                                   placeholder="Entre 6 e 20 caracteres" />
                            <span class="errorText">A senha deve ter entre 6 e 20 caracteres</span>
                        </div>
                    </div>

                    <div class="col-md-6">
                        <div class="formGroup__item">
                            <label for="userConfirmPassword">Confirmar nova senha</label>
                            <input class="input" type="password" id="userConfirmPassword" name="userConfirmPassword"
                                   placeholder="Repita a nova senha" />
                            <span class="errorText">As senhas não são iguais</span>
                        </div>
                    </div>

                    <div class="col-md-12">
                        <button class="btn btn--primary" id="salvarMeusDados">Salvar</button>
                    </div>

                </div>
            </div>
        </section>

    </main>
</div>

<?php include ROOT . '/admin/includes/footer/footer.php'; ?>
<?php include ROOT . '/admin/includes/scripts.php'; ?>

<script>
    var ADMIN_BASE_URL = "<?= ADMIN_BASE_URL ?>";
    var IS_ADMIN       = <?= $isAdmin ? 'true' : 'false' ?>;
</script>

<?php
$version = time();
echo '<script src="' . ADMIN_BASE_URL . '/pages/meusdados/meusdados.js?v' . $version . '"></script>';
?>

</body>
</html>
