const { v4: uuidv4 } = require('uuid');
const { AIPlayerConnection } = require('./AIPlayerConnection');
const PostgreSQLListener = require('./PostgreSQLListener');

class AIPlayerSessionManager {
  constructor() {
    this.clients = new Map(); // clientId -> client info
    
    // 初始化PostgreSQL监听器
    this.pgListener = new PostgreSQLListener();
    this.pgListener.connect().then(() => {
      this.pgListener.listen('match_status_changes');
      // 监听数据库通知：当 match 状态变化时处理 AI 玩家连接
      // 注意：游戏状态在 boardgame.io 中已预先初始化，此处主要处理连接逻辑
      this.pgListener.on('notification:match_status_changes', (data) => {
        console.log(`📨 [AI Manager] 收到数据库通知:`, JSON.stringify(data, null, 2));
        
        // 兼容两种payload结构：{ status, match_id, game_id, ... } 或 { new_record: { status, id, game_id } }
        const payload = data?.payload || {};
        const operation = payload.operation;
        const status = payload?.new_record?.status ?? payload?.status;
        const matchId = payload?.new_record?.id ?? payload?.match_id;
        const gameId = payload?.new_record?.game_id ?? payload?.game_id;
        const bgioMatchId = payload?.new_record?.bgio_match_id ?? payload?.bgio_match_id;
        
        console.log(`🔍 [AI Manager] 解析通知数据:`, { operation, status, matchId, gameId, bgioMatchId });
        
        if (operation === 'UPDATE' && status === 'playing' && matchId) {
          console.log(`🚀 [AI Manager] 监听到match进入playing，准备连接AI:`, { matchId, gameId });
          this.connectAIPlayersToMatch({ id: matchId, game_id: gameId });
        } else {
          console.log(`⏭️ [AI Manager] 跳过通知 - 不符合条件:`, { operation, status, matchId });
        }
      });
      
      // 启动时扫描已有的playing状态matches
      this.initialScanPlayingMatches();
    });
  }

  /**
   * 启动时扫描已有的playing状态matches
   */
  async initialScanPlayingMatches() {
    try {
      console.log('🔍 [AI Manager] 启动时扫描playing状态的matches...');
      
      const apiServerUrl = process.env.API_SERVER_URL || 'http://api-server:8001';
      const internalServiceKey = process.env.INTERNAL_SERVICE_KEY || 'internal-service-secret-key-2024';
      
      const response = await fetch(`${apiServerUrl}/api/matches?status=playing`, {
        headers: {
          'x-internal-service-key': internalServiceKey
        }
      });
      
      const result = await response.json();
      
      if (result.code === 200 && result.data) {
        const playingMatches = result.data;
        console.log(`📊 [AI Manager] 发现 ${playingMatches.length} 个playing状态的matches`);
        
        // 为每个playing状态的match连接AI玩家
        for (const match of playingMatches) {
          await this.connectAIPlayersToMatch(match);
        }
        
        console.log('✅ [AI Manager] 初始扫描完成');
      } else {
        console.log('⚠️ [AI Manager] 初始扫描API调用失败或返回异常:', result);
      }
    } catch (error) {
      console.error('❌ [AI Manager] 初始扫描失败:', error);
    }
  }

  /**
   * 获取Match中的AI玩家
   */
  async getAIPlayersInMatch(matchId) {
    try {
      console.log(`🔍 [AI Manager] 获取Match ${matchId} 中的AI玩家...`);
      const apiServerUrl = process.env.API_SERVER_URL || 'http://api-server:8001';
      const internalServiceKey = process.env.INTERNAL_SERVICE_KEY || 'internal-service-secret-key-2024';
      
      const response = await fetch(`${apiServerUrl}/api/matches/${matchId}`, {
        headers: {
          'x-internal-service-key': internalServiceKey
        }
      });
      const result = await response.json();
      console.log(`📊 [AI Manager] API响应:`, { code: result.code, playersCount: result.data?.players?.length || 0 });
      
      if (result.code === 200 && result.data?.players) {
        const aiPlayers = result.data.players.filter(player => 
          player.playerType === 'ai' && player.status === 'joined'
        );
        console.log(`🤖 [AI Manager] 找到 ${aiPlayers.length} 个AI玩家需要连接`);
        return aiPlayers;
      }
      console.log(`⚠️ [AI Manager] 未找到有效的玩家数据`);
      return [];
    } catch (error) {
      console.error(`❌ [AI Manager] 获取Match ${matchId} 中的AI玩家失败:`, error);
      return [];
    }
  }

  /**
   * 让Match中的AI玩家加入游戏
   */
  async connectAIPlayersToMatch(match) {
    try {
      console.log(`🔄 [AI Manager] 处理Match: ${match.id}`);
      
      // 获取Match中的AI玩家
      const aiPlayers = await this.getAIPlayersInMatch(match.id);
      
      for (const aiPlayer of aiPlayers) {
        // 让AI玩家加入游戏
        await this.connectAIPlayerToMatch(aiPlayer, match.id, match.game_id);
      }
    } catch (error) {
      console.error(`处理Match ${match.id} 失败:`, error);
    }
  }

  async connectAIPlayerToMatch(aiPlayer, matchId, gameId) {
    console.log(`🎮 [AI Manager] 开始连接AI玩家到Match:`, {
      aiPlayerId: aiPlayer.playerId,
      playerName: aiPlayer.player_name,
      matchId,
      gameId
    });
    
    try {
      // 仅在提供或已有记录时使用gameId，不做默认fallback
      if (!gameId) {
        console.error(`❌ [AI Manager] 缺少gameId参数`);
        throw new Error('缺少gameId');
      }
 
      // 先断开并移除现有客户端
      let existingClient = this.clients.get(aiPlayer.playerId);
      if (existingClient) {
        console.log(`🔌 [AI Manager] 断开现有AI客户端:`, { aiPlayerId: aiPlayer.playerId });
        existingClient.disconnect();
        this.clients.delete(aiPlayer.playerId);
      }
      
      // 每次都创建新的连接实例
      const clientConfig = {
        id: aiPlayer.seatIndex, // 使用 seatIndex 作为 boardgame.io 的 playerID
        seatIndex: aiPlayer.seatIndex,
        playerName: aiPlayer.playerName, // 使用 aiPlayer 的玩家名字
        gameType: gameId,
        matchId: matchId,
        gameServerUrl: process.env.GAME_SERVER_URL || 'http://game-server:8000',
        aiClientEndpoint: aiPlayer.clientEndpoint
      };
      
      console.log(`🆕 [AI Manager] 创建新的AI客户端:`, clientConfig);
      const client = new AIPlayerConnection(clientConfig);
      this.clients.set(aiPlayer.playerId, client);
      console.log(`✅ [AI Manager] AI客户端已创建并存储到内存`);
 
      // 如果内存客户端存在，连接到游戏服务器
      if (client && typeof client.connect === 'function') {
        console.log(`🔗 [AI Manager] 连接AI客户端到游戏服务器:`, {
          aiPlayerId: aiPlayer.playerId,
          matchId,
          gameId
        });
        await client.connect();
        console.log(`✅ [AI Manager] AI客户端已成功连接到Match: ${matchId}`);
      } else {
        console.warn(`⚠️ [AI Manager] 客户端不存在或缺少connect方法:`, {
          hasClient: !!client,
          hasConnectMethod: client && typeof client.connect === 'function'
        });
      }
 
      const result = {
        id: aiPlayer.id,
        matchId,
        gameType: gameId,
        status: 'assigned'
      };
      console.log(`🎯 [AI Manager] AI玩家连接完成:`, result);
      return result;
    } catch (error) {
      console.error(`❌ [AI Manager] 连接AI玩家到游戏失败:`, {
        aiPlayerId: aiPlayer.id,
        matchId,
        gameId,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * 关闭AI Manager
   */
  async shutdown() {
    try {
      console.log('🔄 [AI Manager] 正在关闭...');
      
      // 断开所有AI玩家连接
      for (const [clientId, client] of this.clients.entries()) {
        if (typeof client.disconnect === 'function') {
          await client.disconnect();
        }
      }
      this.clients.clear();
      
      // 关闭PostgreSQL监听器
      if (this.pgListener) {
        await this.pgListener.close();
      }
      
      console.log('✅ [AI Manager] 已关闭');
    } catch (error) {
      console.error('❌ [AI Manager] 关闭时出错:', error);
    }
  }
}

module.exports = { AIPlayerSessionManager };
