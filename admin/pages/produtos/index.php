<?php
require ROOT.'/admin/includes/auth_check.php';
require_once ROOT.'/config/database.php';
require_once ROOT.'/admin/includes/settings.php';
$pdo=getDbConnection();
if(!canManageSettings($pdo,$_SESSION)){http_response_code(403);exit('Acesso restrito.');}
$_SESSION['admin_csrf']??=bin2hex(random_bytes(32));
function productEscape($v){return htmlspecialchars((string)$v,ENT_QUOTES,'UTF-8');}
$id=(string)($_GET['id']??'');$error='';$row=['name'=>'','type'=>'sleeve','description'=>'','gold'=>'','reais'=>'','active'=>1,'image'=>''];
try {
 if($id!==''){$q=$pdo->prepare('SELECT * FROM shop_products WHERE id=?');$q->execute([$id]);$row=$q->fetch(PDO::FETCH_ASSOC);if(!$row){http_response_code(404);exit('Produto não encontrado.');}}
 if($_SERVER['REQUEST_METHOD']==='POST'){
  if(!hash_equals($_SESSION['admin_csrf'],(string)($_POST['csrf']??'')))throw new RuntimeException('Sessão inválida. Reabra a página.');
  $name=trim((string)($_POST['name']??''));$type=(string)($_POST['type']??'');$description=trim((string)($_POST['description']??''));
  if($name===''||mb_strlen($name)>120)throw new RuntimeException('Informe um nome de até 120 caracteres.');
  if(!in_array($type,['playmat','sleeve'],true))throw new RuntimeException('Tipo inválido.');
  if($id!==''&&$type!==$row['type'])throw new RuntimeException('O tipo de um produto existente não pode mudar.');
  $prices=[];foreach(['gold','reais'] as $key){$v=trim((string)($_POST[$key]??''));if($v!==''&&(!ctype_digit($v)||(float)$v>100000000))throw new RuntimeException('Preços devem ser inteiros positivos (reais em centavos).');$prices[$key]=$v===''?null:(int)$v;}
  if($prices['gold']===null&&$prices['reais']===null)throw new RuntimeException('Informe pelo menos um preço.');
  if(mb_strlen($description)>3000)throw new RuntimeException('Descrição: máximo de 3000 caracteres.');
  $animation=(string)($_POST['animation']??'none');
  $intensity=filter_var($_POST['animation_intensity']??'0.8',FILTER_VALIDATE_FLOAT);
  if(!in_array($animation,['none','hades'],true)||($animation!=='none'&&$type!=='playmat'))throw new RuntimeException('Animação disponível apenas para playmats.');
  if($intensity===false||$intensity<0||$intensity>1.5)throw new RuntimeException('Intensidade deve ficar entre 0 e 1,5.');
  $image=$row['image'];$upload=$_FILES['image']??null;
  if($upload&&$upload['error']!==UPLOAD_ERR_NO_FILE){
   if($upload['error']!==UPLOAD_ERR_OK||$upload['size']>5*1024*1024)throw new RuntimeException('Imagem inválida. Limite: 5 MB.');
   $mime=(new finfo(FILEINFO_MIME_TYPE))->file($upload['tmp_name']);$extensions=['image/jpeg'=>'jpg','image/png'=>'png','image/webp'=>'webp'];
   if(!isset($extensions[$mime])||!getimagesize($upload['tmp_name']))throw new RuntimeException('Use JPG, PNG ou WebP válido.');
   $image='product-'.bin2hex(random_bytes(16)).'.'.$extensions[$mime];
   if(!move_uploaded_file($upload['tmp_name'],ROOT.'/client/shop/'.$image))throw new RuntimeException('Não foi possível salvar a imagem.');
  }
  if(!$image)throw new RuntimeException('Envie a imagem do produto.');
  $values=[$name,$type,$image,$description,$prices['gold'],$prices['reais'],isset($_POST['active'])?1:0,$animation,$intensity];
  if($id===''){$id='product-'.bin2hex(random_bytes(12));$q=$pdo->prepare('INSERT INTO shop_products (name,type,image,description,gold,reais,active,animation,animation_intensity,id) VALUES (?,?,?,?,?,?,?,?,?,?)');}
  else $q=$pdo->prepare('UPDATE shop_products SET name=?,type=?,image=?,description=?,gold=?,reais=?,active=?,animation=?,animation_intensity=? WHERE id=?');
  $q->execute([...$values,$id]);header('Location: '.adminUrl('produtos',['id'=>$id,'saved'=>1]),true,303);exit;
 }
 $products=$pdo->query('SELECT * FROM shop_products ORDER BY name')->fetchAll(PDO::FETCH_ASSOC);
}catch(Throwable $e){$error=$e instanceof PDOException?'Banco indisponível. Aplique a migração shop-products.':$e->getMessage();$products=[];}
?>
<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Produtos · Jogar TCG</title><?php include ROOT.'/admin/includes/assets.php'; ?><style>.product-form{display:grid;gap:16px;max-width:700px}.product-form label{display:grid;gap:8px}.product-form input,.product-form select,.product-form textarea{padding:12px;background:#10151e;color:white;border:1px solid #796333;border-radius:5px;width:100%;box-sizing:border-box}.product-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin-top:32px}.product-grid img{width:100%;height:140px;object-fit:contain}.product-grid a{color:#ffe080}.product-form input[type=checkbox]{width:auto}</style></head><body>
<?php include ROOT.'/admin/includes/header/header.php'; ?><div class="adminLayout"><?php include ROOT.'/admin/includes/sidebar/sidebar.php'; ?><main class="adminLayout__content"><header class="adminPageHeading"><h1>Produtos da loja</h1><p>Cadastre playmats e versos. Desativar retira da vitrine sem apagar itens comprados. Pagamentos em reais ainda não estão disponíveis.</p><a href="<?=adminUrl('produtos')?>">+ Novo produto</a></header>
<?php if($error):?><p role="alert"><?=productEscape($error)?></p><?php endif;?><?php if(isset($_GET['saved'])):?><p role="status">Produto salvo.</p><?php endif;?>
<form method="post" enctype="multipart/form-data" class="product-form"><input type="hidden" name="csrf" value="<?=productEscape($_SESSION['admin_csrf'])?>"><label>Nome<input name="name" required maxlength="120" value="<?=productEscape($row['name'])?>"></label><label>Tipo<select name="type"><?php foreach(['sleeve'=>'Verso de carta','playmat'=>'Playmat'] as $k=>$v):?><option value="<?=$k?>" <?=$row['type']===$k?'selected':''?>><?=$v?></option><?php endforeach;?></select></label><label>Movimento do cenário<select name="animation"><option value="none" <?=($row['animation']??'none')==='none'?'selected':''?>>Imagem estática</option><option value="hades" <?=($row['animation']??'none')==='hades'?'selected':''?>>Hades — Cenário Vivo</option></select></label><label>Intensidade (0 = parado; 0,8 = suave; máximo 1,5)<input name="animation_intensity" type="number" min="0" max="1.5" step="0.05" value="<?=productEscape($row['animation_intensity']??0.8)?>"></label><p>O efeito Hades usa posições específicas desta arte; não aplicar em outras imagens. <a href="<?=BASE_URL?>/client/hades-motion-preview.html" target="_blank" rel="noopener">Abrir prévia com controle de intensidade</a></p><label>Descrição<textarea name="description" maxlength="3000"><?=productEscape($row['description'])?></textarea></label><label>Gold (vazio = não vender por gold)<input type="number" min="0" max="100000000" name="gold" value="<?=productEscape($row['gold'])?>"></label><label>Reais em centavos (490 = R$ 4,90; vazio = indisponível)<input type="number" min="0" max="100000000" name="reais" value="<?=productEscape($row['reais'])?>"></label><label>Imagem JPG, PNG ou WebP — até 5 MB<input type="file" name="image" accept="image/jpeg,image/png,image/webp" <?=$id===''?'required':''?>></label><label><span><input type="checkbox" name="active" <?=$row['active']?'checked':''?>> Disponível na loja</span></label><button class="btn btn--primary">Salvar produto</button></form>
<section class="product-grid"><?php foreach($products as $p):?><article class="adminCard"><img src="<?=BASE_URL.'/client/shop/'.productEscape($p['image'])?>" alt=""><h2><?=productEscape($p['name'])?></h2><p><?=$p['active']?'Ativo':'Inativo'?> · <?=productEscape($p['gold']??'—')?> gold</p><a href="<?=adminUrl('produtos',['id'=>$p['id']])?>">Editar produto</a></article><?php endforeach;?></section></main></div><?php include ROOT.'/admin/includes/scripts.php'; ?></body></html>
