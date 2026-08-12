const express = require('express');
const router = express.Router();
const Player = require('../models/Player');
const { authenticateToken } = require('../middleware/auth');

/**
 * 统一玩家管理API - 消除player_type判断的复杂性
 * 这个API统一处理所有类型的玩家（人类、AI）
 */

// 获取当前用户的player信息
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const player = await Player.getByUserId(req.user.id);
    
    if (!player) {
      return res.status(404).json({
        code: 404,
        message: '当前用户没有对应的玩家记录',
        data: null
      });
    }
    
    res.json({
      code: 200,
      message: '获取当前用户玩家信息成功',
      data: player
    });
  } catch (error) {
    console.error('获取当前用户玩家信息失败:', error);
    res.status(500).json({
      code: 500,
      message: '服务器内部错误',
      data: null
    });
  }
});

// 确保当前用户有人类 player（MCP/CLI 入座用）
router.post('/me/ensure', authenticateToken, async (req, res) => {
  try {
    let player = await Player.getByUserId(req.user.id);
    if (!player) {
      const name = req.body?.player_name || req.user.username || `user-${req.user.id}`;
      player = await Player.create({
        player_name: name,
        player_type: 'human',
        user_id: req.user.id,
        ai_player_id: null,
        status: 'active',
      });
    }
    res.json({
      code: 200,
      message: 'ok',
      data: player,
    });
  } catch (error) {
    console.error('ensure player 失败:', error);
    res.status(500).json({
      code: 500,
      message: error.message || '服务器内部错误',
      data: null,
    });
  }
});

// 获取所有玩家
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { player_type, status, limit, offset } = req.query;
    
    const filters = {};
    if (player_type) filters.player_type = player_type;
    if (status) filters.status = status;
    if (limit) filters.limit = parseInt(limit);
    if (offset) filters.offset = parseInt(offset);
    
    const players = await Player.getAll(filters);
    
    res.json({
      code: 200,
      message: '获取玩家列表成功',
      data: {
        players,
        total: players.length
      }
    });
  } catch (error) {
    console.error('获取玩家列表失败:', error);
    res.status(500).json({
      code: 500,
      message: '服务器内部错误',
      data: null
    });
  }
});

// 根据ID获取玩家详细信息
router.get('/:playerId', authenticateToken, async (req, res) => {
  try {
    const { playerId } = req.params;
    const player = await Player.getById(playerId);
    
    if (!player) {
      return res.status(404).json({
        code: 404,
        message: '玩家不存在',
        data: null
      });
    }
    
    res.json({
      code: 200,
      message: '获取玩家信息成功',
      data: player
    });
  } catch (error) {
    console.error('获取玩家信息失败:', error);
    res.status(500).json({
      code: 500,
      message: '服务器内部错误',
      data: null
    });
  }
});

// 更新玩家状态
router.patch('/:playerId/status', authenticateToken, async (req, res) => {
  try {
    const { playerId } = req.params;
    const { status } = req.body;
    
    if (!status || !['active', 'inactive', 'offline'].includes(status)) {
      return res.status(400).json({
        code: 400,
        message: '状态参数无效',
        data: null
      });
    }
    
    const updatedPlayer = await Player.updateStatus(playerId, status);
    
    if (!updatedPlayer) {
      return res.status(404).json({
        code: 404,
        message: '玩家不存在',
        data: null
      });
    }
    
    res.json({
      code: 200,
      message: '更新玩家状态成功',
      data: updatedPlayer
    });
  } catch (error) {
    console.error('更新玩家状态失败:', error);
    res.status(500).json({
      code: 500,
      message: '服务器内部错误',
      data: null
    });
  }
});

module.exports = router;
