import { api, session } from './client.js';

export function stateUri(matchId) {
  return `qame://match/${matchId}/state`;
}

export function stateFingerprint(data) {
  if (!data) return '';
  return JSON.stringify({
    status: data.status,
    yourTurn: data.yourTurn,
    result: data.result,
    turn: data.turn,
    G: data.G,
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchPlayState(matchId, seatToken) {
  const token = seatToken || session.seats.get(matchId);
  if (!token) throw new Error('无 seatToken：请先 qame_join_match 或传入 seatToken');
  return api('GET', `/api/play/${matchId}`, { seatToken: token, auth: false });
}

/**
 * 等到 yourTurn / 终局，或局面相对首次快照发生变化。
 * until: 'turn_or_over' | 'change'
 */
export async function watchState(
  matchId,
  { seatToken, timeoutMs = 25000, intervalMs = 800, until = 'turn_or_over' } = {}
) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  let lastFp = null;
  while (Date.now() < deadline) {
    last = await fetchPlayState(matchId, seatToken);
    const fp = stateFingerprint(last);
    const over = Boolean(last.result) || last.status === 'finished';
    const myTurn = last.yourTurn === true;
    if (until === 'change') {
      if (lastFp && fp !== lastFp) return { reason: 'changed', ...last };
    } else if (myTurn || over) {
      return { reason: myTurn ? 'yourTurn' : 'over', ...last };
    }
    lastFp = fp;
    const left = deadline - Date.now();
    if (left <= 0) break;
    await sleep(Math.min(intervalMs, left));
  }
  return { reason: 'timeout', ...last };
}
