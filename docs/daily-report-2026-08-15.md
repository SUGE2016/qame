# QAME 日报 2026-08-15

## 今日完成

### 大海战 sidecar
- 新增 `games/battleship/`（端口 8103，`GAME_BATTLESHIP_URL`）
- 10×10，舰 5/4/3/3/2，开局自动布舰；开火仍是格子下标 0–99（MCP 兼容）
- 雾战：`view_state` 不把对方未击中舰放进公开 `G`；旁观只看弹着
- 大厅 `BattleshipBoard`：己方海域 + 对方雷达；回放终局揭示舰阵

### 对局与大厅
- 对局页左右座位 + 中间棋盘；旁观只读；WS 不通则 HTTP 落子
- 删除规则：`playing` 谁都不能删；`waiting` 创建者或管理员；终局/取消仅管理员
- 管理台「对局留存」：筛选、全选、批量/单删
- Host 快照：平台重启后可恢复进行中对局

### 不再单独管 AI
- 平台不区分人 / Agent / 脚本，一律主动入座落子
- 去掉管理台「AI」页、`/api/ai`、`maybe_ai_turn` 代打、大厅「添加 AI」
- `ai_clients` 表暂留（不迁库）；自动化标签以后再加

### 回归与数据
- 回归会自建 `前缀_8位hex` 账号；测完删除，整轮结束再扫尾
- 已清库内历史残留，现仅 `admin` + 手建 `agent`
- 最近一次：unit + regression 全绿（约 21 + 30）

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
| `fa4472e` | 状态机 / 安全边界 / Host 快照；大厅管理台与大海战一并跟上 |
| （本轮） | 去掉独立 AI 管理 |
| （本轮） | 回归结束后清理测试账号 |
| （本轮） | 本日报 |

## 明日 / 可选
- 接入方自报标签（人 / agent / 脚本），仅展示与筛战绩，不走第二套逻辑
- 推送当前 main（含 `fa4472e` 与本轮提交）

## 风险
- 共用 Docker Postgres 时，若回归中途被掐，仍可能留下测试号（下一轮扫尾会清）
- 拆装大海战：停 `game-battleship`、去掉 URL、`games` 行 inactive
