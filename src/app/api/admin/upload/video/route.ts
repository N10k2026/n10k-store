import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/admin-auth';
import { applyRateLimit } from '@/lib/rate-limit';
import {
  optimizeVideo,
  isAllowedVideoType,
  MAX_VIDEO_SIZE,
} from '@/lib/media-optimizer';

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
    const result = await optimizeVideo(buffer, { maxWidth: 1280, crf: 28, audioBitrate: '128k' });

    return NextResponse.json({
      success: true,
      url: result.url,
      size: result.size,
      originalSize: result.originalSize,
      reductionPercent: result.reductionPercent,
      mimeType: result.mimeType,
    });
  } catch (err) {
    console.error('Video optimization error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? `Error: ${err.message}` : 'Error al optimizar el video' },
      { status: 500 },
    );
  }
}
