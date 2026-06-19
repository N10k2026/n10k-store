'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';

const FADE_DURATION = 1200;
const SLIDE_INTERVAL = 6000;

interface BannerData {
  id: string;
  title: string;
  imageUrl: string;
  link?: string | null;
}

/**
 * Desktop banner carousel — shown when the admin has configured desktop
 * banners. If no desktop banners exist, the parent (ScrollVideoHero) falls
 * back to the canvas video scroll.
 */
export default function DesktopBannerHero() {
  const containerRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const indexRef = useRef(0);
  const [banners, setBanners] = useState<BannerData[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/banners?placement=desktop')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        if (data?.banners && Array.isArray(data.banners)) {
          setBanners(data.banners);
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
    return () => {
      cancelled = true;
    };
  }, []);

  const advance = () => {
    const container = containerRef.current;
    if (!container) return;
    const slides = container.querySelectorAll<HTMLElement>('[data-slide]');
    if (slides.length <= 1) return;
    const prev = indexRef.current;
    const next = (prev + 1) % slides.length;
    slides[prev]?.style.setProperty('opacity', '0');
    slides[next]?.style.setProperty('opacity', '1');
    slides[next]?.style.setProperty('z-index', '2');
    slides[prev]?.style.setProperty('z-index', '1');
    indexRef.current = next;
  };

  useEffect(() => {
    if (banners.length <= 1) return;
    timerRef.current = setInterval(advance, SLIDE_INTERVAL);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [banners.length]);

  // Signal to parent whether desktop banners are available
  // (parent decides whether to render this or the video)
  if (!loaded) return null;
  if (banners.length === 0) return null;

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 overflow-hidden"
      aria-label="Carrusel de banners"
    >
      {banners.map((banner, i) => {
        const isExternal = /^https?:\/\//.test(banner.imageUrl);
        const imgEl = isExternal ? (
          <img
            src={banner.imageUrl}
            alt={banner.title}
            className="w-full h-full object-cover object-center"
          />
        ) : (
          <Image
            src={banner.imageUrl}
            alt={banner.title}
            fill
            priority={i === 0}
            sizes="100vw"
            className="object-cover object-center"
          />
        );

        const slide = (
          <div
            key={banner.id}
            data-slide
            className="absolute inset-0"
            style={{
              opacity: i === 0 ? 1 : 0,
              zIndex: i === 0 ? 2 : 1,
              transition: `opacity ${FADE_DURATION}ms ease-in-out`,
            }}
          >
            {imgEl}
          </div>
        );

        if (banner.link) {
          return (
            <a
              key={banner.id}
              href={banner.link}
              className="contents"
              aria-label={banner.title}
            >
              {slide}
            </a>
          );
        }
        return slide;
      })}
    </div>
  );
}
