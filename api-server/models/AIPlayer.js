const { query } = require('../config/database');

class AIPlayerModel {
  // 创建AI选手
  static async create(playerData) {
    try {
      const {
        player_name,
        ai_client_id,
        status = 'active'
      } = playerData;

      const result = await query(`
        INSERT INTO ai_players (
          player_name, ai_client_id, status, created_at, updated_at
        ) VALUES ($1, $2, $3, NOW(), NOW())
        RETURNING *
      `, [player_name, ai_client_id, status]);

      return result.rows[0];
    } catch (error) {
      console.error('创建AI选手失败:', error);
      throw error;
    }
  }

  // 更新AI选手信息
  static async update(playerId, updateData) {
    try {
      const {
        player_name,
        status
      } = updateData;

      const setClause = ['updated_at = NOW()'];
      const values = [playerId];
      let paramIndex = 2;

      if (player_name !== undefined) {
        setClause.push(`player_name = $${paramIndex}`);
        values.push(player_name);
        paramIndex++;
      }

      if (status !== undefined) {
        setClause.push(`status = $${paramIndex}`);
        values.push(status);
        paramIndex++;
      }

      const result = await query(`
        UPDATE ai_players 
        SET ${setClause.join(', ')}
        WHERE id = $1
        RETURNING *
      `, values);

      return result.rows[0];
    } catch (error) {
      console.error('更新AI选手失败:', error);
      throw error;
    }
  }

  // 删除AI选手
  static async delete(playerId) {
    try {
      const result = await query(`
        DELETE FROM ai_players WHERE id = $1 RETURNING *
      `, [playerId]);

      return result.rows[0];
    } catch (error) {
      console.error('删除AI选手失败:', error);
      throw error;
    }
  }

  // 获取所有AI选手  
  static async getAll() {
    try {
      const result = await query(`
        SELECT 
          ap.*,
          ac.name as client_name,
          ac.endpoint as client_endpoint
        FROM ai_players ap
        LEFT JOIN ai_clients ac ON ap.ai_client_id = ac.id
        ORDER BY ap.created_at DESC
      `);

      return result.rows;
    } catch (error) {
      console.error('获取AI选手列表失败:', error);
      throw error;
    }
  }

  // 根据ID获取AI选手
  static async getById(playerId) {
    try {
      const result = await query(`
        SELECT 
          ap.*,
          ac.name as client_name,
          ac.endpoint as client_endpoint,
          ac.supported_games as client_supported_games
        FROM ai_players ap
        LEFT JOIN ai_clients ac ON ap.ai_client_id = ac.id
        WHERE ap.id = $1
      `, [playerId]);

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return row;
    } catch (error) {
      console.error('获取AI选手失败:', error);
      throw error;
    }
  }

  // 根据选手名称获取AI选手
  static async getByName(playerName) {
    try {
      const result = await query(`
        SELECT 
          ap.*,
          ac.name as client_name,
          ac.endpoint as client_endpoint,
          ac.supported_games as client_supported_games
        FROM ai_players ap
        LEFT JOIN ai_clients ac ON ap.ai_client_id = ac.id
        WHERE ap.player_name = $1
      `, [playerName]);

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return row;
    } catch (error) {
      console.error('根据名称获取AI选手失败:', error);
      throw error;
    }
  }

  // 根据AI客户端ID获取所有选手
  static async getByClientId(clientId) {
    try {
      const result = await query(`
        SELECT 
          ap.*,
          ac.name as client_name,
          ac.endpoint as client_endpoint
        FROM ai_players ap
        LEFT JOIN ai_clients ac ON ap.ai_client_id = ac.id
        WHERE ap.ai_client_id = $1
        ORDER BY ap.created_at DESC
      `, [clientId]);

      return result.rows;
    } catch (error) {
      console.error('根据客户端ID获取AI选手失败:', error);
      throw error;
    }
  }

  // 获取活跃的AI选手
  static async getActive() {
    try {
      const result = await query(`
        SELECT 
          ap.*,
          ac.name as client_name,
          ac.endpoint as client_endpoint
        FROM ai_players ap
        LEFT JOIN ai_clients ac ON ap.ai_client_id = ac.id
        WHERE ap.status = 'active'
        ORDER BY ap.created_at DESC
      `);

      return result.rows;
    } catch (error) {
      console.error('获取活跃AI选手失败:', error);
      throw error;
    }
  }

  // 检查AI选手是否支持指定游戏
  static async supportsGame(playerId, gameType) {
    try {
      const player = await this.getById(playerId);
      if (!player) {
        return false;
      }
      
      return player.client_supported_games && player.client_supported_games.includes(gameType);
    } catch (error) {
      console.error('检查AI选手游戏支持失败:', error);
      return false;
    }
  }
}

module.exports = AIPlayerModel;
