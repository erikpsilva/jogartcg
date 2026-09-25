<?php
if(PHP_SAPI!=='cli')exit;
require dirname(__DIR__).'/config/database.php';
$pdo=getDbConnection();if($pdo->query('SELECT DATABASE()')->fetchColumn()!=='jogartcg_db')throw new RuntimeException('Somente local.');
$pdo->exec(file_get_contents(dirname(__DIR__).'/database/migrations/2026-09-25-adventure-battles.sql'));
echo "Estrutura de batalhas instalada sem reset.\n";
