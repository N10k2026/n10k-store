import { readdir, stat, unlink } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { db } from '@/lib/db';

/**
 * Orphan media cleanup.
 *
 * Uploaded media files live in `public/uploads/{images,videos}/` with
 * content-hash filenames. When a product/banner is edited and its image is
 * replaced, the OLD file is left on disk (the DB just updates the URL). Over
 * time these orphan files accumulate and waste disk space.
 *
 * This module scans the uploads directory, collects every media URL still
 * referenced by the database (products, product images, product videos,
 * banners), and deletes any physical file that is no longer referenced.
 *
 * Safe to run anytime — only deletes files under `public/uploads/` whose
 * filename is not referenced by any row in the DB.
 */

const UPLOADS_DIR = path.join(process.cwd(), 'public', 'uploads');

export interface OrphanCleanupResult {
  /** Total files scanned in public/uploads/. */
  scanned: number;
  /** Files that were referenced by the DB and kept. */
  kept: number;
  /** Orphan files that were deleted. */
  deleted: number;
  /** Bytes freed by deleting orphans. */
  bytesFreed: number;
  /** Names of deleted files (relative path, e.g. "images/abc.webp"). */
  deletedFiles: string[];
  /** Any errors encountered (file deletion is best-effort). */
  errors: string[];
}

/** Collect every /uploads/... URL referenced by the database. */
export async function collectReferencedUploadUrls(): Promise<Set<string>> {
  const referenced = new Set<string>();

  // Products: main image, video, and per-color ProductImage rows
  const products = await db.product.findMany({
    select: {
      image: true,
      video: true,
      images: { select: { url: true } },
    },
  });
  for (const p of products) {
    if (p.image) referenced.add(normalizeUploadPath(p.image));
    if (p.video) referenced.add(normalizeUploadPath(p.video));
    for (const img of p.images) {
      if (img.url) referenced.add(normalizeUploadPath(img.url));
    }
  }

  // Banners
  const banners = await db.banner.findMany({ select: { imageUrl: true } });
  for (const b of banners) {
    if (b.imageUrl) referenced.add(normalizeUploadPath(b.imageUrl));
  }

  // Filter to only /uploads/ paths (exclude /products/, /brand/, etc.)
  const uploadOnly = new Set<string>();
  for (const url of referenced) {
    if (url.startsWith('/uploads/')) {
      // Convert /uploads/images/abc.webp → images/abc.webp (relative to UPLOADS_DIR)
      uploadOnly.add(url.slice('/uploads/'.length));
    }
  }
  return uploadOnly;
}

/** Strip query strings and normalize a URL/path to a leading-slash path. */
function normalizeUploadPath(url: string): string {
  // Remove query string (?v=20260620)
  const withoutQuery = url.split('?')[0];
  return withoutQuery;
}

/** Recursively list all files under a directory, returning relative paths. */
export async function listFilesRecursively(dir: string, base = dir): Promise<string[]> {
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const sub = await listFilesRecursively(fullPath, base);
      files.push(...sub);
    } else if (entry.isFile()) {
      // Relative to base (e.g., "images/abc.webp")
      files.push(path.relative(base, fullPath));
    }
  }
  return files;
}

/**
 * Scan `public/uploads/` and delete any file not referenced by the DB.
 * Returns a report of what was cleaned up.
 */
export async function cleanupOrphanUploads(): Promise<OrphanCleanupResult> {
  const referenced = await collectReferencedUploadUrls();
  const allFiles = await listFilesRecursively(UPLOADS_DIR);

  const result: OrphanCleanupResult = {
    scanned: allFiles.length,
    kept: 0,
    deleted: 0,
    bytesFreed: 0,
    deletedFiles: [],
    errors: [],
  };

  for (const relPath of allFiles) {
    if (referenced.has(relPath)) {
      result.kept++;
      continue;
    }
    // Orphan — delete it
    const fullPath = path.join(UPLOADS_DIR, relPath);
    try {
      const statResult = await stat(fullPath);
      const size = statResult.size;
      await unlink(fullPath);
      result.deleted++;
      result.bytesFreed += size;
      result.deletedFiles.push(relPath);
    } catch (err) {
      result.errors.push(
        `${relPath}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return result;
}

/**
 * Delete a single upload file by its public URL (e.g., "/uploads/images/abc.webp").
 * SAFE: before deleting, verifies that NO other row in the DB still references
 * the URL. If any product (image/video/ProductImage) or banner still uses it,
 * the file is kept. Best-effort — ignores filesystem errors.
 */
export async function deleteUploadByUrl(url: string | null | undefined): Promise<void> {
  if (!url) return;
  const normalized = normalizeUploadPath(url);
  if (!normalized.startsWith('/uploads/')) return; // only touch our uploads

  // Safety check: is this URL still referenced anywhere in the DB?
  // (Another product/banner might share the same uploaded file.)
  const stillReferenced = await isUploadUrlReferenced(normalized);
  if (stillReferenced) return; // don't delete — someone else uses it

  const relPath = normalized.slice('/uploads/'.length);
  const fullPath = path.join(UPLOADS_DIR, relPath);
  try {
    if (existsSync(fullPath)) {
      await unlink(fullPath);
    }
  } catch {
    // best-effort: ignore
  }
}

/** Check whether any product or banner references the given (normalized) URL. */
async function isUploadUrlReferenced(normalizedUrl: string): Promise<boolean> {
  // Products: main image or video
  const productMatch = await db.product.findFirst({
    where: {
      OR: [{ image: { startsWith: normalizedUrl } }, { video: { startsWith: normalizedUrl } }],
    },
    select: { id: true },
  });
  if (productMatch) return true;

  // ProductImage rows
  const imgMatch = await db.productImage.findFirst({
    where: { url: { startsWith: normalizedUrl } },
    select: { id: true },
  });
  if (imgMatch) return true;

  // Banners
  const bannerMatch = await db.banner.findFirst({
    where: { imageUrl: { startsWith: normalizedUrl } },
    select: { id: true },
  });
  if (bannerMatch) return true;

  return false;
}
