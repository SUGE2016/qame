#!/usr/bin/env node
/**
 * Streamable HTTP MCP 冒烟：/health + initialize + tools/list。
 * 默认自启临时端口；已有服务时设 QAME_MCP_URL=http://127.0.0.1:8091
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXPECTED = [
  'qame_login',
  'qame_create_pat',
  'qame_list_pats',
  'qame_revoke_pat',
  'qame_list_games',
  'qame_list_matches',
  'qame_get_match',
  'qame_create_match',
  'qame_join_match',
  'qame_start_match',
  'qame_get_state',
  'qame_watch_state',
  'qame_submit_move',
  'qame_cancel_match',
  'qame_spectate',
  'qame_get_history',
  'qame_my_stats',
  'qame_leaderboard',
];

function fail(msg) {
  console.error(`FAIL ${msg}`);
  process.exit(1);
}

function pass(msg) {
  console.log(`PASS ${msg}`);
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close((err) => (err ? reject(err) : resolve(port)));
    });
  });
}

async function waitHealth(base) {
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(`${base}/health`);
      if (res.ok) return res.json();
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  fail(`server failed to start on ${base}`);
}

async function listTools(url, headers) {
  const transport = new StreamableHTTPClientTransport(new URL(url), {
    requestInit: headers ? { headers } : undefined,
  });
  const client = new Client({ name: 'qame-mcp-smoke', version: '0.0.1' });
  try {
    await client.connect(transport);
    const result = await client.listTools();
    return result.tools.map((t) => t.name);
  } finally {
    await client.close().catch(() => {});
  }
}

async function main() {
  const existing = process.env.QAME_MCP_URL;
  let child;
  let base;

  if (existing) {
    base = existing.replace(/\/$/, '').replace(/\/mcp$/, '');
  } else {
    const port = await freePort();
    base = `http://127.0.0.1:${port}`;
    child = spawn(process.execPath, [path.join(ROOT, 'src/http.js')], {
      cwd: ROOT,
      env: { ...process.env, PORT: String(port), MCP_HOST: '127.0.0.1' },
      stdio: ['ignore', 'ignore', 'inherit'],
    });
  }

  try {
    const health = await waitHealth(base);
    if (health.service !== 'qame-mcp' || health.mcp?.path !== '/mcp') {
      fail(`/health unexpected: ${JSON.stringify(health)}`);
    }
    pass('/health (+ mcp path)');

    const names = await listTools(`${base}/mcp`);
    const missing = EXPECTED.filter((n) => !names.includes(n));
    if (missing.length) fail(`tools missing: ${missing.join(', ')}`);
    pass(`initialize + tools/list (${EXPECTED.length})`);

    const named = await listTools(`${base}/mcp`, { Authorization: 'Bearer smoke-not-a-real-pat' });
    if (!EXPECTED.every((n) => named.includes(n))) {
      fail('tools/list with Authorization header diverged');
    }
    pass('initialize accepts Authorization: Bearer');

    console.log(`\nALL PASS base=${base}`);
  } finally {
    if (child) {
      child.kill('SIGTERM');
      await new Promise((r) => {
        child.once('exit', r);
        setTimeout(r, 1500);
      });
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
