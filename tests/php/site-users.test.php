<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require_once dirname(__DIR__, 2) . '/admin/includes/site_users.php';
require_once dirname(__DIR__, 2) . '/api/session.php';

function fixtureUsers(): PDO {
    $p = new PDO('sqlite::memory:', null, null, [PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC]);
    $p->exec('PRAGMA foreign_keys=ON');
    $p->exec('CREATE TABLE admin_usuarios (id INTEGER PRIMARY KEY, nivel_acesso TEXT)');
    $p->exec("INSERT INTO admin_usuarios VALUES (1,'admin'),(2,'editor')");
    $p->exec('CREATE TABLE usuarios (id INTEGER PRIMARY KEY AUTOINCREMENT,nome TEXT,sobrenome TEXT,email TEXT UNIQUE,cpf TEXT UNIQUE,telefone TEXT,data_nascimento TEXT,senha_hash TEXT,foto_perfil TEXT,status TEXT DEFAULT \'ativo\',created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT DEFAULT CURRENT_TIMESTAMP)');
    initializePlayerAccessSchema($p); initializePlayerAccessSchema($p);
    $insert=$p->prepare('INSERT INTO usuarios (id,nome,sobrenome,email,cpf,telefone,data_nascimento,senha_hash) VALUES (?,?,?,?,?,?,?,?)');
    $insert->execute([1,'Player','One','one@example.invalid','52998224725','11999999999','1990-01-01',password_hash('Fixture!Password123',PASSWORD_BCRYPT)]);
    $insert->execute([2,'Player','Two','two@example.invalid','11144477735','11988888888','1990-01-02',password_hash('Fixture!Other123',PASSWORD_BCRYPT)]);
    $p->exec('CREATE TABLE decks (id INTEGER PRIMARY KEY,usuario_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE)');
    $p->exec('CREATE TABLE deck_cards (deck_id INTEGER REFERENCES decks(id) ON DELETE CASCADE,card_source_id INTEGER,quantidade INTEGER)');
    $p->exec('INSERT INTO decks VALUES (10,1),(20,2)'); $p->exec('INSERT INTO deck_cards VALUES (10,100,4),(20,200,4)');
    return $p;
}
function assertUser(bool $value, string $message='Assertion failed'): void { if (!$value) throw new RuntimeException($message); }
function fixtureAdmin(): array { return ['usuario'=>['id'=>1], 'admin_csrf'=>'fixture-token']; }
function editPayload(PDO $p, int $id=1): array {
    $u=loadSiteUser($p,$id);
    return ['action'=>'save','id'=>(string)$id,'csrf'=>'fixture-token','revision'=>siteUserRevision($u),'firstName'=>$u['nome'],'lastName'=>$u['sobrenome'],'email'=>$u['email'],'cpf'=>$u['cpf'],'phone'=>$u['telefone'],'birthDate'=>$u['data_nascimento'],'status'=>$u['status']];
}
function userSnapshot(PDO $p): string {
    $rows=[];foreach (['usuarios','decks','deck_cards','admin_usuarios'] as $table) $rows[$table]=$p->query('SELECT * FROM '.$table.' ORDER BY rowid')->fetchAll();
    return json_encode($rows,JSON_THROW_ON_ERROR);
}
function expectUserError(PDO $p, array $session, array $post, int $status, ?string $field=null, ?array $photo=null): void {
    $before=userSnapshot($p);
    try { mutateSiteUser($p,$session,$post,$photo); throw new RuntimeException('Mutation unexpectedly accepted'); }
    catch (SiteUserProblem $e) { assertUser($e->status===$status, 'Wrong error status: '.$e->status); if ($field) assertUser(isset($e->fields[$field]),'Missing field error '.$field); }
    assertUser(userSnapshot($p)===$before,'Rejected request changed data');
}
$tests=[
    'migration is additive, repeatable and defaults beta off'=>function(){ $p=fixtureUsers();assertUser((int)loadSiteUser($p,1)['beta_tester']===0);assertUser((int)loadSiteUser($p,1)['session_version']===1); },
    'list search matches full name and formatted CPF without exposing private fields'=>function(){ $p=fixtureUsers();foreach(['Player One','529.982.247-25'] as $q){$r=listSiteUsers($p,['q'=>$q]);assertUser($r['total']===1);assertUser(!isset($r['users'][0]['cpf'],$r['users'][0]['senha_hash']));}assertUser(listSiteUsers($p,['q'=>"' OR 1=1 --"])['total']===0);assertUser(listSiteUsers($p,['q'=>'%'])['total']===0); },
    'filters and bounded pagination cannot escape selection'=>function(){ $p=fixtureUsers();$p->exec("UPDATE usuarios SET status='inativo',beta_tester=1 WHERE id=2");$r=listSiteUsers($p,['beta'=>'1','status'=>'inativo','pagina'=>'999999']);assertUser($r['total']===1&&$r['page']===1&&(int)$r['users'][0]['id']===2);assertUser(listSiteUsers($p,['q'=>[], 'status'=>[], 'beta'=>[]])['total']===2); },
    'multi-page listing has no duplicates'=>function(){ $p=fixtureUsers();$s=$p->prepare('INSERT INTO usuarios (nome,sobrenome,email,cpf) VALUES (?,?,?,?)');for($i=0;$i<25;$i++)$s->execute(['Fixture','Pagination',"p{$i}@example.invalid",'fixture-'.$i]);$a=listSiteUsers($p,[]);$b=listSiteUsers($p,['pagina'=>'2']);assertUser(count($a['users'])===20&&count($b['users'])===7&&$a['pages']===2);assertUser(count(array_unique(array_column([...$a['users'],...$b['users']],'id')))===27); },
    'anonymous, player and editor sessions cannot mutate'=>function(){ $p=fixtureUsers();foreach([[],['user_id'=>1,'admin_csrf'=>'fixture-token'],['usuario'=>['id'=>2,'nivel_acesso'=>'admin'],'admin_csrf'=>'fixture-token']]as$s)expectUserError($p,$s,editPayload($p),403); },
    'missing forged and malformed CSRF rejected'=>function(){ $p=fixtureUsers();foreach(['', 'wrong', ['fixture-token']]as$t)expectUserError($p,fixtureAdmin(),array_replace(editPayload($p),['csrf'=>$t]),419); },
    'stale administrative role rejected from database'=>function(){ $p=fixtureUsers();$p->exec("UPDATE admin_usuarios SET nivel_acesso='editor' WHERE id=1");expectUserError($p,fixtureAdmin(),editPayload($p),403); },
    'invalid IDs and actions are rejected'=>function(){ $p=fixtureUsers();foreach(['0','-1','1 OR 1=1',['1'],'99999999999999999999999']as$id)expectUserError($p,fixtureAdmin(),array_replace(editPayload($p),['id'=>$id]),404);expectUserError($p,fixtureAdmin(),array_replace(editPayload($p),['action'=>'grant_admin']),422); },
    'duplicate email and CPF keep other accounts untouched'=>function(){ $p=fixtureUsers();expectUserError($p,fixtureAdmin(),array_replace(editPayload($p),['email'=>'two@example.invalid']),422,'email');expectUserError($p,fixtureAdmin(),array_replace(editPayload($p),['cpf'=>'11144477735']),422,'cpf'); },
    'required and malformed profile fields show individual errors'=>function(){ $p=fixtureUsers();foreach(['firstName'=>'','lastName'=>'<script>','email'=>'bad','cpf'=>'11111111111','phone'=>'123','birthDate'=>'2999-01-01','status'=>'admin','beta_tester'=>['1']]as$key=>$value)expectUserError($p,fixtureAdmin(),array_replace(editPayload($p),[$key=>$value]),422,$key); },
    'profile save normalizes allowed data and preserves password and other account'=>function(){ $p=fixtureUsers();$old=loadSiteUser($p,1);$other=loadSiteUser($p,2);$r=mutateSiteUser($p,fixtureAdmin(),array_replace(editPayload($p),['firstName'=>'  New   Name ','cpf'=>'529.982.247-25','phone'=>'(11) 99999-9999','nivel_acesso'=>'admin']));$new=loadSiteUser($p,1);assertUser($new['nome']==='New Name'&&$old['senha_hash']===$new['senha_hash']&&!$r['sessions_revoked']);assertUser($other===loadSiteUser($p,2)); },
    'beta grant/revoke takes effect without changing credentials'=>function(){ $p=fixtureUsers();$old=loadSiteUser($p,1);mutateSiteUser($p,fixtureAdmin(),editPayload($p)+['beta_tester'=>'1']);$row=loadSiteUser($p,1);assertUser(playerMayPlay(false,publicUser($row)));assertUser($old['senha_hash']===$row['senha_hash']&&(int)$row['session_version']===1);mutateSiteUser($p,fixtureAdmin(),editPayload($p));assertUser(!playerMayPlay(false,publicUser(loadSiteUser($p,1)))); },
    'public flag and beta access decision truth table'=>function(){ foreach([true,false]as$flag){assertUser(playerMayPlay($flag,null)===$flag);assertUser(playerMayPlay($flag,['beta_tester'=>false])===$flag);assertUser(playerMayPlay($flag,['beta_tester'=>true]));} },
    'status change revokes sessions and does not delete decks'=>function(){ $p=fixtureUsers();mutateSiteUser($p,fixtureAdmin(),array_replace(editPayload($p),['status'=>'inativo','beta_tester'=>'1']));assertUser(!playerSessionMatches(loadSiteUser($p,1),['user_id'=>1,'player_version'=>1]));assertUser(siteUserDeckCount($p,1)===1);mutateSiteUser($p,fixtureAdmin(),array_replace(editPayload($p),['status'=>'ativo']));assertUser(!playerSessionMatches(loadSiteUser($p,1),['user_id'=>1,'player_version'=>1])); },
    'email change revokes sessions'=>function(){ $p=fixtureUsers();$r=mutateSiteUser($p,fixtureAdmin(),array_replace(editPayload($p),['email'=>'changed@example.invalid']));assertUser($r['sessions_revoked']&&(int)loadSiteUser($p,1)['session_version']===2); },
    'password replacement is hashed and revokes previous sessions'=>function(){ $p=fixtureUsers();$post=editPayload($p)+['newPassword'=>'Changed!Password456','passwordConfirmation'=>'Changed!Password456'];mutateSiteUser($p,fixtureAdmin(),$post);$row=loadSiteUser($p,1);assertUser(password_verify('Changed!Password456',$row['senha_hash'])&&!password_verify('Fixture!Password123',$row['senha_hash']));assertUser(!playerSessionMatches($row,['user_id'=>1]));assertUser(playerSessionMatches($row,['user_id'=>1,'player_version'=>2])); },
    'weak mismatched and array passwords cannot replace credentials'=>function(){ $p=fixtureUsers();expectUserError($p,fixtureAdmin(),editPayload($p)+['newPassword'=>'short','passwordConfirmation'=>'short'],422,'newPassword');expectUserError($p,fixtureAdmin(),editPayload($p)+['newPassword'=>'Changed!Password456','passwordConfirmation'=>'wrong'],422,'passwordConfirmation');expectUserError($p,fixtureAdmin(),editPayload($p)+['newPassword'=>['bad']],422,'newPassword'); },
    'optimistic revision prevents lost updates and stale deletion'=>function(){ $p=fixtureUsers();$post=editPayload($p);mutateSiteUser($p,fixtureAdmin(),$post+['beta_tester'=>'1']);expectUserError($p,fixtureAdmin(),$post,409);expectUserError($p,fixtureAdmin(),array_replace($post,['action'=>'delete','confirmation'=>'EXCLUIR']),409); },
    'forged upload cannot import a local server file'=>function(){ $p=fixtureUsers();expectUserError($p,fixtureAdmin(),editPayload($p),422,'photo',['error'=>UPLOAD_ERR_OK,'tmp_name'=>__FILE__,'size'=>10]); },
    'avatar deletion refuses arbitrary paths and symlinks'=>function(){foreach(['../config/database.php','storage/uploads/avatars/../../api/index.php','https://example.invalid/a.png',null,'storage/uploads/avatars/nope.jpg']as$path)assertUser(!removeManagedProfilePhoto($path)); },
    'photo removal clears reference without arbitrary filesystem deletion'=>function(){ $p=fixtureUsers();$p->exec("UPDATE usuarios SET foto_perfil='../config/database.php' WHERE id=1");mutateSiteUser($p,fixtureAdmin(),editPayload($p)+['remove_photo'=>'1']);assertUser(loadSiteUser($p,1)['foto_perfil']===null);assertUser(is_file(dirname(__DIR__,2).'/config/database.php')); },
    'deletion requires explicit confirmation'=>function(){ $p=fixtureUsers();expectUserError($p,fixtureAdmin(),array_replace(editPayload($p),['action'=>'delete']),422,'confirmation'); },
    'confirmed deletion removes only selected account and its decks'=>function(){ $p=fixtureUsers();$other=loadSiteUser($p,2);$r=mutateSiteUser($p,fixtureAdmin(),array_replace(editPayload($p),['action'=>'delete','confirmation'=>'EXCLUIR']));assertUser($r['deleted']&&$r['decks_removed']===1&&loadSiteUser($p,1)===null);assertUser($other===loadSiteUser($p,2)&&siteUserDeckCount($p,2)===1);assertUser((int)$p->query('SELECT COUNT(*) FROM deck_cards')->fetchColumn()===1);assertUser((int)$p->query('SELECT COUNT(*) FROM admin_usuarios')->fetchColumn()===2); },
    'deletion failure rolls back account and deck removals'=>function(){ $p=fixtureUsers();$p->exec("CREATE TRIGGER prevent_fixture_delete BEFORE DELETE ON usuarios BEGIN SELECT RAISE(ABORT, 'fixture rejection'); END");expectUserError($p,fixtureAdmin(),array_replace(editPayload($p),['action'=>'delete','confirmation'=>'EXCLUIR']),500); },
];
$failures=0;$number=0;echo '1..'.count($tests).PHP_EOL;
foreach($tests as$name=>$test){$number++;try{$test();echo "ok {$number} - {$name}\n";}catch(Throwable$e){$failures++;echo "not ok {$number} - {$name}: {$e->getMessage()}\n";}}
echo '# '.(count($tests)-$failures).'/'.count($tests).' passed; synthetic in-memory data only.'.PHP_EOL;
exit($failures?1:0);
