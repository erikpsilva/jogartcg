<?php

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

header('Content-Type: application/json');

require_once dirname(__FILE__, 3) . '/config/api_security.php';

validateApiAccess($ALLOWED_ORIGINS);

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Método não permitido.']);
    exit;
}

if (empty($_SESSION['usuario'])) {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => 'Não autenticado.']);
    exit;
}

require_once dirname(__FILE__, 3) . '/config/database.php';

$isAdmin   = $_SESSION['usuario']['nivel_acesso'] === 'admin';
$userId    = $_SESSION['usuario']['id'];

$nome      = trim($_POST['userNameVal']     ?? '');
$sobrenome = trim($_POST['userLastNameVal'] ?? '');
$email     = trim($_POST['userEmailVal']    ?? '');
$senha     = $_POST['userPasswordVal']      ?? '';

// Campos restritos ao admin
$cpf   = $isAdmin ? preg_replace('/[^\d]/', '', $_POST['userCpfVal'] ?? '') : $_SESSION['usuario']['cpf'];
$nivel = $isAdmin ? trim($_POST['userLevelAccessVal'] ?? '') : $_SESSION['usuario']['nivel_acesso'];

// Validações
if (mb_strlen($nome) < 3 || mb_strlen($sobrenome) < 3) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Nome e sobrenome devem ter no mínimo 3 caracteres.']);
    exit;
}

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'E-mail inválido.']);
    exit;
}

if ($isAdmin && strlen($cpf) !== 11) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'CPF inválido.']);
    exit;
}

if ($isAdmin && !in_array($nivel, ['admin', 'editor', 'leitor'])) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Nível de acesso inválido.']);
    exit;
}

if ($senha !== '' && (strlen($senha) < 6 || strlen($senha) > 20)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'A senha deve ter entre 6 e 20 caracteres.']);
    exit;
}

$pdo = getDbConnection();

// Verifica duplicidade de e-mail/CPF em outro usuário
$stmt = $pdo->prepare("SELECT id FROM admin_usuarios WHERE (email = ? OR cpf = ?) AND id != ? LIMIT 1");
$stmt->execute([$email, $cpf, $userId]);
if ($stmt->fetch()) {
    http_response_code(409);
    echo json_encode(['success' => false, 'message' => 'E-mail ou CPF já utilizado por outro usuário.']);
    exit;
}

$nomeCompleto = $nome . ' ' . $sobrenome;

if ($senha !== '') {
    $senhaHash = password_hash($senha, PASSWORD_BCRYPT);
    $stmt = $pdo->prepare("
        UPDATE admin_usuarios
        SET nome_completo = ?, email = ?, cpf = ?, nivel_acesso = ?, senha = ?
        WHERE id = ?
    ");
    $stmt->execute([$nomeCompleto, $email, $cpf, $nivel, $senhaHash, $userId]);
} else {
    $stmt = $pdo->prepare("
        UPDATE admin_usuarios
        SET nome_completo = ?, email = ?, cpf = ?, nivel_acesso = ?
        WHERE id = ?
    ");
    $stmt->execute([$nomeCompleto, $email, $cpf, $nivel, $userId]);
}

// Atualiza a sessão com os novos dados
$_SESSION['usuario']['nome_completo'] = $nomeCompleto;
$_SESSION['usuario']['email']         = $email;
$_SESSION['usuario']['cpf']           = $cpf;
$_SESSION['usuario']['nivel_acesso']  = $nivel;

http_response_code(200);
echo json_encode(['success' => true, 'message' => 'Dados atualizados com sucesso!']);
