import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAdminSession } from '@/lib/admin-auth';

export async function GET() {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const settings = await db.siteSetting.findMany();
  // Convert to a key-value object for easy consumption
  const obj: Record<string, string> = {};
  for (const s of settings) obj[s.key] = s.value;

  return NextResponse.json({ settings: obj });
}

export async function PUT(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as Record<string, string> | null;
  if (!body) {
    return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });
  }

  // Upsert each setting
  await Promise.all(
    Object.entries(body).map(([key, value]) =>
      db.siteSetting.upsert({
        where: { key },
        update: { value: String(value) },
        create: { key, value: String(value) },
      }),
    ),
  );

  return NextResponse.json({ success: true });
}
