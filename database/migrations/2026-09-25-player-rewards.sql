CREATE TABLE IF NOT EXISTS player_login_calendar (
 usuario_id INT PRIMARY KEY, started_on DATE NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS player_login_days (
 usuario_id INT NOT NULL, login_date DATE NOT NULL, PRIMARY KEY(usuario_id,login_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS player_reward_claims (
 usuario_id INT NOT NULL, reward_key VARCHAR(100) NOT NULL, reward_json LONGTEXT NOT NULL,
 gold_spent INT NOT NULL DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(usuario_id,reward_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS player_season_progress (
 usuario_id INT NOT NULL, season_id VARCHAR(20) NOT NULL, baseline_xp BIGINT NOT NULL,
 premium TINYINT NOT NULL DEFAULT 0, PRIMARY KEY(usuario_id,season_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
