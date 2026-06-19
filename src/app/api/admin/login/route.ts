import { NextRequest, NextResponse } from 'next/server';
import { adminLogin, ensureDefaultAdmin } from '@/lib/admin-auth';

export async function POST(req: NextRequest) {
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
