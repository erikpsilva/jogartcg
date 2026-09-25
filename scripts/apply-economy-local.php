<?php
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
require dirname(__DIR__).'/config/database.php';
require dirname(__DIR__).'/config/economy.php';
$pdo=getDbConnection();
if($pdo->query('SELECT DATABASE()')->fetchColumn()!=='jogartcg_db')throw new RuntimeException('Somente banco local.');
$pdo->exec(file_get_contents(dirname(__DIR__).'/database/migrations/2026-09-24-economy-settings.sql'));
$q=$pdo->prepare('INSERT IGNORE INTO economy_settings (setting_key,setting_value) VALUES (?,?)');
foreach(economyFields() as $key=>$field)$q->execute([$key,$field[1]]);
echo "Configurações criadas; nenhuma carteira, produto ou recompensa alterada.\n";
