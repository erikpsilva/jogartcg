<?php
if(PHP_SAPI!=='cli')exit;
require dirname(__DIR__).'/config/database.php';
require dirname(__DIR__).'/api/player-rewards.php';
$pdo=getDbConnection();
if($pdo->query('SELECT DATABASE()')->fetchColumn()!=='jogartcg_db')throw new RuntimeException('Somente local.');
foreach(['player_wallets','player_items','player_foils','player_foil_tokens','player_login_calendar','player_login_days','player_reward_claims','player_season_progress'] as $table){
    $ddl=$pdo->query("SHOW CREATE TABLE $table")->fetch(PDO::FETCH_NUM)[1];
    $ddl=preg_replace('/,\n\s*CONSTRAINT[^\n]+/','',$ddl);
    $pdo->exec(str_replace('CREATE TABLE','CREATE TEMPORARY TABLE',$ddl));
}
function checkReward(bool $ok,string $message): void {if(!$ok)throw new LogicException($message);echo "OK: $message\n";}
function deniedReward(callable $fn,string $message): void {try{$fn();}catch(RuntimeException $e){checkReward(true,$message);return;}throw new LogicException($message);}
$uid=1;$date=new DateTimeImmutable('2026-09-25',new DateTimeZone('America/Sao_Paulo'));
$pdo->exec('INSERT INTO player_wallets(usuario_id,xp,gold) VALUES (1,9950,2000)');
$s=rewardAction($pdo,$uid,'visit',[],$date);$again=rewardAction($pdo,$uid,'visit',[],$date);
checkReward($s===$again,'Login idempotente');
checkReward((int)$s['wallet']['xp']===10000,'Login concede 50 XP');
checkReward((int)$pdo->query('SELECT COUNT(*) FROM player_foils')->fetchColumn()===1,'Nível alcançado concede uma foil');
checkReward($s['season']['xp']===50,'XP anterior à temporada não é retroativo');
$s=rewardAction($pdo,$uid,'claim',['track'=>'daily','day'=>1],$date);
$again=rewardAction($pdo,$uid,'claim',['track'=>'daily','day'=>1],$date);
checkReward($s===$again&&(int)$s['wallet']['gold']===2100,'Prêmio diário concedido uma única vez');
deniedReward(fn()=>rewardAction($pdo,$uid,'claim',['track'=>'daily','day'=>2],$date),'Dia futuro bloqueado');
$third=$date->modify('+2 days');$s=rewardAction($pdo,$uid,'visit',[],$third);
checkReward($s['days'][1]['status']==='missed'&&$s['days'][2]['status']==='available','Faltar mantém o calendário e perde somente o prêmio daquele dia');
deniedReward(fn()=>rewardAction($pdo,$uid,'claim',['track'=>'daily','day'=>2],$third),'Recuperação exige confirmação explícita');
$s=rewardAction($pdo,$uid,'claim',['track'=>'daily','day'=>2,'recover'=>true],$third);
$again=rewardAction($pdo,$uid,'claim',['track'=>'daily','day'=>2,'recover'=>true],$third);
checkReward($s===$again&&(int)$s['wallet']['gold']===1100&&(int)$s['wallet']['xp']===10200,'Recuperação debita 1000 e concede prêmio somente uma vez');
$fifth=$date->modify('+4 days');rewardAction($pdo,$uid,'visit',[],$fifth);
$s=rewardAction($pdo,$uid,'claim',['track'=>'daily','day'=>4,'recover'=>true],$fifth);
checkReward((int)$pdo->query("SELECT COUNT(*) FROM player_items WHERE item_id='sleeve-lilo-stitch'")->fetchColumn()===1,'Item recuperado entra no inventário');
$seventh=$date->modify('+6 days');rewardAction($pdo,$uid,'visit',[],$seventh);
deniedReward(fn()=>rewardAction($pdo,$uid,'claim',['track'=>'daily','day'=>6,'recover'=>true],$seventh),'Saldo insuficiente bloqueia recuperação');
$s=rewardAction($pdo,$uid,'claim',['track'=>'daily','day'=>5],$seventh);
checkReward($s['days'][4]['status']==='claimed','Login anterior permite resgate tardio gratuito');
$s=rewardAction($pdo,$uid,'claim',['track'=>'free','day'=>1],$seventh);
checkReward(in_array('season:2026-09-25:free:1',$s['claims'],true),'XP libera resgate gratuito do passe');
deniedReward(fn()=>rewardAction($pdo,$uid,'claim',['track'=>'premium','day'=>1],$seventh),'Premium protegido no servidor');
$pdo->exec("UPDATE player_season_progress SET premium=1 WHERE usuario_id=1");
rewardAction($pdo,$uid,'claim',['track'=>'premium','day'=>1],$seventh);
checkReward(true,'Premium liberado no servidor permite resgate');
$s=rewardAction($pdo,$uid,'claim',['track'=>'daily','day'=>7],$seventh);
checkReward($s['days'][6]['status']==='claimed','Dia sete concede foil');
$after=rewardAction($pdo,$uid,'visit',[],$date->modify('+8 days'));
checkReward(count($after['days'])===7,'Calendário preservado após sete dias, sem reset de prêmios');
$other=rewardAction($pdo,2,'visit',[],$date);
checkReward($other['days'][0]['status']==='available','Contas isoladas');
echo "Testes em tabelas temporárias: nenhum saldo real alterado.\n";
