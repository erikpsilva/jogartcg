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

require_once dirname(__FILE__, 3) . '/config/database.php';

$email = trim($_POST['email'] ?? '');
$senha = trim($_POST['senha'] ?? '');

if (empty($email) || empty($senha)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'E-mail e senha são obrigatórios.']);
    exit;
}

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'E-mail inválido.']);
    exit;
}

$pdo = getDbConnection();

$stmt = $pdo->prepare("SELECT id, nome_completo, email, cpf, nivel_acesso, senha FROM admin_usuarios WHERE email = ? LIMIT 1");
$stmt->execute([$email]);
$usuario = $stmt->fetch();

if (!$usuario || !password_verify($senha, $usuario['senha'])) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'E-mail ou senha incorretos.']);
    exit;
}

unset($usuario['senha']);

$_SESSION['usuario'] = $usuario;

http_response_code(200);
echo json_encode([
    'success' => true,
    'message' => 'Login realizado com sucesso.',
    'data'    => $usuario
]);
