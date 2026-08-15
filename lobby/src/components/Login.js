import React, { useState } from 'react';
import { hashPasswordForTransmission } from '@qame/shared-utils';
import { Icon } from '../icons';

const Login = ({ onLogin }) => {
  const [formData, setFormData] = useState({ username: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const { hashedPassword } = await hashPasswordForTransmission(formData.password);
      const response = await fetch(`/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          username: formData.username,
          password: formData.password,
          hashedPassword,
        }),
      });
      const data = await response.json();
      if (data.code === 200) {
        sessionStorage.setItem('user', JSON.stringify(data.data.user));
        if (data.data.accessToken) {
          sessionStorage.setItem('accessToken', data.data.accessToken);
        }
        onLogin(data.data.user);
      } else {
        setError(data.message || '登录失败');
      }
    } catch (err) {
      setError('网络错误，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="q-login">
      <div className="q-login-card">
        <div className="q-brand" style={{ marginBottom: 24, justifyContent: 'center' }}>
          <span className="q-brand-mark"><Icon name="grid" size={16} /></span>
          <span>QAME</span>
        </div>
        <h1 style={{ fontSize: 22, margin: '0 0 8px', textAlign: 'center' }}>登录对战大厅</h1>
        <p className="q-hint" style={{ textAlign: 'center', marginTop: 0, marginBottom: 24 }}>
          账号由管理员发放
        </p>
        {error && <div className="q-alert" role="alert">{error}</div>}
        <form onSubmit={handleSubmit}>
          <label className="q-field" htmlFor="username">
            <span>用户名</span>
            <input
              id="username"
              name="username"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              required
              autoComplete="username"
            />
          </label>
          <label className="q-field" htmlFor="password">
            <span>密码</span>
            <input
              id="password"
              type="password"
              name="password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              required
              autoComplete="current-password"
            />
          </label>
          <button type="submit" className="q-btn q-btn-primary" style={{ width: '100%' }} disabled={loading}>
            {loading ? '登录中…' : '进入大厅'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;
