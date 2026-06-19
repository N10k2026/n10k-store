/**
 * Admin authentication — server-side (Node.js Runtime).
 *
 * Re-exports the Edge-compatible session/password utilities from
 * `admin-session.ts` and adds the Prisma-dependent functions
 * (login, logout, getSession, ensureDefaultAdmin) that can only run
 * in Server Components / Route Handlers (NOT in the Edge middleware).
 *
 * The middleware imports ONLY `admin-session.ts` to stay Edge-compatible.
 */

import { db } from '@/lib/db';
import { cookies } from 'next/headers';
import {
  hashPassword,
  verifyPassword,
  signSession,
  verifySession,
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_MAX_AGE,
  type SessionPayload,
} from '@/lib/admin-session';

// Re-export for convenience
export {
  hashPassword,
  verifyPassword,
  signSession,
  verifySession,
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_MAX_AGE,
  type SessionPayload,
};

/* ------------------------------------------------------------------ */
/* Server-only: login, logout, getSession, requireAdmin               */
/* ------------------------------------------------------------------ */

export async function adminLogin(
  username: string,
  password: string,
): Promise<{ success: true; name: string } | { success: false; error: string }> {
  const admin = await db.adminUser.findUnique({ where: { username } });
  if (!admin) {
    return { success: false, error: 'Usuario o contraseña incorrectos' };
  }
  const ok = await verifyPassword(
    password,
    admin.passwordHash,
    admin.passwordSalt,
  );
  if (!ok) {
    return { success: false, error: 'Usuario o contraseña incorrectos' };
  }
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    sub: admin.id,
    username: admin.username,
    name: admin.name,
    iat: now,
    exp: now + ADMIN_SESSION_MAX_AGE,
  };
  const token = await signSession(payload);
  const cookieStore = await cookies();
  cookieStore.set(ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: ADMIN_SESSION_MAX_AGE,
  });
  return { success: true, name: admin.name };
}

export async function adminLogout(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(ADMIN_SESSION_COOKIE);
}

/** Get the current admin session (server-side, in Server Components / Route Handlers). */
export async function getAdminSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySession(token);
}

/** Require an admin session — used in protected pages/APIs. */
export async function requireAdmin(): Promise<SessionPayload> {
  const session = await getAdminSession();
  if (!session) {
    throw new Error('UNAUTHORIZED');
  }
  return session;
}

/* ------------------------------------------------------------------ */
/* Bootstrap: create a default admin if none exists                   */
/* ------------------------------------------------------------------ */

export async function ensureDefaultAdmin(): Promise<void> {
  const count = await db.adminUser.count();
  if (count > 0) return;
  const { hash, salt } = await hashPassword('admin123');
  await db.adminUser.create({
    data: {
      username: 'admin',
      passwordHash: hash,
      passwordSalt: salt,
      name: 'Administrador',
    },
  });
}
