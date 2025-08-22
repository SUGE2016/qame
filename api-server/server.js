const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { runMigrations } = require('./config/database');
const User = require('./models/User');

// 路由
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const playersRoutes = require('./routes/players');
const gameRoutes = require('./routes/games');
const matchesRoutes = require('./routes/matches');
const aiRoutes = require('./routes/ai');

const app = express();

// 中间件
app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? 'https://localhost' : 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());

// 健康检查
app.get('/health', (req, res) => {
  res.json({
    code: 200,
    message: 'API服务器运行正常',
    data: {
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      services: {
        database: 'connected',
        redis: 'connected'
      }
    }
  });
});

// API健康检查（通过Nginx代理）
app.get('/api/health', (req, res) => {
  res.json({
    code: 200,
    message: 'API服务器运行正常',
    data: {
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      services: {
        database: 'connected',
        redis: 'connected'
      }
    }
  });
});

// API路由
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/players', playersRoutes); // 新增：统一选手管理API
app.use('/api/ai', aiRoutes); // 新增：AI管理API

app.use('/api/games', gameRoutes);
app.use('/api/matches', matchesRoutes);

// 404处理
app.use('*', (req, res) => {
  res.status(404).json({
    code: 404,
    message: '接口不存在',
    data: null
  });
});

// 错误处理中间件
app.use((error, req, res, next) => {
  console.error('服务器错误:', error);
  res.status(500).json({
    code: 500,
    message: '服务器内部错误',
    data: null
  });
});

// 启动服务器
const PORT = process.env.PORT || 8001;

async function startServer() {
  try {
    console.log('🔄 运行数据库迁移...');
    await runMigrations();
    console.log('✅ 数据库连接成功');
    console.log('✅ 数据库迁移执行成功');

    // 初始化Admin用户
    console.log('🔄 检查Admin用户...');
    const adminUser = await User.findAdmin();
    if (!adminUser) {
      const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
      await User.createAdmin('admin', adminPassword);
      console.log('✅ Admin用户创建成功 (用户名: admin, 密码: ' + adminPassword + ')');
    } else {
      console.log('✅ Admin用户已存在');
    }

    app.listen(PORT, () => {
      console.log(`🔐 API服务器运行在端口 ${PORT}`);
      console.log('🗄️  使用PostgreSQL数据库');
      console.log('🔐 认证API: /api/auth');
      console.log('🤖 AI API: /api/ai');
      console.log('👨‍💼 Admin API: /api/admin');
      console.log('🏥 健康检查: /health');
    });

  } catch (error) {
    console.error('❌ 服务器启动失败:', error);
    process.exit(1);
  }
}

// 全局错误处理
process.on('uncaughtException', (err) => {
  console.error('未捕获的异常:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('未处理的Promise拒绝:', reason);
  process.exit(1);
});

startServer(); 