<?php

declare(strict_types=1);

function respond(array $payload, int $status = 200): never
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

function decodeJson(?string $value): mixed
{
    if ($value === null || $value === '') {
        return null;
    }
    return json_decode($value, true);
}

function localized(?string $english, ?string $portuguese, string $language): ?string
{
    if ($language === 'en') {
        return $english;
    }
    return $portuguese ?: $english;
}

function cardSummary(array $row, string $language): array
{
    return [
        'id' => (int) $row['source_id'],
        'set_code' => $row['set_code'],
        'number' => $row['number'] !== null ? (int) $row['number'] : null,
        'name' => localized($row['name_en'], $row['name_pt_br'], $language),
        'version' => localized($row['version_en'], $row['version_pt_br'], $language),
        'full_name' => localized($row['full_name_en'], $row['full_name_pt_br'], $language),
        'type' => localized($row['type_en'], $row['type_pt_br'], $language),
        'color' => localized($row['color_en'], $row['color_pt_br'], $language),
        'rarity' => localized($row['rarity_en'], $row['rarity_pt_br'], $language),
        'cost' => $row['cost'] !== null ? (int) $row['cost'] : null,
        'inkwell' => (bool) $row['inkwell'],
        'strength' => $row['strength'] !== null ? (int) $row['strength'] : null,
        'willpower' => $row['willpower'] !== null ? (int) $row['willpower'] : null,
        'lore' => $row['lore'] !== null ? (int) $row['lore'] : null,
        'image' => [
            'full' => $row['image_full_url'],
            'thumbnail' => $row['image_thumbnail_url'],
            'full_foil' => $row['image_full_foil_url'],
        ],
        'translation_status' => $row['translation_status'],
        'max_copies_in_deck' => $row['max_copies_in_deck'] !== null ? (int) $row['max_copies_in_deck'] : 4,
        'print_group_id' => isset($row['print_group_id']) ? (int) $row['print_group_id'] : (int) $row['source_id'],
    ];
}

/**
 * Artes de cada carta: todas as impressoes do mesmo grupo (mesmo nome completo),
 * a principal primeiro. Regras e textos sao os mesmos; mudam arte, colecao e raridade.
 *
 * @param int[] $groupIds
 * @return array<int, list<array>> print_group_id => impressoes
 */
function cardPrintings(PDO $pdo, array $groupIds, string $language, ?string $preferredSet = null): array
{
    $groupIds = array_values(array_unique(array_filter(array_map('intval', $groupIds))));
    if ($groupIds === []) return [];
    $placeholders = implode(',', array_fill(0, count($groupIds), '?'));
    $statement = $pdo->prepare(
        "SELECT source_id, print_group_id, set_code, number, full_identifier, rarity_en, rarity_pt_br,
                image_full_url, image_thumbnail_url
         FROM lorcana_cards WHERE active = 1 AND print_group_id IN ({$placeholders})
         ORDER BY print_group_id, (source_id = print_group_id) DESC, source_id"
    );
    $statement->execute($groupIds);
    $groups = [];
    foreach ($statement->fetchAll() as $row) {
        $groups[(int) $row['print_group_id']][] = [
            'id' => (int) $row['source_id'],
            'set_code' => $row['set_code'],
            'number' => $row['number'] !== null ? (int) $row['number'] : null,
            'identifier' => $row['full_identifier'],
            'rarity' => localized($row['rarity_en'], $row['rarity_pt_br'], $language),
            'image' => ['full' => $row['image_full_url'], 'thumbnail' => $row['image_thumbnail_url']],
        ];
    }
    if ($preferredSet !== null && $preferredSet !== '') {
        // Filtrando por colecao, a arte daquela colecao abre a galeria.
        foreach ($groups as &$printings) {
            usort($printings, static fn(array $a, array $b): int => (int) ($b['set_code'] === $preferredSet) <=> (int) ($a['set_code'] === $preferredSet));
        }
        unset($printings);
    }
    return $groups;
}
