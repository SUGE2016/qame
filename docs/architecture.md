# QAME 系统架构说明

> 多人在线棋类对战平台（boardgame.io），支持 Human / AI 对战。  
> 本文档供部署、联调与 DiOS 测试对接参考。

## 1. 系统概览

QAME 将「业务 API」「棋盘实时对局」「AI 接入」拆成独立服务，通过 Nginx 同源反代对外暴露。

| 层级 | 组件 | 职责 |
|------|------|------|
| 接入层 | Nginx | HTTPS、路径路由、WebSocket 透传 |
| 前端 | lobby / admin-console | 大厅对战 UI、管理控制台 |
| 业务 | api-server | 认证、对局编排、AI 客户端注册 |
| 对局 | game-server | boardgame.io 权威状态与实时同步 |
| AI 编排 | ai-manager | 监听对局开始，维持 AI 作为 boardgame.io Client |
| AI 决策 | llm-ai-service | 标准 `POST /move` 决策服务 |
| 数据 | PostgreSQL / Redis | 业务数据、会话/缓存 |

## 2. 服务拓扑

```
                    ┌─────────────┐
                    │   Browser   │
                    └──────┬──────┘
                           │ HTTPS :443
                           ▼
                    ┌─────────────┐
                    │    Nginx    │
                    └──────┬──────┘
           ┌───────────────┼───────────────┬────────────────┐
           ▼               ▼               ▼                ▼
      / → lobby     /admin → admin    /api → api      /games + /socket.io
      :3000         :3001            :8001         → game-server :8000
                           │
                           │ 业务写库 / NOTIFY
                           ▼
                      PostgreSQL
                           │ LISTEN match_status_changes
                           ▼
                      ai-manager :3002
                           │ boardgame.io Client (Socket.IO)
                           │ + HTTP POST /move
                           ▼
                    llm-ai-service :3003
```

Docker Compose 网络名：`qame-network`。服务间用容器名访问（如 `http://api-server:8001`）。

## 3. 服务清单

| 服务 | 镜像/目录 | 容器端口 | 健康检查 | 说明 |
|------|-----------|----------|----------|------|
| nginx | `nginx/ssl.conf` | 80/443 | — | 唯一对外入口 |
| lobby | `lobby/` | 3000 | `wget :3000` | 游戏大厅（React） |
| admin-console | `admin-console/` | 3001 | `wget :3001` | 管理后台（React） |
| api-server | `api-server/` | 8001 | `GET /health` | Express + PostgreSQL |
| game-server | `server/` | 8000 | `GET /games` | boardgame.io Server |
| ai-manager | `ai-manager/` | 3002 | `GET /healthz` | AI 会话连接管理 |
| llm-ai-service | `llm-ai-service/` | 3003 | `GET /health` | LLM 决策参考实现 |
| postgres | postgres:15-alpine | 5432 | `pg_isready` | 业务库 `boardgame_db` |
| redis | redis:7-alpine | 6379 | `redis-cli ping` | 会话/缓存 |

Compose 中另有 `llm-ai-service2`（同镜像，不同 `LLM_MODEL`），用于多模型对照。

## 4. Nginx 路由

配置：`nginx/ssl.conf`。

| 路径 | 上游 | 备注 |
|------|------|------|
| `/socket.io/` | game-server:8000 | WebSocket，须优先匹配 |
| `/api/` | api-server:8001 | REST API |
| `/ai-manager/` | ai-manager:3002/ | AI 管理（若启用 UI） |
| `/games/` | game-server:8000/ | 去前缀反代 |
| `/admin/api/`、`/admin/` | admin-console:3001 | 管理端 |
| `/` | lobby:3000 | 默认大厅 |
| `:80` | — | 301 → HTTPS |

前端宜走同源相对路径，经 Nginx 统一反代，避免跨域与混合内容问题。

## 5. 目录结构

```
qame/
├── lobby/                 # 大厅前端
├── admin-console/         # 管理控制台
├── server/                # game-server（boardgame.io）
├── api-server/            # 业务 API
│   ├── routes/            # auth / matches / games / ai / admin / players
│   ├── models/            # User / Match / MatchPlayer / AIClient / ...
│   └── migrations/
├── ai-manager/            # AI 连接编排
│   └── src/
│       ├── AIPlayerSessionManager.js
│       ├── AIPlayerConnection.js
│       └── PostgreSQLListener.js
├── llm-ai-service/        # 外部 AI 参考实现（POST /move）
├── packages/
│   ├── qame-games/        # 共享游戏逻辑（TicTacToe / Gomoku）
│   ├── shared-ui/
│   └── shared-utils/
├── nginx/
├── docker-compose.yml
└── docs/architecture.md   # 本文档
```

## 6. 共享游戏包

`packages/qame-games` 被 **lobby（UI）**、**game-server（权威逻辑）**、**ai-manager（Client 侧 game 定义）** 共用，保证三端规则一致。

当前内置：

- `tic-tac-toe` — 井字棋
- `gomoku` — 五子棋

注册表见 `packages/qame-games/src/index.js`（`GAMES_REGISTRY` / `getGame`）。

## 7. 核心数据流

### 7.1 人类玩家对局

1. 用户在 lobby 登录 → `api-server` `/api/auth`（JWT / Cookie）。
2. 创建/加入对局 → `/api/matches`；api-server 调用 game-server 创建 boardgame.io match，并保存 `playerCredentials`。
3. 大厅以 boardgame.io Client + Socket.IO 连接 game-server（经 `/socket.io/`、`/games/`）。
4. 落子由 game-server 校验并广播；api-server 维护业务侧 match / 座位状态。

### 7.2 AI 入座与行动

1. 管理端或 API 注册 **AI Client**（`ai_clients`：endpoint、支持游戏等）。
2. 对局中加入 AI 座位：api-server 写入 `match_players` / 关联 `ai_clients`，并与 human 一样保存 credentials。
3. match 状态变为 `playing` 时，PostgreSQL `NOTIFY match_status_changes`。
4. **ai-manager** `LISTEN` 到通知（启动时也会扫描已有 `playing` match）：
   - 为每个 AI 座位创建 `AIPlayerConnection`；
   - 使用 boardgame.io Client 连上 game-server；
   - 轮到该座位时 `POST {aiClientEndpoint}/move`，拿到 `move` 后 `makeMove`。
5. **llm-ai-service** 实现标准决策接口，供外部 AI 对照扩展。

### 7.3 AI `/move` 约定（当前实现）

请求（ai-manager → AI 服务）：

```json
{
  "game_id": "tic-tac-toe",
  "match_id": "<bgio-or-business-match-id>",
  "player_id": "0",
  "G": {},
  "ctx": {},
  "metadata": { "turn": 1, "current_bgio_player_id": "0" }
}
```

响应：

```json
{ "move": 4 }
```

健康检查：`GET /health`。超时等由调用方控制（ai-manager 请求侧约 10s）。

## 8. API 面（api-server）

前缀均经 Nginx：`/api/...`。

| 前缀 | 用途 |
|------|------|
| `/api/auth` | 登录注册、会话 |
| `/api/matches` | 对局 CRUD、加入/离开、状态 |
| `/api/games` | 游戏元数据 |
| `/api/ai` | AI Client 管理 |
| `/api/players` | 玩家统一查询 |
| `/api/admin` | 管理接口 |
| `/health`、`/api/health` | 健康检查 |

内部服务调用可使用 `x-internal-service-key`（与 `INTERNAL_SERVICE_KEY` 一致），例如 ai-manager 扫描 playing matches。

## 9. 部署与环境

### 启动

```bash
docker-compose up --build
```

### 关键环境变量（Compose / `.env`）

| 变量 | 用途 |
|------|------|
| `DB_PASSWORD` | PostgreSQL |
| `JWT_SECRET` / `JWT_EXPIRES_IN` | 认证 |
| `PASSWORD_SALT` | 密码哈希盐（前后端一致） |
| `INTERNAL_SERVICE_KEY` | 服务间调用 |
| `ADMIN_PASSWORD` | 初始管理员 |
| `AI_SERVICE_TIMEOUT` | game-server 侧 AI 相关超时（可选） |

LLM 服务另用 `.llm-ai-service.env`（见 `llm-ai-service/env.template`）。

### 默认访问（经 Nginx）

- 大厅：`https://<host>/`
- 管理台：`https://<host>/admin/`
- API：`https://<host>/api/`
- 默认管理员：`admin` / `admin123`（以实际 `ADMIN_PASSWORD` 为准）

Compose 中前端 build args 含内网示例地址 `192.168.1.156`，联调/DiOS 环境需按实际主机改写。

## 10. DiOS 测试关注点

1. **整栈 Compose 可起**：依赖健康检查顺序（postgres/redis → api/game → ai-manager → lobby/admin → nginx）。
2. **同源反代**：浏览器只打 Nginx；Socket.IO 必须走 `/socket.io/`。
3. **AI 闭环**：注册 AI Client endpoint → 开局入座 AI → match=`playing` → ai-manager 连上并完成至少一手 `/move`。
4. **规则一致性**：改棋规只改 `packages/qame-games`，三端重建镜像。
5. **密钥**：测试环境需提供 `.env` / `.llm-ai-service.env`，勿提交真实密钥。

## 11. 已知边界

- game-server 为纯 boardgame.io，业务编排集中在 api-server。
- ai-manager 靠 PG NOTIFY + 启动扫描驱动，不依赖轮询游戏状态。
- llm-ai-service 是参考实现；生产可替换任意实现同一 `/move` 的服务。
- README 中部分本地直连端口说明与「仅暴露 Nginx」的 Compose 模式可能不一致，以 `docker-compose.yml` + `nginx/ssl.conf` 为准。
