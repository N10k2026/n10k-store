import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
// IMPORTANT: import ONLY from admin-session (Edge-compatible, no Prisma).
// Importing from admin-auth would pull in `db.ts` (Prisma) which uses
// Node.js APIs not available in the Edge Runtime.
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-session';

/**
 * Middleware: protect /admin/* routes (except /admin/login).
 * Validates the admin session cookie via the JWT verification helper
 * (Web Crypto only — Edge-compatible).
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Only guard /admin routes
  if (!pathname.startsWith('/admin')) {
    return NextResponse.next();
  }

  // Allow the login page itself (and its API) through
  if (pathname === '/admin/login') {
    return NextResponse.next();
  }

  const token = req.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  const session = await verifyAdminToken(token);

  if (!session) {
    // Redirect to login, preserving the intended destination
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = '/admin/login';
    loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*'],
};
