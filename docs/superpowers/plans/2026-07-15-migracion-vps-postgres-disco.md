# Plan de Migración: Vercel + Cloudinary → VPS con PostgreSQL local e imágenes en disco

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminar Cloudinary por completo, servir media desde disco del servidor, y dejar el proyecto listo para desplegar en un VPS con PostgreSQL local.

**Architecture:** El pipeline local ya existe (`src/lib/media-optimizer.ts` escribe WebP/MP4 con nombre content-hash en `public/uploads/`; `src/lib/orphan-cleanup.ts` limpia huérfanos y ya está conectado a los deletes de admin). La migración consiste en: (1) reconectar las 2 rutas de upload a ese pipeline, (2) borrar todo rastro de Cloudinary, (3) script que descarga la media existente de Cloudinary y reescribe URLs en la DB, (4) limpiar supuestos serverless/SQLite, (5) baseline de migraciones Prisma + runbook de deploy (Caddy + systemd + Postgres).

**Tech Stack:** Next.js 16 (output standalone), Prisma 6 + PostgreSQL, sharp, ffmpeg, Bun (lockfile `bun.lock`), Caddy, systemd, vitest (nuevo, solo para libs/scripts).

## Global Constraints

- Gestor de paquetes: **bun** (`bun add`, `bun run`, `bunx`) — existe `bun.lock`, no crear `package-lock.json`.
- Alias de imports: `@/` → `src/` (ver `tsconfig.json`).
- El shape de respuesta JSON de los endpoints de upload debe conservar los campos que consume `src/components/admin/MediaUploader.tsx`: `url`, `size`, `originalSize`, `reductionPercent` (el campo `publicId` puede desaparecer — nadie lo lee).
- Mensajes de error de API en español (patrón existente).
- No tocar `src/lib/orphan-cleanup.ts` ni las rutas de delete de products/banners — ya operan sobre disco local correctamente.
- `ffmpeg` debe estar instalado en dev y en el VPS (`sudo apt install -y ffmpeg`) para uploads de video.
- Cada tarea termina con `bun run typecheck` limpio y commit.
- Requiere PostgreSQL local accesible antes de la Task 1 (instrucciones incluidas).

---

### Task 1: PostgreSQL local + baseline de migraciones Prisma

El proyecto usa `prisma db push` sin historial de migraciones. Para el VPS necesitamos `prisma/migrations/` versionado y `prisma migrate deploy` en cada deploy.

**Files:**
- Create: `prisma/migrations/<timestamp>_init/migration.sql` (generado por Prisma, se commitea)
- Create: `.env.example`
- Modify: `.env` (local, NO se commitea — ver paso 6)

**Interfaces:**
- Produces: DB PostgreSQL local funcionando con schema + seed; carpeta `prisma/migrations/` que Tasks 5 y 7 asumen existente.

- [ ] **Step 1: Instalar y preparar PostgreSQL local (si no existe)**

```bash
sudo apt install -y postgresql
sudo -u postgres psql -c "CREATE USER n10k WITH PASSWORD 'n10k_dev_password';"
sudo -u postgres psql -c "CREATE DATABASE n10k_store OWNER n10k;"
```

Verificar: `psql postgresql://n10k:n10k_dev_password@localhost:5432/n10k_store -c 'SELECT 1;'` → devuelve `1`.

- [ ] **Step 2: Apuntar `.env` a Postgres local**

Reemplazar el contenido completo de `.env` (hoy apunta a un SQLite huérfano de sandbox):

```bash
DATABASE_URL=postgresql://n10k:n10k_dev_password@localhost:5432/n10k_store
```

- [ ] **Step 3: Generar migración baseline**

```bash
bunx prisma migrate dev --name init
```

Expected: crea `prisma/migrations/<timestamp>_init/migration.sql` con `CREATE TABLE "Product"...` etc. y aplica el schema a la DB local. Verificar que el SQL contiene las 10 tablas del schema (`Product`, `ProductImage`, `ProductColor`, `ProductSize`, `NewsletterSubscriber`, `Review`, `AdminUser`, `Order`, `SiteSetting`, `Banner`).

- [ ] **Step 4: Seed**

```bash
bun run db:seed
```

Expected: "Seeding catalog from static-products..." y termina sin error. Verificar: `psql "$DATABASE_URL" -c 'SELECT count(*) FROM "Product";'` → count > 0.

- [ ] **Step 5: Crear `.env.example`**

```bash
# PostgreSQL local (VPS o dev)
DATABASE_URL=postgresql://n10k:CHANGE_ME@localhost:5432/n10k_store

# Fallback a catálogo estático si la DB no responde (default: solo en dev)
# ALLOW_STATIC_CATALOG_FALLBACK=false
```

- [ ] **Step 6: Sacar `.env` del control de versiones**

`.env` está trackeado en git (contiene la URL SQLite del sandbox anterior) aunque `.gitignore` ya tiene `.env*`:

```bash
git rm --cached .env
```

- [ ] **Step 7: Commit**

```bash
git add prisma/migrations .env.example .gitignore
git commit -m "feat: baseline de migraciones Prisma para PostgreSQL local"
```

---

### Task 2: Upload de imágenes a disco local (+ setup vitest)

**Files:**
- Modify: `src/app/api/admin/upload/image/route.ts`
- Create: `vitest.config.ts`
- Create: `tests/lib/media-optimizer.test.ts`
- Modify: `package.json` (devDependency `vitest`, script `test`)

**Interfaces:**
- Consumes: `optimizeImage(buffer: Buffer, options?: ImageOptimizeOptions): Promise<OptimizedMediaResult>` de `@/lib/media-optimizer` (ya existe; `OptimizedMediaResult = { url, filePath, size, originalSize, reductionPercent, mimeType }`).
- Produces: `POST /api/admin/upload/image` responde `{ success: true, url: "/uploads/images/<hash>.webp", size, originalSize, reductionPercent, mimeType: "image/webp" }`. La Task 5 (script de migración) reutiliza `optimizeImage` tal cual.

- [ ] **Step 1: Instalar vitest y añadir script**

```bash
bun add -d vitest
```

En `package.json`, añadir a `scripts`:

```json
"test": "vitest run"
```

- [ ] **Step 2: Crear `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
```

- [ ] **Step 3: Escribir test (falla no aplica aquí — `optimizeImage` ya existe; el test fija el contrato que la ruta va a usar)**

Crear `tests/lib/media-optimizer.test.ts`:

```ts
import { describe, it, expect, afterAll } from 'vitest';
import sharp from 'sharp';
import { existsSync } from 'fs';
import { rm } from 'fs/promises';
import { optimizeImage } from '@/lib/media-optimizer';

const createdFiles: string[] = [];

afterAll(async () => {
  for (const f of createdFiles) {
    await rm(f, { force: true });
  }
});

describe('optimizeImage', () => {
  async function makePng(width = 1600, height = 900): Promise<Buffer> {
    return sharp({
      create: { width, height, channels: 3, background: { r: 200, g: 30, b: 40 } },
    })
      .png()
      .toBuffer();
  }

  it('escribe un WebP bajo public/uploads/images con nombre content-hash', async () => {
    const input = await makePng();
    const result = await optimizeImage(input);
    createdFiles.push(result.filePath);

    expect(result.url).toMatch(/^\/uploads\/images\/[a-f0-9]{16}\.webp$/);
    expect(result.mimeType).toBe('image/webp');
    expect(existsSync(result.filePath)).toBe(true);

    const meta = await sharp(result.filePath).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.width).toBeLessThanOrEqual(1200);
  });

  it('mismo contenido produce misma URL (idempotente)', async () => {
    const input = await makePng(800, 600);
    const first = await optimizeImage(input);
    createdFiles.push(first.filePath);
    const second = await optimizeImage(input);

    expect(second.url).toBe(first.url);
    expect(second.filePath).toBe(first.filePath);
  });
});
```

- [ ] **Step 4: Ejecutar tests**

Run: `bun run test`
Expected: 2 passed.

- [ ] **Step 5: Reescribir la ruta de upload de imagen**

Reemplazar el contenido completo de `src/app/api/admin/upload/image/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/admin-auth';
import { applyRateLimit } from '@/lib/rate-limit';
import { optimizeImage, isAllowedImageType, MAX_IMAGE_SIZE } from '@/lib/media-optimizer';

export async function POST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const limited = applyRateLimit(req, 'admin-upload-image', 30, 5 * 60 * 1000);
  if (!limited.ok) {
    return NextResponse.json(
      { error: 'Demasiadas subidas. Espera unos minutos.' },
      { status: 429 },
    );
  }

  const formData = await req.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'No se encontró el archivo' }, { status: 400 });
  }

  if (!isAllowedImageType(file.type)) {
    return NextResponse.json(
      { error: `Tipo no permitido: ${file.type}. Permitidos: JPEG, PNG, WebP, AVIF, GIF.` },
      { status: 400 },
    );
  }

  if (file.size > MAX_IMAGE_SIZE) {
    return NextResponse.json(
      { error: `Archivo demasiado grande: ${(file.size / 1024 / 1024).toFixed(1)}MB. Máximo: ${MAX_IMAGE_SIZE / 1024 / 1024}MB.` },
      { status: 400 },
    );
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await optimizeImage(buffer);

    return NextResponse.json({
      success: true,
      url: result.url,
      size: result.size,
      originalSize: result.originalSize,
      reductionPercent: result.reductionPercent,
      mimeType: result.mimeType,
    });
  } catch (err) {
    console.error('Image upload error:', err);
    return NextResponse.json({ error: 'Error al procesar la imagen' }, { status: 500 });
  }
}
```

- [ ] **Step 6: Verificar typecheck y tests**

Run: `bun run typecheck && bun run test`
Expected: sin errores, 2 tests passed.

- [ ] **Step 7: Verificación manual end-to-end**

```bash
bun run dev
```

En el navegador: `http://localhost:3000/admin` → login (`admin` / `admin123` si es el seed) → editar un producto → subir una imagen JPEG.

Expected: toast "Imagen optimizada: X MB → Y KB (-Z%)", la imagen se ve en el preview, y existe un archivo nuevo en `public/uploads/images/<hash>.webp`. Verificar en la pestaña Network que la respuesta tiene `url: "/uploads/images/..."`.

- [ ] **Step 8: Commit**

```bash
git add src/app/api/admin/upload/image/route.ts vitest.config.ts tests/ package.json bun.lock
git commit -m "feat: upload de imágenes a disco local con sharp (reemplaza Cloudinary)"
```

---

### Task 3: Upload de videos a disco local

**Files:**
- Modify: `src/app/api/admin/upload/video/route.ts`

**Interfaces:**
- Consumes: `optimizeVideo(buffer: Buffer, options?: VideoOptimizeOptions): Promise<OptimizedMediaResult>` de `@/lib/media-optimizer` (ya existe; requiere `ffmpeg` en PATH).
- Produces: `POST /api/admin/upload/video` responde `{ success: true, url: "/uploads/videos/<hash>.mp4", size, originalSize, reductionPercent, mimeType: "video/mp4" }`.

- [ ] **Step 1: Verificar ffmpeg instalado**

Run: `ffmpeg -version | head -1`
Expected: `ffmpeg version ...`. Si falla: `sudo apt install -y ffmpeg`.

- [ ] **Step 2: Reescribir la ruta de upload de video**

Reemplazar el contenido completo de `src/app/api/admin/upload/video/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/admin-auth';
import { applyRateLimit } from '@/lib/rate-limit';
import { optimizeVideo, isAllowedVideoType, MAX_VIDEO_SIZE } from '@/lib/media-optimizer';

export async function POST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const limited = applyRateLimit(req, 'admin-upload-video', 10, 10 * 60 * 1000);
  if (!limited.ok) {
    return NextResponse.json(
      { error: 'Demasiadas subidas de video. Espera unos minutos.' },
      { status: 429 },
    );
  }

  const formData = await req.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'No se encontró el archivo' }, { status: 400 });
  }

  if (!isAllowedVideoType(file.type)) {
    return NextResponse.json(
      { error: `Tipo de video no permitido: ${file.type}. Permitidos: MP4, WebM, MOV, AVI.` },
      { status: 400 },
    );
  }

  if (file.size > MAX_VIDEO_SIZE) {
    return NextResponse.json(
      { error: `Video demasiado grande: ${(file.size / 1024 / 1024).toFixed(1)}MB. Máximo: ${MAX_VIDEO_SIZE / 1024 / 1024}MB.` },
      { status: 400 },
    );
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await optimizeVideo(buffer);

    return NextResponse.json({
      success: true,
      url: result.url,
      size: result.size,
      originalSize: result.originalSize,
      reductionPercent: result.reductionPercent,
      mimeType: result.mimeType,
    });
  } catch (err) {
    console.error('Video upload error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? `Error: ${err.message}` : 'Error al procesar el video' },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 3: Verificar typecheck**

Run: `bun run typecheck`
Expected: sin errores.

- [ ] **Step 4: Verificación manual**

Con `bun run dev` corriendo: en el panel admin, subir un MP4 corto a un producto.
Expected: toast de éxito, archivo nuevo en `public/uploads/videos/<hash>.mp4`, y el video reproduce en el preview.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/admin/upload/video/route.ts
git commit -m "feat: upload de videos a disco local con ffmpeg (reemplaza Cloudinary)"
```

---

### Task 4: Eliminar Cloudinary por completo

**Files:**
- Delete: `src/lib/cloudinary.ts`
- Modify: `package.json` (quitar dependencia `cloudinary`)

**Interfaces:**
- Consumes: Tasks 2 y 3 completadas (ya nadie importa `@/lib/cloudinary`).
- Produces: cero referencias a Cloudinary en el código.

- [ ] **Step 1: Verificar que no quedan imports**

Run: `grep -rn "cloudinary" src --include="*.ts" --include="*.tsx" -il`
Expected: solo `src/lib/cloudinary.ts` (el archivo a borrar). Si aparece otro archivo, arreglarlo antes de seguir.

- [ ] **Step 2: Borrar archivo y dependencia**

```bash
git rm src/lib/cloudinary.ts
bun remove cloudinary
```

- [ ] **Step 3: Verificar build completo**

Run: `bun run typecheck && bun run test && bun run build`
Expected: todo pasa. El build es la verificación fuerte — si algo importaba Cloudinary, revienta aquí.

- [ ] **Step 4: Commit**

```bash
git add package.json bun.lock
git commit -m "feat: eliminar Cloudinary (SDK, lib y dependencia)"
```

Nota: las env vars `CLOUDINARY_*` solo existen en Vercel — no hay nada que borrar en el repo. Al dar de baja Vercel desaparecen. **No cancelar la cuenta de Cloudinary hasta completar la Task 5** (el script necesita descargar la media).

---

### Task 5: Script de migración de media Cloudinary → disco

Las URLs `https://res.cloudinary.com/...` guardadas en la DB de producción deben descargarse, optimizarse a disco y reescribirse en las filas (`Product.image`, `Product.video`, `ProductImage.url`, `Banner.imageUrl`).

**Files:**
- Create: `scripts/migrate-cloudinary-media.ts`
- Create: `tests/scripts/migrate-cloudinary-media.test.ts`
- Modify: `package.json` (script `media:migrate`)

**Interfaces:**
- Consumes: `optimizeImage` / `optimizeVideo` de `src/lib/media-optimizer` (import relativo `../src/lib/media-optimizer` — el script corre con tsx fuera del alias `@/`).
- Produces: comando `bun run media:migrate [--dry-run]` idempotente. Exporta `isCloudinaryUrl(url)` y `isCloudinaryVideoUrl(url)` (usadas solo por el test).

- [ ] **Step 1: Escribir el test de los helpers**

Crear `tests/scripts/migrate-cloudinary-media.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { isCloudinaryUrl, isCloudinaryVideoUrl } from '../../scripts/migrate-cloudinary-media';

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
```

- [ ] **Step 2: Ejecutar test para verificar que falla**

Run: `bun run test`
Expected: FAIL — `Cannot find module '../../scripts/migrate-cloudinary-media'` (o similar).

- [ ] **Step 3: Escribir el script**

Crear `scripts/migrate-cloudinary-media.ts`:

```ts
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
```

En `package.json`, añadir a `scripts`:

```json
"media:migrate": "npx tsx scripts/migrate-cloudinary-media.ts"
```

- [ ] **Step 4: Ejecutar tests**

Run: `bun run test`
Expected: todos passed (los 2 suites).

- [ ] **Step 5: Probar dry-run contra la DB local**

Run: `bun run media:migrate --dry-run`
Expected: "=== DRY RUN ===" y "Filas actualizadas: 0" (la DB local seedeada solo tiene rutas `/products/...`, no Cloudinary). Esto valida que el script no toca URLs locales.

- [ ] **Step 6: Commit**

```bash
git add scripts/migrate-cloudinary-media.ts tests/scripts/ package.json
git commit -m "feat: script de migración de media Cloudinary a disco local"
```

Nota: la DB del VPS nace de cero (seed estático, sin URLs Cloudinary), así que este script no se ejecuta en el cutover — queda como red de seguridad por si más adelante se importan datos con URLs `res.cloudinary.com`. En ese caso, ejecutarlo ANTES de cancelar Cloudinary.

---

### Task 6: Limpiar supuestos serverless/SQLite

**Files:**
- Modify: `src/lib/db-init.ts`
- Modify: `src/lib/catalog-fallback.ts`
- Delete: `vercel.json`, `start-dev.sh`

**Interfaces:**
- Consumes: nada nuevo.
- Produces: `ensureDatabase()` conserva su firma (`(): Promise<void>`) — los consumidores (`src/app/api/products/route.ts`, `src/app/api/admin/login/route.ts`, etc.) no cambian. `isStaticCatalogFallbackEnabled()` conserva su firma.

- [ ] **Step 1: Quitar el `db push` en runtime de `db-init.ts`**

En `src/lib/db-init.ts`:

1. Borrar los imports de `exec`/`promisify` y la constante `execAsync`:

```ts
// BORRAR estas líneas:
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
```

2. Borrar la función `runDbPush()` completa (incluye el default SQLite `file:/home/z/my-project/db/custom.db`).

3. En `ensureDatabase()`, reemplazar el bloque que hacía push:

```ts
      // If both checks failed (tables don't exist), push the schema first.
      if (!hasProds && !hasAdminUser) {
        // Try a direct query to see if it's a "table doesn't exist" error
        try {
          await db.product.count();
        } catch {
          console.log('[ensureDatabase] Database schema missing — running db push...');
          await runDbPush();
          // Re-check after schema creation
          [hasProds, hasAdminUser] = await Promise.all([hasProducts(), hasAdmin()]);
        }
      }
```

por:

```ts
      // If both checks failed, the schema itself may be missing. Schema
      // creation is a deploy-time concern now (prisma migrate deploy) —
      // never mutate the schema from request handlers.
      if (!hasProds && !hasAdminUser) {
        try {
          await db.product.count();
        } catch (err) {
          throw new Error(
            '[ensureDatabase] El schema de la base de datos no existe. Ejecuta: bunx prisma migrate deploy',
            { cause: err },
          );
        }
      }
```

El auto-seed de productos/admin cuando la DB está vacía se mantiene — sigue siendo útil en el primer arranque del VPS.

- [ ] **Step 2: Quitar la heurística SQLite de `catalog-fallback.ts`**

En `src/lib/catalog-fallback.ts`, reemplazar:

```ts
export function isStaticCatalogFallbackEnabled(): boolean {
  if (process.env.ALLOW_STATIC_CATALOG_FALLBACK === 'true') return true;
  if (process.env.ALLOW_STATIC_CATALOG_FALLBACK === 'false') return false;
  if (process.env.NODE_ENV !== 'production') return true;
  // SQLite file URLs cannot work on serverless hosts (e.g. Vercel).
  const url = process.env.DATABASE_URL?.trim() ?? '';
  if (!url || url.startsWith('file:')) return true;
  return false;
}
```

por:

```ts
export function isStaticCatalogFallbackEnabled(): boolean {
  if (process.env.ALLOW_STATIC_CATALOG_FALLBACK === 'true') return true;
  if (process.env.ALLOW_STATIC_CATALOG_FALLBACK === 'false') return false;
  // In production (VPS + local PostgreSQL) the DB is the source of truth;
  // fall back to the static catalog only in development.
  return process.env.NODE_ENV !== 'production';
}
```

(Los mensajes SQLite de `isDatabaseUnavailableError` pueden quedarse — son inofensivos y la función también cubre códigos Prisma de Postgres.)

- [ ] **Step 3: Borrar artefactos de Vercel/sandbox**

```bash
git rm vercel.json start-dev.sh
```

- [ ] **Step 4: Verificar**

Run: `bun run typecheck && bun run test && bun run build`
Expected: todo pasa.

- [ ] **Step 5: Verificación manual del arranque limpio**

```bash
bun run dev
```

Abrir `http://localhost:3000` — el catálogo carga desde Postgres (no desde fallback). Parar el servidor.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: eliminar supuestos serverless/SQLite (db push en runtime, fallback file:, vercel.json)"
```

---

### Task 7: Infraestructura de deploy en VPS (Caddy + systemd + runbook)

`output: 'standalone'` significa que `next build` genera `.next/standalone/server.js`, pero `public/` y `.next/static/` deben copiarse a mano. Los uploads deben vivir FUERA del árbol de deploy (en `/var/lib/n10k-store/uploads`) para sobrevivir a cada release; se enlazan con symlink. `media-optimizer.ts` escribe en `process.cwd()/public/uploads` — con el symlink, eso aterriza en el volumen persistente sin tocar código.

**Files:**
- Create: `deploy/Caddyfile`
- Create: `deploy/n10k-store.service`
- Create: `deploy/deploy.sh`
- Create: `docs/deploy/VPS.md`

**Interfaces:**
- Consumes: `prisma/migrations/` (Task 1), script `media:migrate` (Task 5).
- Produces: runbook completo de provisión + cutover.

- [ ] **Step 1: Crear `deploy/Caddyfile`**

```
# Reemplaza tienda.example.com por el dominio real.
# Caddy gestiona TLS (Let's Encrypt) automáticamente.
tienda.example.com {
	encode zstd gzip

	# Estáticos servidos directo desde disco (sin pasar por Node).
	# /uploads es un symlink a /var/lib/n10k-store/uploads.
	@static path /uploads/* /products/* /brand/* /banners/* /video/* /videos/* /logo.svg /favicon.ico /favicon-16x16.png /favicon-32x32.png /apple-touch-icon.png /manifest.json /robots.txt /pattern-n10k.png
	handle @static {
		root * /srv/n10k-store/current/public
		header /uploads/* Cache-Control "public, max-age=31536000, immutable"
		header /brand/* Cache-Control "public, max-age=31536000, immutable"
		header /products/* Cache-Control "public, max-age=3600, stale-while-revalidate=86400"
		file_server
	}

	# Todo lo demás → Next.js standalone
	handle {
		reverse_proxy localhost:3000
	}
}
```

- [ ] **Step 2: Crear `deploy/n10k-store.service`**

```ini
[Unit]
Description=n10k-store (Next.js standalone)
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
User=n10k
WorkingDirectory=/srv/n10k-store/current
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=HOSTNAME=127.0.0.1
EnvironmentFile=/etc/n10k-store/env
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

- [ ] **Step 3: Crear `deploy/deploy.sh`**

```bash
#!/usr/bin/env bash
# Deploy de n10k-store al VPS. Ejecutar EN el VPS, en el checkout del repo.
# Requisitos: node, bun, ffmpeg, postgresql corriendo, /etc/n10k-store/env con DATABASE_URL.
set -euo pipefail

APP_DIR=/srv/n10k-store
UPLOADS_DIR=/var/lib/n10k-store/uploads
RELEASE="$APP_DIR/releases/$(date +%Y%m%d%H%M%S)"
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"

cd "$REPO_DIR"

echo "==> Instalando dependencias"
bun install --frozen-lockfile

echo "==> Aplicando migraciones"
set -a; source /etc/n10k-store/env; set +a
bunx prisma migrate deploy

echo "==> Build"
bun run build

echo "==> Armando release en $RELEASE"
mkdir -p "$RELEASE" "$UPLOADS_DIR/images" "$UPLOADS_DIR/videos"
cp -r .next/standalone/. "$RELEASE/"
mkdir -p "$RELEASE/.next"
cp -r .next/static "$RELEASE/.next/static"
cp -r public "$RELEASE/public"
# Uploads persistentes: reemplazar el dir copiado por symlink al volumen.
rm -rf "$RELEASE/public/uploads"
ln -s "$UPLOADS_DIR" "$RELEASE/public/uploads"

echo "==> Activando release"
ln -sfn "$RELEASE" "$APP_DIR/current"
sudo systemctl restart n10k-store

echo "==> Limpiando releases viejas (conservar 3)"
ls -1dt "$APP_DIR"/releases/* | tail -n +4 | xargs -r rm -rf

echo "==> Listo. Verificar: curl -sI http://localhost:3000 | head -1"
```

- [ ] **Step 4: Crear `docs/deploy/VPS.md`**

````markdown
# Runbook: VPS n10k-store

## 1. Provisión (una vez)

```bash
# Paquetes
sudo apt update
sudo apt install -y postgresql caddy ffmpeg curl
curl -fsSL https://bun.sh/install | bash          # bun
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs

# Usuario y directorios
sudo useradd -r -m -s /bin/bash n10k
sudo mkdir -p /srv/n10k-store/releases /var/lib/n10k-store/uploads/{images,videos} /etc/n10k-store
sudo chown -R n10k:n10k /srv/n10k-store /var/lib/n10k-store

# PostgreSQL
sudo -u postgres psql -c "CREATE USER n10k WITH PASSWORD '<PASSWORD_FUERTE>';"
sudo -u postgres psql -c "CREATE DATABASE n10k_store OWNER n10k;"

# Entorno de la app
sudo tee /etc/n10k-store/env >/dev/null <<'EOF'
DATABASE_URL=postgresql://n10k:<PASSWORD_FUERTE>@localhost:5432/n10k_store
EOF
sudo chmod 600 /etc/n10k-store/env

# systemd + Caddy
sudo cp deploy/n10k-store.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable n10k-store
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile   # editar dominio real antes
sudo systemctl reload caddy
```

## 2. Puesta en marcha (cutover, una vez)

La DB del VPS nace de cero: `prisma migrate deploy` sobre la base vacía
(sin baselining) + seed del catálogo estático.

1. **Deploy inicial:** `bash deploy/deploy.sh` — aplica las migraciones sobre
   la DB vacía, hace el build y arranca el servicio.
2. **Seed del catálogo:** desde el checkout del repo en el VPS:
   ```bash
   set -a; source /etc/n10k-store/env; set +a
   bun run db:seed
   ```
   (Alternativa: `ensureDatabase` auto-seedea productos y admin en el primer
   request si la DB está vacía.)
3. **Smoke test:** catálogo carga, imágenes de producto responden 200,
   subir una imagen nueva desde el admin funciona y aterriza en
   `/var/lib/n10k-store/uploads/images/`.
4. **Apagar lo viejo:** apuntar el DNS al VPS, borrar el proyecto de Vercel,
   cancelar Cloudinary.

**Red de seguridad:** si más adelante importas datos que contengan URLs
`res.cloudinary.com` (p.ej. un dump de la producción vieja), migra su media
a disco ANTES de cancelar Cloudinary:
```bash
bun run media:migrate --dry-run   # revisar el reporte
bun run media:migrate             # descargar, optimizar y reescribir URLs
```
Verificar después: `psql "$DATABASE_URL" -c "SELECT count(*) FROM \"Product\" WHERE image LIKE '%cloudinary%';"` → 0
(repetir para `ProductImage.url`, `Product.video`, `Banner.imageUrl`).

## 3. Deploys siguientes

```bash
git pull && bash deploy/deploy.sh
```

## 4. Backups

```bash
# Cron diario sugerido (crontab del usuario n10k):
# 0 4 * * * pg_dump "$DATABASE_URL" -Fc -f /var/backups/n10k-$(date +\%u).dump && rsync -a /var/lib/n10k-store/uploads /var/backups/uploads/
```
La DB y `/var/lib/n10k-store/uploads` son el estado completo de la app.
````

- [ ] **Step 5: Hacer ejecutable y commit**

```bash
chmod +x deploy/deploy.sh
git add deploy/ docs/deploy/
git commit -m "feat: infraestructura de deploy VPS (Caddy, systemd, deploy.sh, runbook)"
```

---

## Verificación final (post-plan)

- [ ] `grep -ri cloudinary src package.json` → sin resultados
- [ ] `bun run typecheck && bun run test && bun run build` → verde
- [ ] Flujo admin completo en dev: crear producto con imagen + video, editarlo reemplazando la imagen (el archivo viejo desaparece de `public/uploads/` vía `deleteUploadByUrl`), borrarlo (archivos limpiados)
- [ ] `bun run media:migrate --dry-run` contra copia de la DB de producción → reporte coherente antes del cutover real
