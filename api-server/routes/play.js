const express = require('express');
const Match = require('../models/Match');
const MatchPlayer = require('../models/MatchPlayer');
const { matchRuntime } = require('../runtime/MatchRuntime');
const { legalMoves } = require('@qame/games');
const { ok, badRequest, forbidden, notFound, serverError } = require('./_base');

const router = express.Router();

function extractSeatToken(req) {
  const auth = req.headers.authorization || '';
  if (auth.toLowerCase().startsWith('bearer ')) {
    return auth.slice(7).trim();
  }
  return req.headers['x-seat-token'] || req.query.seatToken || req.body?.seatToken || null;
}

async function loadSeat(req, res) {
  const { matchId } = req.params;
  const seatToken = extractSeatToken(req);
  if (!seatToken) {
    forbidden(res, '缺少 seatToken（Authorization: Bearer <token> 或 X-Seat-Token）');
    return null;
  }

  const match = await Match.findById(matchId);
  if (!match) {
    notFound(res, 'Match不存在');
    return null;
  }

  const seat = await MatchPlayer.findBySeatToken(matchId, seatToken);
  if (!seat) {
    forbidden(res, 'seatToken 无效或不属于此对局');
    return null;
  }

  return { match, seat, seatToken };
}

function buildPlayState(match, seat, room) {
  const seatIndex = String(seat.seat_index);
  if (!room) {
    return {
      matchId: match.id,
      gameId: match.game_id,
      status: match.status,
      seatIndex,
      playerName: seat.player_name,
      yourTurn: false,
      G: null,
      turn: null,
      legalMoves: [],
      result: null,
      players: [],
    };
  }

  const yourTurn =
    room.status === 'playing' &&
    !room.result &&
    String(room.turn) === seatIndex;

  return {
    matchId: room.matchId,
    gameId: room.gameId,
    status: room.status,
    seatIndex,
    playerName: seat.player_name,
    yourTurn,
    G: room.G,
    turn: room.turn,
    legalMoves: yourTurn ? legalMoves(room.gameId, room.G, seatIndex) : [],
    result: room.result,
    players: room.players.map((p) => ({
      seatIndex: p.seatIndex,
      playerName: p.playerName,
      playerType: p.playerType,
    })),
  };
}

/**
 * GET /api/play/:matchId
 * 选手拉取局面（轮询）
 */
router.get('/:matchId', async (req, res) => {
  try {
    const ctx = await loadSeat(req, res);
    if (!ctx) return;
    const room = matchRuntime.getRoom(ctx.match.id);
    return ok(res, buildPlayState(ctx.match, ctx.seat, room), 'ok');
  } catch (error) {
    console.error('[play] state failed:', error);
    return serverError(res, '获取对局状态失败');
  }
});

/**
 * POST /api/play/:matchId/move
 * body: { move }
 */
router.post('/:matchId/move', async (req, res) => {
  try {
    const ctx = await loadSeat(req, res);
    if (!ctx) return;

    if (req.body?.move === undefined || req.body?.move === null) {
      return badRequest(res, '缺少 move');
    }

    const result = await matchRuntime.playMove(
      ctx.match.id,
      ctx.seat.seat_index,
      req.body.move,
      { asSeat: true }
    );

    if (result.error) {
      return badRequest(res, result.error);
    }

    const room = matchRuntime.getRoom(ctx.match.id);
    return ok(res, buildPlayState(ctx.match, ctx.seat, room), '落子成功');
  } catch (error) {
    console.error('[play] move failed:', error);
    return serverError(res, '落子失败');
  }
});

module.exports = router;
