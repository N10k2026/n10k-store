---
Task ID: 1
Agent: Main (Z.ai Code)
Task: Clonar https://github.com/N10k2026/N10k.git, instalar dependencias y levantar el proyecto en el sandbox.

Work Log:
- Detuve el dev server Next.js preexistente que corría en el sandbox (PIDs 1130/1132/1147).
- Cloné el repositorio `https://github.com/N10k2026/N10k.git` en `/tmp/N10k` con `git clone`.
- Examiné archivos clave: `package.json` (Next.js 16 + React 19 + Prisma 6 + SQLite + shadcn/ui + Tailwind 4 + gsap + ogl), `next.config.ts`, `prisma/schema.prisma` (modelos Product/ProductImage/ProductColor/ProductSize/NewsletterSubscriber/Review), `Caddyfile`, `start-dev.sh`.
- Sincronicé el repositorio en `/home/z/my-project` con `rsync -a --delete`, preservando intencionadamente:
  - `.env` (DATABASE_URL=file:/home/z/my-project/db/custom.db) — infraestructura del sandbox.
  - `Caddyfile` (gateway :81 → localhost:3000) — infraestructura del sandbox.
  - `db/`, `node_modules/`, `.next/` — se regeneran.
- Ejecuté `bun install`: 4 paquetes nuevos (gsap, ogl, etc.) + `prisma generate` (postinstall). Lockfile guardado.
- Inicialicé la BD: `bun run db:push` (esquema sincronizado, Prisma Client generado) y `bun run db:seed` (6 productos cargados: shorts-breeze, hoodie-bold, sweater-after-dark, sweater-pearl-exclusive-drop, tee-limitless, tank-fearless).
- El primer intento de arrancar el dev server con `nohup ... &` NO persistió entre llamadas del Bash tool (el proceso moría al cerrar la sesión del shell).
- Solución: daemonización robusta con doble-detach `( setsid bash -c 'exec next dev ...' & )` ejecutando `next dev` directamente (sin el pipeline `tee` del script `dev` de package.json) para evitar señales. El proceso next-server (PID 2324) ahora persiste entre llamadas.
- Verifiqué con `agent-browser`:
  - `open http://localhost:3000` → título "N10K | Ropa de Caballero".
  - Snapshot: header con logo N10K Caballero, navegación (Inicio/Colección/Novedades/Nosotros/Contacto), botones Buscar/Favoritos/Carrito, hero con video, sección "PRODUCTOS DESTACADOS" con productos reales (Shorts BREEZE $40, Hoodie BOLD $50, Sweater AFTER DARK, etc.) con colores y botones "Agregar al carrito".
  - Interacción: clic en "Agregar al carrito" → el botón del carrito cambió de "Carrito vacío" a "Carrito, 1 artículo" y se abrió el drawer con el producto. Estado actualizado correctamente.
  - `GET /api/products 200` confirma integración con la base de datos.
- `dev.log` sin errores ni warnings en runtime; todas las peticiones devuelven 200.
- `bun run lint`: 6 errores + 30 warnings, todos preexistentes en el repositorio clonado (patrones `setState`-en-`effect` del compilador de React 19 y variables sin usar). No bloquean la ejecución; quedan fuera del alcance de "clonar/instalar/levantar".

Stage Summary:
- Proyecto N10k (e-commerce de ropa de caballero) clonado, instalado y levantado en el sandbox.
- Dev server Next.js 16 (Turbopack) corriendo en http://localhost:3000 (PID 2324, persistente vía setsid+doble-detach). Gateway Caddy en :81 → :3000 funciona (HTTP 200).
- Base de datos SQLite inicializada con 6 productos. API `/api/products` operativa.
- Verificado end-to-end con Agent Browser: render correcto, productos cargados desde BD, carrito funcional.
- Artefactos preservados del sandbox: `.env`, `Caddyfile`.
- Errores de lint preexistentes (6) no abordados: son de calidad de código del repo original y no impiden ejecutar.
