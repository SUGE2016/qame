const { query } = require('../config/database');

class Match {
  constructor(data) {
    Object.assign(this, data);
  }

  // 创建新的match
  static async create(data) {
    const {
      id,
      gameId,
      creatorId,
      maxPlayers,
      minPlayers
    } = data;

    const result = await query(`
      INSERT INTO matches (id, game_id, creator_id, max_players, min_players)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [id, gameId, creatorId, maxPlayers, minPlayers]);

    return new Match(result.rows[0]);
  }

  // 根据ID获取match
  static async findById(matchId) {
    const result = await query('SELECT * FROM matches WHERE id = $1', [matchId]);
    return result.rows.length > 0 ? new Match(result.rows[0]) : null;
  }

  // 获取match列表
  static async findAll(filters = {}) {
    let whereClause = 'WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (filters.gameId) {
      whereClause += ` AND m.game_id = $${paramIndex}`;
      params.push(filters.gameId);
      paramIndex++;
    }

    if (filters.status) {
      whereClause += ` AND m.status = $${paramIndex}`;
      params.push(filters.status);
      paramIndex++;
    }

    if (filters.creatorId) {
      whereClause += ` AND m.creator_id = $${paramIndex}`;
      params.push(filters.creatorId);
      paramIndex++;
    }

    const result = await query(`
      SELECT m.*, g.name as game_name, u.username as creator_name
      FROM matches m
      JOIN games g ON m.game_id = g.id
      JOIN users u ON m.creator_id = u.id
      ${whereClause}
      ORDER BY m.created_at DESC
    `, params);

    return result.rows.map(row => new Match(row));
  }

  // 获取match及其玩家信息
  static async findByIdWithPlayers(matchId) {
    const matchResult = await query(`
      SELECT m.*, g.name as game_name, u.username as creator_name
      FROM matches m
      JOIN games g ON m.game_id = g.id
      JOIN users u ON m.creator_id = u.id
      WHERE m.id = $1
    `, [matchId]);

    if (matchResult.rows.length === 0) {
      return null;
    }

    const match = new Match(matchResult.rows[0]);

    // 复用 MatchPlayer.findByMatchId() 获取玩家信息
    const MatchPlayer = require('./MatchPlayer');
    const players = await MatchPlayer.findByMatchId(matchId);
    match.players = players.map(p => ({
      id: p.id,
      seat_index: p.seat_index,
      player_id: p.player_id,
      player_type: p.player_type,
      player_name: p.player_name,
      status: p.status,
      user_name: p.user_name,
      user_id: p.user_id,
      client_endpoint: p.client_endpoint,
      ai_client_name: p.ai_client_name,
      joined_at: p.joined_at
    }));
    
    return match;
  }

  // 更新match状态
  static async updateStatus(matchId, status) {
    let sql = `
      UPDATE matches
      SET status = $1, updated_at = CURRENT_TIMESTAMP
    `;
    const params = [status, matchId];
    if (status === 'playing') {
      sql += `, started_at = COALESCE(started_at, CURRENT_TIMESTAMP)`;
    }
    if (status === 'finished' || status === 'cancelled') {
      sql += `, finished_at = COALESCE(finished_at, CURRENT_TIMESTAMP)`;
    }
    sql += ` WHERE id = $2 RETURNING *`;

    const result = await query(sql, params);
    if (result.rows.length === 0) {
      throw new Error('Match not found');
    }
    return new Match(result.rows[0]);
  }

  static async finishWithResult(matchId, gameResult) {
    const result = await query(`
      UPDATE matches
      SET status = 'finished',
          result = $1::jsonb,
          finished_at = COALESCE(finished_at, CURRENT_TIMESTAMP),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
    `, [JSON.stringify(gameResult || {}), matchId]);
    if (result.rows.length === 0) throw new Error('Match not found');
    return new Match(result.rows[0]);
  }

  static async appendMove(matchId, ply, seatIndex, move) {
    await query(`
      INSERT INTO match_moves (match_id, ply, seat_index, move)
      VALUES ($1, $2, $3, $4::jsonb)
      ON CONFLICT (match_id, ply) DO NOTHING
    `, [matchId, ply, seatIndex, JSON.stringify(move)]);
  }

  static async getMoves(matchId) {
    const result = await query(`
      SELECT ply, seat_index, move, created_at
      FROM match_moves
      WHERE match_id = $1
      ORDER BY ply ASC
    `, [matchId]);
    return result.rows;
  }

  /** 当前用户参与过的对局统计（含今日） */
  static async statsForUser(userId, { since } = {}) {
    const params = [userId];
    let sinceClause = '';
    if (since) {
      params.push(since);
      sinceClause = ` AND m.finished_at >= $${params.length}`;
    }

    const result = await query(`
      SELECT
        m.id,
        m.game_id,
        m.status,
        m.result,
        m.finished_at,
        m.created_at,
        mp.seat_index
      FROM matches m
      JOIN match_players mp ON mp.match_id = m.id
      JOIN players p ON p.id = mp.player_id
      WHERE p.user_id = $1
        AND p.player_type = 'human'
        AND mp.status = 'joined'
        ${sinceClause}
      ORDER BY COALESCE(m.finished_at, m.created_at) DESC
      LIMIT 200
    `, params);

    const rows = result.rows;
    let wins = 0;
    let losses = 0;
    let draws = 0;
    let playing = 0;
    let waiting = 0;
    let finished = 0;

    for (const row of rows) {
      if (row.status === 'playing') { playing++; continue; }
      if (row.status === 'waiting' || row.status === 'ready') { waiting++; continue; }
      if (row.status !== 'finished') continue;
      finished++;
      const r = row.result || {};
      if (r.draw) draws++;
      else if (r.winner !== undefined && r.winner !== null) {
        if (String(r.winner) === String(row.seat_index)) wins++;
        else losses++;
      }
    }

    return {
      totals: { wins, losses, draws, finished, playing, waiting, participated: rows.length },
      matches: rows.map((r) => ({
        id: r.id,
        gameId: r.game_id,
        status: r.status,
        result: r.result,
        seatIndex: r.seat_index,
        finishedAt: r.finished_at,
        createdAt: r.created_at,
      })),
    };
  }

  /** 简易排行：按已结束对局胜场 */
  static async leaderboard({ gameId, limit = 20 } = {}) {
    const params = [];
    let gameClause = '';
    if (gameId) {
      params.push(gameId);
      gameClause = ` AND m.game_id = $${params.length}`;
    }
    params.push(limit);

    const result = await query(`
      SELECT
        p.id AS player_id,
        p.player_name,
        p.player_type,
        u.username,
        COUNT(*) FILTER (
          WHERE m.status = 'finished'
            AND m.result->>'winner' IS NOT NULL
            AND m.result->>'winner' = mp.seat_index::text
        )::int AS wins,
        COUNT(*) FILTER (
          WHERE m.status = 'finished' AND (m.result->>'draw')::boolean IS TRUE
        )::int AS draws,
        COUNT(*) FILTER (
          WHERE m.status = 'finished'
            AND m.result->>'winner' IS NOT NULL
            AND m.result->>'winner' <> mp.seat_index::text
        )::int AS losses,
        COUNT(*) FILTER (WHERE m.status = 'finished')::int AS finished
      FROM match_players mp
      JOIN matches m ON m.id = mp.match_id
      JOIN players p ON p.id = mp.player_id
      LEFT JOIN users u ON u.id = p.user_id
      WHERE mp.status = 'joined'
        ${gameClause}
      GROUP BY p.id, p.player_name, p.player_type, u.username
      HAVING COUNT(*) FILTER (WHERE m.status = 'finished') > 0
      ORDER BY wins DESC, draws DESC, losses ASC
      LIMIT $${params.length}
    `, params);

    return result.rows;
  }

  // 删除match
  static async delete(matchId) {
    const result = await query('DELETE FROM matches WHERE id = $1 RETURNING *', [matchId]);
    return result.rows.length > 0;
  }

  // 检查用户是否是match的创建者
  static async isCreator(matchId, userId) {
    const result = await query(
      'SELECT 1 FROM matches WHERE id = $1 AND creator_id = $2',
      [matchId, userId]
    );
    return result.rows.length > 0;
  }

  // 获取match的玩家数量
  static async getPlayerCount(matchId) {
    const result = await query(
      'SELECT COUNT(*) as count FROM match_players WHERE match_id = $1',
      [matchId]
    );
    return parseInt(result.rows[0].count);
  }

  // 检查match是否可以开始
  static async canStart(matchId) {
    const match = await this.findById(matchId);
    if (!match || match.status !== 'waiting') {
      return { canStart: false, reason: 'Match不存在或状态不正确' };
    }

    const playerCount = await this.getPlayerCount(matchId);
    if (playerCount < match.min_players || playerCount > match.max_players) {
      return { canStart: false, reason: `玩家数量不符合要求 (当前${playerCount}人，需要${match.min_players}-${match.max_players}人)` };
    }

    return { canStart: true, reason: null };
  }

  // 获取用户的活跃matches
  static async findActiveByUser(userId) {
    const result = await query(`
      SELECT DISTINCT m.*, g.name as game_name
      FROM matches m
      JOIN games g ON m.game_id = g.id
      JOIN match_players mp ON m.id = mp.match_id
      WHERE (m.creator_id = $1 OR mp.user_id = $1)
        AND m.status IN ('waiting', 'ready', 'playing')

      ORDER BY m.updated_at DESC
    `, [userId]);

    return result.rows.map(row => new Match(row));
  }

  // 更新match的bgio_match_id
  static async updateBgioMatchId(matchId, bgioMatchId) {
    const result = await query('UPDATE matches SET bgio_match_id = $1 WHERE id = $2 RETURNING *', [bgioMatchId, matchId]);
    return result.rows.length > 0 ? new Match(result.rows[0]) : null;
  }

  // 获取match的AI玩家信息
  static async getAIPlayers(matchId) {
    const result = await query(`
      SELECT 
        mp.*,
        ac.endpoint as client_endpoint,
        ac.name as ai_client_name
      FROM match_players mp
      LEFT JOIN ai_players ap ON mp.player_id = ap.id
      LEFT JOIN ai_clients ac ON ap.ai_client_id = ac.id
      WHERE mp.match_id = $1 
        AND mp.player_type = 'ai' 
        AND mp.status = 'joined'
      ORDER BY mp.seat_index
    `, [matchId]);
    return result.rows;
  }

  // 根据match ID查找bgio_match_id
  static async findBgioMatchIdByMatchId(matchId) {
    const result = await query('SELECT bgio_match_id FROM matches WHERE id = $1', [matchId]);
    return result.rows.length > 0 ? result.rows[0].bgio_match_id : null;
  }

  // 预设AI类型已移除
}

module.exports = Match;