import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAdminSession } from '@/lib/admin-auth';

export async function GET(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const url = new URL(req.url);
  const q = url.searchParams.get('q')?.trim() || '';
  const category = url.searchParams.get('category') || '';

  const where: Record<string, unknown> = {};
  if (q) {
    where.OR = [
      { name: { contains: q } },
      { slug: { contains: q } },
    ];
  }
  if (category) {
    where.category = category;
  }

  const products = await db.product.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { reviews: true } },
      images: {
        orderBy: { sortOrder: 'asc' },
        select: { id: true, url: true, colorName: true, sortOrder: true },
      },
      colors: { select: { id: true, name: true, hex: true } },
    },
  });

  return NextResponse.json({ products });
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

  const {
    name,
    slug,
    category,
    gender,
    price,
    originalPrice,
    image,
    description,
    video,
    isNew,
    isBestSeller,
    sizes,
    colors,
    images,
  } = body as Record<string, unknown>;

  if (!name || !slug || !category || price == null || !image || !description) {
    return NextResponse.json(
      { error: 'Faltan campos obligatorios' },
      { status: 400 },
    );
  }

  // Ensure slug uniqueness
  const existing = await db.product.findUnique({ where: { slug: slug as string } });
  if (existing) {
    return NextResponse.json({ error: 'El slug ya existe' }, { status: 409 });
  }

  const validGenders = ['hombre', 'mujer'];
  const finalGender = gender && validGenders.includes(String(gender))
    ? String(gender)
    : 'hombre';

  const product = await db.product.create({
    data: {
      name: String(name),
      slug: String(slug),
      category: String(category),
      gender: finalGender,
      price: Number(price),
      originalPrice: originalPrice != null ? Number(originalPrice) : null,
      image: String(image),
      description: String(description),
      video: video ? String(video) : null,
      isNew: Boolean(isNew),
      isBestSeller: Boolean(isBestSeller),
      sizes: Array.isArray(sizes)
        ? { create: (sizes as string[]).map((label) => ({ label })) }
        : undefined,
      colors: Array.isArray(colors)
        ? {
            create: (colors as { name: string; hex: string }[]).map((c) => ({
              name: c.name,
              hex: c.hex,
            })),
          }
        : undefined,
      images: Array.isArray(images)
        ? {
            create: (images as { url: string; colorName?: string | null }[]).map(
              (img, i) => ({
                url: img.url,
                colorName: img.colorName ?? null,
                sortOrder: i,
              }),
            ),
          }
        : undefined,
    },
  });

  return NextResponse.json({ product }, { status: 201 });
}
