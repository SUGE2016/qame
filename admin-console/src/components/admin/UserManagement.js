import React, { useState, useEffect } from 'react';
import { api } from '@qame/shared-utils';
import Pager from './Pager';

const UserManagement = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingUser, setEditingUser] = useState(null);
  const [editForm, setEditForm] = useState({ username: '', role: 'user' });
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState({ username: '', password: '', role: 'user' });
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [sortDir, setSortDir] = useState('desc');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 20;

  const fetchUsers = async (p = page) => {
    try {
      setLoading(true);
      const data = await api.getUsers(p, limit, { q, role: roleFilter, order: sortDir });
      if (data.code === 200) {
        setUsers(data.data.users || []);
        setTotal(data.data.total || 0);
        setPage(data.data.page || p);
        setError('');
      } else {
        setError(data.message || '获取用户列表失败');
      }
    } catch (error) {
      console.error('获取用户列表失败:', error);
      setError('网络错误，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers(page);
  }, [page, q, roleFilter, sortDir]);

  const handleCreateUser = async () => {
    try {
      const data = await api.createUser(createForm);
      if (data.code === 200) {
        setShowCreateForm(false);
        setCreateForm({ username: '', password: '', role: 'user' });
        fetchUsers(1);
        setError('');
      } else {
        setError(data.message || '创建用户失败');
      }
    } catch (error) {
      console.error('创建用户失败:', error);
      setError('网络错误，请稍后重试');
    }
  };

  const handleEdit = (user) => {
    setEditingUser(user);
    setEditForm({ username: user.username, role: user.role });
  };

  const handleSave = async () => {
    try {
      const data = await api.updateUser(editingUser.id, editForm);
      if (data.code === 200) {
        setEditingUser(null);
        fetchUsers();
        setError('');
      } else {
        setError(data.message || '更新失败');
      }
    } catch (error) {
      console.error('更新用户失败:', error);
      setError('网络错误，请稍后重试');
    }
  };

  const handleDelete = async (userId) => {
    if (!window.confirm('确定要删除这个用户吗？')) return;
    try {
      const data = await api.deleteUser(userId);
      if (data.code === 200) {
        fetchUsers();
        setError('');
      } else {
        setError(data.message || '删除失败');
      }
    } catch (error) {
      console.error('删除用户失败:', error);
      setError('网络错误，请稍后重试');
    }
  };

  if (loading && users.length === 0) {
    return <div className="a-center">正在加载用户…</div>;
  }

  return (
    <div>
      {error && <div className="a-alert a-alert-error">{error}</div>}
      <div className="a-page-head" style={{ marginTop: 0 }}>
        <span className="a-muted">账号与角色</span>
        <button type="button" className="a-btn a-btn-cta a-btn-sm" onClick={() => setShowCreateForm(true)}>
          创建用户
        </button>
      </div>

      {showCreateForm && (
        <div className="a-form">
          <h3>创建用户</h3>
          <div className="a-form-row">
            <input className="a-input" type="text" placeholder="用户名" value={createForm.username} onChange={(e) => setCreateForm({ ...createForm, username: e.target.value })} />
            <input className="a-input" type="password" placeholder="密码" value={createForm.password} onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })} />
            <select className="a-input" value={createForm.role} onChange={(e) => setCreateForm({ ...createForm, role: e.target.value })}>
              <option value="user">普通用户</option>
              <option value="admin">管理员</option>
            </select>
            <button type="button" className="a-btn a-btn-primary a-btn-sm" onClick={handleCreateUser}>创建</button>
            <button type="button" className="a-btn a-btn-ghost a-btn-sm" onClick={() => { setShowCreateForm(false); setCreateForm({ username: '', password: '', role: 'user' }); }}>取消</button>
          </div>
        </div>
      )}

      <div className="a-filters">
        <input className="a-input" type="search" placeholder="搜索用户名 / ID" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        <select className="a-input" value={roleFilter} onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}>
          <option value="all">全部角色</option>
          <option value="admin">管理员</option>
          <option value="user">普通用户</option>
        </select>
      </div>

      <div className="a-table-wrap">
        <table className="a-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>用户名</th>
              <th>角色</th>
              <th>
                <button type="button" className="a-th-sort" onClick={() => { setSortDir((d) => (d === 'desc' ? 'asc' : 'desc')); setPage(1); }}>
                  创建时间 {sortDir === 'desc' ? '↓' : '↑'}
                </button>
              </th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td>{user.id}</td>
                <td>
                  {editingUser && editingUser.id === user.id ? (
                    <input className="a-input" type="text" value={editForm.username} onChange={(e) => setEditForm({ ...editForm, username: e.target.value })} />
                  ) : user.username}
                </td>
                <td>
                  {editingUser && editingUser.id === user.id ? (
                    <select className="a-input" value={editForm.role} onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}>
                      <option value="user">普通用户</option>
                      <option value="admin">管理员</option>
                    </select>
                  ) : (
                    <span className={`a-badge ${user.role === 'admin' ? 'a-badge-admin' : 'a-badge-user'}`}>
                      {user.role === 'admin' ? '管理员' : '普通用户'}
                    </span>
                  )}
                </td>
                <td>{user.created_at ? new Date(user.created_at).toLocaleString('zh-CN') : '-'}</td>
                <td>
                  {editingUser && editingUser.id === user.id ? (
                    <div className="a-actions">
                      <button type="button" className="a-btn a-btn-cta a-btn-sm" onClick={handleSave}>保存</button>
                      <button type="button" className="a-btn a-btn-ghost a-btn-sm" onClick={() => setEditingUser(null)}>取消</button>
                    </div>
                  ) : (
                    <div className="a-actions">
                      <button type="button" className="a-btn a-btn-ghost a-btn-sm" onClick={() => handleEdit(user)}>编辑</button>
                      <button type="button" className="a-btn a-btn-danger a-btn-sm" onClick={() => handleDelete(user.id)}>删除</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {users.length === 0 && <div className="a-empty">没有匹配的用户</div>}
      </div>
      <Pager page={page} limit={limit} total={total} onPage={setPage} />
    </div>
  );
};

export default UserManagement;
