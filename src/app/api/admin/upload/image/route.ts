import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/admin-auth';
import { applyRateLimit } from '@/lib/rate-limit';
import {
  optimizeImage,
  isAllowedImageType,
  MAX_IMAGE_SIZE,
} from '@/lib/media-optimizer';

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
    const result = await optimizeImage(buffer, { maxWidth: 1200, quality: 82 });

    return NextResponse.json({
      success: true,
      url: result.url,
      size: result.size,
      originalSize: result.originalSize,
      reductionPercent: result.reductionPercent,
      mimeType: result.mimeType,
    });
  } catch (err) {
    console.error('Image optimization error:', err);
    return NextResponse.json({ error: 'Error al optimizar la imagen' }, { status: 500 });
  }
}
