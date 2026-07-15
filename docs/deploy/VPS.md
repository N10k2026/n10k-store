# Runbook: VPS n10k-store

## 1. Provisión (una vez)

```bash
# Paquetes
sudo apt update
sudo apt install -y postgresql caddy ffmpeg curl
curl -fsSL https://bun.sh/install | bash          # bun
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs

# Usuario y directorios
sudo useradd -r -m -s /bin/bash n10k
sudo mkdir -p /srv/n10k-store/releases /var/lib/n10k-store/uploads/{images,videos} /etc/n10k-store
sudo chown -R n10k:n10k /srv/n10k-store /var/lib/n10k-store

# PostgreSQL
sudo -u postgres psql -c "CREATE USER n10k WITH PASSWORD '<PASSWORD_FUERTE>';"
sudo -u postgres psql -c "CREATE DATABASE n10k_store OWNER n10k;"

# Entorno de la app
sudo tee /etc/n10k-store/env >/dev/null <<'EOF'
DATABASE_URL=postgresql://n10k:<PASSWORD_FUERTE>@localhost:5432/n10k_store
EOF
sudo chmod 600 /etc/n10k-store/env

# systemd + Caddy
sudo cp deploy/n10k-store.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable n10k-store
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile   # editar dominio real antes
sudo systemctl reload caddy
```

## 2. Puesta en marcha (cutover, una vez)

La DB del VPS nace de cero: `prisma migrate deploy` sobre la base vacía
(sin baselining) + seed del catálogo estático.

1. **Deploy inicial:** `bash deploy/deploy.sh` — aplica las migraciones sobre
   la DB vacía, hace el build y arranca el servicio.
2. **Seed del catálogo:** desde el checkout del repo en el VPS:
   ```bash
   set -a; source /etc/n10k-store/env; set +a
   bun run db:seed
   ```
   (Alternativa: `ensureDatabase` auto-seedea productos y admin en el primer
   request si la DB está vacía.)
3. **Smoke test:** catálogo carga, imágenes de producto responden 200,
   subir una imagen nueva desde el admin funciona y aterriza en
   `/var/lib/n10k-store/uploads/images/`.
4. **Apagar lo viejo:** apuntar el DNS al VPS, borrar el proyecto de Vercel,
   cancelar Cloudinary.

**Red de seguridad:** si más adelante importas datos que contengan URLs
`res.cloudinary.com` (p.ej. un dump de la producción vieja), migra su media
a disco ANTES de cancelar Cloudinary:
```bash
bun run media:migrate --dry-run   # revisar el reporte
bun run media:migrate             # descargar, optimizar y reescribir URLs
```
Verificar después: `psql "$DATABASE_URL" -c "SELECT count(*) FROM \"Product\" WHERE image LIKE '%cloudinary%';"` → 0
(repetir para `ProductImage.url`, `Product.video`, `Banner.imageUrl`).

## 3. Deploys siguientes

```bash
git pull && bash deploy/deploy.sh
```

## 4. Backups

```bash
# Cron diario sugerido (crontab del usuario n10k):
# 0 4 * * * pg_dump "$DATABASE_URL" -Fc -f /var/backups/n10k-$(date +\%u).dump && rsync -a /var/lib/n10k-store/uploads /var/backups/uploads/
```
La DB y `/var/lib/n10k-store/uploads` son el estado completo de la app.
