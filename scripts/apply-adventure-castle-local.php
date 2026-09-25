<?php
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
require dirname(__DIR__).'/config/database.php';
$pdo=getDbConnection();
if($pdo->query('SELECT DATABASE()')->fetchColumn()!=='jogartcg_db')throw new RuntimeException('Somente banco local.');
$pdo->exec(file_get_contents(dirname(__DIR__).'/database/migrations/2026-09-24-adventure-castle.sql'));
echo 'Tabela da jornada criada. Nenhum usuário ou saldo alterado.'.PHP_EOL;
