CREATE TABLE IF NOT EXISTS `bug_reports` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `usuario_id` BIGINT UNSIGNED NOT NULL,
    `relato` TEXT NOT NULL,
    `pagina` VARCHAR(500) NULL,
    `user_agent` VARCHAR(500) NULL,
    `status` ENUM('novo','analisando','resolvido','descartado') NOT NULL DEFAULT 'novo',
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_bug_reports_status_created` (`status`, `created_at`),
    KEY `idx_bug_reports_usuario` (`usuario_id`),
    CONSTRAINT `fk_bug_reports_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
