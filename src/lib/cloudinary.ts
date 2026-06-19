import { v2 as cloudinary } from 'cloudinary';

/**
 * Cloudinary configuration — cloud storage for uploaded images and videos.
 *
 * Unlike local disk storage (which is lost on sandbox/Vercel resets),
 * Cloudinary stores files in the cloud permanently and serves them via
 * a global CDN. This is essential for Vercel deployment (serverless = no disk).
 */

// Configure only once
let configured = false;

function ensureConfigured() {
  if (configured) return;
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });
  configured = true;
}

export interface CloudinaryUploadResult {
  url: string;
  publicId: string;
  width: number;
  height: number;
  format: string;
  bytes: number;
  originalBytes: number;
  reductionPercent: number;
}

/**
 * Upload and optimize an image to Cloudinary.
 * Cloudinary automatically converts to WebP, resizes to max 1200px,
 * and applies quality optimization — matching our previous sharp settings.
 */
export async function uploadImageToCloudinary(
  buffer: Buffer,
  folder: string = 'n10k/products',
): Promise<CloudinaryUploadResult> {
  ensureConfigured();

  const originalBytes = buffer.length;

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: 'image',
        transformation: [
          { width: 1200, crop: 'limit', quality: 'auto', fetch_format: 'auto' },
        ],
        unique_filename: true,
        overwrite: false,
      },
      (error, result) => {
        if (error) {
          reject(error);
          return;
        }
        if (!result) {
          reject(new Error('Cloudinary no devolvió resultado'));
          return;
        }
        const bytes = result.bytes || 0;
        resolve({
          url: result.secure_url,
          publicId: result.public_id,
          width: result.width,
          height: result.height,
          format: result.format,
          bytes,
          originalBytes,
          reductionPercent: originalBytes > 0
            ? Math.round((1 - bytes / originalBytes) * 100)
            : 0,
        });
      },
    );
    uploadStream.end(buffer);
  });
}

/**
 * Upload and optimize a video to Cloudinary.
 * Cloudinary handles video transcoding automatically.
 */
export async function uploadVideoToCloudinary(
  buffer: Buffer,
  folder: string = 'n10k/videos',
): Promise<CloudinaryUploadResult> {
  ensureConfigured();

  const originalBytes = buffer.length;

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: 'video',
        transformation: [
          { width: 1280, crop: 'limit', quality: 'auto', fetch_format: 'auto' },
        ],
        unique_filename: true,
        overwrite: false,
      },
      (error, result) => {
        if (error) {
          reject(error);
          return;
        }
        if (!result) {
          reject(new Error('Cloudinary no devolvió resultado'));
          return;
        }
        const bytes = result.bytes || 0;
        resolve({
          url: result.secure_url,
          publicId: result.public_id,
          width: result.width,
          height: result.height,
          format: result.format,
          bytes,
          originalBytes,
          reductionPercent: originalBytes > 0
            ? Math.round((1 - bytes / originalBytes) * 100)
            : 0,
        });
      },
    );
    uploadStream.end(buffer);
  });
}

/**
 * Delete a file from Cloudinary by its public ID.
 * Used by the orphan cleanup system when products/banners are deleted.
 */
export async function deleteFromCloudinary(publicId: string): Promise<void> {
  ensureConfigured();
  try {
    await cloudinary.uploader.destroy(publicId, {
      resource_type: 'auto',
    });
  } catch {
    // best-effort
  }
}
