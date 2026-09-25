<?php
declare(strict_types=1);

function economyFields(): array {
    return [
        'pvp_win_xp'=>['Duelo: vitória · XP',100], 'pvp_loss_xp'=>['Duelo: derrota · XP',50],
        'pvp_win_gold'=>['Duelo: vitória · gold',300], 'pvp_loss_gold'=>['Duelo: derrota · gold',100],
        'login_xp'=>['Missão: login · XP',50], 'friends_xp'=>['Missão: 3 partidas com amigos · XP',250],
        'bot_xp'=>['Missão: 1 partida contra bot · XP',100], 'adventure_mission_xp'=>['Missão: 3 partidas na aventura · XP',250],
        'all_xp'=>['Todas as missões · XP',200], 'all_gold'=>['Todas as missões · gold (hipótese da prévia)',500],
        'first_xp'=>['Primeira vitória na fase · XP',100], 'repeat_xp'=>['Vitória repetida na fase · XP',60], 'loss_xp'=>['Derrota na aventura · XP',20],
        'first_gold'=>['Primeira vitória na fase · gold',500], 'repeat_gold'=>['Vitória repetida na fase · gold',100],
        'boss_bonus'=>['Bônus adicional: primeira vitória no boss · gold',1000], 'boss_repeat'=>['Vitória repetida no boss · gold total',300],
        'level_xp'=>['XP por nível',10000], 'level_cap'=>['Nível máximo',999], 'foil_tokens'=>['Tokens para escolher uma foil',5],
        'booster_gold'=>['Booster · gold',1500], 'starter_gold'=>['Starter · gold',5000],
        'tier1_cents'=>['Faixa 1 · centavos de real',290], 'tier1_gold'=>['Faixa 1 · gold',50000],
        'tier2_cents'=>['Faixa 2 · centavos de real',490], 'tier2_gold'=>['Faixa 2 · gold',80000],
        'tier3_cents'=>['Faixa 3 · centavos de real',990], 'tier3_gold'=>['Faixa 3 · gold',120000],
    ];
}
function economySettings(PDO $pdo): array {
    $values=array_map(static fn($f)=>$f[1],economyFields());
    foreach($pdo->query('SELECT setting_key,setting_value FROM economy_settings')->fetchAll(PDO::FETCH_ASSOC) as $row){
        if(array_key_exists($row['setting_key'],$values))$values[$row['setting_key']]=(int)$row['setting_value'];
    }
    return $values;
}
function economyPreview(array $v, int $wins=3, int $losses=0, int $first=0, int $repeat=3, int $bossFirst=0, int $bossRepeat=0, int $adventureLosses=0): array {
    $baseXp=$wins*$v['pvp_win_xp']+$losses*$v['pvp_loss_xp']+$v['login_xp']+$v['bot_xp'];
    if($wins+$losses>=3)$baseXp+=$v['friends_xp'];
    $baseGold=$wins*$v['pvp_win_gold']+$losses*$v['pvp_loss_gold'];
    $fullXp=$baseXp+($first+$bossFirst)*$v['first_xp']+($repeat+$bossRepeat)*$v['repeat_xp']+$adventureLosses*$v['loss_xp'];
    $fullGold=$baseGold+$first*$v['first_gold']+$repeat*$v['repeat_gold']+$bossFirst*($v['first_gold']+$v['boss_bonus'])+$bossRepeat*$v['boss_repeat'];
    if($first+$repeat+$bossFirst+$bossRepeat+$adventureLosses>=3){
        $fullXp+=$v['adventure_mission_xp'];
        if($wins+$losses>=3){$fullXp+=$v['all_xp'];$fullGold+=$v['all_gold'];}
    }
    return ['com_aventura'=>['xp'=>$fullXp,'gold'=>$fullGold], 'sem_aventura'=>['xp'=>$baseXp,'gold'=>$baseGold]];
}
