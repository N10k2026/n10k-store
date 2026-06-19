'use client';

import { useEffect, useRef, type DependencyList } from 'react';

/**
 * Invoke `callback` at most once per animation frame on scroll/resize.
 * Avoids React setState storms during scroll (PERF-007, ANIM-018).
 */
export function useScrollRaf(
  callback: () => void,
  deps: DependencyList = [],
  options?: { listenResize?: boolean },
) {
  // Keep the latest callback in a ref so the scroll listener (attached once)
  // always invokes the newest function without needing to re-subscribe.
  const callbackRef = useRef(callback);
  useEffect(() => {
    callbackRef.current = callback;
  });

  useEffect(() => {
    let rafId = 0;

    const onEvent = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        callbackRef.current();
      });
    };

    window.addEventListener('scroll', onEvent, { passive: true });
    if (options?.listenResize !== false) {
      window.addEventListener('resize', onEvent, { passive: true });
    }
    onEvent();

    return () => {
      window.removeEventListener('scroll', onEvent);
      if (options?.listenResize !== false) {
        window.removeEventListener('resize', onEvent);
      }
      cancelAnimationFrame(rafId);
    };
  }, deps);
}
