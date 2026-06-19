'use client';

import { useState, useRef, useCallback } from 'react';
import { Upload, Loader2, Image as ImageIcon, Film, X, CheckCircle2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

interface MediaUploaderProps {
  /** 'image' or 'video' */
  type: 'image' | 'video';
  /** Current URL value (controlled). */
  value: string;
  /** Called when upload completes with the new optimized URL. */
  onChange: (url: string) => void;
  /** Label for the field. */
  label?: string;
  /** Accepted file types hint. */
  accept?: string;
  /** Optional className for the container. */
  className?: string;
}

interface UploadResult {
  url: string;
  originalSize: number;
  size: number;
  reductionPercent: number;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export default function MediaUploader({
  type,
  value,
  onChange,
  label,
  accept,
  className = '',
}: MediaUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [lastResult, setLastResult] = useState<UploadResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const endpoint = type === 'image' ? '/api/admin/upload/image' : '/api/admin/upload/video';
  const Icon = type === 'image' ? ImageIcon : Film;
  const defaultAccept =
    accept || (type === 'image' ? 'image/jpeg,image/png,image/webp,image/avif' : 'video/mp4,video/webm,video/quicktime');

  const handleFile = useCallback(
    async (file: File) => {
      setUploading(true);
      setLastResult(null);
      try {
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch(endpoint, { method: 'POST', body: formData });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Error al subir el archivo');
        }
        onChange(data.url);
        setLastResult({
          url: data.url,
          originalSize: data.originalSize,
          size: data.size,
          reductionPercent: data.reductionPercent,
        });
        toast.success(
          `${type === 'image' ? 'Imagen' : 'Video'} optimizado: ${formatBytes(data.originalSize)} → ${formatBytes(data.size)} (-${data.reductionPercent}%)`,
        );
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Error al subir');
      } finally {
        setUploading(false);
      }
    },
    [endpoint, onChange, type],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    // Reset so selecting the same file again still triggers change
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div className={className}>
      {label && (
        <label className="block text-xs font-semibold text-zinc-300 mb-1.5 uppercase tracking-wider">
          {label}
        </label>
      )}

      {/* Drop zone + preview */}
      <div
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => !uploading && inputRef.current?.click()}
        className="relative border-2 border-dashed border-zinc-700 rounded-xl overflow-hidden cursor-pointer hover:border-[#E30613]/50 transition-colors group"
      >
        <input
          ref={inputRef}
          type="file"
          accept={defaultAccept}
          onChange={handleInputChange}
          disabled={uploading}
          className="hidden"
        />

        {value ? (
          /* Preview of current/uploaded media */
          <div className="relative w-full">
            {type === 'image' ? (
              <img
                src={value}
                alt="Preview"
                className="w-full h-40 object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.opacity = '0.3';
                }}
              />
            ) : (
              <video src={value} className="w-full h-40 object-cover" controls muted />
            )}
            {/* Overlay with upload state */}
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
              {uploading ? (
                <div className="bg-black/70 rounded-lg px-4 py-2 flex items-center gap-2 text-white text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Optimizando...
                </div>
              ) : (
                <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-black/70 rounded-lg px-3 py-1.5 flex items-center gap-2 text-white text-xs">
                  <Upload className="h-3.5 w-3.5" />
                  Reemplazar
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
            {uploading ? (
              <>
                <Loader2 className="h-8 w-8 text-[#E30613] animate-spin mb-2" />
                <p className="text-sm text-zinc-400">Optimizando {type === 'image' ? 'imagen' : 'video'}...</p>
              </>
            ) : (
              <>
                <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center mb-2 group-hover:bg-[#E30613]/15 transition-colors">
                  <Icon className="h-6 w-6 text-zinc-500 group-hover:text-[#E30613] transition-colors" />
                </div>
                <p className="text-sm font-semibold text-zinc-300 mb-0.5">
                  Subir {type === 'image' ? 'imagen' : 'video'}
                </p>
                <p className="text-xs text-zinc-500">
                  Arrastra o haz clic aquí — se optimiza automáticamente
                </p>
              </>
            )}
          </div>
        )}
      </div>

      {/* Optimization result feedback */}
      {lastResult && (
        <div className="mt-2 flex items-center gap-2 text-xs text-green-400">
          <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0" />
          <span>
            Optimizado: {formatBytes(lastResult.originalSize)} →{' '}
            {formatBytes(lastResult.size)}
            <span className="text-green-300 font-semibold">
              {' '}(-{lastResult.reductionPercent}%)
            </span>
          </span>
        </div>
      )}

      {/* URL display (for manual editing) */}
      {value && (
        <div className="mt-2 flex items-center gap-2">
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="URL o ruta del archivo"
            className="flex-1 bg-[#0a0a0a] border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-300 font-mono focus:outline-none focus:border-[#E30613]/50"
          />
          <button
            type="button"
            onClick={() => {
              onChange('');
              setLastResult(null);
            }}
            className="p-1.5 text-zinc-500 hover:text-red-400 cursor-pointer"
            aria-label="Limpiar"
            title="Limpiar"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Help text */}
      <p className="text-[11px] text-zinc-500 mt-1.5 flex items-start gap-1">
        <AlertCircle className="h-3 w-3 flex-shrink-0 mt-0.5" />
        {type === 'image'
          ? 'Se convierte a WebP, máx 1200px, calidad 82. Cache inmutable de 1 año.'
          : 'Se convierte a H.264 MP4, máx 1280px, CRF 28, +faststart. Cache inmutable de 1 año.'}
      </p>
    </div>
  );
}
