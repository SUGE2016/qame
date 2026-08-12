import React, { useState, useEffect, useRef, useCallback } from 'react';
import TicTacToeBoard from '../games/TicTacToeBoard';
import GomokuBoard from '../games/GomokuBoard';
import { api } from '@qame/shared-utils';
import { deleteMatchWithConfirm } from '../utils/matchUtils';
import { useDialog, useToast, DialogRenderer } from '@qame/shared-ui';

function buildWsUrl() {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/ws`;
}

const GameView = ({ matchID, playerID, playerName, gameName = 'tic-tac-toe', onReturnToLobby }) => {
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
    if (msg.G !== undefined) setG(msg.G);
    if (msg.turn !== undefined) setTurn(msg.turn);
    if (msg.status) setStatus(msg.status);
    if (msg.result !== undefined) setResult(msg.result);
    if (msg.type === 'end' && msg.result) {
      setResult(msg.result);
      setStatus('finished');
    }
  }, []);

  useEffect(() => {
    if (!matchID) return undefined;

    const ws = new WebSocket(buildWsUrl());
    wsRef.current = ws;

    ws.onopen = () => {
      setWsError(null);
      ws.send(JSON.stringify({ type: 'join', matchId: matchID }));
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

    ws.onerror = () => setWsError('WebSocket 连接失败');
    ws.onclose = () => {
      if (wsRef.current === ws) wsRef.current = null;
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [matchID, applyStateMessage]);

  const onMove = useCallback((move) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      setWsError('连接未就绪');
      return;
    }
    ws.send(JSON.stringify({ type: 'move', matchId: matchID, move }));
  }, [matchID]);

  const ctx = {
    currentPlayer: turn,
    gameover: result,
  };
  const moves = { makeMove: onMove };
  const Board = gameName === 'gomoku' ? GomokuBoard : TicTacToeBoard;

  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
      <div style={{
        backgroundColor: 'white',
        padding: '20px',
        borderRadius: '8px',
        border: '1px solid #dee2e6',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
      }}>
        <div style={{ marginBottom: '20px', textAlign: 'center' }}>
          <h2 style={{ color: '#495057', marginBottom: '10px' }}>🎮 {gameDisplayName}</h2>
          <p style={{ color: '#666', fontSize: '14px', marginBottom: '15px' }}>
            Match ID: {matchID}
          </p>

          <div style={{
            display: 'flex',
            justifyContent: 'center',
            gap: '20px',
            marginBottom: '10px',
            flexWrap: 'wrap'
          }}>
            {loading ? (
              <p style={{ color: '#666', fontSize: '14px' }}>加载玩家信息...</p>
            ) : matchInfo?.players ? (
              matchInfo.players.map((player, index) => (
                <div
                  key={player.id || index}
                  style={{
                    backgroundColor: String(player.seatIndex) === String(playerID) ? '#e7f3ff' : '#f8f9fa',
                    border: String(player.seatIndex) === String(playerID) ? '2px solid #007bff' : '1px solid #dee2e6',
                    borderRadius: '8px',
                    padding: '10px 15px',
                    minWidth: '120px',
                    textAlign: 'center'
                  }}
                >
                  <div style={{
                    fontSize: '16px',
                    fontWeight: 'bold',
                    color: player.seatIndex === 0 ? '#f44336' : '#2196f3',
                    marginBottom: '5px'
                  }}>
                    {player.isAI || player.playerType === 'ai' ? '🤖' : '👤'}{' '}
                    {player.seatIndex === 0 ? 'X' : 'O'}
                  </div>
                  <div style={{ fontSize: '14px', color: '#666' }}>{player.playerName}</div>
                  <div style={{ fontSize: '12px', color: '#999', marginTop: '2px' }}>
                    {String(player.seatIndex) === String(playerID) ? '(你)' : `座位 ${player.seatIndex}`}
                  </div>
                </div>
              ))
            ) : (
              <div style={{
                backgroundColor: '#e7f3ff',
                border: '2px solid #007bff',
                borderRadius: '8px',
                padding: '10px 15px',
                textAlign: 'center'
              }}>
                <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#007bff' }}>👤 {playerName}</div>
                <div style={{ fontSize: '12px', color: '#999' }}>ID: {playerID}</div>
              </div>
            )}
          </div>

          <p style={{ color: '#666', fontSize: '12px' }}>
            状态:{' '}
            <span style={{
              color: status === 'playing' ? '#28a745' : '#6c757d',
              fontWeight: 'bold'
            }}>
              {status === 'waiting' ? '等待中'
                : status === 'playing' ? '游戏中'
                  : status === 'finished' ? '已结束' : status}
            </span>
          </p>
          {wsError && (
            <p style={{ color: '#dc3545', fontSize: '13px' }}>{wsError}</p>
          )}
        </div>

        {G ? (
          <Board
            G={G}
            ctx={ctx}
            moves={moves}
            playerID={String(playerID)}
            isActive={String(playerID) === String(turn) && !result}
            matchInfo={matchInfo}
          />
        ) : (
          <p style={{ textAlign: 'center', color: '#666' }}>
            {status === 'waiting' ? '对局尚未开始，请创建者点击「开始游戏」' : '等待棋盘状态...'}
          </p>
        )}

        <div style={{ marginTop: '20px', textAlign: 'center', display: 'flex', gap: '10px', justifyContent: 'center' }}>
          <button
            onClick={() => (onReturnToLobby ? onReturnToLobby() : window.history.back())}
            style={{
              padding: '8px 16px',
              backgroundColor: '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            返回游戏大厅
          </button>
          <button
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
            style={{
              padding: '8px 16px',
              backgroundColor: '#dc3545',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            🗑️ 删除对局
          </button>
        </div>
      </div>
      <DialogRenderer dialogs={dialogs} />
      <ToastContainer />
    </div>
  );
};

export default GameView;
