import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Client } from 'boardgame.io/react';
import { SocketIO } from 'boardgame.io/multiplayer'
import { TicTacToe, Gomoku } from '@qame/games';
import TicTacToeBoard from '../games/TicTacToeBoard';
import GomokuBoard from '../games/GomokuBoard';
import { api } from '@qame/shared-utils';
import { deleteMatchWithConfirm } from '../utils/matchUtils';
import { useDialog, useToast, DialogRenderer } from '@qame/shared-ui';

const GameView = ({ matchID, playerID, playerName, gameName = 'tic-tac-toe', onReturnToLobby, isSpectator = false }) => {
  const [matchInfo, setMatchInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [playerCredentials, setPlayerCredentials] = useState(null);
  const [credentialsLoading, setCredentialsLoading] = useState(true);
  const clientRef = useRef(null);
  const gameEndProcessedRef = useRef(false);
  
  // Dialog和Toast钩子
  const { confirm, dialogs } = useDialog();
  const { success: toastSuccess, error: toastError, ToastContainer } = useToast();
  
  // 创建toast对象以兼容deleteMatchWithConfirm函数
  const toast = { success: toastSuccess, error: toastError };
  
  // 游戏显示名称状态
  const [gameDisplayName, setGameDisplayName] = useState(gameName);

  // 游戏结束处理函数
  const handleGameEnd = async (gameResult) => {
    if (gameEndProcessedRef.current) {
      console.log('🎯 游戏结束已处理，跳过重复调用');
      return;
    }

    try {
      gameEndProcessedRef.current = true;
      console.log('🎯 检测到游戏结束，更新match状态:', { matchID, gameResult });
      
      const response = await api.updateMatchStatus(matchID, 'finished');
      
      if (response.code === 200) {
        console.log('✅ Match状态更新成功:', response.data);
        // 更新本地matchInfo状态
        setMatchInfo(prev => prev ? { ...prev, status: 'finished' } : null);
      } else {
        console.error('❌ Match状态更新失败:', response.message);
      }
    } catch (error) {
      console.error('❌ 更新match状态出错:', error);
      // 重置标志以允许重试
      gameEndProcessedRef.current = false;
    }
  };

  // 从API获取游戏显示名称
  useEffect(() => {
    const fetchGameInfo = async () => {
      try {
        const response = await api.getGames();
        if (response.code === 200) {
          const game = response.data.games.find(g => g.id === gameName);
          if (game && game.name) {
            setGameDisplayName(game.name);
          }
        }
      } catch (error) {
        console.error('获取游戏信息失败:', error);
        // 保持默认值
      }
    };

    fetchGameInfo();
  }, [gameName]);
  // 获取match信息
  useEffect(() => {
    const fetchMatchInfo = async () => {
      try {
        // 首先尝试通过我们的API获取match信息
        const matchResponse = await api.getMatches();
        if (matchResponse.code === 200) {
          // 找到对应的match
          const currentMatch = matchResponse.data.find(match => 
            match.bgio_match_id === matchID || match.id === matchID
          );
          if (currentMatch) {
            setMatchInfo(currentMatch);
          }
        }
      } catch (error) {
        console.error('获取match信息失败:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchMatchInfo();
  }, [matchID]);

  // 获取playerCredentials - 观战模式下不需要credentials
  useEffect(() => {
    const fetchCredentials = async () => {
      if (isSpectator) {
        setCredentialsLoading(false);
        setPlayerCredentials(null);
        return;
      }

      try {
        setCredentialsLoading(true);
        console.log('🔐 获取playerCredentials for matchID:', matchID);
        
        const response = await api.getCredentials(matchID);
        
        if (response.code === 200) {
          console.log('✅ 获取playerCredentials成功:', response.data);
          setPlayerCredentials(response.data.playerCredentials);
        } else {
          console.error('❌ 获取playerCredentials失败:', response.message);
        }
      } catch (error) {
        console.error('❌ 获取playerCredentials出错:', error);
      } finally {
        setCredentialsLoading(false);
      }
    };

    if (matchID) {
      fetchCredentials();
    }
  }, [matchID, isSpectator]);

  // 创建GameClient组件 - 观战模式下直接创建，选手模式需要credentials
  const GameClient = useMemo(() => {
    // 如果不是观战模式且还在加载credentials，不创建客户端
    if (!isSpectator && (credentialsLoading || !playerCredentials)) {
      console.log('⏳ 等待playerCredentials加载...', { credentialsLoading, playerCredentials });
      return null;
    }

    try {
      console.log('🔌 创建boardgame.io客户端:', {
        server: window.location.origin,
        gameServer: window.location.origin,
        willPassPropsAtRender: true
      });

      // 根据游戏名称选择对应的游戏和棋盘组件
      const getGameConfig = () => {
        switch (gameName) {
          case 'gomoku':
            return {
              game: Gomoku,
              board: (props) => <GomokuBoard {...props} matchInfo={matchInfo} onGameEnd={onGameEnd} />
            };
          case 'tic-tac-toe':
          default:
            return {
              game: TicTacToe,
              board: (props) => <TicTacToeBoard {...props} matchInfo={matchInfo} onGameEnd={onGameEnd} />
            };
        }
      };

      const gameConfig = getGameConfig();

      const ClientComponent = Client({
        game: gameConfig.game,
        board: gameConfig.board,
        debug: false, // 关闭debug模式以减少日志输出
        multiplayer: SocketIO({ 
          server: window.location.origin
        })
      });

      return ClientComponent;
    } catch (error) {
      console.error('❌ 创建GameClient失败:', error);
      return null;
    }
  }, [matchID, playerID, playerName, playerCredentials, credentialsLoading, matchInfo]);

  // 游戏结束处理回调 - 通过棋盘组件传递
  const onGameEnd = (gameoverState) => {
    if (!gameEndProcessedRef.current && gameoverState) {
      console.log('🎯 通过棋盘组件检测到游戏结束状态:', gameoverState);
      handleGameEnd(gameoverState);
    }
  };

  // 重置游戏结束处理标志
  useEffect(() => {
    if (matchID) {
      gameEndProcessedRef.current = false;
    }
  }, [matchID]);

  // 组件卸载时的清理
  useEffect(() => {
    return () => {
      // 清理客户端引用
      clientRef.current = null;
      // 重置游戏结束处理标志
      gameEndProcessedRef.current = false;
    };
  }, []);

  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ 
        backgroundColor: 'white', 
        padding: '20px', 
        borderRadius: '8px',
        border: '1px solid #dee2e6',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
      }}>
        <div style={{ marginBottom: '20px', textAlign: 'center' }}>
          <h2 style={{ color: '#495057', marginBottom: '10px' }}>
            🎮 {gameDisplayName}游戏
            {isSpectator && <span style={{ color: '#6c757d', fontSize: '16px', marginLeft: '10px' }}>(观战模式)</span>}
          </h2>
          <p style={{ color: '#666', fontSize: '14px', marginBottom: '15px' }}>
            Match ID: {matchID}
          </p>
          
          {/* 选手信息 */}
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            gap: '20px',
            marginBottom: '10px',
            flexWrap: 'wrap'
          }}>
            {loading ? (
              <p style={{ color: '#666', fontSize: '14px' }}>加载选手信息...</p>
            ) : matchInfo && matchInfo.players ? (
              matchInfo.players.map((player, index) => (
                <div
                  key={player.id || index}
                  style={{
                    backgroundColor: player.seatIndex.toString() === playerID ? '#e7f3ff' : '#f8f9fa',
                    border: player.seatIndex.toString() === playerID ? '2px solid #007bff' : '1px solid #dee2e6',
                    borderRadius: '8px',
                    padding: '10px 15px',
                    minWidth: '120px',
                    textAlign: 'center'
                  }}
                >
                  <div style={{ 
                    fontSize: '16px', 
                    fontWeight: 'bold',
                    color: player.seatIndex === 0 ? '#f44336' : '#2196f3',
                    marginBottom: '5px'
                  }}>
                    {player.isAI ? '🤖' : '👤'} {player.seatIndex === 0 ? 'X' : 'O'}
                  </div>
                  <div style={{ fontSize: '14px', color: '#666' }}>
                    {player.playerName}
                  </div>
                  <div style={{ fontSize: '12px', color: '#999', marginTop: '2px' }}>
                    {player.seatIndex.toString() === playerID ? '(你)' : `座位 ${player.seatIndex}`}
                  </div>
                </div>
              ))
            ) : (
              <div style={{
                backgroundColor: '#e7f3ff',
                border: '2px solid #007bff',
                borderRadius: '8px',
                padding: '10px 15px',
                textAlign: 'center'
              }}>
                <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#007bff', marginBottom: '5px' }}>
                  👤 当前选手
                </div>
                <div style={{ fontSize: '14px', color: '#666' }}>
                  {playerName}
                </div>
                <div style={{ fontSize: '12px', color: '#999', marginTop: '2px' }}>
                  ID: {playerID}
                </div>
              </div>
            )}
          </div>
          
          {/* Match状态 */}
          {matchInfo && (
            <p style={{ color: '#666', fontSize: '12px' }}>
              状态: <span style={{ 
                color: matchInfo.status === 'playing' ? '#28a745' : '#6c757d',
                fontWeight: 'bold'
              }}>
                {matchInfo.status === 'waiting' ? '等待中' : 
                 matchInfo.status === 'playing' ? '游戏中' : 
                 matchInfo.status === 'finished' ? '已结束' : '已取消'}
              </span>
            </p>
          )}
        </div>
        
        {GameClient && (
          <GameClient 
            ref={clientRef}
            matchID={matchID}
            playerID={isSpectator ? null : playerID}
            playerName={playerName}
            credentials={isSpectator ? null : playerCredentials}
          />
        )}
        
        <div style={{ marginTop: '20px', textAlign: 'center', display: 'flex', gap: '10px', justifyContent: 'center' }}>
          <button
            onClick={() => {
              if (onReturnToLobby) {
                onReturnToLobby();
              } else {
                // 兜底方案：如果没有提供回调，使用状态管理
                window.history.back();
              }
            }}
            style={{
              padding: '8px 16px',
              backgroundColor: '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            返回对战大厅
          </button>
          
          {!isSpectator && (
            <button
              onClick={() => {
                deleteMatchWithConfirm(matchID, {
                  confirm,
                  toast,
                  onSuccess: () => {
                    if (onReturnToLobby) {
                      onReturnToLobby();
                    } else {
                      window.history.back();
                    }
                  }
                });
              }}
              style={{
                padding: '8px 16px',
                backgroundColor: '#dc3545',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              🗑️ 删除对局
            </button>
          )}
        </div>
      </div>
      
      {/* Dialog和Toast组件 */}
       <DialogRenderer dialogs={dialogs} />
       <ToastContainer />
    </div>
  );
};

export default GameView;
