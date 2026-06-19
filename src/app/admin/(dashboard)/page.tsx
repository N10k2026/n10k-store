'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Package,
  Star,
  Mail,
  ShoppingBag,
  TrendingUp,
  DollarSign,
  ArrowUpRight,
  Clock,
} from 'lucide-react';

interface DashboardData {
  counts: {
    products: number;
    reviews: number;
    newsletter: number;
    orders: number;
  };
  totalRevenue: number;
  ordersByStatus: Record<string, number>;
  recentOrders: Array<{
    id: string;
    customerName: string;
    total: number;
    status: string;
    createdAt: string;
  }>;
  recentReviews: Array<{
    id: string;
    userName: string;
    rating: number;
    comment: string;
    createdAt: string;
    product: { name: string };
  }>;
  topProducts: Array<{
    id: string;
    name: string;
    price: number;
    rating: number;
    image: string;
  }>;
}

function formatCurrency(n: number): string {
  return `$${n.toFixed(2)}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' });
}

const statusColors: Record<string, string> = {
  pendiente: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  procesando: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  enviado: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
  entregado: 'bg-green-500/15 text-green-300 border-green-500/30',
  cancelado: 'bg-red-500/15 text-red-300 border-red-500/30',
};

export default function AdminDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/admin/stats', { cache: 'no-store' })
      .then((r) => {
        if (!r.ok) throw new Error('Error al cargar estadísticas');
        return r.json();
      })
      .then((d) => setData(d))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin h-8 w-8 border-2 border-[#E30613] border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-red-500/10 border border-red-500/30 text-red-300 rounded-xl p-6">
        <p className="font-semibold mb-1">Error</p>
        <p className="text-sm">{error || 'No se pudieron cargar los datos'}</p>
      </div>
    );
  }

  const stats = [
    {
      label: 'Ingresos totales',
      value: formatCurrency(data.totalRevenue),
      icon: DollarSign,
      color: 'text-green-400',
      bg: 'bg-green-500/10',
    },
    {
      label: 'Pedidos',
      value: data.counts.orders,
      icon: ShoppingBag,
      color: 'text-blue-400',
      bg: 'bg-blue-500/10',
    },
    {
      label: 'Productos',
      value: data.counts.products,
      icon: Package,
      color: 'text-[#E30613]',
      bg: 'bg-[#E30613]/10',
    },
    {
      label: 'Reseñas',
      value: data.counts.reviews,
      icon: Star,
      color: 'text-amber-400',
      bg: 'bg-amber-500/10',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-extrabold text-white">Dashboard</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Resumen general de tu tienda
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              className="bg-[#111] border border-zinc-800 rounded-xl p-5"
            >
              <div className={`w-10 h-10 rounded-lg ${stat.bg} flex items-center justify-center mb-3`}>
                <Icon className={`h-5 w-5 ${stat.color}`} />
              </div>
              <p className="text-2xl font-extrabold text-white leading-none">
                {stat.value}
              </p>
              <p className="text-xs text-zinc-500 mt-1.5 uppercase tracking-wider">
                {stat.label}
              </p>
            </div>
          );
        })}
      </div>

      {/* Two-column section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent orders */}
        <div className="lg:col-span-2 bg-[#111] border border-zinc-800 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
            <h2 className="font-bold text-white text-sm">Pedidos recientes</h2>
            <Link
              href="/admin/pedidos"
              className="text-xs text-[#E30613] hover:underline flex items-center gap-1"
            >
              Ver todos <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
          {data.recentOrders.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-zinc-500">
              No hay pedidos aún
            </div>
          ) : (
            <div className="divide-y divide-zinc-800/60">
              {data.recentOrders.map((order) => (
                <div
                  key={order.id}
                  className="px-5 py-3.5 flex items-center gap-4 hover:bg-zinc-800/30 transition-colors"
                >
                  <div className="w-9 h-9 rounded-lg bg-zinc-800 flex items-center justify-center flex-shrink-0">
                    <ShoppingBag className="h-4 w-4 text-zinc-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">
                      {order.customerName}
                    </p>
                    <p className="text-xs text-zinc-500 flex items-center gap-1.5 mt-0.5">
                      <Clock className="h-3 w-3" />
                      {formatDate(order.createdAt)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-white">
                      {formatCurrency(order.total)}
                    </p>
                    <span
                      className={`inline-block mt-1 text-[10px] font-semibold px-2 py-0.5 rounded border ${
                        statusColors[order.status] || 'bg-zinc-700/30 text-zinc-400 border-zinc-600'
                      }`}
                    >
                      {order.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Newsletter count + orders by status */}
        <div className="space-y-6">
          <div className="bg-[#111] border border-zinc-800 rounded-xl p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-lg bg-[#E30613]/10 flex items-center justify-center">
                <Mail className="h-4.5 w-4.5 text-[#E30613]" />
              </div>
              <div>
                <p className="text-2xl font-extrabold text-white leading-none">
                  {data.counts.newsletter}
                </p>
                <p className="text-xs text-zinc-500 mt-1">Suscriptores</p>
              </div>
            </div>
            <Link
              href="/admin/newsletter"
              className="text-xs text-[#E30613] hover:underline flex items-center gap-1"
            >
              Ver lista <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>

          {/* Orders by status */}
          <div className="bg-[#111] border border-zinc-800 rounded-xl p-5">
            <h3 className="text-sm font-bold text-white mb-3">
              Pedidos por estado
            </h3>
            {Object.keys(data.ordersByStatus).length === 0 ? (
              <p className="text-xs text-zinc-500">Sin datos</p>
            ) : (
              <div className="space-y-2">
                {Object.entries(data.ordersByStatus).map(([status, count]) => (
                  <div key={status} className="flex items-center justify-between">
                    <span
                      className={`text-xs font-semibold px-2 py-0.5 rounded border ${
                        statusColors[status] || 'bg-zinc-700/30 text-zinc-400 border-zinc-600'
                      }`}
                    >
                      {status}
                    </span>
                    <span className="text-sm font-bold text-white">{count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom: top products + recent reviews */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top products */}
        <div className="bg-[#111] border border-zinc-800 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
            <h2 className="font-bold text-white text-sm flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-[#E30613]" />
              Productos mejor valorados
            </h2>
            <Link
              href="/admin/productos"
              className="text-xs text-[#E30613] hover:underline flex items-center gap-1"
            >
              Ver todos <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="divide-y divide-zinc-800/60">
            {data.topProducts.map((p, i) => (
              <div key={p.id} className="px-5 py-3 flex items-center gap-3">
                <span className="text-xs font-bold text-zinc-600 w-4">
                  {i + 1}
                </span>
                <img
                  src={p.image}
                  alt={p.name}
                  className="w-10 h-10 rounded-lg object-cover bg-zinc-800 flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">
                    {p.name}
                  </p>
                  <div className="flex items-center gap-1 mt-0.5">
                    <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                    <span className="text-xs text-zinc-400">
                      {p.rating.toFixed(1)}
                    </span>
                  </div>
                </div>
                <span className="text-sm font-bold text-white">
                  {formatCurrency(p.price)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent reviews */}
        <div className="bg-[#111] border border-zinc-800 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
            <h2 className="font-bold text-white text-sm flex items-center gap-2">
              <Star className="h-4 w-4 text-amber-400" />
              Reseñas recientes
            </h2>
            <Link
              href="/admin/resenas"
              className="text-xs text-[#E30613] hover:underline flex items-center gap-1"
            >
              Ver todas <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
          {data.recentReviews.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-zinc-500">
              No hay reseñas aún
            </div>
          ) : (
            <div className="divide-y divide-zinc-800/60">
              {data.recentReviews.map((r) => (
                <div key={r.id} className="px-5 py-3.5">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-semibold text-white">{r.userName}</p>
                    <div className="flex items-center gap-0.5">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star
                          key={i}
                          className={`h-3 w-3 ${
                            i < r.rating
                              ? 'fill-amber-400 text-amber-400'
                              : 'text-zinc-700'
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                  <p className="text-xs text-zinc-400 line-clamp-2 mb-1">
                    {r.comment}
                  </p>
                  <p className="text-[11px] text-zinc-600">
                    sobre <span className="text-zinc-400">{r.product.name}</span>{' '}
                    · {formatDate(r.createdAt)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
