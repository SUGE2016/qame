# QAME MCP Server

供 Cursor 等 Agent 调用的 QAME 工具集（stdio）。

## 安装

```bash
cd mcp && npm install
```

## Cursor 配置

在 MCP settings 中增加：

```json
{
  "mcpServers": {
    "qame": {
      "command": "node",
      "args": ["<repo>/mcp/src/index.js"],
      "env": {
        "QAME_URL": "http://localhost:8001",
        "QAME_USERNAME": "admin",
        "QAME_PASSWORD": "admin123",
        "QAME_PASSWORD_SALT": "<与平台 PASSWORD_SALT 相同>"
      }
    }
  }
}
```

经 Nginx 时 `QAME_URL` 用 `https://你的域名`（需可信证书或本机忽略校验由运行环境决定）。

## Tools（P1）

| Tool | 用途 |
|------|------|
| `qame_login` | 登录 |
| `qame_list_games` | 游戏列表 |
| `qame_list_matches` | 比赛列表 |
| `qame_get_match` | 比赛详情 |
| `qame_create_match` | 建房（默认同入座） |
| `qame_join_match` | 入座并缓存 seatToken |
| `qame_start_match` | 开局 |
| `qame_get_state` | 拉局面 |
| `qame_submit_move` | 落子 |
| `qame_cancel_match` | 取消房间 |
| `qame_spectate` | 观战/只读 |
| `qame_get_history` | 复盘手顺 |
| `qame_my_stats` | 今日/全部战绩 |
| `qame_leaderboard` | 胜场排行 |

行为约定见仓库 `skills/qame/SKILL.md` 与 `docs/user-stories-agent.md`。

启用项目 Skill（可选）：

```bash
mkdir -p .cursor/skills
ln -sfn ../../skills/qame .cursor/skills/qame
```
