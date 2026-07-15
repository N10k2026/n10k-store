#!/usr/bin/env bash
# Deploy de n10k-store al VPS. Ejecutar EN el VPS, en el checkout del repo.
# Requisitos: node, bun, ffmpeg, postgresql corriendo, /etc/n10k-store/env con DATABASE_URL.
set -euo pipefail

APP_DIR=/srv/n10k-store
UPLOADS_DIR=/var/lib/n10k-store/uploads
RELEASE="$APP_DIR/releases/$(date +%Y%m%d%H%M%S)"
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"

cd "$REPO_DIR"

echo "==> Instalando dependencias"
bun install --frozen-lockfile

echo "==> Aplicando migraciones"
set -a; source /etc/n10k-store/env; set +a
bunx prisma migrate deploy

echo "==> Build"
bun run build

echo "==> Armando release en $RELEASE"
mkdir -p "$RELEASE" "$UPLOADS_DIR/images" "$UPLOADS_DIR/videos"
cp -r .next/standalone/. "$RELEASE/"
mkdir -p "$RELEASE/.next"
cp -r .next/static "$RELEASE/.next/static"
cp -r public "$RELEASE/public"
# Uploads persistentes: reemplazar el dir copiado por symlink al volumen.
rm -rf "$RELEASE/public/uploads"
ln -s "$UPLOADS_DIR" "$RELEASE/public/uploads"

echo "==> Activando release"
ln -sfn "$RELEASE" "$APP_DIR/current"
sudo systemctl restart n10k-store

echo "==> Limpiando releases viejas (conservar 3)"
ls -1dt "$APP_DIR"/releases/* | tail -n +4 | xargs -r rm -rf

echo "==> Listo. Verificar: curl -sI http://localhost:3000 | head -1"
