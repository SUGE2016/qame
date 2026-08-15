#!/usr/bin/env node
/**
 * QAME MCP Server (stdio) — Cursor / Agent 参赛与办赛工具
 * 日志只写 stderr，避免破坏 JSON-RPC。
 */
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  api,
  autoLoginIfConfigured,
  ensurePlayer,
  errorResult,
  login,
  session,
  textResult,
} from './client.js';
import { fetchPlayState, stateUri, watchState } from './watch.js';

const server = new McpServer({
  name: 'qame',
  version: '1.0.0',
});

function requireAuth() {
  if (!session.token) {
    throw new Error('未登录。请先调用 qame_login，或配置 QAME_TOKEN / QAME_USERNAME+QAME_PASSWORD');
  }
}

server.registerTool(
  'qame_login',
  {
    description:
      '用密码登录（仅用于首次签发 PAT）。日常请配置 QAME_TOKEN，不要把密码写进 mcp.json。',
    inputSchema: {
      username: z.string().optional().describe('用户名；省略则用环境变量'),
      password: z.string().optional().describe('密码明文；省略则用环境变量'),
    },
  },
  async ({ username, password }) => {
    try {
      const u = username || process.env.QAME_USERNAME;
      const p = password || process.env.QAME_PASSWORD;
      if (!u || !p) throw new Error('需要 username/password 或环境变量');
      const data = await login(u, p);
      const player = await ensurePlayer();
      return textResult({
        ok: true,
        user: data.user,
        playerId: player.id,
        playerName: player.player_name,
        hint: '请接着 qame_create_pat，把返回的 token 写入 QAME_TOKEN 后去掉密码配置',
      });
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.registerTool(
  'qame_create_pat',
  {
    description: '创建个人访问令牌（只返回一次）。写入环境变量 QAME_TOKEN 后即可去掉用户名密码。',
    inputSchema: {
      name: z.string().optional().describe('备注，默认 mcp'),
      expiresInDays: z.number().int().optional().describe('省略则长期有效，可随时撤销'),
    },
  },
  async ({ name, expiresInDays }) => {
    try {
      requireAuth();
      const body = {};
      if (name) body.name = name;
      if (expiresInDays !== undefined) body.expiresInDays = expiresInDays;
      const data = await api('POST', '/api/auth/pats', { body });
      return textResult(data);
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.registerTool(
  'qame_list_pats',
  {
    description: '列出当前用户的访问令牌（不含明文）',
    inputSchema: {},
  },
  async () => {
    try {
      requireAuth();
      return textResult(await api('GET', '/api/auth/pats'));
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.registerTool(
  'qame_revoke_pat',
  {
    description: '撤销一条个人访问令牌',
    inputSchema: { patId: z.number().int() },
  },
  async ({ patId }) => {
    try {
      requireAuth();
      return textResult(await api('DELETE', `/api/auth/pats/${patId}`));
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.registerTool(
  'qame_list_games',
  {
    description: '列出 QAME 支持的游戏类型',
    inputSchema: {},
  },
  async () => {
    try {
      requireAuth();
      const data = await api('GET', '/api/games');
      return textResult(data);
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.registerTool(
  'qame_list_matches',
  {
    description: '列出比赛房间。可按 gameId、status（waiting/playing/finished）过滤。',
    inputSchema: {
      gameId: z.string().optional(),
      status: z.string().optional(),
    },
  },
  async ({ gameId, status }) => {
    try {
      requireAuth();
      const q = new URLSearchParams();
      if (gameId) q.set('gameId', gameId);
      if (status) q.set('status', status);
      const data = await api('GET', `/api/matches?${q}`);
      const summary = (data || []).map((m) => ({
        id: m.id,
        gameId: m.game_id,
        gameName: m.game_name,
        status: m.status,
        players: (m.players || []).map((p) => ({
          seat: p.seatIndex,
          name: p.playerName,
          type: p.playerType,
        })),
        currentPlayerCount: m.currentPlayerCount,
        minPlayers: m.min_players,
        maxPlayers: m.max_players,
        creator: m.creator_name,
      }));
      return textResult({ count: summary.length, matches: summary });
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.registerTool(
  'qame_get_match',
  {
    description: '获取单个比赛详情（含玩家列表与可选 runtime 状态）',
    inputSchema: {
      matchId: z.string(),
    },
  },
  async ({ matchId }) => {
    try {
      requireAuth();
      const data = await api('GET', `/api/matches/${matchId}`);
      return textResult(data);
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.registerTool(
  'qame_create_match',
  {
    description: '创建比赛房间。可选 joinSelf 立即以当前用户入座（开房等人挑战）。',
    inputSchema: {
      gameId: z.string().describe('如 tic-tac-toe 或 gomoku'),
      joinSelf: z.boolean().optional().describe('默认 true：创建后自动入座'),
    },
  },
  async ({ gameId, joinSelf = true }) => {
    try {
      requireAuth();
      const match = await api('POST', '/api/matches', { body: { gameId } });
      const out = { matchId: match.id, gameId: match.game_id, status: match.status };
      if (joinSelf) {
        const player = await ensurePlayer();
        const joined = await api('POST', `/api/matches/${match.id}/players`, {
          body: { playerId: player.id },
        });
        if (joined.seatToken) {
          session.seats.set(match.id, joined.seatToken);
          out.seatToken = joined.seatToken;
          out.seatIndex = joined.seatIndex;
          out.stateUri = stateUri(match.id);
          try {
            await server.server.sendResourceListChanged();
          } catch (_) {}
        }
        out.joined = true;
      }
      return textResult(out);
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.registerTool(
  'qame_join_match',
  {
    description: '加入比赛座位，返回 seatToken（会缓存在 MCP 会话中供后续落子）。',
    inputSchema: {
      matchId: z.string(),
      seatIndex: z.number().int().optional().describe('可选指定座位号'),
    },
  },
  async ({ matchId, seatIndex }) => {
    try {
      requireAuth();
      const player = await ensurePlayer();
      const body = { playerId: player.id };
      if (seatIndex !== undefined) body.seatIndex = seatIndex;
      const joined = await api('POST', `/api/matches/${matchId}/players`, { body });
      if (joined.seatToken) {
        session.seats.set(matchId, joined.seatToken);
        try {
          await server.server.sendResourceListChanged();
        } catch (_) {}
      }
      return textResult({
        matchId,
        seatIndex: joined.seatIndex,
        playerName: joined.playerName,
        seatToken: joined.seatToken,
        stateUri: stateUri(matchId),
        note: '请保管 seatToken；后续 qame_watch_state / qame_submit_move 将自动使用缓存',
      });
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.registerTool(
  'qame_start_match',
  {
    description: '开始比赛（通常需房间创建者）。开局后棋盘进入 runtime。',
    inputSchema: {
      matchId: z.string(),
    },
  },
  async ({ matchId }) => {
    try {
      requireAuth();
      await api('POST', `/api/matches/${matchId}/start`, { body: {} });
      return textResult({ matchId, started: true });
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.registerTool(
  'qame_get_state',
  {
    description: '选手视角立刻拉取局面：yourTurn、G、legalMoves、result。等对方时请用 qame_watch_state。',
    inputSchema: {
      matchId: z.string(),
      seatToken: z.string().optional().describe('省略则用本会话 join 缓存'),
    },
  },
  async ({ matchId, seatToken }) => {
    try {
      return textResult(await fetchPlayState(matchId, seatToken));
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.registerTool(
  'qame_watch_state',
  {
    description:
      '等待局面变化后返回。默认等到 yourTurn 或终局；until=change 则等到相对首次快照有变化。超时返回 reason=timeout 与最后快照。',
    inputSchema: {
      matchId: z.string(),
      seatToken: z.string().optional(),
      timeoutMs: z.number().int().optional().describe('默认 25000'),
      until: z.enum(['turn_or_over', 'change']).optional(),
    },
  },
  async ({ matchId, seatToken, timeoutMs, until }) => {
    try {
      const data = await watchState(matchId, { seatToken, timeoutMs, until });
      try {
        await server.server.sendResourceUpdated({ uri: stateUri(matchId) });
      } catch (_) {}
      return textResult(data);
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.registerTool(
  'qame_submit_move',
  {
    description: '提交一步棋（仅 yourTurn 时）。井字棋/五子棋 move 为格子下标数字。',
    inputSchema: {
      matchId: z.string(),
      move: z.number().describe('落子位置下标'),
      seatToken: z.string().optional(),
    },
  },
  async ({ matchId, move, seatToken }) => {
    try {
      const token = seatToken || session.seats.get(matchId);
      if (!token) throw new Error('无 seatToken：请先 qame_join_match 或传入 seatToken');
      const data = await api('POST', `/api/play/${matchId}/move`, {
        seatToken: token,
        auth: false,
        body: { move },
      });
      try {
        await server.server.sendResourceUpdated({ uri: stateUri(matchId) });
      } catch (_) {}
      return textResult(data);
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.registerTool(
  'qame_cancel_match',
  {
    description: '取消尚未结束的比赛（通常需创建者）',
    inputSchema: { matchId: z.string() },
  },
  async ({ matchId }) => {
    try {
      requireAuth();
      await api('POST', `/api/matches/${matchId}/cancel`, { body: {} });
      return textResult({ matchId, cancelled: true });
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.registerTool(
  'qame_spectate',
  {
    description: '观战/查看对局：手顺、结果、若仍在进行则含 live 局面（只读，不需 seatToken）',
    inputSchema: { matchId: z.string() },
  },
  async ({ matchId }) => {
    try {
      requireAuth();
      const data = await api('GET', `/api/stats/matches/${matchId}/history`);
      return textResult(data);
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.registerTool(
  'qame_get_history',
  {
    description: '复盘：返回完整手顺与结果（同 spectate）',
    inputSchema: { matchId: z.string() },
  },
  async ({ matchId }) => {
    try {
      requireAuth();
      const data = await api('GET', `/api/stats/matches/${matchId}/history`);
      return textResult(data);
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.registerTool(
  'qame_my_stats',
  {
    description: '我的战绩/今日战报：胜负平、参与场次与近期对局列表。period=today|all',
    inputSchema: {
      period: z.enum(['today', 'all']).optional().describe('默认 today'),
    },
  },
  async ({ period = 'today' }) => {
    try {
      requireAuth();
      const data = await api('GET', `/api/stats/me?period=${period}`);
      return textResult(data);
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.registerTool(
  'qame_leaderboard',
  {
    description: '简易排行榜（按胜场）。可选 gameId 过滤。',
    inputSchema: {
      gameId: z.string().optional(),
      limit: z.number().int().optional(),
    },
  },
  async ({ gameId, limit }) => {
    try {
      requireAuth();
      const q = new URLSearchParams();
      if (gameId) q.set('gameId', gameId);
      if (limit) q.set('limit', String(limit));
      const data = await api('GET', `/api/stats/leaderboard?${q}`);
      return textResult(data);
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.registerResource(
  'match-state',
  new ResourceTemplate('qame://match/{matchId}/state', {
    list: async () => ({
      resources: [...session.seats.keys()].map((matchId) => ({
        uri: stateUri(matchId),
        name: `match ${matchId} state`,
        mimeType: 'application/json',
      })),
    }),
  }),
  {
    description: '已入座对局的选手视角局面。变化后可再 read；等轮到自己请用 qame_watch_state。',
    mimeType: 'application/json',
  },
  async (uri, { matchId }) => {
    const data = await fetchPlayState(matchId);
    return {
      contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(data, null, 2) }],
    };
  }
);

async function main() {
  try {
    const boot = await autoLoginIfConfigured();
    console.error(`[qame-mcp] boot auth: ${boot.mode}${boot.username ? ` (${boot.username})` : ''}`);
  } catch (err) {
    console.error(`[qame-mcp] auto login skipped: ${err.message}`);
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[qame-mcp] listening on stdio');
}

main().catch((err) => {
  console.error('[qame-mcp] fatal', err);
  process.exit(1);
});
