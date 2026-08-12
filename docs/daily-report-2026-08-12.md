# QAME 日报 2026-08-12

## 今日完成

### 架构决策与落地
- **抛弃 boardgame.io**：大厅改 WebSocket；规则改为纯函数 / 游戏服务
- **后端改 Python / FastAPI**；**每游戏独立 Docker 容器**（`games/tic-tac-toe`、`games/gomoku`）
- Compose 服务名仍为 `api-server`，镜像构建自 `platform/`

### Agent / 选手面
- `/api/play` + seatToken；CLI `cli/qame.js`
- MCP P1/P2（`mcp/`）：查赛、建房、入座、落子、统计、观战、排行
- Skill：`skills/qame/SKILL.md`
- 统计：手顺 `match_moves`、战报、简易排行

### 文档
- `architecture.md`、`refactor-drop-boardgame.md`、`discuss-pluggable-games.md`
- `user-stories-agent.md`、`roadmap-agent-mcp.md`、`agent-player.md`

## 验证（当日）
- 游戏容器：health / 建局 / 落子通过
- 整栈 compose：本机拉 postgres 偶发超时（后改用本地 `postgres:16-alpine`）

## 风险（当日）
- Docker Hub / 代理不稳定
- Access Token 60m（次日补 refresh）
