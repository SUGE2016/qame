# QAME 日报 2026-08-14

## 今日完成

### 全量前端联调
- lobby / admin 改用本机已有 `node:20-alpine`，构建时清空 Docker `HTTP_PROXY`
- 健康检查改本机 `http.get`，避免 wget 走代理卡住
- 密码盐默认与平台 `your_fixed_salt_here` 对齐

### 登录闪回
- 根因：`login` 把 cookie 写在注入的 `Response` 上，返回的 `JSONResponse` 没有 Set-Cookie
- 修复：cookie 写到实际返回响应；大厅登录写入 `accessToken`，请求带 Bearer

### MCP 局面等待
- 新增 `qame_watch_state`：等到 `yourTurn` / 终局（或 `until=change`）
- 资源 `qame://match/{id}/state`：列出已入座对局并可读当前局面
- Skill 对局循环改为 watch，不再空转 `get_state`

### 回归
- 9 unit + 17 API 全绿（宿主需 `unset all_proxy`，否则 curl 本机 8001 会超时）

## 主要提交
| Commit | 说明 |
|--------|------|
| `068f2a0` | 登录 cookie / Bearer |
| `542d45e` | 前端官方 node 镜像与代理规避 |

## 明日 / 可选
- admin 并入 lobby（P3）
- 推送当前 main（含概念视频文案 `e665e2b`）
