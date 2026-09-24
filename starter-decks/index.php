<?php
declare(strict_types=1);
$catalog = require dirname(__DIR__) . '/config/starter_decks.php';
$base = rtrim(str_replace('\\', '/', dirname(dirname($_SERVER['SCRIPT_NAME'] ?? '/starter-decks/index.php'))), '/');
$base = $base === '.' ? '' : $base;
function esc(string $value): string { return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); }
$colors = ['Amber' => 'Âmbar', 'Amethyst' => 'Ametista', 'Emerald' => 'Esmeralda', 'Ruby' => 'Rubi', 'Sapphire' => 'Safira', 'Steel' => 'Aço'];
$sets = array_values(array_unique(array_column($catalog, 'set')));
header('Content-Type: text/html; charset=utf-8');
?>
<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#08090b">
  <meta name="description" content="Explore os Starter Decks de Disney Lorcana, veja todas as cartas e adicione as listas aos seus decks.">
  <title>Starter Deck · Jogar TCG</title>
  <link rel="icon" href="<?= esc($base) ?>/client/brand/favicon.png">
  <link rel="stylesheet" href="<?= esc($base) ?>/client/assets/index-B_8ML6EN.css">
  <link rel="stylesheet" href="<?= esc($base) ?>/starter-decks/style.css?v=3">
  <link rel="manifest" href="<?= esc($base) ?>/client/manifest.webmanifest">
  <script type="module" src="<?= esc($base) ?>/client/assets/shared-header-v1.js"></script>
  <link rel="stylesheet" href="<?= esc($base) ?>/client/ink-colors.css?v=1">
  <link rel="stylesheet" href="<?= esc($base) ?>/client/shop.css?v=1">
  <link rel="stylesheet" href="<?= esc($base) ?>/client/rewards.css?v=1">
  <link rel="stylesheet" href="<?= esc($base) ?>/client/site-shell.css?v=1">
  <link rel="stylesheet" href="<?= esc($base) ?>/client/mobile-compact.css?v=1">
  <script src="<?= esc($base) ?>/starter-decks/app.js?v=5" defer></script>
</head>
<body data-base="<?= esc($base) ?>">
  <div id="shared-site-header" data-client-base="<?= esc($base) ?>/client/"></div>
  <div class="starter-content">
  <main>
    <section class="intro">
      <p class="eyebrow">Disney Lorcana · Decks de entrada</p>
      <h1>Um novo começo.<br><span>Seu próximo deck.</span></h1>
      <p>Conheça as listas originais, explore cada carta e leve seus favoritos para <strong>Meus Decks</strong>.</p>
      <p class="muted">23 listas de 60 cartas, incluindo os dois decks do 2-Player Starter Set. Boosters aleatórios não fazem parte das listas.</p>
    </section>
    <section class="filters" aria-label="Filtros de starters">
      <label>Buscar deck<input id="search" type="search" placeholder="Nome do deck ou coleção…"></label>
      <label>Coleção<select id="set"><option value="">Todas as coleções</option><?php foreach ($sets as $set): ?><option><?= esc($set) ?></option><?php endforeach ?></select></label>
      <label>Cor<select id="color" hidden><option value="">Todas as cores</option><?php foreach ($colors as $key => $label): ?><option value="<?= esc($key) ?>"><?= esc($label) ?></option><?php endforeach ?></select><span class="starter-ink-options"><button type="button" data-ink-filter="" aria-pressed="true">Todas</button><?php foreach ($colors as $key => $label): ?><button type="button" data-ink-filter="<?= esc($key) ?>" aria-pressed="false"><span class="lorcana-inks"><span class="lorcana-ink"><img src="<?= esc($base) ?>/images/icons/<?= esc(strtolower($key)) ?>.webp" alt="" width="30" height="34"><span><?= esc($label) ?></span></span></span></button><?php endforeach ?></span></label>
    </section>
    <p id="count" class="muted" aria-live="polite">23 decks disponíveis</p>
    <div id="notice" class="notice" role="status" hidden></div>
    <section class="starter-grid" aria-label="Starter Decks">
      <?php foreach ($catalog as $deck): ?>
      <article class="starter" data-id="<?= esc($deck['id']) ?>" data-set="<?= esc($deck['set']) ?>" data-colors="<?= esc(implode(' ', $deck['colors'])) ?>" data-name="<?= esc($deck['name'] . ' ' . $deck['set']) ?>">
        <a class="cover-link" href="?deck=<?= esc($deck['id']) ?>" data-detail="<?= esc($deck['id']) ?>"><img src="<?= esc($base . '/' . $deck['cover']) ?>" alt="Embalagem de <?= esc($deck['name']) ?>" loading="lazy" width="250" height="300"><span class="card-count">60 cartas</span></a>
        <div class="starter-body">
          <p class="eyebrow"><?= esc($deck['set']) ?></p><h2><a href="?deck=<?= esc($deck['id']) ?>" data-detail="<?= esc($deck['id']) ?>"><?= esc($deck['name']) ?></a></h2>
          <p class="inks lorcana-inks"><?php foreach ($deck['colors'] as $ink): ?><span class="lorcana-ink"><img src="<?= esc($base) ?>/images/icons/<?= esc(strtolower($ink)) ?>.webp" alt="" width="30" height="34"><span><?= esc($colors[$ink]) ?></span></span><?php endforeach ?></p>
          <div class="starter-actions"><a class="button secondary" href="?deck=<?= esc($deck['id']) ?>" data-detail="<?= esc($deck['id']) ?>">Ver cartas</a><button data-collect="<?= esc($deck['id']) ?>">+ Minha coleção</button></div>
        </div>
      </article>
      <?php endforeach ?>
    </section>
    <p id="empty" hidden>Nenhum starter corresponde aos filtros escolhidos.</p>
    <noscript><p class="notice">Ative o JavaScript para consultar as cartas e adicionar decks à sua coleção.</p></noscript>
    <footer><p>Listas: <a href="https://lorcanajson.org/" target="_blank" rel="noopener">LorcanaJSON</a> · Capas: Ravensburger / <a href="https://www.legendensammler.de/decks" target="_blank" rel="noopener">Legendensammler</a>. Catálogo conferido em 23/09/2026.</p><p>Gateway e Illumineer's Quest são produtos diferentes e não integram esta seleção de Starter Decks. Capas antigas podem estar em alemão; as cartas exibem a tradução do catálogo quando disponível.</p><p>Disney Lorcana © Disney / Ravensburger. Site de fãs, sem vínculo oficial.</p></footer>
  </main>
  <dialog id="detail" aria-labelledby="detail-title">
    <div class="dialog-header"><div><p class="eyebrow" id="detail-set"></p><h2 id="detail-title">Starter Deck</h2></div><button class="close secondary" data-close="detail" aria-label="Fechar detalhes">×</button></div>
    <div id="detail-content"></div>
  </dialog>
  <dialog id="zoom" aria-label="Carta ampliada"><button class="close secondary" data-close="zoom" aria-label="Fechar carta ampliada">×</button><div class="zoom-layout"><img id="zoom-image" alt=""><section id="zoom-description" aria-label="Descrição da carta"></section></div></dialog>
  <dialog id="login" aria-labelledby="login-title"><button class="close secondary" data-close="login" aria-label="Fechar">×</button><h2 id="login-title">Salve seus starters favoritos</h2><p>Entre ou cadastre-se para adicionar este deck à sua coleção. A lista ficará disponível em Meus Decks.</p><div class="starter-actions"><a class="button" id="login-link">Entrar</a><a class="button secondary" id="register-link">Criar conta</a></div></dialog>
  </div>
</body>
</html>
