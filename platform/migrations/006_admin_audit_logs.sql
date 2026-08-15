CREATE TABLE IF NOT EXISTS admin_audit_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER,
    username VARCHAR(80),
    action VARCHAR(40) NOT NULL,
    resource VARCHAR(40) NOT NULL,
    resource_id VARCHAR(255),
    detail JSONB,
    ip VARCHAR(64),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_created ON admin_audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON admin_audit_logs(user_id);
