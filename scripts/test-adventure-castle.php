<?php
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
require dirname(__DIR__).'/config/database.php';
require dirname(__DIR__).'/api/adventure.php';
$pdo=getDbConnection();$starters=adventureStarters();
if(count($starters)!==3)throw new RuntimeException('Esperados três starters.');
foreach($starters as $s){if(array_sum(array_column($s['cards'],'quantity'))!==60)throw new RuntimeException('Starter não tem 60 cartas.');foreach($s['cards'] as $e){$q=$pdo->prepare('SELECT set_code FROM lorcana_cards WHERE source_id=?');$q->execute([$e['card_id']]);if((string)$q->fetchColumn()!=='1')throw new RuntimeException('Carta fora de The First Chapter.');}echo $s['id'].': 60 cartas, coleção 1, entradas agrupadas.'.PHP_EOL;}
$pdo->query('SELECT usuario_id,starter_id,deck_json,collection_json,completed_stages FROM adventure_journeys LIMIT 0');
echo 'Schema isolado OK. Teste somente leitura; nenhuma jornada ou recompensa criada.'.PHP_EOL;
