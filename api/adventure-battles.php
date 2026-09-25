<?php
declare(strict_types=1);
require_once dirname(__DIR__).'/config/game/bot.php';
require_once __DIR__.'/player-rewards.php';

function adventureBotAction(array $state): array { return gameBotAction($state); }
function adventureBattleView(array $row): array {
    $state=json_decode($row['state_json'],true,512,JSON_THROW_ON_ERROR);
    $enemy=adventureEnemies()[(int)$row['phase']-1];
    return ['id'=>(int)$row['id'],'phase'=>(int)$row['phase'],'revision'=>(int)$row['revision'],
        'enemy'=>$enemy['name'],'colors'=>$enemy['colors'],'deck_name'=>$enemy['deck_name'],
        'view'=>gameViewForSeat($state,1,['opponent'=>$enemy['name']]),
        'warnings'=>json_decode($row['warnings_json'],true),'result'=>$row['result_json']?json_decode($row['result_json'],true):null];
}
function adventureBattleResult(PDO $pdo,int $uid,int $id,int $phase,array $state,array $journey): array {
    $win=$state['winner']==='player';$first=$win&&(int)$journey['completed_stages']<$phase;
    $v=economySettings($pdo);
    $reward=['xp'=>$win?($first?$v['first_xp']:$v['repeat_xp']):$v['loss_xp'],'gold'=>$win?($first?$v['first_gold']:$v['repeat_gold']):0];
    $granted=rewardGrant($pdo,$uid,$reward);
    $pdo->prepare('INSERT INTO player_reward_claims(usuario_id,reward_key,reward_json) VALUES (?,?,?)')->execute([$uid,'adventure:'.$id,json_encode($granted)]);
    if($first)$pdo->prepare("UPDATE adventure_journeys SET completed_stages=GREATEST(completed_stages,?) WHERE usuario_id=? AND chapter='first-chapter'")->execute([$phase,$uid]);
    $today=rewardToday()->format('Y-m-d');
    $q=$pdo->prepare('SELECT COUNT(*) FROM adventure_battles WHERE usuario_id=? AND finished_at>=?');
    // Explicit UTC boundary: TIMESTAMP comparisons use a UTC database session.
    $boundary=rewardToday()->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s');$q->execute([$uid,$boundary]);
    $count=(int)$q->fetchColumn()+1;
    $key='mission:adventure:'.$today;
    $q=$pdo->prepare('SELECT 1 FROM player_reward_claims WHERE usuario_id=? AND reward_key=?');$q->execute([$uid,$key]);
    $mission=0;
    if($count>=3&&!$q->fetchColumn()){
        $mission=$v['adventure_mission_xp'];rewardGrant($pdo,$uid,['xp'=>$mission]);
        $pdo->prepare('INSERT INTO player_reward_claims(usuario_id,reward_key,reward_json) VALUES (?,?,?)')->execute([$uid,$key,json_encode(['xp'=>$mission])]);
    }
    return ['win'=>$win,'first'=>$first,'xp'=>$reward['xp'],'gold'=>$reward['gold'],'mission_xp'=>$mission];
}
function adventureBattleAction(PDO $pdo,int $uid,string $operation,array $body): array {
    $pdo->exec("SET time_zone = '+00:00'");
    $pdo->beginTransaction();
    try{
        $pdo->prepare('INSERT IGNORE INTO player_wallets(usuario_id) VALUES (?)')->execute([$uid]);
        $q=$pdo->prepare('SELECT xp FROM player_wallets WHERE usuario_id=? FOR UPDATE');$q->execute([$uid]);$xp=(int)$q->fetchColumn();
        $season=rewardSeason(rewardToday());$pdo->prepare('INSERT IGNORE INTO player_season_progress(usuario_id,season_id,baseline_xp) VALUES (?,?,?)')->execute([$uid,$season['id'],$xp]);
        $q=$pdo->prepare("SELECT * FROM adventure_journeys WHERE usuario_id=? AND chapter='first-chapter' FOR UPDATE");$q->execute([$uid]);$journey=$q->fetch(PDO::FETCH_ASSOC);
        if(!$journey)throw new RuntimeException('Escolha seu starter antes de enfrentar uma fase.');
        if($operation==='start'){
            $phase=filter_var($body['phase']??null,FILTER_VALIDATE_INT);
            if(!$phase||$phase<1||$phase>3)throw new RuntimeException('Esta fase ainda não tem batalha disponível.');
            if($phase>(int)$journey['completed_stages']+1)throw new RuntimeException('Vença a fase anterior primeiro.');
            $q=$pdo->prepare('SELECT * FROM adventure_battles WHERE usuario_id=? AND finished_at IS NULL ORDER BY id DESC LIMIT 1 FOR UPDATE');$q->execute([$uid]);$row=$q->fetch(PDO::FETCH_ASSOC);
            if(!$row){
                $enemy=adventureEnemies()[$phase-1];
                $decks=[1=>adventureCards($pdo,json_decode($journey['deck_json'],true)),2=>adventureCards($pdo,$enemy['cards'])];
                $warnings=[];
                foreach(array_merge($decks[1],$decks[2]) as $entry){$q=$pdo->prepare('SELECT rules_json FROM lorcana_cards WHERE source_id=?');$q->execute([$entry['card']['id']]);$rules=json_decode($q->fetchColumn()?:'null',true);if(!$rules||!($rules['supported']??false)||!empty($rules['unsupported']))$warnings[]=$entry['card']['full_name'];}
                $state=gameCreateSeated($pdo,$decks,random_int(1,2147483647));
                $pdo->prepare('INSERT INTO adventure_battles(usuario_id,phase,state_json,warnings_json) VALUES (?,?,?,?)')->execute([$uid,$phase,json_encode($state,JSON_THROW_ON_ERROR),json_encode(array_values(array_unique($warnings)))]);
                $id=(int)$pdo->lastInsertId();
                $q=$pdo->prepare('SELECT * FROM adventure_battles WHERE id=?');$q->execute([$id]);$row=$q->fetch(PDO::FETCH_ASSOC);
            }
        }else{
            $id=filter_var($body['id']??null,FILTER_VALIDATE_INT);
            $q=$pdo->prepare('SELECT * FROM adventure_battles WHERE id=? AND usuario_id=? FOR UPDATE');$q->execute([$id,$uid]);$row=$q->fetch(PDO::FETCH_ASSOC);
            if(!$row)throw new RuntimeException('Batalha não encontrada.');
            if($row['finished_at']===null){
                if(!isset($body['revision'])||!is_int($body['revision'])||$body['revision']!==(int)$row['revision'])throw new RuntimeException('A mesa mudou. Atualize a batalha antes de jogar.');
                $state=json_decode($row['state_json'],true,512,JSON_THROW_ON_ERROR);
                if($operation==='action')$state=gameApplySeatAction($state,1,$body['action']??null);
                elseif($operation!=='bot')throw new RuntimeException('Ação inválida.');
                // Bounded work per request; UI requests the next bot step if still needed.
                for($i=0;$i<8&&$state['phase']!=='finished'&&gameActiveDecisionPlayer($state)==='bot';$i++)$state=gameApplyAction($state,adventureBotAction($state));
                $result=$state['phase']==='finished'?adventureBattleResult($pdo,$uid,(int)$row['id'],(int)$row['phase'],$state,$journey):null;
                $row['state_json']=json_encode($state,JSON_THROW_ON_ERROR);$row['revision']=(int)$row['revision']+1;$row['result_json']=$result?json_encode($result):null;
                $pdo->prepare('UPDATE adventure_battles SET state_json=?,revision=?,result_json=?,finished_at=IF(? IS NULL,NULL,CURRENT_TIMESTAMP) WHERE id=?')->execute([$row['state_json'],$row['revision'],$row['result_json'],$row['result_json'],$row['id']]);
            }
        }
        $view=adventureBattleView($row);$pdo->commit();return $view;
    }catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}
}
