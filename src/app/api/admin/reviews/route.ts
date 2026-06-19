import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAdminSession } from '@/lib/admin-auth';

export async function GET(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const url = new URL(req.url);
  const productId = url.searchParams.get('productId') || '';

  const where: Record<string, unknown> = {};
  if (productId) where.productId = productId;

  const reviews = await db.review.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: { product: { select: { name: true, id: true } } },
    take: 200,
  });

  return NextResponse.json({ reviews });
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

  await db.review.delete({ where: { id: String(body.id) } });
  return NextResponse.json({ success: true });
}
