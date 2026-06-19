'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  Package,
  Star,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
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
import MediaUploader from '@/components/admin/MediaUploader';

interface Product {
  id: string;
  name: string;
  slug: string;
  category: string;
  gender?: string;
  price: number;
  originalPrice: number | null;
  image: string;
  description: string;
  video: string | null;
  isNew: boolean;
  isBestSeller: boolean;
  rating: number;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  _count: { reviews: number };
  images?: { id: string; url: string; colorName: string | null; sortOrder: number }[];
  colors?: { id: string; name: string; hex: string }[];
}

const FILTER_CATEGORIES = ['Todos', 'Hoodies', 'Suéters', 'Franelas', 'Shorts'];
const PRODUCT_CATEGORIES = ['Hoodies', 'Suéters', 'Franelas', 'Shorts'];

interface ColorEntry {
  name: string;
  hex: string;
  /** Multiple images for this color (gallery). At least 1 required. */
  imageUrls: string[];
}

interface FormState {
  name: string;
  slug: string;
  category: string;
  gender: 'hombre' | 'mujer';
  price: string;
  originalPrice: string;
  image: string;
  description: string;
  video: string;
  isNew: boolean;
  isBestSeller: boolean;
  colors: ColorEntry[];
}

const EMPTY_FORM: FormState = {
  name: '',
  slug: '',
  category: PRODUCT_CATEGORIES[0],
  gender: 'hombre',
  price: '',
  originalPrice: '',
  image: '',
  description: '',
  video: '',
  isNew: false,
  isBestSeller: false,
  colors: [],
};

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function formatPrice(n: number): string {
  return `$${n.toFixed(2)}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-VE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export default function AdminProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('Todos');

  const [refreshKey, setRefreshKey] = useState(0);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Load products (setStates only inside async callbacks to comply with
  // react-hooks/set-state-in-effect). Re-runs when filters or refreshKey change.
  useEffect(() => {
    const params = new URLSearchParams();
    if (search.trim()) params.set('q', search.trim());
    if (category && category !== 'Todos') params.set('category', category);

    let cancelled = false;
    fetch(`/api/admin/products?${params.toString()}`, { cache: 'no-store' })
      .then((r) => {
        if (!r.ok) throw new Error('Error al cargar productos');
        return r.json();
      })
      .then((d) => {
        if (!cancelled) setProducts(d.products || []);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [search, category, refreshKey]);

  const refetch = () => {
    setLoading(true);
    setError('');
    setRefreshKey((k) => k + 1);
  };

  const handleNameChange = (name: string) => {
    setForm((prev) => {
      if (editingId) {
        return { ...prev, name };
      }
      return { ...prev, name, slug: slugify(name) };
    });
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (p: Product) => {
    setEditingId(p.id);
    // Build colors array from the product's colors + their images.
    // Each color gets ALL its images (gallery) from ProductImage, or the
    // product's main image as fallback if none exist for that color.
    const productColors = p.colors && p.colors.length > 0
      ? p.colors.map((c) => {
          const colorImgs = (p.images || [])
            .filter((img) => img.colorName === c.name)
            .map((img) => img.url);
          return {
            name: c.name,
            hex: c.hex,
            imageUrls: colorImgs.length > 0 ? colorImgs : [p.image],
          };
        })
      : [];
    setForm({
      name: p.name,
      slug: p.slug,
      category: PRODUCT_CATEGORIES.includes(p.category) ? p.category : PRODUCT_CATEGORIES[0],
      gender: p.gender === 'mujer' ? 'mujer' : 'hombre',
      price: String(p.price ?? ''),
      originalPrice: p.originalPrice != null ? String(p.originalPrice) : '',
      image: p.image,
      description: p.description,
      video: p.video ?? '',
      isNew: p.isNew,
      isBestSeller: p.isBestSeller,
      colors: productColors,
    });
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !form.name.trim() ||
      !form.slug.trim() ||
      !form.category ||
      !form.price ||
      !form.image.trim() ||
      !form.description.trim()
    ) {
      toast.error('Completa todos los campos obligatorios');
      return;
    }

    const priceNum = Number(form.price);
    if (Number.isNaN(priceNum) || priceNum < 0) {
      toast.error('El precio no es válido');
      return;
    }

    setSaving(true);
    // Build colorImages: Record<colorName, string[]> for the API.
    // Each color can have MULTIPLE images (gallery). Filter out empty URLs
    // and fall back to the main product image if a color has none.
    const mainImg = form.image.trim();
    const colorImages: Record<string, string[]> = {};
    for (const c of form.colors) {
      if (c.name.trim()) {
        const imgs = c.imageUrls.map((u) => u.trim()).filter(Boolean);
        const finalImgs = imgs.length > 0 ? imgs : (mainImg ? [mainImg] : []);
        if (finalImgs.length > 0) {
          colorImages[c.name.trim()] = finalImgs;
        }
      }
    }
    const payload = {
      name: form.name.trim(),
      slug: form.slug.trim(),
      category: form.category,
      gender: form.gender,
      price: priceNum,
      originalPrice: form.originalPrice ? Number(form.originalPrice) : null,
      image: form.image.trim(),
      description: form.description.trim(),
      video: form.video.trim() || null,
      isNew: form.isNew,
      isBestSeller: form.isBestSeller,
      colors: form.colors
        .filter((c) => c.name.trim())
        .map((c) => ({ name: c.name.trim(), hex: c.hex.trim() || '#000000' })),
      colorImages: Object.keys(colorImages).length > 0 ? colorImages : undefined,
    };

    try {
      if (editingId) {
        const res = await fetch(`/api/admin/products/${editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => null);
          throw new Error(d?.error || 'Error al actualizar el producto');
        }
        toast.success('Producto actualizado correctamente');
      } else {
        const res = await fetch('/api/admin/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => null);
          throw new Error(d?.error || 'Error al crear el producto');
        }
        toast.success('Producto creado correctamente');
      }
      setDialogOpen(false);
      refetch();
      // Notify other tabs (e.g., the storefront) that products changed so
      // they re-fetch fresh data. The storefront listens to the `storage`
      // event and invalidates its in-memory product cache.
      try {
        localStorage.setItem('n10k-products-updated', String(Date.now()));
      } catch {
        // ignore storage errors
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/products/${deleteTarget.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        throw new Error(d?.error || 'Error al eliminar el producto');
      }
      toast.success('Producto eliminado correctamente');
      setDeleteTarget(null);
      refetch();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      toast.error(msg);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Toaster richColors position="top-right" />

      {/* Header + new product button */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-white">Productos</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Administra el catálogo de tu tienda
          </p>
        </div>
        <Button
          onClick={openCreate}
          className="bg-[#E30613] hover:bg-[#c40510] text-white border-transparent"
        >
          <Plus className="h-4 w-4" />
          Nuevo producto
        </Button>
      </div>

      {/* Filters */}
      <div className="bg-[#111] border border-zinc-800 rounded-xl p-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500 pointer-events-none" />
          <Input
            placeholder="Buscar por nombre o slug..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-[#0a0a0a] border-zinc-800 text-zinc-100 placeholder:text-zinc-600"
          />
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-full sm:w-48 bg-[#0a0a0a] border-zinc-800 text-zinc-100">
            <SelectValue placeholder="Categoría" />
          </SelectTrigger>
          <SelectContent className="bg-[#111] border-zinc-800 text-zinc-100">
            {FILTER_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-300 rounded-xl p-4">
          <p className="font-semibold mb-1">Error</p>
          <p className="text-sm">{error}</p>
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin h-8 w-8 border-2 border-[#E30613] border-t-transparent rounded-full" />
        </div>
      ) : products.length === 0 ? (
        <div className="bg-[#111] border border-zinc-800 rounded-xl p-10 text-center">
          <Package className="h-10 w-10 text-zinc-600 mx-auto mb-3" />
          <p className="text-sm text-zinc-400 font-semibold">No hay productos</p>
          <p className="text-xs text-zinc-600 mt-1">
            Crea tu primer producto para verlo aquí
          </p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block bg-[#111] border border-zinc-800 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[#0a0a0a]/50 border-b border-zinc-800">
                  <tr className="text-left text-zinc-400">
                    <th className="px-4 py-3 font-semibold">Producto</th>
                    <th className="px-4 py-3 font-semibold">Categoría</th>
                    <th className="px-4 py-3 font-semibold">Precio</th>
                    <th className="px-4 py-3 font-semibold">Etiquetas</th>
                    <th className="px-4 py-3 font-semibold">Reseñas</th>
                    <th className="px-4 py-3 font-semibold">Creado</th>
                    <th className="px-4 py-3 font-semibold text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {products.map((p) => (
                    <tr
                      key={p.id}
                      className="hover:bg-zinc-800/30 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <img
                            src={p.image}
                            alt={p.name}
                            className="w-11 h-11 rounded-lg object-cover bg-zinc-800 flex-shrink-0"
                          />
                          <div className="min-w-0">
                            <p className="font-semibold text-white truncate">
                              {p.name}
                            </p>
                            <p className="text-xs text-zinc-500 truncate">
                              {p.slug}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-zinc-300">{p.category}</td>
                      <td className="px-4 py-3">
                        <p className="font-bold text-white">
                          {formatPrice(p.price)}
                        </p>
                        {p.originalPrice != null &&
                          p.originalPrice > p.price && (
                            <p className="text-xs text-zinc-500 line-through">
                              {formatPrice(p.originalPrice)}
                            </p>
                          )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {p.isNew && (
                            <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded bg-[#E30613]/15 text-[#E30613] border border-[#E30613]/30">
                              NUEVO
                            </span>
                          )}
                          {p.isBestSeller && (
                            <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                              TOP VENTAS
                            </span>
                          )}
                          {!p.isNew && !p.isBestSeller && (
                            <span className="text-xs text-zinc-600">—</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 text-zinc-300">
                          <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                          <span className="font-semibold">
                            {p.rating.toFixed(1)}
                          </span>
                          <span className="text-xs text-zinc-500">
                            ({p._count.reviews})
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-zinc-400 text-xs">
                        {formatDate(p.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-zinc-400 hover:text-white hover:bg-zinc-800"
                            onClick={() => openEdit(p)}
                            aria-label="Editar producto"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-zinc-400 hover:text-[#E30613] hover:bg-[#E30613]/10"
                            onClick={() => setDeleteTarget(p)}
                            aria-label="Eliminar producto"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {products.map((p) => (
              <div
                key={p.id}
                className="bg-[#111] border border-zinc-800 rounded-xl p-4"
              >
                <div className="flex items-start gap-3">
                  <img
                    src={p.image}
                    alt={p.name}
                    className="w-14 h-14 rounded-lg object-cover bg-zinc-800 flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-white truncate">{p.name}</p>
                    <p className="text-xs text-zinc-500 truncate">{p.slug}</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {p.isNew && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#E30613]/15 text-[#E30613] border border-[#E30613]/30">
                          NUEVO
                        </span>
                      )}
                      {p.isBestSeller && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                          TOP VENTAS
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-white">
                      {formatPrice(p.price)}
                    </p>
                    {p.originalPrice != null &&
                      p.originalPrice > p.price && (
                        <p className="text-xs text-zinc-500 line-through">
                          {formatPrice(p.originalPrice)}
                        </p>
                      )}
                  </div>
                </div>
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-zinc-800/60">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                    <span className="px-2 py-0.5 rounded bg-zinc-800/60">
                      {p.category}
                    </span>
                    <span className="flex items-center gap-1">
                      <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                      {p.rating.toFixed(1)} ({p._count.reviews})
                    </span>
                    <span>{formatDate(p.createdAt)}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-zinc-400 hover:text-white hover:bg-zinc-800"
                      onClick={() => openEdit(p)}
                      aria-label="Editar producto"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-zinc-400 hover:text-[#E30613] hover:bg-[#E30613]/10"
                      onClick={() => setDeleteTarget(p)}
                      aria-label="Eliminar producto"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Create / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-[#111] border-zinc-800 text-zinc-100 sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white text-lg font-bold">
              {editingId ? 'Editar producto' : 'Nuevo producto'}
            </DialogTitle>
            <DialogDescription className="text-zinc-500">
              {editingId
                ? 'Actualiza los datos del producto'
                : 'Completa el formulario para crear un producto'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="name" className="text-zinc-300">
                  Nombre <span className="text-[#E30613]">*</span>
                </Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="Hoodie Bold"
                  className="bg-[#0a0a0a] border-zinc-800 text-zinc-100 placeholder:text-zinc-600"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="slug" className="text-zinc-300">
                  Slug <span className="text-[#E30613]">*</span>
                </Label>
                <Input
                  id="slug"
                  value={form.slug}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, slug: e.target.value }))
                  }
                  placeholder="hoodie-bold"
                  className="bg-[#0a0a0a] border-zinc-800 text-zinc-100 placeholder:text-zinc-600"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="gender" className="text-zinc-300">
                  Género <span className="text-[#E30613]">*</span>
                </Label>
                <Select
                  value={form.gender}
                  onValueChange={(v) =>
                    setForm((p) => ({ ...p, gender: v as 'hombre' | 'mujer' }))
                  }
                >
                  <SelectTrigger
                    id="gender"
                    className="bg-[#0a0a0a] border-zinc-800 text-zinc-100 w-full"
                  >
                    <SelectValue placeholder="Género" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#111] border-zinc-800 text-zinc-100">
                    <SelectItem value="hombre">Hombre</SelectItem>
                    <SelectItem value="mujer">Mujer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="category" className="text-zinc-300">
                  Categoría <span className="text-[#E30613]">*</span>
                </Label>
                <Select
                  value={form.category}
                  onValueChange={(v) =>
                    setForm((p) => ({ ...p, category: v }))
                  }
                >
                  <SelectTrigger
                    id="category"
                    className="bg-[#0a0a0a] border-zinc-800 text-zinc-100 w-full"
                  >
                    <SelectValue placeholder="Categoría" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#111] border-zinc-800 text-zinc-100">
                    {PRODUCT_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="price" className="text-zinc-300">
                  Precio <span className="text-[#E30613]">*</span>
                </Label>
                <Input
                  id="price"
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.price}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, price: e.target.value }))
                  }
                  placeholder="0.00"
                  className="bg-[#0a0a0a] border-zinc-800 text-zinc-100 placeholder:text-zinc-600"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="originalPrice" className="text-zinc-300">
                  Precio original
                </Label>
                <Input
                  id="originalPrice"
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.originalPrice}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, originalPrice: e.target.value }))
                  }
                  placeholder="0.00"
                  className="bg-[#0a0a0a] border-zinc-800 text-zinc-100 placeholder:text-zinc-600"
                />
              </div>
            </div>

            <MediaUploader
              type="image"
              value={form.image}
              onChange={(url) =>
                setForm((p) => {
                  // When the main product image changes, propagate the change
                  // to the FIRST image of each color (replace the old main
                  // image wherever it appears). The storefront displays per-color
                  // images (colorImages) in preference to the main `image`, so
                  // if we only update `image` the old per-color images would
                  // still show.
                  const oldImage = p.image;
                  return {
                    ...p,
                    image: url,
                    colors: p.colors.map((c) => {
                      // If the color had no images, start with [newUrl].
                      // If its first image was the old main image, replace it.
                      // Otherwise keep its gallery as-is.
                      if (c.imageUrls.length === 0) {
                        return { ...c, imageUrls: [url] };
                      }
                      const firstUrl = c.imageUrls[0];
                      if (firstUrl === oldImage || !firstUrl) {
                        return { ...c, imageUrls: [url, ...c.imageUrls.slice(1)] };
                      }
                      return c;
                    }),
                  };
                })
              }
              label="Imagen del producto *"
            />

            <div className="space-y-1.5">
              <Label htmlFor="description" className="text-zinc-300">
                Descripción <span className="text-[#E30613]">*</span>
              </Label>
              <Textarea
                id="description"
                value={form.description}
                onChange={(e) =>
                  setForm((p) => ({ ...p, description: e.target.value }))
                }
                placeholder="Descripción del producto..."
                className="bg-[#0a0a0a] border-zinc-800 text-zinc-100 placeholder:text-zinc-600 min-h-24"
                required
              />
            </div>

            <MediaUploader
              type="video"
              value={form.video}
              onChange={(url) => setForm((p) => ({ ...p, video: url }))}
              label="Video del producto (opcional)"
            />

            {/* Colors & per-color images */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <Label className="text-zinc-300">
                  Colores e imágenes por color
                </Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setForm((p) => ({
                      ...p,
                      colors: [...p.colors, { name: '', hex: '#000000', imageUrls: [] }],
                    }))
                  }
                  className="border-zinc-700 text-zinc-300 hover:text-white hover:bg-zinc-800 cursor-pointer h-8"
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Añadir color
                </Button>
              </div>
              <p className="text-[11px] text-zinc-500 -mt-1">
                Cada color puede tener múltiples imágenes (galería). La tienda muestra la galería del color seleccionado.
              </p>

              {form.colors.length === 0 && (
                <div className="text-xs text-zinc-600 py-3 text-center border border-dashed border-zinc-800 rounded-lg">
                  Sin colores. La tienda usará la imagen principal del producto.
                </div>
              )}

              {form.colors.map((color, idx) => (
                <div
                  key={idx}
                  className="bg-[#0a0a0a] border border-zinc-800 rounded-xl p-3 space-y-3"
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={color.hex}
                      onChange={(e) => {
                        const hex = e.target.value;
                        setForm((p) => ({
                          ...p,
                          colors: p.colors.map((c, i) => (i === idx ? { ...c, hex } : c)),
                        }));
                      }}
                      className="w-9 h-9 rounded-lg border border-zinc-700 cursor-pointer bg-transparent p-0.5"
                      aria-label="Color"
                    />
                    <Input
                      value={color.name}
                      onChange={(e) => {
                        const name = e.target.value;
                        setForm((p) => ({
                          ...p,
                          colors: p.colors.map((c, i) => (i === idx ? { ...c, name } : c)),
                        }));
                      }}
                      placeholder="Nombre del color (ej: Negro)"
                      className="flex-1 bg-[#111] border-zinc-800 text-zinc-100 h-9"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        setForm((p) => ({
                          ...p,
                          colors: p.colors.filter((_, i) => i !== idx),
                        }))
                      }
                      className="text-zinc-500 hover:text-red-400 hover:bg-red-500/10 h-9 w-9 cursor-pointer"
                      aria-label="Eliminar color"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* Gallery: multiple images per color */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                        Imágenes del color {color.name || `#${idx + 1}`} ({color.imageUrls.length})
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setForm((p) => ({
                            ...p,
                            colors: p.colors.map((c, i) =>
                              i === idx ? { ...c, imageUrls: [...c.imageUrls, ''] } : c,
                            ),
                          }))
                        }
                        className="border-zinc-700 text-zinc-300 hover:text-white hover:bg-zinc-800 cursor-pointer h-7 text-xs"
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        Añadir imagen
                      </Button>
                    </div>

                    {color.imageUrls.length === 0 && (
                      <p className="text-[11px] text-zinc-600 py-2 text-center border border-dashed border-zinc-800 rounded-lg">
                        Sin imágenes. Al guardar, se usará la imagen principal del producto.
                      </p>
                    )}

                    {color.imageUrls.map((imgUrl, imgIdx) => (
                      <div key={imgIdx} className="bg-[#111] border border-zinc-800 rounded-lg p-2">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[10px] text-zinc-500 font-semibold">
                            Imagen {imgIdx + 1}
                            {imgIdx === 0 && <span className="text-[#E30613] ml-1">(principal)</span>}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setForm((p) => ({
                                ...p,
                                colors: p.colors.map((c, i) =>
                                  i === idx
                                    ? { ...c, imageUrls: c.imageUrls.filter((_, j) => j !== imgIdx) }
                                    : c,
                                ),
                              }))
                            }
                            className="text-zinc-500 hover:text-red-400 cursor-pointer p-0.5"
                            aria-label={`Eliminar imagen ${imgIdx + 1}`}
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                        <MediaUploader
                          type="image"
                          value={imgUrl}
                          onChange={(newUrl) => {
                            setForm((p) => ({
                              ...p,
                              colors: p.colors.map((c, i) =>
                                i === idx
                                  ? { ...c, imageUrls: c.imageUrls.map((u, j) => (j === imgIdx ? newUrl : u)) }
                                  : c,
                              ),
                            }));
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-5 pt-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="isNew"
                  checked={form.isNew}
                  onCheckedChange={(v) =>
                    setForm((p) => ({ ...p, isNew: v === true }))
                  }
                  className="border-zinc-700 data-[state=checked]:bg-[#E30613] data-[state=checked]:border-[#E30613]"
                />
                <Label
                  htmlFor="isNew"
                  className="text-zinc-300 cursor-pointer"
                >
                  Marcar como NUEVO
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="isBestSeller"
                  checked={form.isBestSeller}
                  onCheckedChange={(v) =>
                    setForm((p) => ({ ...p, isBestSeller: v === true }))
                  }
                  className="border-zinc-700 data-[state=checked]:bg-[#E30613] data-[state=checked]:border-[#E30613]"
                />
                <Label
                  htmlFor="isBestSeller"
                  className="text-zinc-300 cursor-pointer"
                >
                  Marcar como TOP VENTAS
                </Label>
              </div>
            </div>

            <DialogFooter className="pt-4 gap-2">
              <DialogClose asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white"
                >
                  Cancelar
                </Button>
              </DialogClose>
              <Button
                type="submit"
                disabled={saving}
                className="bg-[#E30613] hover:bg-[#c40510] text-white border-transparent"
              >
                {saving
                  ? 'Guardando...'
                  : editingId
                    ? 'Guardar cambios'
                    : 'Crear producto'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent className="bg-[#111] border-zinc-800 text-zinc-100">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white text-lg font-bold">
              Eliminar producto
            </AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              ¿Seguro que quieres eliminar{' '}
              <span className="text-white font-semibold">
                {deleteTarget?.name}
              </span>
              ? Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-[#E30613] hover:bg-[#c40510] text-white border-transparent"
            >
              {deleting ? 'Eliminando...' : 'Eliminar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
