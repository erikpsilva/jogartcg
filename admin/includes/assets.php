<meta name="viewport" content="width=device-width, initial-scale=1">

<meta charset="utf-8">
<meta name="description" content="Painel administrativo da plataforma Jogar TCG.">
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="#08090b">

<link rel="icon" href="<?= BASE_URL ?>/client/brand/favicon.png" type="image/png"/>
<link rel="stylesheet" href="<?= BASE_URL ?>/assets/fontawesome/css/all.min.css">

<?php
$version = filemtime(ROOT . '/admin/styles/style.min.css');
echo '<link rel="stylesheet" type="text/css" href="' . ADMIN_BASE_URL . '/styles/style.min.css?v' . $version . '">';
?>
