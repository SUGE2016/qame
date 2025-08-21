import React, { useState, useEffect } from 'react';

const GameManagement = () => {
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingGame, setEditingGame] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', description: '', min_players: 2, max_players: 2, status: 'active' });
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState({ id: '', name: '', description: '', min_players: 2, max_players: 2, status: 'active' });
  const [error, setError] = useState('');

  useEffect(() => {
    fetchGames();
  }, []);

  const fetchGames = async () => {
    try {
      const response = await fetch(`/api/games`, {
        credentials: 'include'
      });

      const data = await response.json();
      if (data.code === 200) {
        setGames(data.data.games || []);
      } else {
        setError(data.message || '获取游戏列表失败');
      }
    } catch (error) {
      console.error('获取游戏列表失败:', error);
      setError('网络错误，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateGame = async () => {
    try {
      const response = await fetch(`/api/admin/games`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify(createForm)
      });

      const data = await response.json();
      if (data.code === 200) {
        setShowCreateForm(false);
        setCreateForm({ id: '', name: '', description: '', min_players: 2, max_players: 2, status: 'active' });
        fetchGames();
        setError('');
      } else {
        setError(data.message || '创建游戏失败');
      }
    } catch (error) {
      console.error('创建游戏失败:', error);
      setError('网络错误，请稍后重试');
    }
  };

  const handleEdit = (game) => {
    setEditingGame(game);
    setEditForm({ 
      name: game.name, 
      description: game.description || '', 
      min_players: game.min_players || 2, 
      max_players: game.max_players || 2, 
      status: game.status || 'active' 
    });
  };

  const handleSave = async () => {
    try {
      const response = await fetch(`/api/admin/games/${editingGame.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify(editForm)
      });

      const data = await response.json();
      if (data.code === 200) {
        setEditingGame(null);
        fetchGames();
        setError('');
      } else {
        setError(data.message || '更新游戏失败');
      }
    } catch (error) {
      console.error('更新游戏失败:', error);
      setError('网络错误，请稍后重试');
    }
  };

  const handleDelete = async (gameId) => {
    if (!window.confirm('确定要删除这个游戏吗？')) {
      return;
    }

    try {
      const response = await fetch(`/api/admin/games/${gameId}`, {
        method: 'DELETE',
        credentials: 'include'
      });

      const data = await response.json();
      if (data.code === 200) {
        fetchGames();
        setError('');
      } else {
        setError(data.message || '删除游戏失败');
      }
    } catch (error) {
      console.error('删除游戏失败:', error);
      setError('网络错误，请稍后重试');
    }
  };

  const handleCancel = () => {
    setEditingGame(null);
    setEditForm({ name: '', description: '', min_players: 2, max_players: 2, status: 'active' });
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '50px' }}>
        <div style={{ fontSize: '18px', color: '#666' }}>加载中...</div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: '20px' 
      }}>
        <h2 style={{ margin: 0, color: '#2c3e50' }}>🎮 游戏管理</h2>
        <button
          onClick={() => setShowCreateForm(true)}
          style={{
            backgroundColor: '#27ae60',
            color: 'white',
            border: 'none',
            padding: '10px 20px',
            borderRadius: '5px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: 'bold'
          }}
        >
          ➕ 添加游戏
        </button>
      </div>

      {error && (
        <div style={{
          backgroundColor: '#e74c3c',
          color: 'white',
          padding: '10px',
          borderRadius: '5px',
          marginBottom: '20px'
        }}>
          {error}
        </div>
      )}

      {/* 创建游戏表单 */}
      {showCreateForm && (
        <div style={{
          backgroundColor: '#f8f9fa',
          padding: '20px',
          borderRadius: '8px',
          marginBottom: '20px',
          border: '1px solid #dee2e6'
        }}>
          <h3 style={{ marginTop: 0, color: '#2c3e50' }}>创建新游戏</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>游戏ID:</label>
              <input
                type="text"
                value={createForm.id}
                onChange={(e) => setCreateForm({...createForm, id: e.target.value})}
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '14px'
                }}
                placeholder="输入游戏ID（如：tic-tac-toe）"
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>游戏名称:</label>
              <input
                type="text"
                value={createForm.name}
                onChange={(e) => setCreateForm({...createForm, name: e.target.value})}
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '14px'
                }}
                placeholder="输入游戏名称"
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>状态:</label>
              <select
                value={createForm.status}
                onChange={(e) => setCreateForm({...createForm, status: e.target.value})}
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '14px'
                }}
              >
                <option value="active">启用</option>
                <option value="inactive">禁用</option>
              </select>
            </div>
          </div>
          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>游戏描述:</label>
            <textarea
              value={createForm.description}
              onChange={(e) => setCreateForm({...createForm, description: e.target.value})}
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '14px',
                minHeight: '80px',
                resize: 'vertical'
              }}
              placeholder="输入游戏描述"
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>最少玩家数:</label>
              <input
                type="number"
                min="1"
                max="10"
                value={createForm.min_players}
                onChange={(e) => setCreateForm({...createForm, min_players: parseInt(e.target.value) || 1})}
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '14px'
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>最多玩家数:</label>
              <input
                type="number"
                min="1"
                max="10"
                value={createForm.max_players}
                onChange={(e) => setCreateForm({...createForm, max_players: parseInt(e.target.value) || 1})}
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '14px'
                }}
              />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={handleCreateGame}
              style={{
                backgroundColor: '#27ae60',
                color: 'white',
                border: 'none',
                padding: '10px 20px',
                borderRadius: '5px',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              创建
            </button>
            <button
              onClick={() => {
                setShowCreateForm(false);
                setCreateForm({ id: '', name: '', description: '', min_players: 2, max_players: 2, status: 'active' });
              }}
              style={{
                backgroundColor: '#95a5a6',
                color: 'white',
                border: 'none',
                padding: '10px 20px',
                borderRadius: '5px',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              取消
            </button>
          </div>
        </div>
      )}

      {/* 游戏列表 */}
      <div style={{
        backgroundColor: 'white',
        borderRadius: '8px',
        overflow: 'hidden',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#f8f9fa' }}>
              <th style={{ padding: '15px', textAlign: 'left', borderBottom: '1px solid #dee2e6' }}>ID</th>
              <th style={{ padding: '15px', textAlign: 'left', borderBottom: '1px solid #dee2e6' }}>游戏名称</th>
              <th style={{ padding: '15px', textAlign: 'left', borderBottom: '1px solid #dee2e6' }}>描述</th>
              <th style={{ padding: '15px', textAlign: 'left', borderBottom: '1px solid #dee2e6' }}>玩家数</th>
              <th style={{ padding: '15px', textAlign: 'left', borderBottom: '1px solid #dee2e6' }}>状态</th>
              <th style={{ padding: '15px', textAlign: 'left', borderBottom: '1px solid #dee2e6' }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {(games || []).map((game) => (
              <tr key={game.id} style={{ borderBottom: '1px solid #dee2e6' }}>
                <td style={{ padding: '15px' }}>{game.id}</td>
                <td style={{ padding: '15px' }}>
                  {editingGame?.id === game.id ? (
                    <input
                      type="text"
                      value={editForm.name}
                      onChange={(e) => setEditForm({...editForm, name: e.target.value})}
                      style={{
                        width: '100%',
                        padding: '5px',
                        border: '1px solid #ddd',
                        borderRadius: '3px'
                      }}
                    />
                  ) : (
                    <span style={{ fontWeight: 'bold' }}>{game.name}</span>
                  )}
                </td>
                <td style={{ padding: '15px', maxWidth: '200px' }}>
                  {editingGame?.id === game.id ? (
                    <textarea
                      value={editForm.description}
                      onChange={(e) => setEditForm({...editForm, description: e.target.value})}
                      style={{
                        width: '100%',
                        padding: '5px',
                        border: '1px solid #ddd',
                        borderRadius: '3px',
                        minHeight: '60px',
                        resize: 'vertical'
                      }}
                    />
                  ) : (
                    <span style={{ 
                      display: 'block',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      {game.description || '无描述'}
                    </span>
                  )}
                </td>
                <td style={{ padding: '15px' }}>
                  {editingGame?.id === game.id ? (
                    <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                      <input
                        type="number"
                        min="1"
                        max="10"
                        value={editForm.min_players}
                        onChange={(e) => setEditForm({...editForm, min_players: parseInt(e.target.value) || 1})}
                        style={{
                          width: '50px',
                          padding: '3px',
                          border: '1px solid #ddd',
                          borderRadius: '3px'
                        }}
                      />
                      <span>-</span>
                      <input
                        type="number"
                        min="1"
                        max="10"
                        value={editForm.max_players}
                        onChange={(e) => setEditForm({...editForm, max_players: parseInt(e.target.value) || 1})}
                        style={{
                          width: '50px',
                          padding: '3px',
                          border: '1px solid #ddd',
                          borderRadius: '3px'
                        }}
                      />
                    </div>
                  ) : (
                    `${game.min_players || 2} - ${game.max_players || 2}`
                  )}
                </td>
                <td style={{ padding: '15px' }}>
                  {editingGame?.id === game.id ? (
                    <select
                      value={editForm.status}
                      onChange={(e) => setEditForm({...editForm, status: e.target.value})}
                      style={{
                        padding: '5px',
                        border: '1px solid #ddd',
                        borderRadius: '3px'
                      }}
                    >
                      <option value="active">启用</option>
                      <option value="inactive">禁用</option>
                    </select>
                  ) : (
                    <span style={{
                      padding: '4px 8px',
                      borderRadius: '12px',
                      fontSize: '12px',
                      fontWeight: 'bold',
                      backgroundColor: game.status === 'active' ? '#d4edda' : '#f8d7da',
                      color: game.status === 'active' ? '#155724' : '#721c24'
                    }}>
                      {game.status === 'active' ? '启用' : '禁用'}
                    </span>
                  )}
                </td>
                <td style={{ padding: '15px' }}>
                  {editingGame?.id === game.id ? (
                    <div style={{ display: 'flex', gap: '5px' }}>
                      <button
                        onClick={handleSave}
                        style={{
                          backgroundColor: '#28a745',
                          color: 'white',
                          border: 'none',
                          padding: '5px 10px',
                          borderRadius: '3px',
                          cursor: 'pointer',
                          fontSize: '12px'
                        }}
                      >
                        保存
                      </button>
                      <button
                        onClick={handleCancel}
                        style={{
                          backgroundColor: '#6c757d',
                          color: 'white',
                          border: 'none',
                          padding: '5px 10px',
                          borderRadius: '3px',
                          cursor: 'pointer',
                          fontSize: '12px'
                        }}
                      >
                        取消
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: '5px' }}>
                      <button
                        onClick={() => handleEdit(game)}
                        style={{
                          backgroundColor: '#007bff',
                          color: 'white',
                          border: 'none',
                          padding: '5px 10px',
                          borderRadius: '3px',
                          cursor: 'pointer',
                          fontSize: '12px'
                        }}
                      >
                        编辑
                      </button>
                      <button
                        onClick={() => handleDelete(game.id)}
                        style={{
                          backgroundColor: '#dc3545',
                          color: 'white',
                          border: 'none',
                          padding: '5px 10px',
                          borderRadius: '3px',
                          cursor: 'pointer',
                          fontSize: '12px'
                        }}
                      >
                        删除
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        
        {games.length === 0 && (
          <div style={{
            textAlign: 'center',
            padding: '50px',
            color: '#666',
            fontSize: '16px'
          }}>
            暂无游戏数据
          </div>
        )}
      </div>
    </div>
  );
};

export default GameManagement;