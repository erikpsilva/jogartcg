<?php

declare(strict_types=1);

/**
 * Recalcula print_group_id: todas as impressoes com o mesmo nome completo apontam
 * para a impressao principal (a primeira de colecao regular). Mesma regra da
 * migration 2026-09-22-card-print-groups.sql. Chamado ao fim da sincronizacao.
 */
function computePrintGroups(PDO $pdo): void
{
    $column = $pdo->query("SHOW COLUMNS FROM lorcana_cards LIKE 'print_group_id'")->fetchColumn();
    if (!$column) return; // migration ainda nao aplicada

    $pdo->exec(
        "UPDATE lorcana_cards c
         JOIN (
             SELECT full_name_en,
                    COALESCE(MIN(CASE WHEN full_identifier REGEXP '^[0-9]+/[0-9]+ ' THEN source_id END), MIN(source_id)) AS group_id
             FROM lorcana_cards WHERE active = 1 GROUP BY full_name_en
         ) g ON g.full_name_en = c.full_name_en
         SET c.print_group_id = g.group_id
         WHERE c.active = 1"
    );
}
