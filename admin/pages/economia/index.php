<?php
require ROOT.'/admin/includes/auth_check.php';
require_once ROOT.'/config/database.php';
require_once ROOT.'/admin/includes/settings.php';
require_once ROOT.'/config/economy.php';
$pdo=getDbConnection();
if(!canManageSettings($pdo,$_SESSION)){http_response_code(403);exit('Acesso restrito.');}
$_SESSION['admin_csrf']??=bin2hex(random_bytes(32));
$fields=economyFields();$error='';$saved=false;
function econEscape($value){return htmlspecialchars((string)$value,ENT_QUOTES,'UTF-8');}
try{
 $values=economySettings($pdo);
 if($_SERVER['REQUEST_METHOD']==='POST'){
  if(!hash_equals($_SESSION['admin_csrf'],(string)($_POST['csrf']??'')))throw new RuntimeException('Sessão inválida. Reabra a página.');
  $next=[];
  foreach($fields as $key=>$field){
   $raw=$_POST[$key]??null;
   if(!is_string($raw)||!ctype_digit($raw)||strlen($raw)>9||(int)$raw>100000000)throw new RuntimeException('Valor inválido: '.$field[0]);
   $next[$key]=(int)$raw;
  }
  foreach(['level_xp','foil_tokens','booster_gold','starter_gold'] as $key)if($next[$key]<1)throw new RuntimeException('Valor deve ser maior que zero: '.$fields[$key][0]);
  if($next['level_cap']>999)throw new RuntimeException('Nível máximo permitido: 999.');
  $pdo->beginTransaction();
  $q=$pdo->prepare('INSERT INTO economy_settings (setting_key,setting_value) VALUES (?,?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value)');
  foreach($next as $key=>$value)$q->execute([$key,$value]);
  $pdo->commit();$values=$next;$saved=true;
 }
}catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();$error=$e instanceof PDOException?'Configurações indisponíveis. Confira a migração de economia.':$e->getMessage();$values??=array_map(static fn($f)=>$f[1],$fields);}
?>
<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Controle de XP e Gold</title><?php include ROOT.'/admin/includes/assets.php'; ?>
<style>.economy-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}.economy-grid label{display:grid;gap:5px;font-size:13px}.economy-grid input{width:100%;box-sizing:border-box;padding:9px;border:1px solid #786337;border-radius:5px;background:#101722;color:#fff;font:inherit}.economy-table{width:100%;border-collapse:collapse;margin:18px 0}.economy-table th,.economy-table td{text-align:left;padding:10px;border-bottom:1px solid #596073}.economy-scroll{overflow:auto}.economy-note{padding:12px;background:#302719;color:#ffe0a2;line-height:1.5}.economy-section{margin:24px 0}.economy-grid input:invalid{border-color:#ff8787}</style></head><body>
<?php include ROOT.'/admin/includes/header/header.php'; ?><div class="adminLayout"><?php include ROOT.'/admin/includes/sidebar/sidebar.php'; ?><main class="adminLayout__content">
<h1>Controle de XP e Gold</h1><p>Valores de referência salvos e simulação automática. Alterar a simulação não altera saldos.</p>
<p class="economy-note">Integrações com partidas, compras, níveis e foil ainda em desenvolvimento. Salvar aqui não concede recompensas nem altera preços dos produtos existentes. Os 500 gold por concluir todas as diárias são uma hipótese pendente de confirmação.</p>
<?php if($error):?><p role="alert"><?=econEscape($error)?></p><?php endif;?><?php if($saved):?><p role="status">Valores salvos.</p><?php endif;?>
<form method="post" id="economy-form"><input type="hidden" name="csrf" value="<?=econEscape($_SESSION['admin_csrf'])?>">
<section class="economy-section"><h2>Regras e preços editáveis</h2><div class="economy-grid"><?php foreach($fields as $key=>$field):?><label><?=econEscape($field[0])?><input data-rule="<?=$key?>" name="<?=$key?>" type="number" min="<?=in_array($key,['level_xp','foil_tokens','booster_gold','starter_gold'],true)?1:0?>" max="<?=$key==='level_cap'?999:100000000?>" step="1" required value="<?=econEscape($values[$key])?>"></label><?php endforeach;?></div></section>
<button class="btn btn--primary">Salvar valores</button><span id="economy-dirty" role="status"></span></form>
<section class="economy-section"><h2>Simulador diário</h2><p>Considera login e uma partida contra o bot todo dia. A missão de amigos requer três partidas, inclusive com a mesma pessoa. Valores abaixo não são salvos como regras.</p><div class="economy-grid">
<?php foreach(['wins'=>['Vitórias contra amigos',3],'losses'=>['Derrotas contra amigos',0],'first'=>['Primeiras vitórias em fases comuns',0],'repeat'=>['Vitórias repetidas em fases comuns',3],'bossFirst'=>['Primeira vitória contra Mickey',0],'bossRepeat'=>['Vitórias repetidas contra Mickey',0],'adventureLosses'=>['Derrotas na aventura',0],'days'=>['Dias da projeção',30]] as $key=>$field):?><label><?=econEscape($field[0])?><input data-scenario="<?=$key?>" type="number" min="<?=$key==='days'?1:0?>" max="<?=$key==='bossFirst'?1:1000?>" step="1" value="<?=$field[1]?>"></label><?php endforeach;?></div>
<div class="economy-scroll"><table class="economy-table"><thead><tr><th>Cenário</th><th>XP/dia</th><th>Gold/dia</th><th>XP na projeção</th><th>Gold na projeção</th><th>Níveis desde 0</th></tr></thead><tbody id="economy-results" aria-live="polite"></tbody></table></div>
<p>Primeira vitória em Mickey: gold da fase + bônus do boss. Repetição: somente gold de repetição do boss. Todas as derrotas na aventura dão XP, sem gold. Missão da aventura conta partidas, não só vitórias.</p>
<p class="economy-note">A projeção multiplica um dia pelos dias escolhidos. Não significa que existem fases inéditas infinitas: há oito fases comuns e um boss no castelo. Para uma rotina sustentável, use fases repetidas. Não são contabilizadas compras, resgates de passe ou login de sete dias.</p>
<h2>Regras fixas aprovadas</h2><ul><li>Booster: 7 comuns, 3 incomuns e 2 raras, somente The First Chapter. Chance de 1% por pacote de uma das 12 cartas ser foil.</li><li>Outros starters: uma compra de cada, adicionando 60 cartas à coleção da aventura.</li><li>Cada nível libera uma foil; foil repetida vira um token. Seleção da foil por nível ainda precisa ser definida.</li><li>Deck da aventura separado do Versus: mínimo 60 cartas, até duas cores e quatro cópias por carta.</li><li>Versos e playmats: faixa 1 normal, faixa 2 raro; playmat animado: faixa 3. Personagens: faixa 2 normal, faixa 3 raro.</li></ul></section>
</main></div><?php include ROOT.'/admin/includes/scripts.php'; ?>
<script>
(()=>{
 const rules=[...document.querySelectorAll('[data-rule]')],inputs=[...document.querySelectorAll('[data-scenario]')],result=document.getElementById('economy-results');
 const number=n=>new Intl.NumberFormat('pt-BR').format(n);
 function render(){
  if([...rules,...inputs].some(e=>!e.checkValidity()||e.value==='')){result.textContent='Corrija os valores para calcular.';return;}
  const v=Object.fromEntries(rules.map(e=>[e.dataset.rule,Number(e.value)])),s=Object.fromEntries(inputs.map(e=>[e.dataset.scenario,Number(e.value)]));
  const friends=s.wins+s.losses>=3,adventure=s.first+s.repeat+s.bossFirst+s.bossRepeat+s.adventureLosses>=3;
  const xp=s.wins*v.pvp_win_xp+s.losses*v.pvp_loss_xp+v.login_xp+v.bot_xp+(friends?v.friends_xp:0),gold=s.wins*v.pvp_win_gold+s.losses*v.pvp_loss_gold;
  const fullXp=xp+(s.first+s.bossFirst)*v.first_xp+(s.repeat+s.bossRepeat)*v.repeat_xp+s.adventureLosses*v.loss_xp+(adventure?v.adventure_mission_xp:0)+(friends&&adventure?v.all_xp:0);
  const fullGold=gold+s.first*v.first_gold+s.repeat*v.repeat_gold+s.bossFirst*(v.first_gold+v.boss_bonus)+s.bossRepeat*v.boss_repeat+(friends&&adventure?v.all_gold:0);
  result.replaceChildren();
  for(const [label,x,g] of [['Com aventura',fullXp,fullGold],['Sem aventura',xp,gold]]){const tr=document.createElement('tr');for(const value of [label,number(x),number(g),number(x*s.days),number(g*s.days),number(Math.min(v.level_cap,Math.floor(x*s.days/v.level_xp)))]){const td=document.createElement('td');td.textContent=value;tr.append(td);}result.append(tr);}
 }
 rules.forEach(e=>e.addEventListener('input',()=>{document.getElementById('economy-dirty').textContent=' Prévia alterada; salve para persistir.';render();}));inputs.forEach(e=>e.addEventListener('input',render));render();
})();
</script></body></html>
