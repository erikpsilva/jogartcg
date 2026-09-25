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
/**
 * Rota do painel. Com reescrita no servidor vem do caminho (/admin/usuarios-site);
 * sem reescrita (Nginx ignora o .htaccess) vem em `p`: /admin/index.php?p=usuarios-site.
 */
if (isset($_GET['p']) && is_string($_GET['p'])) {
    $subRoute = trim(preg_replace('#[^A-Za-z0-9/_-]#', '', $_GET['p']) ?? '', '/');
} else {
    $path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?: $adminPath;
    $subRoute = trim(substr($path, strlen($adminPath)), '/');
}
if ($subRoute === '' || $subRoute === 'index.php') $subRoute = empty($_SESSION['usuario']) ? 'login' : 'inicio';

/** Link de uma página do painel, no formato que funciona em qualquer servidor. */
function adminUrl(string $route = '', array $params = []): string
{
    $url = ADMIN_BASE_URL . '/index.php?p=' . rawurlencode(trim($route, '/'));
    return $params === [] ? $url : $url . '&' . http_build_query($params);
}
$allowedPages = ['login', 'inicio', 'meusdados', 'cadastrarusuario', 'configuracoes', 'produtos', 'economia', 'usuarios-site', 'logout'];
if (!in_array($subRoute, $allowedPages, true)) {
    http_response_code(404);
    echo 'Página administrativa não encontrada.';
    exit;
}
require ROOT . '/admin/pages/' . $subRoute . '/index.php';
