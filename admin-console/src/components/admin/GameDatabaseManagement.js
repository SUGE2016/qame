import React, { useState, useEffect } from 'react';
import { LobbyClient } from 'boardgame.io/client';

const GameDatabaseManagement = () => {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // 获取 game server 地址（使用环境变量）
  const gameServerUrl = process.env.REACT_APP_GAME_SERVER || 'http://game-server:8000';

  useEffect(() => {
    loadAllMatches();
  }, []);

  const loadAllMatches = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const lobbyClient = new LobbyClient({ server: gameServerUrl });
      
      // 获取所有游戏
      const games = await lobbyClient.listGames();
      console.log('可用游戏:', games);
      
      let allMatches = [];
      
      // 为每个游戏获取 matches
      for (const game_name of games) {
        try {
          const {matches = []} = await lobbyClient.listMatches(game_name);
          // 为每个 match 添加游戏名称信息
          const matchesWithGameName = matches.map(match => ({
            ...match,
            gameName: game_name
          }));
          allMatches = [...allMatches, ...matchesWithGameName];
        } catch (gameError) {
          console.warn(`获取游戏 ${game_name} 的 matches 失败:`, gameError);
        }
      }
      
      setMatches(allMatches);
      console.log('所有 matches:', allMatches);
      
    } catch (err) {
      console.error('加载数据失败:', err);
      setError(`加载失败: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const formatPlayerInfo = (players) => {
    if (!players || players.length === 0) return '无选手';
    
    return players.map((player, index) => {
      const name = player.name || `选手${index}`;
      const _id = player.id || 'n/a';
      const data = JSON.stringify(player.data || {});
      return `${name}(${_id})|${data}`;
    }).join(', ');
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleString('zh-CN');
  };

  return (
    <div>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: '20px' 
      }}>
        <h3>🎮 游戏数据库 - Matches 列表</h3>
        <button
          onClick={loadAllMatches}
          disabled={loading}
          style={{
            padding: '8px 16px',
            backgroundColor: loading ? '#ccc' : '#3498db',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: loading ? 'not-allowed' : 'pointer'
          }}
        >
          {loading ? '加载中...' : '🔄 刷新'}
        </button>
      </div>

      {error && (
        <div style={{ 
          color: 'red', 
          marginBottom: '20px',
          padding: '10px',
          backgroundColor: '#fee',
          borderRadius: '5px',
          border: '1px solid #fcc'
        }}>
          {error}
        </div>
      )}

      <div style={{ fontSize: '14px', color: '#666', marginBottom: '10px' }}>
        Server: {gameServerUrl} | Total Matches: {matches.length}
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ 
          width: '100%', 
          borderCollapse: 'collapse',
          backgroundColor: 'white',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
        }}>
          <thead>
            <tr style={{ backgroundColor: '#f8f9fa' }}>
              <th style={{ padding: '12px', textAlign: 'left', border: '1px solid #ddd' }}>游戏类型</th>
              <th style={{ padding: '12px', textAlign: 'left', border: '1px solid #ddd' }}>Match ID</th>
              <th style={{ padding: '12px', textAlign: 'left', border: '1px solid #ddd' }}>选手信息</th>
              <th style={{ padding: '12px', textAlign: 'left', border: '1px solid #ddd' }}>创建时间</th>
              <th style={{ padding: '12px', textAlign: 'left', border: '1px solid #ddd' }}>更新时间</th>
              <th style={{ padding: '12px', textAlign: 'left', border: '1px solid #ddd' }}>设置数据</th>
            </tr>
          </thead>
          <tbody>
            {matches.length === 0 && !loading ? (
              <tr>
                <td colSpan="6" style={{ 
                  padding: '20px', 
                  textAlign: 'center', 
                  color: '#666',
                  border: '1px solid #ddd'
                }}>
                  暂无 Matches 数据
                </td>
              </tr>
            ) : (
              matches.map((match, index) => (
                <tr key={`${match.gameName}-${match.matchID}-${index}`}>
                  <td style={{ padding: '12px', border: '1px solid #ddd' }}>
                    <span style={{
                      padding: '4px 8px',
                      backgroundColor: '#e3f2fd',
                      borderRadius: '4px',
                      fontSize: '12px',
                      fontWeight: 'bold'
                    }}>
                      {match.gameName}
                    </span>
                  </td>
                  <td style={{ 
                    padding: '12px', 
                    border: '1px solid #ddd',
                    fontFamily: 'monospace',
                    fontSize: '12px'
                  }}>
                    {match.matchID}
                  </td>
                  <td style={{ padding: '12px', border: '1px solid #ddd', fontSize: '12px' }}>
                    {formatPlayerInfo(match.players)}
                  </td>
                  <td style={{ padding: '12px', border: '1px solid #ddd', fontSize: '12px' }}>
                    {formatDate(match.createdAt)}
                  </td>
                  <td style={{ padding: '12px', border: '1px solid #ddd', fontSize: '12px' }}>
                    {formatDate(match.updatedAt)}
                  </td>
                  <td style={{ 
                    padding: '12px', 
                    border: '1px solid #ddd',
                    fontSize: '11px',
                    maxWidth: '200px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}>
                    {match.setupData ? JSON.stringify(match.setupData) : '-'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default GameDatabaseManagement;