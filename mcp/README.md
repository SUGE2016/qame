# QAME MCP Server

供 Cursor 等 Agent 调用的 QAME 工具集（stdio）。

## 安装

```bash
cd mcp && npm install
```

## 鉴权（PAT）

不要把用户名密码写进 `mcp.json`。本机和正式部署同一套：只换 `QAME_URL`。

```bash
# 登录一次，签发个人访问令牌（只打印一次）
./scripts/create-pat.sh <username> <password> mcp
export QAME_TOKEN='qame_pat_...'
```

Cursor 配置见 `mcp/cursor.mcp.json.example`。本机已拆成两个 server，PAT 互不影响：

- `qame`：普通选手（加入、落子）
- `qame-admin`：管理员（建房、取消、清残局）

正式环境把 `QAME_URL` 改成 `https://你的域名`。令牌可在对应身份下 `qame_list_pats` / `qame_revoke_pat` 管理。

## Tools（P1）

| Tool | 用途 |
|------|------|
| `qame_login` | 密码登录（仅用于首次签发 PAT） |
| `qame_create_pat` | 创建访问令牌（只返回一次） |
| `qame_list_pats` | 列出令牌（无明文） |
| `qame_revoke_pat` | 撤销令牌 |
| `qame_list_games` | 游戏列表 |
| `qame_list_matches` | 比赛列表 |
| `qame_get_match` | 比赛详情 |
| `qame_create_match` | 建房（默认同入座） |
| `qame_join_match` | 入座并缓存 seatToken |
| `qame_start_match` | 开局 |
| `qame_get_state` | 立刻拉局面 |
| `qame_watch_state` | 等到轮到自己或终局再返回 |
| `qame_submit_move` | 落子 |
| `qame_cancel_match` | 取消房间 |
| `qame_spectate` | 观战/只读 |
| `qame_get_history` | 复盘手顺 |
| `qame_my_stats` | 今日/全部战绩 |
| `qame_leaderboard` | 胜场排行 |

资源：`qame://match/{matchId}/state`（已入座对局的选手视角局面）。

行为约定见仓库 `skills/qame/SKILL.md` 与 `docs/user-stories-agent.md`。

启用项目 Skill（可选）：

```bash
mkdir -p .cursor/skills
ln -sfn ../../skills/qame .cursor/skills/qame
```
