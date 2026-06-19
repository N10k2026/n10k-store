import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAdminSession } from '@/lib/admin-auth';

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });
  }

  const existing = await db.product.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 });
  }

  const {
    name,
    slug,
    category,
    price,
    originalPrice,
    image,
    description,
    video,
    isNew,
    isBestSeller,
    sortOrder,
  } = body as Record<string, unknown>;

  // If slug is changing, ensure it stays unique
  if (slug && slug !== existing.slug) {
    const clash = await db.product.findUnique({ where: { slug: slug as string } });
    if (clash && clash.id !== id) {
      return NextResponse.json({ error: 'El slug ya existe' }, { status: 409 });
    }
  }

  const product = await db.product.update({
    where: { id },
    data: {
      ...(name != null ? { name: String(name) } : {}),
      ...(slug != null ? { slug: String(slug) } : {}),
      ...(category != null ? { category: String(category) } : {}),
      ...(price != null ? { price: Number(price) } : {}),
      ...(originalPrice != null ? { originalPrice: Number(originalPrice) } : {}),
      ...(image != null ? { image: String(image) } : {}),
      ...(description != null ? { description: String(description) } : {}),
      ...(video != null ? { video: video ? String(video) : null } : {}),
      ...(isNew != null ? { isNew: Boolean(isNew) } : {}),
      ...(isBestSeller != null ? { isBestSeller: Boolean(isBestSeller) } : {}),
      ...(sortOrder != null ? { sortOrder: Number(sortOrder) } : {}),
    },
  });

  return NextResponse.json({ product });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const { id } = await params;
  const existing = await db.product.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 });
  }

  await db.product.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
