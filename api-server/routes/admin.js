const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/adminAuth');
const User = require('../models/User');
const Game = require('../models/Game');

const router = express.Router();

// 所有Admin路由都需要先验证token，再验证Admin权限
router.use(authenticateToken);
router.use(requireAdmin);

// 获取用户列表
router.get('/users', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    
    const users = await User.findAll(page, limit);
    
    res.json({
      code: 200,
      message: '获取用户列表成功',
      data: {
        users,
        page,
        limit
      }
    });
  } catch (error) {
    console.error('获取用户列表失败:', error);
    res.status(500).json({
      code: 500,
      message: '服务器内部错误',
      data: null
    });
  }
});

// 创建新用户
router.post('/users', async (req, res) => {
  try {
    const { username, password, role = 'user' } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        code: 400,
        message: '用户名和密码不能为空',
        data: null
      });
    }

    if (username.length < 3 || username.length > 20) {
      return res.status(400).json({
        code: 400,
        message: '用户名长度必须在3-20个字符之间',
        data: null
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        code: 400,
        message: '密码长度不能少于6个字符',
        data: null
      });
    }

    if (!['user', 'admin'].includes(role)) {
      return res.status(400).json({
        code: 400,
        message: '角色必须是user或admin',
        data: null
      });
    }

    // 创建用户
    const newUser = await User.create(username, password, role);

    res.json({
      code: 200,
      message: '创建用户成功',
      data: {
        id: newUser.id,
        username: newUser.username,
        role: role,
        createdAt: newUser.created_at
      }
    });
  } catch (error) {
    console.error('创建用户失败:', error);
    if (error.message === '用户名已存在') {
      res.status(409).json({
        code: 409,
        message: '用户名已存在',
        data: null
      });
    } else {
      res.status(500).json({
        code: 500,
        message: '服务器内部错误',
        data: null
      });
    }
  }
});

// 更新用户信息
router.put('/users/:id', async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const { username, role } = req.body;

    if (!username) {
      return res.status(400).json({
        code: 400,
        message: '用户名不能为空',
        data: null
      });
    }

    if (username.length < 3 || username.length > 20) {
      return res.status(400).json({
        code: 400,
        message: '用户名长度必须在3-20个字符之间',
        data: null
      });
    }

    // 检查新用户名是否已被其他用户使用
    const existingUser = await User.findByUsername(username);
    if (existingUser && existingUser.id !== userId) {
      return res.status(409).json({
        code: 409,
        message: '用户名已存在',
        data: null
      });
    }

    // 更新用户信息
    const updates = { username };
    if (role && ['user', 'admin'].includes(role)) {
      updates.role = role;
    }

    const updatedUser = await User.update(userId, updates);

    res.json({
      code: 200,
      message: '更新用户信息成功',
      data: updatedUser
    });
  } catch (error) {
    console.error('更新用户信息失败:', error);
    res.status(500).json({
      code: 500,
      message: '服务器内部错误',
      data: null
    });
  }
});

// 删除用户
router.delete('/users/:id', async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    
    // 不能删除自己
    if (userId === req.user.userId) {
      return res.status(400).json({
        code: 400,
        message: '不能删除自己的账户',
        data: null
      });
    }

    const deletedUser = await User.delete(userId);

    res.json({
      code: 200,
      message: '删除用户成功',
      data: deletedUser
    });
  } catch (error) {
    console.error('删除用户失败:', error);
    res.status(500).json({
      code: 500,
      message: '服务器内部错误',
      data: null
    });
  }
});

// 获取系统统计信息
router.get('/stats', async (req, res) => {
  try {
    const stats = await User.getStats();

    res.json({
      code: 200,
      message: '获取系统统计成功',
      data: stats
    });
  } catch (error) {
    console.error('获取系统统计失败:', error);
    res.status(500).json({
      code: 500,
      message: '服务器内部错误',
      data: null
    });
  }
});

// ==================== 游戏管理接口 ====================

// 创建新游戏
router.post('/games', async (req, res) => {
  try {
    const { id, name, description, min_players = 2, max_players = 2, status = 'active' } = req.body;

    if (!name || name.trim().length === 0) {
      return res.status(400).json({
        code: 400,
        message: '游戏名称不能为空',
        data: null
      });
    }

    if (id && (id.trim().length === 0 || id.length > 255)) {
      return res.status(400).json({
        code: 400,
        message: '游戏ID不能为空且不能超过255个字符',
        data: null
      });
    }

    if (id && !/^[a-zA-Z0-9_-]+$/.test(id)) {
      return res.status(400).json({
        code: 400,
        message: '游戏ID只能包含字母、数字、下划线和连字符',
        data: null
      });
    }

    if (name.length > 100) {
      return res.status(400).json({
        code: 400,
        message: '游戏名称不能超过100个字符',
        data: null
      });
    }

    if (description && description.length > 500) {
      return res.status(400).json({
        code: 400,
        message: '游戏描述不能超过500个字符',
        data: null
      });
    }

    if (min_players < 1 || min_players > 10) {
      return res.status(400).json({
        code: 400,
        message: '最少选手数必须在1-10之间',
        data: null
      });
    }

    if (max_players < 1 || max_players > 10) {
      return res.status(400).json({
        code: 400,
        message: '最多选手数必须在1-10之间',
        data: null
      });
    }

    if (min_players > max_players) {
      return res.status(400).json({
        code: 400,
        message: '最少选手数不能大于最多选手数',
        data: null
      });
    }

    if (!['active', 'inactive'].includes(status)) {
      return res.status(400).json({
        code: 400,
        message: '状态必须是active或inactive',
        data: null
      });
    }

    const newGame = await Game.create({
      id: id ? id.trim() : undefined,
      name: name.trim(),
      description: description ? description.trim() : null,
      min_players,
      max_players,
      status
    });

    res.json({
      code: 200,
      message: '创建游戏成功',
      data: {
        game: newGame
      }
    });
  } catch (error) {
    console.error('创建游戏失败:', error);
    if (error.message && error.message.includes('UNIQUE constraint failed')) {
      res.status(409).json({
        code: 409,
        message: '游戏名称已存在',
        data: null
      });
    } else {
      res.status(500).json({
        code: 500,
        message: '服务器内部错误',
        data: null
      });
    }
  }
});

// 更新游戏信息
router.put('/games/:id', async (req, res) => {
  try {
    const gameId = req.params.id;
    const { name, description, min_players, max_players, status } = req.body;

    if (!gameId || typeof gameId !== 'string' || gameId.trim().length === 0) {
      return res.status(400).json({
        code: 400,
        message: '无效的游戏ID',
        data: null
      });
    }

    // 检查游戏是否存在
    const existingGame = await Game.findById(gameId);
    if (!existingGame) {
      return res.status(404).json({
        code: 404,
        message: '游戏不存在',
        data: null
      });
    }

    // 验证输入
    if (name !== undefined) {
      if (!name || name.trim().length === 0) {
        return res.status(400).json({
          code: 400,
          message: '游戏名称不能为空',
          data: null
        });
      }
      if (name.length > 100) {
        return res.status(400).json({
          code: 400,
          message: '游戏名称不能超过100个字符',
          data: null
        });
      }
    }

    if (description !== undefined && description && description.length > 500) {
      return res.status(400).json({
        code: 400,
        message: '游戏描述不能超过500个字符',
        data: null
      });
    }

    if (min_players !== undefined && (min_players < 1 || min_players > 10)) {
      return res.status(400).json({
        code: 400,
        message: '最少选手数必须在1-10之间',
        data: null
      });
    }

    if (max_players !== undefined && (max_players < 1 || max_players > 10)) {
      return res.status(400).json({
        code: 400,
        message: '最多选手数必须在1-10之间',
        data: null
      });
    }

    const finalMinPlayers = min_players !== undefined ? min_players : existingGame.min_players;
    const finalMaxPlayers = max_players !== undefined ? max_players : existingGame.max_players;

    if (finalMinPlayers > finalMaxPlayers) {
      return res.status(400).json({
        code: 400,
        message: '最少选手数不能大于最多选手数',
        data: null
      });
    }

    if (status !== undefined && !['active', 'inactive'].includes(status)) {
      return res.status(400).json({
        code: 400,
        message: '状态必须是active或inactive',
        data: null
      });
    }

    const updatedGame = await Game.update(gameId, {
      name: name !== undefined ? name.trim() : undefined,
      description: description !== undefined ? (description ? description.trim() : null) : undefined,
      min_players,
      max_players,
      status
    });

    res.json({
      code: 200,
      message: '更新游戏成功',
      data: {
        game: updatedGame
      }
    });
  } catch (error) {
    console.error('更新游戏失败:', error);
    if (error.message && error.message.includes('UNIQUE constraint failed')) {
      res.status(409).json({
        code: 409,
        message: '游戏名称已存在',
        data: null
      });
    } else {
      res.status(500).json({
        code: 500,
        message: '服务器内部错误',
        data: null
      });
    }
  }
});

// 删除游戏
router.delete('/games/:id', async (req, res) => {
  try {
    const gameId = req.params.id;

    if (!gameId || typeof gameId !== 'string' || gameId.trim().length === 0) {
      return res.status(400).json({
        code: 400,
        message: '无效的游戏ID',
        data: null
      });
    }

    // 检查游戏是否存在
    const existingGame = await Game.findById(gameId);
    if (!existingGame) {
      return res.status(404).json({
        code: 404,
        message: '游戏不存在',
        data: null
      });
    }

    // 检查是否有关联的比赛
    const { db } = require('../config/database');
    const matchCount = await new Promise((resolve, reject) => {
      db.get('SELECT COUNT(*) as count FROM matches WHERE game_id = ?', [gameId], (err, row) => {
        if (err) reject(err);
        else resolve(row.count);
      });
    });

    if (matchCount > 0) {
      return res.status(400).json({
        code: 400,
        message: `无法删除游戏，还有 ${matchCount} 个相关比赛记录`,
        data: null
      });
    }

    await Game.delete(gameId);

    res.json({
      code: 200,
      message: '删除游戏成功',
      data: null
    });
  } catch (error) {
    console.error('删除游戏失败:', error);
    res.status(500).json({
      code: 500,
      message: '服务器内部错误',
      data: null
    });
  }
});

module.exports = router;