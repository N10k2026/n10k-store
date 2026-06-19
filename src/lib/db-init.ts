/**
 * Database initialization guard — ensures the database is always in a usable
 * state when the server starts.
 *
 * Problem this solves: in sandbox/cloud environments, the SQLite database
 * file (db/custom.db) can be deleted when the environment resets. The dev
 * server's startup script runs `prisma db push` (creates tables) but does
 * NOT run `prisma db seed` (populates data). This leaves the server running
 * with an empty database — no products, no admin user — causing 500 errors
 * on every API call.
 *
 * Solution: this function runs lazily on the first API request. It checks:
 *   1. Can we connect to the database?
 *   2. Are there any products?
 *   3. Does an admin user exist?
 * If any check fails, it auto-seeds from static-products.ts and creates the
 * default admin. This ensures the server is ALWAYS usable, even after a
 * full filesystem reset.
 *
 * IMPORTANT: if the database already has data, this function does NOTHING —
 * it never overwrites user changes (hidden products, edits, etc.). It only
 * seeds when the database is empty or missing.
 */

import { db } from '@/lib/db';
import { staticProducts } from '@/lib/static-products';
import { hashPassword } from '@/lib/admin-session';
import { devError } from '@/lib/dev-log';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);

let initialized = false;
let initPromise: Promise<void> | null = null;

/** Run `prisma db push` as a subprocess to create the schema. */
async function runDbPush(): Promise<void> {
  const cwd = process.cwd();
  const env = { ...process.env, DATABASE_URL: process.env.DATABASE_URL || 'file:/home/z/my-project/db/custom.db' };
  try {
    await execAsync('npx prisma db push --skip-generate', { cwd, env, timeout: 30000 });
    console.log('[ensureDatabase] Schema pushed successfully.');
  } catch (err) {
    devError('[ensureDatabase] Failed to push schema:', err);
    throw err;
  }
}

/** Check if the database has at least 1 product. */
async function hasProducts(): Promise<boolean> {
  try {
    const count = await db.product.count();
    return count > 0;
  } catch {
    // Table might not exist — database needs to be initialized
    return false;
  }
}

/** Check if an admin user exists. */
async function hasAdmin(): Promise<boolean> {
  try {
    const count = await db.adminUser.count();
    return count > 0;
  } catch {
    return false;
  }
}

/** Seed products from static-products.ts (only if the DB is empty). */
async function seedProducts(): Promise<void> {
  for (let index = 0; index < staticProducts.length; index++) {
    const p = staticProducts[index];

    await db.product.upsert({
      where: { slug: p.slug },
      create: {
        id: p.id,
        name: p.name,
        slug: p.slug,
        category: p.category,
        gender: p.gender ?? 'hombre',
        price: p.price,
        originalPrice: p.originalPrice ?? null,
        image: p.image,
        description: p.description,
        video: p.video ?? null,
        isNew: p.isNew,
        isBestSeller: p.isBestSeller,
        rating: p.rating ?? 0,
        sortOrder: index,
      },
      update: {}, // Don't overwrite existing products
    });

    // Only create colors/sizes/images if they don't exist yet
    const existingColors = await db.productColor.count({ where: { productId: p.id } });
    if (existingColors === 0 && p.colors.length > 0) {
      await db.productColor.createMany({
        data: p.colors.map((c) => ({ productId: p.id, name: c.name, hex: c.hex })),
      });
    }

    const existingSizes = await db.productSize.count({ where: { productId: p.id } });
    if (existingSizes === 0 && p.sizes.length > 0) {
      const outOfStock = new Set(p.outOfStock ?? []);
      await db.productSize.createMany({
        data: p.sizes.map((label) => ({
          productId: p.id,
          label,
          outOfStock: outOfStock.has(label),
        })),
      });
    }

    const existingImages = await db.productImage.count({ where: { productId: p.id } });
    if (existingImages === 0 && p.images.length > 0) {
      const imageRows: { productId: string; url: string; colorName: string | null; sortOrder: number }[] = [];
      let sortOrder = 0;
      for (const url of p.images) {
        let colorName: string | null = null;
        if (p.colorImages) {
          for (const [name, urls] of Object.entries(p.colorImages)) {
            if (urls.includes(url)) { colorName = name; break; }
          }
        }
        imageRows.push({ productId: p.id, url, colorName, sortOrder: sortOrder++ });
      }
      await db.productImage.createMany({ data: imageRows });
    }
  }
}

/** Create the default admin user if none exists. */
async function seedAdmin(): Promise<void> {
  const { hash, salt } = await hashPassword('admin123');
  await db.adminUser.create({
    data: {
      username: 'admin',
      passwordHash: hash,
      passwordSalt: salt,
      name: 'Administrador',
    },
  }).catch(() => {
    // Admin already exists (race condition) — ignore
  });
}

/**
 * Ensure the database is initialized. Safe to call on every API request —
 * it only does work once (on the first call after server start), and only
 * seeds if the database is empty.
 *
 * This is the single source of truth for "is the database ready?".
 */
export async function ensureDatabase(): Promise<void> {
  if (initialized) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      let [hasProds, hasAdminUser] = await Promise.all([hasProducts(), hasAdmin()]);

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

      if (!hasProds) {
        console.log('[ensureDatabase] No products found — seeding catalog...');
        await seedProducts();
        console.log(`[ensureDatabase] Seeded ${staticProducts.length} products.`);
      }

      if (!hasAdminUser) {
        console.log('[ensureDatabase] No admin user found — creating default admin...');
        await seedAdmin();
        console.log('[ensureDatabase] Default admin created (admin / admin123).');
      }

      initialized = true;
    } catch (err) {
      devError('[ensureDatabase] Failed to initialize database:', err);
      initPromise = null;
      throw err;
    }
  })();

  return initPromise;
}
