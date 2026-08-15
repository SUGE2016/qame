import React from 'react';

const Pager = ({ page, limit, total, onPage }) => {
  const pages = Math.max(1, Math.ceil((total || 0) / (limit || 20)));
  return (
    <div className="a-pager">
      <button type="button" className="a-btn a-btn-ghost a-btn-sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>上一页</button>
      <span className="a-muted">第 {page} / {pages} 页（共 {total || 0} 条）</span>
      <button type="button" className="a-btn a-btn-ghost a-btn-sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>下一页</button>
    </div>
  );
};

export default Pager;
