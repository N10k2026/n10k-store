'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Mail,
  Trash2,
  Search,
  Download,
  AlertCircle,
  Loader2,
  Users,
  CalendarClock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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

interface Subscriber {
  id: string;
  email: string;
  createdAt: string;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-VE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export default function AdminNewsletterPage() {
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [search, setSearch] = useState('');

  const [deleteTarget, setDeleteTarget] = useState<Subscriber | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/newsletter', { cache: 'no-store' })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: { subscribers: Subscriber[] }) => {
        if (cancelled) return;
        setSubscribers(data.subscribers ?? []);
        setError('');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(
          err instanceof Error ? err.message : 'Error al cargar los suscriptores',
        );
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
    if (!q) return subscribers;
    return subscribers.filter((s) => s.email.toLowerCase().includes(q));
  }, [subscribers, search]);

  const newestDate = useMemo(() => {
    if (subscribers.length === 0) return null;
    return subscribers.reduce((latest, s) => {
      const d = new Date(s.createdAt).getTime();
      return d > latest ? d : latest;
    }, 0);
  }, [subscribers]);

  const handleExportCSV = () => {
    if (subscribers.length === 0) {
      toast.info('No hay suscriptores para exportar');
      return;
    }
    try {
      const csv = [
        'email,fecha',
        ...subscribers.map(
          (s) =>
            `${s.email},${new Date(s.createdAt).toLocaleDateString('es-VE')}`,
        ),
      ].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'suscriptores-n10k.csv';
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Se exportaron ${subscribers.length} suscriptores`);
    } catch {
      toast.error('No se pudo generar el archivo CSV');
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch('/api/admin/newsletter', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: deleteTarget.id }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      toast.success('Suscriptor eliminado correctamente');
      setDeleteTarget(null);
      setSubscribers((prev) => prev.filter((s) => s.id !== deleteTarget.id));
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : 'Error al eliminar el suscriptor',
      );
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="p-4 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-zinc-100">
            Newsletter
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Gestiona los suscriptores del boletín de la tienda.
          </p>
        </div>
        <Button
          onClick={handleExportCSV}
          disabled={loading || subscribers.length === 0}
          className="bg-[#E30613] text-white hover:bg-[#c00510] disabled:opacity-50"
        >
          <Download className="h-4 w-4" />
          Exportar CSV
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-[#111] border border-zinc-800 rounded-lg p-5 flex items-center gap-4">
          <div className="w-11 h-11 rounded-lg bg-[#E30613]/15 border border-[#E30613]/30 flex items-center justify-center">
            <Users className="h-5 w-5 text-[#E30613]" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-zinc-500">
              Total suscriptores
            </p>
            <p className="text-2xl font-bold text-zinc-100">
              {subscribers.length}
            </p>
          </div>
        </div>
        <div className="bg-[#111] border border-zinc-800 rounded-lg p-5 flex items-center gap-4">
          <div className="w-11 h-11 rounded-lg bg-[#E30613]/15 border border-[#E30613]/30 flex items-center justify-center">
            <CalendarClock className="h-5 w-5 text-[#E30613]" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-zinc-500">
              Suscriptor más reciente
            </p>
            <p className="text-2xl font-bold text-zinc-100">
              {newestDate ? formatDate(new Date(newestDate).toISOString()) : '—'}
            </p>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="bg-[#111] border border-zinc-800 rounded-lg p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por email..."
            className="pl-9 bg-[#0a0a0a] border-zinc-800 text-zinc-100 placeholder:text-zinc-500 focus-visible:border-zinc-600"
          />
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-20 text-zinc-400 gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-[#E30613]" />
          <p className="text-sm">Cargando suscriptores...</p>
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
          <Mail className="h-10 w-10 text-zinc-600" />
          <p className="text-sm">
            {subscribers.length === 0
              ? 'Aún no hay suscriptores al newsletter.'
              : 'No hay suscriptores que coincidan con la búsqueda.'}
          </p>
        </div>
      )}

      {/* Desktop table */}
      {!loading && !error && filtered.length > 0 && (
        <div className="hidden md:block bg-[#111] border border-zinc-800 rounded-lg overflow-hidden">
          <div className="grid grid-cols-[2.5fr_1fr_0.6fr] gap-4 px-5 py-3 border-b border-zinc-800 bg-[#0a0a0a] text-xs font-semibold uppercase tracking-wide text-zinc-400">
            <div>Email</div>
            <div>Fecha de suscripción</div>
            <div className="text-right">Acciones</div>
          </div>
          <div className="divide-y divide-zinc-800 max-h-[60vh] overflow-y-auto">
            {filtered.map((s) => (
              <div
                key={s.id}
                className="grid grid-cols-[2.5fr_1fr_0.6fr] gap-4 px-5 py-4 items-center hover:bg-zinc-900/40"
              >
                <div className="min-w-0 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#E30613]/15 border border-[#E30613]/30 flex items-center justify-center shrink-0">
                    <Mail className="h-4 w-4 text-[#E30613]" />
                  </div>
                  <p className="text-sm text-zinc-100 truncate">{s.email}</p>
                </div>
                <div>
                  <span className="text-sm text-zinc-400">
                    {formatDate(s.createdAt)}
                  </span>
                </div>
                <div className="flex justify-end">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setDeleteTarget(s)}
                    className="h-8 w-8 text-zinc-400 hover:text-red-400 hover:bg-red-950/30"
                    aria-label="Eliminar suscriptor"
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
        <div className="md:hidden space-y-3 max-h-[60vh] overflow-y-auto pr-1">
          {filtered.map((s) => (
            <div
              key={s.id}
              className="bg-[#111] border border-zinc-800 rounded-lg p-4 space-y-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#E30613]/15 border border-[#E30613]/30 flex items-center justify-center shrink-0">
                    <Mail className="h-4 w-4 text-[#E30613]" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-zinc-100 truncate">
                      {s.email}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {formatDate(s.createdAt)}
                    </p>
                  </div>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setDeleteTarget(s)}
                  className="h-8 w-8 shrink-0 text-zinc-400 hover:text-red-400 hover:bg-red-950/30"
                  aria-label="Eliminar suscriptor"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete confirmation */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent className="bg-[#111] border-zinc-800 text-zinc-100">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-zinc-100">
              Eliminar suscriptor
            </AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              ¿Seguro que deseas eliminar a{' '}
              <span className="font-medium text-zinc-200">
                {deleteTarget?.email}
              </span>{' '}
              del newsletter? Esta acción no se puede deshacer.
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
