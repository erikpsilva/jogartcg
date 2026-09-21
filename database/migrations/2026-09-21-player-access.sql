-- MariaDB / XAMPP. The authenticated admin also installs these columns safely.
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS beta_tester TINYINT NOT NULL DEFAULT 0;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS session_version INT NOT NULL DEFAULT 1;
