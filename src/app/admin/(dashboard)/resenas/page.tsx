'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Star, Trash2, Search, MessageSquare, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { Toaster } from '@/components/ui/sonner';

interface Review {
  id: string;
  productId: string;
  userName: string;
  reviewerKey: string;
  rating: number;
  comment: string;
  createdAt: string;
  product: { id: string; name: string };
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-VE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function renderStars(rating: number) {
  return Array.from({ length: 5 }).map((_, i) => (
    <Star
      key={i}
      className={`h-4 w-4 ${i < rating ? 'fill-amber-400 text-amber-400' : 'text-zinc-700'}`}
    />
  ));
}

export default function AdminReviewsPage() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [search, setSearch] = useState('');
  const [ratingFilter, setRatingFilter] = useState<string>('all');

  const [deleteTarget, setDeleteTarget] = useState<Review | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/reviews', { cache: 'no-store' })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: { reviews: Review[] }) => {
        if (cancelled) return;
        setReviews(data.reviews ?? []);
        setError('');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Error al cargar las reseñas');
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return reviews.filter((r) => {
      if (ratingFilter !== 'all' && r.rating !== Number(ratingFilter)) return false;
      if (!q) return true;
      return (
        r.product?.name?.toLowerCase().includes(q) ||
        r.userName?.toLowerCase().includes(q) ||
        r.comment?.toLowerCase().includes(q)
      );
    });
  }, [reviews, ratingFilter, search]);

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch('/api/admin/reviews', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: deleteTarget.id }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      toast.success('Reseña eliminada correctamente');
      setDeleteTarget(null);
      setReviews((prev) => prev.filter((r) => r.id !== deleteTarget.id));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al eliminar la reseña');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="p-4 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-zinc-100">Reseñas</h1>
          <p className="text-sm text-zinc-400 mt-1">
            Gestiona las reseñas de los productos de la tienda.
          </p>
        </div>
        <div className="text-sm text-zinc-400">
          {filtered.length} de {reviews.length} reseña{reviews.length === 1 ? '' : 's'}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-[#111] border border-zinc-800 rounded-lg p-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por producto, autor o comentario..."
            className="pl-9 bg-[#0a0a0a] border-zinc-800 text-zinc-100 placeholder:text-zinc-500 focus-visible:border-zinc-600"
          />
        </div>
        <Select value={ratingFilter} onValueChange={setRatingFilter}>
          <SelectTrigger className="w-full sm:w-[200px] bg-[#0a0a0a] border-zinc-800 text-zinc-100">
            <SelectValue placeholder="Filtrar por rating" />
          </SelectTrigger>
          <SelectContent className="bg-[#111] border-zinc-800 text-zinc-100">
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="5">5 estrellas</SelectItem>
            <SelectItem value="4">4 estrellas</SelectItem>
            <SelectItem value="3">3 estrellas</SelectItem>
            <SelectItem value="2">2 estrellas</SelectItem>
            <SelectItem value="1">1 estrella</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-20 text-zinc-400 gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-[#E30613]" />
          <p className="text-sm">Cargando reseñas...</p>
        </div>
      )}

      {/* Error state */}
      {!loading && error && (
        <div className="flex flex-col items-center justify-center py-20 gap-3 border border-red-900/50 bg-red-950/20 rounded-lg p-6">
          <AlertCircle className="h-8 w-8 text-red-400" />
          <p className="text-sm text-red-300">{error}</p>
          <Button
            variant="outline"
            onClick={() => {
              setError('');
              setLoading(true);
              setRefreshKey((k) => k + 1);
            }}
            className="border-zinc-700 text-zinc-200 hover:bg-zinc-800"
          >
            Reintentar
          </Button>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-zinc-400 gap-3">
          <MessageSquare className="h-10 w-10 text-zinc-600" />
          <p className="text-sm">
            {reviews.length === 0
              ? 'Aún no hay reseñas en la tienda.'
              : 'No hay reseñas que coincidan con los filtros.'}
          </p>
        </div>
      )}

      {/* Desktop table-like layout */}
      {!loading && !error && filtered.length > 0 && (
        <div className="hidden md:block bg-[#111] border border-zinc-800 rounded-lg overflow-hidden">
          <div className="grid grid-cols-[1.4fr_1fr_1fr_2.4fr_0.8fr] gap-4 px-5 py-3 border-b border-zinc-800 bg-[#0a0a0a] text-xs font-semibold uppercase tracking-wide text-zinc-400">
            <div>Producto</div>
            <div>Autor</div>
            <div>Rating</div>
            <div>Comentario</div>
            <div className="text-right">Fecha</div>
          </div>
          <div className="divide-y divide-zinc-800 max-h-[70vh] overflow-y-auto">
            {filtered.map((r) => (
              <div
                key={r.id}
                className="grid grid-cols-[1.4fr_1fr_1fr_2.4fr_0.8fr] gap-4 px-5 py-4 items-start hover:bg-zinc-900/40"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-zinc-100 truncate">{r.product?.name ?? '—'}</p>
                  <p className="text-xs text-zinc-500 truncate">{r.product?.id}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-sm text-zinc-200 truncate">{r.userName || 'Anónimo'}</p>
                  <p className="text-xs text-zinc-500 truncate">{r.reviewerKey}</p>
                </div>
                <div className="flex items-center gap-1">
                  {renderStars(r.rating)}
                  <span className="text-xs text-zinc-500 ml-1">({r.rating})</span>
                </div>
                <div className="min-w-0">
                  <p className="text-sm text-zinc-300 line-clamp-3 whitespace-pre-wrap break-words">
                    {r.comment}
                  </p>
                </div>
                <div className="flex items-center justify-end gap-2">
                  <span className="text-xs text-zinc-400">{formatDate(r.createdAt)}</span>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setDeleteTarget(r)}
                    className="h-8 w-8 text-zinc-400 hover:text-red-400 hover:bg-red-950/30"
                    aria-label="Eliminar reseña"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Mobile cards */}
      {!loading && !error && filtered.length > 0 && (
        <div className="md:hidden space-y-3 max-h-[70vh] overflow-y-auto pr-1">
          {filtered.map((r) => (
            <div
              key={r.id}
              className="bg-[#111] border border-zinc-800 rounded-lg p-4 space-y-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-zinc-100 truncate">
                    {r.product?.name ?? '—'}
                  </p>
                  <p className="text-xs text-zinc-500 truncate">
                    {r.userName || 'Anónimo'} · {formatDate(r.createdAt)}
                  </p>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setDeleteTarget(r)}
                  className="h-8 w-8 shrink-0 text-zinc-400 hover:text-red-400 hover:bg-red-950/30"
                  aria-label="Eliminar reseña"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex items-center gap-1">
                {renderStars(r.rating)}
                <span className="text-xs text-zinc-500 ml-1">({r.rating})</span>
              </div>
              <p className="text-sm text-zinc-300 whitespace-pre-wrap break-words">{r.comment}</p>
            </div>
          ))}
        </div>
      )}

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent className="bg-[#111] border-zinc-800 text-zinc-100">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-zinc-100">Eliminar reseña</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              ¿Seguro que deseas eliminar esta reseña de{' '}
              <span className="font-medium text-zinc-200">
                {deleteTarget?.userName || 'Anónimo'}
              </span>{' '}
              sobre{' '}
              <span className="font-medium text-zinc-200">
                {deleteTarget?.product?.name ?? 'el producto'}
              </span>
              ? Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={deleting}
              className="border-zinc-700 text-zinc-200 hover:bg-zinc-800"
            >
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleConfirmDelete();
              }}
              disabled={deleting}
              className="bg-[#E30613] text-white hover:bg-[#c00510]"
            >
              {deleting ? 'Eliminando...' : 'Eliminar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Toaster theme="dark" position="top-right" />
    </div>
  );
}
