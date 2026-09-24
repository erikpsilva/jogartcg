-- MariaDB / XAMPP. Regras compiladas de cada carta, prontas para o motor.
-- O texto impresso vira regras por um compilador que roda fora do site
-- (bin/compile_card_rules.php, no ambiente de desenvolvimento); o servidor
-- apenas le esta coluna. Assim o motor em PHP nao precisa interpretar texto.
-- Idempotente.
ALTER TABLE `lorcana_cards` ADD COLUMN IF NOT EXISTS `rules_json` LONGTEXT NULL AFTER `source_payload_json`;
ALTER TABLE `lorcana_cards` ADD COLUMN IF NOT EXISTS `rules_supported` TINYINT(1) NOT NULL DEFAULT 0 AFTER `rules_json`;
ALTER TABLE `lorcana_cards` ADD INDEX IF NOT EXISTS `idx_lorcana_cards_rules` (`rules_supported`, `active`);
