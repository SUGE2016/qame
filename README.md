# 🎮 QAME - 多人在线游戏平台

基于 [boardgame.io](https://boardgame.io/) 构建的多人在线游戏平台，支持井字棋、五子棋等经典游戏。

## ✨ 核心功能

- **多人实时对战**: 支持井字棋、五子棋等游戏
- **AI玩家**: 集成LLM的智能AI对手
- **管理控制台**: 用户、游戏、AI配置管理
- **Docker部署**: 一键启动所有服务

## 🏗️ 技术架构

- **前端**: React + boardgame.io
- **游戏服务**: boardgame.io/server
- **API服务**: Express + PostgreSQL
- **AI服务**: Node.js + LLM集成
- **部署**: Docker Compose

## 🚀 快速开始

### 环境要求
- Docker & Docker Compose

### 启动步骤

```bash
# 1. 克隆项目
git clone <repository-url>
cd qame

# 2. 启动所有服务
docker-compose up --build
```

### 访问地址
- **游戏大厅**: http://localhost:3000
- **管理控制台**: http://localhost:3001
- **游戏服务**: http://localhost:8000
- **API服务**: http://localhost:8001

> 默认管理员账户：admin / admin123

## 🎯 支持游戏

- **井字棋**: 经典3x3网格游戏
- **五子棋**: 15x15棋盘五子连珠
- 更多游戏持续添加中...

## 🤖 AI玩家

### 特性
- **LLM集成**: 支持OpenAI、Claude等AI模型
- **智能决策**: 基于游戏状态的智能分析
- **实时对战**: 与人类玩家无缝对战

### 配置AI

```bash
# 配置LLM API（可选）
cp llm-ai-service/env.template llm-ai-service/.env
# 编辑.env文件，添加API密钥
```

## 📁 项目结构

```
qame/
├── lobby/                     # 游戏大厅前端
├── admin-console/             # 管理控制台前端
├── server/                    # 游戏服务器 (boardgame.io)
├── api-server/                # API服务器 (Express + PostgreSQL)
├── ai-manager/                # AI管理服务
├── llm-ai-service/            # LLM AI服务
├── packages/                  # 共享包
│   ├── qame-games/           # 游戏逻辑
│   ├── shared-ui/            # 共享UI组件
│   └── shared-utils/         # 共享工具
├── docs/architecture.md       # 系统架构说明（DiOS/联调参考）
└── docker-compose.yml         # Docker配置
```

更完整的服务拓扑、Nginx 路由、AI 闭环与部署要点见 [docs/architecture.md](docs/architecture.md)。

## 🛠️ 开发指南

### 本地开发

```bash
# 启动单个服务进行开发
docker-compose up lobby          # 游戏大厅
docker-compose up admin-console  # 管理控制台
docker-compose up api-server     # API服务

# 查看服务日志
docker-compose logs -f [service-name]
```

### 添加新游戏

1. 在 `packages/qame-games/src/` 创建游戏逻辑
2. 在 `lobby/src/games/` 创建游戏界面
3. 通过管理控制台添加游戏配置