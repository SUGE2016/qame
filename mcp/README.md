# QAME MCP Server

供 Cursor（stdio）和 DiOS 等容器内 Agent（Streamable HTTP）调用的 QAME 工具集。两种入口共用同一组 tools，无故意缺口。

| 入口 | 给谁 | 怎么跑 |
|------|------|--------|
| stdio | 本机 Cursor | `node src/index.js`（现有 `mcp.json`） |
| Streamable HTTP | DiOS / 同网容器 | `node src/http.js` 或 compose 服务 `qame-mcp` |

## 安装

```bash
cd mcp && npm install
```

## 鉴权（PAT）

不要把用户名密码写进 `mcp.json` 或 DiOS 配置。本机和正式部署同一套：只换 `QAME_URL`。

```bash
# 登录一次，签发个人访问令牌（只打印一次）
./scripts/create-pat.sh <username> <password> mcp
export QAME_TOKEN='qame_pat_...'
```

Cursor 配置见 `mcp/cursor.mcp.json.example`。本机已拆成两个 server，PAT 互不影响：

- `qame`：普通选手（加入、落子）
- `qame-admin`：管理员（建房、取消、清残局）

正式环境把 `QAME_URL` 改成 `https://你的域名`。令牌可在对应身份下 `qame_list_pats` / `qame_revoke_pat` 管理。

### HTTP 入口如何带上 PAT

优先级：请求头 `Authorization: Bearer <QAME_TOKEN>`（每个 MCP 会话一份）> 进程环境变量 `QAME_TOKEN`。

DiOS 把 PAT 放在 MCPServer 的 `headers`（或平台密钥注入），**不要**把真实 token 写进仓库。compose 也可用 `.env` 的 `QAME_TOKEN` 作为容器默认身份。

## Streamable HTTP（远程）

```bash
# 本机（平台已在 :8001）
export QAME_URL=http://127.0.0.1:8001
export QAME_TOKEN='qame_pat_...'
npm run start:http
```

| 项 | 值 |
|----|----|
| 本机 | `http://127.0.0.1:8091/mcp` |
| compose 内网（给 DiOS） | `http://qame-mcp:8091/mcp` |
| 健康检查 | `GET /health` → `{"status":"ok","service":"qame-mcp","mcp":{"path":"/mcp"}}` |
| 端口 / 路径 | `8091` / `/mcp`（`PORT` / `MCP_HOST` 可改） |

不经 nginx 对外暴露；DiOS task 容器须与 `qame-mcp` 同一 Docker 网络（`qame-network`）。

### 环境变量

| 变量 | 用途 |
|------|------|
| `QAME_URL` | 平台 API，compose 内用 `http://api-server:8001` |
| `QAME_TOKEN` | 选手 PAT（默认身份；可被请求头覆盖） |
| `QAME_PASSWORD_SALT` / `PASSWORD_SALT` | 仅密码登录签发 PAT 时需要 |
| `QAME_USERNAME` / `QAME_PASSWORD` | 仅首次登录；日常不要用 |
| `PORT` / `MCP_PORT` | HTTP 监听端口，默认 `8091` |
| `MCP_HOST` | 监听地址，默认 `0.0.0.0` |

### DiOS MCPServer 注册

Console / API 字段与 [dios-mcp-git-perf](https://github.com/HQIT/dios-mcp-git-perf) 相同：`transport` 用 `streamable_http`（或 `http`，DiOS 会归一）。

同网（推荐）：

```json
{
  "qame": {
    "transport": "streamable_http",
    "url": "http://qame-mcp:8091/mcp",
    "headers": {
      "Authorization": "Bearer ${QAME_TOKEN}"
    }
  }
}
```

本机调试（Agent 与 MCP 都在宿主）：

```json
{
  "qame": {
    "transport": "streamable_http",
    "url": "http://127.0.0.1:8091/mcp",
    "headers": {
      "Authorization": "Bearer ${QAME_TOKEN}"
    }
  }
}
```

把 `${QAME_TOKEN}` 换成 DiOS 密钥/环境注入，不要提交明文。若 PAT 只配在 `qame-mcp` 容器环境里，可省略 `headers`（所有客户端共用该身份）。

stdio **不要**给 DiOS task 容器用；本机 Cursor 继续用 `cursor.mcp.json.example`。

`qame_watch_state` 最长约 25s，DiOS HTTP 客户端读超时请大于该值。

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

## 本地验收

不依赖平台（只验 HTTP MCP 握手与工具列表）：

```bash
cd mcp && npm install && npm run smoke:http
```

已有 HTTP 进程时：

```bash
# 终端 1
npm run start:http
# 终端 2
curl -s http://127.0.0.1:8091/health
QAME_MCP_URL=http://127.0.0.1:8091 npm run smoke:http
```

compose 起来后：`curl -s http://127.0.0.1:8091/health`，DiOS 用 `http://qame-mcp:8091/mcp`。
