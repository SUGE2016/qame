#!/usr/bin/env node
/**
 * QAME MCP Server (Streamable HTTP) — 供 DiOS 等容器内 Agent 远程注册
 * 工具面与 stdio 相同。日志写 stderr。
 */
import { randomUUID } from 'node:crypto';
import http from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import {
  autoLoginIfConfigured,
  createSession,
  defaultSession,
  runWithSession,
} from './client.js';
import { createQameServer } from './server.js';

const PORT = Number(process.env.PORT || process.env.MCP_PORT || 8091);
const HOST = process.env.MCP_HOST || '0.0.0.0';

/** @type {Map<string, { transport: StreamableHTTPServerTransport, qameSession: ReturnType<typeof createSession> }>} */
const sessions = new Map();

function bearerToken(req) {
  const header = req.headers.authorization;
  if (!header) return null;
  const match = /^Bearer\s+(\S+)/i.exec(String(header));
  return match ? match[1] : null;
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function rpcError(code, message) {
  return { jsonrpc: '2.0', error: { code, message }, id: null };
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return undefined;
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return undefined;
  return JSON.parse(raw);
}

function sessionFromRequest(req) {
  const token = bearerToken(req) || defaultSession.token;
  const sameAsDefault = token === defaultSession.token;
  return createSession({
    token,
    refreshToken: sameAsDefault ? defaultSession.refreshToken : null,
  });
}

async function handleMcp(req, res) {
  const sessionIdHeader = req.headers['mcp-session-id'];
  const sessionId = typeof sessionIdHeader === 'string' ? sessionIdHeader : undefined;
  const existing = sessionId ? sessions.get(sessionId) : undefined;

  if (existing) {
    const body = req.method === 'POST' ? await readJsonBody(req) : undefined;
    await runWithSession(existing.qameSession, () => existing.transport.handleRequest(req, res, body));
    return;
  }

  if (req.method === 'POST') {
    let body;
    try {
      body = await readJsonBody(req);
    } catch {
      sendJson(res, 400, rpcError(-32700, 'Parse error'));
      return;
    }
    if (isInitializeRequest(body)) {
      const qameSession = sessionFromRequest(req);
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (id) => {
          sessions.set(id, { transport, qameSession });
        },
      });
      transport.onclose = () => {
        const sid = transport.sessionId;
        if (sid) sessions.delete(sid);
      };
      const server = createQameServer();
      await server.connect(transport);
      await runWithSession(qameSession, () => transport.handleRequest(req, res, body));
      return;
    }
  }

  if (sessionId) {
    sendJson(res, 404, rpcError(-32001, 'Session not found'));
    return;
  }
  sendJson(res, 400, rpcError(-32000, 'Bad Request: Session ID required'));
}

const httpServer = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    if (req.method === 'GET' && url.pathname === '/health') {
      sendJson(res, 200, {
        status: 'ok',
        service: 'qame-mcp',
        transport: 'streamable_http',
        mcp: { path: '/mcp' },
      });
      return;
    }
    if (url.pathname === '/mcp' && (req.method === 'POST' || req.method === 'GET' || req.method === 'DELETE')) {
      await handleMcp(req, res);
      return;
    }
    sendJson(res, 404, { error: 'not found' });
  } catch (err) {
    console.error('[qame-mcp] http error', err);
    if (!res.headersSent) {
      sendJson(res, 500, rpcError(-32603, 'Internal server error'));
    }
  }
});

async function main() {
  try {
    const boot = await autoLoginIfConfigured();
    console.error(`[qame-mcp] boot auth: ${boot.mode}${boot.username ? ` (${boot.username})` : ''}`);
  } catch (err) {
    console.error(`[qame-mcp] auto login skipped: ${err.message}`);
  }

  await new Promise((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(PORT, HOST, () => {
      httpServer.off('error', reject);
      resolve();
    });
  });
  console.error(`[qame-mcp] streamable_http listening on http://${HOST}:${PORT}/mcp`);
}

function shutdown() {
  console.error('[qame-mcp] shutting down');
  for (const { transport } of sessions.values()) {
    transport.close().catch(() => {});
  }
  sessions.clear();
  httpServer.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

main().catch((err) => {
  console.error('[qame-mcp] fatal', err);
  process.exit(1);
});
