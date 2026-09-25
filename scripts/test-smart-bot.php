<?php
if(PHP_SAPI!=='cli')exit;
require dirname(__DIR__).'/config/database.php';
require dirname(__DIR__).'/api/game.php';
require dirname(__DIR__).'/api/adventure.php';
$pdo=getDbConnection();if($pdo->query('SELECT DATABASE()')->fetchColumn()!=='jogartcg_db')throw new RuntimeException('Somente local.');
function botCheck($ok,$label){if(!$ok)throw new LogicException($label);echo "OK: $label\n";}
function botCard(string $iid,array $changes=[]):array{
 $e=gameBotUnknown($iid);$e['card']=array_replace($e['card'],['id'=>123,'name'=>$iid,'type'=>'Character','cost'=>2,'inkwell'=>true,'strength'=>2,'willpower'=>3,'lore'=>1],$changes);return $e;
}
$entries=adventureCards($pdo,adventureStarters()[0]['cards']);
$base=gameCreateSeated($pdo,[1=>$entries,2=>$entries],123);
$base['phase']='main';$base['activePlayer']='bot';$base['pending']=null;$base['decision']=null;$base['queue']=[];$base['bag']=[];$base['bagPlayer']=null;
foreach(GAME_PLAYERS as $p){$base['players'][$p]['hand']=[];$base['players'][$p]['field']=[];$base['players'][$p]['inkwell']=[];}
$s=$base;$s['players']['bot']['lore']=19;$s['players']['bot']['field']=[botCard('winner')];
botCheck(gameBotAction($s)['type']==='quest','Vitória imediata é prioridade');
$s=$base;$s['players']['player']['lore']=18;$target=botCard('threat',['lore'=>2,'willpower'=>2]);$target['exerted']=true;
$s['players']['player']['field']=[$target];$s['players']['bot']['field']=[botCard('defender',['strength'=>3,'willpower'=>5])];
botCheck(gameBotAction($s)['type']==='challenge','Remove ameaça letal em vez de explorar');
$hidden=$s;$hidden['rng']=999999;foreach(GAME_PLAYERS as $p){$hidden['players'][$p]['deck']=array_reverse($hidden['players'][$p]['deck']);foreach($hidden['players'][$p]['deck'] as &$e)$e['card']['strength']=999;unset($e);}
$s['players']['player']['hand']=[botCard('secret')];$hidden['players']['player']['hand']=[botCard('secret',['lore'=>99,'cost'=>0])];
botCheck(gameCanonical(gameBotAction($s))===gameCanonical(gameBotAction($hidden)),'Mão rival, ordem dos decks e semente não alteram decisão');
$s=$base;$s['players']['bot']['hand']=[botCard('expensive',['cost'=>8])];
botCheck(gameBotAction($s)['type']==='ink','Tinta inicial é valorizada');
$s=$base;$s['players']['bot']['hand']=[botCard('uninkable',['cost'=>8,'inkwell'=>false])];
botCheck(gameBotAction($s)['type']==='endTurn','Sem jogada legal encerra turno');
$before=json_encode($s);gameBotAction($s);botCheck(json_encode($s)===$before,'Busca não modifica o estado real');
$s=$base;$item=botCard('optional',['type'=>'Item','lore'=>0,'strength'=>0,'willpower'=>0]);
$item['card']['rules']['activated']=[['cost'=>[],'optional'=>true,'effects'=>[['op'=>'ready','target'=>['kind'=>'self','owner'=>'you']]],'sourceText'=>'Optional ready']];
$s['players']['bot']['field']=[$item];botCheck(gameBotAction($s)['type']==='endTurn','Não repete habilidade opcional sem benefício');
$s=$base;$s['players']['player']['lore']=18;$s['players']['player']['field']=[botCard('big',['strength'=>9,'willpower'=>9,'lore'=>0]),botCard('quester',['lore'=>2])];
$removal=botCard('removal',['type'=>'Action','cost'=>2,'strength'=>0,'willpower'=>0,'lore'=>0]);
$removal['card']['rules']['action']=[['op'=>'banish','target'=>['kind'=>'chosen','owner'=>'opponent','filter'=>['types'=>['Character']]]]];
$s['players']['bot']['hand']=[$removal];$s['players']['bot']['inkwell']=[botCard('ink1'),botCard('ink2')];
$a=gameBotAction($s);botCheck($a['type']==='play','Planeja remoção antes de escolher alvo');
$s=gameApplyAction($s,$a);$a=gameBotAction($s);botCheck($a['optionIds']===['quester'],'Prioriza alvo que vence no próximo turno, não o maior corpo');
$s=$base;$s['players']['bot']['lore']=19;$item=botCard('win-item',['type'=>'Item','lore'=>0,'strength'=>0,'willpower'=>0]);
$item['card']['rules']['activated']=[['cost'=>['exert'=>true],'effects'=>[['op'=>'gainLore','amount'=>1,'target'=>['kind'=>'player','owner'=>'you']]],'sourceText'=>'Gain lore']];
$s['players']['bot']['field']=[$item];botCheck(gameApplyAction($s,gameBotAction($s))['winner']==='bot','Usa habilidade para vencer imediatamente');
function oldBot(array $state):array{
 $best=null;$score=-INF;foreach(gameLegalActions($state,gameActiveDecisionPlayer($state)) as $a){if($a['type']==='concede')continue;$v=match($a['type']){'quest'=>80,'play','shift'=>65,'sing'=>60,'ink'=>70,'challenge'=>40,'activate'=>20,'choose'=>10,'endTurn'=>-100,default=>0};if($a['type']==='choose')$v+=count($a['optionIds']);if($a['type']==='choose'&&($state['pending']['kind']??'')==='mulligan')$v=-count($a['optionIds']);if($a['type']==='ink'&&count($state['players'][$a['player']]['inkwell'])>=8)$v=-50;if($v>$score){$score=$v;$best=$a;}}return $best;
}
$wins=0;$games=0;$timings=[];
foreach(adventureEnemies() as $enemy)foreach([71,72] as $seed)foreach(['player','bot'] as $smart){
 $state=gameCreateSeated($pdo,[1=>$entries,2=>adventureCards($pdo,$enemy['cards'])],$seed);
 for($n=0;$n<600&&$state['phase']!=='finished';$n++){
  $actor=gameActiveDecisionPlayer($state);$start=microtime(true);$a=$actor===$smart?gameBotAction($state):oldBot($state);if($actor===$smart)$timings[]=(microtime(true)-$start)*1000;
  $state=gameApplyAction($state,$a);
 }
 botCheck($state['phase']==='finished','Partida comparativa '.$enemy['name'].' seed '.$seed.' lado '.$smart.' termina');
 $games++;if($state['winner']===$smart)$wins++;
}
sort($timings);echo 'Comparativo: bot novo venceu '.$wins.'/'.$games.'; p95 '.round($timings[(int)floor(count($timings)*.95)],1).' ms; máximo '.round(max($timings),1)." ms. Amostra local, não prova de jogada ótima.\n";
