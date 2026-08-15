import React, { useEffect, useState } from 'react';
import { api } from '@qame/shared-utils';

const Overview = () => {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const res = await api.getAdminOverview();
      if (res.code === 200) {
        setData(res.data);
        setError('');
      } else {
        setError(res.message || '获取总览失败');
      }
    } catch (e) {
      setError('网络错误，请稍后重试');
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (!data && !error) {
    return <div className="a-center">正在加载总览…</div>;
  }

  const stats = data?.stats || {};
  const health = data?.health || {};
  const undermanned = data?.undermannedPlaying || 0;

  const statItems = [
    ['用户', stats.total_users, `管理员 ${stats.admin_users ?? 0}`],
    ['游戏', stats.total_games, `启用 ${stats.active_games ?? 0}`],
    ['对局', stats.total_matches, `进行中 ${stats.playing_matches ?? 0}`],
    ['等待', stats.waiting_matches, `已结束 ${stats.finished_matches ?? 0}`],
    ['已取消', stats.cancelled_matches, `人数不足 ${undermanned}`],
    ['玩家', stats.total_players ?? stats.human_players, ''],
  ];

  return (
    <div>
      <div className="a-page-head" style={{ marginTop: 0 }}>
        <span className="a-muted">平台状态与服务健康</span>
        <button type="button" className="a-btn a-btn-primary a-btn-sm" onClick={load}>刷新</button>
      </div>
      {error && <div className="a-alert a-alert-error">{error}</div>}
      {undermanned > 0 && (
        <div className="a-alert a-alert-warn">
          有 {undermanned} 场进行中对局人数不足，请核对房间状态。
        </div>
      )}
      <div className="a-kpis">
        {statItems.map(([title, value, sub]) => (
          <div key={title} className="a-kpi">
            <div className="a-kpi-label">{title}</div>
            <div className="a-kpi-value">{value ?? '-'}</div>
            <div className="a-kpi-sub">{sub}</div>
          </div>
        ))}
      </div>
      <h3 className="a-muted" style={{ margin: '0 0 10px' }}>服务健康</h3>
      <div className="a-table-wrap">
        <table className="a-table">
          <thead>
            <tr>
              <th>服务</th>
              <th>状态</th>
              <th>详情</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(health).map(([name, h]) => (
              <tr key={name}>
                <td>{name}</td>
                <td>
                  <span className={`a-badge ${h.ok ? 'a-badge-ok' : 'a-badge-bad'}`}>
                    {h.ok ? '正常' : '异常'}
                  </span>
                </td>
                <td className="a-muted">
                  {h.statusCode != null ? `HTTP ${h.statusCode}` : (h.error || '-')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Overview;
