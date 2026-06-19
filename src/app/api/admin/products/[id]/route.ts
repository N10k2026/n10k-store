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
    colorImages,
    colors,
  } = body as Record<string, unknown>;

  // If slug is changing, ensure it stays unique
  if (slug && slug !== existing.slug) {
    const clash = await db.product.findUnique({ where: { slug: slug as string } });
    if (clash && clash.id !== id) {
      return NextResponse.json({ error: 'El slug ya existe' }, { status: 409 });
    }
  }

  // If colorImages is provided, sync the ProductImage rows.
  // colorImages is a Record<colorName, string[]> — replaces ALL images for
  // the given colors. This lets the admin edit per-color image galleries.
  let colorImagesUpdate:
    | { deleteMany: Record<string, never>; create: { url: string; colorName: string; sortOrder: number }[] }
    | undefined;
  if (colorImages != null && typeof colorImages === 'object') {
    const creates: { url: string; colorName: string; sortOrder: number }[] = [];
    let sortOrderIdx = 0;
    for (const [colorName, urls] of Object.entries(colorImages as Record<string, unknown>)) {
      if (!Array.isArray(urls)) continue;
      for (const url of urls) {
        if (typeof url === 'string' && url.trim()) {
          creates.push({
            url: url.trim(),
            colorName,
            sortOrder: sortOrderIdx++,
          });
        }
      }
    }
    colorImagesUpdate = {
      deleteMany: {},
      create: creates,
    };
  } else if (image != null) {
    // The admin sent a main `image` but no per-color images.
    // The storefront displays per-color images (colorImages) in preference to
    // the main `image`, so if we don't sync, the old per-color images would
    // still show and the user's change would appear to have no effect.
    // Sync: replace ALL per-color images with the new main image, attributed
    // to each existing color (or to a single "default" entry if no colors).
    const existingColors = await db.productColor.findMany({ where: { productId: id } });
    const colorNames = existingColors.length > 0
      ? existingColors.map((c) => c.name)
      : [null]; // no colors — store as a generic image
    colorImagesUpdate = {
      deleteMany: {},
      create: colorNames.map((cn, i) => ({
        url: String(image).trim(),
        colorName: cn,
        sortOrder: i,
      })),
    };
  }

  // If colors array is provided, sync the ProductColor rows.
  let colorsUpdate:
    | { deleteMany: Record<string, never>; create: { name: string; hex: string }[] }
    | undefined;
  if (Array.isArray(colors)) {
    const colorCreates: { name: string; hex: string }[] = [];
    for (const c of colors) {
      if (c && typeof c === 'object' && 'name' in c) {
        const cn = String((c as { name: unknown }).name).trim();
        const ch = String((c as { hex: unknown }).hex || '#000000').trim();
        if (cn) colorCreates.push({ name: cn, hex: ch });
      }
    }
    colorsUpdate = {
      deleteMany: {},
      create: colorCreates,
    };
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
      ...(colorImagesUpdate ? { images: colorImagesUpdate } : {}),
      ...(colorsUpdate ? { colors: colorsUpdate } : {}),
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
