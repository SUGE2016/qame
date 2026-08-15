---
name: qame
description: >-
  Play and organize board games on the QAME platform via MCP tools (list/join/create
  matches, submit moves). Use when the user mentions QAME, 比赛, 井字棋, 五子棋,
  tic-tac-toe, gomoku, or wants to create/join/play a match.
---

# QAME Agent Skill

你通过 **qame MCP** 访问对战平台。人可以让你查赛、建房、参赛、代打。

## 登录

- 优先配置 `QAME_TOKEN`（个人访问令牌），不要把密码写进 MCP 配置。
- 本机可挂两个 MCP：`qame` 选手、`qame-admin` 管理，各用各的 PAT。
- 没有 token 时：`qame_login` → `qame_create_pat`，把返回的 token 交给用户写入环境变量。

## 典型对话流

### 看看有哪些比赛
1. `qame_list_matches`（可加 `status=waiting`）
2. 用简洁表格列出：id 短码、游戏、人数、状态、创建者

### 参加某场比赛
1. `qame_join_match`（记下 seatIndex）
2. 若仍是 waiting：提示房主开始，或若用户是房主则问是否 `qame_start_match`
3. 循环：`qame_watch_state`（等到 `yourTurn` / 终局 / `reason=timeout`）
   - `yourTurn=true`：展示棋盘 + `legalMoves`，**先问用户要不要这步**，除非用户说「你自己打」
   - 用户指定或同意后 `qame_submit_move`，再 `qame_watch_state`
   - `reason=timeout`：告诉用户还在等对方，可再 watch
4. 出现 `result` 后用中文宣布胜负

### 创建比赛 / 开房等人
1. 确认 `gameId`：`tic-tac-toe` 或 `gomoku`（可用 `qame_list_games`）
2. `qame_create_match`（默认 `joinSelf=true`）
3. 把 `matchId` 发给用户，便于他人加入
4. 有人入座且用户要求开始 → `qame_start_match` → 按「参加」流程对打

### 观战 / 复盘
1. `qame_spectate` 或 `qame_get_history`
2. 用文字回放手顺；评价坏棋时结合规则（占线、双三等），勿假装有强引擎

### 今日战报 / 排位
1. `qame_my_stats`（`period=today` 或 `all`）
2. `qame_leaderboard`（可选 `gameId`）
3. 用简短中文汇报胜/负/平与场次

## 棋盘展示（文字）

井字棋 3×3：用 `G.cells`（`'0'`/`'1'`/`null`）画成：

```
 X | O |  
-----------
   | X |  
-----------
   |   | O
```

五子棋可摘要：`lastMove` + 双方子数，避免刷屏；用户要细节再展开。

## 规则

- 未登录不要瞎调写接口。
- 不要伪造 matchId / seatToken。
- 非法手把错误原样告诉用户并重试。
- 同时多局时始终带 `matchId`，避免串房。
