import React, { useState, useEffect } from 'react';
import { api } from '@qame/shared-utils';
import Pager from './Pager';

const STATUS_LABEL = {
  waiting: '等人',
  playing: '进行中',
  finished: '已结束',
  cancelled: '已取消',
};

const canDelete = (match) => {
  const status = match?.status;
  return status === 'waiting' || status === 'finished' || status === 'cancelled';
};

const GameDatabaseManagement = () => {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [batching, setBatching] = useState(false);
  const [error, setError] = useState(null);
  const [listFilter, setListFilter] = useState('done');
  const [selectedIds, setSelectedIds] = useState([]);
  const [q, setQ] = useState('');
  const [sortDir, setSortDir] = useState('desc');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 20;

  const loadAllMatches = async (p = page) => {
    setLoading(true);
    setError(null);
    try {
      const filters = { page: p, limit, order: sortDir };
      if (q.trim()) filters.q = q.trim();
      if (listFilter !== 'all') filters.scope = listFilter;
      const response = await api.getMatches(filters);
      if (response.code === 200) {
        const data = response.data;
        const list = Array.isArray(data) ? data : (data.matches || []);
        setMatches(list);
        setTotal(Array.isArray(data) ? list.length : (data.total || 0));
        setPage(Array.isArray(data) ? 1 : (data.page || p));
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

  useEffect(() => {
    loadAllMatches(page);
  }, [page, q, listFilter, sortDir]);

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

  const visibleMatches = matches;

  const toggleSelect = (matchId) => {
    setSelectedIds((prev) => (
      prev.includes(matchId) ? prev.filter((id) => id !== matchId) : [...prev, matchId]
    ));
  };

  const selectDeletable = () => {
    setSelectedIds(visibleMatches.filter(canDelete).map((m) => m.id));
  };

  const deleteOne = async (matchId) => {
    if (!window.confirm('确定删除这场对局？此操作不可撤销。')) return;
    try {
      const response = await api.deleteMatch(matchId);
      if (response.code === 200) {
        setSelectedIds((prev) => prev.filter((id) => id !== matchId));
        await loadAllMatches();
      } else {
        setError(response.message || '删除失败');
      }
    } catch (err) {
      setError(`删除失败: ${err.message}`);
    }
  };

  const deleteSelected = async () => {
    if (selectedIds.length === 0) return;
    if (!window.confirm(`确定删除选中的 ${selectedIds.length} 场对局？此操作不可撤销。`)) return;
    try {
      setBatching(true);
      const response = await api.deleteMatches(selectedIds);
      if (response.code === 200) {
        const n = response.data?.deletedCount ?? 0;
        const skipped = response.data?.skipped?.length ?? 0;
        if (skipped) setError(`已删除 ${n} 场，跳过 ${skipped} 场`);
        else setError(null);
        setSelectedIds([]);
        await loadAllMatches();
      } else {
        setError(response.message || '批量删除失败');
      }
    } catch (err) {
      setError(`批量删除失败: ${err.message}`);
    } finally {
      setBatching(false);
    }
  };

  const statusBadge = (status) => (
    status === 'waiting' ? 'a-badge-admin' :
    status === 'playing' ? 'a-badge-ok' :
    status === 'cancelled' ? 'a-badge-bad' : 'a-badge-user'
  );

  return (
    <div>
      <div className="a-page-head" style={{ marginTop: 0 }}>
        <span className="a-muted">进行中的对局不能删除</span>
        <div className="a-actions">
          <button type="button" className="a-btn a-btn-ghost a-btn-sm" onClick={selectDeletable}>全选可删</button>
          <button type="button" className="a-btn a-btn-danger a-btn-sm" onClick={deleteSelected} disabled={batching || selectedIds.length === 0}>
            {batching ? '删除中…' : `删除选中 ${selectedIds.length}`}
          </button>
          <button type="button" className="a-btn a-btn-primary a-btn-sm" onClick={loadAllMatches} disabled={loading}>
            {loading ? '加载中…' : '刷新'}
          </button>
        </div>
      </div>

      <div className="a-tabs" role="tablist">
        {[
          ['done', '已结束'],
          ['live', '进行中'],
          ['all', '全部'],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={listFilter === key}
            className={`a-tab${listFilter === key ? ' is-on' : ''}`}
            onClick={() => { setListFilter(key); setSelectedIds([]); setPage(1); }}
          >
            {label}
          </button>
        ))}
      </div>

      {error && <div className="a-alert a-alert-error">{error}</div>}
      <div className="a-filters">
        <input className="a-input" type="search" placeholder="搜索 ID / 游戏 / 玩家" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
      </div>

      <div className="a-table-wrap">
        <table className="a-table">
          <thead>
            <tr>
              <th style={{ width: 40 }} />
              <th>游戏</th>
              <th>Match ID</th>
              <th>状态</th>
              <th>玩家</th>
              <th>
                <button type="button" className="a-th-sort" onClick={() => { setSortDir((d) => (d === 'desc' ? 'asc' : 'desc')); setPage(1); }}>
                  创建时间 {sortDir === 'desc' ? '↓' : '↑'}
                </button>
              </th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {visibleMatches.length === 0 && !loading ? (
              <tr>
                <td colSpan="7"><div className="a-empty">这一栏没有对局</div></td>
              </tr>
            ) : (
              visibleMatches.map((match) => {
                const deletable = canDelete(match);
                return (
                  <tr key={match.id}>
                    <td>
                      {deletable ? (
                        <input
                          type="checkbox"
                          aria-label={`选择 ${match.id}`}
                          checked={selectedIds.includes(match.id)}
                          onChange={() => toggleSelect(match.id)}
                        />
                      ) : null}
                    </td>
                    <td>{match.game_name || match.game_id}</td>
                    <td className="a-muted" style={{ fontFamily: 'monospace', fontSize: 12 }}>{match.id}</td>
                    <td>
                      <span className={`a-badge ${statusBadge(match.status)}`}>
                        {STATUS_LABEL[match.status] || match.status}
                      </span>
                    </td>
                    <td className="a-muted">{formatPlayerInfo(match.players)}</td>
                    <td className="a-muted">{formatDate(match.created_at)}</td>
                    <td>
                      {deletable ? (
                        <button type="button" className="a-btn a-btn-danger a-btn-sm" onClick={() => deleteOne(match.id)}>删除</button>
                      ) : (
                        <span className="a-muted">进行中不可删</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <Pager page={page} limit={limit} total={total} onPage={setPage} />
    </div>
  );
};

export default GameDatabaseManagement;
