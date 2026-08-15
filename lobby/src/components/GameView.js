import React, { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '@qame/shared-utils';
import { canDeleteMatch, deleteMatchWithConfirm } from '../utils/matchUtils';
import { useDialog, useToast, DialogRenderer } from '@qame/shared-ui';
import { Icon } from '../icons';
import { boardFor, seatMark } from '../games/registry';

const STATUS_LABEL = {
  waiting: '等人',
  playing: '进行中',
  finished: '已结束',
  cancelled: '已取消',
};

function buildWsUrl() {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/ws`;
}

const GameView = ({ matchID, playerID, playerName, gameName = 'tic-tac-toe', spectate = false, onReturnToLobby, onReplay }) => {
  const [matchInfo, setMatchInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [G, setG] = useState(null);
  const [turn, setTurn] = useState(null);
  const [status, setStatus] = useState('waiting');
  const [result, setResult] = useState(null);
  const [wsError, setWsError] = useState(null);
  const [gameDisplayName, setGameDisplayName] = useState(gameName);
  const wsRef = useRef(null);

  const { confirm, dialogs } = useDialog();
  const { success: toastSuccess, error: toastError, ToastContainer } = useToast();
  const toast = { success: toastSuccess, error: toastError };

  useEffect(() => {
    api.getGames().then((response) => {
      if (response.code === 200) {
        const game = response.data.games.find((g) => g.id === gameName);
        if (game?.name) setGameDisplayName(game.name);
      }
    }).catch(() => {});
  }, [gameName]);

  useEffect(() => {
    const fetchMatchInfo = async () => {
      try {
        const matchResponse = await api.getMatches();
        if (matchResponse.code === 200) {
          const currentMatch = matchResponse.data.find((m) => m.id === matchID);
          if (currentMatch) setMatchInfo(currentMatch);
        }
      } catch (error) {
        console.error('获取match信息失败:', error);
      } finally {
        setLoading(false);
      }
    };
    if (matchID) fetchMatchInfo();
  }, [matchID]);

  const applyStateMessage = useCallback((msg) => {
    if (msg.G !== undefined) {
      setG((prev) => {
        const next = msg.G;
        if (!prev || !next) return next;
        return {
          ...next,
          ships0: next.ships0 ?? msg.result?.ships0 ?? prev.ships0,
          ships1: next.ships1 ?? msg.result?.ships1 ?? prev.ships1,
        };
      });
    }
    if (msg.turn !== undefined) setTurn(msg.turn);
    if (msg.status) setStatus(msg.status);
    if (msg.result !== undefined) setResult(msg.result);
    if (msg.type === 'end' && msg.result) {
      setResult(msg.result);
      setStatus('finished');
    }
  }, []);

  const hydrateFromHttp = useCallback(async () => {
    if (!matchID) return;
    try {
      if (spectate) {
        const res = await api.getMatchHistory(matchID);
        if (res.code === 200 && res.data?.live) applyStateMessage(res.data.live);
        return;
      }
      const res = await api.get(`/api/play/${matchID}`);
      if (res.code === 200) applyStateMessage(res.data);
    } catch (_) {}
  }, [matchID, spectate, applyStateMessage]);

  useEffect(() => {
    hydrateFromHttp();
  }, [hydrateFromHttp]);

  useEffect(() => {
    if (!matchID) return undefined;
    let cancelled = false;
    let retryTimer;
    let pollTimer;

    const connect = () => {
      if (cancelled) return;
      const ws = new WebSocket(buildWsUrl());
      wsRef.current = ws;
      ws.onopen = () => {
        setWsError(null);
        const token = sessionStorage.getItem('accessToken');
        ws.send(JSON.stringify({ type: 'join', matchId: matchID, token: token || undefined }));
      };
      ws.onmessage = (ev) => {
        let msg;
        try {
          msg = JSON.parse(ev.data);
        } catch {
          return;
        }
        if (msg.type === 'error') {
          setWsError(msg.message || 'WS 错误');
          return;
        }
        if (msg.type === 'state' || msg.type === 'end') {
          applyStateMessage(msg);
        }
      };
      ws.onerror = () => {};
      ws.onclose = () => {
        if (wsRef.current === ws) wsRef.current = null;
        if (!cancelled) retryTimer = setTimeout(connect, 1500);
      };
    };

    connect();
    pollTimer = setInterval(() => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) hydrateFromHttp();
    }, 2000);

    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
      clearInterval(pollTimer);
      const ws = wsRef.current;
      wsRef.current = null;
      if (ws) ws.close();
    };
  }, [matchID, applyStateMessage, hydrateFromHttp]);

  const onMove = useCallback(async (move) => {
    if (spectate) return;
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'move', matchId: matchID, move }));
      return;
    }
    try {
      const res = await api.post(`/api/play/${matchID}/move`, { move });
      if (res.code === 200) {
        setWsError(null);
        applyStateMessage(res.data);
      } else {
        setWsError(res.message || '落子失败');
      }
    } catch (_) {
      setWsError('落子失败，请重试');
    }
  }, [matchID, spectate, applyStateMessage]);

  const ctx = {
    currentPlayer: turn,
    gameover: result,
  };
  const moves = { makeMove: onMove };
  const Board = boardFor(gameName);
  const players = matchInfo?.players || [];
  const seat0 = players.find((p) => Number(p.seatIndex) === 0);
  const seat1 = players.find((p) => Number(p.seatIndex) === 1);
  const turnName = players.find((p) => String(p.seatIndex) === String(turn))?.playerName;
  const myTurn = !spectate && !result && String(playerID) === String(turn) && status === 'playing';

  let statusText = '等待棋盘…';
  let statusClass = 'is-wait';
  if (result?.draw) {
    statusText = '平局';
    statusClass = 'is-over';
  } else if (result?.winner != null) {
    const winner = players.find((p) => String(p.seatIndex) === String(result.winner));
    statusText = `${seatMark(gameName, result.winner)} ${winner?.playerName || ''} 胜`;
    statusClass = 'is-over';
  } else if (status === 'waiting') {
    statusText = '尚未开局';
  } else if (spectate) {
    statusText = `旁观 · 轮到 ${seatMark(gameName, turn)}${turnName ? ` · ${turnName}` : ''}`;
  } else if (myTurn) {
    statusText = '轮到你';
    statusClass = 'is-you';
  } else if (status === 'playing') {
    statusText = `等待 ${turnName || seatMark(gameName, turn)}`;
  }

  let user = {};
  try { user = JSON.parse(sessionStorage.getItem('user') || '{}'); } catch (_) {}
  const userId = user.id ?? user.user?.id;
  const isAdmin = (user.role ?? user.user?.role) === 'admin';
  const canDelete = canDeleteMatch({ ...(matchInfo || {}), id: matchID, status }, { userId, isAdmin });

  const renderSeat = (player, seat) => (
    <aside className={`q-seat-card is-${seat === 0 ? 'x' : 'o'}${String(turn) === String(seat) && !result ? ' is-turn' : ''}${!spectate && String(playerID) === String(seat) ? ' is-me' : ''}`}>
      <div className="q-seat-mark">{seatMark(gameName, seat)}</div>
      <div className="q-seat-name">{player?.playerName || playerName || '空座'}</div>
      <div className="q-seat-meta">
        {!spectate && String(playerID) === String(seat) ? '你' : `座位 ${seat}`}
      </div>
    </aside>
  );

  return (
    <div className="q-play">
      <div className="q-play-head">
        <div className="q-play-title">
          <h1>{spectate ? '旁观' : '对局'} · {gameDisplayName}</h1>
          <span className={`q-badge ${status === 'playing' ? 'q-badge-play' : status === 'waiting' ? 'q-badge-wait' : 'q-badge-done'}`}>
            {spectate ? '旁观' : (STATUS_LABEL[status] || status)}
          </span>
        </div>
        <span className="q-play-id">{matchID?.slice(0, 8)}</span>
      </div>

      <div className="q-play-stage">
        {loading ? <p className="q-hint">加载座位…</p> : renderSeat(seat0, 0)}
        <div className="q-board-wrap">
          {G ? (
            <Board
              G={G}
              ctx={ctx}
              moves={moves}
              playerID={spectate ? null : String(playerID)}
            />
          ) : (
            <p className="q-hint">{status === 'waiting' ? '创建者开局后出现棋盘' : '正在同步局面…'}</p>
          )}
          <p className={`q-play-status ${statusClass}`}>{statusText}</p>
          {wsError && <p className="q-alert" style={{ margin: 0 }}>{wsError}</p>}
        </div>
        {loading ? <p className="q-hint"> </p> : renderSeat(seat1, 1)}
      </div>

      <div className="q-play-actions">
        {status === 'finished' && onReplay && (
          <button type="button" className="q-btn q-btn-cta" onClick={() => onReplay(matchID, gameName)}>回放</button>
        )}
        <button type="button" className="q-btn q-btn-ghost" onClick={() => (onReturnToLobby ? onReturnToLobby() : window.history.back())}>
          返回大厅
        </button>
        {canDelete && (
          <button
            type="button"
            className="q-btn q-btn-danger"
            onClick={() => {
              deleteMatchWithConfirm(matchID, {
                confirm,
                toast,
                onSuccess: () => {
                  if (onReturnToLobby) onReturnToLobby();
                  else window.history.back();
                }
              });
            }}
          >
            <Icon name="trash" size={16} />
            删除
          </button>
        )}
      </div>
      <DialogRenderer dialogs={dialogs} />
      <ToastContainer />
    </div>
  );
};

export default GameView;
