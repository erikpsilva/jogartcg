<?php

declare(strict_types=1);

/**
 * Aplica as imagens substitutas (lorcana_card_image_overrides) sobre os links do
 * LorcanaJSON e devolve o link original as cartas que nao precisam mais delas.
 * Chamado por bin/repair_card_images.php e ao fim de cada sincronizacao.
 */
function applyCardImageOverrides(PDO $pdo): void
{
    $table = $pdo->query("SHOW TABLES LIKE 'lorcana_card_image_overrides'")->fetchColumn();
    if (!$table) return; // migration ainda nao aplicada

    $pdo->exec(
        'UPDATE lorcana_cards c JOIN lorcana_card_image_overrides o ON o.source_id = c.source_id
         SET c.image_full_url = o.image_full_url, c.image_thumbnail_url = o.image_thumbnail_url'
    );
    $pdo->exec(
        "UPDATE lorcana_cards c LEFT JOIN lorcana_card_image_overrides o ON o.source_id = c.source_id
         SET c.image_full_url = JSON_UNQUOTE(JSON_EXTRACT(c.images_json, '$.full')),
             c.image_thumbnail_url = JSON_UNQUOTE(JSON_EXTRACT(c.images_json, '$.thumbnail'))
         WHERE o.source_id IS NULL AND c.images_json IS NOT NULL
           AND c.image_full_url <> JSON_UNQUOTE(JSON_EXTRACT(c.images_json, '$.full'))"
    );
}
