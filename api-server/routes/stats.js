const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const Match = require('../models/Match');
const { matchRuntime } = require('../runtime/MatchRuntime');
const { ok, notFound, serverError } = require('./_base');

const router = express.Router();

router.use(authenticateToken);

/**
 * GET /api/stats/me?period=today|all
 * 今日战报 / 我的战绩（US-8）
 */
router.get('/me', async (req, res) => {
  try {
    const period = req.query.period || 'today';
    let since = null;
    if (period === 'today') {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      since = d.toISOString();
    }
    const stats = await Match.statsForUser(req.user.id, { since });
    return ok(res, { period, ...stats }, 'ok');
  } catch (error) {
    console.error('[stats] me failed:', error);
    return serverError(res, '获取统计失败');
  }
});

/**
 * GET /api/stats/leaderboard?gameId=&limit=
 * 简易排行（US-9）
 */
router.get('/leaderboard', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '20', 10) || 20, 100);
    const gameId = req.query.gameId || undefined;
    const rows = await Match.leaderboard({ gameId, limit });
    return ok(res, { gameId: gameId || null, rankings: rows }, 'ok');
  } catch (error) {
    console.error('[stats] leaderboard failed:', error);
    return serverError(res, '获取排行失败');
  }
});

/**
 * GET /api/stats/matches/:matchId/history
 * 复盘手顺（US-10）；含观战只读局面（US-3）
 */
router.get('/matches/:matchId/history', async (req, res) => {
  try {
    const { matchId } = req.params;
    const match = await Match.findByIdWithPlayers(matchId);
    if (!match) return notFound(res, 'Match不存在');

    const moves = await Match.getMoves(matchId);
    const room = matchRuntime.getRoom(matchId);

    return ok(res, {
      matchId,
      gameId: match.game_id,
      status: match.status,
      result: match.result || room?.result || null,
      players: (match.players || []).map((p) => ({
        seatIndex: p.seat_index,
        playerName: p.player_name,
        playerType: p.player_type,
      })),
      moves: moves.map((m) => ({
        ply: m.ply,
        seatIndex: m.seat_index,
        move: m.move,
        at: m.created_at,
      })),
      live: room
        ? {
            G: room.G,
            turn: room.turn,
            status: room.status,
            result: room.result,
          }
        : null,
    }, 'ok');
  } catch (error) {
    console.error('[stats] history failed:', error);
    return serverError(res, '获取复盘失败');
  }
});

module.exports = router;
