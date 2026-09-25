<?php
declare(strict_types=1);
require_once __DIR__.'/match.php';

/** Shared server bot: bounded tactical search, never the real hidden state. */
function gameBotUnknown(string $iid): array {
    $card=gameHiddenCard();$card['id']=-1;$card['cost']=99;$card['willpower']=1;
    return ['iid'=>$iid,'card'=>$card,'exerted'=>false,'drying'=>false,'damage'=>0,'location'=>null,'stack'=>[]];
}
function gameBotVisible(array $entry): array {
    if($entry['faceDown']??false){$hidden=gameBotUnknown($entry['iid']);foreach(['exerted','drying','damage','location','boostedThisTurn'] as $key)if(array_key_exists($key,$entry))$hidden[$key]=$entry[$key];$hidden['faceDown']=true;return $hidden;}
    $entry['stack']=array_map('gameBotVisible',$entry['stack']);return $entry;
}
function gameBotInformation(array $state,string $me): array {
    foreach(GAME_PLAYERS as $player){
        $p=$state['players'][$player];
        $p['deck']=array_map(static fn($i)=>gameBotUnknown('unknown-'.$player.'-'.$i),array_keys($p['deck']));
        $p['hand']=$player===$me?array_map('gameBotVisible',$p['hand']):array_map(static fn($c)=>gameBotUnknown($c['iid']),$p['hand']);
        $p['field']=array_map('gameBotVisible',$p['field']);$p['discard']=array_map('gameBotVisible',$p['discard']);
        $p['inkwell']=array_map(static function($c){$r=gameBotUnknown($c['iid']);$r['exerted']=$c['exerted'];return $r;},$p['inkwell']);
        $state['players'][$player]=$p;
    }
    $clean=function(array $value)use(&$clean):array{
        if(isset($value['iid'],$value['card'],$value['stack']))return gameBotVisible($value);
        foreach($value as &$v)if(is_array($v))$v=$clean($v);unset($v);return $value;
    };
    foreach(['queue','bag','decision','resolvingAction'] as $key)if(is_array($state[$key]))$state[$key]=$clean($state[$key]);
    $state['rng']=1;$state['log']=[];return $state;
}
function gameBotCardValue(array $c): float {
    if($c['id']===-1)return 4;
    $body=in_array($c['type'],['Character','Location'],true)?$c['strength']*.65+$c['willpower']*.6+$c['lore']*3.5:0;
    return 1.5+min(8,$c['cost'])*.75+$body+count($c['rules']['action'])*2+count($c['rules']['triggered'])*1.5+count($c['rules']['activated']);
}
function gameBotLore(array $effects): int {
    $sum=0;foreach($effects as $e)if($e['op']==='gainLore'&&in_array($e['target']['owner']??'',['you','any'],true))$sum+=$e['amount']??1;return $sum;
}
function gameBotField(array $state,array $e): float {
    $s=gameStats($state,$e['iid']);
    return 2+$s['strength']*.75+max(0,$s['willpower']-$e['damage'])*.85+$s['lore']*4+$e['card']['cost']*.45+gameKeywordValue($state,$e['iid'],'Resist')*2+(gameHasKeyword($state,$e['iid'],'Evasive')?1.5:0)+count($e['card']['rules']['triggered'])*1.5;
}
function gameBotPotential(array $state,string $player): float {
    $next=$state['activePlayer']!==$player;$sum=0;
    foreach($state['players'][$player]['field'] as $e){
        $s=gameStats($state,$e['iid']);$can=(!$e['exerted']||($next&&!in_array('cantReadyAtStart',$s['restrictions'],true)))&&($next||!$e['drying']);
        $quest=$can&&$e['card']['type']==='Character'&&!gameHasKeyword($state,$e['iid'],'Reckless')&&!in_array('cantQuest',$s['restrictions'],true)?$s['lore']:0;
        $passive=$next&&$e['card']['type']==='Location'?$s['lore']:0;
        foreach($e['card']['rules']['triggered'] as $rule){
            if(!empty($rule['condition'])||($rule['turn']??'')==='opponents')continue;
            if($quest&&$rule['trigger']==='selfQuest')$quest+=gameBotLore($rule['effects']);
            if($next&&$rule['trigger']==='start')$passive+=gameBotLore($rule['effects']);
        }
        $activated=0;foreach($e['card']['rules']['activated'] as $a){
            if((!empty($a['cost']['exert'])&&!$can)||($a['cost']['ink']??0)>count($state['players'][$player]['inkwell']))continue;
            $gain=gameBotLore($a['effects']);$activated=max($activated,$gain&&!array_filter($a['cost'])?20:$gain);
        }
        $sum+=$passive+max($quest,$activated);
    }return $sum;
}
function gameBotEvaluate(array $state,string $me): float {
    if($state['winner']===$me)return 1000000;
    if($state['winner']===gameOther($me))return -1000000;
    $own=$state['players'][$me];$other=$state['players'][gameOther($me)];$ink=count($own['inkwell']);
    $value=$own['lore']*13-$other['lore']*14-count($other['hand'])*2;$copies=[];
    foreach($own['hand'] as $e){$id=$e['card']['id'];$n=$copies[$id]??0;$copies[$id]=$n+1;$value+=($id===-1?4:max(1,gameBotCardValue($e['card'])*.42-max(0,$e['card']['cost']-$ink-1)*.9))/(1+$n*.2);}
    foreach($own['field'] as $e)$value+=gameBotField($state,$e);
    foreach($other['field'] as $e)$value-=gameBotField($state,$e);
    $value+=min($ink,3)*6+min(max(0,$ink-3),3)*3+max(0,$ink-6)*.3+min(6,gameAvailableInk($state,$me))*.15;
    $threat=$other['lore']+gameBotPotential($state,gameOther($me));
    $value-=$threat>=20?50000+($threat-20)*1000:pow(max(0,$threat-13),2)*1.5;
    $guard=false;foreach($own['field'] as $e)if($e['exerted']&&gameHasKeyword($state,$e['iid'],'Bodyguard'))$guard=true;
    foreach($own['field'] as $e){
        if(!$e['exerted']||$e['card']['type']!=='Character'||($guard&&!gameHasKeyword($state,$e['iid'],'Bodyguard')))continue;
        $s=gameStats($state,$e['iid']);foreach($other['field'] as $a){
            if($a['card']['type']!=='Character'||gameRestricted($state,$a['iid'],'cantChallenge'))continue;
            if(gameHasKeyword($state,$e['iid'],'Evasive')&&!gameHasKeyword($state,$a['iid'],'Evasive')&&!gameHasKeyword($state,$a['iid'],'Alert'))continue;
            if(gameStats($state,$a['iid'])['strength']+gameKeywordValue($state,$a['iid'],'Challenger')-gameKeywordValue($state,$e['iid'],'Resist')>=$s['willpower']-$e['damage']){$value-=gameBotField($state,$e)*.35;break;}
        }
    }return $value;
}
function gameBotPriority(array $state,array $a,string $me): float {
    $own=null;$enemy=null;$hand=null;$ids=[];
    foreach($a as $key=>$v)if(!in_array($key,['type','player','label'],true))$ids=array_merge($ids,is_array($v)?$v:[$v]);
    foreach($state['pending']['options']??[] as $o)if(in_array($o['id'],$ids,true)&&isset($o['iid']))$ids[]=$o['iid'];
    foreach($state['players'][$me]['field'] as $e)if(in_array($e['iid'],$ids,true))$own=$e;
    foreach($state['players'][gameOther($me)]['field'] as $e)if(in_array($e['iid'],$ids,true))$enemy=$e;
    foreach($state['players'][$me]['hand'] as $e)if(in_array($e['iid'],$ids,true))$hand=$e;
    if($a['type']==='quest')return $own?($state['players'][$me]['lore']+gameStats($state,$own['iid'])['lore']>=20?1000000:30+gameStats($state,$own['iid'])['lore']*10):0;
    if($a['type']==='ink')return $hand?20-gameBotCardValue($hand['card'])+max(0,$hand['card']['cost']-count($state['players'][$me]['inkwell']))*2:0;
    if($a['type']==='endTurn')return -100;
    if($a['type']==='choose'){
        $effect=$state['decision']['frame']['effect']??null;
        if(($state['decision']['kind']??'')==='discard')return -($hand?gameBotCardValue($hand['card']):0);
        if(($state['decision']['kind']??'')==='amount')return (float)($a['optionIds'][0]??0)*(($effect['op']??'')==='loseLore'?-1:1);
        $value=0;foreach(array_merge($state['players'][$me]['field'],$state['players'][$me]['discard'],$state['players'][gameOther($me)]['field']) as $e){
            if(!in_array($e['iid'],$ids,true))continue;
            $hostile=in_array($e,$state['players'][gameOther($me)]['field'],true);
            $remove=in_array($effect['op']??'',['banish','returnHand'],true)||(($effect['op']??'')==='damage'&&max(0,($effect['amount']??1)-gameKeywordValue($state,$e['iid'],'Resist'))>=gameStats($state,$e['iid'])['willpower']-$e['damage']);
            $benefit=$remove?($hostile?1:-1):(in_array($effect['op']??'',['heal','ready','buff','recover'],true)?($hostile?-1:1):0);
            $value+=$benefit*gameBotField($state,$e);
            if($remove&&$hostile&&$state['players'][gameOther($me)]['lore']+gameBotPotential($state,gameOther($me))>=20)$value+=100000;
        }return $value;
    }
    if($own&&$enemy){$damage=max(0,gameStats($state,$own['iid'])['strength']+gameKeywordValue($state,$own['iid'],'Challenger')-gameKeywordValue($state,$enemy['iid'],'Resist'));return 20+$damage+($damage>=gameStats($state,$enemy['iid'])['willpower']-$enemy['damage']?gameBotField($state,$enemy)*2:0);}
    $gain=$a['type']==='activate'&&$own?gameBotLore($own['card']['rules']['activated'][$a['ability']]['effects']):($hand?gameBotLore($hand['card']['rules']['action']):0);
    if($gain&&$state['players'][$me]['lore']+$gain>=20)return 1000000;
    return ($hand?25+gameBotCardValue($hand['card']):-5)+$gain*20;
}
function gameBotCandidates(array $state,string $me,int $width): array {
    $ranked=[];foreach(gameLegalActions($state,$me) as $a)if($a['type']!=='concede')$ranked[]=['action'=>$a,'score'=>gameBotPriority($state,$a,$me),'key'=>gameCanonical($a)];
    usort($ranked,static fn($a,$b)=>($b['score']<=>$a['score'])?:strcmp($a['key'],$b['key']));
    $selected=array_slice($ranked,0,$width);
    foreach($ranked as $r)if($r['action']['type']==='endTurn'&&!in_array($r,$selected,true)){$selected[count($selected)-1]=$r;break;}
    return array_column($selected,'action');
}
function gameBotOpening(array $state,array $a,string $me): float {
    $replaced=$a['optionIds']??$a['replace']??[];$score=count($replaced)*4.5;$curve=[];$ink=0;
    foreach($state['players'][$me]['hand'] as $e){if(in_array($e['iid'],$replaced,true))continue;$c=$e['card'];$n=$curve[$c['cost']]??0;$curve[$c['cost']]=$n+1;$early=$c['type']==='Character'?[0,10,9,7,4,1][min($c['cost'],5)]:($c['cost']<=3?3:0);$score+=$early/(1+$n*.8)+($c['inkwell']?2:-1);if($c['inkwell'])$ink++;}
    return $score+min(3,$ink)*2;
}
function gameBotFree(array $state,array $a,string $me): bool {
    if($a['type']==='boost')return $a['cost']===0;
    if($a['type']==='move')return gameStats($state,$a['location'])['moveCost']===0;
    if($a['type']!=='activate')return false;
    foreach($state['players'][$me]['field'] as $e)if($e['iid']===$a['iid']){$c=$e['card']['rules']['activated'][$a['ability']]['cost'];return empty($c['ink'])&&empty($c['exert'])&&empty($c['banish']);}return false;
}
function gameBotProgress(array $before,array $after,array $action): bool {
    if(!in_array($action['type'],['activate','boost','move'],true))return true;
    foreach(['log','rng','nextId'] as $key){unset($before[$key],$after[$key]);}
    return $before!==$after;
}
function gameBotAction(array $input,?string $me=null): array {
    $me??=gameActiveDecisionPlayer($input);
    if(!$me||gameActiveDecisionPlayer($input)!==$me||$input['phase']==='finished')throw new GameRuleError('O bot não possui uma decisão ativa.');
    $state=gameBotInformation($input,$me);
    if($state['phase']==='mulligan'){
        $ranked=[];foreach(gameLegalActions($state,$me) as $a)if($a['type']!=='concede')$ranked[]=['action'=>$a,'score'=>gameBotOpening($state,$a,$me),'key'=>gameCanonical($a)];
        usort($ranked,static fn($a,$b)=>($b['score']<=>$a['score'])?:strcmp($a['key'],$b['key']));return $ranked[0]['action'];
    }
    $roots=[];
    foreach(gameBotCandidates($state,$me,24) as $a){$next=gameApplyAction($state,$a);if(gameBotProgress($state,$next,$a))$roots[]=['action'=>$a,'next'=>$next,'score'=>gameBotEvaluate($next,$me),'key'=>gameCanonical($a)];}
    if(!$roots)throw new GameRuleError('Sem ações legais para o bot.');
    $sort=static fn($a,$b)=>($b['score']<=>$a['score'])?:strcmp($a['key'],$b['key']);usort($roots,$sort);
    if($roots[0]['next']['winner']===$me)return $roots[0]['action'];
    // Resolve target prompts before pruning: removal has no value until its target is chosen.
    $beam=array_keys($roots);
    usort($beam,static function($a,$b)use($roots,$me,$sort){$rank=static function($r)use($me){$bonus=0;if(($r['next']['pending']['player']??null)===$me)foreach(gameBotCandidates($r['next'],$me,8) as $a)$bonus=max($bonus,gameBotPriority($r['next'],$a,$me));return $r['score']+$bonus;};return ($rank($roots[$b])<=>$rank($roots[$a]))?:$sort($roots[$a],$roots[$b]);});
    foreach(array_slice($beam,0,6) as $index){
        $root=&$roots[$index];if(gameActiveDecisionPlayer($root['next'])!==$me){unset($root);continue;}
        $best=$root['score'];$children=[];
        foreach(gameBotCandidates($root['next'],$me,8) as $a){$next=gameApplyAction($root['next'],$a);if(!gameBotProgress($root['next'],$next,$a))continue;$score=gameBotEvaluate($next,$me);$children[]=['next'=>$next,'score'=>$score,'key'=>gameCanonical($a)];$best=max($best,$score);}
        usort($children,$sort);
        foreach(array_slice($children,0,2) as $child)if(gameActiveDecisionPlayer($child['next'])===$me)foreach(gameBotCandidates($child['next'],$me,4) as $a)$best=max($best,gameBotEvaluate(gameApplyAction($child['next'],$a),$me));
        $root['score']+=($best-$root['score'])*.9;unset($root);
    }
    usort($roots,$sort);$baseline=gameBotEvaluate($state,$me);
    foreach($roots as $r)if(!gameBotFree($state,$r['action'],$me)||$r['score']>$baseline+.001)return $r['action'];
    foreach($roots as $r)if($r['action']['type']==='endTurn')return $r['action'];return $roots[0]['action'];
}
