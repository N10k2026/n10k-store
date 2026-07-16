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
