'use client';

import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';

// El icono lo decide el CSS según la clase `dark` de <html> (no la del header,
// que es zona oscura sobre el hero), así no hay estado ni desajuste de
// hidratación. El script de layout.tsx restaura la elección.
export default function ThemeToggle() {
  const toggle = () => {
    const dark = document.documentElement.classList.toggle('dark');
    try {
      localStorage.setItem('theme', dark ? 'dark' : 'light');
    } catch {
      // almacenamiento bloqueado: el tema cambia igual, solo no se recuerda
    }
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      className="text-muted-foreground hover:text-[#E30613] hover:bg-transparent transition-colors duration-300"
      onClick={toggle}
      aria-label="Cambiar entre tema claro y oscuro"
    >
      <Moon className="h-5 w-5 [html.dark_&]:hidden" />
      <Sun className="hidden h-5 w-5 [html.dark_&]:block" />
    </Button>
  );
}
