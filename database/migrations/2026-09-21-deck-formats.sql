USE `jogartcg_db`;

-- Substitui o enum inicial por uma chave extensivel de formato.
ALTER TABLE `decks`
    MODIFY `formato` VARCHAR(30) NOT NULL DEFAULT 'core';

UPDATE `decks` SET `formato` = 'core' WHERE `formato` = 'construido';
UPDATE `decks` SET `formato` = 'infinity' WHERE `formato` = 'infinito';

-- Necessario para filtrar legalidade por nome completo e reconhecer
-- reimpressoes sem varrer todo o catalogo.
ALTER TABLE `lorcana_cards`
    ADD INDEX IF NOT EXISTS `idx_lorcana_cards_full_name_en` (`full_name_en`(191));

