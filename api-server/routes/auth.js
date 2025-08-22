const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { authenticateToken } = require('../middleware/auth');
const User = require('../models/User');
const RefreshToken = require('../models/RefreshToken');
const Player = require('../models/Player');

const router = express.Router();

// 用户登录
router.post('/login', async (req, res) => {
  try {
    const { username, hashedPassword } = req.body;

    // 验证输入
    if (!username || !hashedPassword) {
      return res.status(400).json({
        code: 400,
        message: '用户名和密码不能为空',
        data: null
      });
    }

    // 查找用户
    const user = await User.findByUsername(username);
    if (!user) {
      return res.status(401).json({
        code: 401,
        message: '用户名或密码错误',
        data: null
      });
    }

    // 使用统一的salt进行密码验证
    // 前端发送：hash(password + UNIFIED_SALT)
    // 后端验证：使用相同的UNIFIED_SALT重新计算哈希
    const UNIFIED_SALT = process.env.PASSWORD_SALT || 'your_fixed_salt_here';
    
    // 验证哈希格式（64位十六进制）
    if (!/^[a-f0-9]{64}$/.test(hashedPassword)) {
      return res.status(401).json({
        code: 401,
        message: '用户名或密码错误',
        data: null
      });
    }
    
    // 直接比较前端发送的哈希与数据库中存储的哈希
    if (hashedPassword !== user.password_hash) {
      return res.status(401).json({
        code: 401,
        message: '用户名或密码错误',
        data: null
      });
    }

    // 生成Access Token（短期）
    const accessToken = jwt.sign(
      { userId: user.id, username: user.username, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }  // 15分钟
    );

    // 生成Refresh Token（长期）
    const refreshToken = crypto.randomBytes(64).toString('hex');
    const refreshTokenExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7天

    // 保存Refresh Token到数据库
    await RefreshToken.create(user.id, refreshToken, refreshTokenExpiresAt);

    // 确保用户有对应的player记录
    let player = await Player.getByUserId(user.id);
    if (!player) {
      // 如果没有player记录，创建一个
      player = await Player.create({
        player_name: user.username,
        player_type: 'human',
        user_id: user.id,
        ai_player_id: null,
        status: 'active'
      });
      console.log('✅ 为用户创建player记录:', player);
    } else {
      // 如果已有player记录，激活它
      player = await Player.setUserOnline(user.id);
      console.log('✅ 激活用户player记录:', player);
    }

    // 设置HttpOnly Cookie
    res.cookie('access_token', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // 生产环境使用HTTPS
      sameSite: 'strict',
      maxAge: 15 * 60 * 1000  // 15分钟
    });

    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // 生产环境使用HTTPS
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000  // 7天
    });

    res.json({
      code: 200,
      message: '登录成功',
      data: {
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
          createdAt: user.created_at
        }
      }
    });

  } catch (error) {
    console.error('登录错误:', error);
    res.status(500).json({
      code: 500,
      message: '服务器内部错误',
      data: null
    });
  }
});

// 获取用户信息
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({
        code: 404,
        message: '用户不存在',
        data: null
      });
    }

    res.json({
      code: 200,
      message: '获取用户信息成功',
      data: {
        id: user.id,
        username: user.username,
        role: user.role,
        createdAt: user.created_at
      }
    });

  } catch (error) {
    console.error('获取用户信息错误:', error);
    res.status(500).json({
      code: 500,
      message: '服务器内部错误',
      data: null
    });
  }
});

// 验证token
router.get('/verify', async (req, res) => {
  try {
    // 手动处理token验证
    let token = null;
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.split(' ')[1]) {
      token = authHeader.split(' ')[1]; // Bearer TOKEN
    } else if (req.cookies && req.cookies.access_token) {
      token = req.cookies.access_token;
    }
    
    if (!token) {
      return res.status(401).json({
        code: 401,
        message: '访问令牌缺失',
        data: null
      });
    }
    
    const decoded = require('../middleware/auth').verifyToken(token);
    if (!decoded) {
      return res.status(401).json({
        code: 401,
        message: '令牌已过期或无效，请重新登录',
        data: null
      });
    }
    
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(404).json({
        code: 404,
        message: '用户不存在',
        data: null
      });
    }

    res.json({
      code: 200,
      message: 'token验证成功',
      data: {
        id: user.id,
        username: user.username,
        role: user.role,
        createdAt: user.created_at
      }
    });

  } catch (error) {
    console.error('验证token错误:', error);
    res.status(500).json({
      code: 500,
      message: '服务器内部错误',
      data: null
    });
  }
});

// 更新用户信息
router.put('/profile', authenticateToken, async (req, res) => {
  try {
    const { username } = req.body;

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
    if (existingUser && existingUser.id !== req.user.userId) {
      return res.status(409).json({
        code: 409,
        message: '用户名已存在',
        data: null
      });
    }

    // 更新用户信息
    const updatedUser = await User.update(req.user.userId, { username });

    res.json({
      code: 200,
      message: '更新用户信息成功',
      data: {
        id: updatedUser.id,
        username: updatedUser.username,
        role: updatedUser.role,
        createdAt: updatedUser.created_at
      }
    });

  } catch (error) {
    console.error('更新用户信息错误:', error);
    res.status(500).json({
      code: 500,
      message: '服务器内部错误',
      data: null
    });
  }
});

// Token刷新API
router.post('/refresh', async (req, res) => {
  try {
    const refreshToken = req.cookies.refresh_token;
    
    if (!refreshToken) {
      return res.status(401).json({
        code: 401,
        message: 'Refresh Token不存在',
        data: null
      });
    }

    // 验证Refresh Token
    const tokenRecord = await RefreshToken.findByToken(refreshToken);
    if (!tokenRecord) {
      return res.status(401).json({
        code: 401,
        message: 'Refresh Token无效',
        data: null
      });
    }

    // 获取用户信息
    const user = await User.findById(tokenRecord.user_id);
    if (!user) {
      return res.status(401).json({
        code: 401,
        message: '用户不存在',
        data: null
      });
    }

    // 生成新的Access Token
    const newAccessToken = jwt.sign(
      { userId: user.id, username: user.username, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );

    // 设置新的Access Token Cookie
    res.cookie('access_token', newAccessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 15 * 60 * 1000
    });

    res.json({
      code: 200,
      message: 'Token刷新成功',
      data: {
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
          createdAt: user.created_at
        }
      }
    });

  } catch (error) {
    console.error('Token刷新失败:', error);
    res.status(500).json({
      code: 500,
      message: '服务器内部错误',
      data: null
    });
  }
});

// 登出API
router.post('/logout', async (req, res) => {
  try {
    const refreshToken = req.cookies.refresh_token;
    
    if (refreshToken) {
      // 删除Refresh Token
      await RefreshToken.deleteByToken(refreshToken);
    }

    // 清除Cookie
    res.clearCookie('access_token');
    res.clearCookie('refresh_token');

    res.json({
      code: 200,
      message: '登出成功',
      data: null
    });

  } catch (error) {
    console.error('登出失败:', error);
    res.status(500).json({
      code: 500,
      message: '服务器内部错误',
      data: null
    });
  }
});

module.exports = router;