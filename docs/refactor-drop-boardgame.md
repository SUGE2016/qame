# 重构方案：抛弃 boardgame.io（方案 1）

> 状态：**已实施（主路径 + Step 4 选手面）**  
> 目标：用自研迷你对局核 + WebSocket 替代 boardgame.io，大幅简化架构。  
> 说明：`ai-manager/` 目录仍保留在仓库中但已移出 Compose，可后续删除。

## 1. 背景与结论

当前复杂度主要来自 **boardgame.io 双轨状态**：

- 业务库（api-server + Postgres）一套对局元数据
- boardgame.io Server 一套权威棋盘状态 + `playerCredentials` + Socket.IO Client

再叠加独立的 `game-server`、`ai-manager`（伪装成 bgio Client），服务数膨胀到约 10 个。

棋规本身（井字棋 / 五子棋）很简单，不需要该框架。

**决策：采用方案 1 — 自研迷你对局核。**

## 2. 目标形态

```
浏览器 ──WebSocket──► 一个 Node 进程（Express）
                         ├ REST：登录 / 开房 / 入座
                         ├ WS：同步棋盘 + 落子
                         ├ 内存 Runtime：对局状态
                         └ AI：轮到 AI 时 POST /move 后写回状态机
       ▲
nginx ─┴─ 静态前端（lobby；admin 暂可保留）
postgres（业务数据；进行中对局先以内存为准）
```

### 删除 / 停用

| 组件 | 处理 |
|------|------|
| `server/`（game-server） | 删除或废弃 |
| `ai-manager/` | 逻辑收回 api-server，compose 移除 |
| boardgame.io 依赖 | lobby / server / ai-manager / qame-games / admin 中移除 |
| `bgio_match_id`、`player_credentials` | 停止读写（列可后清） |
| Redis | 本就不使用，收尾时删除 |
| Nginx `/games/`、`/socket.io/` | 改为 WS 反代到 app |

### 保留

| 组件 | 原因 |
|------|------|
| `api-server` | 业务中心，承载 Runtime + WS + AI 调度 |
| `lobby` | 大厅 + 棋盘 UI（去掉 bgio Client） |
| `llm-ai-service` | 外部 AI 参考实现，`POST /move` |
| `packages/qame-games` | 改为纯函数规则核（不再依赖 bgio） |
| Postgres | 用户 / 对局元数据 / AI Client 注册 |
| Nginx | 同源入口（HTTPS + WS 升级） |

可选后续：admin-console 并入 lobby；llm-ai-service 用 compose profile 外置。

## 3. WebSocket 协议草图

```text
→ { "type": "join", "matchId": "...", "token": "..." }
← { "type": "state", "matchId": "...", "G": {}, "turn": "0", "players": [], "status": "playing" }

→ { "type": "move", "matchId": "...", "move": 4 }
← { "type": "state", ... }  |  { "type": "error", "message": "..." }

← { "type": "end", "matchId": "...", "result": { "winner": "0" } | { "draw": true } }
```

约定：

- 鉴权：连接或 `join` 时带 JWT（与现有 Cookie/Token 对齐）
- `move` 的语义由规则核解释（井字棋为格子下标；五子棋可为 `{x,y}` 或线性下标，实现时统一）
- 服务端校验：身份、是否轮到、是否合法、防重复

## 4. 规则核 API（`packages/qame-games`）

纯函数，无框架依赖：

```js
createState(gameId, options) -> G
legalMoves(gameId, G, playerId) -> Move[]
applyMove(gameId, G, playerId, move) -> { G, error? }
checkEnd(gameId, G) -> null | { winner } | { draw: true }
```

内置游戏：`tic-tac-toe`、`gomoku`（从现有逻辑迁移，去掉 `INVALID_MOVE` / `ctx` / `onEnd` 的 bgio 形态）。

## 5. 实施步骤

### Step 1 — 规则核 + MatchRuntime（后端）

| 文件 | 动作 |
|------|------|
| `packages/qame-games/` | 重写为纯函数规则核 |
| `api-server/runtime/MatchRuntime.js` | 新建：内存房间、落子、广播、结束写库 |
| `api-server/ws.js`（或挂入 `server.js`） | 新建：`join` / `move` / `state` / `end` |
| `api-server/routes/matches.js` | 去掉对 game-server 的 create/join/leave/credentials；开房/入座只写业务库 + Runtime |
| `api-server/models/*` | 停止依赖 `bgio_match_id`、`player_credentials` |

### Step 2 — AI 收回 app

| 文件 | 动作 |
|------|------|
| `api-server/runtime/AiTurn.js` | 新建：轮到 AI → `POST {endpoint}/move` → `applyMove` → 广播 |
| `ai-manager/` | compose 移除；目录后续删除 |
| `llm-ai-service` | 保留；请求体尽量兼容现有 `/move` |

### Step 3 — 前端 + 收尾

| 文件 | 动作 |
|------|------|
| `lobby/src/components/GameView.js` | 去掉 `Client` / `SocketIO` / credentials；改 WS + 现有 Board |
| `lobby/package.json` 等 | 移除 `boardgame.io` |
| `admin-console/.../GameDatabaseManagement.js` | 去掉 `LobbyClient` |
| `docker-compose.yml`、`nginx/ssl.conf` | 去掉 game-server、ai-manager；WS 反代到 api-server |
| `server/` | 删除 |
| `docs/architecture.md` | 同步新架构 |

### Step 4 — 主动选手面（Agent 参赛）

人组织比赛；Agent 用 seatToken 主动拉局面 / 交手。

| 文件 | 动作 |
|------|------|
| `api-server/routes/play.js` | `GET /api/play/:id`、`POST /api/play/:id/move` |
| `api-server/routes/matches.js` | 入座时签发 `seatToken` |
| `api-server/runtime/AiTurn.js` | 无 endpoint 时等待主动选手（不报错） |
| `cli/qame.js` | 极简 CLI：`state` / `move` / `play` |
| `docs/agent-player.md` | 接入说明 |

回调型 AI（有 endpoint）仍可用；与主动选手可并存。

## 6. 取舍

| 项 | 选择 | 说明 |
|----|------|------|
| 进行中对局存储 | 先内存 | 进程重启会丢对局；持久化第二期再做 |
| 实时通道 | WebSocket | 相对 HTTP 轮询体验更好，仍远轻于 bgio |
| 游戏范围 | 井字棋 + 五子棋一并迁移 | 规则核一次到位 |
| admin | 本次不合并进 lobby | 只拆除 bgio 依赖 |
| Redis | 删除 | 代码从未使用 |

## 7. 验收标准

1. 两人（或一人 + AI）能完整下完一局井字棋  
2. AI 至少一手走通（可用 mock `/move`）  
3. Compose 不再启动 `game-server`、`ai-manager`  
4. 运行时依赖中无 `boardgame.io`  
5. 架构文档与 compose 一致  

## 8. 明确不做（本阶段）

- 不上 Colyseus / Nakama 等新平台  
- 不「半弃 bgio」（只删 Client 留 Server）  
- 不做 K8s / 消息队列  
- 不强制合并 lobby 与 admin（可另开任务）  

## 9. 相关文档

- 现状说明：`docs/architecture.md`（实施后需改写）  
- 外部 AI 参考：`llm-ai-service/README.md`
