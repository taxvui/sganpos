import express, { Response } from 'express';
import Shift from '../models/Shift.js';
import Order from '../models/Order.js';
import { authenticate, checkPermission, AuthRequest } from '../middleware/auth.js';
import { getTenantId } from '../lib/tenant.js';
import { emitToTenant } from '../lib/socketService.js';
import AuditLog from '../models/AuditLog.js';

const router = express.Router();

// Get current open shift
router.get('/current', authenticate, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.user.tenantId; // Use user's own tenantId record for security
    const shift = await Shift.findOne({ 
      tenantId, 
      status: 'OPEN' 
    });
    res.json(shift);
  } catch (error) {
    console.error('Get Current Shift Error:', error);
    res.status(500).json({ error: 'Failed to get current shift' });
  }
});

// Open a new shift
router.post('/open', authenticate, checkPermission(undefined, ['MANAGER', 'STAFF']), async (req: AuthRequest, res) => {
  try {
    const { openingBalance } = req.body;
    const tenantId = req.user.tenantId; // Use user's own tenantId record for security
    const userId = req.user._id;
    const generateShiftCode = () => {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      let code = '';
      for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return code;
    };

    // Check if there's already an open shift for this tenant
    const existingShift = await Shift.findOne({ tenantId, status: 'OPEN' });
    if (existingShift) {
      return res.status(400).json({ error: 'There is already an open shift for this tenant' });
    }

    const shift = new Shift({
      tenantId,
      userId,
      userName: req.user.name,
      openingBalance: openingBalance || 0,
      code: generateShiftCode(),
      status: 'OPEN'
    });

    await shift.save();

    // Audit log
    await AuditLog.create({
      userId,
      action: 'SHIFT_OPEN',
      entity: 'Shift',
      entityId: shift._id,
      tenantId,
      details: { openingBalance }
    });
    await Order.updateMany(
      { tenantId, status: { $ne: 'COMPLETED' } },
      { $set: { shiftId: shift._id } }
    );

    emitToTenant(tenantId, 'shift:update', shift);

    res.status(201).json(shift);
  } catch (error) {
    console.error('Open Shift Error:', error);
    res.status(500).json({ error: 'Failed to open shift' });
  }
});

// Get summary of current shift (for pre-closing display)
router.get('/summary', authenticate, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.user.tenantId; // Use user's own tenantId record for security

    const shift = await Shift.findOne({ tenantId, status: 'OPEN' });
    if (!shift) {
      return res.status(404).json({ error: 'No open shift found' });
    }

    const orders = await Order.find({
      tenantId,
      shiftId: shift._id,
      paymentStatus: 'PAID'
    });

    let totalSales = 0;
    let cashSales = 0;
    let transferSales = 0;
    const productMap = new Map<string, { quantity: number; amount: number }>();

    orders.forEach(order => {
      totalSales += order.total;
      if (order.paymentMethod === 'CASH') {
        cashSales += order.total;
      } else if (order.paymentMethod === 'TRANSFER') {
        transferSales += order.total;
      }

      order.items.forEach((item: any) => {
        const existing = productMap.get(item.name);
        if (existing) {
          existing.quantity += item.quantity;
          existing.amount += item.price * item.quantity;
        } else {
          productMap.set(item.name, {
            quantity: item.quantity,
            amount: item.price * item.quantity
          });
        }
      });
    });

    const productSales = Array.from(productMap.entries()).map(([name, data]) => ({
      name,
      quantity: data.quantity,
      amount: data.amount
    }));

    res.json({
      openingBalance: shift.openingBalance,
      totalSales,
      cashSales,
      transferSales,
      expectedBalance: shift.openingBalance + cashSales,
      productSales
    });
  } catch (error) {
    console.error('Get Shift Summary Error:', error);
    res.status(500).json({ error: 'Failed to get shift summary' });
  }
});

// Close shift
router.post('/close', authenticate, checkPermission(undefined, ['MANAGER', 'STAFF']), async (req: AuthRequest, res) => {
  try {
    const { closingBalance } = req.body;
    const tenantId = req.user.tenantId; // Use user's own tenantId record for security

    const shift = await Shift.findOne({ tenantId, status: 'OPEN' });
    if (!shift) {
      return res.status(404).json({ error: 'No open shift found' });
    }

    // Calculate total sales from orders linked to this shift
    const orders = await Order.find({
      tenantId,
      shiftId: shift._id,
      paymentStatus: 'PAID' // Only count paid orders
    });
    
    let totalSales = 0;
    let cashSales = 0;
    let transferSales = 0;
    const productMap = new Map<string, { quantity: number; amount: number }>();

    orders.forEach(order => {
      totalSales += order.total;
      if (order.paymentMethod === 'CASH') {
        cashSales += order.total;
      } else if (order.paymentMethod === 'TRANSFER') {
        transferSales += order.total;
      }

      order.items.forEach((item: any) => {
        const existing = productMap.get(item.name);
        if (existing) {
          existing.quantity += item.quantity;
          existing.amount += item.price * item.quantity;
        } else {
          productMap.set(item.name, {
            quantity: item.quantity,
            amount: item.price * item.quantity
          });
        }
      });
    });

    const productSales = Array.from(productMap.entries()).map(([name, data]) => ({
      name,
      quantity: data.quantity,
      amount: data.amount
    }));
    
    // Generate code if missing (legacy shifts)
    if (!shift.code) {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      let code = '';
      for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      shift.code = code;
    }

    shift.status = 'CLOSED';
    shift.endTime = new Date();
    shift.closingBalance = closingBalance;
    shift.totalSales = totalSales;
    shift.cashSales = cashSales;
    shift.transferSales = transferSales;
    shift.productSales = productSales;
    shift.notes = req.body.notes || '';
    
    await shift.save();

    // Audit log
    await AuditLog.create({
      userId: req.user._id,
      action: 'SHIFT_CLOSE',
      entity: 'Shift',
      entityId: shift._id,
      tenantId,
      details: { 
        totalSales, 
        cashSales, 
        closingBalance,
        expectedBalance: shift.openingBalance + cashSales
      }
    });

    emitToTenant(tenantId, 'shift:update', { status: 'CLOSED', shiftId: shift._id });
    
    res.json(shift);
  } catch (error) {
    console.error('Close Shift Error:', error);
    res.status(500).json({ error: 'Failed to close shift' });
  }
});

// Get all shifts (history)
router.get('/', authenticate, checkPermission('REPORT_VIEW', ['MANAGER']), async (req: AuthRequest, res) => {
  try {
    const { status, limit = 50, offset = 0, tenantId: targetTenantId } = req.query;
    
    // Security: Only allow system admins (demo tenant admins) to see all or specific tenants
    const isSystemAdmin = req.user.tenantId === 'demo' && req.user.role === 'ADMIN';
    
    const query: any = {};
    if (isSystemAdmin) {
      if (targetTenantId) query.tenantId = targetTenantId;
    } else {
      query.tenantId = req.user.tenantId;
    }

    if (status) query.status = status;

    const shifts = await Shift.find(query)
      .sort({ startTime: -1 })
      .limit(Number(limit))
      .skip(Number(offset));
      
    const total = await Shift.countDocuments(query);

    res.json({
      shifts,
      total,
      limit,
      offset
    });
  } catch (error) {
    console.error('List Shifts Error:', error);
    res.status(500).json({ error: 'Failed to list shifts' });
  }
});

// Get specific shift by ID
router.get('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const isSystemAdmin = req.user.tenantId === 'demo' && req.user.role === 'ADMIN';
    const query: any = { _id: req.params.id };
    
    if (!isSystemAdmin) {
      query.tenantId = req.user.tenantId;
    }

    const shift = await Shift.findOne(query);
    
    if (!shift) {
      return res.status(404).json({ error: 'Shift not found' });
    }
    
    res.json(shift);
  } catch (error) {
    console.error('Get Shift Detail Error:', error);
    res.status(500).json({ error: 'Failed to fetch shift details' });
  }
});

// Get orders for a specific shift
router.get('/:id/orders', authenticate, async (req: AuthRequest, res) => {
  try {
    const isSystemAdmin = req.user.tenantId === 'demo' && req.user.role === 'ADMIN';
    const shiftId = req.params.id;

    // First check if shift belongs to user OR user is system admin
    const shiftQuery: any = { _id: shiftId };
    if (!isSystemAdmin) {
      shiftQuery.tenantId = req.user.tenantId;
    }
    
    const shift = await Shift.findOne(shiftQuery);
    if (!shift) {
      return res.status(404).json({ error: 'Shift not found or access denied' });
    }

    const orders = await Order.find({
      tenantId: shift.tenantId,
      shiftId
    }).populate('tableId', 'name').sort({ createdAt: -1 });

    res.json(orders);
  } catch (error) {
    console.error('Get Shift Orders Error:', error);
    res.status(500).json({ error: 'Failed to fetch shift orders' });
  }
});

export default router;
