'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Plus,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  Image as ImageIcon,
  Loader2,
  Monitor,
  Smartphone,
  Layers,
  AlertCircle,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Toaster } from '@/components/ui/sonner';
import MediaUploader from '@/components/admin/MediaUploader';

interface Banner {
  id: string;
  title: string;
  imageUrl: string;
  link: string | null;
  placement: string; // 'desktop' | 'mobile' | 'both'
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
}

type Placement = 'desktop' | 'mobile' | 'both';

const placementConfig: Record<
  Placement,
  { label: string; icon: typeof Monitor; color: string; bg: string }
> = {
  desktop: {
    label: 'Escritorio',
    icon: Monitor,
    color: 'text-blue-300',
    bg: 'bg-blue-500/15 border-blue-500/30',
  },
  mobile: {
    label: 'Móvil',
    icon: Smartphone,
    color: 'text-green-300',
    bg: 'bg-green-500/15 border-green-500/30',
  },
  both: {
    label: 'Ambos',
    icon: Layers,
    color: 'text-purple-300',
    bg: 'bg-purple-500/15 border-purple-500/30',
  },
};

export default function AdminBannersPage() {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingBanner, setEditingBanner] = useState<Banner | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Banner | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formTitle, setFormTitle] = useState('');
  const [formImageUrl, setFormImageUrl] = useState('');
  const [formLink, setFormLink] = useState('');
  const [formPlacement, setFormPlacement] = useState<Placement>('both');
  const [formIsActive, setFormIsActive] = useState(true);

  const fetchBanners = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/banners', { cache: 'no-store' });
      if (!res.ok) throw new Error('Error al cargar banners');
      const data = await res.json();
      setBanners(data.banners || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBanners();
  }, [fetchBanners]);

  const openCreate = () => {
    setEditingBanner(null);
    setFormTitle('');
    setFormImageUrl('');
    setFormLink('');
    setFormPlacement('both');
    setFormIsActive(true);
    setDialogOpen(true);
  };

  const openEdit = (banner: Banner) => {
    setEditingBanner(banner);
    setFormTitle(banner.title);
    setFormImageUrl(banner.imageUrl);
    setFormLink(banner.link || '');
    setFormPlacement(banner.placement as Placement);
    setFormIsActive(banner.isActive);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formTitle.trim() || !formImageUrl.trim()) {
      toast.error('Título e imagen son obligatorios');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: formTitle.trim(),
        imageUrl: formImageUrl.trim(),
        link: formLink.trim() || null,
        placement: formPlacement,
        isActive: formIsActive,
        sortOrder: editingBanner?.sortOrder ?? banners.length,
      };
      const url = editingBanner
        ? `/api/admin/banners/${editingBanner.id}`
        : '/api/admin/banners';
      const method = editingBanner ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        throw new Error(d?.error || 'Error al guardar');
      }
      toast.success(editingBanner ? 'Banner actualizado' : 'Banner creado');
      setDialogOpen(false);
      fetchBanners();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/banners/${deleteTarget.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Error al eliminar');
      toast.success('Banner eliminado');
      setDeleteTarget(null);
      fetchBanners();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al eliminar');
    } finally {
      setDeleting(false);
    }
  };

  const toggleActive = async (banner: Banner) => {
    try {
      const res = await fetch(`/api/admin/banners/${banner.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !banner.isActive }),
      });
      if (!res.ok) throw new Error('Error al actualizar');
      toast.success(banner.isActive ? 'Banner desactivado' : 'Banner activado');
      fetchBanners();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error');
    }
  };

  const moveBanner = async (banner: Banner, direction: 'up' | 'down') => {
    const sorted = [...banners].sort((a, b) => a.sortOrder - b.sortOrder);
    const idx = sorted.findIndex((b) => b.id === banner.id);
    if (idx < 0) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const swapBanner = sorted[swapIdx];
    // Swap sortOrders
    await Promise.all([
      fetch(`/api/admin/banners/${banner.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sortOrder: swapBanner.sortOrder }),
      }),
      fetch(`/api/admin/banners/${swapBanner.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sortOrder: banner.sortOrder }),
      }),
    ]);
    fetchBanners();
  };

  const desktopBanners = banners.filter(
    (b) => (b.placement === 'desktop' || b.placement === 'both') && b.isActive,
  );
  const mobileBanners = banners.filter(
    (b) => (b.placement === 'mobile' || b.placement === 'both') && b.isActive,
  );

  return (
    <div className="space-y-6">
      <Toaster theme="dark" position="top-right" />
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-white">Banners</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Gestiona los banners que aparecen en el hero de tu tienda, para
            escritorio y móvil por separado.
          </p>
        </div>
        <Button
          onClick={openCreate}
          className="bg-[#E30613] hover:bg-[#ff2d34] text-white font-bold cursor-pointer"
        >
          <Plus className="h-4 w-4 mr-2" />
          Nuevo banner
        </Button>
      </div>

      {/* Preview summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-[#111] border border-zinc-800 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-2">
            <Monitor className="h-4 w-4 text-blue-400" />
            <h3 className="text-sm font-bold text-white">Escritorio</h3>
          </div>
          <p className="text-2xl font-extrabold text-white">
            {desktopBanners.length}
          </p>
          <p className="text-xs text-zinc-500 mt-1">
            banners activos ·{' '}
            {desktopBanners.length > 0
              ? 'carrusel visible'
              : 'video scroll por defecto'}
          </p>
        </div>
        <div className="bg-[#111] border border-zinc-800 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-2">
            <Smartphone className="h-4 w-4 text-green-400" />
            <h3 className="text-sm font-bold text-white">Móvil</h3>
          </div>
          <p className="text-2xl font-extrabold text-white">
            {mobileBanners.length}
          </p>
          <p className="text-xs text-zinc-500 mt-1">
            banners activos ·{' '}
            {mobileBanners.length > 0
              ? 'carrusel visible'
              : 'banners por defecto'}
          </p>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-300 rounded-xl p-4 flex items-start gap-2.5">
          <AlertCircle className="h-4.5 w-4.5 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold">{error}</p>
            <button
              onClick={fetchBanners}
              className="text-xs underline mt-1 cursor-pointer"
            >
              Reintentar
            </button>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-[#E30613]" />
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && banners.length === 0 && (
        <div className="bg-[#111] border border-zinc-800 rounded-xl p-12 text-center">
          <ImageIcon className="h-12 w-12 text-zinc-700 mx-auto mb-3" />
          <p className="text-white font-semibold mb-1">No hay banners</p>
          <p className="text-sm text-zinc-500 mb-4">
            Crea tu primer banner para personalizar el hero de tu tienda.
          </p>
          <Button
            onClick={openCreate}
            className="bg-[#E30613] hover:bg-[#ff2d34] text-white font-bold cursor-pointer"
          >
            <Plus className="h-4 w-4 mr-2" />
            Crear banner
          </Button>
        </div>
      )}

      {/* Banner list */}
      {!loading && banners.length > 0 && (
        <div className="space-y-3">
          {[...banners]
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((banner, index) => {
              const pc = placementConfig[banner.placement as Placement] || placementConfig.both;
              const PIcon = pc.icon;
              return (
                <div
                  key={banner.id}
                  className={`bg-[#111] border rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-4 ${
                    banner.isActive ? 'border-zinc-800' : 'border-zinc-800/50 opacity-60'
                  }`}
                >
                  {/* Preview */}
                  <div className="relative w-full sm:w-32 h-24 rounded-lg overflow-hidden bg-zinc-900 flex-shrink-0">
                    <img
                      src={banner.imageUrl}
                      alt={banner.title}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                    {!banner.isActive && (
                      <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                        <EyeOff className="h-5 w-5 text-zinc-400" />
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h3 className="text-sm font-bold text-white truncate">
                        {banner.title}
                      </h3>
                      <span
                        className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded border ${pc.bg} ${pc.color}`}
                      >
                        <PIcon className="h-3 w-3" />
                        {pc.label}
                      </span>
                      {banner.link && (
                        <span className="text-[10px] text-zinc-500 truncate max-w-[150px]">
                          → {banner.link}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-500 font-mono truncate">
                      {banner.imageUrl}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {/* Move up/down */}
                    <div className="flex flex-col">
                      <button
                        onClick={() => moveBanner(banner, 'up')}
                        disabled={index === 0}
                        className="text-zinc-500 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer p-1"
                        aria-label="Mover arriba"
                        title="Mover arriba"
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => moveBanner(banner, 'down')}
                        disabled={index === banners.length - 1}
                        className="text-zinc-500 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer p-1"
                        aria-label="Mover abajo"
                        title="Mover abajo"
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {/* Toggle active */}
                    <button
                      onClick={() => toggleActive(banner)}
                      className={`p-2 rounded-lg transition-colors cursor-pointer ${
                        banner.isActive
                          ? 'text-green-400 hover:bg-green-500/10'
                          : 'text-zinc-500 hover:bg-zinc-800'
                      }`}
                      aria-label={banner.isActive ? 'Desactivar' : 'Activar'}
                      title={banner.isActive ? 'Desactivar' : 'Activar'}
                    >
                      {banner.isActive ? (
                        <Eye className="h-4 w-4" />
                      ) : (
                        <EyeOff className="h-4 w-4" />
                      )}
                    </button>

                    {/* Edit */}
                    <button
                      onClick={() => openEdit(banner)}
                      className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
                      aria-label="Editar"
                      title="Editar"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>

                    {/* Delete */}
                    <button
                      onClick={() => setDeleteTarget(banner)}
                      className="p-2 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                      aria-label="Eliminar"
                      title="Eliminar"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-[#111] border-zinc-800 text-zinc-100 max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-white">
              {editingBanner ? 'Editar banner' : 'Nuevo banner'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Title */}
            <div>
              <Label htmlFor="banner-title" className="text-zinc-300 text-xs uppercase tracking-wider">
                Título
              </Label>
              <Input
                id="banner-title"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder="Ej: Colección Verano 2026"
                className="bg-[#0a0a0a] border-zinc-800 text-white mt-1.5"
              />
            </div>

            {/* Image upload + URL */}
            <MediaUploader
              type="image"
              value={formImageUrl}
              onChange={setFormImageUrl}
              label="Imagen del banner"
            />

            {/* Link */}
            <div>
              <Label htmlFor="banner-link" className="text-zinc-300 text-xs uppercase tracking-wider">
                Enlace (opcional)
              </Label>
              <Input
                id="banner-link"
                value={formLink}
                onChange={(e) => setFormLink(e.target.value)}
                placeholder="#collection o /admin/productos"
                className="bg-[#0a0a0a] border-zinc-800 text-white mt-1.5"
              />
              <p className="text-[11px] text-zinc-500 mt-1">
                Si se especifica, el banner será clickeable y redigirá a esta URL.
              </p>
            </div>

            {/* Placement */}
            <div>
              <Label className="text-zinc-300 text-xs uppercase tracking-wider">
                Mostrar en
              </Label>
              <div className="grid grid-cols-3 gap-2 mt-1.5">
                {(Object.keys(placementConfig) as Placement[]).map((p) => {
                  const cfg = placementConfig[p];
                  const PI = cfg.icon;
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setFormPlacement(p)}
                      className={`flex flex-col items-center gap-1.5 py-3 rounded-lg border text-xs font-semibold transition-all cursor-pointer ${
                        formPlacement === p
                          ? `${cfg.bg} ${cfg.color} border-current`
                          : 'border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300'
                      }`}
                    >
                      <PI className="h-4 w-4" />
                      {cfg.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Active toggle */}
            <label className="flex items-center gap-3 cursor-pointer">
              <button
                type="button"
                onClick={() => setFormIsActive(!formIsActive)}
                className={`relative w-10 h-6 rounded-full transition-colors ${
                  formIsActive ? 'bg-[#E30613]' : 'bg-zinc-700'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                    formIsActive ? 'translate-x-4' : ''
                  }`}
                />
              </button>
              <span className="text-sm text-zinc-300">
                {formIsActive ? 'Activo (visible en la tienda)' : 'Inactivo (oculto)'}
              </span>
            </label>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="ghost"
              onClick={() => setDialogOpen(false)}
              className="text-zinc-400 hover:text-white cursor-pointer"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-[#E30613] hover:bg-[#ff2d34] text-white font-bold cursor-pointer"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Guardando...
                </>
              ) : editingBanner ? (
                'Guardar cambios'
              ) : (
                'Crear banner'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent className="bg-[#111] border-zinc-800 text-zinc-100">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">
              Eliminar banner
            </AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              ¿Seguro que deseas eliminar el banner{' '}
              <span className="font-semibold text-zinc-200">
                {deleteTarget?.title}
              </span>
              ? Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800 cursor-pointer">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700 text-white cursor-pointer"
            >
              {deleting ? 'Eliminando...' : 'Eliminar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
