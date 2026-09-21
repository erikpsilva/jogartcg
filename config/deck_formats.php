<?php

declare(strict_types=1);

/**
 * Regras estruturais dos formatos de Disney Lorcana TCG.
 *
 * Fonte oficial: Tournament Rules, efetivo em 14/07/2026.
 * https://files.disneylorcana.com/Tournament-Rules-7.14.2026_Update_EN.pdf
 *
 * A legalidade de colecoes Core/Infinity vem de allowed_in_formats_json,
 * atualizado pelo LorcanaJSON. Banimentos ficam aqui para serem versionados e
 * auditaveis junto do codigo.
 */
function deckFormats(): array
{
    return [
        'core' => [
            'key' => 'core',
            'label' => 'Core Constructed',
            'description' => 'Formato competitivo com rotacao das colecoes.',
            'minimum_cards' => 60,
            'maximum_cards' => null,
            'maximum_colors' => 2,
            'maximum_copies' => 4,
            'uses_rotation' => true,
            'requires_card_pool' => false,
            'banned_cards' => [],
        ],
        'infinity' => [
            'key' => 'infinity',
            'label' => 'Infinity Constructed',
            'description' => 'Todas as colecoes lancadas, sem rotacao.',
            'minimum_cards' => 60,
            'maximum_cards' => null,
            'maximum_colors' => 2,
            'maximum_copies' => 4,
            'uses_rotation' => false,
            'requires_card_pool' => false,
            'banned_cards' => ['Hiram Flaversham - Toymaker'],
        ],
        'preconstructed' => [
            'key' => 'preconstructed',
            'label' => 'Preconstructed',
            'description' => 'Deck inicial e produtos fornecidos pelo evento.',
            'minimum_cards' => 60,
            'maximum_cards' => null,
            'maximum_colors' => null,
            'maximum_copies' => null,
            'uses_rotation' => false,
            'requires_card_pool' => true,
            'banned_cards' => [],
        ],
        'sealed' => [
            'key' => 'sealed',
            'label' => 'Sealed',
            'description' => 'Deck limitado montado com pelo menos seis boosters.',
            'minimum_cards' => 40,
            'maximum_cards' => null,
            'maximum_colors' => null,
            'maximum_copies' => null,
            'uses_rotation' => false,
            'requires_card_pool' => true,
            'banned_cards' => [],
        ],
        'draft' => [
            'key' => 'draft',
            'label' => 'Booster Draft',
            'description' => 'Deck limitado montado com as cartas escolhidas no draft.',
            'minimum_cards' => 35,
            'maximum_cards' => null,
            'maximum_colors' => null,
            'maximum_copies' => null,
            'uses_rotation' => false,
            'requires_card_pool' => true,
            'banned_cards' => [],
        ],
        'pack_rush' => [
            'key' => 'pack_rush',
            'label' => 'Pack Rush',
            'description' => 'As 24 cartas de dois boosters formam o deck.',
            'minimum_cards' => 24,
            'maximum_cards' => 24,
            'maximum_colors' => null,
            'maximum_copies' => null,
            'uses_rotation' => false,
            'requires_card_pool' => true,
            'banned_cards' => [],
        ],
    ];
}

function deckFormat(string $key): ?array
{
    $aliases = ['construido' => 'core', 'infinito' => 'infinity'];
    $key = $aliases[$key] ?? $key;
    return deckFormats()[$key] ?? null;
}

