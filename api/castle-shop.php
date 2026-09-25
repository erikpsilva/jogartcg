<?php
declare(strict_types=1);
require_once dirname(__DIR__).'/config/economy.php';

function castleMerge(array $collection,array $add): array {
    $counts=[];foreach(array_merge($collection,$add) as $entry){$id=(int)$entry['card_id'];$counts[$id]=($counts[$id]??0)+(int)$entry['quantity'];}
    $result=[];foreach($counts as $id=>$quantity)$result[]=['card_id'=>$id,'quantity'=>$quantity];return $result;
}
function castlePool(PDO $pdo): array {
    $pool=['Common'=>[],'Uncommon'=>[],'Rare'=>[]];
    $rows=$pdo->query("SELECT source_id,rarity_en FROM lorcana_cards WHERE set_code='1' AND active=1 AND rarity_en IN ('Common','Uncommon','Rare') ORDER BY source_id")->fetchAll(PDO::FETCH_ASSOC);
    foreach($rows as $r)$pool[$r['rarity_en']][]=(int)$r['source_id'];
    foreach($pool as $cards)if(!$cards)throw new RuntimeException('Catálogo de raridades incompleto.');return $pool;
}
function castleRoll(array $pool,?callable $random=null): array {
    $random??=static fn($min,$max)=>random_int($min,$max);$result=[];
    foreach(['Common'=>7,'Uncommon'=>3,'Rare'=>2] as $rarity=>$count)for($i=0;$i<$count;$i++)$result[]=['card_id'=>$pool[$rarity][$random(0,count($pool[$rarity])-1)],'quantity'=>1,'foil'=>false];
    if($random(1,100)===1)$result[$random(0,11)]['foil']=true;
    return $result;
}
function castleShopState(PDO $pdo,int $uid): array {
    $q=$pdo->prepare("SELECT * FROM adventure_journeys WHERE usuario_id=? AND chapter='first-chapter'");$q->execute([$uid]);$journey=$q->fetch(PDO::FETCH_ASSOC);
    if(!$journey)throw new RuntimeException('Escolha seu starter antes de visitar a loja.');
    $v=economySettings($pdo);$q=$pdo->prepare('SELECT gold FROM player_wallets WHERE usuario_id=?');$q->execute([$uid]);$gold=(int)$q->fetchColumn();
    $q=$pdo->prepare('SELECT starter_id FROM adventure_starters WHERE usuario_id=?');$q->execute([$uid]);$owned=$q->fetchAll(PDO::FETCH_COLUMN);$owned[]=$journey['starter_id'];
    $q=$pdo->prepare('SELECT id,art,opened_at FROM adventure_packs WHERE usuario_id=? ORDER BY id DESC');$q->execute([$uid]);$packs=$q->fetchAll(PDO::FETCH_ASSOC);
    $q=$pdo->prepare('SELECT card_id FROM player_foils WHERE usuario_id=?');$q->execute([$uid]);$foils=array_map('intval',$q->fetchAll(PDO::FETCH_COLUMN));
    $q=$pdo->prepare('SELECT tokens FROM player_foil_tokens WHERE usuario_id=?');$q->execute([$uid]);$tokens=(int)$q->fetchColumn();
    return ['gold'=>$gold,'booster_price'=>$v['booster_gold'],'starter_price'=>$v['starter_gold'],'owned'=>$owned,'packs'=>$packs,'foils'=>$foils,'tokens'=>$tokens,'starters'=>array_map(static fn($s)=>['id'=>$s['id'],'name'=>$s['name'],'cover'=>'../'.$s['cover']],adventureStarters()),'collection'=>adventureCards($pdo,json_decode($journey['collection_json'],true)),'deck'=>json_decode($journey['deck_json'],true)];
}
function castleShopAction(PDO $pdo,int $uid,string $action,array $body): array {
    $pdo->beginTransaction();
    try{
        $pdo->prepare('INSERT IGNORE INTO player_wallets (usuario_id) VALUES (?)')->execute([$uid]);
        $q=$pdo->prepare('SELECT gold FROM player_wallets WHERE usuario_id=? FOR UPDATE');$q->execute([$uid]);$gold=(int)$q->fetchColumn();
        $q=$pdo->prepare("SELECT * FROM adventure_journeys WHERE usuario_id=? AND chapter='first-chapter' FOR UPDATE");$q->execute([$uid]);$journey=$q->fetch(PDO::FETCH_ASSOC);
        if(!$journey)throw new RuntimeException('Escolha seu starter primeiro.');
        $collection=json_decode($journey['collection_json'],true);$result=[];
        if($action==='buy'){
            $key=$body['request_key']??'';if(!is_string($key)||!preg_match('/^[a-zA-Z0-9-]{16,80}$/',$key))throw new RuntimeException('Identificador de compra inválido.');
            $product=$body['product_id']??'';$qty=$body['quantity']??null;
            if(!is_string($product)||!is_int($qty)||$qty<1||$qty>100)throw new RuntimeException('Compre de 1 a 100 pacotes por operação.');
            $q=$pdo->prepare('SELECT * FROM adventure_orders WHERE usuario_id=? AND request_key=?');$q->execute([$uid,$key]);$existing=$q->fetch();
            if($existing){if($existing['product_id']!==$product||(int)$existing['quantity']!==$qty)throw new RuntimeException('Identificador já utilizado em outra compra.');$pdo->commit();return ['purchased'=>true,'repeated'=>true];}
            $v=economySettings($pdo);$starter=null;$art=null;
            if(in_array($product,['booster-elsa','booster-mickey','booster-maleficent'],true)){$art=substr($product,8);$price=$v['booster_gold'];castlePool($pdo);}
            else{
                foreach(adventureStarters() as $s)if($s['id']===$product)$starter=$s;
                if(!$starter||$qty!==1)throw new RuntimeException('Produto inválido.');
                $q=$pdo->prepare('SELECT 1 FROM adventure_starters WHERE usuario_id=? AND starter_id=?');$q->execute([$uid,$product]);
                if($journey['starter_id']===$product||$q->fetchColumn())throw new RuntimeException('Você já possui este starter.');
                adventureCards($pdo,$starter['cards']);$price=$v['starter_gold'];
            }
            $total=$price*$qty;if($price<1||$gold<$total)throw new RuntimeException('Gold insuficiente.');
            $pdo->prepare('INSERT INTO adventure_orders (usuario_id,request_key,product_id,quantity,gold_spent) VALUES (?,?,?,?,?)')->execute([$uid,$key,$product,$qty,$total]);$order=(int)$pdo->lastInsertId();
            $pdo->prepare('UPDATE player_wallets SET gold=gold-? WHERE usuario_id=?')->execute([$total,$uid]);
            if($art){$q=$pdo->prepare('INSERT INTO adventure_packs (usuario_id,order_id,art) VALUES (?,?,?)');for($i=0;$i<$qty;$i++)$q->execute([$uid,$order,$art]);}
            else{$pdo->prepare('INSERT INTO adventure_starters (usuario_id,starter_id) VALUES (?,?)')->execute([$uid,$product]);$collection=castleMerge($collection,$starter['cards']);}
            $result=['purchased'=>true,'gold_spent'=>$total];
        }elseif($action==='open'){
            $id=$body['pack_id']??null;if(!is_int($id)||$id<1)throw new RuntimeException('Pacote inválido.');
            $q=$pdo->prepare('SELECT * FROM adventure_packs WHERE id=? AND usuario_id=? FOR UPDATE');$q->execute([$id,$uid]);$pack=$q->fetch();if(!$pack)throw new RuntimeException('Pacote não encontrado.');
            if($pack['result_json']!==null)$cards=json_decode($pack['result_json'],true);
            else{
                $cards=castleRoll(castlePool($pdo));
                foreach($cards as &$c)if($c['foil']){
                    $q=$pdo->prepare('INSERT IGNORE INTO player_foils (usuario_id,card_id) VALUES (?,?)');$q->execute([$uid,$c['card_id']]);$c['foil_token']=$q->rowCount()===0;
                    if($c['foil_token'])$pdo->prepare('INSERT INTO player_foil_tokens (usuario_id,tokens) VALUES (?,1) ON DUPLICATE KEY UPDATE tokens=tokens+1')->execute([$uid]);
                }unset($c);
                $collection=castleMerge($collection,$cards);
                $pdo->prepare('UPDATE adventure_packs SET result_json=?,opened_at=CURRENT_TIMESTAMP WHERE id=?')->execute([json_encode($cards),$id]);
            }
            $details=adventureCards($pdo,$cards);foreach($details as $i=>&$detail){$detail['foil']=$cards[$i]['foil'];$detail['foil_token']=$cards[$i]['foil_token']??false;}unset($detail);
            $result=['cards'=>$details,'pack_id'=>$id];
        }elseif($action==='deck'){
            $entries=$body['cards']??null;if(!is_array($entries)||count($entries)>204)throw new RuntimeException('Deck inválido.');
            $owned=array_column($collection,'quantity','card_id');$total=0;$seen=[];
            foreach($entries as $e){if(!is_array($e)||!is_int($e['card_id']??null)||!is_int($e['quantity']??null)||$e['quantity']<1||$e['quantity']>4||isset($seen[$e['card_id']])||($owned[$e['card_id']]??0)<$e['quantity'])throw new RuntimeException('Quantidade de cartas inválida ou não possuída.');$seen[$e['card_id']]=true;$total+=$e['quantity'];}
            if($total<60)throw new RuntimeException('O deck precisa ter pelo menos 60 cartas.');
            $colors=[];$names=[];foreach(adventureCards($pdo,$entries) as $entry){$c=$entry['card'];foreach($c['colors'] as $color)$colors[$color]=true;$name=$c['original']['full_name']??$c['full_name'];$names[$name]=($names[$name]??0)+$entry['quantity'];}
            if(count($colors)>2||max($names)>4)throw new RuntimeException('Use até duas cores e no máximo quatro cópias por carta.');
            $pdo->prepare("UPDATE adventure_journeys SET deck_json=? WHERE usuario_id=? AND chapter='first-chapter'")->execute([json_encode($entries),$uid]);$result=['saved'=>true];
        }else throw new RuntimeException('Ação inválida.');
        $pdo->prepare("UPDATE adventure_journeys SET collection_json=? WHERE usuario_id=? AND chapter='first-chapter'")->execute([json_encode($collection),$uid]);
        $pdo->commit();return $result;
    }catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}
}
