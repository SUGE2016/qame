import React, { useState, useEffect } from 'react';
import { useDialog } from '@qame/shared-ui';
import { DialogRenderer } from '@qame/shared-ui';
import { api } from '@qame/shared-utils';

const AIConfigManagement = () => {
  const [clients, setClients] = useState([]);
  const [players, setPlayers] = useState([]);
  const [availableGames, setAvailableGames] = useState([]);
  const [loading, setLoading] = useState(false);
  
  // 模态框状态
  const [showCreateClientModal, setShowCreateClientModal] = useState(false);
  const [showCreatePlayerModal, setShowCreatePlayerModal] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  
  // 表单数据
  const [clientFormData, setClientFormData] = useState({
    name: '',
    endpoint: '',
    supportedGames: [],
    description: ''
  });
  
  const [playerFormData, setPlayerFormData] = useState({
    playerName: '',
    aiClientId: '',
    status: 'active'
  });

  const { dialogs, success, error, confirmDanger } = useDialog();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    await Promise.all([
      loadClients(),
      loadPlayers(),
      loadAvailableGames()
    ]);
  };

  const loadClients = async () => {
    try {
      const result = await api.getAIClients();
      if (result.code === 200) {
        setClients(result.data || []);
      }
    } catch (err) {
      console.error('加载AI客户端失败:', err);
    }
  };

  const loadPlayers = async () => {
    try {
      const result = await api.getAIPlayers();
      if (result.code === 200) {
        setPlayers(result.data || []);
      }
    } catch (err) {
      console.error('加载AI选手失败:', err);
    }
  };

  const loadAvailableGames = async () => {
    try {
      const result = await api.getGames();
      if (result.code === 200) {
        // 提取游戏ID列表用于AI配置
        const gameIds = result.data.games ? result.data.games.map(game => game.id) : [];
        setAvailableGames(gameIds);
      } else {
        setAvailableGames([]);
      }
    } catch (err) {
      console.error('获取游戏列表失败:', err);
      setAvailableGames([]);
    }
  };

  // ========== AI客户端管理 ==========
  const openCreateClientModal = () => {
    setClientFormData({
      name: '',
      endpoint: '',
      supportedGames: [],
      description: ''
    });
    setEditingClient(null);
    setShowCreateClientModal(true);
  };

  const openEditClientModal = (client) => {
    setClientFormData({
      name: client.name,
      endpoint: client.endpoint,
      supportedGames: Array.isArray(client.supported_games) 
        ? client.supported_games 
        : (client.supported_games ? JSON.parse(client.supported_games) : []),
      description: client.description || ''
    });
    setEditingClient(client);
    setShowCreateClientModal(true);
  };

  const saveClient = async () => {
    if (!clientFormData.name || !clientFormData.endpoint) {
      error('请填写客户端名称和端点地址');
      return;
    }

    if (clientFormData.supportedGames.length === 0) {
      error('请至少选择一个支持的游戏');
      return;
    }

    setLoading(true);
    try {
      const apiData = {
        name: clientFormData.name,
        endpoint: clientFormData.endpoint,
        supported_games: clientFormData.supportedGames, // 直接发送数组，让 PostgreSQL 处理 TEXT[] 类型
        description: clientFormData.description
      };

      const result = editingClient 
        ? await api.updateAIClient(editingClient.id, apiData)
        : await api.createAIClient(apiData);
      
      if (result.code === 200) {
        success(editingClient ? 'AI客户端更新成功' : 'AI客户端注册成功');
        setShowCreateClientModal(false);
        loadClients();
      } else {
        error('操作失败: ' + result.message);
      }
    } catch (err) {
      error('操作失败: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const deleteClient = async (clientId) => {
    const confirmed = await confirmDanger('确定要删除这个AI客户端吗？关联的AI选手也会被删除。');
    if (!confirmed) return;

    setLoading(true);
    try {
      const result = await api.deleteAIClient(clientId);
      
      if (result.code === 200) {
        success('AI客户端已删除');
        loadClients();
        loadPlayers(); // 重新加载选手列表，因为关联选手可能被删除
      } else {
        error('删除失败: ' + result.message);
      }
    } catch (err) {
      error('删除失败: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // ========== AI选手管理 ==========
  const openCreatePlayerModal = () => {
    setPlayerFormData({
      playerName: '',
      aiClientId: '',
      status: 'active'
    });
    setShowCreatePlayerModal(true);
  };

  const savePlayer = async () => {
    if (!playerFormData.playerName || !playerFormData.aiClientId) {
      error('请填写选手名称并选择AI客户端');
      return;
    }

    setLoading(true);
    try {
      const result = await api.createAIPlayer({
        player_name: playerFormData.playerName,
        ai_client_id: playerFormData.aiClientId,
        status: playerFormData.status
      });
      
      if (result.code === 200) {
        success('AI选手创建成功');
        setShowCreatePlayerModal(false);
        loadPlayers();
      } else {
        error('创建失败: ' + result.message);
      }
    } catch (err) {
      error('创建失败: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const deletePlayer = async (playerId) => {
    const confirmed = await confirmDanger('确定要删除这个AI选手吗？');
    if (!confirmed) return;

    setLoading(true);
    try {
      const result = await api.deleteAIPlayer(playerId);
      
      if (result.code === 200) {
        success('AI选手已删除');
        loadPlayers();
      } else {
        error('删除失败: ' + result.message);
      }
    } catch (err) {
      error('删除失败: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleGameSupport = (game) => {
    const supported = clientFormData.supportedGames.includes(game);
    if (supported) {
      setClientFormData({
        ...clientFormData,
        supportedGames: clientFormData.supportedGames.filter(g => g !== game)
      });
    } else {
      setClientFormData({
        ...clientFormData,
        supportedGames: [...clientFormData.supportedGames, game]
      });
    }
  };

  return (
    <div>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: '20px' 
      }}>
        <h2 style={{ margin: 0, color: '#2c3e50' }}>🤖 AI管理中心</h2>
        <div>
          <button
            onClick={loadData}
            style={{
              backgroundColor: '#3498db',
              color: 'white',
              border: 'none',
              padding: '10px 20px',
              borderRadius: '5px',
              cursor: 'pointer'
            }}
            disabled={loading}
          >
            🔄 刷新
          </button>
        </div>
      </div>

      {/* 两栏布局容器 */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '20px'
      }}>

        {/* AI客户端管理 */}
        <div style={{
          backgroundColor: 'white',
          borderRadius: '8px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          overflow: 'hidden'
        }}>
          <div style={{
            backgroundColor: '#f8f9fa',
            padding: '15px',
            borderBottom: '1px solid #eee',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div style={{ fontWeight: 'bold' }}>AI客户端列表 ({clients.length})</div>
            <button
              onClick={openCreateClientModal}
              style={{
                backgroundColor: '#27ae60',
                color: 'white',
                border: 'none',
                padding: '8px 16px',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
              disabled={loading}
            >
              ➕ 注册AI客户端
            </button>
          </div>
          
          {clients.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
              <div style={{ fontSize: '48px', marginBottom: '10px' }}>🤖</div>
              <div>暂无AI客户端</div>
              <div style={{ fontSize: '14px', marginTop: '5px' }}>
                点击"注册AI客户端"开始注册AI服务
              </div>
            </div>
          ) : (
            <div style={{ padding: '15px' }}>
              {clients.map(client => (
                <div key={client.id} style={{
                  border: '1px solid #eee',
                  borderRadius: '8px',
                  padding: '20px',
                  marginBottom: '15px',
                  backgroundColor: '#f9f9f9'
                }}>
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'flex-start',
                    marginBottom: '15px'
                  }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                        <strong style={{ fontSize: '18px', color: '#2c3e50' }}>
                          {client.name}
                        </strong>
                      </div>
                      <div style={{ color: '#666', marginBottom: '10px', fontSize: '14px' }}>
                        {client.description || '无描述'}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={() => openEditClientModal(client)}
                        style={{
                          backgroundColor: '#3498db',
                          color: 'white',
                          border: 'none',
                          padding: '6px 12px',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '12px'
                        }}
                        disabled={loading}
                      >
                        编辑
                      </button>
                      <button
                        onClick={() => deleteClient(client.id)}
                        style={{
                          backgroundColor: '#e74c3c',
                          color: 'white',
                          border: 'none',
                          padding: '6px 12px',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '12px'
                        }}
                        disabled={loading}
                      >
                        删除
                      </button>
                    </div>
                  </div>
                  
                  <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: '1fr 1fr', 
                    gap: '15px',
                    fontSize: '14px',
                    color: '#666'
                  }}>
                    <div>
                      <div><strong>端点地址:</strong> {client.endpoint}</div>
                      <div><strong>客户端ID:</strong> {client.id}</div>
                    </div>
                    <div>
                      <div><strong>支持游戏:</strong> {
                        Array.isArray(client.supported_games) 
                          ? client.supported_games.join(', ')
                          : (client.supported_games ? JSON.parse(client.supported_games).join(', ') : 'N/A')
                      }</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* AI选手管理 */}
        <div style={{
          backgroundColor: 'white',
          borderRadius: '8px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          overflow: 'hidden'
        }}>
          <div style={{
            backgroundColor: '#f8f9fa',
            padding: '15px',
            borderBottom: '1px solid #eee',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div style={{ fontWeight: 'bold' }}>AI选手列表 ({players.length})</div>
            <button
              onClick={openCreatePlayerModal}
              style={{
                backgroundColor: '#27ae60',
                color: 'white',
                border: 'none',
                padding: '8px 16px',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
              disabled={loading}
            >
              ➕ 创建AI选手
            </button>
          </div>
          
          {players.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
              <div style={{ fontSize: '48px', marginBottom: '10px' }}>👤</div>
              <div>暂无AI选手</div>
              <div style={{ fontSize: '14px', marginTop: '5px' }}>
                点击"创建AI选手"开始创建AI选手实例
              </div>
            </div>
          ) : (
            <div style={{ padding: '15px' }}>
              {players.map(player => (
                <div key={player.id} style={{
                  border: '1px solid #eee',
                  borderRadius: '8px',
                  padding: '20px',
                  marginBottom: '15px',
                  backgroundColor: '#f9f9f9'
                }}>
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'flex-start',
                    marginBottom: '15px'
                  }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                        <strong style={{ fontSize: '18px', color: '#2c3e50', marginRight: '10px' }}>
                          {player.player_name}
                        </strong>
                        <span style={{
                          backgroundColor: player.status === 'active' ? '#27ae60' : '#95a5a6',
                          color: 'white',
                          padding: '2px 8px',
                          borderRadius: '12px',
                          fontSize: '12px'
                        }}>
                          {player.status === 'active' ? '活跃' : '停用'}
                        </span>
                      </div>
                    </div>
                    <div>
                      <button
                        onClick={() => deletePlayer(player.id)}
                        style={{
                          backgroundColor: '#e74c3c',
                          color: 'white',
                          border: 'none',
                          padding: '6px 12px',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '12px'
                        }}
                        disabled={loading}
                      >
                        删除
                      </button>
                    </div>
                  </div>
                  
                  <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: '1fr 1fr', 
                    gap: '15px',
                    fontSize: '14px',
                    color: '#666'
                  }}>
                    <div>
                      <div><strong>AI客户端:</strong> {player.client_name || 'N/A'}</div>
                      <div><strong>选手ID:</strong> {player.id}</div>
                    </div>
                    <div>
                      <div><strong>端点地址:</strong> {player.client_endpoint || 'N/A'}</div>
                      <div><strong>支持游戏:</strong> {
                        player.client_supported_games 
                          ? (Array.isArray(player.client_supported_games) 
                              ? player.client_supported_games.join(', ')
                              : player.client_supported_games)
                          : 'N/A'
                      }</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 注册/编辑AI客户端模态框 */}
      {showCreateClientModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '8px',
            width: '600px',
            maxWidth: '90vw',
            maxHeight: '90vh',
            overflowY: 'auto'
          }}>
            <div style={{
              padding: '20px',
              borderBottom: '1px solid #eee',
              backgroundColor: '#f8f9fa',
              borderRadius: '8px 8px 0 0'
            }}>
              <h3 style={{ margin: 0, color: '#2c3e50' }}>
                {editingClient ? '编辑AI客户端' : '注册AI客户端'}
              </h3>
            </div>

            <div style={{ padding: '20px' }}>
              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                  客户端名称:
                </label>
                <input
                  type="text"
                  value={clientFormData.name}
                  onChange={(e) => setClientFormData({...clientFormData, name: e.target.value})}
                  placeholder="我的AI客户端"
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid #ddd',
                    borderRadius: '4px'
                  }}
                />
              </div>

              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                  Qame接入地址:
                </label>
                <input
                  type="text"
                  value={clientFormData.endpoint}
                  onChange={(e) => setClientFormData({...clientFormData, endpoint: e.target.value})}
                  placeholder="http://localhost:3003/move"
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid #ddd',
                    borderRadius: '4px'
                  }}
                />
                <small style={{ color: '#666', fontSize: '12px' }}>AI客户端的标准/move接口地址</small>
              </div>

              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                  支持的游戏:
                </label>
                <div style={{ 
                  border: '1px solid #ddd', 
                  borderRadius: '4px', 
                  padding: '10px', 
                  maxHeight: '120px', 
                  overflowY: 'auto' 
                }}>
                  {availableGames.map(game => (
                    <label key={game} style={{ display: 'block', marginBottom: '5px' }}>
                      <input
                        type="checkbox"
                        checked={clientFormData.supportedGames.includes(game)}
                        onChange={() => toggleGameSupport(game)}
                        style={{ marginRight: '8px' }}
                      />
                      {game}
                    </label>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                  描述信息:
                </label>
                <textarea
                  value={clientFormData.description}
                  onChange={(e) => setClientFormData({...clientFormData, description: e.target.value})}
                  placeholder="AI客户端描述，可包含团队信息、技术栈等..."
                  rows="3"
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    resize: 'vertical'
                  }}
                />
              </div>
            </div>

            <div style={{
              padding: '20px',
              borderTop: '1px solid #eee',
              backgroundColor: '#f8f9fa',
              borderRadius: '0 0 8px 8px',
              textAlign: 'right'
            }}>
              <button
                onClick={() => setShowCreateClientModal(false)}
                style={{
                  backgroundColor: '#95a5a6',
                  color: 'white',
                  border: 'none',
                  padding: '10px 20px',
                  borderRadius: '5px',
                  cursor: 'pointer',
                  marginRight: '10px'
                }}
                disabled={loading}
              >
                取消
              </button>
              <button
                onClick={saveClient}
                style={{
                  backgroundColor: '#27ae60',
                  color: 'white',
                  border: 'none',
                  padding: '10px 20px',
                  borderRadius: '5px',
                  cursor: 'pointer'
                }}
                disabled={loading}
              >
                {loading ? '保存中...' : (editingClient ? '更新' : '注册')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 创建AI选手模态框 */}
      {showCreatePlayerModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '8px',
            width: '500px',
            maxWidth: '90vw'
          }}>
            <div style={{
              padding: '20px',
              borderBottom: '1px solid #eee',
              backgroundColor: '#f8f9fa',
              borderRadius: '8px 8px 0 0'
            }}>
              <h3 style={{ margin: 0, color: '#2c3e50' }}>创建AI选手</h3>
            </div>

            <div style={{ padding: '20px' }}>
              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                  选手名称:
                </label>
                <input
                  type="text"
                  value={playerFormData.playerName}
                  onChange={(e) => setPlayerFormData({...playerFormData, playerName: e.target.value})}
                  placeholder="AI-Player-1"
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid #ddd',
                    borderRadius: '4px'
                  }}
                />
              </div>

              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                  选择AI客户端:
                </label>
                <select
                  value={playerFormData.aiClientId}
                  onChange={(e) => setPlayerFormData({...playerFormData, aiClientId: e.target.value})}
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid #ddd',
                    borderRadius: '4px'
                  }}
                >
                  <option value="">请选择AI客户端</option>
                  {clients.map(client => (
                    <option key={client.id} value={client.id}>
                      {client.name}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                  状态:
                </label>
                <select
                  value={playerFormData.status}
                  onChange={(e) => setPlayerFormData({...playerFormData, status: e.target.value})}
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid #ddd',
                    borderRadius: '4px'
                  }}
                >
                  <option value="active">活跃</option>
                  <option value="inactive">停用</option>
                </select>
              </div>
            </div>

            <div style={{
              padding: '20px',
              borderTop: '1px solid #eee',
              backgroundColor: '#f8f9fa',
              borderRadius: '0 0 8px 8px',
              textAlign: 'right'
            }}>
              <button
                onClick={() => setShowCreatePlayerModal(false)}
                style={{
                  backgroundColor: '#95a5a6',
                  color: 'white',
                  border: 'none',
                  padding: '10px 20px',
                  borderRadius: '5px',
                  cursor: 'pointer',
                  marginRight: '10px'
                }}
                disabled={loading}
              >
                取消
              </button>
              <button
                onClick={savePlayer}
                style={{
                  backgroundColor: '#27ae60',
                  color: 'white',
                  border: 'none',
                  padding: '10px 20px',
                  borderRadius: '5px',
                  cursor: 'pointer'
                }}
                disabled={loading}
              >
                {loading ? '创建中...' : '创建'}
              </button>
            </div>
          </div>
        </div>
      )}
      
      <DialogRenderer dialogs={dialogs} />
    </div>
  );
};

export default AIConfigManagement;