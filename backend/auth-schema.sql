CREATE TABLE IF NOT EXISTS dashboard_users (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(64) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL UNIQUE,
    password_hash VARCHAR(192) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS dashboard_sessions (
    token_hash BINARY(32) PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    credential_fingerprint BINARY(32) NOT NULL,
    expires_at DATETIME NOT NULL,
    INDEX (expires_at),
    FOREIGN KEY (user_id) REFERENCES dashboard_users (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS dashboard_login_attempts (
    bucket BINARY(32) PRIMARY KEY,
    attempts TINYINT UNSIGNED NOT NULL,
    expires_at DATETIME NOT NULL,
    INDEX (expires_at)
) ENGINE=InnoDB;