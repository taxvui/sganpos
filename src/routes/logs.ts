import express from 'express';
import AuditLog from '../models/AuditLog.js';
import { getTenantId } from '../lib/tenant.js';
import { authenticate, checkPermission } from '../middleware/auth.js';

const router = express.Router();

/**
 * @api {get} /api/logs Get activity logs for the tenant
 * @apiPermission authenticate, MANAGER
 */
router.get('/', authenticate, checkPermission('LOGS_VIEW', ['MANAGER']), async (req, res) => {
  try {
    const tenantId = getTenantId();
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const skip = (page - 1) * limit;

    const query: any = { tenantId };
    
    // Optional filters
    if (req.query.userId) query.userId = req.query.userId;
    if (req.query.action) query.action = req.query.action;
    if (req.query.entity) query.entity = req.query.entity;

    const logs = await AuditLog.find(query)
      .populate('userId', 'name email role')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await AuditLog.countDocuments(query);

    res.json({
      data: logs,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Fetch logs error:', error);
    res.status(500).json({ error: 'Failed to fetch activity logs' });
  }
});

export default router;
