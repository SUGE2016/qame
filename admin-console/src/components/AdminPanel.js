import React, { useState } from 'react';
import Overview from './admin/Overview';
import AuditLog from './admin/AuditLog';
import UserManagement from './admin/UserManagement';
import GameManagement from './admin/GameManagement';
import GameDatabaseManagement from './admin/GameDatabaseManagement';

const TABS = [
  ['overview', '总览'],
  ['users', '用户'],
  ['games', '游戏'],
  ['game-db', '对局'],
  ['audit', '审计'],
];

const TABS_GONE = new Set(['ai-configs', 'ai-clients']);

const AdminPanel = () => {
  const [activeTab, setActiveTab] = useState(() => {
    const savedTab = sessionStorage.getItem('adminActiveTab');
    if (!savedTab || TABS_GONE.has(savedTab)) return 'overview';
    return savedTab;
  });

  const title = (TABS.find(([id]) => id === activeTab) || [])[1] || '总览';

  return (
    <div className="a-shell">
      <aside className="a-side">
        <nav className="a-nav">
          {TABS.map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`a-nav-btn${activeTab === id ? ' is-on' : ''}`}
              onClick={() => {
                setActiveTab(id);
                sessionStorage.setItem('adminActiveTab', id);
              }}
            >
              {label}
            </button>
          ))}
        </nav>
      </aside>
      <main className="a-main">
        <div className="a-page-head">
          <h1>{title}</h1>
        </div>
        {activeTab === 'overview' && <Overview />}
        {activeTab === 'users' && <UserManagement />}
        {activeTab === 'games' && <GameManagement />}
        {activeTab === 'game-db' && <GameDatabaseManagement />}
        {activeTab === 'audit' && <AuditLog />}
      </main>
    </div>
  );
};

export default AdminPanel;
