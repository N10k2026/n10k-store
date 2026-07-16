#!/usr/bin/env bash
# Deploy in-place de n10k-store en el VPS (mismo box que nutrition10k).
#
# Modelo: el service systemd `n10k-store` corre el build standalone desde el
# propio checkout (~/n10k-store/.next/standalone), en el puerto 3001, detrás de
# Caddy (n10kstore.com -> 127.0.0.1:3001). Las subidas persisten fuera del build
# en /var/lib/n10k-store/uploads y se enlazan por symlink, así el rebuild nunca
# las borra.
#
# Uso:  bash deploy/deploy.sh      (como usuario n10k, desde el repo)
#
# Requisitos ya provistos en este box: node, bun, ffmpeg, postgresql corriendo,
# .env con DATABASE_URL + ADMIN_SESSION_SECRET + NEXT_PUBLIC_SITE_URL, y sudo
# sin password para `systemctl restart n10k-store`.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
STANDALONE="$REPO_DIR/.next/standalone"
UPLOADS_DIR=/var/lib/n10k-store/uploads
PORT=3001

cd "$REPO_DIR"

echo "==> Cargando entorno"
set -a; source "$REPO_DIR/.env"; set +a

echo "==> Instalando dependencias"
bun install --frozen-lockfile

echo "==> Aplicando migraciones (base vacía-safe, idempotente)"
bunx prisma migrate deploy

echo "==> Build de producción"
bun run build

echo "==> Ensamblando standalone (static + public + symlink de uploads)"
# Next 'output: standalone' NO copia .next/static ni public/: hay que hacerlo.
mkdir -p "$STANDALONE/.next" "$UPLOADS_DIR/images" "$UPLOADS_DIR/videos"
rm -rf "$STANDALONE/.next/static" && cp -r .next/static "$STANDALONE/.next/static"
rm -rf "$STANDALONE/public" && cp -r public "$STANDALONE/public"
# Uploads persistentes: el dir copiado se reemplaza por un symlink al volumen,
# que el rebuild no toca. El service tiene WorkingDirectory=$STANDALONE, así que
# media-optimizer escribe en ./public/uploads -> este symlink.
rm -rf "$STANDALONE/public/uploads"
ln -s "$UPLOADS_DIR" "$STANDALONE/public/uploads"

echo "==> Reiniciando el service"
sudo systemctl restart n10k-store

echo "==> Esperando a que responda"
for i in $(seq 1 30); do
  code="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/" || true)"
  [ "$code" = "200" ] && break
  sleep 1
done
echo "==> Listo. http://127.0.0.1:$PORT -> HTTP ${code:-sin respuesta}  (público: https://n10kstore.com)"
[ "${code:-}" = "200" ] || { echo "!! El service no respondió 200. Revisa: sudo journalctl -u n10k-store -n 50"; exit 1; }
