const { WebSocketServer } = require('ws');
const { verifyToken } = require('./middleware/auth');
const User = require('./models/User');
const MatchPlayer = require('./models/MatchPlayer');
const { matchRuntime } = require('./runtime/MatchRuntime');

function parseCookies(cookieHeader = '') {
  const out = {};
  cookieHeader.split(';').forEach((part) => {
    const [k, ...rest] = part.trim().split('=');
    if (k) out[k] = decodeURIComponent(rest.join('=') || '');
  });
  return out;
}

async function resolveUser(token) {
  if (!token) return null;
  const decoded = verifyToken(token);
  if (!decoded) return null;
  const userId = decoded.userId || decoded.id;
  if (!userId) return null;
  return User.findById(userId);
}

function send(ws, obj) {
  if (ws.readyState === 1) {
    ws.send(JSON.stringify(obj));
  }
}

/**
 * 挂载 WebSocket：路径 /ws
 */
function attachWebSocket(server) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', async (ws, req) => {
    ws.user = null;
    ws.matchId = null;

    // 尝试从 Cookie 预鉴权
    const cookies = parseCookies(req.headers.cookie || '');
    const cookieToken = cookies.access_token;
    if (cookieToken) {
      ws.user = await resolveUser(cookieToken);
    }

    ws.on('message', async (raw) => {
      let msg;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return send(ws, { type: 'error', message: '无效 JSON' });
      }

      try {
        if (msg.type === 'join') {
          if (msg.token) {
            ws.user = await resolveUser(msg.token);
          }
          if (!ws.user) {
            return send(ws, { type: 'error', message: '未登录' });
          }

          const matchId = msg.matchId;
          if (!matchId) {
            return send(ws, { type: 'error', message: '缺少 matchId' });
          }

          const seat = await MatchPlayer.findByUserIdAndMatchId(ws.user.id, matchId);
          if (!seat) {
            return send(ws, { type: 'error', message: '您不在此对局中' });
          }

          if (ws.matchId) {
            matchRuntime.unsubscribe(ws.matchId, ws);
          }
          ws.matchId = matchId;
          ws.seatIndex = seat.seat_index;
          matchRuntime.subscribe(matchId, ws);

          const room = matchRuntime.getRoom(matchId);
          if (room) {
            send(ws, { ...matchRuntime.buildPublicState(room), type: 'state' });
          } else {
            send(ws, {
              type: 'state',
              matchId,
              status: 'waiting',
              G: null,
              turn: null,
              players: [],
              result: null,
              message: '对局尚未开始',
            });
          }
          return;
        }

        if (msg.type === 'move') {
          if (!ws.user || ws.seatIndex === undefined || ws.seatIndex === null) {
            return send(ws, { type: 'error', message: '请先 join' });
          }
          const matchId = msg.matchId || ws.matchId;
          const result = await matchRuntime.playMove(matchId, ws.seatIndex, msg.move);
          if (result.error) {
            return send(ws, { type: 'error', matchId, message: result.error });
          }
          return;
        }

        send(ws, { type: 'error', message: `未知消息类型: ${msg.type}` });
      } catch (err) {
        console.error('[WS] handler error:', err);
        send(ws, { type: 'error', message: err.message || '服务器错误' });
      }
    });

    ws.on('close', () => {
      matchRuntime.unsubscribeAll(ws);
    });
  });

  console.log('🔌 WebSocket 已挂载: /ws');
  return wss;
}

module.exports = { attachWebSocket };
