CREATE TABLE IF NOT EXISTS personal_access_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(80) NOT NULL DEFAULT 'mcp',
    token_hash VARCHAR(64) UNIQUE NOT NULL,
    token_prefix VARCHAR(20) NOT NULL,
    expires_at TIMESTAMP,
    last_used_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pats_user ON personal_access_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_pats_hash ON personal_access_tokens(token_hash);
