<?php
declare(strict_types=1);
require_once dirname(__DIR__).'/config/economy.php';

function rewardToday(): DateTimeImmutable { return new DateTimeImmutable('today',new DateTimeZone('America/Sao_Paulo')); }
function rewardSeason(DateTimeImmutable $today): array {
    $start=new DateTimeImmutable('2026-09-25',$today->getTimezone());
    $elapsed=max(0,(int)$start->diff($today)->format('%r%a'));
    $start=$start->modify('+'.(intdiv($elapsed,30)*30).' days');
    return ['id'=>$start->format('Y-m-d'),'ends_on'=>$start->modify('+29 days')->format('Y-m-d')];
}
function rewardDefinition(string $track,int $day): array {
    if($track==='daily')return [1=>['gold'=>100],2=>['xp'=>150],3=>['gold'=>200],4=>['item'=>'sleeve-lilo-stitch'],5=>['xp'=>300],6=>['gold'=>500],7=>['foil'=>true]][$day];
    $i=$day-1;
    if($day===30)return ['foil'=>true];
    if($track==='free')return $i%5===4?['item'=>'sleeve-lilo-stitch']:($i%2?['xp'=>150]:['gold'=>100]);
    return $i%5===4?['item'=>'playmat-hades']:($i%3===2?['item'=>'sleeve-lilo-stitch']:($i%2?['xp'=>500]:['gold'=>500]));
}
function rewardFoil(PDO $pdo,int $uid): array {
    $ids=$pdo->query("SELECT source_id FROM lorcana_cards WHERE active=1 AND set_code='1' ORDER BY source_id")->fetchAll(PDO::FETCH_COLUMN);
    if(!$ids)throw new RuntimeException('Catálogo indisponível para sortear a foil.');
    $id=(int)$ids[random_int(0,count($ids)-1)];
    $q=$pdo->prepare('INSERT IGNORE INTO player_foils(usuario_id,card_id) VALUES (?,?)');$q->execute([$uid,$id]);
    $duplicate=$q->rowCount()===0;
    if($duplicate)$pdo->prepare('INSERT INTO player_foil_tokens(usuario_id,tokens) VALUES (?,1) ON DUPLICATE KEY UPDATE tokens=tokens+1')->execute([$uid]);
    return ['card_id'=>$id,'foil_token'=>$duplicate];
}
// Caller owns a transaction and holds the wallet row lock.
function rewardGrant(PDO $pdo,int $uid,array $reward): array {
    if(isset($reward['item'])){
        $q=$pdo->prepare('SELECT id FROM shop_products WHERE id=?');$q->execute([$reward['item']]);
        if(!$q->fetchColumn())throw new RuntimeException('Item de recompensa indisponível.');
        $pdo->prepare("INSERT IGNORE INTO player_items(usuario_id,item_id,source,gold_spent) VALUES (?,?,'reward',0)")->execute([$uid,$reward['item']]);
    }
    if(isset($reward['foil']))$reward+=rewardFoil($pdo,$uid);
    $q=$pdo->prepare('SELECT xp FROM player_wallets WHERE usuario_id=?');$q->execute([$uid]);$before=(int)$q->fetchColumn();
    $xp=(int)($reward['xp']??0);
    $pdo->prepare('UPDATE player_wallets SET xp=xp+?,gold=gold+? WHERE usuario_id=?')->execute([$xp,(int)($reward['gold']??0),$uid]);
    if($xp>0){
        $v=economySettings($pdo);$step=max(1,$v['level_xp']);$cap=min(999,$v['level_cap']);
        for($level=min($cap,intdiv($before,$step))+1;$level<=min($cap,intdiv($before+$xp,$step));$level++){
            $key='level:'.$level;$q=$pdo->prepare('SELECT 1 FROM player_reward_claims WHERE usuario_id=? AND reward_key=?');$q->execute([$uid,$key]);
            if(!$q->fetchColumn()){
                $foil=rewardFoil($pdo,$uid);
                $pdo->prepare('INSERT INTO player_reward_claims(usuario_id,reward_key,reward_json) VALUES (?,?,?)')->execute([$uid,$key,json_encode($foil)]);
            }
        }
    }
    return $reward;
}
function rewardState(PDO $pdo,int $uid,?DateTimeImmutable $today=null): array {
    $today??=rewardToday();$date=$today->format('Y-m-d');$season=rewardSeason($today);
    $q=$pdo->prepare('SELECT started_on FROM player_login_calendar WHERE usuario_id=?');$q->execute([$uid]);$start=$q->fetchColumn();
    $q=$pdo->prepare('SELECT login_date FROM player_login_days WHERE usuario_id=?');$q->execute([$uid]);$visits=$q->fetchAll(PDO::FETCH_COLUMN);
    $q=$pdo->prepare('SELECT reward_key FROM player_reward_claims WHERE usuario_id=?');$q->execute([$uid]);$claims=$q->fetchAll(PDO::FETCH_COLUMN);
    $days=[];
    if($start)for($i=1;$i<=7;$i++){
        $day=(new DateTimeImmutable($start,$today->getTimezone()))->modify('+'.($i-1).' days')->format('Y-m-d');
        $key='daily:'.$start.':'.$i;
        $status=in_array($key,$claims,true)?'claimed':(in_array($day,$visits,true)?'available':($day>=$date?'future':'missed'));
        $days[]=['day'=>$i,'date'=>$day,'status'=>$status,'cost'=>$status==='missed'?1000:0];
    }
    $q=$pdo->prepare('SELECT xp,gold FROM player_wallets WHERE usuario_id=?');$q->execute([$uid]);$wallet=$q->fetch(PDO::FETCH_ASSOC)?:['xp'=>0,'gold'=>0];
    $q=$pdo->prepare('SELECT baseline_xp,premium FROM player_season_progress WHERE usuario_id=? AND season_id=?');$q->execute([$uid,$season['id']]);$progress=$q->fetch(PDO::FETCH_ASSOC);
    $xp=$progress?max(0,(int)$wallet['xp']-(int)$progress['baseline_xp']):0;
    return ['days'=>$days,'wallet'=>$wallet,'season'=>$season+['xp'=>$xp,'level'=>min(30,intdiv($xp,500)),'premium'=>(bool)($progress['premium']??false)],'claims'=>$claims];
}
function rewardAction(PDO $pdo,int $uid,string $action,array $body=[],?DateTimeImmutable $today=null): array {
    $today??=rewardToday();$date=$today->format('Y-m-d');
    $pdo->beginTransaction();
    try{
        $pdo->prepare('INSERT IGNORE INTO player_wallets(usuario_id) VALUES (?)')->execute([$uid]);
        $q=$pdo->prepare('SELECT xp,gold FROM player_wallets WHERE usuario_id=? FOR UPDATE');$q->execute([$uid]);$wallet=$q->fetch(PDO::FETCH_ASSOC);
        $season=rewardSeason($today);
        $pdo->prepare('INSERT IGNORE INTO player_season_progress(usuario_id,season_id,baseline_xp) VALUES (?,?,?)')->execute([$uid,$season['id'],$wallet['xp']]);
        if($action==='visit'){
            $pdo->prepare('INSERT IGNORE INTO player_login_calendar(usuario_id,started_on) VALUES (?,?)')->execute([$uid,$date]);
            $q=$pdo->prepare('INSERT IGNORE INTO player_login_days(usuario_id,login_date) VALUES (?,?)');$q->execute([$uid,$date]);
            if($q->rowCount()){
                $reward=rewardGrant($pdo,$uid,['xp'=>economySettings($pdo)['login_xp']]);
                $pdo->prepare('INSERT INTO player_reward_claims(usuario_id,reward_key,reward_json) VALUES (?,?,?)')->execute([$uid,'login:'.$date,json_encode($reward)]);
            }
        }elseif($action==='claim'){
            $track=$body['track']??'';$day=filter_var($body['day']??null,FILTER_VALIDATE_INT);
            if(!in_array($track,['daily','free','premium'],true)||$day===false||$day<1||$day>($track==='daily'?7:30))throw new RuntimeException('Recompensa inválida.');
            $state=rewardState($pdo,$uid,$today);$cost=0;
            if($track==='daily'){
                $entry=$state['days'][$day-1]??null;
                if(!$entry||$entry['status']==='future')throw new RuntimeException('Este dia ainda não está disponível.');
                $q=$pdo->prepare('SELECT started_on FROM player_login_calendar WHERE usuario_id=?');$q->execute([$uid]);
                $key='daily:'.$q->fetchColumn().':'.$day;
                $cost=$entry['cost'];
                if($cost&&($body['recover']??false)!==true)throw new RuntimeException('Confirme a recuperação por 1.000 gold.');
            }else{
                if($track==='premium'&&!$state['season']['premium'])throw new RuntimeException('Passe premium não liberado.');
                if($day>$state['season']['level'])throw new RuntimeException('Ganhe XP para liberar este nível.');
                $key='season:'.$season['id'].':'.$track.':'.$day;
            }
            if(!in_array($key,$state['claims'],true)){
                if((int)$wallet['gold']<$cost)throw new RuntimeException('Gold insuficiente.');
                if($cost)$pdo->prepare('UPDATE player_wallets SET gold=gold-? WHERE usuario_id=?')->execute([$cost,$uid]);
                $reward=rewardGrant($pdo,$uid,rewardDefinition($track,$day));
                $pdo->prepare('INSERT INTO player_reward_claims(usuario_id,reward_key,reward_json,gold_spent) VALUES (?,?,?,?)')->execute([$uid,$key,json_encode($reward),$cost]);
            }
        }else throw new RuntimeException('Ação inválida.');
        $result=rewardState($pdo,$uid,$today);$pdo->commit();return $result;
    }catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}
}
