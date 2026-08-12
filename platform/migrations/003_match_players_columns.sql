-- 兼容 Node 时代可能已有的列；无则添加
ALTER TABLE match_players ADD COLUMN IF NOT EXISTS player_type VARCHAR(50);
ALTER TABLE match_players ADD COLUMN IF NOT EXISTS player_name VARCHAR(255);
