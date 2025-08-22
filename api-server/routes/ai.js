const express = require('express');
const router = express.Router();
const AIClientModel = require('../models/AIClient');
const AIPlayerModel = require('../models/AIPlayer');

// 响应格式化
function formatResponse(code, message, data = null) {
  return { code, message, data };
}

// ========== AI客户端管理（服务注册） ==========

// 获取所有AI客户端
router.get('/clients', async (req, res) => {
  try {
    const clients = await AIClientModel.getAll();
    res.json(formatResponse(200, '获取成功', clients));
  } catch (error) {
    res.status(500).json(formatResponse(500, '获取失败', error.message));
  }
});

// 获取单个AI客户端详情
router.get('/clients/:clientId', async (req, res) => {
  try {
    const client = await AIClientModel.getById(req.params.clientId);
    
    if (!client) {
      return res.status(404).json(formatResponse(404, 'AI客户端不存在'));
    }
    
    res.json(formatResponse(200, '获取成功', client));
  } catch (error) {
    res.status(500).json(formatResponse(500, '获取失败', error.message));
  }
});

// 创建AI客户端
router.post('/clients', async (req, res) => {
  try {
    const { name, endpoint, supported_games, description } = req.body;
    
    // 验证必要参数
    if (!name || !endpoint) {
      return res.status(400).json(formatResponse(400, '缺少必要参数：name、endpoint'));
    }
    
    if (!supported_games || !Array.isArray(supported_games) || supported_games.length === 0) {
      return res.status(400).json(formatResponse(400, '必须指定至少一个支持的游戏'));
    }
    
    // 生成客户端ID
    const clientId = `ai-client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const clientData = {
      id: clientId,
      name,
      endpoint,
      supported_games,
      description: description || ''
    };
    
    const client = await AIClientModel.create(clientData);
    res.json(formatResponse(200, '创建成功', client));
  } catch (error) {
    res.status(500).json(formatResponse(500, '创建失败', error.message));
  }
});

// 更新AI客户端
router.put('/clients/:clientId', async (req, res) => {
  try {
    const { name, endpoint, supported_games, description } = req.body;
    
    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (endpoint !== undefined) updateData.endpoint = endpoint;
    if (supported_games !== undefined) updateData.supported_games = supported_games;
    if (description !== undefined) updateData.description = description;
    
    const client = await AIClientModel.update(req.params.clientId, updateData);
    
    if (!client) {
      return res.status(404).json(formatResponse(404, 'AI客户端不存在'));
    }
    
    res.json(formatResponse(200, '更新成功', client));
  } catch (error) {
    res.status(500).json(formatResponse(500, '更新失败', error.message));
  }
});

// 删除AI客户端
router.delete('/clients/:clientId', async (req, res) => {
  try {
    const client = await AIClientModel.delete(req.params.clientId);
    
    if (!client) {
      return res.status(404).json(formatResponse(404, 'AI客户端不存在'));
    }
    
    res.json(formatResponse(200, '删除成功'));
  } catch (error) {
    res.status(500).json(formatResponse(500, '删除失败', error.message));
  }
});

// ========== AI选手管理（选手身份） ==========

// 获取所有AI选手
router.get('/players', async (req, res) => {
  try {
    const players = await AIPlayerModel.getAll();
    res.json(formatResponse(200, '获取成功', players));
  } catch (error) {
    res.status(500).json(formatResponse(500, '获取失败', error.message));
  }
});

// 获取活跃的AI选手（必须在参数路由之前）
router.get('/players/active', async (req, res) => {
  try {
    const players = await AIPlayerModel.getActive();
    res.json(formatResponse(200, '获取成功', players));
  } catch (error) {
    res.status(500).json(formatResponse(500, '获取失败', error.message));
  }
});

// 获取单个AI选手详情
router.get('/players/:playerId', async (req, res) => {
  try {
    const player = await AIPlayerModel.getById(req.params.playerId);
    
    if (!player) {
      return res.status(404).json(formatResponse(404, 'AI选手不存在'));
    }
    
    res.json(formatResponse(200, '获取成功', player));
  } catch (error) {
    res.status(500).json(formatResponse(500, '获取失败', error.message));
  }
});

// 根据AI客户端ID获取选手
router.get('/clients/:clientId/players', async (req, res) => {
  try {
    const players = await AIPlayerModel.getByClientId(req.params.clientId);
    res.json(formatResponse(200, '获取成功', players));
  } catch (error) {
    res.status(500).json(formatResponse(500, '获取失败', error.message));
  }
});

// 创建AI选手
router.post('/players', async (req, res) => {
  try {
    const { player_name, ai_client_id } = req.body;
    
    // 验证必要参数
    if (!player_name || !ai_client_id) {
      return res.status(400).json(formatResponse(400, '缺少必要参数：player_name、ai_client_id'));
    }
    
    // 验证AI客户端是否存在
    const aiClient = await AIClientModel.getById(ai_client_id);
    if (!aiClient) {
      return res.status(400).json(formatResponse(400, '指定的AI客户端不存在'));
    }
    
    const playerData = {
      player_name,
      ai_client_id,
      status: 'active'
    };
    
    const player = await AIPlayerModel.create(playerData);
    res.json(formatResponse(200, '创建成功', player));
  } catch (error) {
    if (error.code === '23505') { // 唯一约束违反
      res.status(400).json(formatResponse(400, '选手名称已存在'));
    } else {
      res.status(500).json(formatResponse(500, '创建失败', error.message));
    }
  }
});

// 更新AI选手
router.put('/players/:playerId', async (req, res) => {
  try {
    const { player_name, status } = req.body;
    
    const updateData = {};
    if (player_name !== undefined) updateData.player_name = player_name;
    if (status !== undefined) updateData.status = status;
    
    const player = await AIPlayerModel.update(req.params.playerId, updateData);
    
    if (!player) {
      return res.status(404).json(formatResponse(404, 'AI选手不存在'));
    }
    
    res.json(formatResponse(200, '更新成功', player));
  } catch (error) {
    if (error.code === '23505') { // 唯一约束违反
      res.status(400).json(formatResponse(400, '选手名称已存在'));
    } else {
      res.status(500).json(formatResponse(500, '更新失败', error.message));
    }
  }
});

// 删除AI选手
router.delete('/players/:playerId', async (req, res) => {
  try {
    const player = await AIPlayerModel.delete(req.params.playerId);
    
    if (!player) {
      return res.status(404).json(formatResponse(404, 'AI选手不存在'));
    }
    
    res.json(formatResponse(200, '删除成功'));
  } catch (error) {
    res.status(500).json(formatResponse(500, '删除失败', error.message));
  }
});

// ========== 游戏支持检查 ==========

// 检查AI客户端是否支持指定游戏
router.get('/clients/:clientId/supports/:gameType', async (req, res) => {
  try {
    const { clientId, gameType } = req.params;
    const supports = await AIClientModel.supportsGame(clientId, gameType);
    res.json(formatResponse(200, '检查成功', { supports }));
  } catch (error) {
    res.status(500).json(formatResponse(500, '检查失败', error.message));
  }
});

// 检查AI选手是否支持指定游戏
router.get('/players/:playerId/supports/:gameType', async (req, res) => {
  try {
    const { playerId, gameType } = req.params;
    const supports = await AIPlayerModel.supportsGame(playerId, gameType);
    res.json(formatResponse(200, '检查成功', { supports }));
  } catch (error) {
    res.status(500).json(formatResponse(500, '检查失败', error.message));
  }
});

// ========== 健康检查 ==========

// 健康检查
router.get('/health', (req, res) => {
  res.json(formatResponse(200, 'AI管理服务运行正常', {
    service: 'ai-manager',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  }));
});

module.exports = router;