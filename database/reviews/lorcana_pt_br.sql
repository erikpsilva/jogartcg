-- Revisoes humanas pontuais usadas em demonstracoes do Jogar TCG.
-- Execute depois da importacao e da traducao automatica.
USE `jogartcg_db`;

UPDATE `lorcana_cards`
SET
    `name_pt_br` = 'HeiHei',
    `version_pt_br` = 'Lanche de Bordo',
    `full_name_pt_br` = 'HeiHei - Lanche de Bordo',
    `type_pt_br` = 'Personagem',
    `color_pt_br` = 'Âmbar',
    `rarity_pt_br` = 'Comum',
    `subtypes_pt_br_json` = JSON_ARRAY('Nascido da História', 'Aliado'),
    `subtypes_text_pt_br` = 'Nascido da História • Aliado',
    `keyword_abilities_pt_br_json` = JSON_ARRAY('Apoio'),
    `full_text_pt_br` = 'APOIO (Sempre que este personagem fizer uma missão, você pode adicionar a Força ¤ dele à Força ¤ de outro personagem escolhido neste turno.)',
    `abilities_pt_br_json` = JSON_ARRAY(
        JSON_OBJECT(
            'fullText', 'APOIO (Sempre que este personagem fizer uma missão, você pode adicionar a Força ¤ dele à Força ¤ de outro personagem escolhido neste turno.)',
            'keyword', 'Apoio',
            'reminderText', 'Sempre que este personagem fizer uma missão, você pode adicionar a Força ¤ dele à Força ¤ de outro personagem escolhido neste turno.',
            'type', 'keyword'
        )
    ),
    `translation_status` = 'reviewed',
    `translation_engine` = 'human-review-demo',
    `translated_at` = NOW()
WHERE `source_id` = 7;

UPDATE `lorcana_cards`
SET
    `name_pt_br` = 'Pongo',
    `version_pt_br` = 'Pai Determinado',
    `full_name_pt_br` = 'Pongo - Pai Determinado',
    `type_pt_br` = 'Personagem',
    `color_pt_br` = 'Âmbar',
    `rarity_pt_br` = 'Encantada',
    `subtypes_pt_br_json` = JSON_ARRAY('Nascido da História', 'Herói'),
    `subtypes_text_pt_br` = 'Nascido da História • Herói',
    `full_text_pt_br` = 'LATIDO AO ENTARDECER Uma vez durante seu turno, você pode pagar 2 ⬡ para revelar a carta do topo do seu baralho. Se for uma carta de personagem, coloque-a na sua mão. Caso contrário, coloque-a no fundo do seu baralho.',
    `abilities_pt_br_json` = JSON_ARRAY(
        JSON_OBJECT(
            'effect', 'Uma vez durante seu turno, você pode pagar 2 ⬡ para revelar a carta do topo do seu baralho. Se for uma carta de personagem, coloque-a na sua mão. Caso contrário, coloque-a no fundo do seu baralho.',
            'fullText', 'LATIDO AO ENTARDECER Uma vez durante seu turno, você pode pagar 2 ⬡ para revelar a carta do topo do seu baralho. Se for uma carta de personagem, coloque-a na sua mão. Caso contrário, coloque-a no fundo do seu baralho.',
            'name', 'LATIDO AO ENTARDECER',
            'type', 'activated'
        )
    ),
    `translation_status` = 'reviewed',
    `translation_engine` = 'human-review-demo',
    `translated_at` = NOW()
WHERE `source_id` = 2141;
