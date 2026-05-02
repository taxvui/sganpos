import express from 'express';
import Order from '../models/Order.js';
import Table from '../models/Table.js';
import Product from '../models/Product.js';
import Shift from '../models/Shift.js';
import { getTenantId } from '../lib/tenant.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

/**
 * @api {get} /api/dashboard/stats Get overall dashboard stats
 * @apiPermission authenticate
 */
router.get('/stats', authenticate, async (req, res) => {
  try {
    const tenantId = getTenantId();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const dateFilter = {
      tenantId,
      createdAt: { $gte: todayStart, $lte: todayEnd }
    };

    // 1. Revenue Today
    const revenueStats = await Order.aggregate([
      { $match: { ...dateFilter, paymentStatus: 'PAID' } },
      { $group: { _id: null, total: { $sum: '$total' }, count: { $sum: 1 } } }
    ]);

    // 2. Active Tables Count
    const activeTables = await Table.countDocuments({ tenantId, status: 'OCCUPIED' });
    const totalTables = await Table.countDocuments({ tenantId, isActive: true });

    // 3. Pending Orders (Not completed yet)
    const pendingOrdersCount = await Order.countDocuments({ 
      tenantId, 
      status: { $in: ['PENDING', 'PROCESSING', 'READY'] } 
    });

    // 4. Products Count
    const productsCount = await Product.countDocuments({ tenantId, isActive: true });

    // 5. Open Shift Info
    const openShift = await Shift.findOne({ tenantId, status: 'OPEN' }).lean();

    res.json({
      revenue: {
        today: revenueStats[0]?.total || 0,
        ordersCount: revenueStats[0]?.count || 0
      },
      tables: {
        occupied: activeTables,
        total: totalTables,
        percentage: totalTables > 0 ? Math.round((activeTables / totalTables) * 100) : 0
      },
      orders: {
        pending: pendingOrdersCount
      },
      inventory: {
        totalProducts: productsCount
      },
      shift: {
        isOpen: !!openShift,
        startTime: openShift?.startTime,
        code: openShift?.code
      }
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard statistics' });
  }
});

/**
 * @api {get} /api/dashboard/charts Get chart data for revenue
 * @apiPermission authenticate
 */
router.get('/charts', authenticate, async (req, res) => {
  try {
    const tenantId = getTenantId();
    const last7Days = new Date();
    last7Days.setDate(last7Days.getDate() - 7);
    last7Days.setHours(0, 0, 0, 0);

    const chartData = await Order.aggregate([
      { 
        $match: { 
          tenantId, 
          paymentStatus: 'PAID',
          createdAt: { $gte: last7Days }
        } 
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          amount: { $sum: "$total" },
          count: { $sum: 1 }
        }
      },
      { $sort: { "_id": 1 } }
    ]);

    res.json(chartData);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch chart data' });
  }
});

export default router;
