#!/usr/bin/env node
/**
 * QAME MCP Server (stdio) — Cursor / 本机 Agent
 * 日志只写 stderr，避免破坏 JSON-RPC。
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { autoLoginIfConfigured } from './client.js';
import { createQameServer } from './server.js';

async function main() {
  try {
    const boot = await autoLoginIfConfigured();
    console.error(`[qame-mcp] boot auth: ${boot.mode}${boot.username ? ` (${boot.username})` : ''}`);
  } catch (err) {
    console.error(`[qame-mcp] auto login skipped: ${err.message}`);
  }

  const server = createQameServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[qame-mcp] listening on stdio');
}

main().catch((err) => {
  console.error('[qame-mcp] fatal', err);
  process.exit(1);
});
