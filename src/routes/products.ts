import express from 'express';
import Product from '../models/Product.js';
import { getTenantId } from '../lib/tenant.js';
import { authenticate, checkPermission } from '../middleware/auth.js';

const router = express.Router();

// GET /api/products - List all products for the current tenant
router.get('/', async (req, res) => {
  try {
    const tenantId = getTenantId();
    const products = await Product.find({ tenantId }).sort({ name: 1 }).lean();
    res.json(products);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// POST /api/products - Create a new product or bulk products (Auth required)
router.post('/', authenticate, checkPermission('MENU_MANAGE', ['MANAGER']), async (req, res) => {
  try {
    const tenantId = getTenantId();
    
    if (Array.isArray(req.body)) {
      // Bulk create
      const productsData = req.body.map(p => ({ ...p, tenantId }));
      const products = await Product.insertMany(productsData);
      return res.status(201).json(products);
    }

    const productData = { 
      ...req.body, 
      tenantId // Force the tenantId from context
    };
    
    const product = new Product(productData);
    await product.save();
    res.status(201).json(product);
  } catch (error) {
    res.status(400).json({ error: 'Failed to create product(s)', details: error });
  }
});

// PUT /api/products/:id - Update an existing product (Auth required)
router.put('/:id', authenticate, checkPermission('MENU_MANAGE', ['MANAGER']), async (req, res) => {
  try {
    const tenantId = getTenantId();
    const updateData = { ...req.body };
    delete updateData.tenantId; // Prevent changing tenantId
    
    const product = await Product.findOneAndUpdate(
      { _id: req.params.id, tenantId },
      { $set: updateData },
      { new: true }
    );
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json(product);
  } catch (error) {
    res.status(400).json({ error: 'Failed to update product', details: error });
  }
});

// DELETE /api/products/:id - Delete a product (Auth required)
router.delete('/:id', authenticate, checkPermission('MENU_MANAGE', ['MANAGER']), async (req, res) => {
  try {
    const tenantId = getTenantId();
    const product = await Product.findOneAndDelete({ _id: req.params.id, tenantId });
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json({ message: 'Product deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

export default router;
