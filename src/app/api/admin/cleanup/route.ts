import { NextResponse } from 'next/server';
import path from 'path';
import { getAdminSession } from '@/lib/admin-auth';
import {
  cleanupOrphanUploads,
  collectReferencedUploadUrls,
  listFilesRecursively,
} from '@/lib/orphan-cleanup';

const UPLOADS_DIR = path.join(process.cwd(), 'public', 'uploads');

/**
 * GET — Dry-run preview: scan `public/uploads/` and report how many files are
 * orphans (not referenced by any product/banner) WITHOUT deleting them.
 */
export async function GET() {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const referenced = await collectReferencedUploadUrls();
  const allFiles = await listFilesRecursively(UPLOADS_DIR);
  const orphans = allFiles.filter((f) => !referenced.has(f));

  return NextResponse.json({
    scanned: allFiles.length,
    referenced: allFiles.length - orphans.length,
    orphans: orphans.length,
    orphanFiles: orphans,
  });
}

/**
 * POST — Execute the global orphan cleanup: delete every file under
 * `public/uploads/` that is not referenced by any product or banner.
 */
export async function POST() {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const result = await cleanupOrphanUploads();
  return NextResponse.json(result);
}
