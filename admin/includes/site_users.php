<?php
declare(strict_types=1);
require_once __DIR__ . '/settings.php';
require_once dirname(__DIR__, 2) . '/config/validation.php';
require_once dirname(__DIR__, 2) . '/config/player_access.php';
require_once dirname(__DIR__, 2) . '/config/profile_photos.php';

final class SiteUserProblem extends RuntimeException
{
    public function __construct(public readonly int $status, string $message, public readonly array $fields = []) { parent::__construct($message); }
}

function siteUserText(array $values, string $key): string
{
    return is_string($values[$key] ?? null) ? $values[$key] : '';
}

function siteUserId(mixed $value): int
{
    if ((!is_int($value) && !is_string($value)) || !ctype_digit((string) $value)) return 0;
    return (int) (filter_var($value, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]) ?: 0);
}

function siteUserRevision(array $row): string
{
    $values = [];
    foreach (['id','nome','sobrenome','email','telefone','cpf','data_nascimento','foto_perfil','status','beta_tester','session_version','senha_hash','updated_at'] as $field) $values[$field] = (string) ($row[$field] ?? '');
    return hash('sha256', json_encode($values, JSON_THROW_ON_ERROR));
}

function loadSiteUser(PDO $pdo, int $id, bool $lock = false): ?array
{
    $suffix = $lock && $pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql' ? ' FOR UPDATE' : '';
    $statement = $pdo->prepare('SELECT * FROM usuarios WHERE id = ?' . $suffix);
    $statement->execute([$id]);
    return $statement->fetch(PDO::FETCH_ASSOC) ?: null;
}

function siteUserDeckCount(PDO $pdo, int $id): int
{
    $statement = $pdo->prepare('SELECT COUNT(*) FROM decks WHERE usuario_id = ?');
    $statement->execute([$id]);
    return (int) $statement->fetchColumn();
}

function listSiteUsers(PDO $pdo, array $query): array
{
    $search = mb_substr(trim(siteUserText($query, 'q')), 0, 190);
    $status = in_array($query['status'] ?? '', ['ativo','inativo'], true) ? $query['status'] : '';
    $beta = in_array($query['beta'] ?? '', ['1','0'], true) ? $query['beta'] : '';
    $conditions = []; $params = [];
    if ($search !== '') {
        $fullName = $pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'sqlite' ? "(nome || ' ' || sobrenome)" : "CONCAT(nome, ' ', sobrenome)";
        $conditions[] = "({$fullName} LIKE ? ESCAPE '!' OR email LIKE ? ESCAPE '!' OR cpf LIKE ? ESCAPE '!')";
        $term = '%' . strtr($search, ['!' => '!!', '%' => '!%', '_' => '!_']) . '%';
        $cpfTerm = preg_match('/^[\d.\s-]+$/', $search) ? '%' . onlyDigits($search) . '%' : $term;
        array_push($params, $term, $term, $cpfTerm);
    }
    if ($status !== '') { $conditions[] = 'status = ?'; $params[] = $status; }
    if ($beta !== '') { $conditions[] = 'beta_tester = ?'; $params[] = (int) $beta; }
    $where = $conditions ? ' WHERE ' . implode(' AND ', $conditions) : '';
    $count = $pdo->prepare('SELECT COUNT(*) FROM usuarios' . $where); $count->execute($params);
    $total = (int) $count->fetchColumn();
    $pages = max(1, (int) ceil($total / 20));
    $page = min($pages, max(1, siteUserId($query['pagina'] ?? '1'))); $offset = ($page - 1) * 20;
    // Never retrieve CPF, password hashes or birth dates for the listing.
    $statement = $pdo->prepare('SELECT id,nome,sobrenome,email,status,beta_tester,foto_perfil,created_at FROM usuarios' . $where . " ORDER BY created_at DESC,id DESC LIMIT 20 OFFSET {$offset}");
    $statement->execute($params);
    $stats = $pdo->query("SELECT COUNT(*) AS total, COALESCE(SUM(CASE WHEN status='ativo' THEN 1 ELSE 0 END),0) AS active, COALESCE(SUM(CASE WHEN beta_tester=1 THEN 1 ELSE 0 END),0) AS beta FROM usuarios")->fetch(PDO::FETCH_ASSOC);
    return ['users' => $statement->fetchAll(PDO::FETCH_ASSOC), 'total' => $total, 'page' => $page, 'pages' => $pages, 'q' => $search, 'status' => $status, 'beta' => $beta, 'stats' => $stats];
}

function validateSiteUserEdit(PDO $pdo, int $id, array $payload): array
{
    $errors = [];
    $checks = [
        'firstName' => validatePersonName(siteUserText($payload, 'firstName'), 'nome', USER_NAME_MAX),
        'lastName' => validatePersonName(siteUserText($payload, 'lastName'), 'sobrenome', USER_LAST_NAME_MAX),
        'email' => validateEmail(siteUserText($payload, 'email')),
        'cpf' => validateCpf(siteUserText($payload, 'cpf')),
        'phone' => validatePhone(siteUserText($payload, 'phone')),
        'birthDate' => validateBirthDate(siteUserText($payload, 'birthDate')),
    ];
    foreach ($checks as $field => $error) if ($error !== null) $errors[$field] = $error;
    if (!in_array($payload['status'] ?? null, ['ativo','inativo'], true)) $errors['status'] = 'Selecione um status válido.';
    foreach (['beta_tester','remove_photo'] as $key) {
        if (array_key_exists($key, $payload) && $payload[$key] !== '1') $errors[$key] = 'Selecione uma opção válida.';
    }
    $password = siteUserText($payload, 'newPassword');
    if ($password !== '' || siteUserText($payload, 'passwordConfirmation') !== '') {
        if (($error = validatePassword($password)) !== null) $errors['newPassword'] = $error;
        if (($error = validatePasswordConfirmation($password, siteUserText($payload, 'passwordConfirmation'))) !== null) $errors['passwordConfirmation'] = $error;
    }
    if (isset($payload['newPassword']) && !is_string($payload['newPassword'])) $errors['newPassword'] = 'Senha inválida.';
    foreach (['email' => normalizeEmail(siteUserText($payload, 'email')), 'cpf' => onlyDigits(siteUserText($payload, 'cpf'))] as $field => $value) {
        if (isset($errors[$field])) continue;
        $statement = $pdo->prepare("SELECT 1 FROM usuarios WHERE {$field} = ? AND id <> ?");
        $statement->execute([$value, $id]);
        if ($statement->fetchColumn()) $errors[$field] = $field === 'email' ? 'Este e-mail já pertence a outro usuário.' : 'Este CPF já pertence a outro usuário.';
    }
    return $errors;
}

/** The only mutation entry point: current administrator role + CSRF + exact target. */
function mutateSiteUser(PDO $pdo, array $session, array $payload, ?array $photo = null): array
{
    if (!canManageSettings($pdo, $session)) throw new SiteUserProblem(403, 'Somente administradores podem gerenciar usuários do site.');
    $csrf = $session['admin_csrf'] ?? '';
    if (!is_string($csrf) || $csrf === '' || !hash_equals($csrf, siteUserText($payload, 'csrf'))) throw new SiteUserProblem(419, 'Sua sessão mudou. Atualize a página antes de continuar.');
    $id = siteUserId($payload['id'] ?? null);
    if (!$id) throw new SiteUserProblem(404, 'Usuário não encontrado.');
    $action = siteUserText($payload, 'action');
    if (!in_array($action, ['save','delete'], true)) throw new SiteUserProblem(422, 'Ação inválida.');
    $newPhoto = null; $oldPhoto = null;
    try {
        $pdo->beginTransaction();
        $current = loadSiteUser($pdo, $id, true);
        if (!$current) throw new SiteUserProblem(404, 'Usuário não encontrado.');
        if (!hash_equals(siteUserRevision($current), siteUserText($payload, 'revision'))) throw new SiteUserProblem(409, 'Este perfil foi alterado desde que você o abriu. Reabra o perfil antes de salvar ou excluir.');
        if ($action === 'delete') {
            if (siteUserText($payload, 'confirmation') !== 'EXCLUIR') throw new SiteUserProblem(422, 'Confirme a exclusão.', ['confirmation' => 'Digite EXCLUIR para confirmar a remoção permanente.']);
            $oldPhoto = $current['foto_perfil'];
            $decks = siteUserDeckCount($pdo, $id);
            $pdo->prepare('DELETE FROM deck_cards WHERE deck_id IN (SELECT id FROM decks WHERE usuario_id = ?)')->execute([$id]);
            $pdo->prepare('DELETE FROM decks WHERE usuario_id = ?')->execute([$id]);
            $pdo->prepare('DELETE FROM usuarios WHERE id = ?')->execute([$id]);
            $result = ['deleted' => true, 'decks_removed' => $decks];
        } else {
            $errors = validateSiteUserEdit($pdo, $id, $payload);
            if ($errors) throw new SiteUserProblem(422, 'Confira os campos destacados.', $errors);
            if (isset($payload['remove_photo']) && $photo && ($photo['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_NO_FILE) throw new SiteUserProblem(422, 'Escolha remover ou substituir a foto.', ['photo' => 'Não envie uma nova foto junto com a opção de remover.']);
            try { $newPhoto = saveUploadedProfilePhoto($photo); }
            catch (InvalidArgumentException $error) { throw new SiteUserProblem(422, 'Confira a foto enviada.', ['photo' => $error->getMessage()]); }
            $photoPath = $newPhoto ?? (isset($payload['remove_photo']) ? null : $current['foto_perfil']);
            if ($photoPath !== $current['foto_perfil']) $oldPhoto = $current['foto_perfil'];
            $password = siteUserText($payload, 'newPassword');
            $email = normalizeEmail(siteUserText($payload, 'email'));
            $invalidate = $password !== '' || $email !== $current['email'] || $payload['status'] !== $current['status'];
            $update = $pdo->prepare('UPDATE usuarios SET nome=?,sobrenome=?,email=?,telefone=?,cpf=?,data_nascimento=?,status=?,beta_tester=?,foto_perfil=?,senha_hash=?,session_version=?,updated_at=CURRENT_TIMESTAMP WHERE id=?');
            $update->execute([
                normalizeSpaces(siteUserText($payload, 'firstName')), normalizeSpaces(siteUserText($payload, 'lastName')), $email,
                onlyDigits(siteUserText($payload, 'phone')), onlyDigits(siteUserText($payload, 'cpf')), siteUserText($payload, 'birthDate'),
                $payload['status'], isset($payload['beta_tester']) ? 1 : 0, $photoPath,
                $password !== '' ? password_hash($password, PASSWORD_BCRYPT) : $current['senha_hash'],
                (int) $current['session_version'] + ($invalidate ? 1 : 0), $id,
            ]);
            $result = ['deleted' => false, 'sessions_revoked' => $invalidate];
        }
        $pdo->commit();
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        if ($newPhoto) removeManagedProfilePhoto($newPhoto);
        if ($error instanceof SiteUserProblem) throw $error;
        if ($error instanceof PDOException && $error->getCode() === '23000') {
            foreach (['email','cpf'] as $field) if (str_contains($error->getMessage(), 'uk_usuarios_' . $field) || str_contains($error->getMessage(), 'usuarios.' . $field)) {
                throw new SiteUserProblem(422, 'Confira os campos destacados.', [$field => 'Este dado já pertence a outro usuário.']);
            }
        }
        throw new SiteUserProblem(500, 'Não foi possível concluir a operação. Nenhuma alteração foi salva.');
    }
    if ($oldPhoto) {
        // Never remove a file still referenced by another account.
        try {
            $references = $pdo->prepare('SELECT COUNT(*) FROM usuarios WHERE foto_perfil = ?'); $references->execute([$oldPhoto]);
            if ((int) $references->fetchColumn() === 0) removeManagedProfilePhoto($oldPhoto);
        } catch (Throwable) { $result['photo_cleanup_pending'] = true; }
    }
    return $result;
}
