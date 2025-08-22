const db = require('../config/database');

/**
 * 统一选手模型 - 管理所有类型的选手（人类、AI）
 * 这个模型消除了到处判断player_type的复杂性
 */
class Player {
  /**
   * 创建选手
   */
  static async create(playerData) {
    const { player_name, player_type, user_id, ai_player_id, status = 'active' } = playerData;
    
    const query = `
      INSERT INTO players (player_name, player_type, user_id, ai_player_id, status)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;
    
    const result = await db.query(query, [player_name, player_type, user_id, ai_player_id, status]);
    return result.rows[0];
  }

  /**
   * 根据ID获取选手（包含详细信息）
   */
  static async getById(playerId) {
    const query = `
      SELECT 
        p.*,
        -- 人类选手信息
        u.username as user_username,
        u.role as user_role,
        -- AI选手信息
        ap.player_name as ai_original_name,
        ac.name as ai_client_name,
        ac.endpoint as ai_client_endpoint,
        ac.supported_games as ai_client_supported_games
      FROM players p
      LEFT JOIN users u ON p.user_id = u.id
      LEFT JOIN ai_players ap ON p.ai_player_id = ap.id
      LEFT JOIN ai_clients ac ON ap.ai_client_id = ac.id
      WHERE p.id = $1
    `;
    
    const result = await db.query(query, [playerId]);
    return result.rows[0];
  }

  /**
   * 获取所有选手
   */
  static async getAll(filters = {}) {
    const { player_type, status, limit, offset } = filters;
    
    let whereClause = '';
    const params = [];
    let paramIndex = 1;
    
    if (player_type) {
      whereClause += ` AND p.player_type = $${paramIndex}`;
      params.push(player_type);
      paramIndex++;
    }
    
    if (status) {
      whereClause += ` AND p.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }
    
    const query = `
      SELECT 
        p.*,
        -- 保持兼容性的字段名
        COALESCE(u.username, p.player_name) as username,
        COALESCE(u.role, 'ai') as role,
        CASE WHEN p.status = 'active' THEN true ELSE false END as is_online,
        -- 人类选手信息
        u.username as user_username,
        u.role as user_role,
        -- AI选手信息
        ac.name as ai_client_name,
        ac.endpoint as ai_client_endpoint
      FROM players p
      LEFT JOIN users u ON p.user_id = u.id
      LEFT JOIN ai_players ap ON p.ai_player_id = ap.id
      LEFT JOIN ai_clients ac ON ap.ai_client_id = ac.id
      WHERE 1=1 ${whereClause}
      ORDER BY p.created_at DESC
      ${limit ? `LIMIT $${paramIndex}` : ''}
      ${offset ? `OFFSET $${paramIndex + (limit ? 1 : 0)}` : ''}
    `;
    
    if (limit) params.push(limit);
    if (offset) params.push(offset);
    
    const result = await db.query(query, params);
    return result.rows;
  }

  /**
   * 获取在线选手（人类在线 + AI活跃）
   */
  static async getOnlinePlayers() {
    const query = `
      SELECT 
        p.*,
        -- 保持兼容性的字段名
        COALESCE(u.username, p.player_name) as username,
        COALESCE(u.role, 'ai') as role,
        ac.name as ai_client_name,
        ac.endpoint as ai_client_endpoint,
        -- 统一的在线状态判断
        CASE 
          WHEN p.status = 'active' THEN 'online'
          ELSE 'offline'
        END as online_status,
        -- 额外的兼容字段
        u.username as user_username,
        u.role as user_role
      FROM players p
      LEFT JOIN users u ON p.user_id = u.id
      LEFT JOIN ai_players ap ON p.ai_player_id = ap.id
      LEFT JOIN ai_clients ac ON ap.ai_client_id = ac.id
      WHERE 
        p.status = 'active'
      ORDER BY p.created_at DESC
    `;
    
    const result = await db.query(query);
    return result.rows;
  }

  /**
   * 根据用户ID获取人类选手
   */
  static async getByUserId(userId) {
    const query = `
      SELECT * FROM players 
      WHERE user_id = $1 AND player_type = 'human'
    `;
    
    const result = await db.query(query, [userId]);
    return result.rows[0];
  }

  /**
   * 根据AI选手ID获取AI选手
   */
  static async getByAIPlayerId(aiPlayerId) {
    const query = `
      SELECT * FROM players 
      WHERE ai_player_id = $1 AND player_type = 'ai'
    `;
    
    const result = await db.query(query, [aiPlayerId]);
    return result.rows[0];
  }

  /**
   * 更新选手状态
   */
  static async updateStatus(playerId, status) {
    const query = `
      UPDATE players 
      SET status = $1, updated_at = CURRENT_TIMESTAMP 
      WHERE id = $2
      RETURNING *
    `;
    
    const result = await db.query(query, [status, playerId]);
    return result.rows[0];
  }

  /**
   * 用户上线时激活对应的人类选手
   */
  static async setUserOnline(userId) {
    const query = `
      UPDATE players 
      SET status = 'active', updated_at = CURRENT_TIMESTAMP 
      WHERE user_id = $1 AND player_type = 'human'
      RETURNING *
    `;
    
    const result = await db.query(query, [userId]);
    return result.rows[0];
  }

  /**
   * 用户离线时设置对应的人类选手为离线
   */
  static async setUserOffline(userId) {
    const query = `
      UPDATE players 
      SET status = 'offline', updated_at = CURRENT_TIMESTAMP 
      WHERE user_id = $1 AND player_type = 'human'
      RETURNING *
    `;
    
    const result = await db.query(query, [userId]);
    return result.rows[0];
  }

  /**
   * 获取选手统计信息
   */
  static async getStats() {
    const query = `
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN player_type = 'human' THEN 1 END) as human_total,
        COUNT(CASE WHEN player_type = 'ai' THEN 1 END) as ai_total,
        COUNT(CASE 
          WHEN player_type = 'human' AND status = 'active' THEN 1 
          WHEN player_type = 'ai' AND status = 'active' THEN 1 
        END) as active_total,
        COUNT(CASE 
          WHEN player_type = 'human' AND status = 'active' THEN 1 
        END) as human_active,
        COUNT(CASE 
          WHEN player_type = 'ai' AND status = 'active' THEN 1 
        END) as ai_active
      FROM players
    `;
    
    const result = await db.query(query);
    return result.rows[0];
  }

  /**
   * 删除选手
   */
  static async delete(playerId) {
    const query = `DELETE FROM players WHERE id = $1 RETURNING *`;
    const result = await db.query(query, [playerId]);
    return result.rows[0];
  }
}

module.exports = Player;
