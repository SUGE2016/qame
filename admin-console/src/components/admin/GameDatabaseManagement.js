import React, { useState, useEffect } from 'react';
import { api } from '@qame/shared-utils';

const GameDatabaseManagement = () => {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadAllMatches();
  }, []);

  const loadAllMatches = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.getMatches();
      if (response.code === 200) {
        setMatches(response.data || []);
      } else {
        setError(response.message || '加载失败');
      }
    } catch (err) {
      console.error('加载数据失败:', err);
      setError(`加载失败: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const formatPlayerInfo = (players) => {
    if (!players || players.length === 0) return '无玩家';
    return players.map((player) => {
      const name = player.playerName || player.player_name || '?';
      const seat = player.seatIndex ?? player.seat_index;
      const type = player.playerType || player.player_type || '';
      return `${name}#${seat}(${type})`;
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
        <h3>🎮 对局列表（业务库）</h3>
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
        Total Matches: {matches.length}
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
              <th style={{ padding: '12px', textAlign: 'left', border: '1px solid #ddd' }}>游戏</th>
              <th style={{ padding: '12px', textAlign: 'left', border: '1px solid #ddd' }}>Match ID</th>
              <th style={{ padding: '12px', textAlign: 'left', border: '1px solid #ddd' }}>状态</th>
              <th style={{ padding: '12px', textAlign: 'left', border: '1px solid #ddd' }}>玩家</th>
              <th style={{ padding: '12px', textAlign: 'left', border: '1px solid #ddd' }}>创建时间</th>
            </tr>
          </thead>
          <tbody>
            {matches.length === 0 && !loading ? (
              <tr>
                <td colSpan="5" style={{
                  padding: '20px',
                  textAlign: 'center',
                  color: '#666',
                  border: '1px solid #ddd'
                }}>
                  暂无 Matches 数据
                </td>
              </tr>
            ) : (
              matches.map((match) => (
                <tr key={match.id}>
                  <td style={{ padding: '12px', border: '1px solid #ddd' }}>
                    {match.game_name || match.game_id}
                  </td>
                  <td style={{
                    padding: '12px',
                    border: '1px solid #ddd',
                    fontFamily: 'monospace',
                    fontSize: '12px'
                  }}>
                    {match.id}
                  </td>
                  <td style={{ padding: '12px', border: '1px solid #ddd' }}>
                    {match.status}
                  </td>
                  <td style={{ padding: '12px', border: '1px solid #ddd', fontSize: '12px' }}>
                    {formatPlayerInfo(match.players)}
                  </td>
                  <td style={{ padding: '12px', border: '1px solid #ddd', fontSize: '12px' }}>
                    {formatDate(match.created_at)}
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
