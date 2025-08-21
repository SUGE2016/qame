const { query } = require('../config/database');

class Game {
  constructor(data) {
    Object.assign(this, data);
  }

  // 根据ID和状态获取游戏
  static async findByIdAndStatus(id, status) {
    const result = await query('SELECT * FROM games WHERE id = $1 AND status = $2', [id, status]);
    return result.rows.length > 0 ? new Game(result.rows[0]) : null;
  }

  // 根据ID获取游戏
  static async findById(id) {
    const result = await query('SELECT * FROM games WHERE id = $1', [id]);
    return result.rows.length > 0 ? new Game(result.rows[0]) : null;
  }

  // 获取所有游戏
  static async findAll() {
    const result = await query('SELECT * FROM games ORDER BY created_at DESC', []);
    return result.rows.map(row => new Game(row));
  }

  // 创建新游戏
  static async create(gameData) {
    const { id, name, description, min_players, max_players, status } = gameData;
    
    if (id) {
      // 如果提供了id，使用自定义id
      const result = await query(`
        INSERT INTO games (id, name, description, min_players, max_players, status)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `, [id, name, description, min_players, max_players, status]);
      return new Game(result.rows[0]);
    } else {
      // 如果没有提供id，让数据库自动生成（但games表id是VARCHAR，需要生成字符串id）
      const generatedId = `game-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const result = await query(`
        INSERT INTO games (id, name, description, min_players, max_players, status)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `, [generatedId, name, description, min_players, max_players, status]);
      return new Game(result.rows[0]);
    }
  }

  // 更新游戏信息
  static async update(id, gameData) {
    const { name, description, min_players, max_players, status } = gameData;
    const updates = [];
    const values = [];
    let paramIndex = 1;
    
    if (name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(name);
    }
    if (description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(description);
    }
    if (min_players !== undefined) {
      updates.push(`min_players = $${paramIndex++}`);
      values.push(min_players);
    }
    if (max_players !== undefined) {
      updates.push(`max_players = $${paramIndex++}`);
      values.push(max_players);
    }
    if (status !== undefined) {
      updates.push(`status = $${paramIndex++}`);
      values.push(status);
    }
    
    if (updates.length === 0) {
      // 没有更新字段，直接返回原游戏
      return await Game.findById(id);
    }
    
    values.push(id);
    
    const sql = `UPDATE games SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`;
    
    const result = await query(sql, values);
    return result.rows.length > 0 ? new Game(result.rows[0]) : null;
  }

  // 删除游戏
  static async delete(id) {
    const result = await query('DELETE FROM games WHERE id = $1', [id]);
    return { deletedRows: result.rowCount };
  }
}

module.exports = Game;
