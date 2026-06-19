'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Settings,
  Save,
  RotateCcw,
  Loader2,
  AlertCircle,
  Store,
  Share2,
  LayoutTemplate,
  MessageSquare,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Toaster } from '@/components/ui/sonner';

type SettingsMap = Record<string, string>;

interface FieldDef {
  key: string;
  label: string;
  type: 'text' | 'email' | 'url' | 'textarea';
  placeholder?: string;
  help?: string;
}

interface SectionDef {
  title: string;
  description: string;
  icon: typeof Store;
  fields: FieldDef[];
}

const SECTIONS: SectionDef[] = [
  {
    title: 'Información de la tienda',
    description: 'Datos de contacto y ubicación que aparecen en la tienda.',
    icon: Store,
    fields: [
      {
        key: 'store_name',
        label: 'Nombre de la tienda',
        type: 'text',
        placeholder: 'N10K',
      },
      {
        key: 'store_email',
        label: 'Email de contacto',
        type: 'email',
        placeholder: 'contacto@n10k.com',
      },
      {
        key: 'store_phone',
        label: 'Teléfono / WhatsApp',
        type: 'text',
        placeholder: '+58 412-1234567',
      },
      {
        key: 'store_whatsapp',
        label: 'Número WhatsApp',
        type: 'text',
        placeholder: '584121234567',
        help: 'Formato internacional sin "+". Ej: 584121234567',
      },
      {
        key: 'store_address',
        label: 'Dirección',
        type: 'textarea',
        placeholder: 'Av. Principal, Edificio..., Caracas, Venezuela',
      },
    ],
  },
  {
    title: 'Redes sociales',
    description: 'Enlaces a tus perfiles sociales.',
    icon: Share2,
    fields: [
      {
        key: 'store_facebook',
        label: 'URL Facebook',
        type: 'url',
        placeholder: 'https://facebook.com/n10k',
      },
      {
        key: 'store_instagram',
        label: 'URL Instagram',
        type: 'url',
        placeholder: 'https://instagram.com/n10k',
      },
    ],
  },
  {
    title: 'Contenido del hero',
    description: 'Textos principales de la portada de la tienda.',
    icon: LayoutTemplate,
    fields: [
      {
        key: 'hero_title',
        label: 'Título del hero principal',
        type: 'text',
        placeholder: 'N10K · Ropa de Caballero',
      },
      {
        key: 'hero_subtitle',
        label: 'Subtítulo del hero',
        type: 'text',
        placeholder: 'Estilo urbano para el hombre moderno',
      },
    ],
  },
  {
    title: 'Mensajes',
    description: 'Mensajes transversales mostrados en la tienda.',
    icon: MessageSquare,
    fields: [
      {
        key: 'shipping_message',
        label: 'Mensaje de envíos',
        type: 'text',
        placeholder: 'Envíos a todo el país en 24-48h',
      },
    ],
  },
];

const ALL_KEYS = SECTIONS.flatMap((s) => s.fields.map((f) => f.key));

export default function AdminSettingsPage() {
  const [values, setValues] = useState<SettingsMap>({});
  const [original, setOriginal] = useState<SettingsMap>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/settings', { cache: 'no-store' })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: { settings: SettingsMap }) => {
        if (cancelled) return;
        const loaded = data.settings ?? {};
        // Normalise: ensure every known key exists as a string
        const normalised: SettingsMap = {};
        for (const k of ALL_KEYS) normalised[k] = loaded[k] ?? '';
        setValues(normalised);
        setOriginal(normalised);
        setError('');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(
          err instanceof Error ? err.message : 'Error al cargar la configuración',
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

  const dirty = useMemo(() => {
    for (const k of ALL_KEYS) {
      if ((values[k] ?? '') !== (original[k] ?? '')) return true;
    }
    return false;
  }, [values, original]);

  const handleChange = (key: string, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleReset = () => {
    setValues(original);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      setOriginal(values);
      toast.success('Configuración guardada correctamente');
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : 'Error al guardar la configuración',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-zinc-100 flex items-center gap-2.5">
            <Settings className="h-7 w-7 text-[#E30613]" />
            Configuración
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Administra los datos de la tienda, redes sociales y mensajes.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleReset}
            disabled={!dirty || saving || loading}
            className="border-zinc-700 text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
          >
            <RotateCcw className="h-4 w-4" />
            Restablecer
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={!dirty || saving || loading}
            className="bg-[#E30613] text-white hover:bg-[#c00510] disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </Button>
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-20 text-zinc-400 gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-[#E30613]" />
          <p className="text-sm">Cargando configuración...</p>
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

      {/* Form sections */}
      {!loading && !error && (
        <div className="space-y-6">
          {SECTIONS.map((section) => {
            const SectionIcon = section.icon;
            return (
              <section
                key={section.title}
                className="bg-[#111] border border-zinc-800 rounded-lg p-5 md:p-6"
              >
                <div className="flex items-start gap-3 mb-5">
                  <div className="w-10 h-10 rounded-lg bg-[#E30613]/15 border border-[#E30613]/30 flex items-center justify-center shrink-0">
                    <SectionIcon className="h-5 w-5 text-[#E30613]" />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-zinc-100">
                      {section.title}
                    </h2>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {section.description}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {section.fields.map((field) => {
                    const isTextarea = field.type === 'textarea';
                    const colSpan = isTextarea ? 'md:col-span-2' : '';
                    return (
                      <div key={field.key} className={`space-y-1.5 ${colSpan}`}>
                        <Label
                          htmlFor={field.key}
                          className="text-xs font-medium uppercase tracking-wide text-zinc-400"
                        >
                          {field.label}
                        </Label>
                        {isTextarea ? (
                          <Textarea
                            id={field.key}
                            value={values[field.key] ?? ''}
                            onChange={(e) =>
                              handleChange(field.key, e.target.value)
                            }
                            placeholder={field.placeholder}
                            rows={3}
                            className="bg-[#0a0a0a] border-zinc-800 text-zinc-100 placeholder:text-zinc-600 focus-visible:border-zinc-600 resize-y"
                          />
                        ) : (
                          <Input
                            id={field.key}
                            type={field.type}
                            value={values[field.key] ?? ''}
                            onChange={(e) =>
                              handleChange(field.key, e.target.value)
                            }
                            placeholder={field.placeholder}
                            className="bg-[#0a0a0a] border-zinc-800 text-zinc-100 placeholder:text-zinc-600 focus-visible:border-zinc-600"
                          />
                        )}
                        {field.help && (
                          <p className="text-[11px] text-zinc-500">
                            {field.help}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* Sticky bottom action bar (mobile-friendly) */}
      {!loading && !error && (
        <div className="sticky bottom-0 -mx-4 md:-mx-8 px-4 md:px-8 py-3 bg-[#0a0a0a]/95 backdrop-blur border-t border-zinc-800 flex items-center justify-between gap-3">
          <p className="text-xs text-zinc-500 hidden sm:block">
            {dirty
              ? 'Tienes cambios sin guardar.'
              : 'Todos los cambios están guardados.'}
          </p>
          <div className="flex items-center gap-2 ml-auto">
            <Button
              type="button"
              variant="outline"
              onClick={handleReset}
              disabled={!dirty || saving}
              className="border-zinc-700 text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
            >
              <RotateCcw className="h-4 w-4" />
              <span className="hidden sm:inline">Restablecer</span>
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={!dirty || saving}
              className="bg-[#E30613] text-white hover:bg-[#c00510] disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {saving ? 'Guardando...' : 'Guardar cambios'}
            </Button>
          </div>
        </div>
      )}

      <Toaster theme="dark" position="top-right" />
    </div>
  );
}
