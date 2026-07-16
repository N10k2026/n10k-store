# n10k-store — Tienda / catálogo Next.js 16 + panel admin

Catálogo con panel admin, desplegado en un VPS propio (Hetzner, IP 62.238.37.2)
junto a otro sitio (nutrition10k). Migrado de Vercel + Cloudinary a VPS con
PostgreSQL local y media servida desde disco.

## Stack
- Next.js 16 (`output: 'standalone'`, Turbopack), React, Tailwind, GSAP
- Prisma 6 + **PostgreSQL local** (`postgresql://n10k:n10k_dev_password@localhost:5432/n10k_store`)
- Package manager: **bun** (usar `bun`, nunca npm/package-lock)
- Tests: vitest (`bun run test`), typecheck `bun run typecheck`
- Media local: sharp (imágenes → WebP 1200px q82), ffmpeg (video H.264 CRF28) en `src/lib/media-optimizer.ts`

## Producción (este VPS)
- Dominio: **n10kstore.com** (+ www), TLS automático por Caddy
- Caddy: `n10kstore.com → reverse_proxy 127.0.0.1:3001`; además sirve `/uploads/*`
  directo de disco (`handle_path`), porque Next standalone cachea el listado de
  `public/` al arrancar y las subidas nuevas no aparecerían sin reinicio
- Service systemd: **n10k-store** (standalone in-place desde `.next/standalone`, PORT=3001)
- Uploads persistentes: **/var/lib/n10k-store/uploads** (sobrevive rebuilds; el admin sube ahí)
- Admin: usuario **Alain** en `/admin/login` (case-sensitive). Sesión firmada con
  `ADMIN_SESSION_SECRET` (en `.env`, no en el repo)

## Cómo desplegar cambios
- **Código** (componentes, rutas, lógica): `bash deploy/deploy.sh`
  (carga `.env` → deps → `prisma migrate deploy` → build → ensambla standalone
  → reinicia el service → verifica 200). ~1 min. Aborta si el build falla; el
  sitio sigue arriba.
- **Contenido** (productos, banners, imágenes/video desde `/admin`, o edición
  directa de la DB con Prisma/psql): en vivo al instante, **sin deploy**.

## Modelo de datos de imágenes
- `Product.image` = portada; `ProductImage` = galería (con `colorName`, `sortOrder`)
- `colorImages[color]` se arma de las filas con ese `colorName`; si un color no
  tiene filas, la galería cae a `product.images` (todas). Ver `src/lib/product-utils.ts`.
- Imágenes de producto seedeadas viven en `public/products/`; las subidas/optimizadas
  en `/uploads/images/` (→ `/var/lib`). Seed en `src/lib/static-products.ts` (solo
  se usa si la DB está vacía; la DB en vivo es la fuente de verdad).

## Gotchas
- El hook RTK reescribe `sudo cat/ls`→`sudo rtk ...` (falla). Usar `rtk proxy sudo <cmd>`.
- Caddyfile único compartido con nutrition10k en `/etc/caddy/Caddyfile`: al tocarlo,
  `caddy validate` antes de `systemctl reload`, sin romper el otro bloque.
- Algunos archivos de `public/products/` (p.ej. `hoodie-negro/blanco.webp`) los
  comparten varios productos — verificar referencias antes de borrar.
- `NEXT_PUBLIC_SITE_URL` es build-time: cambiarlo requiere rebuild.

## Dev local
`bun run dev` levanta en :3000 (ocupado por nutrition10k en este box) — usar otro
puerto: `bunx next dev -p 3001` (o el que esté libre). La recarga periódica en dev
es el cliente HMR de Turbopack; **no ocurre en el build de producción**.
