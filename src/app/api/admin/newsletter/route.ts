import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAdminSession } from '@/lib/admin-auth';

export async function GET() {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const subscribers = await db.newsletterSubscriber.findMany({
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({ subscribers });
}

export async function DELETE(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body?.id) {
    return NextResponse.json({ error: 'ID requerido' }, { status: 400 });
  }

  await db.newsletterSubscriber.delete({ where: { id: String(body.id) } });
  return NextResponse.json({ success: true });
}
