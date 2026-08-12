#!/usr/bin/env node
/**
 * 极简选手 CLI（主动参赛）
 *
 *   QAME_URL=https://localhost node cli/qame.js state  <matchId> <seatToken>
 *   QAME_URL=https://localhost node cli/qame.js move   <matchId> <seatToken> <move>
 *   QAME_URL=https://localhost node cli/qame.js play   <matchId> <seatToken> [--once]
 *
 * play：轮询到 yourTurn 后，从 stdin 读一手（或随机合法手若设 QAME_AUTO=1）
 */

const BASE = (process.env.QAME_URL || 'http://localhost:8001').replace(/\/$/, '');

async function api(method, path, seatToken, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${seatToken}`,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok || data.code >= 400) {
    throw new Error(data.message || `HTTP ${res.status}`);
  }
  return data.data;
}

function usage() {
  console.log(`Usage:
  qame state <matchId> <seatToken>
  qame move  <matchId> <seatToken> <move>
  qame play  <matchId> <seatToken> [--once]

Env: QAME_URL (default http://localhost:8001), QAME_AUTO=1 自动随机合法手`);
  process.exit(1);
}

async function readMove(legal) {
  if (process.env.QAME_AUTO === '1') {
    if (!legal?.length) throw new Error('无合法手');
    return legal[Math.floor(Math.random() * legal.length)];
  }
  const readline = require('readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) => new Promise((r) => rl.question(q, r));
  const raw = await ask(`your move ${JSON.stringify(legal)} > `);
  rl.close();
  const n = Number(raw.trim());
  if (Number.isNaN(n)) throw new Error('move 须为数字');
  return n;
}

async function main() {
  const [cmd, matchId, seatToken, arg3] = process.argv.slice(2);
  if (!cmd || !matchId || !seatToken) usage();

  if (cmd === 'state') {
    console.log(JSON.stringify(await api('GET', `/api/play/${matchId}`, seatToken), null, 2));
    return;
  }

  if (cmd === 'move') {
    if (arg3 === undefined) usage();
    const move = Number(arg3);
    console.log(JSON.stringify(await api('POST', `/api/play/${matchId}/move`, seatToken, { move }), null, 2));
    return;
  }

  if (cmd === 'play') {
    const once = process.argv.includes('--once');
    for (;;) {
      const st = await api('GET', `/api/play/${matchId}`, seatToken);
      if (st.status === 'finished' || st.result) {
        console.log('finished', JSON.stringify(st.result));
        return;
      }
      if (st.status !== 'playing') {
        process.stdout.write(`waiting status=${st.status}\r`);
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }
      if (!st.yourTurn) {
        process.stdout.write(`turn=${st.turn} seat=${st.seatIndex}   \r`);
        await new Promise((r) => setTimeout(r, 800));
        continue;
      }
      const move = await readMove(st.legalMoves);
      const next = await api('POST', `/api/play/${matchId}/move`, seatToken, { move });
      console.log('\nmoved', move, '->', next.result || `turn ${next.turn}`);
      if (once || next.result) {
        if (next.result) console.log('finished', JSON.stringify(next.result));
        return;
      }
    }
  }

  usage();
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
