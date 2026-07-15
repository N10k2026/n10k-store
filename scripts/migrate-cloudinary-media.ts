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

const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes('--dry-run');

export function isCloudinaryUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  return /^https?:\/\/res\.cloudinary\.com\//.test(url);
}

export function isCloudinaryVideoUrl(url: string): boolean {
  const withoutQuery = url.split('?')[0];
  return /\/video\/upload\//.test(withoutQuery) || /\.(mp4|webm|mov)$/i.test(withoutQuery);
}

/** Cache URL remota → URL local, para no descargar el mismo archivo dos veces. */
const migrated = new Map<string, string>();
const failures: string[] = [];

async function migrateUrl(url: string): Promise<string | null> {
  const cached = migrated.get(url);
  if (cached) return cached;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buffer = Buffer.from(await res.arrayBuffer());

    const result = isCloudinaryVideoUrl(url)
      ? await optimizeVideo(buffer)
      : await optimizeImage(buffer);

    migrated.set(url, result.url);
    console.log(`  OK  ${url}\n      → ${result.url} (${(result.size / 1024).toFixed(0)} KB)`);
    return result.url;
  } catch (err) {
    failures.push(`${url}: ${err instanceof Error ? err.message : String(err)}`);
    console.error(`  FAIL ${url}`);
    return null;
  }
}

async function main() {
  console.log(DRY_RUN ? '=== DRY RUN (no se escribe en la DB) ===' : '=== Migrando media de Cloudinary ===');
  let updates = 0;

  // Product.image y Product.video
  const products = await prisma.product.findMany({
    select: { id: true, slug: true, image: true, video: true },
  });
  for (const p of products) {
    const data: { image?: string; video?: string } = {};
    if (isCloudinaryUrl(p.image)) {
      console.log(`Product ${p.slug} — image`);
      const local = DRY_RUN ? '(dry-run)' : await migrateUrl(p.image);
      if (local && !DRY_RUN) data.image = local;
    }
    if (isCloudinaryUrl(p.video)) {
      console.log(`Product ${p.slug} — video`);
      const local = DRY_RUN ? '(dry-run)' : await migrateUrl(p.video);
      if (local && !DRY_RUN) data.video = local;
    }
    if (Object.keys(data).length > 0) {
      await prisma.product.update({ where: { id: p.id }, data });
      updates++;
    }
  }

  // ProductImage.url
  const images = await prisma.productImage.findMany({
    select: { id: true, url: true },
  });
  for (const img of images) {
    if (!isCloudinaryUrl(img.url)) continue;
    console.log(`ProductImage ${img.id}`);
    const local = DRY_RUN ? null : await migrateUrl(img.url);
    if (local) {
      await prisma.productImage.update({ where: { id: img.id }, data: { url: local } });
      updates++;
    }
  }

  // Banner.imageUrl
  const banners = await prisma.banner.findMany({
    select: { id: true, title: true, imageUrl: true },
  });
  for (const b of banners) {
    if (!isCloudinaryUrl(b.imageUrl)) continue;
    console.log(`Banner "${b.title}"`);
    const local = DRY_RUN ? null : await migrateUrl(b.imageUrl);
    if (local) {
      await prisma.banner.update({ where: { id: b.id }, data: { imageUrl: local } });
      updates++;
    }
  }

  console.log(`\nFilas actualizadas: ${updates}`);
  console.log(`Archivos migrados: ${migrated.size}`);
  if (failures.length > 0) {
    console.error(`\nFALLOS (${failures.length}) — estas filas NO se tocaron:`);
    for (const f of failures) console.error(`  ${f}`);
    process.exitCode = 1;
  }
}

// Solo ejecutar main() cuando se invoca como script (no al importarlo en tests).
if (process.argv[1]?.includes('migrate-cloudinary-media')) {
  main()
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
