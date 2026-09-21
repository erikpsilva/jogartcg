<?php

declare(strict_types=1);

require_once ROOT . '/config/database.php';

function renderedCardEscape(?string $value): string
{
    return htmlspecialchars($value ?? '', ENT_QUOTES, 'UTF-8');
}

$cardId = filter_input(INPUT_GET, 'id', FILTER_VALIDATE_INT, [
    'options' => ['min_range' => 1],
]) ?: 7;

$statement = getDbConnection()->prepare(
    'SELECT source_id, name_en, name_pt_br, version_en, version_pt_br,
            type_en, type_pt_br, rarity_en, subtypes_text_en, subtypes_text_pt_br,
            full_text_en, full_text_pt_br, flavor_text_en, flavor_text_pt_br,
            image_full_url
     FROM lorcana_cards
     WHERE source_id = ? AND active = 1
     LIMIT 1'
);
$statement->execute([$cardId]);
$card = $statement->fetch();

if (!$card) {
    http_response_code(404);
    exit('Carta não encontrada.');
}

$translatedText = trim((string) ($card['full_text_pt_br'] ?: $card['full_text_en']));
$translatedFlavor = trim((string) ($card['flavor_text_pt_br'] ?: $card['flavor_text_en']));
$textLength = mb_strlen($translatedText);
$textClass = $textLength > 330 ? 'card-translation__rules--small' : ($textLength > 210 ? 'card-translation__rules--compact' : '');
$isSpecialCard = in_array($card['rarity_en'], ['Enchanted', 'Epic', 'Iconic'], true);
$usesProtectedStatsLayout = (int) $card['source_id'] === 7;
?>
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title><?= renderedCardEscape($card['name_pt_br'] ?: $card['name_en']) ?> — imagem renderizada</title>
    <link rel="stylesheet" href="<?= BASE_URL ?>/styles/style.min.css">
    <style>
        html, body {
            width: 100%;
            height: 100%;
            margin: 0;
            overflow: hidden;
            background: transparent;
        }

        .card-render-page .card-translation {
            width: 100vw;
            height: 100vh;
            max-width: none;
            margin: 0;
            border-radius: 0;
            box-shadow: none;
        }
    </style>
</head>
<body class="card-render-page">
    <article class="card-translation<?= $isSpecialCard ? ' card-translation--special' : '' ?><?= $usesProtectedStatsLayout ? ' card-translation--protected-stats' : '' ?>">
        <img
            class="card-translation__image"
            src="<?= renderedCardEscape($card['image_full_url']) ?>"
            alt=""
        >

        <div class="card-translation__overlay">
            <div class="card-translation__title-band">
                <strong><?= renderedCardEscape($card['name_pt_br'] ?: $card['name_en']) ?></strong>
                <span><?= renderedCardEscape($card['version_pt_br'] ?: $card['version_en']) ?></span>
            </div>

            <div class="card-translation__type-band">
                <strong><?= renderedCardEscape($card['type_pt_br'] ?: $card['type_en']) ?></strong>
                <?php if (!empty($card['subtypes_text_pt_br']) || !empty($card['subtypes_text_en'])): ?>
                    <span>• <?= renderedCardEscape($card['subtypes_text_pt_br'] ?: $card['subtypes_text_en']) ?></span>
                <?php endif; ?>
            </div>

            <div class="card-translation__rules <?= renderedCardEscape($textClass) ?>">
                <div class="card-translation__rules-text"><?= nl2br(renderedCardEscape($translatedText)) ?></div>
                <?php if ($translatedFlavor !== ''): ?>
                    <div class="card-translation__flavor"><?= nl2br(renderedCardEscape($translatedFlavor)) ?></div>
                <?php endif; ?>
            </div>
        </div>
    </article>
</body>
</html>
