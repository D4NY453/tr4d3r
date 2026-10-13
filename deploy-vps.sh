#!/usr/bin/env bash

# ==============================================================================
# SCRIPT DE INSTALACIÓN Y DESPLIEGUE AUTOMATIZADO DEL BOT DE TRADING EN VPS 24/7
# Compatible con Ubuntu 22.04 / 24.04 LTS & Debian 11 / 12
# ==============================================================================

set -e

echo "🚀 [1/5] Actualizando repositorios del sistema..."
sudo apt-get update -y
sudo apt-get upgrade -y
sudo apt-get install -y curl git build-essential

echo "📦 [2/5] Instalando Node.js 20 LTS..."
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

echo "Node.js versión: $(node -v)"
echo "NPM versión: $(npm -v)"

echo "⚙️ [3/5] Instalando PM2 (Gestor de Procesos 24/7)..."
sudo npm install -g pm2

echo "📥 [4/5] Instalando dependencias y compilando el proyecto..."
npm install
npm run build

APP_PORT=${PORT:-3001}

echo "🤖 [5/5] Iniciando el Bot de Trading con PM2 en el puerto $APP_PORT..."
PORT=$APP_PORT pm2 start ecosystem.config.js
pm2 save
pm2 startup || true

echo "=============================================================================="
echo "✅ ¡BOT DE TRADING DESPLEGADO CON ÉXITO 24/7!"
echo "Ambos proyectos pueden correr juntos sin problema en el mismo VPS."
echo "Accede a tu bot de trading en: http://$(curl -s ifconfig.me):$APP_PORT"
echo "Comandos útiles de PM2:"
echo " - Ver todos tus proyectos corriendo: pm2 list"
echo " - Ver logs del bot en tiempo real: pm2 logs tradingview-bot-pro"
echo " - Reiniciar bot: pm2 restart tradingview-bot-pro"
echo " - Detener bot: pm2 stop tradingview-bot-pro"
echo "=============================================================================="
