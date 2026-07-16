/**
 * Migra la media alojada en Cloudinary a disco local.
 *
 * Recorre Product.image, Product.video, ProductImage.url y Banner.imageUrl;
 * para cada URL res.cloudinary.com descarga el archivo, lo optimiza con el
 * pipeline local (sharp/ffmpeg → public/uploads/) y actualiza la fila.
 *
 * Idempotente: las URLs ya locales se saltan; re-ejecutar es seguro.
 *
 * Uso:
 *   bun run media:migrate --dry-run   # solo reporta, no toca la DB
 *   bun run media:migrate             # migra de verdad
 */
import { PrismaClient } from '@prisma/client';
import { optimizeImage, optimizeVideo } from '../src/lib/media-optimizer';

export function isCloudinaryUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  return /^https?:\/\/res\.cloudinary\.com\//.test(url);
}

export function isCloudinaryVideoUrl(url: string): boolean {
  const withoutQuery = url.split('?')[0];
  return /\/video\/upload\//.test(withoutQuery) || /\.(mp4|webm|mov)$/i.test(withoutQuery);
}

/**
 * Dependencias inyectables de la migración. En producción son PrismaClient,
 * el `fetch` global y el pipeline local; en tests se sustituyen por mocks para
 * ejercitar el flujo DB/descarga/reescritura sin red ni ffmpeg reales.
 */
export interface MigrateDeps {
  prisma: Pick<PrismaClient, 'product' | 'productImage' | 'banner'>;
  fetchFn: typeof fetch;
  optimizeImage: (buffer: Buffer) => Promise<{ url: string; size: number }>;
  optimizeVideo: (buffer: Buffer) => Promise<{ url: string; size: number }>;
  dryRun: boolean;
  log?: (msg: string) => void;
  error?: (msg: string) => void;
}

export interface MigrateResult {
  updates: number;
  migratedCount: number;
  failures: string[];
}

async function migrateUrl(
  url: string,
  deps: MigrateDeps,
  cache: Map<string, string>,
  failures: string[],
): Promise<string | null> {
  const cached = cache.get(url);
  if (cached) return cached;

  const log = deps.log ?? (() => {});
  const error = deps.error ?? (() => {});
  try {
    const res = await deps.fetchFn(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buffer = Buffer.from(await res.arrayBuffer());

    const result = isCloudinaryVideoUrl(url)
      ? await deps.optimizeVideo(buffer)
      : await deps.optimizeImage(buffer);

    cache.set(url, result.url);
    log(`  OK  ${url}\n      → ${result.url} (${(result.size / 1024).toFixed(0)} KB)`);
    return result.url;
  } catch (err) {
    failures.push(`${url}: ${err instanceof Error ? err.message : String(err)}`);
    error(`  FAIL ${url}`);
    return null;
  }
}

/**
 * Ejecuta la migración completa contra las dependencias dadas. No toca
 * `process` ni `console`; devuelve el resultado para que el caller decida el
 * exit code y el logging.
 */
export async function runMigration(deps: MigrateDeps): Promise<MigrateResult> {
  const log = deps.log ?? (() => {});
  const error = deps.error ?? (() => {});
  const cache = new Map<string, string>();
  const failures: string[] = [];
  let updates = 0;

  log(deps.dryRun ? '=== DRY RUN (no se escribe en la DB) ===' : '=== Migrando media de Cloudinary ===');

  // Product.image y Product.video
  const products = await deps.prisma.product.findMany({
    select: { id: true, slug: true, image: true, video: true },
  });
  for (const p of products) {
    const data: { image?: string; video?: string } = {};
    if (isCloudinaryUrl(p.image)) {
      log(`Product ${p.slug} — image`);
      const local = deps.dryRun ? null : await migrateUrl(p.image, deps, cache, failures);
      if (local) data.image = local;
    }
    if (isCloudinaryUrl(p.video)) {
      log(`Product ${p.slug} — video`);
      const local = deps.dryRun ? null : await migrateUrl(p.video, deps, cache, failures);
      if (local) data.video = local;
    }
    if (Object.keys(data).length > 0) {
      await deps.prisma.product.update({ where: { id: p.id }, data });
      updates++;
    }
  }

  // ProductImage.url
  const images = await deps.prisma.productImage.findMany({
    select: { id: true, url: true },
  });
  for (const img of images) {
    if (!isCloudinaryUrl(img.url)) continue;
    log(`ProductImage ${img.id}`);
    const local = deps.dryRun ? null : await migrateUrl(img.url, deps, cache, failures);
    if (local) {
      await deps.prisma.productImage.update({ where: { id: img.id }, data: { url: local } });
      updates++;
    }
  }

  // Banner.imageUrl
  const banners = await deps.prisma.banner.findMany({
    select: { id: true, title: true, imageUrl: true },
  });
  for (const b of banners) {
    if (!isCloudinaryUrl(b.imageUrl)) continue;
    log(`Banner "${b.title}"`);
    const local = deps.dryRun ? null : await migrateUrl(b.imageUrl, deps, cache, failures);
    if (local) {
      await deps.prisma.banner.update({ where: { id: b.id }, data: { imageUrl: local } });
      updates++;
    }
  }

  log(`\nFilas actualizadas: ${updates}`);
  log(`Archivos migrados: ${cache.size}`);
  if (failures.length > 0) {
    error(`\nFALLOS (${failures.length}) — estas filas NO se tocaron:`);
    for (const f of failures) error(`  ${f}`);
  }

  return { updates, migratedCount: cache.size, failures };
}

// Solo ejecutar como script (no al importarlo en tests).
if (process.argv[1]?.includes('migrate-cloudinary-media')) {
  const prisma = new PrismaClient();
  runMigration({
    prisma,
    fetchFn: fetch,
    optimizeImage: async (buf) => {
      const r = await optimizeImage(buf);
      return { url: r.url, size: r.size };
    },
    optimizeVideo: async (buf) => {
      const r = await optimizeVideo(buf);
      return { url: r.url, size: r.size };
    },
    dryRun: process.argv.includes('--dry-run'),
    log: (m) => console.log(m),
    error: (m) => console.error(m),
  })
    .then((result) => {
      if (result.failures.length > 0) process.exitCode = 1;
    })
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
