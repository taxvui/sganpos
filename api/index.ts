import express from 'express';
import cookieParser from 'cookie-parser';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import cors from 'cors';
import dbConnect from '../src/lib/mongodb.js';
import User from '../src/models/User.js';
import { tenantMiddleware } from '../src/middleware/tenant.js';
import { getTenantId } from '../src/lib/tenant.js';
import { runMigration } from '../src/lib/migration.js';
import productRoutes from '../src/routes/products.js';
import orderRoutes from '../src/routes/orders.js';
import tableRoutes from '../src/routes/tables.js';
import settingsRoutes from '../src/routes/settings.js';
import authRoutes from '../src/routes/auth.js';
import shiftRoutes from '../src/routes/shifts.js';
import dashboardRoutes from '../src/routes/dashboard.js';
import logRoutes from '../src/routes/logs.js';
import categoryRoutes from '../src/routes/categories.js';
import userRoutes from '../src/routes/users.js';

const app = express();

// Trust proxy for secure cookies
app.set('trust proxy', 1);

// Basic configuration
app.disable('x-powered-by');

// Middleware
app.use((req, res, next) => {
  res.setHeader('X-Processed-By', 'SG-AN-POS-API');
  next();
});
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());
app.disable('x-powered-by');

// Global system logs (limited persistence on serverless)
const systemLogs: any[] = [];
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (!req.path.startsWith('/api/dev')) {
      systemLogs.push({
        timestamp: new Date(),
        method: req.method,
        path: req.path,
        status: res.statusCode,
        duration: `${duration}ms`,
        ip: req.ip
      });
      if (systemLogs.length > 50) systemLogs.shift();
    }
  });
  next();
});

// Database connection middleware
app.use(async (req, res, next) => {
  try {
    if (!process.env.MONGODB_URI) {
      console.error('MONGODB_URI is not defined');
      return res.status(500).json({ error: 'Database configuration missing' });
    }
    await dbConnect();
    next();
  } catch (error: any) {
    console.error('Database connection error:', error);
    res.status(500).json({ error: 'Database connection failed', details: error.message });
  }
});

app.use(tenantMiddleware);

// API Routes
app.get('/api/health', (req, res) => {
  const tenantId = getTenantId();
  res.json({ 
    status: 'ok', 
    database: 'connected',
    tenantId: tenantId,
    host: req.headers.host,
    forwardedHost: req.headers['x-forwarded-host'],
    url: req.url,
    originalUrl: req.originalUrl
  });
});

const apiRouter = express.Router();
apiRouter.use('/auth', authRoutes);
apiRouter.use('/shifts', shiftRoutes);
apiRouter.use('/products', productRoutes);
apiRouter.use('/orders', orderRoutes);
apiRouter.use('/tables', tableRoutes);
apiRouter.use('/settings', settingsRoutes);
apiRouter.use('/dashboard', dashboardRoutes);
apiRouter.use('/logs', logRoutes);
apiRouter.use('/categories', categoryRoutes);
apiRouter.use('/users', userRoutes);

// Legacy Print API Compat
apiRouter.post('/print/test-print', (req, res) => {
  res.json({ success: true, message: 'Compat response: Printing is handled client-side.' });
});

// Debug route
apiRouter.get('/debug-settings', async (req, res) => {
  try {
    const tenantId = getTenantId();
    const Settings = (await import('../src/models/Settings.js')).default;
    const settings = await Settings.findOne({ tenantId });
    res.json({ 
      success: true, 
      tenantId, 
      settings,
      headers: {
        host: req.headers.host,
        forwardedHost: req.headers['x-forwarded-host'],
        tenantIdHeader: req.headers['x-tenant-id']
      },
      env: { hasMongo: !!process.env.MONGODB_URI }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- Admin & Dev APIs ---
apiRouter.get('/admin/system-logs', (req, res) => {
  res.json(systemLogs.slice().reverse());
});

apiRouter.get('/dev/db-status', async (req, res) => {
  try {
    const state = mongoose.connection.readyState;
    const states = ['Disconnected', 'Connected', 'Connecting', 'Disconnecting'];
    res.json({ 
      status: states[state], 
      atlas: (process.env.MONGODB_URI || '').includes('mongodb+srv'),
      dbName: mongoose.connection.name
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/dev/migrate', async (req, res) => {
  try {
    await runMigration();
    res.json({ success: true, message: 'Migration/Seed completed successfully' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

apiRouter.get('/admin/users', async (req, res) => {
  try {
    const users = await User.find({}, '-password');
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

apiRouter.post('/admin/users', async (req, res) => {
  try {
    const hashedPassword = await bcrypt.hash(req.body.password || 'password@123', 10);
    const user = new User({ ...req.body, password: hashedPassword });
    await user.save();
    res.json(user);
  } catch (err: any) {
    if (err.code === 11000) {
      return res.status(400).json({ error: 'User mapping already exists' });
    }
    res.status(500).json({ error: 'Failed' });
  }
});

apiRouter.put('/admin/users/:id', async (req, res) => {
  try {
    const updateData = { ...req.body };
    if (updateData.password) {
      updateData.password = await bcrypt.hash(updateData.password, 10);
    }
    const user = await User.findByIdAndUpdate(req.params.id, updateData, { new: true });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
});

apiRouter.delete('/admin/users/:id', async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
});

// Final catch-all for errors
apiRouter.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(`[${new Date().toISOString()}] GLOBAL ERROR:`, err);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({ 
    success: false,
    error: {
      code: status,
      message: err.message || 'Internal Server Error',
      path: req.originalUrl
    }
  });
});

// Mounting configuration for Vercel
// On Vercel, when routed via /api/(.*), the original path /api/auth/register
// might be passed as /api/auth/register or just /auth/register depending on rewrite config.
app.use('/api', apiRouter);
app.use(apiRouter); // Fallback for when the /api prefix is stripped by Vercel

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Route not found on SG-AN-POS API', 
    path: req.path,
    method: req.method,
    tenantId: (req as any).tenantId
  });
});

// Export the app for Vercel
export default app;
