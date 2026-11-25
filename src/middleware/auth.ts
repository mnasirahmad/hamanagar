import type { Request, Response, NextFunction } from 'express';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { count, eq } from 'drizzle-orm';
import { adminAuth } from '../lib/firebase-admin.ts';
import { db } from '../db/index.ts';
import { users } from '../db/schema.ts';

export type UserRole = 'admin' | 'accounts' | 'sales' | 'recovery' | 'viewer';

export interface DbUser {
  id: number;
  uid: string;
  email: string;
  fullName: string;
  role: string;
  isActive: boolean;
}

export interface AuthRequest extends Request {
  user?: DecodedIdToken;
  dbUser?: DbUser;
}

const OWNER_EMAILS = new Set(
  [process.env.ADMIN_EMAIL || '', 'mna22wb@gmail.com']
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
);

async function syncAuthenticatedUser(decoded: DecodedIdToken): Promise<DbUser> {
  const email = (decoded.email || '').toLowerCase();
  const displayName = decoded.name || email.split('@')[0] || 'Staff User';

  const existing = await db
    .select()
    .from(users)
    .where(eq(users.uid, decoded.uid))
    .limit(1);

  if (existing.length > 0) {
    const current = existing[0];
    if (OWNER_EMAILS.has(email) && current.role !== 'admin') {
      const updated = await db
        .update(users)
        .set({ email, role: 'admin', updatedAt: new Date() })
        .where(eq(users.uid, decoded.uid))
        .returning();
      return updated[0];
    }
    return current;
  }

  const totalRes = await db.select({ value: count() }).from(users);
  const isFirstUser = Number(totalRes[0]?.value || 0) === 0;
  const assignedRole: UserRole =
    isFirstUser || OWNER_EMAILS.has(email) ? 'admin' : 'viewer';

  const inserted = await db
    .insert(users)
    .values({
      uid: decoded.uid,
      email: email || `${decoded.uid}@unknown.local`,
      fullName: displayName,
      role: assignedRole,
      isActive: true,
    })
    .onConflictDoUpdate({
      target: users.uid,
      set: {
        email: email || `${decoded.uid}@unknown.local`,
        updatedAt: new Date(),
      },
    })
    .returning();

  return inserted[0];
}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing authentication token' });
  }

  const token = authHeader.split('Bearer ')[1];
  try {
    const decodedToken = await adminAuth.verifyIdToken(token);
    req.user = decodedToken;
    const dbUser = await syncAuthenticatedUser(decodedToken);
    if (!dbUser.isActive) {
      return res.status(403).json({ error: 'Account deactivated. Contact administrator.' });
    }
    req.dbUser = dbUser;
    next();
  } catch (error) {
    console.error('Authentication verification failed:', error);
    return res.status(401).json({ error: 'Unauthorized: Invalid or expired session token' });
  }
};

export const requireRole = (allowedRoles: UserRole[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    const role = (req.dbUser?.role || 'viewer') as UserRole;
    if (!allowedRoles.includes(role)) {
      return res.status(403).json({
        error: `Access denied: Requires one of [${allowedRoles.join(', ')}] permissions.`,
      });
    }
    next();
  };
};
