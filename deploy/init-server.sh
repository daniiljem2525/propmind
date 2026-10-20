#!/usr/bin/env bash
# Инициализация чистого сервера Ubuntu 24.04 (reg.ru, 2 vCPU / 2 ГБ).
# Запуск на сервере: bash init-server.sh
# Ставит Docker, swap 2 ГБ, firewall (22/80/443), cron-бэкапы.
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then echo "запускать от root"; exit 1; fi

echo "1/6 Docker…"
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker

echo "2/6 Swap 2 ГБ (страховка от OOM на 2 ГБ RAM)…"
if ! swapon --show | grep -q swapfile; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  # ядро не агрессивно свопит, но не OOM-ит Postgres
  sysctl -qw vm.swappiness=15
fi

echo "3/6 Firewall (22/80/443)…"
if command -v ufw >/dev/null; then
  ufw allow 22/tcp
  ufw allow 80/tcp
  ufw allow 443/tcp
  ufw allow 443/udp
  yes | ufw enable || true
fi

echo "4/6 Каталоги…"
mkdir -p /opt/arendora/stack /opt/arendora/automation /var/www/arendora /var/backups/arendora

echo "5/6 Ежедневный бэкап в 04:00 (cron; сам backup.sh заливает upload.sh)…"
cat > /etc/cron.d/arendora-backup <<'CRON'
0 4 * * * root /opt/arendora/backup.sh >> /var/log/arendora-backup.log 2>&1
CRON

echo "6/6 Готово."
echo "Дальше: залить stack (upload.sh), заполнить .env, docker compose up -d."
