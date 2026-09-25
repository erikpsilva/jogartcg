<?php
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
require dirname(__DIR__).'/config/database.php';
$pdo=getDbConnection();$all=require dirname(__DIR__).'/config/starter_decks.php';
foreach($all as $deck){if($deck['set_number']!==1)continue;$issues=[];foreach($deck['cards'] as $entry){$q=$pdo->prepare('SELECT full_name_en,rules_json FROM lorcana_cards WHERE source_id=?');$q->execute([$entry['card_id']]);$r=$q->fetch();$rules=json_decode($r['rules_json']??'null',true);if(!$rules||!($rules['supported']??false)||!empty($rules['unsupported']))$issues[]=$r['full_name_en']??$entry['card_id'];}echo $deck['id'].' '.$deck['name'].': '.json_encode($issues,JSON_UNESCAPED_UNICODE).PHP_EOL;}
