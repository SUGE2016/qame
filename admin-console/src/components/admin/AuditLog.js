import React, { useEffect, useState } from 'react';
import { api } from '@qame/shared-utils';
import Pager from './Pager';

const AuditLog = () => {
  const [logs, setLogs] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const limit = 20;

  const load = async (p = page) => {
    setLoading(true);
    try {
      const res = await api.getAdminAudit(p, limit, { q, action: actionFilter });
      if (res.code === 200) {
        setLogs(res.data.logs || []);
        setTotal(res.data.total || 0);
        setPage(res.data.page || p);
        setError('');
      } else {
        setError(res.message || '获取审计日志失败');
      }
    } catch (e) {
      setError('网络错误，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(page);
  }, [page, q, actionFilter]);

  return (
    <div>
      <div className="a-page-head" style={{ marginTop: 0 }}>
        <span className="a-muted">写操作记录</span>
        <button type="button" className="a-btn a-btn-primary a-btn-sm" onClick={() => load(page)}>刷新</button>
      </div>
      {error && <div className="a-alert a-alert-error">{error}</div>}
      <div className="a-filters">
        <input className="a-input" type="search" placeholder="搜索操作者 / 动作 / 资源" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        <select className="a-input" value={actionFilter} onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}>
          <option value="all">全部动作</option>
          <option value="create">create</option>
          <option value="update">update</option>
          <option value="delete">delete</option>
        </select>
      </div>
      {loading && logs.length === 0 ? (
        <div className="a-center">正在加载…</div>
      ) : (
        <div className="a-table-wrap">
          <table className="a-table">
            <thead>
              <tr>
                <th>时间</th>
                <th>操作者</th>
                <th>动作</th>
                <th>资源</th>
                <th>详情</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((row) => (
                <tr key={row.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {row.created_at ? new Date(row.created_at).toLocaleString('zh-CN') : '-'}
                  </td>
                  <td>{row.username || row.user_id || '-'}</td>
                  <td>{row.action}</td>
                  <td>{row.resource}{row.resource_id ? ` #${row.resource_id}` : ''}</td>
                  <td className="a-muted" style={{ maxWidth: 360, wordBreak: 'break-all' }}>
                    {row.detail ? JSON.stringify(row.detail) : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {logs.length === 0 && <div className="a-empty">没有匹配的记录</div>}
        </div>
      )}
      <Pager page={page} limit={limit} total={total} onPage={setPage} />
    </div>
  );
};

export default AuditLog;
