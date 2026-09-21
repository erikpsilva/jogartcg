-- Execute against the selected application database. Never resets an existing value.
CREATE TABLE IF NOT EXISTS site_settings (
    setting_key VARCHAR(64) NOT NULL PRIMARY KEY,
    setting_value VARCHAR(255) NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO site_settings (setting_key, setting_value)
SELECT 'play_enabled', '1' WHERE NOT EXISTS
(SELECT 1 FROM site_settings WHERE setting_key = 'play_enabled');
