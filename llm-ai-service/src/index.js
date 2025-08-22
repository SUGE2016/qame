const express = require('express');
const cors = require('cors');
require('dotenv').config();

const LLMAIService = require('./services/LLMAIService');
const gameHandlers = require('./handlers/gameHandlers');

const app = express();
const port = process.env.PORT || 3003;

// 中间件
app.use(cors());
app.use(express.json());

// 创建LLM AI服务实例
const llmAI = new LLMAIService();

// 健康检查接口
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'llm-ai-service',
    version: '1.0.0',
    supported_games: [],
    max_concurrent_games: 10,
    description: '基于LLM的AI游戏客户端 - 外部AI开发参考示例'
  });
});

// 获取AI移动 - 标准接口
app.post('/move', async (req, res) => {
  try {
    const { game_id, match_id, player_id, G, ctx, metadata } = req.body;
    
    // 验证输入
    if (!game_id || !G || !player_id || !match_id) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: '缺少必要参数',
          details: '需要提供 game_id, match_id, player_id, G'
        }
      });
    }

    // 检查是否支持该游戏
    if (!gameHandlers[game_id]) {
      return res.status(400).json({
        error: {
          code: 'UNSUPPORTED_GAME',
          message: `不支持的游戏类型: ${game_id}`,
          details: `支持的游戏: ${Object.keys(gameHandlers).join(', ')}`
        }
      });
    }

    console.log(`🎮 [LLM AI] 收到移动请求: ${game_id}, match: ${match_id}, player: ${player_id}`);
    
    const startTime = Date.now();
    
    // 调用对应游戏的处理器
    const move = await gameHandlers[game_id].getMove(llmAI, G, metadata);
    const thinkingTime = Date.now() - startTime;
    if (move < 0 || move === null || move === undefined) {
      return res.status(500).json({
        error: {
          code: 'AI_ERROR',
          message: 'AI无法生成有效移动',
          details: '请检查游戏状态'
        }
      });
    }

    console.log(`✅ [LLM AI] 生成移动: ${move}, 用时: ${thinkingTime}ms`);

    // 返回标准格式响应
    res.json({
      move: move,
      thinking_time: thinkingTime,
      metadata: {
        algorithm: 'llm-based',
        model: process.env.LLM_MODEL,
        temperature: parseFloat(process.env.LLM_TEMPERATURE)
      }
    });

  } catch (error) {
    console.error('❌ [LLM AI] 处理移动请求失败:', error);
    
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: '服务器内部错误',
        details: error.message
      }
    });
  }
});

// 启动服务器
app.listen(port, () => {
  console.log(`🚀 LLM AI Service 启动成功，端口: ${port}`);
  console.log(`📖 这是一个基于LLM的AI实现示例，外部开发者可以参考此实现`);
  console.log(`🔗 健康检查: http://localhost:${port}/health`);
  console.log(`🎯 移动接口: http://localhost:${port}/move`);
});
