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
    ];
}
