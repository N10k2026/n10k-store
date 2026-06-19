import { NextRequest, NextResponse } from 'next/server';
import { adminLogin, ensureDefaultAdmin } from '@/lib/admin-auth';
import { applyRateLimit } from '@/lib/rate-limit';
import { ensureDatabase } from '@/lib/db-init';

export async function POST(req: NextRequest) {
  // Brute-force protection: max 10 login attempts per 15 minutes per IP.
  const limited = applyRateLimit(req, 'admin-login', 10, 15 * 60 * 1000);
  if (!limited.ok) {
    return NextResponse.json(
      { error: `Demasiados intentos. Intenta de nuevo en ${limited.retryAfter}s.` },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfter) } },
    );
  }

  // Ensure the database is initialized (creates tables + seeds if empty).
  await ensureDatabase().catch(() => {
    // If ensureDatabase fails (e.g., DB file missing), try ensureDefaultAdmin
    // which will also fail gracefully — the error will surface below.
  });

  // Lazily create the default admin on first login attempt so the
  // subsystem is usable immediately after db:push without a seed step.
  await ensureDefaultAdmin();

  const body = await req.json().catch(() => null);
  if (!body || typeof body.username !== 'string' || typeof body.password !== 'string') {
    return NextResponse.json(
      { error: 'Datos inválidos' },
      { status: 400 },
    );
  }

  const result = await adminLogin(body.username, body.password);
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 401 });
  }
  return NextResponse.json({ success: true, name: result.name });
}
