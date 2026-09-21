<?php
declare(strict_types=1);
// Keep the legacy admin cookie name, separate from player authentication.
if (session_status() === PHP_SESSION_NONE) {
    $adminHttps = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || strtolower($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https';
    session_start([
        'use_strict_mode' => true,
        'cookie_httponly' => true,
        'cookie_samesite' => 'Lax',
        'cookie_secure' => $adminHttps,
    ]);
}
