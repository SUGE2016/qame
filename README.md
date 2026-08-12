# QAME - 多人在线游戏平台

Python 平台 + 可插拔游戏容器；支持大厅、AI、以及 Cursor MCP Agent 参赛。

## 架构

- **platform/**：FastAPI（账号、房间、统计、admin、`/api/play`、WebSocket）
- **games/tic-tac-toe**、**games/gomoku**：独立游戏服务（Docker）
- **lobby / admin-console**：React 前端
- **mcp/**：Cursor MCP Server
- **skills/qame**：Agent Skill

详见 [docs/architecture.md](docs/architecture.md)。

## 启动

```bash
cp .env.example .env          # 修改 DB_PASSWORD / JWT_SECRET / PASSWORD_SALT
./scripts/generate-ssl.sh     # 生成本地 HTTPS 证书（nginx/ssl）
docker compose up --build
```

- 大厅：`https://localhost/`
- 管理台：`https://localhost/admin/`
- API：`https://localhost/api/` 或 `http://localhost:8001`
- WS：`wss://localhost/ws`

默认管理员：`admin` /（`ADMIN_PASSWORD`，默认 `admin123`）

## Agent / MCP

见 [mcp/README.md](mcp/README.md)、[docs/user-stories-agent.md](docs/user-stories-agent.md)。

```bash
cd mcp && npm install
# Cursor 配置 QAME_URL=http://localhost:8001
```

## 主动选手 CLI

```bash
node cli/qame.js play <matchId> <seatToken>
```
