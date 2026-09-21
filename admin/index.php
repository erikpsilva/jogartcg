<?php
declare(strict_types=1);

define('ROOT', dirname(__DIR__));
$adminPath = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'])), '/');
define('ADMIN_BASE_URL', $adminPath);
define('BASE_URL', rtrim(str_replace('\\', '/', dirname($adminPath)), '/'));
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: SAMEORIGIN');
header('Referrer-Policy: same-origin');
require_once __DIR__ . '/includes/session.php';
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?: $adminPath;
$subRoute = trim(substr($path, strlen($adminPath)), '/');
if ($subRoute === '' || $subRoute === 'index.php') $subRoute = empty($_SESSION['usuario']) ? 'login' : 'inicio';
$allowedPages = ['login', 'inicio', 'meusdados', 'cadastrarusuario', 'configuracoes', 'usuarios-site', 'logout'];
if (!in_array($subRoute, $allowedPages, true)) {
    http_response_code(404);
    echo 'Página administrativa não encontrada.';
    exit;
}
require ROOT . '/admin/pages/' . $subRoute . '/index.php';
