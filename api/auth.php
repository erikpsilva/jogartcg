<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/config/validation.php';
require_once __DIR__ . '/session.php';

function readRequestPayload(): array
{
    $contentType = strtolower((string) ($_SERVER['CONTENT_TYPE'] ?? ''));
    if (str_contains($contentType, 'application/json')) {
        $decoded = json_decode(file_get_contents('php://input') ?: '', true);
        return is_array($decoded) ? $decoded : [];
    }
    return $_POST;
}

function isFieldTaken(PDO $pdo, string $column, string $value): bool
{
    if (!in_array($column, ['email', 'cpf'], true)) return false;
    $statement = $pdo->prepare("SELECT 1 FROM usuarios WHERE {$column} = ? LIMIT 1");
    $statement->execute([$value]);
    return (bool) $statement->fetchColumn();
}

function duplicateFieldFromException(PDOException $exception): ?string
{
    if ($exception->getCode() !== '23000') return null;
    if (str_contains($exception->getMessage(), 'uk_usuarios_email')) return 'email';
    if (str_contains($exception->getMessage(), 'uk_usuarios_cpf')) return 'cpf';
    return null;
}

function storeProfilePhoto(): ?string
{
    $file = $_FILES['photo'] ?? null;
    if (!$file || ($file['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) return null;
    if (($file['error'] ?? UPLOAD_ERR_OK) !== UPLOAD_ERR_OK) {
        throw new InvalidArgumentException('Nao foi possivel receber a foto. Tente novamente.');
    }
    if ((int) ($file['size'] ?? 0) > 5 * 1024 * 1024) {
        throw new InvalidArgumentException('A foto deve ter no maximo 5 MB.');
    }
    $mime = (new finfo(FILEINFO_MIME_TYPE))->file((string) $file['tmp_name']);
    $extensions = ['image/jpeg' => 'jpg', 'image/png' => 'png'];
    if (!isset($extensions[$mime])) throw new InvalidArgumentException('Use uma foto JPG ou PNG valida.');

    $directory = dirname(__DIR__) . '/storage/uploads/avatars';
    if (!is_dir($directory) && !mkdir($directory, 0775, true) && !is_dir($directory)) {
        throw new RuntimeException('Nao foi possivel preparar o armazenamento da foto.');
    }
    $filename = bin2hex(random_bytes(18)) . '.' . $extensions[$mime];
    if (!move_uploaded_file((string) $file['tmp_name'], $directory . '/' . $filename)) {
        throw new RuntimeException('Nao foi possivel salvar a foto enviada.');
    }
    return 'storage/uploads/avatars/' . $filename;
}

function authenticateUser(int $userId): void
{
    startPlayerSession();
    session_regenerate_id(true);
    $_SESSION['user_id'] = $userId;
    $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
}

function privateProfile(array $row): array
{
    return publicUser($row) + [
        'telefone' => $row['telefone'],
        'cpf' => $row['cpf'],
        'data_nascimento' => $row['data_nascimento'],
        'created_at' => $row['created_at'],
    ];
}

function handleAuthRoutes(PDO $pdo, array $segments, string $method): void
{
    if (($segments[1] ?? '') !== 'auth') return;
    header('Cache-Control: no-store');
    $action = $segments[2] ?? '';

    if ($action === 'available' && $method === 'GET') {
        $field = (string) ($_GET['field'] ?? '');
        if (!in_array($field, ['email', 'cpf'], true)) respond(['success' => false, 'error' => 'invalid_field'], 422);
        $value = $field === 'email' ? normalizeEmail((string) ($_GET['value'] ?? '')) : onlyDigits((string) ($_GET['value'] ?? ''));
        $formatError = $field === 'email' ? validateEmail($value) : validateCpf($value);
        if ($formatError !== null) {
            respond(['success' => true, 'data' => ['field' => $field, 'checked' => false, 'available' => null, 'message' => $formatError]]);
        }
        $taken = isFieldTaken($pdo, $field, $value);
        respond(['success' => true, 'data' => [
            'field' => $field, 'checked' => true, 'available' => !$taken,
            'message' => $taken ? ($field === 'email' ? 'Este e-mail ja esta cadastrado.' : 'Este CPF ja esta cadastrado.') : null,
        ]]);
    }

    if ($action === 'me' && $method === 'GET') {
        $user = loadCurrentUser($pdo);
        respond(['success' => true, 'data' => ['authenticated' => $user !== null, 'user' => $user, 'csrf_token' => csrfToken()]]);
    }

    if ($action === 'profile' && $method === 'GET') {
        $userId = requireUserId();
        $statement = $pdo->prepare('SELECT * FROM usuarios WHERE id = ? AND status = "ativo" LIMIT 1');
        $statement->execute([$userId]);
        $user = $statement->fetch();
        if (!$user) respond(['success' => false, 'error' => 'user_not_found'], 404);
        respond(['success' => true, 'data' => privateProfile($user)]);
    }

    if ($action === 'profile' && $method === 'POST') {
        $userId = requireUserId();
        requireCsrf();
        $statement = $pdo->prepare('SELECT * FROM usuarios WHERE id = ? AND status = "ativo" LIMIT 1');
        $statement->execute([$userId]);
        $currentUser = $statement->fetch();
        if (!$currentUser) respond(['success' => false, 'error' => 'user_not_found'], 404);

        $payload = readRequestPayload();
        $errors = [];
        $checks = [
            'firstName' => validatePersonName($payload['firstName'] ?? null, 'nome', USER_NAME_MAX),
            'lastName' => validatePersonName($payload['lastName'] ?? null, 'sobrenome', USER_LAST_NAME_MAX),
            'phone' => validatePhone($payload['phone'] ?? null),
            'birthDate' => validateBirthDate($payload['birthDate'] ?? null),
        ];
        foreach ($checks as $field => $message) if ($message !== null) $errors[$field] = $message;

        $newPassword = (string) ($payload['newPassword'] ?? '');
        if ($newPassword !== '') {
            if (!password_verify((string) ($payload['currentPassword'] ?? ''), $currentUser['senha_hash'])) {
                $errors['currentPassword'] = 'A senha atual esta incorreta.';
            }
            $passwordError = validatePassword($newPassword);
            if ($passwordError !== null) $errors['newPassword'] = $passwordError;
            $confirmationError = validatePasswordConfirmation($newPassword, $payload['passwordConfirmation'] ?? null);
            if ($confirmationError !== null) $errors['passwordConfirmation'] = $confirmationError;
        } elseif ((string) ($payload['currentPassword'] ?? '') !== '' || (string) ($payload['passwordConfirmation'] ?? '') !== '') {
            $errors['newPassword'] = 'Informe a nova senha.';
        }

        $newPhotoPath = null;
        if ($errors === []) {
            try {
                $newPhotoPath = storeProfilePhoto();
            } catch (InvalidArgumentException $exception) {
                $errors['photo'] = $exception->getMessage();
            } catch (Throwable $exception) {
                error_log('[jogartcg] falha ao atualizar avatar: ' . $exception->getMessage());
                $errors['photo'] = 'Nao foi possivel salvar a foto agora.';
            }
        }
        if ($errors !== []) {
            respond(['success' => false, 'error' => 'validation_failed', 'message' => 'Confira os campos destacados.', 'errors' => $errors], 422);
        }

        $fields = [
            'nome = :nome', 'sobrenome = :sobrenome', 'telefone = :telefone',
            'data_nascimento = :data_nascimento',
        ];
        $params = [
            'nome' => normalizeSpaces($payload['firstName'] ?? null),
            'sobrenome' => normalizeSpaces($payload['lastName'] ?? null),
            'telefone' => onlyDigits($payload['phone'] ?? null),
            'data_nascimento' => trim((string) ($payload['birthDate'] ?? '')),
            'id' => $userId,
        ];
        if ($newPassword !== '') {
            $fields[] = 'senha_hash = :senha_hash';
            $params['senha_hash'] = password_hash($newPassword, PASSWORD_BCRYPT);
        }
        if ($newPhotoPath !== null) {
            $fields[] = 'foto_perfil = :foto_perfil';
            $params['foto_perfil'] = $newPhotoPath;
        }

        try {
            $update = $pdo->prepare('UPDATE usuarios SET ' . implode(', ', $fields) . ' WHERE id = :id');
            $update->execute($params);
        } catch (Throwable $exception) {
            if ($newPhotoPath) @unlink(dirname(__DIR__) . '/' . $newPhotoPath);
            error_log('[jogartcg] falha ao atualizar perfil: ' . $exception->getMessage());
            respond(['success' => false, 'error' => 'profile_update_failed', 'message' => 'Nao foi possivel salvar seus dados.'], 500);
        }

        if ($newPhotoPath && $currentUser['foto_perfil']) {
            $oldPhoto = dirname(__DIR__) . '/' . ltrim((string) $currentUser['foto_perfil'], '/');
            if (is_file($oldPhoto)) @unlink($oldPhoto);
        }
        $statement->execute([$userId]);
        $updatedUser = $statement->fetch();
        respond(['success' => true, 'message' => 'Seus dados foram atualizados.', 'data' => [
            'profile' => privateProfile($updatedUser), 'user' => publicUser($updatedUser),
        ]]);
    }

    if ($action === 'login' && $method === 'POST') {
        $payload = readRequestPayload();
        $email = normalizeEmail($payload['email'] ?? null);
        $password = (string) ($payload['password'] ?? '');
        $statement = $pdo->prepare('SELECT * FROM usuarios WHERE email = ? LIMIT 1');
        $statement->execute([$email]);
        $user = $statement->fetch();
        if (!$user || $user['status'] !== 'ativo' || !password_verify($password, $user['senha_hash'])) {
            usleep(250000);
            respond(['success' => false, 'error' => 'invalid_credentials', 'message' => 'E-mail ou senha incorretos.'], 401);
        }
        authenticateUser((int) $user['id']);
        respond(['success' => true, 'message' => 'Login realizado com sucesso.', 'data' => [
            'user' => publicUser($user), 'csrf_token' => csrfToken(),
        ]]);
    }

    if ($action === 'logout' && $method === 'POST') {
        requireUserId();
        requireCsrf();
        $_SESSION = [];
        if (ini_get('session.use_cookies')) {
            $params = session_get_cookie_params();
            setcookie(session_name(), '', time() - 42000, $params['path'], $params['domain'], $params['secure'], $params['httponly']);
        }
        session_destroy();
        respond(['success' => true, 'message' => 'Voce saiu da sua conta.']);
    }

    if ($action === 'register' && $method === 'POST') {
        $payload = readRequestPayload();
        $errors = validateRegistrationPayload($payload);
        $email = normalizeEmail($payload['email'] ?? null);
        $cpf = onlyDigits($payload['cpf'] ?? null);
        if (!isset($errors['email']) && isFieldTaken($pdo, 'email', $email)) $errors['email'] = 'Este e-mail ja esta cadastrado.';
        if (!isset($errors['cpf']) && isFieldTaken($pdo, 'cpf', $cpf)) $errors['cpf'] = 'Este CPF ja esta cadastrado.';

        $photoPath = null;
        if ($errors === []) {
            try {
                $photoPath = storeProfilePhoto();
            } catch (InvalidArgumentException $exception) {
                $errors['photo'] = $exception->getMessage();
            } catch (Throwable $exception) {
                error_log('[jogartcg] falha no avatar: ' . $exception->getMessage());
                $errors['photo'] = 'Nao foi possivel salvar a foto agora.';
            }
        }
        if ($errors !== []) {
            respond(['success' => false, 'error' => 'validation_failed', 'message' => 'Confira os campos destacados e tente novamente.', 'errors' => $errors], 422);
        }

        $firstName = normalizeSpaces($payload['firstName'] ?? null);
        $lastName = normalizeSpaces($payload['lastName'] ?? null);
        try {
            $statement = $pdo->prepare(
                'INSERT INTO usuarios (nome, sobrenome, email, telefone, cpf, data_nascimento, senha_hash, foto_perfil)
                 VALUES (:nome, :sobrenome, :email, :telefone, :cpf, :data_nascimento, :senha_hash, :foto_perfil)'
            );
            $statement->execute([
                'nome' => $firstName, 'sobrenome' => $lastName, 'email' => $email,
                'telefone' => onlyDigits($payload['phone'] ?? null), 'cpf' => $cpf,
                'data_nascimento' => trim((string) ($payload['birthDate'] ?? '')),
                'senha_hash' => password_hash((string) $payload['password'], PASSWORD_BCRYPT),
                'foto_perfil' => $photoPath,
            ]);
        } catch (PDOException $exception) {
            if ($photoPath) @unlink(dirname(__DIR__) . '/' . $photoPath);
            $field = duplicateFieldFromException($exception);
            if ($field) respond(['success' => false, 'error' => 'validation_failed', 'message' => 'Confira os campos destacados e tente novamente.', 'errors' => [$field => $field === 'email' ? 'Este e-mail ja esta cadastrado.' : 'Este CPF ja esta cadastrado.']], 422);
            error_log('[jogartcg] falha ao cadastrar: ' . $exception->getMessage());
            respond(['success' => false, 'error' => 'registration_failed', 'message' => 'Nao foi possivel criar sua conta agora.'], 500);
        }

        $userId = (int) $pdo->lastInsertId();
        authenticateUser($userId);
        respond(['success' => true, 'message' => 'Conta criada e login realizado com sucesso.', 'data' => [
            'user' => publicUser(['id' => $userId, 'nome' => $firstName, 'sobrenome' => $lastName, 'email' => $email, 'foto_perfil' => $photoPath]),
            'csrf_token' => csrfToken(),
        ]], 201);
    }

    respond(['success' => false, 'error' => 'endpoint_not_found'], 404);
}
