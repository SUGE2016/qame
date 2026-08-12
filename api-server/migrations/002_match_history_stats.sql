-- 对局结果与手顺（可重复执行）

ALTER TABLE matches ADD COLUMN IF NOT EXISTS result JSONB;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS started_at TIMESTAMP;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS finished_at TIMESTAMP;

CREATE TABLE IF NOT EXISTS match_moves (
    id SERIAL PRIMARY KEY,
    match_id VARCHAR(255) NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    ply INTEGER NOT NULL,
    seat_index INTEGER NOT NULL,
    move JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(match_id, ply)
);

CREATE INDEX IF NOT EXISTS idx_match_moves_match_id ON match_moves(match_id);
CREATE INDEX IF NOT EXISTS idx_matches_finished_at ON matches(finished_at);
CREATE INDEX IF NOT EXISTS idx_matches_status_updated ON matches(status, updated_at);
