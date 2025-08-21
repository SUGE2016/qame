const express = require('express');
const { query } = require('../config/database');
const router = express.Router();

// 获取游戏列表（仅从数据库获取）
router.get('/', async (req, res) => {
  try {
    const result = await query(`
      SELECT id, name, description, min_players, max_players, status, created_at
      FROM games
      WHERE status = 'active'
      ORDER BY name
    `);
    
    res.json({
      code: 200,
      message: '获取游戏列表成功',
      data: {
        games: result.rows
      }
    });
  } catch (error) {
    console.error('获取游戏列表失败:', error);
    res.status(500).json({
      code: 500,
      message: '获取游戏列表失败',
      data: null
    });
  }
});

// 根据ID获取游戏详情
router.get('/:id', async (req, res) => {
  try {
    const gameId = req.params.id;
    const result = await query(
      'SELECT * FROM games WHERE id = $1 AND status = $2',
      [gameId, 'active']
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        code: 404,
        message: '游戏不存在',
        data: null
      });
    }

    res.json({
      code: 200,
      message: '获取游戏详情成功',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('获取游戏详情失败:', error);
    res.status(500).json({
      code: 500,
      message: '获取游戏详情失败',
      data: null
    });
  }
});

module.exports = router;