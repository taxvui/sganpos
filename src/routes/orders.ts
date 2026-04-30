import express from 'express';
import Order from '../models/Order.js';
import Shift from '../models/Shift.js';
import Table from '../models/Table.js';
import { getTenantId } from '../lib/tenant.js';
import { emitToTenant } from '../lib/socketService.js';
import { authenticate, checkPermission } from '../middleware/auth.js';
import rateLimit from 'express-rate-limit';

const orderCreateLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 50, // limit each IP to 50 orders per 5 minutes
  message: { error: 'Gửi đơn hàng quá nhanh. Vui lòng đợi 5 phút.' }
});

const router = express.Router();

// GET /api/orders/reports - Statistical reports (Auth required)
router.get('/reports', authenticate, checkPermission('REPORT_VIEW', ['MANAGER']), async (req, res) => {
  try {
    const tenantId = getTenantId();
    const { startDate, endDate } = req.query;

    const start = startDate ? new Date(startDate as string) : new Date(new Date().setHours(0,0,0,0));
    const end = endDate ? new Date(endDate as string) : new Date(new Date().setHours(23,59,59,999));

    const dateFilter = {
      tenantId,
      createdAt: { $gte: start, $lte: end },
      paymentStatus: 'PAID'
    };

    // Total Revenue
    const revenueStats = await Order.aggregate([
      { $match: dateFilter },
      { $group: { _id: null, total: { $sum: '$total' }, count: { $sum: 1 } } }
    ]);

    // Revenue by Day
    const dailyRevenue = await Order.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          revenue: { $sum: "$total" }
        }
      },
      { $sort: { "_id": 1 } }
    ]);

    // Top 5 Products
    const topProducts = await Order.aggregate([
      { $match: dateFilter },
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.name",
          quantity: { $sum: "$items.quantity" },
          revenue: { $sum: { $multiply: ["$items.price", "$items.quantity"] } }
        }
      },
      { $sort: { quantity: -1 } },
      { $limit: 5 }
    ]);

    // Payment Methods
    const paymentMethods = await Order.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: "$paymentMethod",
          revenue: { $sum: "$total" },
          count: { $sum: 1 }
        }
      }
    ]);

    res.json({
      summary: revenueStats[0] || { total: 0, count: 0 },
      daily: dailyRevenue,
      topProducts,
      paymentMethods
    });
  } catch (error) {
    console.error('Report error:', error);
    res.status(500).json({ error: 'Failed to generate reports' });
  }
});

// GET /api/orders - List orders for the tenant (Auth required)
router.get('/', authenticate, async (req, res) => {
  try {
    const tenantId = getTenantId();
    
    // If no pagination params, return array as before for backward compatibility
    if (!req.query.page && !req.query.limit) {
      const orders = await Order.find({ tenantId })
        .sort({ createdAt: -1 })
        .limit(300) // Safety limit
        .lean();
      return res.json(orders);
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const skip = (page - 1) * limit;

    const orders = await Order.find({ tenantId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await Order.countDocuments({ tenantId });
    
    res.json({
      data: orders,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// POST /api/orders - Create a new order
router.post('/', orderCreateLimiter, async (req, res) => {
  try {
    const tenantId = getTenantId();
    const orderNumber = req.body.orderNumber || req.body.orderCode || `ORD-${Date.now().toString().slice(-6)}`;
    
    // 🔥 SECURITY: Recalculate total on server to prevent price manipulation
    const Product = (await import('../models/Product.js')).default;
    const items = req.body.items || [];
    let subtotal = 0;

    for (const item of items) {
      const product = await Product.findOne({ _id: item.productId, tenantId });
      if (!product) {
        return res.status(400).json({ error: `Sản phẩm ${item.name} không tồn tại hoặc đã bị xóa.` });
      }

      // Base price
      let itemPrice = product.basePrice;
      
      // Size price
      if (item.size) {
        const sizeOption = product.sizes.find((s: any) => s.name === item.size);
        if (sizeOption) itemPrice = sizeOption.price;
      }

      // Toppings price
      let toppingsPrice = 0;
      if (item.toppings && Array.isArray(item.toppings)) {
        for (const topping of item.toppings) {
          const toppingInDb = product.toppings.find((t: any) => t.name === topping.name);
          if (toppingInDb) {
            toppingsPrice += toppingInDb.price;
          }
        }
      }

      const calculatedItemPrice = itemPrice + toppingsPrice;
      
      // Update item price to server price just in case
      item.price = calculatedItemPrice;
      subtotal += calculatedItemPrice * item.quantity;
    }

    // Apply Discount
    let discountAmount = 0;
    const { discountType, discountValue = 0 } = req.body;
    if (discountType === 'PERCENTAGE') {
      discountAmount = Math.round((subtotal * discountValue) / 100);
    } else if (discountType === 'FIXED') {
      discountAmount = discountValue;
    }

    // Apply Tax (if applicable)
    const taxRate = req.body.taxRate || 0;
    const taxAmount = Math.round(((subtotal - discountAmount) * taxRate) / 100);
    const total = subtotal - discountAmount + taxAmount;

    // Find current open shift for this tenant
    let shiftId = req.body.shiftId;
    if (!shiftId) {
      const currentShift = await Shift.findOne({ tenantId, status: 'OPEN' });
      if (currentShift) {
        shiftId = currentShift._id;
      }
    }

    if (!shiftId) {
       return res.status(400).json({ error: 'Không có ca làm việc nào đang mở. Vui lòng mở ca để tiếp nhận đơn hàng.' });
    }

    const orderData = { 
      ...req.body, 
      orderNumber, 
      tenantId, 
      shiftId, 
      subtotal,
      taxAmount,
      discountAmount,
      total,
      status: req.body.status || 'PENDING', 
      paymentStatus: req.body.paymentStatus || 'UNPAID' 
    };
    const order = new Order(orderData);
    await order.save();

    // If order is linked to a table
    if (req.body.tableId) {
      if (orderData.status === 'COMPLETED') {
        // If POS creates a completed order, ensure table is EMPTY
        await Table.findOneAndUpdate(
          { _id: req.body.tableId, tenantId },
          { $set: { status: 'EMPTY', currentOrderId: null } }
        );
        emitToTenant(tenantId, 'table:update', { _id: req.body.tableId, status: 'EMPTY' });
      } else {
        // If it's a PENDING order (e.g. from customer), mark table as OCCUPIED
        await Table.findOneAndUpdate(
          { _id: req.body.tableId, tenantId },
          { $set: { status: 'OCCUPIED', currentOrderId: order._id } }
        );
        // Notify about table update
        emitToTenant(tenantId, 'table:update', { _id: req.body.tableId, status: 'OCCUPIED' });
      }
    }
    
    // 🔥 REALTIME: Notify kitchen
    emitToTenant(tenantId, 'order:new', order);
    
    res.status(201).json(order);
  } catch (error) {
    res.status(400).json({ error: 'Failed to create order', details: error });
  }
});

// PATCH /api/orders/:id - Update order status (Auth required)
router.patch('/:id', authenticate, checkPermission('POS_EDIT', ['MANAGER']), async (req, res) => {
  try {
    const tenantId = getTenantId();
    const updateData: any = { ...req.body };
    delete updateData.tenantId; // Security check
    delete updateData._id;
    
    const order = await Order.findOneAndUpdate(
      { _id: req.params.id, tenantId },
      { $set: updateData },
      { new: true }
    );

    if (!order) return res.status(404).json({ error: 'Order not found' });

    // If order status is set to COMPLETED or paymentStatus to PAID, we might want to free the table
    // For simplicity, let's free the table when status is COMPLETED
    if (order.status === 'COMPLETED' && order.tableId) {
      await Table.findOneAndUpdate(
        { _id: order.tableId, tenantId },
        { $set: { status: 'EMPTY', currentOrderId: null } }
      );
      // Notify about table update
      emitToTenant(tenantId, 'table:update', { _id: order.tableId, status: 'EMPTY' });
    }

    // 🔥 REALTIME: Notify POS and Kitchen
    emitToTenant(tenantId, 'order:update', order);

    res.json(order);
  } catch (error) {
    res.status(400).json({ error: 'Failed to update order' });
  }
});

// DELETE /api/orders/:id - Cancel/Delete order (Auth required)
router.delete('/:id', authenticate, checkPermission('POS_DELETE', ['MANAGER']), async (req, res) => {
  try {
    const tenantId = getTenantId();
    const order = await Order.findOneAndDelete({ _id: req.params.id, tenantId });
    
    if (!order) return res.status(404).json({ error: 'Order not found' });

    // 🔥 REALTIME: Notify POS and Kitchen about removal
    // We send an update with a flag or just the order with a special status
    emitToTenant(tenantId, 'order:update', { ...order.toObject(), deleted: true });

    res.json({ message: 'Order deleted successfully' });
  } catch (error) {
    res.status(400).json({ error: 'Failed to delete order' });
  }
});

export default router;
