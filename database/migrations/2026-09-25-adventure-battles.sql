CREATE TABLE IF NOT EXISTS adventure_battles (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, usuario_id INT NOT NULL,
 phase INT NOT NULL, revision INT NOT NULL DEFAULT 0, state_json LONGTEXT NOT NULL,
 warnings_json LONGTEXT NOT NULL, result_json LONGTEXT NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, finished_at TIMESTAMP NULL,
 KEY owner_battles(usuario_id,finished_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
