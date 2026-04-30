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

import { authenticate, AuthRequest } from './src/middleware/auth.js';

// --- Development & Admin APIs (ADMIN ONLY) ---
app.get('/api/dev/logs', authenticate, (req: AuthRequest, res) => {
  if (req.user?.role !== 'ADMIN') return res.status(403).json({ error: 'Admin only' });
  console.log('[Dev] Fetching logs...');
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

app.get('/api/admin/users', authenticate, async (req: AuthRequest, res) => {
  const tenantId = (req as any).tenantId;
  const user = req.user;
  
  console.log(`[Admin] Fetching users for tenant ${tenantId}, user role: ${user.role}...`);
  try {
    let query: any = { tenantId };
    
    if (user.role === 'MANAGER' || user.permissions?.includes('USER_MANAGE')) {
      // Managers (SaaS Customers) see all staff in their tenant
      query.role = 'STAFF';
    } else if (user.role === 'ADMIN') {
      // System Admins see everyone in the tenant
    } else {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const users = await User.find(query, '-password').sort({ createdAt: -1 });
    res.json(users);
  } catch (err) {
    console.error('[Admin] User fetch failed:', err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

app.post('/api/admin/users', authenticate, async (req: AuthRequest, res) => {
  const tenantId = (req as any).tenantId;
  const currentUser = req.user;

  try {
    const { role } = req.body;

    if (currentUser.role === 'MANAGER' || (currentUser.role === 'STAFF' && currentUser.permissions?.includes('USER_MANAGE'))) {
      if (role !== 'STAFF') {
        return res.status(403).json({ error: 'Bạn chỉ có thể tạo người dùng với vai trò STAFF' });
      }
      req.body.role = 'STAFF';
      req.body.managerId = currentUser._id.toString();
    } else if (currentUser.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const hashedPassword = await bcrypt.hash(req.body.password || 'password@123', 10);
    const newUser = new User({ ...req.body, tenantId, password: hashedPassword });
    await newUser.save();
    res.json(newUser);
  } catch (err: any) {
    console.error('Failed to create user:', err);
    if (err.code === 11000) {
      const field = Object.keys(err.keyPattern)[0];
      return res.status(400).json({ error: `Trùng lặp: ${field === 'email' ? 'Email' : 'Số điện thoại'} đã tồn tại` });
    }
    res.status(500).json({ error: 'Failed to create user' });
  }
});

app.put('/api/admin/users/:id', authenticate, async (req: AuthRequest, res) => {
  const tenantId = (req as any).tenantId;
  const currentUser = req.user;

  try {
    const targetUser = await User.findOne({ _id: req.params.id, tenantId });
    if (!targetUser) return res.status(404).json({ error: 'User not found' });

    if (currentUser.role !== 'ADMIN') {
      // Cannot touch ADMIN accounts
      if (targetUser.role === 'ADMIN') {
        return res.status(403).json({ error: 'Bạn không có quyền sửa tài khoản ADMIN' });
      }

      const isManager = currentUser.role === 'MANAGER';
      const hasStaffManagePermission = currentUser.permissions?.includes('USER_MANAGE');
      const isTargetStaff = targetUser.role === 'STAFF';
      const isCreator = targetUser.managerId === currentUser._id.toString();

      // Managers can manage any staff in tenant. Staff with permission can only manage staff they created (or all staff? let's stick to all staff if permission granted)
      if (!(isManager || hasStaffManagePermission) || !isTargetStaff) {
         // Special case: if manager trying to edit another manager, we might block it unless they are the same person?
         if (isManager && targetUser.role === 'MANAGER' && targetUser._id.toString() === currentUser._id.toString()) {
           // Allow self edit
         } else {
           return res.status(403).json({ error: 'Bạn không có quyền sửa tài khoản này' });
         }
      }
      
      // Manager/Staff cannot escalate privileges or change manager
      delete req.body.role;
      delete req.body.managerId;
    }

    const updateData = { ...req.body };
    if (updateData.password) {
      updateData.password = await bcrypt.hash(updateData.password, 10);
    } else {
      delete updateData.password;
    }
    
    const updatedUser = await User.findOneAndUpdate(
      { _id: req.params.id, tenantId }, 
      updateData, 
      { returnDocument: 'after' }
    );
    res.json(updatedUser);
  } catch (err: any) {
    console.error('Failed to update user:', err);
    if (err.code === 11000) {
      const field = Object.keys(err.keyPattern)[0];
      return res.status(400).json({ error: `Trùng lặp: ${field === 'email' ? 'Email' : 'Số điện thoại'} đã tồn tại` });
    }
    res.status(500).json({ error: 'Failed to update user' });
  }
});

app.delete('/api/admin/users/:id', authenticate, async (req: AuthRequest, res) => {
  const tenantId = (req as any).tenantId;
  const currentUser = req.user;

  try {
    const targetUser = await User.findOne({ _id: req.params.id, tenantId });
    if (!targetUser) return res.status(404).json({ error: 'User not found' });

    if (currentUser.role !== 'ADMIN') {
      // Cannot delete ADMIN accounts
      if (targetUser.role === 'ADMIN') {
        return res.status(403).json({ error: 'Bạn không có quyền xóa tài khoản ADMIN' });
      }

      const isManager = currentUser.role === 'MANAGER';
      const hasStaffManagePermission = currentUser.permissions?.includes('USER_MANAGE');
      const isTargetStaff = targetUser.role === 'STAFF';

      if (!(isManager || hasStaffManagePermission) || !isTargetStaff) {
         return res.status(403).json({ error: 'Bạn không có quyền xóa tài khoản này (Chỉ có thể xóa STAFF)' });
      }
    }

    // Cascade delete if ADMIN deletes a MANAGER
    if (currentUser.role === 'ADMIN' && targetUser.role === 'MANAGER') {
      const purgeTenantId = targetUser.tenantId;
      console.log(`[Admin] Purging tenant data for: ${purgeTenantId}`);
      
      // Audit log the start of purge
      await AuditLog.create({
        userId: currentUser._id,
        action: 'TENANT_PURGE_START',
        entity: 'Tenant',
        tenantId: purgeTenantId,
        details: { managerId: targetUser._id, managerEmail: targetUser.email }
      });

      try {
        // Delete everything for this tenant
        const results = await Promise.all([
          mongoose.connection.collection('products').deleteMany({ tenantId: purgeTenantId }),
          mongoose.connection.collection('orders').deleteMany({ tenantId: purgeTenantId }),
          mongoose.connection.collection('tables').deleteMany({ tenantId: purgeTenantId }),
          mongoose.connection.collection('shifts').deleteMany({ tenantId: purgeTenantId }),
          mongoose.connection.collection('settings').deleteMany({ tenantId: purgeTenantId }),
          mongoose.connection.collection('users').deleteMany({ tenantId: purgeTenantId, role: { $ne: 'ADMIN' } }) 
        ]);
        
        console.log(`[Admin] Tenant ${purgeTenantId} purged successful.`);
        
        await AuditLog.create({
          userId: currentUser._id,
          action: 'TENANT_PURGE_COMPLETE',
          entity: 'Tenant',
          tenantId: purgeTenantId,
          details: { 
            deletedCounts: results.map(r => r.deletedCount)
          }
        });
      } catch (purgeErr: any) {
        console.error('[Admin] Purge error:', purgeErr);
        await AuditLog.create({
          userId: currentUser._id,
          action: 'TENANT_PURGE_FAILED',
          entity: 'Tenant',
          tenantId: purgeTenantId,
          details: { error: purgeErr.message }
        });
      }
    } else {
      await User.findOneAndDelete({ _id: req.params.id, tenantId });
      
      await AuditLog.create({
        userId: currentUser._id,
        action: 'USER_DELETE',
        entity: 'User',
        entityId: req.params.id,
        tenantId,
        details: { deletedEmail: targetUser.email }
      });
    }

    res.json({ success: true, message: 'User and tenant data deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete user' });
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
  console.error('[Global Error Handler]', err);
  const isProd = process.env.NODE_ENV === 'production';
  res.status(500).json({ 
    error: 'Internal Server Error', 
    message: isProd ? 'Đã có lỗi xảy ra trên hệ thống.' : err.message,
    details: isProd ? undefined : err.stack 
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
  } else if (!process.env.VERCEL) {
    // Only serve static files if NOT on Vercel (e.g. Docker, manual VPS)
    // On Vercel, we let Vercel framework serve the dist folder.
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      const url = req.originalUrl;
      // If it's a request for an asset that we didn't serve via express.static above,
      // we should return a 404 instead of index.html to prevent MIME type issues.
      if (url.includes('.') || url.startsWith('/assets/')) {
        return res.status(404).send('Not found');
      }
      const indexPath = path.join(distPath, 'index.html');
      res.sendFile(indexPath);
    });
  }

  if (!process.env.VERCEL) {
    httpServer.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
    });
  }
}

startServer();

export default app;
