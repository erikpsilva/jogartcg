<?php
declare(strict_types=1);

function shopCatalog(): array {
    try {
        $rows=getDbConnection()->query('SELECT * FROM shop_products ORDER BY name')->fetchAll(PDO::FETCH_ASSOC);
        return array_map(static function($r){$r['gold']=$r['gold']===null?null:(int)$r['gold'];$r['reais']=$r['reais']===null?null:(int)$r['reais'];$r['active']=(bool)$r['active'];return $r;},$rows);
    } catch (PDOException $e) { if ($e->getCode() !== '42S02') throw $e; }
    return [
        ['id'=>'playmat-hades','name'=>'Domínio de Hades','type'=>'playmat','image'=>'playmat-hades.jpg','gold'=>1200,'reais'=>null],
        ['id'=>'playmat-incriveis','name'=>'Família Incrível','type'=>'playmat','image'=>'playmat-incriveis.jpg','gold'=>1500,'reais'=>990],
        ['id'=>'playmat-pooh','name'=>'Aventura no Bosque','type'=>'playmat','image'=>'playmat-pooh.jpg','gold'=>900,'reais'=>null],
        ['id'=>'playmat-toystory','name'=>'Ao Infinito','type'=>'playmat','image'=>'playmat-toystory.jpg','gold'=>null,'reais'=>1290],
        ['id'=>'sleeve-incriveis','name'=>'Verso Incrível','type'=>'sleeve','image'=>'sleeve-incriveis.jpg','gold'=>600,'reais'=>490],
        ['id'=>'sleeve-gold','name'=>'Tinta Dourada','type'=>'sleeve','image'=>'sleeve-gold.png','gold'=>null,'reais'=>790],
    ];
}
function battleCosmetics(PDO $pdo, int $deckId): array {
    $result = ['playmat'=>null, 'sleeve'=>null];
    if (!shopReady($pdo)) return $result;
    $q=$pdo->prepare('SELECT c.playmat_id,c.sleeve_id,d.usuario_id FROM deck_cosmetics c JOIN decks d ON d.id=c.deck_id WHERE c.deck_id=?');
    $q->execute([$deckId]); $row=$q->fetch();
    if (!$row) return $result;
    $catalog=array_column(shopCatalog(),null,'id');
    foreach (['playmat','sleeve'] as $type) {
        $id=$row[$type.'_id'];
        if (!$id || !isset($catalog[$id]) || $catalog[$id]['type']!==$type) continue;
        $q=$pdo->prepare('SELECT 1 FROM player_items WHERE usuario_id=? AND item_id=?');$q->execute([$row['usuario_id'],$id]);
        if ($q->fetchColumn()) $result[$type]='./shop/'.$catalog[$id]['image'];
    }
    return $result;
}
function shopReady(PDO $pdo): bool {
    try { $pdo->query('SELECT usuario_id FROM player_wallets LIMIT 0'); $pdo->query('SELECT item_id FROM player_items LIMIT 0'); $pdo->query('SELECT deck_id FROM deck_cosmetics LIMIT 0'); return true; }
    catch (PDOException $e) { if (in_array($e->getCode(), ['42S02','42S22'], true)) return false; throw $e; }
}
function handleShopRoutes(PDO $pdo, array $segments, string $method): void {
    if (($segments[1] ?? '') !== 'shop') return;
    header('Cache-Control: private, no-store');
    $action = $segments[2] ?? '';
    if ($method === 'GET' && $action === '') {
        $ready = shopReady($pdo); $user = loadAuthenticatedPlayerRow($pdo);
        $wallet = ['xp'=>0,'gold'=>0]; $owned=[];
        if ($ready && $user) {
            $q=$pdo->prepare('SELECT xp,gold FROM player_wallets WHERE usuario_id=?'); $q->execute([$user['id']]);
            if ($row=$q->fetch()) $wallet=['xp'=>(int)$row['xp'],'gold'=>(int)$row['gold']];
            $q=$pdo->prepare('SELECT item_id FROM player_items WHERE usuario_id=?'); $q->execute([$user['id']]); $owned=$q->fetchAll(PDO::FETCH_COLUMN);
        }
        respond(['success'=>true,'data'=>['items'=>shopCatalog(),'wallet'=>$wallet,'owned'=>$owned,'ready'=>$ready,'demo_prices'=>true]]);
    }
    $uid=requireUserId($pdo);
    if (!shopReady($pdo)) respond(['success'=>false,'message'=>'Inventário em preparação. Aplique a migração da loja no banco.'],503);
    if ($method === 'POST' && $action === 'buy' && count($segments)===3) {
        if (!playerCanAccessShop(loadAuthenticatedPlayerRow($pdo) ?? [])) respond(['success'=>false,'message'=>'Loja indisponível para esta conta.'],403);
        requireCsrf(); $body=readRequestPayload(); $items=array_column(shopCatalog(),null,'id');
        $item=$items[(string)($body['item_id']??'')]??null;
        if (!$item || !($item['active']??true) || $item['gold']===null) respond(['success'=>false,'message'=>'Este item não está disponível por gold. Pagamentos em reais ainda não estão disponíveis.'],422);
        try {
            $pdo->beginTransaction();
            $pdo->prepare('INSERT IGNORE INTO player_wallets (usuario_id) VALUES (?)')->execute([$uid]);
            $q=$pdo->prepare('SELECT gold FROM player_wallets WHERE usuario_id=? FOR UPDATE'); $q->execute([$uid]); $gold=(int)$q->fetchColumn();
            $q=$pdo->prepare('SELECT 1 FROM player_items WHERE usuario_id=? AND item_id=?'); $q->execute([$uid,$item['id']]);
            if ($q->fetchColumn()) { $pdo->commit(); respond(['success'=>true,'data'=>['already_owned'=>true]]); }
            if ($gold < $item['gold']) { $pdo->rollBack(); respond(['success'=>false,'message'=>'Gold insuficiente.'],422); }
            $pdo->prepare('UPDATE player_wallets SET gold=gold-? WHERE usuario_id=?')->execute([$item['gold'],$uid]);
            $pdo->prepare("INSERT INTO player_items (usuario_id,item_id,source,gold_spent) VALUES (?,?,'gold',?)")->execute([$uid,$item['id'],$item['gold']]);
            $pdo->commit(); respond(['success'=>true,'data'=>['already_owned'=>false]]);
        } catch (Throwable $e) { if($pdo->inTransaction()) $pdo->rollBack(); error_log('Shop purchase: '.$e->getMessage()); respond(['success'=>false,'message'=>'Não foi possível concluir a compra.'],503); }
    }
    if ($action==='decks' && count($segments)===4 && ctype_digit($segments[3]) && in_array($method,['GET','PUT'],true)) {
        $id=(int)$segments[3];
        $q=$pdo->prepare('SELECT id FROM decks WHERE id=? AND usuario_id=?'); $q->execute([$id,$uid]);
        if(!$q->fetchColumn()) respond(['success'=>false,'message'=>'Deck não encontrado.'],404);
        if($method==='GET') {
            $q=$pdo->prepare('SELECT playmat_id,sleeve_id FROM deck_cosmetics WHERE deck_id=?');$q->execute([$id]);
            respond(['success'=>true,'data'=>$q->fetch(PDO::FETCH_ASSOC)?:['playmat_id'=>null,'sleeve_id'=>null]]);
        }
        requireCsrf();$body=readRequestPayload();$items=array_column(shopCatalog(),null,'id');$values=[];
        foreach(['playmat_id'=>'playmat','sleeve_id'=>'sleeve'] as $field=>$type){
            $value=$body[$field]??null;
            if($value!==null){
                if(!is_string($value)||!isset($items[$value])||$items[$value]['type']!==$type) respond(['success'=>false,'message'=>'Personalização inválida.'],422);
                $q=$pdo->prepare('SELECT 1 FROM player_items WHERE usuario_id=? AND item_id=?');$q->execute([$uid,$value]);
                if(!$q->fetchColumn()) respond(['success'=>false,'message'=>'Você não possui este item.'],403);
            }
            $values[]=$value;
        }
        $pdo->prepare('INSERT INTO deck_cosmetics (deck_id,playmat_id,sleeve_id) VALUES (?,?,?) ON DUPLICATE KEY UPDATE playmat_id=VALUES(playmat_id),sleeve_id=VALUES(sleeve_id)')->execute([$id,...$values]);
        respond(['success'=>true,'data'=>['saved'=>true]]);
    }
    respond(['success'=>false,'message'=>'Rota não encontrada.'],404);
}
