<?php
if (session_status() === PHP_SESSION_NONE) session_start();
if (!empty($_SESSION['usuario'])) {
    header('Location: ' . BASE_URL . '/admin/inicio');
    exit;
}
?>
<!DOCTYPE html>
<html lang="pt-BR">
<head>
<title>Jogar TCG - Admin - Login</title>

<?php include ROOT . '/admin/includes/assets.php';?>

</head>

<body>


<!-- BANNER INTRODUTÓRIO -->
<section class="adminLogin">
    <div class="adminLogin__content">
        <form class="formGroup" id="adminLoginForm" action="<?= ADMIN_BASE_URL ?>/services/login.php" method="post" data-redirect="<?= ADMIN_BASE_URL ?>/inicio">
            <div class="row">

                <div class="col-md-12">
                    <img class="adminLogin__content__logo" src="<?= BASE_URL ?>/client/brand/logo-jogar-tcg.png" alt="Jogar TCG" />
                </div>

                <div class="col-md-12 formGroup__divisor">
                    <span class="adminEyebrow">Administração</span><h1>Bem-vindo de volta.</h1><p class="adminLogin__intro">Entre para gerenciar a plataforma.</p><div class="formAlert formAlert--error" id="loginAlert" role="alert" hidden></div>
                </div>
                <div class="col-md-12">
                    <div class="formGroup__item">
                        <label for="loginEmail">E-mail</label>
                        <input class="input" type="email" name="email" id="loginEmail" autocomplete="username" placeholder="Digite seu e-mail" required />
                    </div>
                </div>

                <div class="col-md-12">
                    <div class="formGroup__item">
                        <label for="loginPassword">Senha</label>
                        <input class="input" type="password" name="senha" id="loginPassword" autocomplete="current-password" placeholder="Digite sua senha" required />
                    </div>
                </div>

                <div class="col-md-12">
                    <button class="btn btn--primary" id="enviarLogin" type="submit">Entrar no painel</button>
                </div>
            </div>
        </form>
        <a class="adminLogin__back" href="<?= BASE_URL ?>/client/#/cartas">← Voltar ao site</a>
    </div>
</section>


<?php include ROOT . '/admin/includes/scripts.php';?>

<script>
    var ADMIN_BASE_URL = "<?= ADMIN_BASE_URL ?>";
    var BASE_URL = "<?= BASE_URL ?>";
</script>

<?php
$version = time();
echo '<script src="' . ADMIN_BASE_URL . '/pages/login/login.js?v' . $version . '"></script>';
?>

</body>
</html>
