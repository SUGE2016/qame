const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { ok, badRequest, forbidden, notFound, serverError } = require('./_base');
const Game = require('../models/Game');
const Match = require('../models/Match');
const MatchPlayer = require('../models/MatchPlayer');
const { query } = require('../config/database');
const { matchRuntime } = require('../runtime/MatchRuntime');

function issueSeatToken() {
  return crypto.randomBytes(24).toString('hex');
}

const router = express.Router();

// 更新 match 状态（内部 / 兼容）
router.put('/:matchId/status', async (req, res) => {
  try {
    const { matchId } = req.params;
    const { status } = req.body;
    if (!status) return badRequest(res, '缺少status参数');
    await Match.updateStatus(matchId, status);
    if (status === 'finished' || status === 'cancelled') {
      matchRuntime.destroyMatch(matchId);
    }
    return ok(res, { matchId, status }, 'Match状态更新成功');
  } catch (error) {
    console.error('更新状态失败:', error);
    return serverError(res, '更新状态失败');
  }
});

router.use(authenticateToken);

router.get('/', async (req, res) => {
  try {
    const { gameId, status, includeMyMatches } = req.query;
    const filters = {};
    if (gameId) filters.gameId = gameId;
    if (status) filters.status = status;

    let matches;
    if (includeMyMatches === 'true') {
      matches = await Match.findActiveByUser(req.user.id);
    } else {
      matches = await Match.findAll(filters);
    }

    const matchesWithPlayers = await Promise.all(
      matches.map(async (match) => {
        const players = await MatchPlayer.findByMatchId(match.id);
        return {
          ...match,
          players: players.map((p) => p.getDisplayInfo()),
          currentPlayerCount: players.length,
        };
      })
    );
    return ok(res, matchesWithPlayers, '获取match列表成功');
  } catch (error) {
    console.error('获取match列表失败:', error);
    return serverError(res, '获取match列表失败');
  }
});

router.post('/', async (req, res) => {
  try {
    const { gameId, gameConfig = {} } = req.body;
    if (!gameId) return badRequest(res, '游戏Id不能为空');

    const game = await Game.findByIdAndStatus(gameId, 'active');
    if (!game) return notFound(res, `游戏${gameId}不存在或者未激活`);

    const matchId = uuidv4();
    const match = await Match.create({
      id: matchId,
      gameId,
      creatorId: req.user.id,
      maxPlayers: game.max_players,
      minPlayers: game.min_players,
      gameConfig,
    });

    return ok(res, match, 'Match创建成功');
  } catch (error) {
    console.error('创建match失败:', error);
    return serverError(res, '创建match失败');
  }
});

// 兼容旧前端：返回座位信息（不再提供 bgio credentials）
router.get('/:matchId/credentials', async (req, res) => {
  try {
    const { matchId } = req.params;
    const result = await MatchPlayer.findByUserIdAndMatchId(req.user.id, matchId);
    if (!result) return notFound(res, '您不在此match中');
    return ok(res, {
      playerCredentials: null,
      playerID: result.seat_index.toString(),
    }, '获取座位成功');
  } catch (error) {
    console.error('获取credentials失败:', error);
    return serverError(res, '获取座位失败');
  }
});

router.get('/:matchId', async (req, res) => {
  try {
    const { matchId } = req.params;
    const match = await Match.findByIdWithPlayers(matchId);
    if (!match) return notFound(res, 'Match不存在');

    const runtime = matchRuntime.getRoom(matchId);
    return ok(res, {
      ...match,
      players: match.players.map((p) => new MatchPlayer(p).getDisplayInfo()),
      currentPlayerCount: match.players.length,
      runtime: runtime
        ? {
            turn: runtime.turn,
            status: runtime.status,
            result: runtime.result,
            G: runtime.G,
          }
        : null,
    }, '获取match详情成功');
  } catch (error) {
    console.error('获取match详情失败:', error);
    return serverError(res, '获取match详情失败');
  }
});

router.delete('/:matchId', async (req, res) => {
  try {
    const { matchId } = req.params;
    const isCreator = await Match.isCreator(matchId, req.user.id);
    if (!isCreator && req.user.role !== 'admin') {
      return forbidden(res, '没有权限删除此match');
    }
    const match = await Match.findById(matchId);
    if (!match) return notFound(res, 'Match不存在');

    matchRuntime.destroyMatch(matchId);
    await Match.delete(matchId);
    return ok(res, null, 'Match删除成功');
  } catch (error) {
    console.error('删除match失败:', error);
    return serverError(res, '删除match失败');
  }
});

router.post('/:matchId/players', async (req, res) => {
  try {
    const { matchId } = req.params;
    const { playerId, seatIndex } = req.body;
    if (!playerId) return badRequest(res, '必须提供playerId');

    const match = await Match.findById(matchId);
    if (!match) return notFound(res, 'Match不存在');
    if (match.status !== 'waiting') return badRequest(res, '只能在等待状态下添加玩家');

    const result = await query('SELECT * FROM players WHERE id = $1', [playerId]);
    if (result.rows.length === 0) return notFound(res, '玩家不存在');
    const player = result.rows[0];

    const isCreator = await Match.isCreator(matchId, req.user.id);
    const isOwnPlayer = player.user_id === req.user.id;
    if (!isCreator && !isOwnPlayer) {
      return forbidden(res, '没有权限添加该玩家');
    }

    const activeMatches = await MatchPlayer.findActiveMatchesByPlayerId(playerId);
    if (activeMatches.length > 0) {
      return badRequest(res, '该玩家已在其他match中');
    }

    const addedPlayer = await MatchPlayer.addPlayerById(matchId, playerId, seatIndex);
    const seatToken = issueSeatToken();
    await MatchPlayer.updatePlayerCredentialsByPlayerId(addedPlayer.id, seatToken);

    return ok(res, {
      ...addedPlayer.getDisplayInfo(),
      seatToken, // 主动选手参赛凭证；请交给 Agent / CLI，勿写入前端公开列表
    }, '玩家添加成功');
  } catch (error) {
    console.error('添加玩家失败:', error);
    return serverError(res, error.message || '添加玩家失败');
  }
});

router.delete('/:matchId/players/:playerId', async (req, res) => {
  try {
    const { matchId, playerId } = req.params;
    const match = await Match.findById(matchId);
    if (!match) return notFound(res, 'Match不存在');

    const player = await MatchPlayer.findById(playerId);
    if (!player || player.match_id !== matchId) return notFound(res, '玩家不存在');

    const isCreator = await Match.isCreator(matchId, req.user.id);
    if (!player.canBeRemoved(req.user.id, isCreator)) {
      return forbidden(res, '没有权限移除此玩家');
    }

    await MatchPlayer.removePlayer(matchId, player.id);
    return ok(res, null, '玩家移除成功');
  } catch (error) {
    console.error('移除玩家失败:', error);
    return serverError(res, '移除玩家失败');
  }
});

router.post('/:matchId/start', async (req, res) => {
  try {
    const { matchId } = req.params;
    const match = await Match.findById(matchId);
    if (!match) return notFound(res, 'Match不存在');

    const isCreator = await Match.isCreator(matchId, req.user.id);
    if (!isCreator) return forbidden(res, '只有创建者可以开始游戏');

    const startCheck = await Match.canStart(matchId);
    if (!startCheck.canStart) return badRequest(res, startCheck.reason);

    if (matchRuntime.getRoom(matchId)) {
      return badRequest(res, '对局已在进行中');
    }

    await matchRuntime.startMatch(matchId);
    return ok(res, null, '游戏开始');
  } catch (error) {
    console.error('开始游戏失败:', error);
    return serverError(res, error.message || '开始游戏失败');
  }
});

router.post('/:matchId/check-game-status', async (req, res) => {
  try {
    const { matchId } = req.params;
    const match = await Match.findById(matchId);
    if (!match) return notFound(res, 'Match不存在');

    const room = matchRuntime.getRoom(matchId);
    if (!room) {
      return ok(res, { status: match.status }, '无运行时状态');
    }
    return ok(res, {
      status: room.status,
      turn: room.turn,
      result: room.result,
      G: room.G,
    }, 'ok');
  } catch (error) {
    console.error('检查游戏状态失败:', error);
    return serverError(res, '检查游戏状态失败');
  }
});

router.post('/:matchId/cancel', async (req, res) => {
  try {
    const { matchId } = req.params;
    const match = await Match.findById(matchId);
    if (!match) return notFound(res, 'Match不存在');

    const isCreator = await Match.isCreator(matchId, req.user.id);
    if (!isCreator && req.user.role !== 'admin') {
      return forbidden(res, '只有创建者可以取消游戏');
    }
    if (match.status === 'finished') {
      return badRequest(res, '已结束的游戏不能取消');
    }

    matchRuntime.destroyMatch(matchId);
    await Match.updateStatus(matchId, 'cancelled');
    return ok(res, null, '游戏已取消');
  } catch (error) {
    console.error('取消游戏失败:', error);
    return serverError(res, '取消游戏失败');
  }
});

module.exports = router;
