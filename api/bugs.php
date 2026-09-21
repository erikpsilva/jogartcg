<?php

declare(strict_types=1);

require_once __DIR__ . '/session.php';

function handleBugRoutes(PDO $pdo, array $segments, string $method): void
{
    if (($segments[1] ?? '') !== 'bugs') return;
    header('Cache-Control: private, no-store');
    $userId = requireUserId($pdo);
    startPlayerSession();

    if (($segments[2] ?? '') === 'challenge' && $method === 'GET') {
        $left = random_int(2, 9);
        $right = random_int(1, 9);
        $_SESSION['bug_captcha'] = ['answer' => $left + $right, 'expires' => time() + 600];
        respond(['success' => true, 'data' => ['question' => "Quanto é {$left} + {$right}?"]]);
    }

    if (count($segments) === 2 && $method === 'POST') {
        requireCsrf();
        $payload = readRequestPayload();
        $report = trim((string) ($payload['report'] ?? ''));
        $captcha = $_SESSION['bug_captcha'] ?? null;
        unset($_SESSION['bug_captcha']);
        if (!is_array($captcha) || (int) ($captcha['expires'] ?? 0) < time() || (int) ($payload['captcha'] ?? -1) !== (int) ($captcha['answer'] ?? -2)) {
            respond(['success' => false, 'error' => 'invalid_captcha', 'message' => 'A resposta de validação está incorreta ou expirou.'], 422);
        }
        if (mb_strlen($report) < 15 || mb_strlen($report) > 4000) {
            respond(['success' => false, 'error' => 'invalid_report', 'message' => 'Descreva o erro usando entre 15 e 4.000 caracteres.'], 422);
        }
        $statement = $pdo->prepare('INSERT INTO bug_reports (usuario_id, relato, pagina, user_agent) VALUES (?, ?, ?, ?)');
        $statement->execute([$userId, $report, mb_substr((string) ($payload['page'] ?? ''), 0, 500), mb_substr((string) ($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 500)]);
        respond(['success' => true, 'message' => 'Relato enviado. Obrigado por ajudar no teste beta!'], 201);
    }

    respond(['success' => false, 'error' => 'method_not_allowed'], 405);
}
