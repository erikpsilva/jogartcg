<?php

declare(strict_types=1);

/**
 * Arbitro de regras remoto (partidas online).
 *
 * Copie para config/referee.credentials.php no servidor, ou use SetEnv no
 * .htaccess. Necessario quando a hospedagem nao permite executar o Node
 * (proc_open em disable_functions), como na KingHost compartilhada.
 *
 * O segredo precisa ser identico ao JOGARTCG_REFEREE_SECRET do servico Node.
 * Gere um com: php -r "echo bin2hex(random_bytes(32));"
 */
return [
    'url' => 'https://arbitro.seudominio.com/referee',
    'secret' => 'troque-por-um-segredo-longo-e-aleatorio',
];
