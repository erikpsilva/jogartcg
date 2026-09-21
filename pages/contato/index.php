<!DOCTYPE html>
<html>
<head>
<title>Jogar TCG - Contato</title>

<?php include ROOT . '/includes/assets.php';?>

</head>

<body>

<?php include ROOT . '/includes/header/header.php';?>

<!-- BANNER INTRODUTÓRIO -->
<section class="contato">
    contato para exemplo de pagina
</section>

<?php include ROOT . '/includes/footer/footer.php';?>
<?php include ROOT . '/includes/scripts.php';?>
<?php
$version = time();
echo '<script src="' . BASE_URL . '/pages/contato/contato.js?' . $version . '"></script>';
?>

</body>
</html>
