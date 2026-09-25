<?php
if(PHP_SAPI!=='cli')exit;
require dirname(__DIR__).'/config/database.php';
require dirname(__DIR__).'/api/game.php';
require dirname(__DIR__).'/api/adventure.php';
$pdo=getDbConnection();if($pdo->query('SELECT DATABASE()')->fetchColumn()!=='jogartcg_db')throw new RuntimeException('Somente local.');
foreach(['player_wallets','player_items','player_foils','player_foil_tokens','player_login_calendar','player_login_days','player_reward_claims','player_season_progress','adventure_journeys','adventure_battles'] as $table){$ddl=$pdo->query("SHOW CREATE TABLE $table")->fetch(PDO::FETCH_NUM)[1];$ddl=preg_replace('/,\n\s*CONSTRAINT[^\n]+/','',$ddl);$pdo->exec(str_replace('CREATE TABLE','CREATE TEMPORARY TABLE',$ddl));}
function battleCheck($ok,$label){if(!$ok)throw new LogicException($label);echo "OK: $label\n";}
function battleDenied(callable $fn,string $label){try{$fn();}catch(RuntimeException $e){battleCheck(true,$label);return;}throw new LogicException($label);}
$cards=json_encode(adventureStarters()[0]['cards']);
$pdo->prepare("INSERT INTO adventure_journeys(usuario_id,chapter,starter_id,collection_json,deck_json) VALUES (1,'first-chapter','S1-1',?,?)")->execute([$cards,$cards]);
battleDenied(fn()=>adventureBattleAction($pdo,1,'start',['phase'=>2]),'Cruella bloqueada antes da Moana');
$b=adventureBattleAction($pdo,1,'start',['phase'=>1]);
$same=adventureBattleAction($pdo,1,'start',['phase'=>1]);battleCheck($b['id']===$same['id'],'Duplo início retoma a mesma batalha');
battleDenied(fn()=>adventureBattleAction($pdo,2,'action',['id'=>$b['id'],'revision'=>0,'action'=>['type'=>'concede']]),'Outro usuário não altera batalha');
battleDenied(fn()=>adventureBattleAction($pdo,1,'action',['id'=>$b['id'],'revision'=>99,'action'=>['type'=>'concede']]),'Revisão inválida rejeitada');
$b=adventureBattleAction($pdo,1,'action',['id'=>$b['id'],'revision'=>0,'action'=>['type'=>'concede','player'=>'bot']]);
battleCheck(!$b['result']['win']&&$b['result']['xp']===20,'Servidor ignora jogador forjado e registra derrota com 20 XP');
$again=adventureBattleAction($pdo,1,'action',['id'=>$b['id'],'revision'=>0,'action'=>['type'=>'concede']]);
battleCheck($again['result']===$b['result']&&(int)$pdo->query('SELECT xp FROM player_wallets WHERE usuario_id=1')->fetchColumn()===20,'Repetição não duplica recompensa');
// Test-only fixture: make each first battle one legal quest away from victory.
foreach([1,2,3] as $phase){
    $b=adventureBattleAction($pdo,1,'start',['phase'=>$phase]);
    $q=$pdo->query('SELECT state_json FROM adventure_battles WHERE id='.(int)$b['id']);$state=json_decode($q->fetchColumn(),true);
    for($i=0;$i<1000&&$state['phase']!=='finished';$i++){
        $actions=gameLegalActions($state,gameActiveDecisionPlayer($state));$quest=null;
        foreach($actions as $a)if($a['type']==='quest'&&$a['player']==='player'){$quest=$a;break;}
        if($quest){$state['players']['player']['lore']=19;break;}
        $state=gameApplyAction($state,adventureBotAction($state));
    }
    battleCheck($quest!==null,'Motor chega a exploração legal na fase '.$phase);
    $pdo->prepare('UPDATE adventure_battles SET state_json=? WHERE id=?')->execute([json_encode($state),$b['id']]);
    $b=adventureBattleAction($pdo,1,'action',['id'=>$b['id'],'revision'=>$b['revision'],'action'=>$quest]);
    battleCheck($b['result']['win']&&$b['result']['gold']===500&&$b['result']['xp']===100,'Primeira vitória da fase '.$phase.' concede 100 XP e 500 gold');
    battleCheck((int)$pdo->query('SELECT completed_stages FROM adventure_journeys WHERE usuario_id=1')->fetchColumn()===$phase,'Vitória avança fase '.$phase);
}
battleCheck((int)$pdo->query("SELECT COUNT(*) FROM player_reward_claims WHERE reward_key LIKE 'mission:adventure:%'")->fetchColumn()===1,'Missão de três batalhas creditada uma única vez');
$b=adventureBattleAction($pdo,1,'start',['phase'=>1]);
$state=json_decode($pdo->query('SELECT state_json FROM adventure_battles WHERE id='.(int)$b['id'])->fetchColumn(),true);
$safe=adventureBattleView(['id'=>$b['id'],'phase'=>1,'revision'=>0,'state_json'=>json_encode($state),'warnings_json'=>'[]','result_json'=>null]);
battleCheck($safe['view']['state']['rng']===0&&$safe['view']['state']['decision']===null,'Visão pública omite semente e decisões internas');
for($i=0;$i<1000;$i++){
 $quest=null;foreach(gameLegalActions($state,gameActiveDecisionPlayer($state)) as $a)if($a['type']==='quest'&&$a['player']==='player'){$quest=$a;break;}
 if($quest){$state['players']['player']['lore']=19;break;}$state=gameApplyAction($state,adventureBotAction($state));
}
$pdo->prepare('UPDATE adventure_battles SET state_json=? WHERE id=?')->execute([json_encode($state),$b['id']]);
$b=adventureBattleAction($pdo,1,'action',['id'=>$b['id'],'revision'=>0,'action'=>$quest]);
battleCheck($b['result']['gold']===100&&$b['result']['xp']===60&&$b['result']['mission_xp']===0,'Vitória repetida: 60 XP e 100 gold sem repetir missão');
battleDenied(fn()=>adventureBattleAction($pdo,1,'start',['phase'=>4]),'Fase sem deck permanece indisponível');
// Exercise full unmodified engine matches for the three starter pairs.
foreach(adventureEnemies() as $enemy){
 $state=gameCreateSeated($pdo,[1=>adventureCards($pdo,adventureStarters()[0]['cards']),2=>adventureCards($pdo,$enemy['cards'])],12345);
 for($i=0;$i<1800&&$state['phase']!=='finished';$i++)$state=gameApplyAction($state,adventureBotAction($state));
 battleCheck($state['phase']==='finished','Partida completa sem fixture contra '.$enemy['name'].' em '.$i.' ações');
}
echo "Testes isolados em tabelas temporárias; contas reais preservadas.\n";
