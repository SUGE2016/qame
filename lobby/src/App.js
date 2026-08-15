import React, { useState, useEffect } from 'react';
import Login from './components/Login';
import { DialogProvider } from '@qame/shared-ui';
import NewEnhancedLobby from './components/NewEnhancedLobby';
import GameView from './components/GameView';
import ReplayView from './components/ReplayView';
import { Icon } from './icons';

import { api } from '@qame/shared-utils';

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentView, setCurrentView] = useState(() => {
    // 从sessionStorage恢复视图状态
    return sessionStorage.getItem('currentView') || 'lobby';
  });

  const [gameState, setGameState] = useState(() => {
    // 从sessionStorage恢复游戏状态
    const savedGameState = sessionStorage.getItem('gameState');
    return savedGameState ? JSON.parse(savedGameState) : null;
  });


  // 检查用户是否已登录
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const data = await api.verify();
        
        if (data.code === 200) {
          // token有效，设置用户信息
          const userData = data.data?.user || data.data;
          
          // 立即获取用户的player信息
          try {
            const playerResponse = await api.getMyPlayer();
            if (playerResponse.code === 200) {
              userData.player = playerResponse.data;
              console.log('✅ 用户player信息获取成功:', playerResponse.data);
            } else {
              console.warn('⚠️ 获取用户player信息失败:', playerResponse.message);
            }
          } catch (error) {
            console.warn('⚠️ 获取用户player信息异常:', error);
          }
          
          setUser(userData);
          // 保存完整用户信息（包含player）到sessionStorage
          sessionStorage.setItem('user', JSON.stringify(userData));
        } else {
          // token无效，清除本地存储
          sessionStorage.removeItem('user');
          setUser(null);
        }
      } catch (error) {
        console.error('验证token失败:', error);
        sessionStorage.removeItem('user');
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
    // 如果是会话过期跳转回来，给出提示（可选）
    try {
      if (sessionStorage.getItem('sessionExpired') === '1') {
        sessionStorage.removeItem('sessionExpired');
        console.warn('会话已过期，请重新登录');
      }
    } catch (_) {}
  }, []);

  const handleLogin = async (userData) => {
    // 登录成功后立即获取用户的player信息
    try {
      const playerResponse = await api.getMyPlayer();
      if (playerResponse.code === 200) {
        userData.player = playerResponse.data;
        console.log('✅ 登录时player信息获取成功:', playerResponse.data);
      } else {
        console.warn('⚠️ 登录时获取用户player信息失败:', playerResponse.message);
      }
    } catch (error) {
      console.warn('⚠️ 登录时获取用户player信息异常:', error);
    }
    
    setUser(userData);
    
    // 保存完整用户信息（包含player）到sessionStorage
    sessionStorage.setItem('user', JSON.stringify(userData));
  };

  const handleLogout = async () => {
    try {
      await api.logout();
    } catch (error) {
      console.error('登出失败:', error);
    }
    
    sessionStorage.removeItem('user');
    sessionStorage.removeItem('accessToken');
    sessionStorage.removeItem('currentView');
    sessionStorage.removeItem('gameState');
    setUser(null);
    setCurrentView('lobby');
    setGameState(null);
  };

  const handleViewChange = (newView) => {
    setCurrentView(newView);
    sessionStorage.setItem('currentView', newView);
    // 只有在切换到非游戏视图且不是从游戏返回大厅时才清除游戏状态
    if (newView !== 'game' && newView !== 'lobby') {
      setGameState(null);
      sessionStorage.removeItem('gameState');
    }
  };

  const handleGameStart = (matchID, playerID, playerName, gameName) => {
    console.log('🎮 handleGameStart 被调用:', {
      matchID,
      playerID,
      playerName,
      gameName,
      currentView,
      gameState
    });
    
    const newGameState = { matchID, playerID, playerName, gameName };
    setGameState(newGameState);
    sessionStorage.setItem('gameState', JSON.stringify(newGameState));
    setCurrentView('game');
    sessionStorage.setItem('currentView', 'game');
    
    console.log('🎮 状态已更新，切换到游戏视图');
  };

  const handleReturnToLobby = () => {
    setCurrentView('lobby');
    sessionStorage.setItem('currentView', 'lobby');
    // 不清除gameState，保持游戏状态以便用户可以重新进入
  };

  const handleSpectate = (matchID, gameName) => {
    const newGameState = { matchID, gameName, spectate: true };
    setGameState(newGameState);
    sessionStorage.setItem('gameState', JSON.stringify(newGameState));
    setCurrentView('game');
    sessionStorage.setItem('currentView', 'game');
  };

  const handleReplay = (matchID, gameName) => {
    const newGameState = { ...(gameState || {}), matchID, gameName: gameName || gameState?.gameName };
    setGameState(newGameState);
    sessionStorage.setItem('gameState', JSON.stringify(newGameState));
    setCurrentView('replay');
    sessionStorage.setItem('currentView', 'replay');
  };

  if (loading) {
    return (
      <div className="q-login">
        <p className="q-hint">正在加载…</p>
      </div>
    );
  }

  // 如果用户已登录，显示游戏选择器
  if (user) {
    return (
      <DialogProvider>
        <div className="q-app">
        <header className="q-topbar">
          <div className="q-brand">
            <span className="q-brand-mark"><Icon name="grid" size={16} /></span>
            QAME
          </div>
          <div className="q-topbar-actions">
            {(() => {
              const username = user.username || user.user?.username || '玩家';
              const role = user.role || user.user?.role;
              return (
                <div className="q-user-chip" title={username}>
                  <span className="q-user-avatar" aria-hidden="true">{username.slice(0, 1).toUpperCase()}</span>
                  <span className="q-user-meta">
                    <span className="q-user-name">{username}</span>
                    <span className="q-user-role">{role === 'admin' ? '管理员' : '选手'}</span>
                  </span>
                </div>
              );
            })()}
            <button
              type="button"
              className={`q-btn q-btn-sm ${currentView === 'lobby' ? 'q-btn-primary' : 'q-btn-ghost'}`}
              onClick={() => handleViewChange('lobby')}
            >
              大厅
            </button>
            {user.role === 'admin' && (
              <button type="button" className="q-btn q-btn-sm q-btn-ghost" onClick={() => { window.location.href = '/admin/'; }}>
                管理台
              </button>
            )}
            <button type="button" className="q-btn q-btn-sm q-btn-ghost" onClick={handleLogout}>
              <Icon name="logout" size={16} />
              退出
            </button>
          </div>
        </header>
        <div className="q-main">
          {currentView === 'lobby' && (
            <NewEnhancedLobby onGameStart={handleGameStart} onReplay={handleReplay} onSpectate={handleSpectate} />
          )}
          {currentView === 'game' && gameState && (
            <GameView 
              matchID={gameState.matchID}
              playerID={gameState.playerID}
              playerName={gameState.playerName}
              gameName={gameState.gameName}
              spectate={Boolean(gameState.spectate)}
              onReturnToLobby={handleReturnToLobby}
              onReplay={handleReplay}
            />
          )}
          {currentView === 'replay' && gameState && (
            <ReplayView
              matchID={gameState.matchID}
              gameName={gameState.gameName}
              onReturnToLobby={handleReturnToLobby}
            />
          )}
        </div>
        </div>
      </DialogProvider>
    );
  }

  // 如果用户未登录，显示登录页面
  return (
    <DialogProvider>
      <Login onLogin={handleLogin} />
    </DialogProvider>
  );
}

export default App; 