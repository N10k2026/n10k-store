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
