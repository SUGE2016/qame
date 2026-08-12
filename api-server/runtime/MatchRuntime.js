const { createState, applyMove, checkEnd, legalMoves } = require('@qame/games');
const Match = require('../models/Match');
const MatchPlayer = require('../models/MatchPlayer');
const { maybeRunAiTurn } = require('./AiTurn');

/**
 * 内存对局运行时：权威棋盘状态 + 订阅广播
 */
class MatchRuntime {
  constructor() {
    /** @type {Map<string, object>} */
    this.rooms = new Map();
    /** @type {Map<string, Set>} matchId -> Set<WebSocket> */
    this.subscribers = new Map();
  }

  getRoom(matchId) {
    return this.rooms.get(matchId) || null;
  }

  subscribe(matchId, ws) {
    if (!this.subscribers.has(matchId)) {
      this.subscribers.set(matchId, new Set());
    }
    this.subscribers.get(matchId).add(ws);
  }

  unsubscribe(matchId, ws) {
    const set = this.subscribers.get(matchId);
    if (!set) return;
    set.delete(ws);
    if (set.size === 0) this.subscribers.delete(matchId);
  }

  unsubscribeAll(ws) {
    for (const [matchId, set] of this.subscribers.entries()) {
      if (set.delete(ws) && set.size === 0) {
        this.subscribers.delete(matchId);
      }
    }
  }

  broadcast(matchId, message) {
    const set = this.subscribers.get(matchId);
    if (!set) return;
    const payload = JSON.stringify(message);
    for (const ws of set) {
      if (ws.readyState === 1) {
        try {
          ws.send(payload);
        } catch (err) {
          console.error('[MatchRuntime] broadcast failed:', err.message);
        }
      }
    }
  }

  buildPublicState(room) {
    return {
      type: room.result ? 'end' : 'state',
      matchId: room.matchId,
      gameId: room.gameId,
      G: room.G,
      turn: room.turn,
      players: room.players,
      status: room.status,
      result: room.result || null,
    };
  }

  /**
   * 开局：从 DB 拉座位，初始化棋盘
   */
  async startMatch(matchId) {
    const match = await Match.findById(matchId);
    if (!match) throw new Error('Match不存在');

    const dbPlayers = await MatchPlayer.findByMatchId(matchId);
    const players = dbPlayers.map((p) => ({
      seatIndex: p.seat_index,
      playerId: p.player_id,
      playerType: p.player_type,
      playerName: p.player_name,
      userId: p.user_id,
      clientEndpoint: p.client_endpoint || null,
    }));

    const G = createState(match.game_id, { matchId });
    const room = {
      matchId,
      gameId: match.game_id,
      G,
      turn: '0',
      players,
      status: 'playing',
      result: null,
      aiBusy: false,
      ply: 0,
      moves: [],
    };

    this.rooms.set(matchId, room);
    await Match.updateStatus(matchId, 'playing');

    const stateMsg = this.buildPublicState(room);
    // end 与 state 统一用 state 推一次开局
    this.broadcast(matchId, { ...stateMsg, type: 'state' });

    // 若 0 号是 AI，立刻走一手
    setImmediate(() => maybeRunAiTurn(this, matchId));

    return room;
  }

  destroyMatch(matchId) {
    this.rooms.delete(matchId);
    this.subscribers.delete(matchId);
  }

  /**
   * 落子
   * @param {{ allowAi?: boolean, asSeat?: boolean }} opts
   *   allowAi: 回调型 AI（平台代下）
   *   asSeat: 持有 seatToken 的主动选手（含无 endpoint 的 AI 座）
   */
  async playMove(matchId, seatIndex, move, { allowAi = false, asSeat = false } = {}) {
    const room = this.rooms.get(matchId);
    if (!room) return { error: '对局未在运行中（请先开始游戏）' };
    if (room.status !== 'playing' || room.result) {
      return { error: '对局已结束' };
    }

    const seat = String(seatIndex);
    if (room.turn !== seat) {
      return { error: '还没轮到该玩家' };
    }

    const player = room.players.find((p) => String(p.seatIndex) === seat);
    if (!player) return { error: '座位不存在' };
    if (player.playerType === 'ai' && !allowAi && !asSeat) {
      return { error: 'AI 座位不能由客户端直接落子' };
    }

    const applied = applyMove(room.gameId, room.G, seat, move);
    if (applied.error) return { error: applied.error };

    room.G = applied.G;
    room.ply = (room.ply || 0) + 1;
    const moveRecord = { ply: room.ply, seatIndex: Number(seat), move };
    room.moves.push(moveRecord);
    try {
      await Match.appendMove(matchId, room.ply, Number(seat), move);
    } catch (err) {
      console.error('[MatchRuntime] appendMove failed:', err.message);
    }

    const result = checkEnd(room.gameId, room.G);
    if (result) {
      room.result = result;
      room.status = 'finished';
      try {
        await Match.finishWithResult(matchId, result);
      } catch (err) {
        console.error('[MatchRuntime] finishWithResult failed:', err.message);
      }
      const endMsg = this.buildPublicState(room);
      this.broadcast(matchId, { ...endMsg, type: 'end' });
      this.broadcast(matchId, { ...endMsg, type: 'state' });
      return { room };
    }

    // 切换回合（两人局）
    room.turn = seat === '0' ? '1' : '0';
    const stateMsg = this.buildPublicState(room);
    this.broadcast(matchId, { ...stateMsg, type: 'state' });

    setImmediate(() => maybeRunAiTurn(this, matchId));
    return { room };
  }

  getLegalMoves(matchId) {
    const room = this.rooms.get(matchId);
    if (!room) return [];
    return legalMoves(room.gameId, room.G, room.turn);
  }
}

const matchRuntime = new MatchRuntime();
module.exports = { matchRuntime, MatchRuntime };
