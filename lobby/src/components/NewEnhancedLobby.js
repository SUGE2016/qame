import React, { useState, useEffect } from 'react';
import { api } from '@qame/shared-utils';
import { deleteMatchWithConfirm } from '../utils/matchUtils';
import { useDialog, DialogRenderer, useToast } from '@qame/shared-ui';

const NewEnhancedLobby = ({ onGameStart }) => {
  // Toast消息系统
  const { success, error, info, warning, ToastContainer } = useToast();
  const { dialogs, confirm, showSelect } = useDialog();

  // 状态管理
  const [matches, setMatches] = useState([]);
  const [games, setGames] = useState([]);
  const [aiPlayers, setAiPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);
  const [selectedGame, setSelectedGame] = useState('');
  const [creating, setCreating] = useState(false);

  // 获取数据
  useEffect(() => {
    fetchData();
  }, [selectedGame]);

  // 专门检查match状态并自动进入游戏
  const checkMatchStatus = async () => {
    try {
      if (!currentUser) return;
      
      const matchesResponse = await api.getMatches({ gameId: selectedGame });
      console.debug('🎮 轮询获取matches', matchesResponse);
      
      if (matchesResponse.code === 200) {
        // 检查是否需要自动进入游戏  
        const userMatch = matchesResponse.data.find(match => 
          match.players?.some(p => p.playerName === currentUser.player?.player_name) && 
          match.status === 'playing'
        );
        
        if (userMatch) {
          const playerInMatch = userMatch.players.find(p => p.playerName === currentUser.player?.player_name);
          const matchId = /*userMatch.bgio_match_id || */userMatch.id;
          const seatIndex = playerInMatch.seatIndex.toString();
          
          console.log('🎮 准备进入游戏:', {
            userMatch,
            playerInMatch,
            matchId,
            seatIndex,
            selectedGame,
            onGameStart: typeof onGameStart
          });
          
          info('游戏已开始，正在进入...');
          onGameStart(matchId, seatIndex, currentUser.username, selectedGame);
        }
      }
    } catch (error) {
      console.error('检查match状态失败:', error);
    }
  };

  // 智能轮询effect
  useEffect(() => {
    if (!currentUser) return;
    console.debug('🎮 轮询开始', matches, currentUser);
    
    // 检查当前用户是否参与了某个活跃的match
    const userInActiveMatch = matches.some(match => 
      ['waiting', 'ready', 'playing'].includes(match.status) && 
      match.players?.some(p => p.playerName === currentUser.player?.player_name)
    );
    
    // 智能轮询：参与match时高频(1秒)，否则低频(30秒)
    const pollInterval = userInActiveMatch ? 1000 : 30000;
    console.debug('🎮 轮询间隔:', pollInterval);
    
    const interval = setInterval(checkMatchStatus, pollInterval);
    
    return () => clearInterval(interval);
  }, [matches, currentUser, selectedGame]);

  // 检查playing状态的match是否已结束
  const checkPlayingMatches = async (playingMatches) => {
    try {
      let hasFinishedGames = false;
      for (const match of playingMatches) {
        try {
          const response = await api.checkGameStatus(match.id);
          if (response.code === 200 && response.data?.status === 'finished') {
            console.log(`Match ${match.id} 已结束:`, response.data.gameResult);
            info(`游戏 ${match.id.substring(0, 8)}... 已结束！`);
            hasFinishedGames = true;
          }
        } catch (error) {
          // 单个match检查失败不影响其他的
          console.error(`检查match ${match.id} 状态失败:`, error);
        }
      }
      
      // 如果有游戏结束，延迟1秒后重新获取数据以显示最新状态
      if (hasFinishedGames) {
        setTimeout(() => {
          console.log('检测到游戏结束，重新获取match列表');
          fetchData();
        }, 1000);
      }
    } catch (error) {
      console.error('检查playing matches失败:', error);
    }
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      
      // 获取当前用户信息
      const userData = sessionStorage.getItem('user');
      if (userData) {
        setCurrentUser(JSON.parse(userData));
      }

      // 并行获取数据
      const [gamesResponse, aiPlayersResponse, matchesResponse] = await Promise.all([
        api.getGames(),
        api.getActivePlayers(),
        api.getMatches({ gameId: selectedGame })
      ]);

      if (gamesResponse.code === 200) {
        setGames(gamesResponse.data);
        // 如果没有选择游戏且有可用游戏，选择第一个
        if (gamesResponse.data.length > 0 && !selectedGame) {
          setSelectedGame(gamesResponse.data[0].id);
        }
        // 如果当前选择的游戏不在新获取的游戏列表中，重置选择
        if (selectedGame && !gamesResponse.data.some(game => game.id === selectedGame)) {
          setSelectedGame(gamesResponse.data.length > 0 ? gamesResponse.data[0].id : '');
        }
      }

      if (aiPlayersResponse.code === 200) {
        setAiPlayers(aiPlayersResponse.data?.players||[]);
      }

      if (matchesResponse.code === 200) {
        setMatches(matchesResponse.data);
        
        // 自动检查所有playing状态的match，看是否需要更新为finished状态
        const playingMatches = matchesResponse.data.filter(match => match.status === 'playing');
        if (playingMatches.length > 0) {
          checkPlayingMatches(playingMatches);
        }
      }
    } catch (error) {
      console.error('获取数据失败:', error);
    } finally {
      setLoading(false);
    }
  };

  // 创建新Match
  const createMatch = async () => {
    try {
      setCreating(true);

      const response = await api.createMatch({
        gameId: selectedGame,
        gameConfig: {
        }
      });

      if (response.code === 200) {
        console.log('Match创建成功:', response.data);
        // 刷新match列表
        await fetchData();
        success('Match创建成功！');
      } else {
        error(`创建失败: ${response.message}`);
      }
    } catch (error) {
      console.error('创建match失败:', error);
      error('创建match失败，请检查网络连接');
    } finally {
      setCreating(false);
    }
  };

  // 添加AI玩家
  const addAIPlayer = async (matchId, aiPlayerId, seatIndex = null) => {
    try {
      const aiPlayer = aiPlayers.find(p => p.id === aiPlayerId);
      if (!aiPlayer) {
        throw new Error('AI玩家不存在');
      }

      const response = await api.addPlayerToMatch(matchId, {
        playerId: aiPlayerId,  // aiPlayerId 实际上就是 AI 在 players 表中的 id
        seatIndex: seatIndex
      });

      if (response.code === 200) {
        console.log('AI玩家添加成功:', response.data);
        success(`AI玩家 ${aiPlayer.player_name} 添加成功！`);
        // 刷新match列表
        await fetchData();
      } else {
        error(`添加AI失败: ${response.message}`);
      }
    } catch (error) {
      console.error('添加AI玩家失败:', error);
      error('添加AI玩家失败: ' + error.message);
    }
  };

  // 离开Match
  const leaveMatch = async (matchId, playerId) => {
    try {
      const response = await api.removePlayerFromMatch(matchId, playerId);

      if (response.code === 200) {
        console.log('离开成功');
        success('成功离开Match！');
        // 刷新match列表
        await fetchData();
      } else {
        error(`离开失败: ${response.message}`);
      }
    } catch (error) {
      console.error('离开match失败:', error);
      error('离开match失败');
    }
  };

  // 删除Match
  const deleteMatch = async (matchId) => {
    const toast = { success, error };
    deleteMatchWithConfirm(matchId, {
      confirm,
      toast,
      onSuccess: async () => {
        // 刷新match列表
        await fetchData();
      }
    });
  };

  // 开始Match（创建者）
  const startMatch = async (matchId) => {
    try {
      const response = await api.startMatch(matchId);

      if (response.code === 200) {
        success('游戏开始！所有玩家正在自动进入游戏...');
        await fetchData();
      } else {
        error(`开始失败: ${response.message}`);
      }
    } catch (error) {
      console.error('开始游戏失败:', error);
      error('开始游戏失败');
    }
  };

  // 获取玩家在match中的信息
  const getPlayerInMatch = (match) => {
    if (!currentUser?.player) return null;
    return match.players?.find(p => p.id === currentUser.player.id);
  };

  // 检查是否是创建者
  const isCreator = (match) => {
    return currentUser && match.creator_id === currentUser.id;
  };

  // 预设AI已废弃：不再渲染预设AI选择器

  // 处理点击空座位
  const handleSeatClick = async (matchId, seatIndex) => {
    const match = matches.find(m => m.id === matchId);
    if (!match || match.status !== 'waiting') return;

    const playerInMatch = getPlayerInMatch(match);
    const isMatchCreator = isCreator(match);
    
    // 构建选项列表
    let options = [];
    
    // 如果玩家还没有在比赛中，可以加入
    if (!playerInMatch) {
      options.push('👤 我要加入');
    }
    
    // 如果是创建者，可以添加AI（无论自己是否已在比赛中）
    if (isMatchCreator) {
      options.push('🤖 添加AI');
    }
    
    // 如果没有可用选项
    if (options.length === 0) {
      if (playerInMatch) {
        warning('您已经在此比赛中了，无法再次加入');
      } else {
        warning('您没有权限操作此座位');
      }
      return;
    }
    
    // 使用简单的选择对话框
    const choiceIndex = await showSelect({
      title: `选择操作 (座位 ${seatIndex + 1})`,
      options
    });
    if (choiceIndex === null) return;
    
    const selectedOption = options[choiceIndex];
    
    if (selectedOption === '👤 我要加入') {
      // 玩家自己加入
      await joinAsHuman(matchId, seatIndex);
    } else if (selectedOption === '🤖 添加AI') {
      // 添加AI
      await addOnlineAIToMatchWithSeat(matchId, seatIndex);
    }
  };

  // 加入指定座位作为人类玩家
  const joinAsHuman = async (matchId, seatIndex) => {
    try {
      // 使用已缓存的player信息，避免重复API调用
      if (!currentUser?.player?.id) {
        throw new Error('用户玩家信息不可用，请重新登录');
      }
      
      const response = await api.addPlayerToMatch(matchId, {
        playerId: currentUser.player.id,
        seatIndex: seatIndex
      });

      if (response.code === 200) {
        console.log('加入成功:', response.data);
        success(`成功加入座位 ${seatIndex + 1}！`);
        await fetchData();
      } else {
        error(`加入失败: ${response.message}`);
      }
    } catch (error) {
      console.error('加入match失败:', error);
      error('加入失败，请检查网络连接');
    }
  };

  // 添加AI到指定座位
  const addOnlineAIToMatchWithSeat = async (matchId, seatIndex) => {
    try {
      // 检查是否有可用的AI玩家
      if (aiPlayers.length === 0) {
        warning('没有可用的AI玩家，请先在AI管理中心创建AI玩家');
        return;
      }

      // 让用户选择AI玩家
      let selectedPlayer = aiPlayers[0];

      if (aiPlayers.length > 1) {
        const options = aiPlayers.map((player, i) => 
          `${i + 1}. ${player.player_name} (${player.client_name})`
        );
        
        const idx = await showSelect({ 
          title: '选择要加入的AI玩家', 
          options 
        });
        
        if (idx !== null && aiPlayers[idx]) {
          selectedPlayer = aiPlayers[idx];
        } else {
          return; // 用户取消选择
        }
      }

      // 添加AI玩家到指定座位
      await addAIPlayer(matchId, selectedPlayer.id, seatIndex);

    } catch (e) {
      console.error(e);
      error('添加AI失败');
    }
  };

  // 渲染Match卡片
  const renderMatchCard = (match) => {
    const playerInMatch = getPlayerInMatch(match);
    const isMatchCreator = isCreator(match);
    
    // 检查是否可以开始游戏
    const canStart = isMatchCreator && 
      match.status === 'waiting' &&
      match.currentPlayerCount >= match.min_players && 
      match.currentPlayerCount <= match.max_players &&
      match.bgio_match_id;
      
    // 调试信息
    if (isMatchCreator) {
      console.log(`🎮 开始游戏按钮检查 (Match ${match.id.substring(0, 8)}):`, {
        isMatchCreator,
        status: match.status,
        playerCount: match.currentPlayerCount,
        minPlayers: match.min_players,
        maxPlayers: match.max_players,
        bgioMatchId: match.bgio_match_id,
        canStart
      });
    }

    return (
      <div
        key={match.id}
        style={{
          border: '1px solid #ddd',
          borderRadius: '8px',
          padding: '16px',
          backgroundColor: playerInMatch ? '#e7f3ff' : '#f8f9fa',
          marginBottom: '12px'
        }}
      >
        {/* Match信息头部 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '6px' }}>
              <strong>Match ID: {match.id.substring(0, 8)}...</strong>


            </div>
            
            <div style={{ fontSize: '13px', color: '#666', lineHeight: '1.4' }}>
              <div>状态: <span style={{ 
                color: match.status === 'waiting' ? '#007bff' : 
                      match.status === 'playing' ? '#28a745' : '#6c757d',
                fontWeight: 'bold'
              }}>
                {match.status === 'waiting' ? '等待玩家' : 
                 match.status === 'playing' ? '游戏中' : 
                 match.status === 'finished' ? '已结束' : '已取消'}
              </span></div>
              <div>玩家: {match.currentPlayerCount}/{match.max_players}</div>
              <div>创建者: {match.creator_name}</div>
              <div>创建时间: {new Date(match.created_at).toLocaleString()}</div>
            </div>
          </div>

          {/* 操作按钮 */}
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            {/* 创建者专属按钮 */}
            {isMatchCreator && (
              <>
                {canStart && (
                  <button
                    onClick={() => startMatch(match.id)}
                    style={{
                      padding: '4px 8px',
                      backgroundColor: '#28a745',
                      color: 'white',
                      border: 'none',
                      borderRadius: '3px',
                      cursor: 'pointer',
                      fontSize: '11px'
                    }}
                  >
                    开始游戏
                  </button>
                )}

                <button
                  onClick={() => deleteMatch(match.id)}
                  style={{
                    padding: '4px 8px',
                    backgroundColor: '#dc3545',
                    color: 'white',
                    border: 'none',
                    borderRadius: '3px',
                    cursor: 'pointer',
                    fontSize: '11px'
                  }}
                >
                  删除
                </button>
              </>
            )}
          </div>
        </div>

        {/* 座位列表 */}
        <div style={{ 
          backgroundColor: 'rgba(0,0,0,0.05)', 
          padding: '8px', 
          borderRadius: '4px',
          fontSize: '12px'
        }}>
          <strong>玩家列表:</strong>
          <div style={{ marginTop: '4px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {(() => {
              // 创建座位数组
              const seats = Array(match.max_players).fill(null);
              // 填充已占用的座位
              if (match.players) {
                match.players.forEach(player => {
                  if (player.seatIndex !== undefined && player.seatIndex !== null) {
                    seats[player.seatIndex] = player;
                  }
                });
              }
              
              return seats.map((player, seatIndex) => (
                <div
                  key={seatIndex}
                  style={{ 
                    display: 'inline-flex',
                    alignItems: 'center',
                    backgroundColor: player 
                      ? (player.isAI ? '#e9ecef' : '#d4edda')
                      : (match.status === 'waiting' ? '#f8f9fa' : '#e9ecef'),
                    padding: '2px 6px',
                    borderRadius: '3px',
                    border: player 
                      ? `1px solid ${player.isAI ? '#adb5bd' : '#c3e6cb'}`
                      : (match.status === 'waiting' ? '1px dashed #6c757d' : '1px solid #dee2e6'),
                    cursor: (!player && match.status === 'waiting') ? 'pointer' : 'default',
                    minWidth: '60px',
                    justifyContent: 'center'
                  }}
                  onClick={() => {
                    if (!player && match.status === 'waiting') {
                      handleSeatClick(match.id, seatIndex);
                    }
                  }}
                  title={!player && match.status === 'waiting' ? '点击选择加入方式' : ''}
                >
                  {player ? (
                    <>
                      {player.isAI ? '🤖' : '👤'} {player.playerName}
                      {/* 显示离开按钮：玩家自己或创建者可以移除 */}
                      {(match.status === 'waiting' && (
                        (player.id === currentUser.player?.id) ||   // 玩家自己
                        (isMatchCreator)                           // 或创建者
                      )) && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            leaveMatch(match.id, player.id);
                          }}
                          style={{
                            marginLeft: '4px',
                            padding: '0 4px',
                            fontSize: '10px',
                            backgroundColor: '#dc3545',
                            color: 'white',
                            border: 'none',
                            borderRadius: '2px',
                            cursor: 'pointer'
                          }}
                          title={player.id === currentUser.player?.id ? '离开游戏' : `移除 ${player.playerName}`}
                        >
                          ×
                        </button>
                      )}
                    </>
                  ) : (
                    <span style={{ color: '#6c757d', fontSize: '11px' }}>
                      {match.status === 'waiting' ? '空位' : '空'}
                    </span>
                  )}
                </div>
              ));
            })()}
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '50px' }}>
        <div>🔄 加载中...</div>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
        <h1 style={{ margin: 0 }}>🎮 游戏大厅</h1>

      </div>
      
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '20px', alignItems: 'start' }}>
        {/* 左侧配置面板 */}
        <div style={{ 
          backgroundColor: '#f8f9fa', 
          padding: '20px', 
          borderRadius: '8px',
          border: '1px solid #dee2e6',
          height: 'fit-content'
        }}>
          {/* 用户信息 */}
          {currentUser && (
            <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#e7f3ff', borderRadius: '6px' }}>
              <h4 style={{ marginBottom: '10px', color: '#0056b3' }}>👤 当前用户</h4>
              <p style={{ margin: '0', fontSize: '14px' }}>
                <strong>用户名:</strong> {currentUser.username}
              </p>
              <p style={{ margin: '5px 0 0 0', fontSize: '14px' }}>
                <strong>角色:</strong> {currentUser.role === 'admin' ? '管理员' : '用户'}
              </p>
            </div>
          )}

          {/* 游戏选择 */}
          <div style={{ marginBottom: '20px' }}>
            <h4 style={{ marginBottom: '15px', color: '#495057', fontWeight: 'bold' }}>
              🎮 选择游戏类型
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {Array.isArray(games) && games.length > 0 ? games.map(game => (
                <div
                  key={game.id}
                  onClick={() => setSelectedGame(game.id)}
                  style={{
                    padding: '12px 15px',
                    backgroundColor: selectedGame === game.id ? '#007bff' : 'white',
                    color: selectedGame === game.id ? 'white' : '#495057',
                    border: `2px solid ${selectedGame === game.id ? '#007bff' : '#dee2e6'}`,
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: selectedGame === game.id ? 'bold' : 'normal',
                    transition: 'all 0.2s ease',
                    textAlign: 'center'
                  }}
                  onMouseEnter={(e) => {
                    if (selectedGame !== game.id) {
                      e.target.style.backgroundColor = '#f8f9fa';
                      e.target.style.borderColor = '#adb5bd';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (selectedGame !== game.id) {
                      e.target.style.backgroundColor = 'white';
                      e.target.style.borderColor = '#dee2e6';
                    }
                  }}
                >
                  {game.displayName || game.name}
                </div>
              )) : (
                <div style={{
                  padding: '12px 15px',
                  backgroundColor: '#f8f9fa',
                  color: '#6c757d',
                  border: '1px solid #dee2e6',
                  borderRadius: '6px',
                  textAlign: 'center',
                  fontSize: '14px'
                }}>
                  暂无可用游戏
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 右侧Match列表 */}
        <div style={{ 
          backgroundColor: 'white',
          padding: '20px',
          borderRadius: '8px',
          border: '1px solid #dee2e6',
          minHeight: '400px',
          height: 'fit-content'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h3 style={{ margin: 0, color: '#495057' }}>🎮 比赛列表</h3>
            <button
              onClick={fetchData}
              style={{
                padding: '6px 12px',
                backgroundColor: '#6c757d',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '12px'
              }}
            >🔄
            </button>
            {/* 创建新Match */}
            <button
              onClick={createMatch}
              disabled={!selectedGame || creating}
              style={{
                padding: '6px 12px',
                backgroundColor: !selectedGame || creating ? '#6c757d' : '#007bff',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: !selectedGame || creating ? 'not-allowed' : 'pointer',
                fontSize: '12px'
              }}
            >
              {creating ? '创建中...' : '🎮 创建比赛'}
            </button>
          </div>
          
          {matches.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
                <p>暂无可用的Match</p>
                <p style={{ fontSize: '14px', marginTop: '10px' }}>创建一个新的Match来开始游戏吧！</p>
              </div>
            ) : (
              <div>
                {matches.map(match => renderMatchCard(match))}
              </div>
            )}
        </div>


      </div>
      <ToastContainer />
      <DialogRenderer dialogs={dialogs} />
    </div>
  );
};

export default NewEnhancedLobby