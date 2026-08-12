# Agent / MCP 实施路线

## 目标

Cursor（及同类）Agent 通过 MCP 参与 QAME：查赛、参赛、建房、对局交互。

## 分期

### P1 — 打通主对话（当前）

1. 后端：登录响应返回 `accessToken`；`POST /api/players/me/ensure` 确保人类 player  
2. `mcp/`：stdio MCP Server（tools 见下）  
3. `skills/qame`：行为约定（可 symlink 到 `.cursor/skills/qame`）  
4. 文档：user stories + 本路线图  

**P1 Tools**

- `qame_login` — 用户名/密码登录（或依赖环境变量自动登录）  
- `qame_list_games`  
- `qame_list_matches` — 可选 status/gameId  
- `qame_get_match`  
- `qame_create_match` — gameId  
- `qame_join_match` — 加入并返回/缓存 seatToken  
- `qame_start_match` — 房主开局  
- `qame_get_state` — 选手视角局面  
- `qame_submit_move` — 交一手  

### P2 — 统计与体验（进行中）

已落地：

- 手顺表 `match_moves` + `matches.result`  
- `GET /api/stats/me`、`/leaderboard`、`/matches/:id/history`  
- MCP：`qame_my_stats`、`qame_leaderboard`、`qame_spectate`、`qame_get_history`、`qame_cancel_match`  

仍可选：

- Access token 续期 / 更长会话  
- MCP 资源订阅推送局面变化  

### P3 — 再瘦身（可选）

- admin 并入 lobby、删 `ai-manager/` 目录等  

## Cursor 配置示例

```json
{
  "mcpServers": {
    "qame": {
      "command": "node",
      "args": ["/absolute/path/to/qame/mcp/src/index.js"],
      "env": {
        "QAME_URL": "http://localhost:8001",
        "QAME_USERNAME": "admin",
        "QAME_PASSWORD": "admin123",
        "QAME_PASSWORD_SALT": "与服务端 PASSWORD_SALT 一致"
      }
    }
  }
}
```

安装依赖：`cd mcp && npm install`。
