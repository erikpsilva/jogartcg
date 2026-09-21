<?php include ROOT . '/admin/includes/auth_check.php'; ?>
<?php
if ($_SESSION['usuario']['nivel_acesso'] !== 'admin') {
    header('Location: ' . BASE_URL . '/admin/inicio');
    exit;
}
?>
<!DOCTYPE html>
<html>
<head>
<title>Jogar TCG - Admin - Cadastro de Usuários</title>
<?php include ROOT . '/admin/includes/assets.php'; ?>
</head>
<body>

<?php include ROOT . '/admin/includes/header/header.php'; ?>

<div class="adminLayout">
    <?php include ROOT . '/admin/includes/sidebar/sidebar.php'; ?>
    <main class="adminLayout__content">

        <section class="userRegister">
            <div class="row">
                <div class="col-md-12">
                    <h2>Registar um <span>novo usuário</span></h2>
                </div>
            </div>
            <div class="formGroup">
                <div class="row">
                    <div class="col-md-12 formGroup__divisor">
                        <h3>Dados <span>pessoais</span></h3>
                    </div>
                    <div class="col-md-4">
                        <div class="formGroup__item">
                            <label>Nome</label>
                            <input class="input" type="text" name="userName" id="userName" placeholder="Qual o seu primeiro nome?" />
                            <span class="errorText">Digite um nome válido</span>
                        </div>
                    </div>
                    <div class="col-md-4">
                        <div class="formGroup__item">
                            <label>Sobrenome</label>
                            <input class="input" type="text" name="userLastName" id="userLastName" placeholder="Qual o seu sobrenome?" />
                            <span class="errorText">Digite um sobrenome válido</span>
                        </div>
                    </div>
                    <div class="col-md-4">
                        <div class="formGroup__item">
                            <label>CPF</label>
                            <input class="input" type="text" name="userCpf" id="userCpf" placeholder="___.___.___.-__" />
                            <span class="errorText">Digite um CPF válido de 11 dígitos</span>
                        </div>
                    </div>
                    <div class="col-md-8">
                        <div class="formGroup__item">
                            <label>E-mail</label>
                            <input class="input" type="text" name="userEmail" id="userEmail" placeholder="Qual o seu e-mail?" />
                            <span class="errorText">Digite um e-mail válido</span>
                        </div>
                    </div>
                    <div class="col-md-4">
                        <div class="formGroup__item">
                            <label>Nivel de acesso</label>
                            <select class="input" type="text" name="userLevelAccess" id="userLevelAccess" placeholder="Nivél de acesso">
                                <option value="admin">ADMIN</option>
                                <option value="editor">EDITOR</option>
                                <option value="leitor">LEITOR</option>
                            </select>
                        </div>
                    </div>
                    <div class="col-md-12 formGroup__divisor">
                        <h3>Senha de <span>acesso</span></h3>
                    </div>
                    <div class="col-md-6">
                        <div class="formGroup__item">
                            <label>Senha</label>
                            <input class="input" type="password" name="userPassword" id="userPassword" placeholder="A senha deve conter de 6 a 20 dígitos" />
                            <span class="errorText">A senha deve conter de 6 a 20 dígitos</span>
                        </div>
                    </div>
                    <div class="col-md-6">
                        <div class="formGroup__item">
                            <label>Confirmar senha</label>
                            <input class="input" type="password" name="userConfirmPassword" id="userConfirmPassword" placeholder="Digite novamente sua senha" />
                            <span class="errorText">As senhas não são iguais</span>
                        </div>
                    </div>
                    <div class="col-md-12">
                        <button class="btn btn--primary" id="enviarRegisterUser">Enviar</button>
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
</script>

<?php
$version = time();
echo '<script src="' . ADMIN_BASE_URL . '/pages/cadastrarusuario/cadastrarusuario.js?v' . $version . '"></script>';
?>

</body>
</html>
