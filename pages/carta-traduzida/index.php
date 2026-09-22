<?php

declare(strict_types=1);

require_once ROOT . '/config/database.php';
require_once ROOT . '/includes/card_symbols.php';

function cardExampleEscape(?string $value): string
{
    return htmlspecialchars($value ?? '', ENT_QUOTES, 'UTF-8');
}

function cardExampleJson(?string $value): array
{
    if ($value === null || $value === '') {
        return [];
    }
    $decoded = json_decode($value, true);
    return is_array($decoded) ? $decoded : [];
}

$cardId = filter_input(INPUT_GET, 'id', FILTER_VALIDATE_INT, [
    'options' => ['min_range' => 1],
]) ?: 7;

$pdo = getDbConnection();
$statement = $pdo->prepare(
    'SELECT source_id, name_en, name_pt_br, version_en, version_pt_br,
            full_name_en, full_name_pt_br, type_en, type_pt_br, color_en, color_pt_br,
            rarity_en, rarity_pt_br, story_en, story_pt_br, subtypes_text_en,
            subtypes_text_pt_br, full_text_en, full_text_pt_br, flavor_text_en,
            flavor_text_pt_br, image_full_url,
            cost, strength, willpower, lore, translation_status, translation_engine
     FROM lorcana_cards
     WHERE source_id = ? AND active = 1
     LIMIT 1'
);
$statement->execute([$cardId]);
$card = $statement->fetch();

if (!$card) {
    http_response_code(404);
    $statement->execute([7]);
    $card = $statement->fetch();
}

$translatedText = trim((string) ($card['full_text_pt_br'] ?: $card['full_text_en']));
$textLength = mb_strlen($translatedText);
$textClass = $textLength > 330 ? 'card-translation__rules--small' : ($textLength > 210 ? 'card-translation__rules--compact' : '');
$isSpecialCard = in_array($card['rarity_en'], ['Enchanted', 'Epic', 'Iconic'], true);
$usesProtectedStatsLayout = (int) $card['source_id'] === 7;
$translatedFlavorText = trim((string) ($card['flavor_text_pt_br'] ?: $card['flavor_text_en']));
?>
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <title>Carta traduzida — <?= cardExampleEscape($card['full_name_pt_br']) ?> | Jogar TCG</title>
    <meta name="description" content="Demonstração de tradução visual não oficial de uma carta Disney Lorcana.">
    <?php include ROOT . '/includes/assets.php'; ?>
</head>
<body class="card-example-page">
    <main class="card-example">
        <div class="container">
            <a class="card-example__back" href="<?= BASE_URL ?>/">
                <i class="fa-solid fa-arrow-left" aria-hidden="true"></i>
                Voltar ao início
            </a>

            <header class="card-example__header">
                <div>
                    <span class="card-example__eyebrow">Protótipo visual</span>
                    <h1>Carta com tradução sobre a imagem</h1>
                    <p>
                        <?php if ($isSpecialCard): ?>
                            Em cartas especiais, a tradução usa painéis translúcidos para preservar a arte estendida.
                        <?php else: ?>
                            A ilustração e os atributos permanecem originais. Somente nome, classificação
                            e texto de regras recebem uma camada em português.
                        <?php endif; ?>
                    </p>
                </div>
                <span class="card-example__disclaimer">
                    <i class="fa-solid fa-language" aria-hidden="true"></i>
                    Tradução não oficial
                </span>
            </header>

            <section class="card-example__workspace" aria-labelledby="translated-card-title">
                <div class="card-example__preview-column">
                    <div class="card-example__mode-switch" role="group" aria-label="Idioma exibido na carta">
                        <button class="is-active" type="button" data-card-mode="translated" aria-pressed="true">
                            <i class="fa-solid fa-language" aria-hidden="true"></i>
                            PT-BR
                        </button>
                        <button type="button" data-card-mode="original" aria-pressed="false">
                            <i class="fa-regular fa-image" aria-hidden="true"></i>
                            Original
                        </button>
                    </div>

                    <article class="card-translation<?= $isSpecialCard ? ' card-translation--special' : '' ?><?= $usesProtectedStatsLayout ? ' card-translation--protected-stats' : '' ?>" data-card-preview>
                        <img
                            class="card-translation__image"
                            src="<?= cardExampleEscape($card['image_full_url']) ?>"
                            alt="Carta original <?= cardExampleEscape($card['full_name_en']) ?>"
                        >

                        <div class="card-translation__overlay" data-card-overlay>
                            <div class="card-translation__title-band">
                                <strong id="translated-card-title"><?= cardExampleEscape($card['name_pt_br'] ?: $card['name_en']) ?></strong>
                                <span><?= cardExampleEscape($card['version_pt_br'] ?: $card['version_en']) ?></span>
                            </div>

                            <div class="card-translation__type-band">
                                <strong><?= cardExampleEscape($card['type_pt_br'] ?: $card['type_en']) ?></strong>
                                <?php if (!empty($card['subtypes_text_pt_br']) || !empty($card['subtypes_text_en'])): ?>
                                    <span>• <?= cardExampleEscape($card['subtypes_text_pt_br'] ?: $card['subtypes_text_en']) ?></span>
                                <?php endif; ?>
                            </div>

                            <div class="card-translation__rules <?= cardExampleEscape($textClass) ?>">
                                <div class="card-translation__rules-text"><?= cardTextHtml($translatedText) ?></div>
                                <?php if ($translatedFlavorText !== ''): ?>
                                    <div class="card-translation__flavor"><?= nl2br(cardExampleEscape($translatedFlavorText)) ?></div>
                                <?php endif; ?>
                            </div>

                            <div class="card-translation__stamp">PT-BR • TRADUÇÃO NÃO OFICIAL</div>
                        </div>
                    </article>

                    <p class="card-example__view-note" data-view-note>
                        Visualização traduzida: a camada PT-BR está aplicada sobre as áreas textuais.
                    </p>
                </div>

                <aside class="card-example__details">
                    <div class="card-example__identity">
                        <span class="card-example__ink card-example__ink--<?= strtolower(cardExampleEscape($card['color_en'])) ?>"></span>
                        <div>
                            <small>Carta #<?= (int) $card['source_id'] ?></small>
                            <h2><?= cardExampleEscape($card['full_name_pt_br'] ?: $card['full_name_en']) ?></h2>
                            <p><?= cardExampleEscape($card['full_name_en']) ?></p>
                        </div>
                    </div>

                    <dl class="card-example__stats">
                        <div><dt>Custo</dt><dd><?= $card['cost'] !== null ? (int) $card['cost'] : '—' ?></dd></div>
                        <div><dt>Força</dt><dd><?= $card['strength'] !== null ? (int) $card['strength'] : '—' ?></dd></div>
                        <div><dt>Vontade</dt><dd><?= $card['willpower'] !== null ? (int) $card['willpower'] : '—' ?></dd></div>
                        <div><dt>Lore</dt><dd><?= $card['lore'] !== null ? (int) $card['lore'] : '—' ?></dd></div>
                    </dl>

                    <div class="card-example__text-block card-example__text-block--translated">
                        <span>Texto exibido em PT-BR</span>
                        <p><?= cardTextHtml($translatedText) ?></p>
                    </div>

                    <details class="card-example__original-text">
                        <summary>Conferir texto original em inglês</summary>
                        <p><?= cardTextHtml($card['full_text_en']) ?></p>
                    </details>

                    <div class="card-example__metadata">
                        <?php if ($isSpecialCard): ?>
                            <span><i class="fa-solid fa-gem" aria-hidden="true"></i> Tratamento translúcido para carta especial</span>
                        <?php endif; ?>
                        <?php if ($usesProtectedStatsLayout): ?>
                            <span><i class="fa-solid fa-crop-simple" aria-hidden="true"></i> Zonas de força, vontade e história preservadas</span>
                        <?php endif; ?>
                        <span>
                            <i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i>
                            <?= $card['translation_status'] === 'reviewed' ? 'Tradução revisada para demonstração' : 'Tradução automática revisável' ?>
                        </span>
                        <span><i class="fa-solid fa-database" aria-hidden="true"></i> Dados do nosso catálogo local</span>
                        <span><i class="fa-solid fa-shield-halved" aria-hidden="true"></i> Original sempre preservado</span>
                    </div>
                </aside>
            </section>
        </div>
    </main>

    <?php include ROOT . '/includes/scripts.php'; ?>
    <script src="<?= BASE_URL ?>/pages/carta-traduzida/card-translation.js?v=<?= time() ?>"></script>
</body>
</html>
