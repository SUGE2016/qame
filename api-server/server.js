const http = require('http');
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { runMigrations } = require('./config/database');
const User = require('./models/User');
const { attachWebSocket } = require('./ws');

const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const playersRoutes = require('./routes/players');
const gameRoutes = require('./routes/games');
const matchesRoutes = require('./routes/matches');
const playRoutes = require('./routes/play');
const statsRoutes = require('./routes/stats');
const aiRoutes = require('./routes/ai');

const app = express();

app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? true : 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());

app.get('/health', (req, res) => {
  res.json({
    code: 200,
    message: 'API服务器运行正常',
    data: {
      timestamp: new Date().toISOString(),
      version: '2.0.0',
      services: { database: 'connected', runtime: 'memory', ws: '/ws' }
    }
  });
});

app.get('/api/health', (req, res) => {
  res.json({
    code: 200,
    message: 'API服务器运行正常',
    data: {
      timestamp: new Date().toISOString(),
      version: '2.0.0',
      services: { database: 'connected', runtime: 'memory', ws: '/ws' }
    }
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/players', playersRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/games', gameRoutes);
app.use('/api/matches', matchesRoutes);
app.use('/api/play', playRoutes);
app.use('/api/stats', statsRoutes);

app.use('*', (req, res) => {
  res.status(404).json({ code: 404, message: '接口不存在', data: null });
});

app.use((error, req, res, next) => {
  console.error('服务器错误:', error);
  res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
});

const PORT = process.env.PORT || 8001;

async function startServer() {
  try {
    console.log('🔄 运行数据库迁移...');
    await runMigrations();
    console.log('✅ 数据库迁移完成');

    const adminUser = await User.findAdmin();
    if (!adminUser) {
      const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
      await User.createAdmin('admin', adminPassword);
      console.log('✅ Admin用户创建成功');
    }

    const server = http.createServer(app);
    attachWebSocket(server);

    server.listen(PORT, () => {
      console.log(`🔐 API + Runtime 运行在端口 ${PORT}`);
      console.log('🔌 WebSocket: /ws');
    });
  } catch (error) {
    console.error('❌ 服务器启动失败:', error);
    process.exit(1);
  }
}

process.on('uncaughtException', (err) => {
  console.error('未捕获的异常:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('未处理的Promise拒绝:', reason);
  process.exit(1);
});

startServer();
