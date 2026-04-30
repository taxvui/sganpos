import express from 'express';
import Table from '../models/Table.js';
import { getTenantId } from '../lib/tenant.js';
import { authenticate, checkPermission } from '../middleware/auth.js';

const router = express.Router();

// GET /api/tables - List tables for the tenant
router.get('/', async (req, res) => {
  try {
    const tenantId = getTenantId();
    const tables = await Table.find({ tenantId }).sort({ name: 1 }).lean();
    res.json(tables);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch tables' });
  }
});

// GET /api/tables/:id - Get specific table info
router.get('/:id', async (req, res) => {
  try {
    const tenantId = getTenantId();
    const table = await Table.findOne({ _id: req.params.id, tenantId });
    if (!table) return res.status(404).json({ error: 'Table not found' });
    res.json(table);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch table' });
  }
});

// POST /api/tables - Helper to setup tables (Auth required)
router.post('/', authenticate, checkPermission('TABLE_MANAGE', ['MANAGER']), async (req, res) => {
  try {
    const tenantId = getTenantId();
    const table = new Table({ ...req.body, tenantId });
    await table.save();
    res.status(201).json(table);
  } catch (error) {
    res.status(400).json({ error: 'Failed to create table' });
  }
});

// PATCH /api/tables/:id - Update table status (Auth required)
router.patch('/:id', authenticate, checkPermission('TABLE_MANAGE', ['MANAGER', 'STAFF']), async (req, res) => {
  try {
    const tenantId = getTenantId();
    const { status, currentOrderId } = req.body;
    
    const table = await Table.findOneAndUpdate(
      { _id: req.params.id, tenantId },
      { $set: { status, currentOrderId } },
      { new: true }
    );

    if (!table) {
      return res.status(404).json({ error: 'Table not found' });
    }

    // Notify other clients about table update
    const { getIO } = await import('../lib/socketService.js');
    const io = getIO();
    if (io) {
      io.to(tenantId).emit('table:update', table);
    }

    res.json(table);
  } catch (error) {
    res.status(400).json({ error: 'Failed to update table' });
  }
});

export default router;
