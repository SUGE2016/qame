import React, { useState, useEffect } from 'react';
import { DialogProvider } from '@qame/shared-ui';
import AdminPanel from './components/AdminPanel';
import { api } from '@qame/shared-utils';

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const data = await api.verify();
        if (data.code === 200) {
          const userData = data.data?.user || data.data;
          if (userData.role !== 'admin') {
            alert('只有管理员可以访问管理控制台');
            sessionStorage.removeItem('user');
            window.location.href = '/';
            return;
          }
          setUser(userData);
          sessionStorage.setItem('user', JSON.stringify(userData));
        } else {
          alert('请先在游戏大厅登录');
          sessionStorage.removeItem('user');
          window.location.href = '/';
          return;
        }
      } catch (error) {
        console.error('验证token失败:', error);
        alert('请先在游戏大厅登录');
        sessionStorage.removeItem('user');
        window.location.href = '/';
        return;
      } finally {
        setLoading(false);
      }
    };
    checkAuth();
  }, []);

  const handleLogout = async () => {
    try {
      await api.logout();
    } catch (error) {
      console.error('登出失败:', error);
    }
    sessionStorage.removeItem('user');
    setUser(null);
    window.location.href = '/';
  };

  if (loading || !user) {
    return <div className="a-center">{loading ? '正在验证身份…' : '正在跳转…'}</div>;
  }

  const username = user.username || user.user?.username || '管理员';
  const role = user.role || user.user?.role;

  return (
    <DialogProvider>
      <div className="a-app">
        <header className="a-topbar">
          <div className="a-brand">
            <span className="a-brand-mark">QA</span>
            <span>QAME</span>
            <span className="a-brand-sub">管理</span>
          </div>
          <div className="a-top-actions">
            <div className="a-user-chip">
              <span className="a-user-avatar">{username.slice(0, 1).toUpperCase()}</span>
              <span className="a-user-meta">
                <span className="a-user-name">{username}</span>
                <span className="a-user-role">{role === 'admin' ? '管理员' : '选手'}</span>
              </span>
            </div>
            <button type="button" className="a-btn a-btn-ghost a-btn-sm" onClick={() => { window.location.href = '/'; }}>
              大厅
            </button>
            <button type="button" className="a-btn a-btn-ghost a-btn-sm" onClick={handleLogout}>
              退出
            </button>
          </div>
        </header>
        <AdminPanel />
      </div>
    </DialogProvider>
  );
}

export default App;
