# QAME 日报 2026-08-15

## 今日完成

### 鉴权与 MCP
- 个人访问令牌（PAT）：`POST/GET/DELETE /api/auth/pats`，库只存哈希；脚本 `scripts/create-pat.sh`
- 本机两个 MCP：`qame`（选手）/ `qame-admin`（管理），各用各的 PAT；示例 `mcp/cursor.mcp.json.example`
- MCP 只保留参赛必需工具，不做批量删局等治理

### 对局状态机与安全
- 状态：`waiting` → `playing`/`cancelled`；`playing` → `finished`/`cancelled`
- 开局须人数 ≥ min；空 waiting / playing 人数不足 → 自动 cancel；删用户先关未结束房间
- 「单人 playing 残局」根因：回归 teardown 删用户，`match_players` CASCADE 掉对手，`creator_id` 原无 SET NULL
- 删除：`playing` 不能删；`waiting` 创建者或管理员；终局/取消仅管理员
- P0：踢人 / AI 写接口 / 改 player 按角色
- P1：argon2id、Host `X-Internal-Key`、CORS 收紧、生产拒默认密钥、落子须 `playing`
- A+B：写接口 Pydantic、lifespan、迁移版本表、refresh 轮换、JSON 请求日志、`games.host_url`、对局快照启动恢复
- 评审五项（安全/质量/规范/可扩展/技术栈）均到中上

### 大厅与对局 UI
- 大厅换皮：顶栏身份、游戏横卡、开一间房、座位当桌子
- 对局页：左右座位 + 中间棋盘；旁观只读；WS 不通则 HTTP 落子
- 回放：按手顺重铺，自动播放（棋种不同步进）
- 批量删除脏局走管理权限，不在大厅做「选中脏局」

### 管理台
- 与大厅同色板：顶栏 + 左侧导航（总览 / 用户 / 游戏 / 对局 / 审计）
- 总览 `GET /api/admin/overview`；写操作进审计表
- 用户 / 审计 / 对局列表服务端 `page` `limit` `q`

### 大海战 sidecar
- 新增 `games/battleship/`（8103）；雾战；大厅己方海域 + 对方雷达
- **命中连射**：`apply_move` 返回 `extraTurn`，Host 仅在打空时换边（井字/五子不变）

### 不再单独管 AI
- 平台不区分人 / Agent / 脚本，一律主动入座落子
- 去掉管理台「AI」页、代打循环、大厅「添加 AI」

### 宣传片（未成片）
- 规格与上片相同：单 mp4、中/英双音轨、烧录双语字幕
- 目录 `docs/demo-video-0815/`：一镜一 clip，验收后再合并
- 主轴为真厅录屏（`agent_a` vs `agent_b` 大海战，命中连射）；S0/S2/S7 为短合成卡
- 成片 mux 交给 Codex；大文件在 `capture/`（gitignore）

### 回归
- 测完删测试账号；最近一次 unit + regression 全绿（以 `./scripts/run-regression.sh` 为准）

## 参与对话

| 对话 | 当日主线 |
|------|----------|
| [独立评审](eb592c11-238d-4df9-9676-1c00506f520e) | 代码评审、P0/P1、A+B、Host 快照、宣传片分镜与真厅录屏、大海战连射 |
| [PAT 与状态机](53fbd21e-e55c-4b1c-8b1b-394e7105dad5) | PAT / 双 MCP、选手对打、单人残局分析、状态机、管理台能力与分页 |
| [大厅回放与对局 UI](8a39da65-54e5-4ab6-9d64-761b40ef5627) | 批量删局 API、回放自动播、旁观、大厅/对局换皮、管理台治理入口 |

## 验证
```bash
docker compose up -d --build postgres game-tic-tac-toe game-gomoku game-battleship api-server lobby admin-console
docker compose restart nginx
unset http_proxy https_proxy HTTP_PROXY HTTPS_PROXY all_proxy ALL_PROXY
./scripts/run-regression.sh
# 大厅 https://localhost/ ；管理台 https://localhost/admin/
```

## 主要提交
| Commit | 说明 |
|--------|------|
| `fa4472e` | 状态机 / 安全 / Host 快照；大海战；大厅与管理台 |
| `5b829ec` | 去掉独立 AI 管理 |
| `8ff64fc` | 回归结束后清理测试账号 |
| `71a421f` / `e2503d7` / `688df99` | 本日报 |

## 明日 / 可选
- Codex 合并宣传片 clip 成双音轨成片
- 接入方自报标签（人 / agent / 脚本），仅展示与筛战绩

## 风险
- 共用 Docker Postgres 时，回归中途被掐可能留下测试号
- 重建 lobby/api 后大厅 502：`docker compose restart nginx`
- 多 agent 同 worktree 曾撞迁移编号与文件，后续尽量分分支
- 大海战 Host 内存对局，重建 `game-battleship` 会丢掉进行中房间
