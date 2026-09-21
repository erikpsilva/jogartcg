<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require_once dirname(__DIR__, 2) . '/admin/includes/settings.php';

// Completely isolated database: never connect to project accounts or settings.
$pdo = new PDO('sqlite::memory:', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$count = 0;
function checkSetting(bool $condition, string $message): void {
    global $count;
    if (!$condition) throw new RuntimeException($message);
    echo 'ok ' . ++$count . ' - ' . $message . PHP_EOL;
}
checkSetting(publicSiteSettings($pdo) === ['play_enabled' => true], 'existing installation remains enabled before migration');
initializeSiteSettings($pdo);
checkSetting(publicSiteSettings($pdo) === ['play_enabled' => true], 'migration defaults to enabled');
savePlaySetting($pdo, false);
checkSetting(publicSiteSettings($pdo) === ['play_enabled' => false], 'disabled setting persists');
initializeSiteSettings($pdo);
checkSetting(publicSiteSettings($pdo) === ['play_enabled' => false], 'repeated migration preserves disabled setting');
savePlaySetting($pdo, true);
checkSetting(publicSiteSettings($pdo) === ['play_enabled' => true], 'can re-enable without recreating data');
$pdo->exec("INSERT INTO site_settings VALUES ('private_fixture', 'not-public', CURRENT_TIMESTAMP)");
checkSetting(array_keys(publicSiteSettings($pdo)) === ['play_enabled'], 'public payload exposes only the allowlisted boolean');
$pdo->exec("UPDATE site_settings SET setting_value='invalid' WHERE setting_key='play_enabled'");
checkSetting(publicSiteSettings($pdo)['play_enabled'] === false, 'malformed stored flag does not grant access');
checkSetting(validateSettingsChange(['csrf'=>'test-token','play_enabled'=>'1'], 'test-token') === null, 'valid enable request accepted');
checkSetting(validateSettingsChange(['csrf'=>'test-token'], 'test-token') === null, 'unchecked checkbox accepted');
foreach ([[], ['csrf'=>'wrong'], ['csrf'=>['test-token']], ['csrf'=>'test-token','play_enabled'=>'0'], ['csrf'=>'test-token','play_enabled'=>['1']]] as $post) {
    checkSetting(validateSettingsChange($post, 'test-token') !== null, 'missing or malformed token/value rejected');
}
checkSetting(validateSettingsChange(['csrf'=>''], '') !== null, 'empty session token rejected');
$pdo->exec('CREATE TABLE admin_usuarios (id INTEGER PRIMARY KEY, nivel_acesso TEXT)');
$pdo->exec("INSERT INTO admin_usuarios VALUES (1,'admin'), (2,'editor'), (3,'leitor')");
checkSetting(canManageSettings($pdo, ['usuario'=>['id'=>1]]), 'database-confirmed administrator allowed');
foreach ([[], ['usuario'=>['id'=>2,'nivel_acesso'=>'admin']], ['usuario'=>['id'=>3]], ['usuario'=>['id'=>99]], ['usuario'=>['id'=>'1 OR 1=1']]] as $session) {
    checkSetting(!canManageSettings($pdo, $session), 'non-admin or invalid session rejected');
}
$pdo->exec("UPDATE admin_usuarios SET nivel_acesso='editor' WHERE id=1");
checkSetting(!canManageSettings($pdo, ['usuario'=>['id'=>1,'nivel_acesso'=>'admin']]), 'stale administrator session cannot save settings');
$pdo->exec('DROP TABLE site_settings');
$pdo->exec('CREATE TABLE site_settings (wrong_column TEXT)');
$propagated = false;
try { publicSiteSettings($pdo); } catch (PDOException) { $propagated = true; }
checkSetting($propagated, 'unexpected database errors are not treated as enabled');
echo "# {$count} settings checks passed; synthetic data only." . PHP_EOL;
