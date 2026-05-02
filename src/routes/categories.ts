import express from 'express';
import Category from '../models/Category.js';
import { getTenantId } from '../lib/tenant.js';
import { authenticate, checkPermission } from '../middleware/auth.js';

const router = express.Router();

// GET /api/categories - List all categories
router.get('/', async (req, res) => {
  try {
    const tenantId = getTenantId();
    const categories = await Category.find({ tenantId, isActive: true }).sort({ order: 1, name: 1 }).lean();
    res.json(categories);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// POST /api/categories - Create a new category
router.post('/', authenticate, checkPermission('MENU_MANAGE', ['MANAGER']), async (req, res) => {
  try {
    const tenantId = getTenantId();
    const categoryData = { ...req.body, tenantId };
    const category = new Category(categoryData);
    await category.save();
    res.status(201).json(category);
  } catch (error: any) {
    if (error.code === 11000) {
      return res.status(400).json({ error: 'Tên danh mục đã tồn tại' });
    }
    res.status(400).json({ error: 'Failed to create category' });
  }
});

// PUT /api/categories/:id - Update
router.put('/:id', authenticate, checkPermission('MENU_MANAGE', ['MANAGER']), async (req, res) => {
  try {
    const tenantId = getTenantId();
    const category = await Category.findOneAndUpdate(
      { _id: req.params.id, tenantId },
      { $set: req.body },
      { new: true }
    );
    if (!category) return res.status(404).json({ error: 'Category not found' });
    res.json(category);
  } catch (error) {
    res.status(400).json({ error: 'Failed to update category' });
  }
});

// DELETE /api/categories/:id - Delete (Soft delete or hard?)
router.delete('/:id', authenticate, checkPermission('MENU_MANAGE', ['MANAGER']), async (req, res) => {
  try {
    const tenantId = getTenantId();
    // We do hard delete for now if requested, but usually better to soft delete or check if products linked
    const category = await Category.findOneAndDelete({ _id: req.params.id, tenantId });
    if (!category) return res.status(404).json({ error: 'Category not found' });
    res.json({ message: 'Category deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete category' });
  }
});

export default router;
