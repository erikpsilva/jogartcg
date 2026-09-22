-- MariaDB / XAMPP. Agrupa as impressoes de uma mesma carta (mesmo nome completo).
-- Impressoes promocionais, lendarias e reimpressoes tem as mesmas regras e mudam so
-- a arte; o catalogo mostra um item por grupo com uma galeria das artes.
-- print_group_id = source_id da impressao principal do grupo: a primeira impressao
-- de colecao regular (identificador "N/204"), ou a primeira de todas se nao houver.
-- Idempotente; recalculado tambem ao fim de cada sincronizacao (config/card_groups.php).
ALTER TABLE `lorcana_cards` ADD COLUMN IF NOT EXISTS `print_group_id` BIGINT UNSIGNED NULL AFTER `base_id`;
ALTER TABLE `lorcana_cards` ADD INDEX IF NOT EXISTS `idx_lorcana_cards_print_group` (`print_group_id`, `active`);

UPDATE `lorcana_cards` c
JOIN (
    SELECT full_name_en,
           COALESCE(MIN(CASE WHEN full_identifier REGEXP '^[0-9]+/[0-9]+ ' THEN source_id END), MIN(source_id)) AS group_id
    FROM `lorcana_cards` WHERE active = 1 GROUP BY full_name_en
) g ON g.full_name_en = c.full_name_en
SET c.print_group_id = g.group_id
WHERE c.active = 1;
