-- MariaDB / XAMPP. Imagens substitutas para cartas cujo link original quebrou.
-- A sincronizacao diaria regrava os links do LorcanaJSON; esta tabela guarda a
-- substituta para que ela seja reaplicada depois de cada sincronizacao.
-- Mantida por bin/repair_card_images.php. Idempotente.
CREATE TABLE IF NOT EXISTS `lorcana_card_image_overrides` (
    `source_id`           BIGINT UNSIGNED NOT NULL,
    `image_full_url`      TEXT            NOT NULL,
    `image_thumbnail_url` TEXT            NOT NULL,
    `origem`              VARCHAR(40)     NOT NULL,
    `url_original`        TEXT            NULL,
    `verificado_em`       DATETIME        NOT NULL,
    PRIMARY KEY (`source_id`),
    CONSTRAINT `fk_image_overrides_card` FOREIGN KEY (`source_id`) REFERENCES `lorcana_cards` (`source_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
