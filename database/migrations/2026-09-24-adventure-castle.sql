CREATE TABLE IF NOT EXISTS adventure_journeys (
 usuario_id INT NOT NULL,
 chapter VARCHAR(32) NOT NULL,
 starter_id VARCHAR(32) NOT NULL,
 collection_json LONGTEXT NOT NULL,
 deck_json LONGTEXT NOT NULL,
 completed_stages INT NOT NULL DEFAULT 0,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(usuario_id,chapter)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
