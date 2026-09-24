-- Run once before publishing the Starter Deck section. Does not change existing decks.
CREATE TABLE IF NOT EXISTS starter_deck_collection (
    usuario_id BIGINT UNSIGNED NOT NULL,
    starter_id VARCHAR(20) NOT NULL,
    deck_id BIGINT UNSIGNED NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (usuario_id, starter_id),
    UNIQUE KEY uk_starter_collection_deck (deck_id),
    CONSTRAINT fk_starter_collection_user FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_starter_collection_deck FOREIGN KEY (deck_id) REFERENCES decks(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
