'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import Image from 'next/image';

// Fallback banners (used if the API is unreachable or returns no banners)
const FALLBACK_BANNERS = [
  '/banners/hero-1.webp',
  '/banners/hero-2.webp',
  '/banners/hero-3.webp',
  '/banners/hero-4.webp',
];

const SLIDE_INTERVAL = 5000;
const FADE_DURATION = 1200;

interface BannerData {
  id: string;
  title: string;
  imageUrl: string;
  link?: string | null;
}

export default function MobileBannerHero() {
  const containerRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const indexRef = useRef(0);
  const [banners, setBanners] = useState<BannerData[]>(
    FALLBACK_BANNERS.map((url, i) => ({
      id: `fallback-${i}`,
      title: `Banner N10K ${i + 1}`,
      imageUrl: url,
      link: null,
    })),
  );

  // Load active banners for mobile from the API
  useEffect(() => {
    let cancelled = false;
    fetch('/api/banners?placement=mobile')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        if (data?.banners && Array.isArray(data.banners) && data.banners.length > 0) {
          setBanners(data.banners);
        }
      })
      .catch(() => {
        // keep fallback banners
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const advance = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const slides = container.querySelectorAll<HTMLElement>('[data-slide]');
    if (slides.length === 0) return;
    const prev = indexRef.current;
    const next = (prev + 1) % slides.length;

    slides[prev]?.style.setProperty('opacity', '0');
    slides[prev]?.style.setProperty('transition', `opacity ${FADE_DURATION}ms ease-in-out`);
    slides[next]?.style.setProperty('opacity', '1');
    slides[next]?.style.setProperty('transition', `opacity ${FADE_DURATION}ms ease-in-out`);
    slides[next]?.style.setProperty('z-index', '2');
    slides[prev]?.style.setProperty('z-index', '1');

    indexRef.current = next;
  }, []);

  useEffect(() => {
    if (banners.length <= 1) return; // no rotation needed for a single banner
    timerRef.current = setInterval(advance, SLIDE_INTERVAL);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [advance, banners.length]);

  return (
    <div ref={containerRef} className="absolute inset-0 overflow-hidden md:hidden">
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

        // Wrap in a link if the banner has one
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
