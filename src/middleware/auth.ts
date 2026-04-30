import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import User from '../models/User.js';
import { getTenantId } from '../lib/tenant.js';

const JWT_SECRET = process.env.JWT_SECRET || 'default_secret';

export interface AuthRequest extends Request {
  user?: any;
}

export const authenticate = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    // Check DB state first to avoid 500 on timeout
    if (mongoose.connection.readyState !== 1) {
      const dbConnect = (await import('../lib/mongodb.js')).default;
      await dbConnect();
    }

    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: 'Database unstable', status: mongoose.connection.readyState });
    }

    const token = req.cookies?.token || req.headers.authorization?.split(' ')[1];
    let currentTenantId = getTenantId();

    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const decoded: any = jwt.verify(token, JWT_SECRET);

    // Security: Token tenant must match current request tenant
    // Exception for 'demo' tenant (system admin context) or if user is global admin
    const isGlobalAdmin = decoded.tenantId === 'demo';
    
    const proceedWithUser = async (tenantToUse: string) => {
      const user = await User.findOne({ _id: decoded.id, tenantId: decoded.tenantId }).select('-password');

      if (!user) {
        console.warn(`Auth Middleware: User not found for ID ${decoded.id} in tenant ${decoded.tenantId} (Target tenant: ${tenantToUse})`);
        return res.status(401).json({ error: 'User not found or mismatch tenant' });
      }

      req.user = user;
      next();
    };

    if (decoded.tenantId !== currentTenantId && !isGlobalAdmin) {
       // If the detected tenant is 'demo' (the default fallback), OR it looks like an AI Studio system subdomain,
       // but the token has a specific tenant, we "promote" the request context to that tenant.
       const isSystemSubdomain = currentTenantId.startsWith('ais-dev-') || currentTenantId.startsWith('ais-pre-');
       
       if (currentTenantId === 'demo' || isSystemSubdomain) {
         console.log(`Auth Middleware: Promoting tenant context from '${currentTenantId}' to '${decoded.tenantId}' based on token`);
         return (await import('../lib/tenant.js')).tenantStorage.run({ tenantId: decoded.tenantId }, () => proceedWithUser(decoded.tenantId));
       } else {
         console.warn(`Auth Middleware: Tenant mismatch. Token: ${decoded.tenantId}, Request: ${currentTenantId}`);
         return res.status(403).json({ error: 'Tenant access mismatch' });
       }
    }

    await proceedWithUser(currentTenantId);
  } catch (error) {
    console.error('Auth Middleware Error:', error);
    res.status(401).json({ error: 'Invalid token' });
  }
};

export const checkPermission = (permission?: string, roles?: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (req.user.role === 'ADMIN') return next();

    if (roles && roles.includes(req.user.role)) return next();

    if (permission && req.user.permissions?.includes(permission)) return next();

    return res.status(403).json({ error: 'Permission denied' });
  };
};
