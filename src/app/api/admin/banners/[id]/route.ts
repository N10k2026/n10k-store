import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAdminSession } from '@/lib/admin-auth';
import { deleteUploadByUrl } from '@/lib/orphan-cleanup';

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

  const existing = await db.banner.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: 'Banner no encontrado' }, { status: 404 });
  }

  const { title, imageUrl, link, placement, isActive, sortOrder } = body as Record<string, unknown>;

  const validPlacements = ['desktop', 'mobile', 'both'];
  const finalPlacement =
    placement && validPlacements.includes(String(placement))
      ? String(placement)
      : undefined;

  // Track the old image URL so we can delete the physical file if it's being
  // replaced AND no longer referenced by any other banner/product.
  const oldImageUrl = existing.imageUrl;

  const banner = await db.banner.update({
    where: { id },
    data: {
      ...(title != null ? { title: String(title) } : {}),
      ...(imageUrl != null ? { imageUrl: String(imageUrl) } : {}),
      ...(link !== undefined ? { link: link ? String(link) : null } : {}),
      ...(finalPlacement ? { placement: finalPlacement } : {}),
      ...(isActive != null ? { isActive: Boolean(isActive) } : {}),
      ...(sortOrder != null ? { sortOrder: Number(sortOrder) } : {}),
    },
  });

  // Orphan cleanup: if the image changed, delete the old file if it's an
  // upload and no longer referenced.
  if (
    imageUrl != null &&
    oldImageUrl &&
    oldImageUrl.startsWith('/uploads/') &&
    oldImageUrl !== String(imageUrl)
  ) {
    await deleteUploadByUrl(oldImageUrl);
  }

  return NextResponse.json({ banner });
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
  const existing = await db.banner.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: 'Banner no encontrado' }, { status: 404 });
  }

  const imageUrl = existing.imageUrl;

  await db.banner.delete({ where: { id } });

  // Delete the physical file if it's an upload and no longer referenced.
  await deleteUploadByUrl(imageUrl);

  return NextResponse.json({ success: true });
}
