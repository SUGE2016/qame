import React, { useEffect, useMemo, useState } from 'react';
import { api } from '@qame/shared-utils';
import { boardFor, gameTitle, seatMark } from '../games/registry';

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function playIntervalMs(gameId, moveCount) {
  if (prefersReducedMotion()) return 1600;
  if (gameId === 'gomoku' || gameId === 'battleship') return moveCount > 40 ? 450 : 600;
  return 900;
}

function cellCount(gameId) {
  if (gameId === 'gomoku') return 81;
  if (gameId === 'battleship') return 100;
  return 9;
}

function moveIndex(move) {
  if (typeof move === 'number') return move;
  if (move && typeof move === 'object' && move.move !== undefined) return Number(move.move);
  return Number(move);
}

function boardAt(gameId, moves, step, result) {
  if (gameId === 'battleship') {
    const ships0 = result?.ships0 || [];
    const ships1 = result?.ships1 || [];
    const set0 = new Set(ships0.flat().map(Number));
    const set1 = new Set(ships1.flat().map(Number));
    const shots0 = {};
    const shots1 = {};
    for (const m of moves.slice(0, step)) {
      const idx = moveIndex(m.move);
      if (!Number.isInteger(idx)) continue;
      if (Number(m.seatIndex) === 0) shots1[String(idx)] = set1.has(idx) ? 'hit' : 'miss';
      else shots0[String(idx)] = set0.has(idx) ? 'hit' : 'miss';
    }
    return { size: 10, ships0, ships1, shots0, shots1 };
  }
  const cells = Array(cellCount(gameId)).fill(null);
  let lastMove = null;
  for (const m of moves.slice(0, step)) {
    const idx = moveIndex(m.move);
    if (Number.isInteger(idx) && idx >= 0 && idx < cells.length) {
      cells[idx] = String(m.seatIndex);
      lastMove = idx;
    }
  }
  return { cells, lastMove };
}

const ReplayView = ({ matchID, gameName = 'tic-tac-toe', onReturnToLobby }) => {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api.getMatchHistory(matchID).then((res) => {
      if (cancelled) return;
      if (res.code !== 200) {
        setError(res.message || '加载复盘失败');
        return;
      }
      setData(res.data);
      setStep(0);
      setPlaying(!prefersReducedMotion() && (res.data.moves || []).length > 0);
    }).catch(() => {
      if (!cancelled) setError('加载复盘失败');
    });
    return () => { cancelled = true; };
  }, [matchID]);

  const gameId = data?.gameId || gameName;
  const moves = data?.moves || [];
  const result = data?.result;
  const G = useMemo(() => boardAt(gameId, moves, step, result), [gameId, moves, step, result]);
  const Board = boardFor(gameId);
  const atEnd = step >= moves.length;
  const intervalMs = playIntervalMs(gameId, moves.length);
  const players = data?.players || [];
  const seat0 = players.find((p) => Number(p.seatIndex) === 0);
  const seat1 = players.find((p) => Number(p.seatIndex) === 1);

  useEffect(() => {
    if (!playing || !data || moves.length === 0) return undefined;
    if (step >= moves.length) {
      setPlaying(false);
      return undefined;
    }
    const timer = setTimeout(() => setStep((s) => Math.min(moves.length, s + 1)), intervalMs);
    return () => clearTimeout(timer);
  }, [playing, data, moves.length, step, intervalMs]);

  const pauseAt = (next) => {
    setPlaying(false);
    setStep(next);
  };

  const ctx = {
    currentPlayer: atEnd ? null : String(moves[step]?.seatIndex ?? 0),
    gameover: atEnd && result ? (result.draw ? { draw: true } : { winner: result.winner != null ? String(result.winner) : undefined }) : undefined,
  };

  let statusText = `第 ${step} / ${moves.length} 手`;
  if (atEnd && result?.draw) statusText += ' · 平局';
  if (atEnd && result?.winner != null) statusText += ` · ${seatMark(gameId, result.winner)} 胜`;

  const renderSeat = (player, seat) => (
    <aside className={`q-seat-card is-${seat === 0 ? 'x' : 'o'}`}>
      <div className="q-seat-mark">{seatMark(gameId, seat)}</div>
      <div className="q-seat-name">{player?.playerName || '空座'}</div>
      <div className="q-seat-meta">座位 {seat}</div>
    </aside>
  );

  return (
    <div className="q-play">
      <div className="q-play-head">
        <div className="q-play-title">
          <h1>回放 · {gameTitle(gameId)}</h1>
          <span className="q-badge q-badge-done">回放</span>
        </div>
        <span className="q-play-id">{matchID?.slice(0, 8)}</span>
      </div>

      {error && <div className="q-alert">{error}</div>}
      {!data && !error && <p className="q-hint">加载回放…</p>}

      {data && (
        <div className="q-play-stage">
          {renderSeat(seat0, 0)}
          <div className="q-board-wrap">
            {moves.length === 0 ? (
              <p className="q-hint">没有手顺</p>
            ) : (
              <Board G={G} ctx={ctx} moves={{ makeMove: () => {} }} playerID={null} />
            )}
            <p className={`q-play-status ${atEnd ? 'is-over' : 'is-wait'}`}>{statusText}</p>
            <input
              type="range"
              min={0}
              max={moves.length}
              value={step}
              onChange={(e) => pauseAt(Number(e.target.value))}
              disabled={moves.length === 0}
              aria-label="回放进度"
              style={{ width: '100%', maxWidth: 360 }}
            />
          </div>
          {renderSeat(seat1, 1)}
        </div>
      )}

      <div className="q-play-actions">
        <button type="button" className="q-btn q-btn-sm q-btn-primary" onClick={() => {
          if (atEnd) setStep(0);
          setPlaying((p) => !p);
        }}>
          {playing ? '暂停' : atEnd ? '重播' : '播放'}
        </button>
        <button type="button" className="q-btn q-btn-sm q-btn-ghost" onClick={() => pauseAt(0)} disabled={step === 0}>开头</button>
        <button type="button" className="q-btn q-btn-sm q-btn-ghost" onClick={() => pauseAt(Math.max(0, step - 1))} disabled={step === 0}>上一步</button>
        <button type="button" className="q-btn q-btn-sm q-btn-ghost" onClick={() => pauseAt(Math.min(moves.length, step + 1))} disabled={step >= moves.length}>下一步</button>
        <button type="button" className="q-btn q-btn-sm q-btn-ghost" onClick={() => pauseAt(moves.length)} disabled={step >= moves.length}>结局</button>
        <button type="button" className="q-btn q-btn-ghost" onClick={onReturnToLobby}>返回大厅</button>
      </div>
    </div>
  );
};

export default ReplayView;
