# QAME 系统架构说明

> **当前架构**：平台 FastAPI + 每游戏独立 Docker 服务；已抛弃 boardgame.io 与 Node 后端。  
> 可插拔讨论：[discuss-pluggable-games.md](./discuss-pluggable-games.md)

## 1. 拓扑

```
Browser ──HTTPS──► nginx
                     ├─ /        → lobby
                     ├─ /admin/  → admin-console
                     ├─ /api/    → platform (Python) :8001
                     └─ /ws      → platform

platform
  ├─ 账号 / 房间 / 统计 / admin / AI 注册 / /api/play BFF / WS
  ├─ HTTP → game-tic-tac-toe :8101
  └─ HTTP → game-gomoku :8102

postgres
```

Compose 服务名仍为 `api-server`（兼容 nginx），镜像构建自 `platform/`。

## 2. 服务

| 服务 | 目录 | 端口 | 说明 |
|------|------|------|------|
| platform | `platform/` | 8001 | FastAPI 编排 |
| game-tic-tac-toe | `games/tic-tac-toe/` | 8101 | 井字棋权威状态 |
| game-gomoku | `games/gomoku/` | 8102 | 五子棋权威状态 |
| lobby / admin-console | 前端静态 | 3000/3001 | React |
| postgres | — | 5432 | 业务数据 |

可选 profile `ai`：`llm-ai-service`（Node，仅参考 AI `/move`）。

## 3. 游戏 Host 协议

```http
POST /v1/matches          { platform_match_id, players }
GET  /v1/matches/{id}
POST /v1/matches/{id}/moves  { seat, move }
```

平台开局时创建 Host 对局；选手 `/api/play` 与 WS 由平台转发。

## 4. Agent

- MCP：`mcp/`（打平台 `/api/*`，支持 refresh）
- Skill：`skills/qame/`
- 选手：`docs/agent-player.md`

## 5. 启动

```bash
cp .env.example .env   # 按需修改密钥
./scripts/generate-ssl.sh
docker compose up --build
```

- 大厅：`https://localhost/`
- 管理台：`https://localhost/admin/`
- API / MCP：`http://localhost:8001` 或经 nginx 的 `/api/`
