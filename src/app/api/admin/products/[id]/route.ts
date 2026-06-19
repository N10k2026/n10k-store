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

  // Capture the OLD media URLs that are about to be replaced, so we can
  // delete their physical files after the DB update (orphan cleanup).
  // We only track /uploads/ files — static assets under /products/, /brand/,
  // etc. are shared and must NOT be deleted.
  const oldImageUrls = new Set<string>();
  if (existing.image && existing.image.startsWith('/uploads/')) {
    oldImageUrls.add(existing.image);
  }
  if (existing.video && existing.video.startsWith('/uploads/')) {
    oldImageUrls.add(existing.video);
  }
  const oldProductImages = await db.productImage.findMany({
    where: { productId: id },
    select: { url: true },
  });
  for (const img of oldProductImages) {
    if (img.url && img.url.startsWith('/uploads/')) {
      oldImageUrls.add(img.url);
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
      ...(colorImagesUpdate ? { images: colorImagesUpdate } : {}),
      ...(colorsUpdate ? { colors: colorsUpdate } : {}),
    },
  });

  // Orphan cleanup: collect the NEW media URLs that are now referenced, then
  // delete any OLD file that is no longer referenced.
  const newImageUrls = new Set<string>();
  if (product.image && product.image.startsWith('/uploads/')) {
    newImageUrls.add(product.image);
  }
  if (product.video && product.video.startsWith('/uploads/')) {
    newImageUrls.add(product.video);
  }
  const newProductImages = await db.productImage.findMany({
    where: { productId: id },
    select: { url: true },
  });
  for (const img of newProductImages) {
    if (img.url && img.url.startsWith('/uploads/')) {
      newImageUrls.add(img.url);
    }
  }
  // Delete old uploads that are no longer referenced by this product.
  // (They might still be referenced by OTHER products — deleteUploadByUrl is
  // per-file and safe, but we only call it for URLs that were ours and are
  // not in the new set. A global orphan sweep in the cleanup API handles
  // cross-product dedup safely.)
  for (const oldUrl of oldImageUrls) {
    if (!newImageUrls.has(oldUrl)) {
      await deleteUploadByUrl(oldUrl);
    }
  }

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
  const existing = await db.product.findUnique({
    where: { id },
    include: { images: { select: { url: true } } },
  });
  if (!existing) {
    return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 });
  }

  // Capture all /uploads/ URLs that belong to this product before deletion,
  // so we can delete the physical files afterwards (orphan cleanup).
  const urlsToDelete: string[] = [];
  if (existing.image && existing.image.startsWith('/uploads/')) {
    urlsToDelete.push(existing.image);
  }
  if (existing.video && existing.video.startsWith('/uploads/')) {
    urlsToDelete.push(existing.video);
  }
  for (const img of existing.images) {
    if (img.url && img.url.startsWith('/uploads/')) {
      urlsToDelete.push(img.url);
    }
  }

  await db.product.delete({ where: { id } });

  // Delete the physical files (deleteUploadByUrl safely checks that no other
  // product/banner still references them before unlinking).
  for (const url of urlsToDelete) {
    await deleteUploadByUrl(url);
  }

  return NextResponse.json({ success: true });
}
