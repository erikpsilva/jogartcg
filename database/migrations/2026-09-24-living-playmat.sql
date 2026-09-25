ALTER TABLE shop_products ADD COLUMN IF NOT EXISTS animation VARCHAR(32) NOT NULL DEFAULT 'none';
ALTER TABLE shop_products ADD COLUMN IF NOT EXISTS animation_intensity DECIMAL(3,2) NOT NULL DEFAULT 0.80;
UPDATE shop_products SET name='Hades — Cenário Vivo', description='Pedras suspensas, chamas azuis e energia em movimento suave. Animação do cenário de Hades.', animation='hades', animation_intensity=0.80 WHERE id='playmat-hades' AND animation='none';
