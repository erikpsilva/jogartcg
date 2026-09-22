<?php

declare(strict_types=1);

/**
 * Verifica as imagens das cartas e substitui as quebradas.
 *
 *   php bin/repair_card_images.php            verifica todas e corrige
 *   php bin/repair_card_images.php --dry-run  so mostra o que faria
 *
 * O LorcanaJSON aponta para o CDN da Ravensburger, que as vezes republica uma
 * imagem com outro hash no nome e deixa o link antigo em 404. Para essas cartas
 * buscamos a imagem na API publica da Lorcast (mesma colecao e numero, conferindo
 * o nome) e guardamos em lorcana_card_image_overrides, que a sincronizacao reaplica.
 * Quando o link original volta a funcionar, a substituta e removida.
 */

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

set_time_limit(0);
require_once dirname(__DIR__) . '/config/database.php';

const LORCAST_API = 'https://api.lorcast.com/v0/cards';

$dryRun = in_array('--dry-run', $argv, true);
$pdo = getDbConnection();

/** HEAD em paralelo; devolve [source_id => true se a imagem responde]. */
function imagesAlive(array $urls): array
{
    $alive = [];
    $multi = curl_multi_init();
    $queue = $urls;
    $running = [];
    do {
        while ($queue && count($running) < 12) {
            $id = array_key_first($queue);
            $handle = curl_init($queue[$id]);
            unset($queue[$id]);
            curl_setopt_array($handle, [
                CURLOPT_NOBODY => true, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 30,
                CURLOPT_FOLLOWLOCATION => true, CURLOPT_USERAGENT => 'JogarTCG/1.0 (verificacao de imagens)',
            ]);
            curl_multi_add_handle($multi, $handle);
            $running[(int) $handle] = [$handle, $id];
        }
        curl_multi_exec($multi, $stillRunning);
        curl_multi_select($multi, 0.5);
        while ($info = curl_multi_info_read($multi)) {
            [$handle, $id] = $running[(int) $info['handle']];
            $alive[$id] = curl_getinfo($handle, CURLINFO_RESPONSE_CODE) === 200
                && str_starts_with((string) curl_getinfo($handle, CURLINFO_CONTENT_TYPE), 'image/');
            curl_multi_remove_handle($multi, $handle);
            curl_close($handle);
            unset($running[(int) $info['handle']]);
        }
    } while ($queue || $running);
    curl_multi_close($multi);
    return $alive;
}

/** "165/204 • EN • 2" -> ['2', 165];  "33/P1 • EN • 2" -> ['P1', 33];  "1 TFC • EN • 1/P1" -> ['P1', 1]. */
function lorcastLocation(string $identifier): ?array
{
    $parts = array_map('trim', preg_split('/[•·]/u', $identifier) ?: []);
    if (count($parts) < 3) return null;
    if (preg_match('/^0*(\d+)\s*\/\s*(\d+)$/', $parts[0], $match)) return [$parts[2], (int) $match[1]];
    if (preg_match('/^0*(\d+)\s*\/\s*([A-Za-z0-9]+)$/', $parts[0], $match)) return [$match[2], (int) $match[1]];
    if (preg_match('/^0*(\d+)\s+[A-Z]+$/', $parts[0], $match) && preg_match('/\/\s*([A-Za-z0-9]+)$/', $parts[2], $set)) return [$set[1], (int) $match[1]];
    return null;
}

function lorcastCard(string $set, int $number): ?array
{
    $handle = curl_init(LORCAST_API . '/' . rawurlencode($set) . '/' . $number);
    curl_setopt_array($handle, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 30, CURLOPT_USERAGENT => 'JogarTCG/1.0']);
    $body = curl_exec($handle);
    $status = curl_getinfo($handle, CURLINFO_RESPONSE_CODE);
    curl_close($handle);
    usleep(150000); // a Lorcast pede uso moderado
    return $status === 200 ? json_decode((string) $body, true) : null;
}

$normalize = static fn(string $value): string => preg_replace('/[^a-z0-9]+/', '', strtolower(iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $value) ?: $value)) ?? '';

// As URLs originais do LorcanaJSON ficam em images_json mesmo quando a coluna foi substituida.
$cards = $pdo->query(
    "SELECT source_id, name_en, full_name_en, full_identifier,
            JSON_UNQUOTE(JSON_EXTRACT(images_json, '$.full')) AS original_full,
            JSON_UNQUOTE(JSON_EXTRACT(images_json, '$.thumbnail')) AS original_thumbnail
     FROM lorcana_cards WHERE active = 1"
)->fetchAll();
$byId = array_column($cards, null, 'source_id');
$urls = array_filter(array_column($cards, 'original_full', 'source_id'));
fwrite(STDOUT, 'Verificando ' . count($urls) . " imagens originais...\n");
$alive = imagesAlive($urls);
$broken = array_keys(array_filter($alive, static fn(bool $ok): bool => !$ok));
fwrite(STDOUT, count($broken) . " quebradas.\n");

$upsert = $pdo->prepare(
    'INSERT INTO lorcana_card_image_overrides (source_id, image_full_url, image_thumbnail_url, origem, url_original, verificado_em)
     VALUES (?, ?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE image_full_url = VALUES(image_full_url), image_thumbnail_url = VALUES(image_thumbnail_url),
        origem = VALUES(origem), url_original = VALUES(url_original), verificado_em = NOW()'
);
$fixed = 0;
$unresolved = [];
foreach ($broken as $id) {
    $card = $byId[$id];
    $location = lorcastLocation((string) $card['full_identifier']);
    $remote = $location ? lorcastCard($location[0], $location[1]) : null;
    // So aceita a imagem se for a mesma carta: evita trocar por outra carta do mesmo numero.
    $sameCard = $remote && $normalize((string) $remote['name']) === $normalize((string) $card['name_en']);
    $full = $remote['image_uris']['digital']['large'] ?? null;
    $thumbnail = $remote['image_uris']['digital']['normal'] ?? $full;
    if (!$sameCard || !$full) {
        $unresolved[] = "#{$id} {$card['full_name_en']} [{$card['full_identifier']}]";
        continue;
    }
    fwrite(STDOUT, "  #{$id} {$card['full_name_en']} -> Lorcast {$location[0]}/{$location[1]}\n");
    if (!$dryRun) $upsert->execute([$id, $full, $thumbnail, 'lorcast', $card['original_full']]);
    $fixed++;
}

// Links originais que voltaram a funcionar dispensam a substituta.
$recovered = array_keys(array_filter($alive));
if (!$dryRun && $recovered) {
    $placeholders = implode(',', array_fill(0, count($recovered), '?'));
    $statement = $pdo->prepare("DELETE FROM lorcana_card_image_overrides WHERE source_id IN ({$placeholders})");
    $statement->execute($recovered);
    if ($statement->rowCount()) fwrite(STDOUT, $statement->rowCount() . " substituta(s) removida(s): o link original voltou.\n");
}

if (!$dryRun) {
    require_once __DIR__ . '/../config/card_images.php';
    applyCardImageOverrides($pdo);
}
fwrite(STDOUT, "Corrigidas: {$fixed}. Sem substituta encontrada: " . count($unresolved) . ".\n");
foreach ($unresolved as $line) fwrite(STDOUT, "  - {$line}\n");
