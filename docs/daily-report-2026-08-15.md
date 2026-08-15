# QAME 日报 2026-08-15

## 今日完成

### 大海战 sidecar
- 新增 `games/battleship/`（端口 8103，`GAME_BATTLESHIP_URL`）
- 10×10，舰 5/4/3/3/2，开局自动布舰；开火仍是格子下标 0–99（MCP 兼容）
- 雾战：`view_state` 不把对方未击中舰放进公开 `G`；旁观只看弹着
- 大厅 `BattleshipBoard`：己方海域 + 对方雷达；回放终局揭示舰阵

### 对局、大厅与安全
- 对局页左右座位 + 中间棋盘；旁观只读；WS 不通则 HTTP 落子
- 删除规则：`playing` 谁都不能删；`waiting` 创建者或管理员；终局/取消仅管理员
- Host 快照：平台重启后可恢复进行中对局
- 大厅换皮：顶栏身份、游戏横卡、开一间房、座位当桌子
- 授权 / 密码 / CORS / 服务间密钥 / refresh 轮换按本机可试运行补齐

### 管理台
- 与大厅同色板：顶栏 + 左侧导航（总览 / 用户 / 游戏 / 对局 / 审计）
- 总览 `GET /api/admin/overview`；写操作进审计表
- 用户 / 审计 / 对局列表改为**服务端** `page` `limit` `q`（数据涨了不能只靠前端滤）
- 对局页：进行中 / 已结束 / 全部 + 全选可删 / 批量删除

### 不再单独管 AI
- 平台不区分人 / Agent / 脚本，一律主动入座落子
- 去掉管理台「AI」页、`/api/ai`、`maybe_ai_turn` 代打、大厅「添加 AI」
- `ai_clients` 表暂留（不迁库）；自动化标签以后再加

### 回归与数据
- 回归会自建 `前缀_8位hex` 账号；测完删除，整轮结束再扫尾
- 已清库内历史残留，现仅 `admin` + 手建 `agent`
- 最近一次：unit 21 + regression 30 全绿

### 运维备忘
- 重建 `api-server` / `lobby` 后若大厅 502：`docker compose restart nginx`（旧 IP 缓存）
- 宿主代理须 `unset all_proxy`，容器内已配 `NO_PROXY`

## 验证
```bash
docker compose up -d --build postgres game-tic-tac-toe game-gomoku game-battleship api-server lobby admin-console
docker compose restart nginx
./scripts/run-regression.sh
# 大厅 https://localhost/ ；管理台 https://localhost/admin/
```

## 主要提交
| Commit | 说明 |
|--------|------|
| `fa4472e` | 状态机 / 安全 / Host 快照；大海战；大厅与管理台（含服务端分页） |
| `5b829ec` | 去掉独立 AI 管理 |
| `8ff64fc` | 回归结束后清理测试账号 |
| `71a421f` | 本日报初稿 |

## 明日 / 可选
- 接入方自报标签（人 / agent / 脚本），仅展示与筛战绩，不走第二套逻辑
- 推送当前 main（相对 `origin/main` 的本地提交见上表）

## 风险
- 共用 Docker Postgres 时，若回归中途被掐，仍可能留下测试号（下一轮扫尾会清）
- 拆装大海战：停 `game-battleship`、去掉 URL、`games` 行 inactive
