const { fetch } = require('undici');

const AI_TIMEOUT_MS = parseInt(process.env.AI_SERVICE_TIMEOUT || '30000', 10);

/**
 * 若当前回合是 AI，则调用其 endpoint /move 并写回 Runtime
 */
async function maybeRunAiTurn(runtime, matchId) {
  const room = runtime.getRoom(matchId);
  if (!room || room.status !== 'playing' || room.result || room.aiBusy) return;

  const current = room.players.find((p) => String(p.seatIndex) === String(room.turn));
  if (!current || current.playerType !== 'ai') return;

  const endpoint = current.clientEndpoint;
  if (!endpoint) {
    // 无 endpoint：主动选手模式，等待 /api/play 交手，不报错
    console.log(`[AiTurn] 座位 ${current.seatIndex} 无 endpoint，等待主动选手`);
    return;
  }

  room.aiBusy = true;
  try {
    const body = {
      game_id: room.gameId,
      match_id: matchId,
      player_id: String(current.seatIndex),
      G: room.G,
      ctx: {
        currentPlayer: room.turn,
        turn: undefined,
      },
      metadata: {
        turn: room.turn,
        current_bgio_player_id: room.turn,
      },
    };

    const url = `${endpoint.replace(/\/$/, '')}/move`;
    console.log(`[AiTurn] POST ${url}`);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

    let response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`AI HTTP ${response.status}: ${text}`);
    }

    const data = await response.json();
    const move = data.move;
    if (move === null || move === undefined || move === -1) {
      throw new Error('AI 返回无效 move');
    }

    const result = await runtime.playMove(matchId, current.seatIndex, move, { allowAi: true });
    if (result.error) {
      throw new Error(result.error);
    }
  } catch (err) {
    console.error(`[AiTurn] 失败 match=${matchId}:`, err.message);
    runtime.broadcast(matchId, {
      type: 'error',
      matchId,
      message: `AI 行动失败: ${err.message}`,
    });
  } finally {
    const r = runtime.getRoom(matchId);
    if (r) r.aiBusy = false;
  }
}

module.exports = { maybeRunAiTurn };
