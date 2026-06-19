import sharp from 'sharp';
import { spawn } from 'child_process';
import { createHash } from 'crypto';
import { mkdir, writeFile, stat, unlink } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

/**
 * Media optimizer — replicates the project's existing optimization patterns.
 *
 * Images: sharp → WebP, max 1200px wide, quality 82 (matches the
 * `optimize-shorts-*.mjs` scripts).
 *
 * Videos: ffmpeg → H.264 CRF 28, 1280px max, preset slow, AAC 128k.
 *
 * Filenames are content-hash based so the URL is "incorruptible" — the same
 * file content always maps to the same filename, which means:
 *  - No collisions with other uploads
 *  - Safe to overwrite (same image → same name → cache invalidates via ?v=)
 *  - No need for a database of uploaded files
 */

const UPLOADS_DIR = path.join(process.cwd(), 'public', 'uploads');
const IMAGES_DIR = path.join(UPLOADS_DIR, 'images');
const VIDEOS_DIR = path.join(UPLOADS_DIR, 'videos');

/** Image optimization options matching the project's sharp scripts. */
export interface ImageOptimizeOptions {
  /** Max width in pixels (default 1200, matches existing scripts). */
  maxWidth?: number;
  /** WebP quality 1-100 (default 82, matches existing scripts). */
  quality?: number;
}

export interface OptimizedMediaResult {
  /** Public URL path (e.g. /uploads/images/abc123.webp). */
  url: string;
  /** Absolute filesystem path of the saved file. */
  filePath: string;
  /** Size in bytes of the optimized file. */
  size: number;
  /** Size in bytes of the original uploaded file. */
  originalSize: number;
  /** Percentage reduction (0-100). */
  reductionPercent: number;
  /** MIME type of the optimized file. */
  mimeType: string;
}

async function ensureDirs() {
  if (!existsSync(UPLOADS_DIR)) await mkdir(UPLOADS_DIR, { recursive: true });
  if (!existsSync(IMAGES_DIR)) await mkdir(IMAGES_DIR, { recursive: true });
  if (!existsSync(VIDEOS_DIR)) await mkdir(VIDEOS_DIR, { recursive: true });
}

function contentHash(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex').slice(0, 16);
}

/* ------------------------------------------------------------------ */
/* Image optimization (sharp)                                          */
/* ------------------------------------------------------------------ */

export async function optimizeImage(
  buffer: Buffer,
  options: ImageOptimizeOptions = {},
): Promise<OptimizedMediaResult> {
  const { maxWidth = 1200, quality = 82 } = options;
  await ensureDirs();

  const originalSize = buffer.length;
  const hash = contentHash(buffer);
  const filename = `${hash}.webp`;
  const filePath = path.join(IMAGES_DIR, filename);
  const url = `/uploads/images/${filename}`;

  // If the file already exists (same content → same hash), skip re-optimizing.
  if (existsSync(filePath)) {
    const existingStat = await stat(filePath);
    return {
      url,
      filePath,
      size: existingStat.size,
      originalSize,
      reductionPercent: Math.round((1 - existingStat.size / originalSize) * 100),
      mimeType: 'image/webp',
    };
  }

  const optimized = await sharp(buffer)
    .resize({ width: maxWidth, withoutEnlargement: true })
    .webp({ quality, effort: 4 })
    .toBuffer();

  await writeFile(filePath, optimized);
  const size = optimized.length;

  return {
    url,
    filePath,
    size,
    originalSize,
    reductionPercent: Math.round((1 - size / originalSize) * 100),
    mimeType: 'image/webp',
  };
}

/* ------------------------------------------------------------------ */
/* Video optimization (ffmpeg)                                         */
/* ------------------------------------------------------------------ */

export interface VideoOptimizeOptions {
  /** Max width in pixels (default 1280). */
  maxWidth?: number;
  /** CRF (Constant Rate Factor) — lower = better quality, larger file (default 28). */
  crf?: number;
  /** Audio bitrate (default 128k). */
  audioBitrate?: string;
}

/**
 * Optimize a video with ffmpeg. Writes the input buffer to a temp file,
 * runs ffmpeg to produce an H.264 MP4, then cleans up the temp file.
 */
export async function optimizeVideo(
  buffer: Buffer,
  options: VideoOptimizeOptions = {},
): Promise<OptimizedMediaResult> {
  const { maxWidth = 1280, crf = 28, audioBitrate = '128k' } = options;
  await ensureDirs();

  const originalSize = buffer.length;
  const hash = contentHash(buffer);
  const filename = `${hash}.mp4`;
  const filePath = path.join(VIDEOS_DIR, filename);
  const url = `/uploads/videos/${filename}`;

  // If the file already exists (same content → same hash), skip re-optimizing.
  if (existsSync(filePath)) {
    const existingStat = await stat(filePath);
    return {
      url,
      filePath,
      size: existingStat.size,
      originalSize,
      reductionPercent: Math.round((1 - existingStat.size / originalSize) * 100),
      mimeType: 'video/mp4',
    };
  }

  // Write the uploaded buffer to a temp input file
  const tempInput = path.join(UPLOADS_DIR, `temp-input-${hash}`);
  await writeFile(tempInput, buffer);

  try {
    await runFfmpeg([
      '-i', tempInput,
      '-vf', `scale='min(${maxWidth},iw)':-2`, // scale to maxWidth, keep aspect ratio
      '-c:v', 'libx264',
      '-preset', 'slow',         // slower preset = better compression
      '-crf', String(crf),       // 28 is a good quality/size balance
      '-pix_fmt', 'yuv420p',     // max compatibility
      '-c:a', 'aac',
      '-b:a', audioBitrate,
      '-movflags', '+faststart', // web-optimized: moov atom at the start
      '-y',                      // overwrite output if exists
      filePath,
    ]);

    const resultStat = await stat(filePath);
    return {
      url,
      filePath,
      size: resultStat.size,
      originalSize,
      reductionPercent: Math.round((1 - resultStat.size / originalSize) * 100),
      mimeType: 'video/mp4',
    };
  } finally {
    // Clean up the temp input file
    if (existsSync(tempInput)) {
      await unlink(tempInput).catch(() => {});
    }
  }
}

/** Run ffmpeg as a child process, returning a promise that rejects on failure. */
function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    proc.on('error', (err) => {
      reject(new Error(`ffmpeg failed to start: ${err.message}`));
    });
    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`ffmpeg exited with code ${code}. Last stderr:\n${stderr.slice(-500)}`));
      } else {
        resolve();
      }
    });
  });
}

/* ------------------------------------------------------------------ */
/* Validation helpers                                                  */
/* ------------------------------------------------------------------ */

const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/gif',
]);

const ALLOWED_VIDEO_TYPES = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-msvideo',
]);

export function isAllowedImageType(mimeType: string): boolean {
  return ALLOWED_IMAGE_TYPES.has(mimeType.toLowerCase());
}

export function isAllowedVideoType(mimeType: string): boolean {
  return ALLOWED_VIDEO_TYPES.has(mimeType.toLowerCase());
}

/** Max upload sizes (in bytes). */
export const MAX_IMAGE_SIZE = 15 * 1024 * 1024; // 15 MB
export const MAX_VIDEO_SIZE = 100 * 1024 * 1024; // 100 MB
