<?php

$ALLOWED_ORIGINS = [
    'http://localhost',
    'http://localhost:3000',
    'http://127.0.0.1',
    'http://127.0.0.1:3000',
    'https://www.jogartcg.com.br',
];

function validateApiAccess(array $allowedOrigins): void {
    $origin  = $_SERVER['HTTP_ORIGIN']  ?? '';
    $referer = $_SERVER['HTTP_REFERER'] ?? '';

    $originAllowed = false;

    // Verifica pelo header Origin (presente em requisições cross-origin)
    if (!empty($origin)) {
        foreach ($allowedOrigins as $allowed) {
            if (rtrim($origin, '/') === rtrim($allowed, '/')) {
                $originAllowed = true;
                header('Access-Control-Allow-Origin: ' . $origin);
                break;
            }
        }
    } else {
        // Sem header Origin = mesma origem (same-origin request)
        // Valida pelo Referer como fallback
        foreach ($allowedOrigins as $allowed) {
            if (str_starts_with($referer, $allowed)) {
                $originAllowed = true;
                break;
            }
        }

        // Se não tiver nem Origin nem Referer, é requisição direta ao servidor
        // Permite somente se vier do próprio host (localhost ou produção)
        if (!$originAllowed && empty($referer)) {
            $host = $_SERVER['HTTP_HOST'] ?? '';
            foreach ($allowedOrigins as $allowed) {
                $allowedHost = parse_url($allowed, PHP_URL_HOST);
                if ($host === $allowedHost) {
                    $originAllowed = true;
                    break;
                }
            }
        }
    }

    if (!$originAllowed) {
        http_response_code(403);
        header('Content-Type: application/json');
        echo json_encode(['success' => false, 'message' => 'Acesso não autorizado.']);
        exit;
    }

    header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');

    // Responde preflight OPTIONS do CORS e encerra
    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        http_response_code(204);
        exit;
    }
}
