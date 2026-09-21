-- MariaDB / XAMPP. Salas multiplayer, assentos, partidas e eventos.
-- Idempotente: pode ser aplicada mais de uma vez.

-- Uma sala nasce "aguardando", vira "em_jogo" quando os dois confirmam e termina "encerrada".
-- `codigo` guarda o historico; `codigo_aberto` so existe enquanto a sala aceita entrada,
-- e o indice unico nele garante que dois lobbies abertos nunca dividem o mesmo codigo.
CREATE TABLE IF NOT EXISTS `salas` (
    `id`                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `codigo`              CHAR(6)         NOT NULL,
    `codigo_aberto`       CHAR(6)         NULL,
    `status`              ENUM('aguardando','em_jogo','encerrada') NOT NULL DEFAULT 'aguardando',
    `criador_id`          BIGINT UNSIGNED NOT NULL,
    `revisao`             INT UNSIGNED    NOT NULL DEFAULT 1,
    `motivo_encerramento` VARCHAR(40)     NULL,
    `expira_em`           DATETIME        NOT NULL,
    `encerrada_em`        DATETIME        NULL,
    `created_at`          TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`          TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_salas_codigo_aberto` (`codigo_aberto`),
    KEY `idx_salas_status_expira` (`status`, `expira_em`),
    CONSTRAINT `fk_salas_criador` FOREIGN KEY (`criador_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- `ativo_usuario_id` e igual a `usuario_id` enquanto o assento esta em uso e NULL depois.
-- O indice unico impede o mesmo usuario em dois assentos ativos, em qualquer sala.
CREATE TABLE IF NOT EXISTS `sala_jogadores` (
    `id`               BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT,
    `sala_id`          BIGINT UNSIGNED  NOT NULL,
    `usuario_id`       BIGINT UNSIGNED  NOT NULL,
    `assento`          TINYINT UNSIGNED NOT NULL,
    `deck_id`          BIGINT UNSIGNED  NULL,
    `pronto`           TINYINT(1)       NOT NULL DEFAULT 0,
    `ativo_usuario_id` BIGINT UNSIGNED  NULL,
    `ultimo_contato`   DATETIME         NOT NULL,
    `created_at`       TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_sala_jogadores_assento` (`sala_id`, `assento`),
    UNIQUE KEY `uk_sala_jogadores_usuario` (`sala_id`, `usuario_id`),
    UNIQUE KEY `uk_sala_jogadores_ativo` (`ativo_usuario_id`),
    KEY `idx_sala_jogadores_usuario` (`usuario_id`),
    CONSTRAINT `fk_sala_jogadores_sala` FOREIGN KEY (`sala_id`) REFERENCES `salas` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `fk_sala_jogadores_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `fk_sala_jogadores_deck` FOREIGN KEY (`deck_id`) REFERENCES `decks` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Estado autoritativo da partida. `estado_json` nunca sai do servidor; cada jogador
-- recebe somente a sua `visao_assentoN`, ja redigida pelo arbitro de regras.
-- `revisao` sobe a cada jogada aceita e rejeita envios duplicados ou fora de ordem.
CREATE TABLE IF NOT EXISTS `partidas` (
    `id`               BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT,
    `sala_id`          BIGINT UNSIGNED  NOT NULL,
    `status`           ENUM('em_andamento','encerrada') NOT NULL DEFAULT 'em_andamento',
    `revisao`          INT UNSIGNED     NOT NULL DEFAULT 1,
    `estado_json`      LONGTEXT         NOT NULL,
    `visao_assento1`   LONGTEXT         NOT NULL,
    `visao_assento2`   LONGTEXT         NOT NULL,
    `assento_decisao`  TINYINT UNSIGNED NULL,
    `vencedor_assento` TINYINT UNSIGNED NULL,
    `motivo_fim`       VARCHAR(30)      NULL,
    `encerrada_em`     DATETIME         NULL,
    `created_at`       TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`       TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_partidas_sala` (`sala_id`),
    CONSTRAINT `fk_partidas_sala` FOREIGN KEY (`sala_id`) REFERENCES `salas` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Trilha de auditoria: uma linha por revisao aceita (inicio, jogadas, abandono).
CREATE TABLE IF NOT EXISTS `partida_eventos` (
    `id`         BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT,
    `partida_id` BIGINT UNSIGNED  NOT NULL,
    `revisao`    INT UNSIGNED     NOT NULL,
    `assento`    TINYINT UNSIGNED NULL,
    `tipo`       VARCHAR(30)      NOT NULL,
    `acao_json`  TEXT             NULL,
    `created_at` TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_partida_eventos_revisao` (`partida_id`, `revisao`),
    CONSTRAINT `fk_partida_eventos_partida` FOREIGN KEY (`partida_id`) REFERENCES `partidas` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
