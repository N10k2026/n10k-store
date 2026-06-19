'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  ShoppingBag,
  Loader2,
  AlertCircle,
  Trash2,
  Eye,
  Phone,
  Mail,
  User,
  Package,
  DollarSign,
  RefreshCw,
  Calendar,
  Hash,
  Tag,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from '@/components/ui/dialog';
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

interface OrderItem {
  name?: string;
  quantity?: number;
  price?: number;
  selectedSize?: string | null;
  selectedColor?: string | null;
}

interface Order {
  id: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
  items: string;
  total: number;
  status: string;
  createdAt: string;
  updatedAt: string;
}

type StatusKey =
  | 'pendiente'
  | 'procesando'
  | 'enviado'
  | 'entregado'
  | 'cancelado';
type FilterKey = 'todos' | StatusKey;

const STATUSES: { key: StatusKey; label: string; badge: string }[] = [
  {
    key: 'pendiente',
    label: 'Pendiente',
    badge: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  },
  {
    key: 'procesando',
    label: 'Procesando',
    badge: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  },
  {
    key: 'enviado',
    label: 'Enviado',
    badge: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
  },
  {
    key: 'entregado',
    label: 'Entregado',
    badge: 'bg-green-500/15 text-green-300 border-green-500/30',
  },
  {
    key: 'cancelado',
    label: 'Cancelado',
    badge: 'bg-red-500/15 text-red-300 border-red-500/30',
  },
];

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'todos', label: 'Todos' },
  ...STATUSES.map((s) => ({ key: s.key, label: s.label })),
];

function parseItems(raw: string): OrderItem[] {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as OrderItem[];
    return [];
  } catch {
    return [];
  }
}

function formatMoney(n: number): string {
  return `$${n.toFixed(2)}`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('es-VE', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

function shortId(id: string): string {
  return id.slice(0, 8);
}

function getStatusBadge(status: string): string {
  return (
    STATUSES.find((s) => s.key === status)?.badge ??
    'bg-zinc-500/15 text-zinc-300 border-zinc-500/30'
  );
}

function getStatusLabel(status: string): string {
  return STATUSES.find((s) => s.key === status)?.label ?? status;
}

export default function AdminPedidosPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<FilterKey>('todos');
  const [refreshKey, setRefreshKey] = useState(0);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteOpenFor, setDeleteOpenFor] = useState<string | null>(null);
  const [viewOrder, setViewOrder] = useState<Order | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    const qs = filter !== 'todos' ? `?status=${filter}` : '';
    fetch(`/api/admin/orders${qs}`, { cache: 'no-store' })
      .then(async (r) => {
        if (!r.ok) throw new Error('Error al cargar pedidos');
        return r.json();
      })
      .then((data) => {
        if (cancelled) return;
        setOrders(Array.isArray(data.orders) ? data.orders : []);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Error desconocido');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filter, refreshKey]);

  const stats = useMemo(() => {
    const total = orders.length;
    const revenue = orders.reduce((sum, o) => sum + (o.total || 0), 0);
    const byStatus: Record<string, number> = {};
    for (const s of STATUSES) byStatus[s.key] = 0;
    for (const o of orders) {
      if (byStatus[o.status] !== undefined) byStatus[o.status] += 1;
    }
    return { total, revenue, byStatus };
  }, [orders]);

  const handleStatusChange = async (orderId: string, newStatus: string) => {
    setUpdatingId(orderId);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || 'Error al actualizar el estado');
      }
      const data = await res.json();
      const updatedStatus: string = data.order?.status ?? newStatus;
      const updatedAt: string =
        data.order?.updatedAt ?? new Date().toISOString();
      setOrders((prev) =>
        prev
          .map((o) =>
            o.id === orderId
              ? { ...o, status: updatedStatus, updatedAt }
              : o,
          )
          // If an active filter is set and the updated order no longer matches
          // it, drop the order from the visible list (it will reappear on the
          // matching tab or on the next refetch).
          .filter(
            (o) => filter === 'todos' || filter === o.status,
          ),
      );
      toast.success('Estado actualizado');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error al actualizar');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleDelete = async (orderId: string) => {
    setDeletingId(orderId);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || 'Error al eliminar el pedido');
      }
      setOrders((prev) => prev.filter((o) => o.id !== orderId));
      if (viewOrder?.id === orderId) setViewOrder(null);
      toast.success('Pedido eliminado');
      setDeleteOpenFor(null);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error al eliminar');
    } finally {
      setDeletingId(null);
    }
  };

  const retry = () => {
    setError('');
    setRefreshKey((k) => k + 1);
  };

  const filteredLabel = filter !== 'todos' ? getStatusLabel(filter) : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-zinc-100">
            Pedidos
          </h1>
          <p className="text-sm text-zinc-400 mt-0.5">
            Gestiona los pedidos de la tienda y su estado.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={retry}
          disabled={loading}
          className="border-zinc-800 bg-[#111] text-zinc-200 hover:bg-zinc-800/60 hover:text-white"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Actualizar
        </Button>
      </div>

      {/* Stats summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-[#111] border border-zinc-800 rounded-xl p-4">
          <div className="flex items-center gap-2 text-zinc-400 text-xs uppercase tracking-wide">
            <ShoppingBag className="h-3.5 w-3.5" />
            Total pedidos
          </div>
          <p className="text-2xl font-extrabold text-zinc-100 mt-2 tabular-nums">
            {stats.total}
          </p>
          {filteredLabel && (
            <p className="text-[11px] text-zinc-500 mt-1">
              Filtrado: {filteredLabel}
            </p>
          )}
        </div>
        <div className="bg-[#111] border border-zinc-800 rounded-xl p-4">
          <div className="flex items-center gap-2 text-zinc-400 text-xs uppercase tracking-wide">
            <DollarSign className="h-3.5 w-3.5" />
            Ingresos totales
          </div>
          <p className="text-2xl font-extrabold text-zinc-100 mt-2 tabular-nums">
            {formatMoney(stats.revenue)}
          </p>
          {filteredLabel && (
            <p className="text-[11px] text-zinc-500 mt-1">
              Filtrado: {filteredLabel}
            </p>
          )}
        </div>
        {/* Status counts: split into 2 compact cards on mobile, fill grid on lg */}
        <div className="bg-[#111] border border-zinc-800 rounded-xl p-4 col-span-2 lg:col-span-2">
          <div className="flex items-center gap-2 text-zinc-400 text-xs uppercase tracking-wide mb-3">
            <Package className="h-3.5 w-3.5" />
            Pedidos por estado
          </div>
          <div className="flex flex-wrap gap-2">
            {STATUSES.map((s) => (
              <div
                key={s.key}
                className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium ${s.badge}`}
              >
                {s.label}
                <span className="tabular-nums opacity-80">
                  {stats.byStatus[s.key] ?? 0}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="bg-[#111] border border-zinc-800 rounded-xl p-3">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => {
            const active = filter === f.key;
            const count =
              f.key === 'todos'
                ? stats.total
                : (stats.byStatus[f.key as StatusKey] ?? 0);
            return (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors border ${
                  active
                    ? 'bg-[#E30613] text-white border-[#E30613]'
                    : 'bg-transparent text-zinc-300 border-zinc-800 hover:bg-zinc-800/60 hover:text-white'
                }`}
              >
                {f.label}
                <span
                  className={`tabular-nums text-xs rounded px-1.5 py-0.5 ${
                    active
                      ? 'bg-white/20 text-white'
                      : 'bg-zinc-800 text-zinc-400'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="bg-[#111] border border-zinc-800 rounded-xl p-10 flex flex-col items-center justify-center gap-3">
          <Loader2 className="h-7 w-7 animate-spin text-[#E30613]" />
          <p className="text-sm text-zinc-400">Cargando pedidos...</p>
        </div>
      )}

      {/* Error state */}
      {!loading && error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6 flex flex-col sm:flex-row sm:items-center gap-4">
          <AlertCircle className="h-6 w-6 text-red-400 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-red-300">
              No se pudieron cargar los pedidos
            </p>
            <p className="text-xs text-red-400/80 mt-0.5">{error}</p>
          </div>
          <Button
            onClick={retry}
            className="bg-[#E30613] hover:bg-[#E30613]/90 text-white"
          >
            <RefreshCw className="h-4 w-4" />
            Reintentar
          </Button>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && orders.length === 0 && (
        <div className="bg-[#111] border border-zinc-800 rounded-xl p-10 flex flex-col items-center justify-center gap-3 text-center">
          <div className="w-12 h-12 rounded-full bg-zinc-800/60 flex items-center justify-center">
            <ShoppingBag className="h-6 w-6 text-zinc-500" />
          </div>
          <p className="text-sm font-semibold text-zinc-200">
            {filter === 'todos'
              ? 'No hay pedidos registrados'
              : `No hay pedidos "${getStatusLabel(filter)}"`}
          </p>
          <p className="text-xs text-zinc-500 max-w-sm">
            {filter === 'todos'
              ? 'Los pedidos que realicen los clientes en la tienda aparecerán aquí.'
              : 'Prueba con otro filtro para ver más pedidos.'}
          </p>
          {filter !== 'todos' && (
            <Button
              variant="outline"
              onClick={() => setFilter('todos')}
              className="mt-1 border-zinc-800 bg-transparent text-zinc-200 hover:bg-zinc-800/60 hover:text-white"
            >
              Ver todos los pedidos
            </Button>
          )}
        </div>
      )}

      {/* Desktop table */}
      {!loading && !error && orders.length > 0 && (
        <div className="hidden md:block bg-[#111] border border-zinc-800 rounded-xl overflow-hidden">
          <div className="max-h-[65vh] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#0a0a0a] sticky top-0 z-10">
                <tr className="text-left text-zinc-400 uppercase text-[11px] tracking-wide">
                  <th className="px-4 py-3 font-semibold">ID</th>
                  <th className="px-4 py-3 font-semibold">Cliente</th>
                  <th className="px-4 py-3 font-semibold text-center">Items</th>
                  <th className="px-4 py-3 font-semibold text-right">Total</th>
                  <th className="px-4 py-3 font-semibold">Estado</th>
                  <th className="px-4 py-3 font-semibold">Fecha</th>
                  <th className="px-4 py-3 font-semibold text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/70">
                {orders.map((o) => {
                  const items = parseItems(o.items);
                  const itemCount = items.reduce(
                    (sum, it) => sum + (it.quantity ?? 1),
                    0,
                  );
                  const isUpdating = updatingId === o.id;
                  return (
                    <tr
                      key={o.id}
                      className="hover:bg-zinc-800/30 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs text-zinc-400">
                          {shortId(o.id)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className="font-medium text-zinc-100">
                            {o.customerName || '—'}
                          </span>
                          <span className="text-xs text-zinc-500 truncate max-w-[220px]">
                            {o.customerEmail}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex items-center gap-1 text-zinc-300 tabular-nums">
                          <Package className="h-3.5 w-3.5 text-zinc-500" />
                          {itemCount}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-zinc-100 tabular-nums">
                        {formatMoney(o.total)}
                      </td>
                      <td className="px-4 py-3">
                        <Select
                          value={o.status}
                          onValueChange={(v) => handleStatusChange(o.id, v)}
                          disabled={isUpdating}
                        >
                          <SelectTrigger
                            size="sm"
                            className={`w-[150px] border-zinc-700 bg-[#0a0a0a] text-zinc-100 hover:bg-zinc-800/60 ${getStatusBadge(
                              o.status,
                            )}`}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-[#111] border-zinc-700 text-zinc-100">
                            {STATUSES.map((s) => (
                              <SelectItem
                                key={s.key}
                                value={s.key}
                                className="focus:bg-zinc-800 focus:text-white"
                              >
                                {s.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-zinc-400">
                          {formatDate(o.createdAt)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setViewOrder(o)}
                            className="text-zinc-300 hover:bg-zinc-800 hover:text-white"
                            aria-label="Ver detalle"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setDeleteOpenFor(o.id)}
                            className="text-zinc-400 hover:bg-red-500/15 hover:text-red-300"
                            aria-label="Eliminar pedido"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Mobile cards */}
      {!loading && !error && orders.length > 0 && (
        <div className="md:hidden space-y-3 max-h-[70vh] overflow-y-auto pr-1">
          {orders.map((o) => {
            const items = parseItems(o.items);
            const itemCount = items.reduce(
              (sum, it) => sum + (it.quantity ?? 1),
              0,
            );
            const isUpdating = updatingId === o.id;
            return (
              <div
                key={o.id}
                className="bg-[#111] border border-zinc-800 rounded-xl p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-mono text-[11px] text-zinc-500">
                      #{shortId(o.id)}
                    </p>
                    <p className="font-semibold text-zinc-100 truncate">
                      {o.customerName || '—'}
                    </p>
                    <p className="text-xs text-zinc-500 truncate">
                      {o.customerEmail}
                    </p>
                  </div>
                  <span
                    className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium ${getStatusBadge(
                      o.status,
                    )}`}
                  >
                    {getStatusLabel(o.status)}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-[#0a0a0a] rounded-md py-1.5">
                    <p className="text-[10px] uppercase text-zinc-500">
                      Items
                    </p>
                    <p className="text-sm font-semibold text-zinc-100 tabular-nums">
                      {itemCount}
                    </p>
                  </div>
                  <div className="bg-[#0a0a0a] rounded-md py-1.5">
                    <p className="text-[10px] uppercase text-zinc-500">Total</p>
                    <p className="text-sm font-semibold text-zinc-100 tabular-nums">
                      {formatMoney(o.total)}
                    </p>
                  </div>
                  <div className="bg-[#0a0a0a] rounded-md py-1.5">
                    <p className="text-[10px] uppercase text-zinc-500">Fecha</p>
                    <p className="text-[11px] font-medium text-zinc-200 leading-tight pt-0.5">
                      {formatDate(o.createdAt)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Select
                    value={o.status}
                    onValueChange={(v) => handleStatusChange(o.id, v)}
                    disabled={isUpdating}
                  >
                    <SelectTrigger
                      size="sm"
                      className={`flex-1 border-zinc-700 bg-[#0a0a0a] text-zinc-100 hover:bg-zinc-800/60 ${getStatusBadge(
                        o.status,
                      )}`}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#111] border-zinc-700 text-zinc-100">
                      {STATUSES.map((s) => (
                        <SelectItem
                          key={s.key}
                          value={s.key}
                          className="focus:bg-zinc-800 focus:text-white"
                        >
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setViewOrder(o)}
                    className="border-zinc-700 bg-[#0a0a0a] text-zinc-200 hover:bg-zinc-800 hover:text-white"
                    aria-label="Ver detalle"
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setDeleteOpenFor(o.id)}
                    className="border-zinc-700 bg-[#0a0a0a] text-zinc-300 hover:bg-red-500/15 hover:text-red-300 hover:border-red-500/40"
                    aria-label="Eliminar pedido"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Details dialog */}
      <Dialog
        open={viewOrder !== null}
        onOpenChange={(open) => {
          if (!open) setViewOrder(null);
        }}
      >
        <DialogContent className="sm:max-w-2xl bg-[#111] border-zinc-800 text-zinc-100">
          <DialogHeader>
            <DialogTitle className="text-zinc-100">Detalle del pedido</DialogTitle>
            <DialogDescription className="text-zinc-400">
              Información completa del pedido y sus artículos.
            </DialogDescription>
          </DialogHeader>

          {viewOrder && (
            <div className="space-y-5 max-h-[70vh] overflow-y-auto pr-1">
              {/* Status + ID */}
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 text-sm">
                  <Hash className="h-4 w-4 text-zinc-500" />
                  <span className="font-mono text-zinc-300">
                    {viewOrder.id}
                  </span>
                </div>
                <span
                  className={`inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-medium ${getStatusBadge(
                    viewOrder.status,
                  )}`}
                >
                  {getStatusLabel(viewOrder.status)}
                </span>
              </div>

              {/* Customer */}
              <div className="bg-[#0a0a0a] border border-zinc-800 rounded-lg p-4 space-y-2.5">
                <p className="text-xs uppercase tracking-wide text-zinc-500 font-semibold">
                  Cliente
                </p>
                <div className="flex items-start gap-2.5 text-sm">
                  <User className="h-4 w-4 text-zinc-500 mt-0.5" />
                  <div>
                    <p className="text-zinc-100 font-medium">
                      {viewOrder.customerName || '—'}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-2.5 text-sm">
                  <Mail className="h-4 w-4 text-zinc-500 mt-0.5" />
                  <a
                    href={`mailto:${viewOrder.customerEmail}`}
                    className="text-zinc-300 hover:text-white break-all"
                  >
                    {viewOrder.customerEmail}
                  </a>
                </div>
                {viewOrder.customerPhone && (
                  <div className="flex items-start gap-2.5 text-sm">
                    <Phone className="h-4 w-4 text-zinc-500 mt-0.5" />
                    <a
                      href={`tel:${viewOrder.customerPhone}`}
                      className="text-zinc-300 hover:text-white"
                    >
                      {viewOrder.customerPhone}
                    </a>
                  </div>
                )}
              </div>

              {/* Items */}
              <div className="bg-[#0a0a0a] border border-zinc-800 rounded-lg p-4 space-y-3">
                <p className="text-xs uppercase tracking-wide text-zinc-500 font-semibold">
                  Artículos
                </p>
                {parseItems(viewOrder.items).length === 0 ? (
                  <p className="text-sm text-zinc-500">
                    No hay artículos registrados.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {parseItems(viewOrder.items).map((it, idx) => (
                      <li
                        key={idx}
                        className="flex items-start justify-between gap-3 py-2 border-b border-zinc-800/60 last:border-b-0 last:pb-0"
                      >
                        <div className="min-w-0 space-y-1">
                          <p className="text-sm font-medium text-zinc-100">
                            {it.name || 'Producto'}
                          </p>
                          <div className="flex flex-wrap items-center gap-1.5">
                            {it.selectedSize && (
                              <span className="inline-flex items-center gap-1 text-[11px] text-zinc-400 bg-zinc-800/60 rounded px-1.5 py-0.5">
                                <Tag className="h-3 w-3" />
                                {it.selectedSize}
                              </span>
                            )}
                            {it.selectedColor && (
                              <span className="inline-flex items-center gap-1 text-[11px] text-zinc-400 bg-zinc-800/60 rounded px-1.5 py-0.5">
                                <span
                                  className="h-2.5 w-2.5 rounded-full border border-zinc-600"
                                  style={{
                                    backgroundColor: it.selectedColor,
                                  }}
                                />
                                {it.selectedColor}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-xs text-zinc-400 tabular-nums">
                            {it.quantity ?? 1} x{' '}
                            {formatMoney(it.price ?? 0)}
                          </p>
                          <p className="text-sm font-semibold text-zinc-100 tabular-nums">
                            {formatMoney(
                              (it.price ?? 0) * (it.quantity ?? 1),
                            )}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex items-center justify-between pt-2 border-t border-zinc-800">
                  <span className="text-sm font-semibold text-zinc-200">
                    Total
                  </span>
                  <span className="text-lg font-extrabold text-[#E30613] tabular-nums">
                    {formatMoney(viewOrder.total)}
                  </span>
                </div>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[#0a0a0a] border border-zinc-800 rounded-lg p-3">
                  <p className="text-[11px] uppercase tracking-wide text-zinc-500 font-semibold flex items-center gap-1.5">
                    <Calendar className="h-3 w-3" />
                    Creado
                  </p>
                  <p className="text-sm text-zinc-200 mt-1">
                    {formatDate(viewOrder.createdAt)}
                  </p>
                </div>
                <div className="bg-[#0a0a0a] border border-zinc-800 rounded-lg p-3">
                  <p className="text-[11px] uppercase tracking-wide text-zinc-500 font-semibold flex items-center gap-1.5">
                    <RefreshCw className="h-3 w-3" />
                    Actualizado
                  </p>
                  <p className="text-sm text-zinc-200 mt-1">
                    {formatDate(viewOrder.updatedAt)}
                  </p>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <DialogClose asChild>
                  <Button
                    variant="outline"
                    className="border-zinc-700 bg-transparent text-zinc-200 hover:bg-zinc-800 hover:text-white"
                  >
                    Cerrar
                  </Button>
                </DialogClose>
                <Button
                  onClick={() => setDeleteOpenFor(viewOrder.id)}
                  className="bg-[#E30613] hover:bg-[#E30613]/90 text-white"
                >
                  <Trash2 className="h-4 w-4" />
                  Eliminar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog
        open={deleteOpenFor !== null}
        onOpenChange={(open) => {
          if (!open && deletingId === null) setDeleteOpenFor(null);
        }}
      >
        <AlertDialogContent className="bg-[#111] border-zinc-800 text-zinc-100">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-zinc-100">
              ¿Eliminar este pedido?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              Esta acción no se puede deshacer. El pedido se eliminará
              permanentemente de la base de datos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={deletingId !== null}
              className="border-zinc-700 bg-transparent text-zinc-200 hover:bg-zinc-800 hover:text-white"
            >
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={deletingId !== null}
              onClick={(e) => {
                e.preventDefault();
                if (deleteOpenFor) handleDelete(deleteOpenFor);
              }}
              className="bg-[#E30613] hover:bg-[#E30613]/90 text-white focus:ring-[#E30613]/40"
            >
              {deletingId !== null ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Eliminando...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4" />
                  Eliminar pedido
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Toaster theme="dark" position="top-right" />
    </div>
  );
}
