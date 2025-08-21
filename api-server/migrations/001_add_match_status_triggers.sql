-- 001_add_match_status_triggers.sql
-- 添加PostgreSQL LISTEN/NOTIFY触发器，用于监听matches表状态变更

-- 创建通知函数，当matches表状态发生变更时发送通知
CREATE OR REPLACE FUNCTION notify_match_status_change()
RETURNS TRIGGER AS $$
DECLARE
    notification_payload JSON;
BEGIN
    -- 构建通知载荷
    IF TG_OP = 'INSERT' THEN
            notification_payload = json_build_object(
                'operation', 'INSERT',
                'match_id', NEW.id,
                'game_id', NEW.game_id,
                'status', NEW.status,
                'old_status', null,
                'creator_id', NEW.creator_id,
                'max_players', NEW.max_players,
                'min_players', NEW.min_players,
                'timestamp', extract(epoch from now())
            );
    ELSIF TG_OP = 'UPDATE' THEN
        -- 只有当状态实际发生变化时才发送通知
        IF OLD.status != NEW.status THEN
                notification_payload = json_build_object(
                    'operation', 'UPDATE',
                    'match_id', NEW.id,
                    'game_id', NEW.game_id,
                    'status', NEW.status,
                    'old_status', OLD.status,
                    'creator_id', NEW.creator_id,
                    'max_players', NEW.max_players,
                    'min_players', NEW.min_players,
                    'timestamp', extract(epoch from now())
                );
        ELSE
            -- 状态没有变化，不发送通知
            RETURN NEW;
        END IF;
    ELSIF TG_OP = 'DELETE' THEN
            notification_payload = json_build_object(
                'operation', 'DELETE',
                'match_id', COALESCE(OLD.id, ''),
                'game_id', COALESCE(OLD.game_id, ''),
                'status', COALESCE(OLD.status, ''),
                'old_status', null,
                'creator_id', OLD.creator_id,
                'max_players', COALESCE(OLD.max_players, 0),
                'min_players', COALESCE(OLD.min_players, 0),
                'timestamp', extract(epoch from now())
            );
    END IF;

    -- 发送通知到 'match_status_changes' 频道
    PERFORM pg_notify('match_status_changes', notification_payload::text);

    -- 返回适当的记录
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- 为matches表创建触发器（如果不存在）
-- INSERT触发器：新创建match时通知
DROP TRIGGER IF EXISTS trigger_match_insert_notify ON matches;
CREATE TRIGGER trigger_match_insert_notify
    AFTER INSERT ON matches
    FOR EACH ROW
    EXECUTE FUNCTION notify_match_status_change();

-- UPDATE触发器：match状态更新时通知
DROP TRIGGER IF EXISTS trigger_match_update_notify ON matches;
CREATE TRIGGER trigger_match_update_notify
    AFTER UPDATE ON matches
    FOR EACH ROW
    EXECUTE FUNCTION notify_match_status_change();

-- DELETE触发器：match删除时通知
DROP TRIGGER IF EXISTS trigger_match_delete_notify ON matches;
CREATE TRIGGER trigger_match_delete_notify
    AFTER DELETE ON matches
    FOR EACH ROW
    EXECUTE FUNCTION notify_match_status_change();

-- 创建额外的通知函数，用于监听match_players表的变化
-- 这对于AI Manager了解玩家加入/离开情况很有用
CREATE OR REPLACE FUNCTION notify_match_player_change()
RETURNS TRIGGER AS $$
DECLARE
    notification_payload JSON;
BEGIN
    -- 构建通知载荷
    IF TG_OP = 'INSERT' THEN
        notification_payload = json_build_object(
            'operation', 'PLAYER_JOINED',
            'match_id', NEW.match_id,
            'player_id', NEW.player_id,
            'seat_index', NEW.seat_index,
            'status', NEW.status,
            'timestamp', extract(epoch from now())
        );
    ELSIF TG_OP = 'UPDATE' THEN
        -- 玩家状态变化（如离开游戏）
        IF OLD.status != NEW.status THEN
            notification_payload = json_build_object(
                'operation', 'PLAYER_STATUS_CHANGED',
                'match_id', NEW.match_id,
                'player_id', NEW.player_id,
                'seat_index', NEW.seat_index,
                'status', NEW.status,
                'old_status', OLD.status,
                'timestamp', extract(epoch from now())
            );
        ELSE
            -- 状态没有变化，不发送通知
            RETURN NEW;
        END IF;
    ELSIF TG_OP = 'DELETE' THEN
        notification_payload = json_build_object(
            'operation', 'PLAYER_LEFT',
            'match_id', OLD.match_id,
            'player_id', OLD.player_id,
            'seat_index', OLD.seat_index,
            'status', OLD.status,
            'timestamp', extract(epoch from now())
        );
    END IF;

    -- 发送通知到 'match_player_changes' 频道
    PERFORM pg_notify('match_player_changes', notification_payload::text);

    -- 返回适当的记录
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- 为match_players表创建触发器（如果不存在）
DROP TRIGGER IF EXISTS trigger_match_player_insert_notify ON match_players;
CREATE TRIGGER trigger_match_player_insert_notify
    AFTER INSERT ON match_players
    FOR EACH ROW
    EXECUTE FUNCTION notify_match_player_change();

DROP TRIGGER IF EXISTS trigger_match_player_update_notify ON match_players;
CREATE TRIGGER trigger_match_player_update_notify
    AFTER UPDATE ON match_players
    FOR EACH ROW
    EXECUTE FUNCTION notify_match_player_change();

DROP TRIGGER IF EXISTS trigger_match_player_delete_notify ON match_players;
CREATE TRIGGER trigger_match_player_delete_notify
    AFTER DELETE ON match_players
    FOR EACH ROW
    EXECUTE FUNCTION notify_match_player_change();

-- 注释：
-- 使用方法：
-- 1. AI Manager需要连接到数据库并执行 LISTEN match_status_changes; 和 LISTEN match_player_changes;
-- 2. 当matches表或match_players表发生变化时，会自动发送JSON格式的通知