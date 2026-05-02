import express from 'express';
import User from '../models/User.js';
import AuditLog from '../models/AuditLog.js';
import bcrypt from 'bcryptjs';
import { getTenantId } from '../lib/tenant.js';
import { authenticate, checkPermission, AuthRequest } from '../middleware/auth.js';

const router = express.Router();

// GET /api/users - List users for tenant
router.get('/', authenticate, checkPermission('USER_MANAGE', ['MANAGER']), async (req: AuthRequest, res) => {
  try {
    const tenantId = getTenantId();
    const currentUser = req.user;
    
    let query: any = { tenantId };
    
    // Non-admins only see staff
    if (currentUser.role !== 'ADMIN') {
      query.role = 'STAFF';
    }

    const users = await User.find(query, '-password').sort({ createdAt: -1 });
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// POST /api/users - Create user
router.post('/', authenticate, checkPermission('USER_MANAGE', ['MANAGER']), async (req: AuthRequest, res) => {
  try {
    const tenantId = getTenantId();
    const currentUser = req.user;
    const { role, password, ...userData } = req.body;

    // Security: Only ADMIN can create MANAGERs
    if (currentUser.role !== 'ADMIN' && role !== 'STAFF') {
      return res.status(403).json({ error: 'Phân quyền không hợp lệ' });
    }

    const hashedPassword = await bcrypt.hash(password || 'password@123', 10);
    const newUser = new User({ 
      ...userData, 
      role: role || 'STAFF',
      tenantId, 
      password: hashedPassword,
      managerId: currentUser._id
    });
    
    await newUser.save();
    
    // Log it
    await AuditLog.create({
      userId: currentUser._id,
      action: 'USER_CREATE',
      entity: 'User',
      entityId: newUser._id,
      tenantId,
      details: { email: newUser.email, role: newUser.role }
    });

    res.status(201).json(newUser);
  } catch (err: any) {
    if (err.code === 11000) {
      return res.status(400).json({ error: 'Email hoặc số điện thoại đã tồn tại' });
    }
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// PUT /api/users/:id - Update user
router.put('/:id', authenticate, checkPermission('USER_MANAGE', ['MANAGER']), async (req: AuthRequest, res) => {
  try {
    const tenantId = getTenantId();
    const targetUser = await User.findOne({ _id: req.params.id, tenantId });
    if (!targetUser) return res.status(404).json({ error: 'User not found' });

    // Safeguard
    if (req.user.role !== 'ADMIN' && targetUser.role === 'ADMIN') {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const updateData = { ...req.body };
    if (updateData.password) {
      updateData.password = await bcrypt.hash(updateData.password, 10);
    } else {
      delete updateData.password;
    }

    const updatedUser = await User.findOneAndUpdate(
      { _id: req.params.id, tenantId },
      { $set: updateData },
      { new: true }
    );

    res.json(updatedUser);
  } catch (error) {
    res.status(400).json({ error: 'Update failed' });
  }
});

// DELETE /api/users/:id - Delete user
router.delete('/:id', authenticate, checkPermission('USER_MANAGE', ['MANAGER']), async (req: AuthRequest, res) => {
  try {
    const tenantId = getTenantId();
    const targetUser = await User.findOne({ _id: req.params.id, tenantId });
    if (!targetUser) return res.status(404).json({ error: 'User not found' });

    if (req.user.role !== 'ADMIN' && targetUser.role !== 'STAFF') {
      return res.status(403).json({ error: 'Chỉ có thể xóa nhân viên (STAFF)' });
    }

    await User.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Delete failed' });
  }
});

export default router;
