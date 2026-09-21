<?php

declare(strict_types=1);

/**
 * Em producao, as credenciais ficam fora da raiz publica:
 * /home/USUARIO/config/database.credentials.php
 *
 * No ambiente local, um arquivo config/database.credentials.php continua
 * opcional e ignorado pelo Git.
 */
$readEnvironmentValue = static function (string $name): string {
    $value = getenv($name);
    if (is_string($value) && $value !== '') {
        return $value;
    }

    $serverValue = $_SERVER[$name] ?? null;
    return is_string($serverValue) ? $serverValue : '';
};

$httpHost = strtolower((string) ($_SERVER['HTTP_HOST'] ?? ''));
$isLocalHost = $httpHost === '' || str_contains($httpHost, 'localhost') || str_starts_with($httpHost, '127.0.0.1');
$defaultEnvironment = $isLocalHost ? 'local' : 'production';
$appEnvironment = strtolower($readEnvironmentValue('APP_ENV') ?: $defaultEnvironment);
$isProduction = $appEnvironment === 'production';

$configuredCredentialsFile = $readEnvironmentValue('JOGARTCG_DB_CONFIG');
$databaseCredentialsFile = $configuredCredentialsFile !== ''
    ? $configuredCredentialsFile
    : ($isProduction
        ? dirname(__DIR__, 2) . '/config/database.credentials.php'
        : __DIR__ . '/database.credentials.php');

$databaseCredentials = [];

if (is_file($databaseCredentialsFile)) {
    $loadedCredentials = require $databaseCredentialsFile;
    if (is_array($loadedCredentials)) {
        $databaseCredentials = $loadedCredentials;
    }
}

$readDatabaseSetting = static function (string $environmentName, string $fileKey, string $default = '') use ($databaseCredentials): string {
    $environmentValue = getenv($environmentName);
    if (is_string($environmentValue) && $environmentValue !== '') {
        return $environmentValue;
    }

    $serverValue = $_SERVER[$environmentName] ?? null;
    if (is_string($serverValue) && $serverValue !== '') {
        return $serverValue;
    }

    $fileValue = $databaseCredentials[$fileKey] ?? null;
    return is_string($fileValue) && $fileValue !== '' ? $fileValue : $default;
};

define('DB_HOST', $readDatabaseSetting('JOGARTCG_DB_HOST', 'host', 'localhost'));
define('DB_NAME', $readDatabaseSetting('JOGARTCG_DB_NAME', 'name', $isProduction ? 'jogartcg' : 'jogartcg_db'));
define('DB_USER', $readDatabaseSetting('JOGARTCG_DB_USER', 'user', $isProduction ? 'jogartcg' : 'root'));
define('DB_PASS', $readDatabaseSetting('JOGARTCG_DB_PASS', 'password'));

if ($isProduction && DB_PASS === '') {
    error_log('Jogar TCG: a senha do banco de producao nao foi configurada.');
}

function getDbConnection(): PDO {
    try {
        $pdo = new PDO(
            'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4',
            DB_USER,
            DB_PASS
        );
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
        return $pdo;
    } catch (PDOException $e) {
        http_response_code(500);
        header('Content-Type: application/json');
        echo json_encode(['success' => false, 'message' => 'Erro de conexão com o banco de dados.']);
        exit;
    }
}
