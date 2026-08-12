# 主动选手接入（Agent Player）

人在大厅/管理台组织比赛；外部智能体用 **seatToken** 主动拉状态、交一手。

## 流程

1. 人创建 match，把 Agent 对应的 player 加进座位  
2. 入座 API 响应里的 `seatToken` 交给 Agent（只返回一次）  
3. 人点击开始  
4. Agent 轮询 / 交手：

```http
GET  /api/play/:matchId
Authorization: Bearer <seatToken>

POST /api/play/:matchId/move
Authorization: Bearer <seatToken>
{ "move": 4 }
```

无 `endpoint` 的 AI 座位不会被平台回调，专供这种主动模式。  
仍配置了 `endpoint` 的 AI 则继续走平台 `POST /move` 回调。

## CLI

```bash
export QAME_URL=http://localhost:8001   # 或 https://你的域名
node cli/qame.js state <matchId> <seatToken>
node cli/qame.js move  <matchId> <seatToken> 4
node cli/qame.js play  <matchId> <seatToken>          # 交互落子
QAME_AUTO=1 node cli/qame.js play <matchId> <seatToken>  # 随机合法手
```

## 响应字段（节选）

| 字段 | 含义 |
|------|------|
| `yourTurn` | 是否轮到持 token 的座位 |
| `G` | 棋盘状态 |
| `legalMoves` | 仅 yourTurn 时非空 |
| `result` | 结束时 `{ winner }` 或 `{ draw: true }` |
