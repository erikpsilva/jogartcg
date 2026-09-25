<?php
if(PHP_SAPI!=='cli')exit;
require dirname(__DIR__).'/config/database.php';
$pdo=getDbConnection();if($pdo->query('SELECT DATABASE()')->fetchColumn()!=='jogartcg_db')throw new RuntimeException('Somente local.');
$pdo->exec(file_get_contents(dirname(__DIR__).'/database/migrations/2026-09-24-castle-shop.sql'));
echo "Tabelas criadas sem alterar saldos.\n";
foreach($pdo->query("SELECT rarity_en,COUNT(*) n FROM lorcana_cards WHERE set_code='1' AND active=1 GROUP BY rarity_en") as $r)echo $r['rarity_en'].': '.$r['n'].PHP_EOL;
