# 待讨论：可扩展 / 可插拔游戏架构

> 状态：**待讨论（部分已拍板，未实施）**  
> 目的：收敛「游戏如何扩展」的设计选项，覆盖  
> 1）**托管在 QAME** 内运行的游戏；  
> 2）**第三方 host**、仅接入 QAME 大厅/匹配/身份/AI 的游戏。  
> 本文不绑定实现排期；结论确定后再改代码与 MCP 契约。

---

## 0. 已拍板方向（2026-08-12）

| 项 | 决议 |
|----|------|
| 平台后端语言 | **Python / FastAPI**（抛弃 Node.js api-server） |
| 选型理由 | 避免 Go/Rust/Java 等编译链；迭代与 Agent 生态友好 |
| 游戏形态 | **每个游戏 = 独立后端服务 + 独立 Docker 容器**（非进程内插件包） |
| 默认托管 | 第一批：`games/tic-tac-toe`、`games/gomoku`；协议预留第三方 Host |
| 实施状态 | **主路径已落地**（`platform/` + `games/*` + compose）；Node `api-server` / `ai-manager` / `@qame/games` 已删除 |

**目标拓扑（草案）**

```
nginx
  → qame-platform (Python)：账号 / 房间 / 统计 / /api/play BFF / 未来 MCP 适配
       ├─ HTTP → game-tic-tac-toe (Python, container)
       ├─ HTTP → game-gomoku (Python, container)
       └─ HTTP → (可选) 第三方 Host
postgres
```

**与现状关系**：选手面（`/api/play`、MCP tools）由 Python 平台提供；棋规在各游戏容器内，不再使用进程内 `@qame/games`。

**仍待拍板**（见 §10）：`/api/play` 是否始终 BFF；游戏容器是否自管 WS；AI `/move` 由平台转还是游戏服务转。

---

## 1. 问题陈述

当前（重构后）规则核是进程内纯函数（`@qame/games`：`tic-tac-toe` / `gomoku`），MatchRuntime 直接 `applyMove`。这足够做演示，但无法满足：

- 不断加新游戏而不发版核心  
- 复杂游戏（长状态、私有信息、实时动作）不适合塞进同一 Node 进程  
- 外部团队自研游戏，只想挂上 QAME 的账号、房间、排行、Agent/MCP 入口  

需要一种 **Game Plugin** 模型：大厅与对局编排稳定，棋规与实时循环可替换。

---

## 2. 目标与非目标

### 目标

| ID | 目标 |
|----|------|
| G1 | 新增游戏尽量「注册 + 镜像/URL」，少改 api-server 核心 |
| G2 | 支持 **内置托管**（QAME 跑规则）与 **外置 Host**（第三方跑规则） |
| G3 | 人 / Agent（MCP、CLI、`/api/play`、回调 `/move`）对「加入/落子/查状态」体验一致 |
| G4 | 插件故障隔离：一个坏游戏不拖垮整个 API |
| G5 | 版本可协商：游戏协议 semver，不兼容时明确拒绝开局 |

### 非目标（本期讨论可排除）

- 不做通用游戏引擎（Unity/Godot 替代品）  
- 不做跨链/去中心化结算  
- 不要求第三方必须开源规则实现  

---

## 3. 角色拆分（建议）

```
┌─────────────────────────────────────────────────────┐
│  QAME Platform（稳定面）                              │
│  - 账号 / JWT / seatToken                             │
│  - 大厅：创建房间、入座、开始、列表、统计（未来）      │
│  - Agent：MCP / CLI /play                             │
│  - 游戏注册表：gameId → 驱动类型 + 配置               │
└───────────────┬─────────────────────┬───────────────┘
                │                     │
       ┌────────▼────────┐   ┌────────▼────────────┐
       │ Built-in Driver │   │ Remote Host Driver  │
       │ 进程内规则核    │   │ 第三方 Game Host    │
       │ MatchRuntime    │   │ HTTP/WS 适配        │
       └─────────────────┘   └─────────────────────┘
```

- **Platform**：不管具体棋规，只管「谁在哪一桌、是否开打、凭证、对外 API」。  
- **Game Driver**：执行 `create / applyMove / legalMoves / checkEnd` 或与之等价的远程协议。  
- **Game Host（第三方）**：完整运行某一游戏的权威状态；Platform 只做编排与鉴权代理。

---

## 4. 两种插件形态

### 4.A 托管型（In-process / Sidecar，跑在 QAME 侧）

| 子类型 | 说明 | 适用 |
|--------|------|------|
| A1 内置包 | 现有 `@qame/games` 纯函数 | 井字棋、五子棋等轻规则 |
| A2 本地插件包 | 独立 npm/目录，实现同一 `GameModule` 接口，启动时扫描注册 | 社区贡献、热插拔（仍同机） |
| A3 Sidecar 进程 | 每游戏一容器，Platform 经 localhost HTTP 调规则 | 隔离更好、可用其他语言 |

**统一模块接口（草案）**

```ts
interface GameModule {
  id: string;                 // tic-tac-toe
  name: string;
  version: string;            // semver
  minPlayers: number;
  maxPlayers: number;
  createState(opts): G;
  legalMoves(G, playerId): Move[];
  applyMove(G, playerId, move): { G } | { error };
  checkEnd(G): null | { winner } | { draw: true };
  // 可选：sanitizeState(G, viewerSeat) 处理不完全信息
}
```

Platform 的 MatchRuntime 只依赖该接口，不依赖具体游戏。

### 4.B 外置 Host 型（第三方权威）

第三方提供 **Game Host**，实现「对局权威」；QAME 提供房间与身份。

**推荐职责**

| 职责 | QAME Platform | Third-party Host |
|------|---------------|------------------|
| 登录 / 座位 / seatToken | ✅ | 信任 Platform 签发的 token 或换票 |
| 创建逻辑房间、列表展示 | ✅ | 注册元数据（名称、图标、人数） |
| 棋盘权威状态、合法手 | ❌ | ✅ |
| 向 Browser/Agent 推状态 | 可代理 WS，或直连 Host | ✅ 至少一种 |
| AI `/move` 回调 | Platform 可代转，或 Host 直调 | 双方约定 |
| 计分 / 战报入库 | ✅（Host 回报结果） | 上报 `match.finished` |

**外置接入协议（草案，待拍板）**

```http
# Platform → Host：开局
POST {host}/v1/matches
Authorization: Bearer <platform-service-token>
{ "platformMatchId", "gameId", "players": [{ "seat","name","seatTokenHash?" }], "config" }
→ { "hostMatchId", "wsUrl?" }

# Platform → Host：代转落子（若走平台代理）
POST {host}/v1/matches/{id}/moves
{ "seat", "move", "seatToken" 或 platform 已验签证明 }

# Host → Platform：结束回调
POST {platform}/api/hooks/game-finished
{ "platformMatchId", "result", "replayUrl?" }
```

选手侧仍可对用户暴露 **同一套** `/api/play` 与 MCP tools；Platform 做 BFF，把请求转到 Host。

---

## 5. 游戏注册表（Catalog）

无论 A/B，都先在 Platform 注册：

```json
{
  "id": "gomoku",
  "name": "五子棋",
  "version": "1.2.0",
  "driver": "builtin" | "sidecar" | "remote",
  "driverConfig": {
    "module": "@qame/games/gomoku",
    "baseUrl": "https://games.example.com/gomoku",
    "capabilities": ["perfect-info", "sync-turn", "agent-play"]
  },
  "minPlayers": 2,
  "maxPlayers": 2,
  "ui": {
    "board": "builtin:gomoku" | "iframe:https://..." | "agent-text-only"
  },
  "status": "active"
}
```

**待讨论**：注册存 DB 表 vs 配置文件 vs 两者（DB 运营、文件开发）。

---

## 6. 对 Agent / MCP 的影响（保持稳定面）

理想状态：Agent **不感知**游戏跑在哪：

| Tool | 行为 |
|------|------|
| `qame_list_games` | 读注册表（含 remote） |
| `qame_create_match` / `join` / `start` | Platform 编排；remote 则同时在 Host 建局 |
| `qame_get_state` / `submit_move` | Platform `/api/play`；内部按 driver 转发 |

**待讨论**：不完全信息游戏如何给 Agent `legalMoves`（Host 按 seat 过滤后返回）。

---

## 7. UI 可插拔（次要但相关）

| 方式 | 说明 |
|------|------|
| 内置 React Board | 现 lobby 棋盘组件，按 gameId 映射 |
| iframe / 微前端 | 第三方提供 UI，Platform 传 `matchId+token` |
| Agent 纯文本 | 无专用 UI，MCP Skill 画 ASCII（已有） |

建议：**规则权威与 UI 分离**；remote 游戏可只接入 Agent + 简易观战页。

---

## 8. 安全与信任

| 议题 | 方向（待定） |
|------|----------------|
| Host 冒充结束结果 | Platform 服务间 mTLS / 共享 HMAC；结果验签 |
| seatToken 泄露 | 短时 token、绑定 matchId+seat、HTTPS only |
| 恶意插件（A2/A3） | 能力清单、资源限额、默认不热加载任意代码 |
| 隐私 | `sanitizeState` 强制；观战座位无隐藏信息 |

---

## 9. 演进路线（讨论用，非承诺）

| 阶段 | 内容 |
|------|------|
| Now | 仅 A1 builtin（现状） |
| P-ext-1 | 固化 `GameModule` 接口；注册表 DB；新游戏只加包不改 Runtime |
| P-ext-2 | Sidecar driver（A3）；一个非 JS 示例游戏 |
| P-ext-3 | Remote Host 协议 v1 + 一个外部 demo；`/api/play` BFF 转发 |
| P-ext-4 | iframe UI、战报/回放钩子 |

---

## 10. 开放问题（请拍板）

1. ~~语言与形态~~ → **已定：Python 平台 + 每游戏一 Docker 服务**（见 §0）。  
2. **权威位置**：游戏进行中 WS 是否只走 Platform BFF，还是允许浏览器/Agent 直连游戏容器？  
3. **AI 回调**：`/move` 由 Platform 转还是游戏服务直调 Agent endpoint？  
4. **版本策略**：`gameId` 不变、version 升级是否允许同房混版？  
5. **配置真相源**：游戏服务 URL 注册表用 DB 还是 compose 环境变量？  
6. **Python 框架**：平台侧 FastAPI vs Django；游戏侧是否统一 FastAPI 小服务模板？  
7. **迁移策略**：先双写/旁路一个 Python game 容器，还是一次性替换 Node api-server？  

---

## 11. 与现有文档关系

| 文档 | 关系 |
|------|------|
| [architecture.md](./architecture.md) | 现状；插件化后需改「规则核仅内置」表述 |
| [agent-player.md](./agent-player.md) | 选手面应保持；driver 对 Agent 透明 |
| [roadmap-agent-mcp.md](./roadmap-agent-mcp.md) | MCP tools 稳定；扩展游戏不新增办赛工具为佳 |
| [refactor-drop-boardgame.md](./refactor-drop-boardgame.md) | 已抛弃 bgio；插件化是其后的扩展层 |

---

## 12. 建议讨论结论模板（会后填写）

- [x] 平台语言：**Python / FastAPI**；游戏：**独立 Docker 服务**  
- [x] `/api/play`：**始终经 Platform BFF**（WS 亦挂平台）  
- [x] 游戏 URL：compose 环境变量（`GAME_TTT_URL` / `GAME_GOMOKU_URL`）  
- [x] AI `/move`：**Platform 转发**（座位有 endpoint 时）  
- [x] 框架：**FastAPI**  
- [x] 试点：`games/tic-tac-toe` + `games/gomoku` 已落地  
- [x] 迁移：compose 中 `api-server` 构建 `platform/`；Node 后端目录已删除
