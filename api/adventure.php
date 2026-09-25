<?php
declare(strict_types=1);
require_once __DIR__.'/castle-shop.php';
require_once __DIR__.'/adventure-battles.php';

function adventureStarters(): array {
    $decks=array_values(array_filter(require dirname(__DIR__).'/config/starter_decks.php',static fn($d)=>(int)$d['set_number']===1));
    foreach($decks as &$deck){$cards=[];foreach($deck['cards'] as $entry){$id=(int)$entry['card_id'];$cards[$id]=($cards[$id]??0)+(int)$entry['quantity'];}$deck['cards']=[];foreach($cards as $id=>$quantity)$deck['cards'][]=['card_id'=>$id,'quantity'=>$quantity];}unset($deck);
    return $decks;
}
function adventureEnemies(): array {
    $starters=array_column(adventureStarters(),null,'id');
    $enemies=[];
    foreach(['Moana'=>'S1-1','Cruella'=>'S1-2','Mufasa'=>'S1-3'] as $name=>$id){
        $deck=$starters[$id];
        $enemies[]=['phase'=>count($enemies)+1,'name'=>$name,'starter_id'=>$id,'deck_name'=>$deck['name'],'colors'=>$deck['colors'],'cards'=>$deck['cards']];
    }
    return $enemies;
}
function adventureCards(PDO $pdo,array $entries): array {
    $cards=[];$q=$pdo->prepare('SELECT * FROM lorcana_cards WHERE source_id=? AND active=1 AND set_code=\'1\'');
    foreach($entries as $entry){$q->execute([(int)$entry['card_id']]);$row=$q->fetch();if(!$row)throw new RuntimeException('Carta indisponível no catálogo.');$cards[]=['quantity'=>(int)$entry['quantity'],'card'=>gameCardDetail($row,'pt-BR')];}
    return $cards;
}
function handleAdventureRoutes(PDO $pdo,array $segments,string $method): void {
    if(($segments[1]??'')!=='adventure')return;
    header('Cache-Control: private, no-store');
    $uid=requireUserId($pdo);$user=loadAuthenticatedPlayerRow($pdo);
    $action=$segments[2]??'';
    try {
        if($action==='battle'){
            if($method==='GET'&&count($segments)===4&&ctype_digit($segments[3])){
                $q=$pdo->prepare('SELECT * FROM adventure_battles WHERE id=? AND usuario_id=?');$q->execute([(int)$segments[3],$uid]);$battle=$q->fetch(PDO::FETCH_ASSOC);
                if(!$battle)respond(['success'=>false,'message'=>'Batalha não encontrada.'],404);
                respond(['success'=>true,'data'=>adventureBattleView($battle)]);
            }
            if($method==='POST'&&count($segments)===4&&in_array($segments[3],['start','action','bot'],true)){requireCsrf();respond(['success'=>true,'data'=>adventureBattleAction($pdo,$uid,$segments[3],readRequestPayload())]);}
            respond(['success'=>false,'message'=>'Rota indisponível.'],404);
        }
        if($action==='shop'){
            if($method==='GET'&&count($segments)===3)respond(['success'=>true,'data'=>castleShopState($pdo,$uid)]);
            if($method==='POST'&&count($segments)===4){requireCsrf();$result=castleShopAction($pdo,$uid,$segments[3],readRequestPayload());respond(['success'=>true,'data'=>$result]);}
            respond(['success'=>false,'message'=>'Rota indisponível.'],404);
        }
        if($method==='POST'&&$action==='start'){
            requireCsrf();$body=readRequestPayload();$starter=null;
            foreach(adventureStarters() as $s)if($s['id']===($body['starter_id']??null))$starter=$s;
            if(!$starter)respond(['success'=>false,'message'=>'Escolha um dos três starters de The First Chapter.'],422);
            adventureCards($pdo,$starter['cards']);
            $cards=json_encode($starter['cards']);
            // Immutable selection: repeated requests cannot replace an existing journey.
            $pdo->prepare('INSERT IGNORE INTO adventure_journeys (usuario_id,chapter,starter_id,collection_json,deck_json) VALUES (?,\'first-chapter\',?,?,?)')->execute([$uid,$starter['id'],$cards,$cards]);
        } elseif($method!=='GET'||$action!=='')respond(['success'=>false,'message'=>'Rota indisponível.'],404);
        $q=$pdo->prepare('SELECT * FROM adventure_journeys WHERE usuario_id=? AND chapter=\'first-chapter\'');$q->execute([$uid]);$row=$q->fetch();
        $starters=array_map(static fn($s)=>['id'=>$s['id'],'name'=>$s['name'],'colors'=>$s['colors'],'cover'=>'../'.$s['cover']],adventureStarters());
        $names=['Moana','Cruella De Vil','Mufasa','Aurora','Donald Duck','Aladdin','Maleficent','Elsa','Mickey Mouse'];$portraits=[];
        $portrait=$pdo->prepare('SELECT image_full_url FROM lorcana_cards WHERE name_en=? AND active=1 ORDER BY (set_code=\'1\') DESC, number LIMIT 1');
        foreach($names as $name){$portrait->execute([$name]);$portraits[]=$portrait->fetchColumn()?:null;}
        respond(['success'=>true,'data'=>['enemies'=>adventureEnemies(),'starters'=>$starters,'portraits'=>$portraits,'journey'=>$row?['starter_id'=>$row['starter_id'],'completed_stages'=>(int)$row['completed_stages'],'cards'=>adventureCards($pdo,json_decode($row['deck_json'],true))]:null,'battles_ready'=>true,'battle_phases'=>[1,2,3],'economy_ready'=>false]]);
    }catch(PDOException $e){error_log('Adventure: '.$e->getMessage());respond(['success'=>false,'message'=>'Não foi possível carregar a jornada. Confira a migração do castelo.'],503);}
    catch(RuntimeException $e){respond(['success'=>false,'message'=>$e->getMessage()],422);}
}
