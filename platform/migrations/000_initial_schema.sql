-- 000_initial_schema.sql
-- 基础数据库结构迁移文件
-- 创建所有必要的表和索引

-- 用户表
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'user',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 游戏表
CREATE TABLE IF NOT EXISTS games (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    min_players INTEGER DEFAULT 2,
    max_players INTEGER DEFAULT 2,
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- AI客户端表
CREATE TABLE IF NOT EXISTS ai_clients (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    endpoint VARCHAR(500) NOT NULL,
    supported_games TEXT[], -- PostgreSQL数组类型
    description TEXT,
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- AI玩家表
CREATE TABLE IF NOT EXISTS ai_players (
    id SERIAL PRIMARY KEY,
    player_name VARCHAR(255) NOT NULL,
    ai_client_id VARCHAR(255) REFERENCES ai_clients(id) ON DELETE CASCADE,
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 统一玩家表
CREATE TABLE IF NOT EXISTS players (
    id SERIAL PRIMARY KEY,
    player_name VARCHAR(255) NOT NULL,
    player_type VARCHAR(50) NOT NULL CHECK (player_type IN ('human', 'ai')),
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, -- 人类玩家关联
    ai_player_id INTEGER REFERENCES ai_players(id) ON DELETE CASCADE, -- AI玩家关联
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    -- 确保人类玩家有user_id，AI玩家有ai_player_id
    CONSTRAINT check_player_type_consistency CHECK (
        (player_type = 'human' AND user_id IS NOT NULL AND ai_player_id IS NULL) OR
        (player_type = 'ai' AND ai_player_id IS NOT NULL AND user_id IS NULL)
    )
);

-- 比赛表
CREATE TABLE IF NOT EXISTS matches (
    id VARCHAR(255) PRIMARY KEY,
    game_id VARCHAR(255) NOT NULL REFERENCES games(id),
    creator_id INTEGER REFERENCES users(id),
    bgio_match_id VARCHAR(255), -- boardgame.io的match ID
    status VARCHAR(50) DEFAULT 'waiting' CHECK (status IN ('waiting', 'ready', 'playing', 'finished', 'cancelled')),
    max_players INTEGER DEFAULT 2,
    min_players INTEGER DEFAULT 2,
    current_players INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 比赛玩家表
CREATE TABLE IF NOT EXISTS match_players (
    id SERIAL PRIMARY KEY,
    match_id VARCHAR(255) NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    seat_index INTEGER NOT NULL,
    player_credentials VARCHAR(255), -- boardgame.io的玩家凭证
    status VARCHAR(50) DEFAULT 'joined' CHECK (status IN ('joined', 'left', 'kicked')),
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    left_at TIMESTAMP,
    -- 确保每个match中的座位索引唯一
    UNIQUE(match_id, seat_index),
    -- 确保每个玩家在同一match中只能有一个活跃记录
    UNIQUE(match_id, player_id)
);

-- 刷新令牌表
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(500) UNIQUE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_players_user_id ON players(user_id);
CREATE INDEX IF NOT EXISTS idx_players_ai_player_id ON players(ai_player_id);
CREATE INDEX IF NOT EXISTS idx_players_type_status ON players(player_type, status);
CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status);
CREATE INDEX IF NOT EXISTS idx_matches_creator ON matches(creator_id);
CREATE INDEX IF NOT EXISTS idx_matches_game ON matches(game_id);
CREATE INDEX IF NOT EXISTS idx_match_players_match ON match_players(match_id);
CREATE INDEX IF NOT EXISTS idx_match_players_player ON match_players(player_id);
CREATE INDEX IF NOT EXISTS idx_match_players_status ON match_players(status);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires ON refresh_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_ai_players_client ON ai_players(ai_client_id);

-- 插入一些基础游戏数据
INSERT INTO games (id, name, description, min_players, max_players) VALUES 
('tic-tac-toe', 'Tic Tac Toe', '经典的井字棋游戏', 2, 2)
ON CONFLICT (id) DO NOTHING;

-- 创建更新时间戳的函数
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 为需要自动更新时间戳的表创建触发器（先删除可能存在的触发器）
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_games_updated_at ON games;
CREATE TRIGGER update_games_updated_at BEFORE UPDATE ON games
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_ai_clients_updated_at ON ai_clients;
CREATE TRIGGER update_ai_clients_updated_at BEFORE UPDATE ON ai_clients
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_ai_players_updated_at ON ai_players;
CREATE TRIGGER update_ai_players_updated_at BEFORE UPDATE ON ai_players
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_players_updated_at ON players;
CREATE TRIGGER update_players_updated_at BEFORE UPDATE ON players
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_matches_updated_at ON matches;
CREATE TRIGGER update_matches_updated_at BEFORE UPDATE ON matches
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 注释：后续的001_迁移文件将添加PostgreSQL LISTEN/NOTIFY触发器