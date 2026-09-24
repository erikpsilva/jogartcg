-- ============================================================================
-- Banco de dados: jogartcg_db
-- Estrutura de controle de usuarios do painel administrativo.
-- Uso: mysql -u root < database/schema.sql
-- ============================================================================

CREATE DATABASE IF NOT EXISTS `jogartcg_db`
    DEFAULT CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE `jogartcg_db`;

CREATE TABLE IF NOT EXISTS `admin_usuarios` (
    `id`            INT(11)      NOT NULL AUTO_INCREMENT,
    `nome_completo` VARCHAR(150) NOT NULL,
    `email`         VARCHAR(150) NOT NULL,
    `cpf`           VARCHAR(11)  NOT NULL,
    `nivel_acesso`  ENUM('admin','editor','leitor') NOT NULL DEFAULT 'leitor',
    `senha`         VARCHAR(255) NOT NULL,
    `created_at`    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `email` (`email`),
    UNIQUE KEY `cpf` (`cpf`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Usuario administrador inicial
-- E-mail: admin@admin.com | Senha: admin123 (troque apos o primeiro acesso)
INSERT INTO `admin_usuarios` (`nome_completo`, `email`, `cpf`, `nivel_acesso`, `senha`)
SELECT 'Administrador Master', 'admin@admin.com', '00000000000', 'admin',
       '$2y$10$bOUWHkLNNrc7R18tX9s58OZYumhF5JeNOZQ5nBIIIQx9kQFrq5I96'
WHERE NOT EXISTS (
    SELECT 1 FROM `admin_usuarios` WHERE `email` = 'admin@admin.com'
);

-- Catalogo Disney Lorcana importado do LorcanaJSON.
-- O conteudo original e preservado em ingles e as traducoes PT-BR sao separadas.
CREATE TABLE IF NOT EXISTS `lorcana_sets` (
    `code`                             VARCHAR(20)  NOT NULL,
    `number`                           INT          NULL,
    `name_en`                          VARCHAR(255) NOT NULL,
    `name_pt_br`                       VARCHAR(255) NULL,
    `type_en`                          VARCHAR(60)  NULL,
    `type_pt_br`                       VARCHAR(60)  NULL,
    `prerelease_date`                  DATE         NULL,
    `release_date`                     DATE         NULL,
    `allowed_in_tournaments_from_date` DATE         NULL,
    `has_all_cards`                    TINYINT(1)   NOT NULL DEFAULT 0,
    `allowed_in_formats_json`          JSON         NULL,
    `card_counts_json`                 JSON         NULL,
    `translation_status`               ENUM('pending','automatic','reviewed') NOT NULL DEFAULT 'pending',
    `active`                           TINYINT(1)   NOT NULL DEFAULT 1,
    `source_hash`                      CHAR(64)     NOT NULL,
    `created_at`                       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`                       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`code`),
    KEY `idx_lorcana_sets_active_number` (`active`, `number`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `lorcana_cards` (
    `source_id`                        BIGINT UNSIGNED NOT NULL,
    `base_id`                          BIGINT UNSIGNED NULL,
    `set_code`                         VARCHAR(20)     NOT NULL,
    `number`                           INT             NULL,
    `code`                             VARCHAR(50)     NULL,
    `full_identifier`                  VARCHAR(100)    NULL,
    `name_en`                          VARCHAR(255)    NOT NULL,
    `name_pt_br`                       VARCHAR(255)    NULL,
    `version_en`                       VARCHAR(255)    NULL,
    `version_pt_br`                    VARCHAR(255)    NULL,
    `full_name_en`                     VARCHAR(500)    NOT NULL,
    `full_name_pt_br`                  VARCHAR(500)    NULL,
    `simple_name`                      VARCHAR(500)    NULL,
    `type_en`                          VARCHAR(60)     NOT NULL,
    `type_pt_br`                       VARCHAR(60)     NULL,
    `color_en`                         VARCHAR(60)     NULL,
    `color_pt_br`                      VARCHAR(60)     NULL,
    `colors_json`                      JSON            NULL,
    `rarity_en`                        VARCHAR(60)     NULL,
    `rarity_pt_br`                     VARCHAR(60)     NULL,
    `story_en`                         VARCHAR(255)    NULL,
    `story_pt_br`                      VARCHAR(255)    NULL,
    `cost`                             SMALLINT        NULL,
    `inkwell`                          TINYINT(1)      NOT NULL DEFAULT 0,
    `strength`                         SMALLINT        NULL,
    `willpower`                        SMALLINT        NULL,
    `lore`                             SMALLINT        NULL,
    `move_cost`                        SMALLINT        NULL,
    `max_copies_in_deck`               SMALLINT        NULL,
    `subtypes_en_json`                 JSON            NULL,
    `subtypes_pt_br_json`              JSON            NULL,
    `subtypes_text_en`                 VARCHAR(500)    NULL,
    `subtypes_text_pt_br`              VARCHAR(500)    NULL,
    `keyword_abilities_en_json`        JSON            NULL,
    `keyword_abilities_pt_br_json`     JSON            NULL,
    `abilities_en_json`                JSON            NULL,
    `abilities_pt_br_json`             JSON            NULL,
    `effects_en_json`                  JSON            NULL,
    `effects_pt_br_json`               JSON            NULL,
    `full_text_en`                     TEXT            NULL,
    `full_text_pt_br`                  TEXT            NULL,
    `flavor_text_en`                   TEXT            NULL,
    `flavor_text_pt_br`                TEXT            NULL,
    `clarifications_en_json`           JSON            NULL,
    `clarifications_pt_br_json`        JSON            NULL,
    `errata_en_json`                   JSON            NULL,
    `errata_pt_br_json`                JSON            NULL,
    `artists_json`                     JSON            NULL,
    `artists_text`                     VARCHAR(500)    NULL,
    `foil_types_json`                  JSON            NULL,
    `variant`                          VARCHAR(100)     NULL,
    `image_full_url`                   TEXT            NULL,
    `image_thumbnail_url`              TEXT            NULL,
    `image_full_foil_url`              TEXT            NULL,
    `images_json`                      JSON            NULL,
    `allowed_in_formats_json`          JSON            NULL,
    `allowed_in_tournaments_from_date` DATE            NULL,
    `source_payload_json`              LONGTEXT        NULL,
    `translation_status`               ENUM('pending','automatic','reviewed') NOT NULL DEFAULT 'pending',
    `translation_engine`               VARCHAR(100)    NULL,
    `translated_at`                    DATETIME        NULL,
    `active`                           TINYINT(1)      NOT NULL DEFAULT 1,
    `source_hash`                      CHAR(64)        NOT NULL,
    `created_at`                       TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`                       TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`source_id`),
    KEY `idx_lorcana_cards_set` (`set_code`, `active`, `number`),
    KEY `idx_lorcana_cards_filters` (`active`, `color_en`, `type_en`, `rarity_en`, `cost`),
    KEY `idx_lorcana_cards_name_en` (`name_en`),
    KEY `idx_lorcana_cards_name_pt_br` (`name_pt_br`),
    KEY `idx_lorcana_cards_full_name_en` (`full_name_en`(191)),
    CONSTRAINT `fk_lorcana_cards_set`
        FOREIGN KEY (`set_code`) REFERENCES `lorcana_sets` (`code`)
        ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `lorcana_sync_runs` (
    `id`                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `status`                ENUM('running','success','failed','skipped') NOT NULL,
    `source_generated_at`   DATETIME        NULL,
    `format_version`        VARCHAR(30)     NULL,
    `source_checksum`       CHAR(64)        NULL,
    `sets_processed`        INT             NOT NULL DEFAULT 0,
    `cards_processed`       INT             NOT NULL DEFAULT 0,
    `error_message`         TEXT            NULL,
    `started_at`            DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `finished_at`           DATETIME        NULL,
    PRIMARY KEY (`id`),
    KEY `idx_lorcana_sync_runs_started` (`started_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `lorcana_sync_state` (
    `id`                    TINYINT UNSIGNED NOT NULL DEFAULT 1,
    `source_generated_at`   DATETIME         NULL,
    `format_version`        VARCHAR(30)      NULL,
    `source_checksum`       CHAR(64)         NULL,
    `last_checked_at`       DATETIME         NULL,
    `last_synced_at`        DATETIME         NULL,
    `last_status`           VARCHAR(30)      NULL,
    `last_error`            TEXT             NULL,
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `lorcana_sync_state` (`id`, `last_status`)
VALUES (1, 'never')
ON DUPLICATE KEY UPDATE `id` = VALUES(`id`);

-- ============================================================================
-- Contas dos jogadores do site (diferente de admin_usuarios, que e do painel).
-- E-mail e CPF sao chaves unicas: a mesma pessoa nao se cadastra duas vezes.
-- ============================================================================
CREATE TABLE IF NOT EXISTS `usuarios` (
    `id`              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `nome`            VARCHAR(80)     NOT NULL,
    `sobrenome`       VARCHAR(120)    NOT NULL,
    `email`           VARCHAR(190)    NOT NULL,
    `telefone`        VARCHAR(11)     NULL,
    `cpf`             CHAR(11)        NOT NULL,
    `data_nascimento` DATE            NOT NULL,
    `senha_hash`      VARCHAR(255)    NOT NULL,
    `foto_perfil`     VARCHAR(255)    NULL,
    `status`          ENUM('ativo','inativo') NOT NULL DEFAULT 'ativo',
    `beta_tester`     TINYINT          NOT NULL DEFAULT 0,
    `session_version` INT              NOT NULL DEFAULT 1,
    `created_at`      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_usuarios_email` (`email`),
    UNIQUE KEY `uk_usuarios_cpf` (`cpf`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Decks privados dos jogadores. Listas incompletas podem ser salvas como
-- rascunho; validation_json registra o resultado da ultima validacao.
CREATE TABLE IF NOT EXISTS `decks` (
    `id`              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `usuario_id`      BIGINT UNSIGNED NOT NULL,
    `nome`            VARCHAR(100)    NOT NULL,
    `formato`         VARCHAR(30) NOT NULL DEFAULT 'core',
    `status_validacao` ENUM('rascunho','valido') NOT NULL DEFAULT 'rascunho',
    `total_cartas`    SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    `cores_json`      JSON            NULL,
    `validation_json` JSON            NULL,
    `created_at`      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_decks_usuario_updated` (`usuario_id`, `updated_at`),
    CONSTRAINT `fk_decks_usuario`
        FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`)
        ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `deck_cards` (
    `deck_id`        BIGINT UNSIGNED NOT NULL,
    `card_source_id` BIGINT UNSIGNED NOT NULL,
    `quantidade`     SMALLINT UNSIGNED NOT NULL,
    `created_at`     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`deck_id`, `card_source_id`),
    KEY `idx_deck_cards_card` (`card_source_id`),
    CONSTRAINT `fk_deck_cards_deck`
        FOREIGN KEY (`deck_id`) REFERENCES `decks` (`id`)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT `fk_deck_cards_card`
        FOREIGN KEY (`card_source_id`) REFERENCES `lorcana_cards` (`source_id`)
        ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Starters adicionados aos decks privados; a exclusao do deck libera nova importacao.
CREATE TABLE IF NOT EXISTS starter_deck_collection (
    usuario_id BIGINT UNSIGNED NOT NULL,
    starter_id VARCHAR(20) NOT NULL,
    deck_id BIGINT UNSIGNED NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (usuario_id, starter_id),
    UNIQUE KEY uk_starter_collection_deck (deck_id),
    CONSTRAINT fk_starter_collection_user FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_starter_collection_deck FOREIGN KEY (deck_id) REFERENCES decks(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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

-- Multiplayer: ver database/migrations/2026-09-21-multiplayer-rooms.sql

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
