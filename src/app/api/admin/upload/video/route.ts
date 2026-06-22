import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/admin-auth';
import { applyRateLimit } from '@/lib/rate-limit';
import { uploadVideoToCloudinary } from '@/lib/cloudinary';
import { isAllowedVideoType, MAX_VIDEO_SIZE } from '@/lib/media-optimizer';

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
    const result = await uploadVideoToCloudinary(buffer);

    return NextResponse.json({
      success: true,
      url: result.url,
      publicId: result.publicId,
      size: result.bytes,
      originalSize: result.originalBytes,
      reductionPercent: result.reductionPercent,
      mimeType: `video/${result.format}`,
    });
  } catch (err) {
    console.error('Cloudinary video upload error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? `Error: ${err.message}` : 'Error al subir el video' },
      { status: 500 },
    );
  }
}
