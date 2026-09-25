<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
require dirname(__DIR__).'/config/database.php';
$pdo=getDbConnection();
if($pdo->query('SELECT DATABASE()')->fetchColumn()!=='jogartcg_db')throw new RuntimeException('Execute somente no banco local jogartcg_db.');
$pdo->exec(file_get_contents(dirname(__DIR__).'/database/migrations/2026-09-24-living-playmat.sql'));
$q=$pdo->prepare('SELECT id,name,gold,animation,animation_intensity FROM shop_products WHERE id=?');$q->execute(['playmat-hades']);
echo json_encode($q->fetch(PDO::FETCH_ASSOC),JSON_UNESCAPED_UNICODE|JSON_PRETTY_PRINT);
