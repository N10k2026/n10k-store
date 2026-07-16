import { describe, it, expect, vi } from 'vitest';
import {
  isCloudinaryUrl,
  isCloudinaryVideoUrl,
  runMigration,
  type MigrateDeps,
} from '../../scripts/migrate-cloudinary-media';

describe('isCloudinaryUrl', () => {
  it('detecta URLs de Cloudinary', () => {
    expect(isCloudinaryUrl('https://res.cloudinary.com/demo/image/upload/v1/n10k/products/abc.webp')).toBe(true);
    expect(isCloudinaryUrl('http://res.cloudinary.com/demo/image/upload/abc.jpg')).toBe(true);
  });

  it('ignora URLs locales, externas y vacías', () => {
    expect(isCloudinaryUrl('/uploads/images/abc.webp')).toBe(false);
    expect(isCloudinaryUrl('/products/shorts-breeze/aguamarina-1.webp?v=20260620')).toBe(false);
    expect(isCloudinaryUrl('https://example.com/foto.jpg')).toBe(false);
    expect(isCloudinaryUrl(null)).toBe(false);
    expect(isCloudinaryUrl(undefined)).toBe(false);
    expect(isCloudinaryUrl('')).toBe(false);
  });
});

describe('isCloudinaryVideoUrl', () => {
  it('detecta videos por segmento de ruta o extensión', () => {
    expect(isCloudinaryVideoUrl('https://res.cloudinary.com/demo/video/upload/v1/n10k/videos/x.mp4')).toBe(true);
    expect(isCloudinaryVideoUrl('https://res.cloudinary.com/demo/image/upload/v1/x.webm')).toBe(true);
    expect(isCloudinaryVideoUrl('https://res.cloudinary.com/demo/image/upload/v1/x.webp')).toBe(false);
  });
});

// --- Test doubles para el flujo DB/descarga -----------------------------------

const IMG = 'https://res.cloudinary.com/demo/image/upload/v1/n10k/a.webp';
const VID = 'https://res.cloudinary.com/demo/video/upload/v1/n10k/b.mp4';
const LOCAL = '/products/shorts-breeze/aguamarina-1.webp?v=20260620';

function okResponse() {
  return {
    ok: true,
    status: 200,
    arrayBuffer: async () => new ArrayBuffer(8),
  } as unknown as Response;
}

/**
 * Prisma mockeado con datos en memoria. `update` muta el registro para que el
 * test pueda afirmar la reescritura de URLs end-to-end.
 */
function makePrisma(seed: {
  products?: Array<{ id: string; slug: string; image: string | null; video: string | null }>;
  productImages?: Array<{ id: string; url: string }>;
  banners?: Array<{ id: string; title: string; imageUrl: string | null }>;
}) {
  const products = seed.products ?? [];
  const productImages = seed.productImages ?? [];
  const banners = seed.banners ?? [];
  return {
    prisma: {
      product: {
        findMany: vi.fn(async () => products),
        update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, string> }) => {
          Object.assign(products.find((p) => p.id === where.id)!, data);
        }),
      },
      productImage: {
        findMany: vi.fn(async () => productImages),
        update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, string> }) => {
          Object.assign(productImages.find((i) => i.id === where.id)!, data);
        }),
      },
      banner: {
        findMany: vi.fn(async () => banners),
        update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, string> }) => {
          Object.assign(banners.find((b) => b.id === where.id)!, data);
        }),
      },
    },
    products,
    productImages,
    banners,
  };
}

function makeDeps(
  over: { prisma: unknown } & Partial<Omit<MigrateDeps, 'prisma'>>,
): MigrateDeps {
  const { prisma, ...rest } = over;
  return {
    prisma: prisma as MigrateDeps['prisma'],
    fetchFn: vi.fn(async () => okResponse()) as unknown as typeof fetch,
    optimizeImage: vi.fn(async () => ({ url: LOCAL, size: 12_000 })),
    optimizeVideo: vi.fn(async () => ({ url: '/uploads/videos/b.mp4', size: 34_000 })),
    dryRun: false,
    ...rest,
  };
}

describe('runMigration', () => {
  it('descarga, optimiza y reescribe todas las URLs de Cloudinary', async () => {
    const db = makePrisma({
      products: [
        { id: 'p1', slug: 'shorts', image: IMG, video: VID },
        { id: 'p2', slug: 'local-ya', image: LOCAL, video: null },
      ],
      productImages: [{ id: 'i1', url: IMG }],
      banners: [{ id: 'b1', title: 'Hero', imageUrl: IMG }],
    });
    const deps = makeDeps({ prisma: db.prisma });

    const result = await runMigration(deps);

    // p1 (image+video), i1, b1 → 3 filas; p2 ya era local, no se toca.
    expect(result.updates).toBe(3);
    expect(result.failures).toEqual([]);
    // URLs reescritas a disco local.
    expect(db.products[0].image).toBe(LOCAL);
    expect(db.products[0].video).toBe('/uploads/videos/b.mp4');
    expect(db.productImages[0].url).toBe(LOCAL);
    expect(db.banners[0].imageUrl).toBe(LOCAL);
    // El registro que ya era local quedó intacto y no gatilló update.
    expect(db.products[1].image).toBe(LOCAL);
    expect(db.prisma.product.update).toHaveBeenCalledTimes(1);
    // El video usó el pipeline de video, no el de imagen.
    expect(deps.optimizeVideo).toHaveBeenCalledTimes(1);
    // IMG aparece en p1.image, i1 y b1 pero la cache la optimiza una sola vez.
    expect(deps.optimizeImage).toHaveBeenCalledTimes(1);
    expect(result.migratedCount).toBe(2); // IMG + VID
  });

  it('cachea la misma URL remota y solo la descarga una vez', async () => {
    const db = makePrisma({
      products: [
        { id: 'p1', slug: 'a', image: IMG, video: null },
        { id: 'p2', slug: 'b', image: IMG, video: null },
      ],
    });
    const deps = makeDeps({ prisma: db.prisma });

    await runMigration(deps);

    expect(deps.fetchFn).toHaveBeenCalledTimes(1); // misma URL → una sola descarga
    expect(db.products[0].image).toBe(LOCAL);
    expect(db.products[1].image).toBe(LOCAL);
  });

  it('dry-run no escribe en la DB', async () => {
    const db = makePrisma({
      products: [{ id: 'p1', slug: 'a', image: IMG, video: null }],
    });
    const deps = makeDeps({ prisma: db.prisma, dryRun: true });

    const result = await runMigration(deps);

    expect(result.updates).toBe(0);
    expect(deps.fetchFn).not.toHaveBeenCalled();
    expect(db.prisma.product.update).not.toHaveBeenCalled();
    expect(db.products[0].image).toBe(IMG); // sin cambios
  });

  it('registra fallos de descarga y no toca esas filas', async () => {
    const db = makePrisma({
      products: [{ id: 'p1', slug: 'a', image: IMG, video: null }],
    });
    const deps = makeDeps({
      prisma: db.prisma,
      fetchFn: vi.fn(async () => ({ ok: false, status: 404 }) as unknown as Response) as unknown as typeof fetch,
    });

    const result = await runMigration(deps);

    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]).toContain('HTTP 404');
    expect(result.updates).toBe(0);
    expect(db.prisma.product.update).not.toHaveBeenCalled();
    expect(db.products[0].image).toBe(IMG); // fila intacta ante el fallo
  });
});
