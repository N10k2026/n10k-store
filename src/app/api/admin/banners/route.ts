import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAdminSession } from '@/lib/admin-auth';

export async function GET() {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const banners = await db.banner.findMany({
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
  });

  return NextResponse.json({ banners });
}

export async function POST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });
  }

  const { title, imageUrl, link, placement, isActive, sortOrder } = body as Record<string, unknown>;

  if (!title || !imageUrl) {
    return NextResponse.json(
      { error: 'Título e imagen son obligatorios' },
      { status: 400 },
    );
  }

  const validPlacements = ['desktop', 'mobile', 'both'];
  const finalPlacement = validPlacements.includes(String(placement))
    ? String(placement)
    : 'both';

  const banner = await db.banner.create({
    data: {
      title: String(title),
      imageUrl: String(imageUrl),
      link: link ? String(link) : null,
      placement: finalPlacement,
      isActive: isActive != null ? Boolean(isActive) : true,
      sortOrder: sortOrder != null ? Number(sortOrder) : 0,
    },
  });

  return NextResponse.json({ banner }, { status: 201 });
}
