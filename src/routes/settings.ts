import express, { Response } from 'express';
import Settings from '../models/Settings.js';
import { getTenantId } from '../lib/tenant.js';
import { authenticate, checkPermission, AuthRequest } from '../middleware/auth.js';
import AuditLog from '../models/AuditLog.js';

const router = express.Router();

// GET /api/settings - Fetch current settings
router.get('/', async (req, res) => {
  try {
    const tenantId = getTenantId();
    let settings = await Settings.findOne({ tenantId });
    
    if (!settings) {
      // Create default settings if not exists
      settings = new Settings({ tenantId });
      await settings.save();
    }
    
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// GET /api/settings/public/brand - Fetch public brand info
router.get('/public/brand', async (req, res) => {
  try {
    const tenantId = getTenantId();
    const settings = await Settings.findOne({ tenantId }, 'storeName logoUrl');
    
    if (!settings) {
      return res.json({ 
        storeName: 'SAIGON AN COFFEE', 
        logoUrl: '/logo.svg' 
      });
    }
    
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: 'Failed' });
  }
});

// PUT /api/settings - Update settings (Auth required)
router.put('/', authenticate, checkPermission('SETTINGS_MANAGE', ['MANAGER']), async (req: AuthRequest, res: express.Response) => {
  try {
    const tenantId = getTenantId();
    const updateData = req.body;
    
    const settings = await Settings.findOneAndUpdate(
      { tenantId },
      { $set: updateData },
      { returnDocument: 'after', upsert: true }
    );

    // Audit log
    await AuditLog.create({
      userId: req.user._id,
      action: 'SETTINGS_UPDATE',
      entity: 'Settings',
      tenantId,
      details: updateData
    });
    
    res.json(settings);
  } catch (error) {
    res.status(400).json({ error: 'Failed to update settings' });
  }
});

export default router;
