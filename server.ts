import 'dotenv/config';
import express from 'express';
import { createServer as createHttpServer } from 'http';
import { Server } from 'socket.io';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import compression from 'compression';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import dbConnect from './src/lib/mongodb.js';
import User from './src/models/User.js';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { tenantMiddleware } from './src/middleware/tenant.js';
import { runMigration } from './src/lib/migration.js';
import { initSocket } from './src/lib/socketService.js'; // Add this
import productRoutes from './src/routes/products.js';
import orderRoutes from './src/routes/orders.js';
import tableRoutes from './src/routes/tables.js';
import settingsRoutes from './src/routes/settings.js';
import authRoutes from './src/routes/auth.js';
import shiftRoutes from './src/routes/shifts.js';
import dashboardRoutes from './src/routes/dashboard.js';
import logRoutes from './src/routes/logs.js';
import categoryRoutes from './src/routes/categories.js';
import userRoutes from './src/routes/users.js';
import AuditLog from './src/models/AuditLog.js';

const app = express();

// SECURITY: Rate Limiting
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // limit each IP to 1000 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Quá nhiều yêu cầu từ IP này, vui lòng thử lại sau 15 phút.' }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // limit each IP to 20 auth requests (login/register) per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Thử đăng nhập/đăng ký quá nhiều lần. Vui lòng đợi 15 phút.' }
});

// SECURITY: CORS Configuration
const allowedOrigins = [
  'http://localhost:3000',
  process.env.APP_URL, // Deployed URL
].filter(Boolean) as string[];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV !== 'production') {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-Id']
}));

// PERFORMANCE: Gzip Compression
app.use(compression());

// Apply global rate limiter
app.use('/api', globalLimiter);
app.use('/api/auth', authLimiter);

// Logging buffer for development
const systemLogs: any[] = [];
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (res.statusCode === 401 && !req.originalUrl.includes('/api/auth/me')) {
      console.warn(`[401 ERROR] ${req.method} ${req.originalUrl}`);
    }
    if (!req.path.startsWith('/api/dev')) {
      systemLogs.push({
        timestamp: new Date(),
        method: req.method,
        path: req.path,
        status: res.statusCode,
        duration: `${duration}ms`,
        ip: req.ip
      });
      if (systemLogs.length > 200) systemLogs.shift();
    }
  });
  next();
});

app.set('trust proxy', 1);
const httpServer = createHttpServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

// Initialize the singleton so routes can use it
initSocket(io);

const PORT = 3000;

// Socket.io Multi-tenant logic
io.on('connection', (socket) => {
  // Extract tenant from host or query
  const host = socket.handshake.headers.host || '';
  let tenantId = 'demo';
  
  if (host && !host.includes('localhost')) {
    const parts = host.split('.');
    if (parts.length > 2) tenantId = parts[0];
  }

  // Join the tenant-specific room
  socket.join(tenantId);
  console.log(`[Socket] User ${socket.id} joined room: ${tenantId}`);

  socket.on('disconnect', () => {
    console.log(`[Socket] User ${socket.id} disconnected`);
  });
});

// Middleware
app.use((req, res, next) => {
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[Request] ${req.method} ${req.originalUrl}`);
  }
  next();
});

app.use(express.json());
app.use(cookieParser());
app.use(tenantMiddleware);

// Legacy Print API Compat (Resolves 404s)
app.post('/api/print/test-print', (req, res) => {
  res.json({ success: true, message: 'Compat response: Printing is handled client-side.' });
});

// DB Connection Check Middleware
app.use('/api', async (req, res, next) => {
  const state = mongoose.connection.readyState;
  
  // If disconnected or connecting, try to ensure connection
  if (state !== 1 && !req.path.startsWith('/health') && !req.path.startsWith('/dev/db-status')) {
    try {
      console.log(`[DB Middleware] State is ${state}. Attempting connection for ${req.path}`);
      await dbConnect();
      return next();
    } catch (err: any) {
      const states = ['Disconnected', 'Connected', 'Connecting', 'Disconnecting'];
      return res.status(503).json({ 
        error: 'Database is currently unavailable', 
        status: states[state] || 'Unknown',
        message: err.message,
        details: 'Please check the MongoDB connection string in the environment terminal or settings.'
      });
    }
  }
  next();
});

// API Routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', database: 'connected' });
});

app.post('/api/dev/migrate', authenticate, async (req: AuthRequest, res) => {
  if (req.user?.role !== 'ADMIN') return res.status(403).json({ error: 'Admin only' });
  try {
    await runMigration();
    res.json({ success: true, message: 'Migration/Seed completed successfully' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/shifts', shiftRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/tables', tableRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/logs', logRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/users', userRoutes);

import { authenticate, AuthRequest } from './src/middleware/auth.js';

// --- System & Maintenance APIs ---
app.get('/api/system/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    version: '1.0.0'
  });
});

app.get('/api/admin/system-logs', authenticate, (req: AuthRequest, res) => {
  if (req.user?.role !== 'ADMIN') return res.status(403).json({ error: 'Admin only' });
  res.json(systemLogs.slice().reverse());
});

app.get('/api/dev/db-status', authenticate, async (req: AuthRequest, res) => {
  if (req.user?.role !== 'ADMIN') return res.status(403).json({ error: 'Admin only' });
  console.log('[Dev] Checking DB status...');
  try {
    const state = mongoose.connection.readyState;
    const states = ['Disconnected', 'Connected', 'Connecting', 'Disconnecting'];
    
    let host = 'N/A';
    let dbName = 'N/A';
    let queryTest = 'Not tested';

    if (state === 1) { // Connected
      host = mongoose.connection.host;
      dbName = mongoose.connection.name;
      try {
        await mongoose.connection.db?.command({ ping: 1 });
        queryTest = 'Success';
      } catch (qErr: any) {
        queryTest = `Failed: ${qErr.message}`;
      }
    }

    res.json({ 
      status: states[state], 
      atlas: (process.env.MONGODB_URI || '').includes('mongodb+srv'),
      host: host,
      dbName: dbName,
      queryTest,
      uri: (process.env.MONGODB_URI || '').replace(/:([^@]+)@/, ':****@') // Mask password
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
// --------------------------------

app.post('/api/dev/seed', authenticate, async (req: AuthRequest, res) => {
  if (req.user?.role !== 'ADMIN') return res.status(403).json({ error: 'Admin only' });
  try {
    const { tenantId } = req.body;
    if (!tenantId) return res.status(400).json({ error: 'Tenant ID required' });

    // Seed Tables if empty
    const Table = (await import('./src/models/Table.js')).default;
    const existingTables = await Table.find({ tenantId });
    if (existingTables.length === 0) {
      const demoTables = [];
      for (let i = 1; i <= 10; i++) demoTables.push({ name: `Bàn ${String(i).padStart(2, '0')}`, tenantId, isActive: true });
      for (let i = 1; i <= 5; i++) demoTables.push({ name: `Mang về ${String(i).padStart(2, '0')}`, tenantId, isActive: true });
      for (let i = 1; i <= 5; i++) demoTables.push({ name: `Ship ${String(i).padStart(2, '0')}`, tenantId, isActive: true });
      await Table.insertMany(demoTables);
    }

    // Seed Products if empty
    const Product = (await import('./src/models/Product.js')).default;
    const existingProducts = await Product.find({ tenantId });
    if (existingProducts.length === 0) {
      const demoProducts = [
        { name: 'Cà phê Đen', price: 25000, category: 'Đồ uống', tenantId, description: 'Cà phê nguyên chất', image: 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=500' },
        { name: 'Cà phê Sữa', price: 29000, category: 'Đồ uống', tenantId, description: 'Cà phê sữa pha máy', image: 'https://images.unsplash.com/photo-1461023058943-07fcbe16d735?w=500' },
        { name: 'Bạc Xỉu', price: 32000, category: 'Đồ uống', tenantId, image: 'https://images.unsplash.com/photo-1544787210-22dbce921500?w=500' },
        { name: 'Trà Đào Cam Sả', price: 45000, category: 'Trà', tenantId, image: 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=500' }
      ];
      await Product.insertMany(demoProducts);
    }

    res.json({ success: true, message: 'Data seeded successfully' });
  } catch (err: any) {
    console.error('Seed failed:', err);
    res.status(500).json({ error: 'Seed failed' });
  }
});

// Final catch-all for errors
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(`[${new Date().toISOString()}] GLOBAL ERROR:`, err);
  
  const status = err.status || err.statusCode || 500;
  const isProd = process.env.NODE_ENV === 'production';
  
  // Standardized Error Response
  res.status(status).json({ 
    success: false,
    error: {
      code: status,
      message: isProd ? (err.message || 'Hệ thống đang gặp sự cố, vui lòng thử lại sau.') : err.message,
      details: isProd ? undefined : err.stack,
      path: req.originalUrl,
      method: req.method
    }
  });
});

async function startServer() {
  console.log('[Server] Initializing system...');
  
  // Connect to Database
  let dbConnected = false;
  try {
    await dbConnect();
    dbConnected = true;
  } catch (err) {
    console.error('❌ CRITICAL ERROR: Could NOT connect to MongoDB. Server starting in limited mode.', err);
    // In many apps we might want to process.exit(1) here, 
    // but in a dev environment we might want the server to stay up to show the error page.
  }

  // Run Database Migration/Seed
  if (dbConnected) {
    await runMigration();
  } else {
    console.warn('⚠️ Skipping Migration/Sync: Database not connected.');
  }

  // Vite integration
  if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    
    // Explicitly handle SPA fallback for development
    app.get('*', async (req, res, next) => {
      const url = req.originalUrl;
      
      // Skip API routes and files with extensions (assets)
      if (url.startsWith('/api') || url.includes('.')) {
        return next();
      }

      try {
        const fs = await import('fs');
        const templateFile = path.resolve(process.cwd(), 'index.html');
        let template = fs.readFileSync(templateFile, 'utf-8');
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e) {
        console.error('Vite SPA Fallback Error:', e);
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  } else {
    // Serve static files for production (works on Vercel, Docker, VPS, etc.)
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath, {
      maxAge: '1y',
      etag: false
    }));
    
    // SPA fallback: serve index.html for all non-API routes
    app.get('*', (req, res) => {
      const url = req.originalUrl;
      
      // Skip API routes and asset files
      if (url.startsWith('/api')) {
        return res.status(404).json({ error: 'Not found' });
      }
      
      // Skip files with extensions (except .html)
      if (url.includes('.') && !url.endsWith('.html')) {
        return res.status(404).send('Not found');
      }
      
      // Serve index.html for all SPA routes
      const indexPath = path.join(distPath, 'index.html');
      res.sendFile(indexPath, (err) => {
        if (err) {
          console.error('Error serving index.html:', err);
          res.status(404).send('Not found');
        }
      });
    });
  }

  // Start the server (works on localhost, Docker, Vercel, VPS, etc.)
  const server = httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });
  
  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully...');
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  });
}

startServer();

export default app;
