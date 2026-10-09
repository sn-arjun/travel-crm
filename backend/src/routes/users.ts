import { Hono } from 'hono';
import { zValidator } from '../utils/validator';
import { z } from 'zod';
import { drizzle } from 'drizzle-orm/d1';
import { eq, desc, and } from 'drizzle-orm';
import type { AppContext } from '../types';
import { tenantUsers, tenants } from '../db/master-schema';
import { users, loginHistory } from '../db/tenant-schema';
import { rbac } from '../middleware/rbac';
import { permissionsForRole } from '../constants/permissions';
import { hashPassword } from '../utils/password';
import { generateId } from '../utils/uuid';
import { logActivity } from '../utils/activity-logger';
import { success, created, error } from '../utils/response';

const userRoutes = new Hono<AppContext>();

// ============================================================
// GET /me/permissions — What the signed-in user's role may do
// ============================================================
// The matrix in constants/permissions.ts is the single source; clients read it here
// instead of keeping their own copy.

userRoutes.get('/me/permissions', (c) => {
  const role = c.get('role');
  return success(c, { role, permissions: permissionsForRole(role) });
});

// ============================================================
// GET /me — Current user profile
// ============================================================

userRoutes.get('/me', async (c) => {
  const userId = c.get('userId');
  const db = drizzle(c.get('tenantDb'));

  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      phone: users.phone,
      name: users.name,
      role: users.role,
      avatarUrl: users.avatarUrl,
      department: users.department,
      language: users.language,
      isActive: users.isActive,
      lastLoginAt: users.lastLoginAt,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    return error(c, 'User not found', 404);
  }

  return success(c, user);
});

// ============================================================
// PUT /me — Update own profile
// ============================================================

const updateProfileSchema = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().optional(),
  department: z.string().optional(),
  language: z.string().optional(),
});

userRoutes.put(
  '/me',
  zValidator('json', updateProfileSchema),
  async (c) => {
    const userId = c.get('userId');
    const data = c.req.valid('json');
    const db = drizzle(c.get('tenantDb'));

    await db
      .update(users)
      .set({ ...data, updatedAt: new Date().toISOString() })
      .where(eq(users.id, userId));

    const [updated] = await db.select().from(users).where(eq(users.id, userId)).limit(1);

    await logActivity(db, {
      userId,
      action: 'update',
      entityType: 'user',
      entityId: userId,
      details: JSON.stringify({ fields: Object.keys(data) }),
      ipAddress: c.get('clientIp'),
    });

    return success(c, {
      id: updated.id,
      email: updated.email,
      phone: updated.phone,
      name: updated.name,
      role: updated.role,
      avatarUrl: updated.avatarUrl,
      department: updated.department,
      language: updated.language,
      isActive: updated.isActive,
      lastLoginAt: updated.lastLoginAt,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    });
  }
);

// ============================================================
// GET /me/signature — Get email signature
// ============================================================

userRoutes.get('/me/signature', async (c) => {
  const userId = c.get('userId');
  const db = drizzle(c.get('tenantDb'));

  const [user] = await db
    .select({ emailSignature: users.emailSignature })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return success(c, { signature: user?.emailSignature ?? '' });
});

// ============================================================
// PUT /me/signature — Update email signature
// ============================================================

const signatureSchema = z.object({
  signature: z.string().max(10000),
});

userRoutes.put(
  '/me/signature',
  zValidator('json', signatureSchema),
  async (c) => {
    const userId = c.get('userId');
    const { signature } = c.req.valid('json');
    const db = drizzle(c.get('tenantDb'));

    await db
      .update(users)
      .set({ emailSignature: signature, updatedAt: new Date().toISOString() })
      .where(eq(users.id, userId));

    return success(c, { signature });
  }
);

// ============================================================
// POST /me/avatar — Upload avatar
// ============================================================

userRoutes.post('/me/avatar', async (c) => {
  const userId = c.get('userId');
  const db = drizzle(c.get('tenantDb'));

  const formData = await c.req.formData();
  const file = formData.get('avatar') as File | null;

  if (!file) {
    return error(c, 'No file provided', 400);
  }

  const ext = file.name.split('.').pop() || 'png';
  const key = `avatars/${c.get('tenantId')}/${userId}.${ext}`;

  await c.env.FILE_STORAGE.put(key, file.stream(), {
    httpMetadata: { contentType: file.type },
  });

  const avatarUrl = `/files/${key}`;
  await db.update(users).set({ avatarUrl, updatedAt: new Date().toISOString() }).where(eq(users.id, userId));

  return success(c, { avatarUrl });
});

// ============================================================
// GET /me/login-history — Own login history
// ============================================================

userRoutes.get('/me/login-history', async (c) => {
  const userId = c.get('userId');
  const db = drizzle(c.get('tenantDb'));

  const history = await db
    .select()
    .from(loginHistory)
    .where(eq(loginHistory.userId, userId))
    .orderBy(desc(loginHistory.createdAt))
    .limit(50);

  return success(c, history);
});

// ============================================================
// GET / — List all users (admin only)
// ============================================================

userRoutes.get('/', rbac(['admin', 'sales_manager']), async (c) => {
  const db = drizzle(c.get('tenantDb'));

  const allUsers = await db
    .select({
      id: users.id,
      email: users.email,
      phone: users.phone,
      name: users.name,
      role: users.role,
      avatarUrl: users.avatarUrl,
      department: users.department,
      inviteStatus: users.inviteStatus,
      isActive: users.isActive,
      lastLoginAt: users.lastLoginAt,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(desc(users.createdAt));

  return success(c, allUsers);
});

// ============================================================
// POST / — Create/invite user (admin only)
// ============================================================

const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  role: z.enum(['admin', 'sales_manager', 'salesperson', 'operations', 'accountant', 'view_only']),
  phone: z.string().optional(),
  department: z.string().optional(),
});

userRoutes.post(
  '/',
  rbac(['admin']),
  zValidator('json', createUserSchema),
  async (c) => {
    const data = c.req.valid('json');
    const tenantId = c.get('tenantId');
    const db = drizzle(c.get('tenantDb'));
    const masterDb = drizzle(c.env.MASTER_DB);

    // Check if email already exists in tenant
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, data.email.toLowerCase()))
      .limit(1);

    if (existing) {
      return error(c, 'A user with this email already exists', 409);
    }

    // Create invite token
    const inviteToken = generateId();
    await c.env.SESSIONS.put(
      `invite:${inviteToken}`,
      JSON.stringify({ tenantId, email: data.email.toLowerCase(), role: data.role }),
      { expirationTtl: 604800 } // 7 days
    );

    // Insert invited user into tenant DB so they appear in team list
    const newUserId = generateId();
    await db.insert(users).values({
      id: newUserId,
      email: data.email.toLowerCase(),
      phone: data.phone || null,
      name: data.name,
      passwordHash: 'INVITE_PENDING',
      role: data.role,
      department: data.department || null,
      inviteStatus: 'pending',
      invitedAt: new Date().toISOString(),
    });

    // Create placeholder in master tenant_users
    await masterDb.insert(tenantUsers).values({
      id: generateId(),
      tenantId,
      email: data.email.toLowerCase(),
      phone: data.phone || null,
      userId: newUserId,
      role: data.role,
    });

    await logActivity(db, {
      userId: c.get('userId'),
      action: 'invite_user',
      entityType: 'user',
      entityId: newUserId,
      details: JSON.stringify({ email: data.email, role: data.role }),
      ipAddress: c.get('clientIp'),
    });

    return created(c, {
      id: newUserId,
      name: data.name,
      phone: data.phone || null,
      department: data.department || null,
      inviteStatus: 'pending',
      isActive: 1,
      inviteToken,
      inviteUrl: `https://app.travelcrm.pro/setup-account?token=${inviteToken}`,
      email: data.email,
      role: data.role,
    });
  }
);

// ============================================================
// GET /:id — Get user by ID (admin only)
// ============================================================

userRoutes.get('/:id', rbac(['admin', 'sales_manager']), async (c) => {
  const userId = c.req.param('id');
  const db = drizzle(c.get('tenantDb'));

  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);

  if (!user) {
    return error(c, 'User not found', 404);
  }

  const { passwordHash: _, ...userWithoutPassword } = user;
  return success(c, userWithoutPassword);
});

// ============================================================
// PUT /:id — Update user (admin only)
// ============================================================

const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  role: z.enum(['admin', 'sales_manager', 'salesperson', 'operations', 'accountant', 'view_only']).optional(),
  phone: z.string().optional(),
  department: z.string().optional(),
});

userRoutes.put(
  '/:id',
  rbac(['admin']),
  zValidator('json', updateUserSchema),
  async (c) => {
    const userId = c.req.param('id');
    const data = c.req.valid('json');
    const db = drizzle(c.get('tenantDb'));
    const masterDb = drizzle(c.env.MASTER_DB);

    await db
      .update(users)
      .set({ ...data, updatedAt: new Date().toISOString() })
      .where(eq(users.id, userId));

    // Sync role to master if changed
    if (data.role) {
      await masterDb
        .update(tenantUsers)
        .set({ role: data.role })
        .where(
          and(
            eq(tenantUsers.userId, userId),
            eq(tenantUsers.tenantId, c.get('tenantId'))
          )
        );
    }

    const [updated] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    const { passwordHash: _, ...userWithoutPassword } = updated;

    await logActivity(db, {
      userId: c.get('userId'),
      action: 'update_user',
      entityType: 'user',
      entityId: userId,
      details: JSON.stringify({ fields: Object.keys(data) }),
      ipAddress: c.get('clientIp'),
    });

    return success(c, userWithoutPassword);
  }
);

// ============================================================
// PUT /:id/deactivate — Deactivate user (admin only)
// ============================================================

userRoutes.put('/:id/deactivate', rbac(['admin']), async (c) => {
  const userId = c.req.param('id');
  const db = drizzle(c.get('tenantDb'));
  const masterDb = drizzle(c.env.MASTER_DB);

  if (userId === c.get('userId')) {
    return error(c, 'Cannot deactivate your own account', 400);
  }

  await db.update(users).set({ isActive: 0, updatedAt: new Date().toISOString() }).where(eq(users.id, userId));
  await masterDb
    .update(tenantUsers)
    .set({ isActive: 0 })
    .where(and(eq(tenantUsers.userId, userId), eq(tenantUsers.tenantId, c.get('tenantId'))));

  await logActivity(db, {
    userId: c.get('userId'),
    action: 'deactivate_user',
    entityType: 'user',
    entityId: userId,
    ipAddress: c.get('clientIp'),
  });

  return success(c, { message: 'User deactivated' });
});

// ============================================================
// PUT /:id/activate — Activate user (admin only)
// ============================================================

userRoutes.put('/:id/activate', rbac(['admin']), async (c) => {
  const userId = c.req.param('id');
  const db = drizzle(c.get('tenantDb'));
  const masterDb = drizzle(c.env.MASTER_DB);

  await db.update(users).set({ isActive: 1, updatedAt: new Date().toISOString() }).where(eq(users.id, userId));
  await masterDb
    .update(tenantUsers)
    .set({ isActive: 1 })
    .where(and(eq(tenantUsers.userId, userId), eq(tenantUsers.tenantId, c.get('tenantId'))));

  await logActivity(db, {
    userId: c.get('userId'),
    action: 'activate_user',
    entityType: 'user',
    entityId: userId,
    ipAddress: c.get('clientIp'),
  });

  return success(c, { message: 'User activated' });
});

// ============================================================
// POST /:id/unlock — Unlock locked account (admin only)
// ============================================================

userRoutes.post('/:id/unlock', rbac(['admin']), async (c) => {
  const userId = c.req.param('id');
  const db = drizzle(c.get('tenantDb'));

  // Get user email
  const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user) {
    return error(c, 'User not found', 404);
  }

  // Clear lockout
  const lockKey = `failed_login:${c.get('tenantId')}:${user.email}`;
  await c.env.CACHE.delete(lockKey);

  await logActivity(db, {
    userId: c.get('userId'),
    action: 'unlock_user',
    entityType: 'user',
    entityId: userId,
    ipAddress: c.get('clientIp'),
  });

  return success(c, { message: 'Account unlocked' });
});

// ============================================================
// GET /:id/login-history — User login history (admin only)
// ============================================================

userRoutes.get('/:id/login-history', rbac(['admin']), async (c) => {
  const userId = c.req.param('id');
  const db = drizzle(c.get('tenantDb'));

  const history = await db
    .select()
    .from(loginHistory)
    .where(eq(loginHistory.userId, userId))
    .orderBy(desc(loginHistory.createdAt))
    .limit(100);

  return success(c, history);
});

export default userRoutes;
