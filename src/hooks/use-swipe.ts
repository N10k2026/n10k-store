import { useRef } from 'react';
import type React from 'react';

const SWIPE_MIN_PX = 40;

/**
 * Deslizar horizontal en táctil (izquierda = siguiente, derecha = anterior).
 * El elemento debe llevar `touch-pan-y` para que el navegador siga haciendo el
 * scroll vertical y nos deje el gesto horizontal. En escritorio no hace nada.
 */
export function useSwipe(onPrev: () => void, onNext: () => void) {
  const start = useRef<{ x: number; y: number } | null>(null);
  return {
    onTouchStart: (e: React.TouchEvent) => {
      const t = e.touches[0];
      start.current = t ? { x: t.clientX, y: t.clientY } : null;
    },
    onTouchEnd: (e: React.TouchEvent) => {
      const s = start.current;
      const t = e.changedTouches[0];
      start.current = null;
      if (!s || !t) return;
      const dx = t.clientX - s.x;
      const dy = t.clientY - s.y;
      if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < Math.abs(dy)) return;
      if (dx < 0) onNext();
      else onPrev();
    },
  };
}
