<?php
if(PHP_SAPI!=='cli')exit;
require dirname(__DIR__).'/config/database.php';
require dirname(__DIR__).'/api/game.php';
require dirname(__DIR__).'/api/adventure.php';
$pdo=getDbConnection();
if($pdo->query('SELECT DATABASE()')->fetchColumn()!=='jogartcg_db')throw new RuntimeException('Somente local.');
// Session-only temporary tables shadow real user tables. No real balance is touched.
foreach(['player_wallets','adventure_journeys','adventure_orders','adventure_starters','adventure_packs','player_foils','player_foil_tokens'] as $table){$ddl=$pdo->query("SHOW CREATE TABLE $table")->fetch(PDO::FETCH_NUM)[1];$ddl=preg_replace('/,\n\s*CONSTRAINT[^\n]+/','',$ddl);$pdo->exec(str_replace('CREATE TABLE','CREATE TEMPORARY TABLE',$ddl));}
function check($condition,$label){if(!$condition)throw new RuntimeException($label);echo "OK: $label\n";}
$uid=1;$starters=adventureStarters();$cards=json_encode($starters[0]['cards']);
$pdo->prepare('INSERT INTO player_wallets (usuario_id,gold) VALUES (?,30000)')->execute([$uid]);
$pdo->prepare("INSERT INTO adventure_journeys (usuario_id,chapter,starter_id,collection_json,deck_json) VALUES (?,'first-chapter',?,?,?)")->execute([$uid,$starters[0]['id'],$cards,$cards]);
$body=['request_key'=>'test-purchase-0000001','product_id'=>'booster-elsa','quantity'=>2];
castleShopAction($pdo,$uid,'buy',$body);castleShopAction($pdo,$uid,'buy',$body);
$state=castleShopState($pdo,$uid);check($state['gold']===27000&&count($state['packs'])===2,'Compra de 2 boosters e repetição idempotente');
$pack=(int)$state['packs'][0]['id'];$opened=castleShopAction($pdo,$uid,'open',['pack_id'=>$pack]);$again=castleShopAction($pdo,$uid,'open',['pack_id'=>$pack]);
check($opened===$again&&count($opened['cards'])===12,'Reabrir preserva as mesmas 12 cartas');
$state=castleShopState($pdo,$uid);check(array_sum(array_column($state['collection'],'quantity'))===72,'Cartas adicionadas uma única vez');
$rarities=[];foreach($opened['cards'] as $c){$r=$c['card']['original']['rarity'];$rarities[$r]=($rarities[$r]??0)+1;}check($rarities===['Common'=>7,'Uncommon'=>3,'Rare'=>2],'Distribuição exata 7/3/2');
castleShopAction($pdo,$uid,'buy',['request_key'=>'test-purchase-0000002','product_id'=>$starters[1]['id'],'quantity'=>1]);
$state=castleShopState($pdo,$uid);check($state['gold']===22000&&array_sum(array_column($state['collection'],'quantity'))===132,'Starter adiciona 60 cartas por 5000 gold');
try{castleShopAction($pdo,$uid,'buy',['request_key'=>'test-purchase-0000003','product_id'=>$starters[1]['id'],'quantity'=>1]);throw new LogicException('Aceitou starter duplicado');}catch(RuntimeException $e){check(str_contains($e->getMessage(),'já possui'),'Bloqueia segunda compra de starter');}
try{castleShopAction($pdo,$uid,'buy',['request_key'=>'test-purchase-0000004','product_id'=>'booster-mickey','quantity'=>100]);throw new LogicException('Aceitou saldo insuficiente');}catch(RuntimeException $e){check(str_contains($e->getMessage(),'insuficiente'),'Bloqueia saldo insuficiente');}
check(castleShopState($pdo,$uid)['gold']===22000,'Falhas preservam saldo');
castleShopAction($pdo,$uid,'deck',['cards'=>$starters[0]['cards']]);check(true,'Starter válido salvo como deck da aventura');
try{castleShopAction($pdo,$uid,'deck',['cards'=>[['card_id'=>1,'quantity'=>1]]]);throw new LogicException('Aceitou deck inválido');}catch(RuntimeException $e){check(true,'Bloqueia deck inválido');}
$pool=castlePool($pdo);$foil=castleRoll($pool,static fn($a,$b)=>$a);check(count(array_filter($foil,static fn($c)=>$c['foil']))===1,'Sorteio foil positivo concede somente uma foil');
$normal=castleRoll($pool,static fn($a,$b)=>$b);check(count(array_filter($normal,static fn($c)=>$c['foil']))===0,'Sorteio normal não concede foil');
echo "Testes em tabelas temporárias concluídos. Dados reais preservados.\n";
