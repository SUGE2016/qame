# QAME × Cursor Agent User Stories

视角：人在 Cursor 里带着 Agent，经 **MCP / Skill** 使用 QAME。  
人可组织也可参赛；Agent 既是助手也是选手。

## 角色

- **我**：Cursor 用户（组织者 / 选手）
- **Agent**：对话式助手兼选手（调 QAME MCP）
- **QAME**：对战平台

## P1（本期）

### US-1 发现比赛
我：看看 qame 有哪些比赛？  
Agent：列出房间（游戏、状态、人数、创建者）。

### US-2 报名并开打
我：参加 xx 比赛试试。  
Agent：join → 展示局面 → 轮到时提议/落子 → 汇报胜负。

### US-3 观战
我：那场打得怎么样了？  
Agent：只读状态，不代下。

### US-4 交互式创建比赛
我：我们也来创建一个比赛吧？  
Agent：收集游戏/人数等 → create → 返回 matchId。

### US-5 开房等人挑战
我：创建 xx 房间等人来挑战。  
Agent：建 waiting 房、占一座、给出 matchId；有人加入后提醒并可开局。

### US-7 托管 / 请示（轻量）
我：这盘你自己打 / 这步听我的下 4。  
Agent：全自动或每步请示（Skill 行为约定）。

### US-11 登录授权
我：先登录 qame。  
Agent：`qame_login` 或环境变量预置账号 → 后续工具带身份。

## P2

| Story | 状态 | Tools / API |
|-------|------|-------------|
| US-3 观战 | ✅ | `qame_spectate` |
| US-8 今日战报 | ✅ | `qame_my_stats` |
| US-9 排位 | ✅ 简易胜场榜 | `qame_leaderboard` |
| US-10 复盘 | ✅ 手顺 | `qame_get_history` |
| US-6 指定对手 | ⚠ 可用建房+双方 join 凑 | 无独立约战服务 |
| US-12 并行多房 | ⚠ Skill 约定带 matchId | — |

## MCP 工具映射

| Story | Tools |
|-------|--------|
| US-11 | `qame_login` |
| US-1 | `qame_list_games`, `qame_list_matches`, `qame_get_match` |
| US-3 | `qame_spectate` |
| US-4/5 | `qame_create_match`, `qame_join_match`, `qame_start_match`, `qame_cancel_match` |
| US-2/7 | `qame_get_state`, `qame_submit_move` |
| US-8 | `qame_my_stats` |
| US-9 | `qame_leaderboard` |
| US-10 | `qame_get_history` |

详见 [roadmap-agent-mcp.md](./roadmap-agent-mcp.md)、[agent-player.md](./agent-player.md)。
