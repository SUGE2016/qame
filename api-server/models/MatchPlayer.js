const { query } = require('../config/database');

class MatchPlayer {
  constructor(data) {
    Object.assign(this, data);
  }

  // 获取match的所有玩家
  static async findByMatchId(matchId) {
    const result = await query(`
      SELECT 
        mp.*,
        p.user_id,
        u.username as user_name,
        p.ai_player_id,
        ac.endpoint as client_endpoint,
        ac.name as ai_client_name
      FROM match_players mp
      LEFT JOIN players p ON mp.player_id = p.id
      LEFT JOIN users u ON p.user_id = u.id
      LEFT JOIN ai_players ap ON p.ai_player_id = ap.id
      LEFT JOIN ai_clients ac ON ap.ai_client_id = ac.id
      WHERE mp.match_id = $1
      ORDER BY mp.seat_index
    `, [matchId]);

    return result.rows.map(row => new MatchPlayer(row));
  }

  // 根据ID获取玩家
  static async findById(playerId) {
    const result = await query(`
      SELECT 
        mp.*,
        p.user_id,
        u.username as user_name,
        p.ai_player_id,
        ac.endpoint as client_endpoint,
        ac.name as ai_client_name
      FROM match_players mp
      LEFT JOIN players p ON mp.player_id = p.id
      LEFT JOIN users u ON p.user_id = u.id
      LEFT JOIN ai_players ap ON p.ai_player_id = ap.id
      LEFT JOIN ai_clients ac ON ap.ai_client_id = ac.id
      WHERE mp.id = $1
    `, [playerId]);

    return result.rows.length > 0 ? new MatchPlayer(result.rows[0]) : null;
  }

  // 移除玩家
  static async removePlayer(matchId, playerId) {
    const result = await query(`
      DELETE FROM match_players 
      WHERE match_id = $1 AND id = $2
      RETURNING *
    `, [matchId, playerId]);

    return result.rows.length > 0 ? new MatchPlayer(result.rows[0]) : null;
  }

  // 通过座位索引移除玩家
  static async removePlayerBySeat(matchId, seatIndex) {
    const result = await query(`
      DELETE FROM match_players 
      WHERE match_id = $1 AND seat_index = $2
      RETURNING *
    `, [matchId, seatIndex]);

    return result.rows.length > 0 ? new MatchPlayer(result.rows[0]) : null;
  }

  // 检查座位是否可用
  static async isSeatAvailable(matchId, seatIndex) {
    // 读取match最大席位，防止越界
    const matchRes = await query('SELECT max_players FROM matches WHERE id = $1', [matchId]);
    const maxPlayers = matchRes.rows.length ? parseInt(matchRes.rows[0].max_players) : 0;
    if (seatIndex < 0 || seatIndex >= maxPlayers) return false;

    const result = await query(
      'SELECT 1 FROM match_players WHERE match_id = $1 AND seat_index = $2',
      [matchId, seatIndex]
    );
    return result.rows.length === 0;
  }

  // 获取用户在match中的玩家信息（包括已离开的玩家，按加入时间倒序）
  static async findByUserAndMatch(userId, matchId) {
    const result = await query(`
      SELECT * FROM match_players 
      WHERE user_id = $1 AND match_id = $2
      ORDER BY joined_at DESC
      LIMIT 1
    `, [userId, matchId]);

    return result.rows.length > 0 ? new MatchPlayer(result.rows[0]) : null;
  }

  // 检查用户是否在match中
  static async isUserInMatch(userId, matchId) {
    const result = await query(
      'SELECT 1 FROM match_players WHERE user_id = $1 AND match_id = $2',
      [userId, matchId]
    );
    return result.rows.length > 0;
  }

  // 获取下一个可用座位
  static async getNextAvailableSeat(matchId) {
    // 获取最大玩家数
    const matchRes = await query('SELECT max_players FROM matches WHERE id = $1', [matchId]);
    if (!matchRes.rows.length) return -1;
    const maxPlayers = parseInt(matchRes.rows[0].max_players);

    // 查询当前占用的座位
    const occRes = await query(
      'SELECT seat_index FROM match_players WHERE match_id = $1 ORDER BY seat_index',
      [matchId]
    );
    const occupied = new Set(occRes.rows.map(r => parseInt(r.seat_index)));

    // 返回第一个空位 [0, maxPlayers-1]
    for (let i = 0; i < maxPlayers; i++) {
      if (!occupied.has(i)) return i;
    }
    return -1;
  }

  // 检查AI客户端是否存在
  static async checkAIClientExists(clientId) {
    const result = await query('SELECT * FROM ai_clients WHERE id = $1 AND status = $2', [clientId, 'active']);
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  // 检查AI玩家是否已存在
  static async checkAIExists(matchId, playerId) {
    const result = await query(`
      SELECT * FROM match_players 
      WHERE match_id = $1 AND player_id = $2
    `, [matchId, playerId]);
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  // 获取用户在match中的凭证
  static async getCredentialsByUser(matchId, userId) {
    const result = await query(
      'SELECT player_credentials, seat_index FROM match_players WHERE match_id = $1 AND user_id = $2',
      [matchId, userId]
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  // 通过bgio_match_id获取用户凭证
  static async getCredentialsByBgioMatchId(bgioMatchId, userId) {
    const result = await query(`
      SELECT mp.player_credentials, mp.seat_index 
      FROM match_players mp 
      JOIN matches m ON mp.match_id = m.id 
      WHERE m.bgio_match_id = $1 AND mp.user_id = $2
    `, [bgioMatchId, userId]);
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  // 根据用户ID和match ID查找玩家（通过统一玩家表关联）
  static async findByUserIdAndMatchId(userId, matchId) {
    const result = await query(`
      SELECT mp.player_credentials, mp.seat_index 
      FROM match_players mp 
      JOIN players p ON mp.player_id = p.id 
      WHERE mp.match_id = $1 AND p.user_id = $2 AND p.player_type = 'human'
    `, [matchId, userId]);
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  // 通过bgio_match_id和用户ID查找玩家（通过统一玩家表关联）
  static async findByBgioMatchIdAndUserId(bgioMatchId, userId) {
    const result = await query(`
      SELECT mp.player_credentials, mp.seat_index 
      FROM match_players mp 
      JOIN matches m ON mp.match_id = m.id 
      JOIN players p ON mp.player_id = p.id 
      WHERE m.bgio_match_id = $1 AND p.user_id = $2 AND p.player_type = 'human'
    `, [bgioMatchId, userId]);
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  // 查找用户的活跃matches
  static async findActiveMatchesByUserId(userId) {
    const result = await query(`
      SELECT m.id as match_id, m.game_id, mp.seat_index
      FROM match_players mp
      JOIN matches m ON mp.match_id = m.id
      JOIN players p ON mp.player_id = p.id
      WHERE p.user_id = $1 
      AND mp.status = 'joined' 
      AND m.status IN ('waiting', 'playing')
    `, [userId]);
    return result.rows;
  }

  // 查找玩家的活跃matches（统一接口）
  static async findActiveMatchesByPlayerId(playerId) {
    const result = await query(`
      SELECT m.id as match_id, m.game_id, mp.seat_index
      FROM match_players mp
      JOIN matches m ON mp.match_id = m.id
      WHERE mp.player_id = $1 
      AND mp.status = 'joined' 
      AND m.status IN ('waiting', 'playing')
    `, [playerId]);
    return result.rows;
  }

  // 通过player_id添加玩家（统一接口）
  static async addPlayerById(matchId, playerId, seatIndex, data = {}) {
    // 获取玩家信息
    const playerResult = await query('SELECT * FROM players WHERE id = $1', [playerId]);
    if (playerResult.rows.length === 0) {
      throw new Error('Player not found');
    }
    const player = playerResult.rows[0];

    // 检查座位是否可用
    if (seatIndex !== undefined && seatIndex !== null) {
      const isSeatAvailable = await this.isSeatAvailable(matchId, seatIndex);
      if (!isSeatAvailable) {
        throw new Error('Seat already taken');
      }
    } else {
      seatIndex = await this.getNextAvailableSeat(matchId);
      if (seatIndex === -1) {
        throw new Error('Match is full');
      }
    }

    // 添加玩家到match
    const result = await query(`
      INSERT INTO match_players (match_id, seat_index, player_type, player_id, player_name, status)
      VALUES ($1, $2, $3, $4, $5, 'joined')
      RETURNING *
    `, [matchId, seatIndex, player.player_type, playerId, player.player_name]);

    return new MatchPlayer(result.rows[0]);
  }

  // 按玩家记录ID更新凭证（用于AI或无userId的场景）
  static async updatePlayerCredentialsByPlayerId(playerId, playerCredentials) {
    const result = await query(
      'UPDATE match_players SET player_credentials = $1 WHERE id = $2 RETURNING *',
      [playerCredentials, playerId]
    );
    return result.rows.length > 0 ? new MatchPlayer(result.rows[0]) : null;
  }

  // 查找match的第一个玩家
  static async findFirstPlayerByMatchId(matchId) {
    const result = await query(
      'SELECT seat_index, player_name, player_type FROM match_players WHERE match_id = $1 ORDER BY seat_index LIMIT 1',
      [matchId]
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  // 更新玩家状态
  static async updateStatus(playerId, status) {
    const result = await query(`
      UPDATE match_players 
      SET status = $1
      WHERE id = $2
      RETURNING *
    `, [status, playerId]);

    return result.rows.length > 0 ? new MatchPlayer(result.rows[0]) : null;
  }

  // 获取玩家的显示信息（用于前端显示）
  getDisplayInfo() {
    return {
      id: this.id,
      seatIndex: this.seat_index,
      playerId: this.player_id,
      playerType: this.player_type,
      playerName: this.player_name,
      status: this.status,
      aiClientName: this.ai_client_name,
      clientEndpoint: this.client_endpoint,
      userName: this.user_name,
      userId: this.user_id,
      joinedAt: this.joined_at
    };
  }

  // 检查玩家是否可以被移除 - 统一权限逻辑，不区分玩家类型
  canBeRemoved(requestUserId, isCreator) {
    // 创建者可以移除任何玩家
    if (isCreator) {
      return true;
    }
    
    // 玩家可以移除自己（仅限人类玩家有user_id）
    return this.user_id === requestUserId;
  }
}

module.exports = MatchPlayer;