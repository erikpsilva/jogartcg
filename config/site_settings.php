<?php
declare(strict_types=1);

/** Installation migration: only called from the authenticated admin, never public reads. */
function initializeSiteSettings(PDO $pdo): void
{
    $pdo->exec("CREATE TABLE IF NOT EXISTS site_settings (
        setting_key VARCHAR(64) NOT NULL PRIMARY KEY,
        setting_value VARCHAR(255) NOT NULL,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )");
    $pdo->exec("INSERT INTO site_settings (setting_key, setting_value)
        SELECT 'play_enabled', '1' WHERE NOT EXISTS
        (SELECT 1 FROM site_settings WHERE setting_key = 'play_enabled')");
}

function publicSiteSettings(PDO $pdo): array
{
    try {
        $value = $pdo->query("SELECT setting_value FROM site_settings WHERE setting_key = 'play_enabled'")->fetchColumn();
    } catch (PDOException $error) {
        // Preserve the existing site until the additive migration is installed.
        if (($error->errorInfo[1] ?? null) === 1146 || str_contains($error->getMessage(), 'no such table: site_settings')) {
            return ['play_enabled' => true];
        }
        throw $error;
    }
    return ['play_enabled' => $value === false || $value === '1'];
}

function savePlaySetting(PDO $pdo, bool $enabled): void
{
    $statement = $pdo->prepare("UPDATE site_settings SET setting_value = ?, updated_at = CURRENT_TIMESTAMP WHERE setting_key = 'play_enabled'");
    $statement->execute([$enabled ? '1' : '0']);
}
