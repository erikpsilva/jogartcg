<?php

declare(strict_types=1);

/**
 * Texto de carta em HTML seguro, com os símbolos do Lorcana como ícones.
 *
 * Mesmo mapa de apps/game-client/src/components/CardText.tsx. O banco e o motor
 * continuam com os caracteres; a troca acontece só na saída. O texto é escapado
 * antes, então só as marcações de ícone geradas aqui entram como HTML.
 */
function cardTextHtml(?string $text): string
{
    static $symbols = [
        '¤' => ['strength', 'Força'],
        '⛉' => ['willpower', 'Vontade'],
        '◊' => ['lore', 'História'],
        '⟳' => ['exert', 'Exaurir'],
        '⬡' => ['ink', 'Tinta'],
        '◉' => ['inkable', 'Tinteiro'],
    ];
    static $icons = null;
    if ($icons === null) {
        $icons = [];
        foreach ($symbols as $char => [$name, $label]) {
            $icons[$char] = '<span class="card-symbol card-symbol--' . $name . '" role="img" aria-label="' . $label . '" title="' . $label . '"></span>';
        }
    }

    $escaped = htmlspecialchars($text ?? '', ENT_QUOTES, 'UTF-8');
    return nl2br(strtr($escaped, $icons));
}
