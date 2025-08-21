const { Client } = require('boardgame.io/client');
const { SocketIO } = require('boardgame.io/multiplayer');
const { getGame } = require('@qame/games');
const fetch = require('node-fetch');

/**
 * AI玩家连接 - 负责维持AI玩家与game-server的连接
 */
class AIPlayerConnection {
  constructor(config) {
    // 基本配置
    this.id = config.id;
    this.seatIndex = config.seatIndex;
    this.playerName = config.playerName;
    this.gameId = config.gameType;
    this.matchId = config.matchId;
    
    // 游戏服务器连接
    this.gameServerUrl = config.gameServerUrl || 'http://game-server:8000';
    
    // AI客户端端点
    this.aiClientEndpoint = config.aiClientEndpoint;
    
    this.client = null;
    this.unsubscribe = null; // 存储取消订阅函数
    
    // 简化的状态管理
    this.status = 'created';
    this.gameState = null;
    this.createdAt = new Date();
    
    // 防重复处理机制
    this.lastProcessedTurn = -1;
    this.isProcessingMove = false;
    


    console.log(`[${new Date().toISOString()}] [ai-player:${this.playerName}] INFO: AI玩家连接已创建: ${this.playerName}, seatIndex: ${this.seatIndex}`);
  }

  /**
   * 连接到游戏服务器
   */
  async connect() {
    try {
      console.log(`[${new Date().toISOString()}] [ai-player:${this.playerName}] INFO: 连接到游戏服务器: ${this.gameServerUrl}`);
      this.status = 'connecting';
      
      // 如果已有连接，先断开旧连接
      if (this.client || this.unsubscribe) {
        console.log(`[${new Date().toISOString()}] [ai-player:${this.playerName}] DEBUG: 检测到旧连接，先断开`);
        this.disconnect();
      }
      
      // 创建 boardgame.io Client 实例
      this.client = Client({
        game: this._getGameConfig(),
        multiplayer: SocketIO({ server: this.gameServerUrl }),
        playerID: this.seatIndex.toString(), // boardgame.io的playerID
        matchID: this.matchId,
        debug: false
      });

      // 启动客户端
      this.client.start();
      
      // 设置事件监听
      this._setupClientListeners();
      
      this.status = 'connected';
      console.log(`[${new Date().toISOString()}] [ai-player:${this.playerName}] INFO: 已连接到游戏服务器`);

    } catch (error) {
      this.status = 'error';
      console.error(`[${new Date().toISOString()}] [ai-player:${this.playerName}] ERROR: 连接失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 获取游戏配置
   */
  _getGameConfig() {
    // 使用 @qame/games 包中的 getGame 函数
    return getGame(this.gameId);
  }

  /**
   * 设置客户端事件监听
   */
  _setupClientListeners() {
    // 监听游戏状态变化，保存取消订阅函数
    this.unsubscribe = this.client.subscribe((state) => {
      if (state) {
        this.gameState = state;
        

        
        console.log(`[${new Date().toISOString()}] [ai-player:${this.playerName}] DEBUG: 游戏状态更新: turn ${state.ctx?.turn || 0}`);
        
        // 检查游戏是否结束
        if (state.ctx?.gameover) {
          this._handleGameOver(state);
          return;
        }
        
        // 检查是否轮到AI玩家行动
        this._checkAndMakeMove(state);
      }

      console.debug(`[${new Date().toISOString()}] [ai-player:${this.playerName}] DEBUG: 游戏状态更新: ${JSON.stringify(state)}`);
    });
  }

  /**
   * 处理游戏结束
   */
  _handleGameOver(state) {
    try {
      console.log(`[${new Date().toISOString()}] [ai-player:${this.playerName}] INFO: 游戏已结束`);
      console.log(`[${new Date().toISOString()}] [ai-player:${this.playerName}] INFO: 游戏结果: ${JSON.stringify(state.ctx?.gameover)}`);
      
      // 游戏结束时主动断开连接，避免状态残留
      console.log(`[${new Date().toISOString()}] [ai-player:${this.playerName}] INFO: 游戏结束，断开连接`);
      this.disconnect();
    } catch (error) {
      console.error(`[${new Date().toISOString()}] [ai-player:${this.playerName}] ERROR: 处理游戏结束失败: ${error.message}`);
    }
  }

  /**
   * 检查并执行AI移动
   */
  async _checkAndMakeMove(state) {
    try {
      const playerID = this.seatIndex.toString();
    
      console.log(`[ai-player:${this.playerName}] DEBUG: 检查轮次 - currentPlayer: ${state.ctx?.currentPlayer}, AI seatIndex: ${this.seatIndex}, 匹配: ${state.ctx?.currentPlayer === playerID}`);
      if (state.ctx?.currentPlayer !== playerID) {
        return;
      }
      
      // 防重复处理机制
      const currentTurn = state.ctx?.turn || 0;
      if (this.isProcessingMove || currentTurn <= this.lastProcessedTurn) {
        console.log(`[${new Date().toISOString()}] [ai-player:${this.playerName}] DEBUG: 跳过重复处理 - isProcessing: ${this.isProcessingMove}, currentTurn: ${currentTurn}, lastProcessed: ${this.lastProcessedTurn}`);
        return;
      }
      
      this.isProcessingMove = true;
      this.lastProcessedTurn = currentTurn;
      
      console.log(`[${new Date().toISOString()}] [ai-player:${this.playerName}] INFO: 轮到AI玩家行动`);
      
      try {
        // 调用LLM AI服务获取移动决策
        const move = await this._getAIMove(state);
        
        if (move !== null && move !== undefined && move !== -1) {
          // 执行移动
          await this.executeMove(move);
        } else {
          console.error(`[${new Date().toISOString()}] [ai-player:${this.playerName}] ERROR: 无法获取有效的AI移动`);
        }
      } finally {
        this.isProcessingMove = false;
      }
      
    } catch (error) {
      this.isProcessingMove = false;
      console.error(`[${new Date().toISOString()}] [ai-player:${this.playerName}] ERROR: 检查并执行移动失败: ${error.message}`);
    }
  }

  /**
   * 调用LLM AI服务获取移动决策
   */
  async _getAIMove(state) {
    try {
      const aiServiceUrl = this.aiClientEndpoint;
      
      const requestBody = {
        game_id: this.gameId,
        match_id: this.matchId,
        player_id: this.seatIndex.toString(),
        G: state.G,
        ctx: state.ctx,
        metadata: {
          turn: state.ctx?.turn || 0,
          current_bgio_player_id: state.ctx?.currentPlayer
        }
      };
      
      console.log(`[${new Date().toISOString()}] [ai-player:${this.playerName}] INFO: 调用AI服务: ${aiServiceUrl}/move`);
      
      const response = await fetch(`${aiServiceUrl}/move`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody),
        timeout: 10000
      });
      
      if (!response.ok) {
        throw new Error(`AI服务响应错误: ${response.status}`);
      }
      
      const result = await response.json();
      console.log(`[${new Date().toISOString()}] [ai-player:${this.playerName}] INFO: AI服务返回移动: ${result.move}`);
      
      return result.move;
      
    } catch (error) {
      console.error(`[${new Date().toISOString()}] [ai-player:${this.playerName}] ERROR: 调用AI服务失败: ${error.message}`);
      return -1;
    }
  }

  /**
   * 执行移动
   */
  async executeMove(move) {
    console.log(`[${new Date().toISOString()}] [ai-player:${this.playerName}] INFO: 执行移动:`, move);
    
    try {
      if (this.client && this.client.moves) {
        // 使用约定的通用移动方法名 'makeMove'
        if (this.client.moves.makeMove) {
          console.log(`[${new Date().toISOString()}] [ai-player:${this.playerName}] INFO: 调用通用移动方法 makeMove，位置: ${move}`);
          this.client.moves.makeMove(move);
        } else {
          console.error(`[${new Date().toISOString()}] [ai-player:${this.playerName}] ERROR: 游戏未实现约定的 makeMove 方法`);
        }
      } else {
        console.error(`[${new Date().toISOString()}] [ai-player:${this.playerName}] ERROR: 客户端或移动方法不可用`);
      }
    } catch (error) {
      console.error(`[${new Date().toISOString()}] [ai-player:${this.playerName}] ERROR: 执行移动失败:`, error);
    }
  }

  /**
   * 断开连接
   */
  disconnect() {
    try {
      this.status = 'disconnecting';
      console.log(`[${new Date().toISOString()}] [ai-player:${this.playerName}] INFO: AI客户端断开连接`);

      // 取消游戏状态订阅
      if (this.unsubscribe) {
        this.unsubscribe();
        this.unsubscribe = null;
        console.log(`[${new Date().toISOString()}] [ai-player:${this.playerName}] DEBUG: 已取消游戏状态订阅`);
      }

      if (this.client) {
        this.client.stop();
        this.client = null;
      }
      
      // 重置防重复处理标志
      this.lastProcessedTurn = -1;
      this.isProcessingMove = false;
      
      this.status = 'disconnected';
    } catch (error) {
      console.error(`[${new Date().toISOString()}] [ai-player:${this.playerName}] ERROR: 断开连接失败: ${error.message}`);
    }
  }

  /**
   * 获取详细信息（包括日志）
   */
  getDetailedInfo() {
    return {
      ...this.getStatus(),
      gameState: this.gameState,
      // 移除了日志存储功能
    };
  }
}

module.exports = { AIPlayerConnection };
