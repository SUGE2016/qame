const { Server, Origins } = require('boardgame.io/server');
const Router = require('@koa/router');
const { TicTacToe, Gomoku } = require('@qame/games');

// 定义游戏列表，供多处使用
const GAMES_LIST = [TicTacToe, Gomoku];

// 添加全局错误处理
process.on('uncaughtException', (err) => {
  console.log('全局错误:', err.message);
  console.log('错误堆栈:', err.stack);
});

process.on('unhandledRejection', (reason, promise) => {
  console.log('未处理的 Promise 拒绝:', reason);
});

// 创建boardgame.io服务器
const server = Server({
  games: GAMES_LIST,
  origins: [
    // 允许本地开发环境连接
    Origins.LOCALHOST_IN_DEVELOPMENT,
    // 允许前端应用连接
    'http://localhost:3000',
    'http://localhost:80',
    'http://192.168.1.156:3000',
    'http://192.168.1.156:80'
  ],
});

// 轻量自定义路由（健康检查 / 游戏列表）挂在 boardgame.io 的 Koa app
const router = new Router();

// 获取支持的游戏列表
// 移除了/api/games接口，因为前端直接调用api-server的接口

server.app
  .use(router.routes())
  .use(router.allowedMethods());

// 启动服务器
server.run(8000, () => {
  console.log('🎮 Qame 游戏服务器运行在端口 8000 - 纯 boardgame.io 服务');
  console.log('🚀 服务器启动完成');
});