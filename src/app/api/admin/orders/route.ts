import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAdminSession } from '@/lib/admin-auth';

export async function GET(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const url = new URL(req.url);
  const status = url.searchParams.get('status') || '';

  const where: Record<string, unknown> = {};
  if (status && status !== 'todos') {
    where.status = status;
  }

  const orders = await db.order.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 200,
  });

  return NextResponse.json({ orders });
}
