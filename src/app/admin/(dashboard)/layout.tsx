'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Package,
  Star,
  Mail,
  Settings,
  LogOut,
  ShoppingBag,
  Menu,
  X,
  Store,
  ExternalLink,
} from 'lucide-react';

const navItems = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/admin/productos', label: 'Productos', icon: Package },
  { href: '/admin/pedidos', label: 'Pedidos', icon: ShoppingBag },
  { href: '/admin/resenas', label: 'Reseñas', icon: Star },
  { href: '/admin/newsletter', label: 'Newsletter', icon: Mail },
  { href: '/admin/settings', label: 'Configuración', icon: Settings },
];

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [adminName, setAdminName] = useState<string>('');

  // Fetch the current admin name for the topbar
  useEffect(() => {
    fetch('/api/admin/me', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.name) setAdminName(d.name);
      })
      .catch(() => {});
  }, []);

  const handleLogout = async () => {
    await fetch('/api/admin/logout', { method: 'POST' });
    router.push('/admin/login');
    router.refresh();
  };

  const isActive = (href: string, exact?: boolean) => {
    if (exact) return pathname === href;
    return pathname === href || pathname.startsWith(href + '/');
  };

  return (
    <div className="min-h-screen flex bg-[#0a0a0a] text-zinc-100">
      {/* Sidebar — desktop (fixed) + mobile (drawer) */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-50 w-64 bg-[#111] border-r border-zinc-800 flex flex-col transition-transform duration-200 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Logo / brand */}
        <div className="h-16 flex items-center gap-2.5 px-5 border-b border-zinc-800">
          <div className="w-8 h-8 rounded-lg bg-[#E30613] flex items-center justify-center font-black text-white text-sm">
            N
          </div>
          <div>
            <p className="font-extrabold text-sm leading-none">N10K Admin</p>
            <p className="text-[10px] text-zinc-500 mt-0.5">Panel de control</p>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="ml-auto lg:hidden text-zinc-400 hover:text-white"
            aria-label="Cerrar menú"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href, item.exact);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? 'bg-[#E30613] text-white'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
                }`}
              >
                <Icon className="h-4.5 w-4.5 flex-shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Footer actions */}
        <div className="p-3 border-t border-zinc-800 space-y-1">
          <Link
            href="/"
            target="_blank"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-zinc-400 hover:text-white hover:bg-zinc-800/50 transition-colors"
          >
            <ExternalLink className="h-4.5 w-4.5" />
            Ver tienda
          </Link>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-zinc-400 hover:text-[#E30613] hover:bg-zinc-800/50 transition-colors"
          >
            <LogOut className="h-4.5 w-4.5" />
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Backdrop for mobile sidebar */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
        />
      )}

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar */}
        <header className="h-16 flex items-center gap-3 px-4 lg:px-6 bg-[#111] border-b border-zinc-800 sticky top-0 z-30">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden text-zinc-400 hover:text-white"
            aria-label="Abrir menú"
          >
            <Menu className="h-6 w-6" />
          </button>
          <div className="flex items-center gap-2 text-sm text-zinc-400">
            <Store className="h-4 w-4 text-[#E30613]" />
            <span className="hidden sm:inline">Tienda N10K</span>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <div className="hidden sm:flex flex-col items-end">
              <p className="text-xs font-semibold text-zinc-200 leading-none">
                {adminName || 'Administrador'}
              </p>
              <p className="text-[10px] text-zinc-500 mt-0.5">admin</p>
            </div>
            <div className="w-9 h-9 rounded-full bg-[#E30613]/15 border border-[#E30613]/30 flex items-center justify-center text-[#E30613] font-bold text-sm">
              {adminName ? adminName.charAt(0).toUpperCase() : 'A'}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 lg:p-6 overflow-x-hidden">{children}</main>
      </div>
    </div>
  );
}
