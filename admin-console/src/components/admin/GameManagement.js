import React, { useState, useEffect } from 'react';
import { api } from '@qame/shared-utils';

const GameManagement = () => {
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingGame, setEditingGame] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', description: '', min_players: 2, max_players: 2, status: 'active' });
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState({ id: '', name: '', description: '', min_players: 2, max_players: 2, status: 'active' });
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    fetchGames();
  }, []);

  const fetchGames = async () => {
    try {
      const data = await api.getGames();
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
      const data = await api.createGame(createForm);
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
      status: game.status || 'active',
    });
  };

  const handleSave = async () => {
    try {
      const data = await api.updateGame(editingGame.id, editForm);
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
    if (!window.confirm('确定要删除这个游戏吗？')) return;
    try {
      const data = await api.deleteGame(gameId);
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

  const shown = (games || []).filter((g) => {
    const needle = q.trim().toLowerCase();
    const hit = !needle
      || String(g.id || '').toLowerCase().includes(needle)
      || String(g.name || '').toLowerCase().includes(needle);
    return hit && (statusFilter === 'all' || g.status === statusFilter);
  });

  if (loading) {
    return <div className="a-center">正在加载游戏…</div>;
  }

  return (
    <div>
      {error && <div className="a-alert a-alert-error">{error}</div>}
      <div className="a-page-head" style={{ marginTop: 0 }}>
        <span className="a-muted">游戏目录</span>
        <button type="button" className="a-btn a-btn-cta a-btn-sm" onClick={() => setShowCreateForm(true)}>
          添加游戏
        </button>
      </div>

      {showCreateForm && (
        <div className="a-form">
          <h3>添加游戏</h3>
          <div className="a-form-grid">
            <label className="a-field">
              <span>游戏 ID</span>
              <input className="a-input" type="text" value={createForm.id} onChange={(e) => setCreateForm({ ...createForm, id: e.target.value })} placeholder="如 tic-tac-toe" />
            </label>
            <label className="a-field">
              <span>名称</span>
              <input className="a-input" type="text" value={createForm.name} onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })} />
            </label>
            <label className="a-field">
              <span>状态</span>
              <select className="a-input" value={createForm.status} onChange={(e) => setCreateForm({ ...createForm, status: e.target.value })}>
                <option value="active">启用</option>
                <option value="inactive">禁用</option>
              </select>
            </label>
            <label className="a-field">
              <span>人数</span>
              <div className="a-form-row">
                <input className="a-input" type="number" min="1" max="10" value={createForm.min_players} onChange={(e) => setCreateForm({ ...createForm, min_players: parseInt(e.target.value, 10) || 1 })} />
                <span>–</span>
                <input className="a-input" type="number" min="1" max="10" value={createForm.max_players} onChange={(e) => setCreateForm({ ...createForm, max_players: parseInt(e.target.value, 10) || 1 })} />
              </div>
            </label>
          </div>
          <label className="a-field" style={{ marginBottom: 12 }}>
            <span>描述</span>
            <textarea value={createForm.description} onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })} />
          </label>
          <div className="a-actions">
            <button type="button" className="a-btn a-btn-primary a-btn-sm" onClick={handleCreateGame}>创建</button>
            <button type="button" className="a-btn a-btn-ghost a-btn-sm" onClick={() => { setShowCreateForm(false); setCreateForm({ id: '', name: '', description: '', min_players: 2, max_players: 2, status: 'active' }); }}>取消</button>
          </div>
        </div>
      )}

      <div className="a-filters">
        <input className="a-input" type="search" placeholder="搜索 ID / 名称" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="a-input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">全部状态</option>
          <option value="active">启用</option>
          <option value="inactive">禁用</option>
        </select>
        <span className="a-muted">{shown.length} / {games.length}</span>
      </div>

      <div className="a-table-wrap">
        <table className="a-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>名称</th>
              <th>描述</th>
              <th>人数</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((game) => (
              <tr key={game.id}>
                <td>{game.id}</td>
                <td>
                  {editingGame?.id === game.id ? (
                    <input className="a-input" type="text" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
                  ) : <strong>{game.name}</strong>}
                </td>
                <td>
                  {editingGame?.id === game.id ? (
                    <textarea value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} />
                  ) : (game.description || '—')}
                </td>
                <td>
                  {editingGame?.id === game.id ? (
                    <div className="a-form-row">
                      <input className="a-input" type="number" min="1" max="10" value={editForm.min_players} onChange={(e) => setEditForm({ ...editForm, min_players: parseInt(e.target.value, 10) || 1 })} style={{ width: 64 }} />
                      <span>–</span>
                      <input className="a-input" type="number" min="1" max="10" value={editForm.max_players} onChange={(e) => setEditForm({ ...editForm, max_players: parseInt(e.target.value, 10) || 1 })} style={{ width: 64 }} />
                    </div>
                  ) : `${game.min_players || 2}–${game.max_players || 2}`}
                </td>
                <td>
                  {editingGame?.id === game.id ? (
                    <select className="a-input" value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}>
                      <option value="active">启用</option>
                      <option value="inactive">禁用</option>
                    </select>
                  ) : (
                    <span className={`a-badge ${game.status === 'active' ? 'a-badge-ok' : 'a-badge-bad'}`}>
                      {game.status === 'active' ? '启用' : '禁用'}
                    </span>
                  )}
                </td>
                <td>
                  {editingGame?.id === game.id ? (
                    <div className="a-actions">
                      <button type="button" className="a-btn a-btn-cta a-btn-sm" onClick={handleSave}>保存</button>
                      <button type="button" className="a-btn a-btn-ghost a-btn-sm" onClick={handleCancel}>取消</button>
                    </div>
                  ) : (
                    <div className="a-actions">
                      <button type="button" className="a-btn a-btn-ghost a-btn-sm" onClick={() => handleEdit(game)}>编辑</button>
                      <button type="button" className="a-btn a-btn-danger a-btn-sm" onClick={() => handleDelete(game.id)}>删除</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {shown.length === 0 && <div className="a-empty">没有匹配的游戏</div>}
      </div>
    </div>
  );
};

export default GameManagement;
