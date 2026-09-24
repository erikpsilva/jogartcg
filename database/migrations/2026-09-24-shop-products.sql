CREATE TABLE IF NOT EXISTS shop_products (
 id VARCHAR(64) NOT NULL PRIMARY KEY,
 name VARCHAR(120) NOT NULL,
 type ENUM('playmat','sleeve') NOT NULL,
 image VARCHAR(190) NOT NULL,
 description TEXT NOT NULL,
 gold INT UNSIGNED NULL,
 reais INT UNSIGNED NULL,
 active TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT IGNORE INTO shop_products (id,name,type,image,description,gold,reais) VALUES
('playmat-hades','Domínio de Hades','playmat','playmat-hades.jpg','',1200,NULL),
('playmat-incriveis','Família Incrível','playmat','playmat-incriveis.jpg','',1500,990),
('playmat-pooh','Aventura no Bosque','playmat','playmat-pooh.jpg','',900,NULL),
('playmat-toystory','Ao Infinito','playmat','playmat-toystory.jpg','',NULL,1290),
('sleeve-incriveis','Verso Incrível','sleeve','sleeve-incriveis.jpg','',600,490),
('sleeve-gold','Tinta Dourada','sleeve','sleeve-gold.png','',NULL,790),
('sleeve-hades','Chamas do Submundo','sleeve','sleeve-hades.jpg','',800,NULL),
('sleeve-lilo-stitch','Magia de Ohana','sleeve','sleeve-lilo-stitch.jpg','',800,NULL),
('sleeve-monstros','Sustos e Histórias','sleeve','sleeve-monstros.jpg','',800,NULL);
