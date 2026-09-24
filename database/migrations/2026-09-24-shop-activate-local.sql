-- Execute no banco local jogartcg_db via phpMyAdmin.
-- Define o saldo exato: nao execute novamente depois de realizar compras.
USE jogartcg_db;
CREATE TABLE IF NOT EXISTS player_wallets (
 usuario_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
 xp BIGINT UNSIGNED NOT NULL DEFAULT 0,
 gold BIGINT UNSIGNED NOT NULL DEFAULT 0,
 FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS player_items (
 usuario_id BIGINT UNSIGNED NOT NULL,
 item_id VARCHAR(64) NOT NULL,
 source VARCHAR(24) NOT NULL,
 gold_spent BIGINT UNSIGNED NOT NULL DEFAULT 0,
 acquired_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY (usuario_id,item_id),
 FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS deck_cosmetics (
 deck_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
 playmat_id VARCHAR(64) NULL,
 sleeve_id VARCHAR(64) NULL,
 FOREIGN KEY (deck_id) REFERENCES decks(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO player_wallets (usuario_id, xp, gold)
SELECT id, 3000, 50000 FROM usuarios WHERE email = 'erikprimao@gmail.com'
ON DUPLICATE KEY UPDATE xp = 3000, gold = 50000;
