#!/bin/bash
set -e

echo "========================================="
echo "  JAFFA — AWS EC2 Setup (Ubuntu 22.04)"
echo "========================================="

# ── 1. System packages ──────────────────────
echo "[1/7] Installing system packages..."
sudo apt update && sudo apt upgrade -y
sudo apt install -y nginx git curl build-essential

# ── 2. Node.js 20 LTS ───────────────────────
echo "[2/7] Installing Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
echo "Node: $(node -v) | npm: $(npm -v)"

# ── 3. PostgreSQL ────────────────────────────
echo "[3/7] Installing PostgreSQL..."
sudo apt install -y postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Create database and user
sudo -u postgres psql -c "CREATE USER jaffa WITH PASSWORD 'CHANGE_ME_STRONG_PASSWORD';" 2>/dev/null || true
sudo -u postgres psql -c "CREATE DATABASE jaffa OWNER jaffa;" 2>/dev/null || true
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE jaffa TO jaffa;"
echo "PostgreSQL ready"

# ── 4. PM2 (process manager) ────────────────
echo "[4/7] Installing PM2..."
sudo npm install -g pm2

# ── 5. Clone and install ────────────────────
echo "[5/7] Setting up project..."
cd /home/ubuntu

# If repo already exists, pull latest
if [ -d "jaffa" ]; then
  cd jaffa && git pull
else
  git clone https://github.com/norulashik/jaffa.git
  cd jaffa
fi

# Install backend
echo "Installing backend dependencies..."
cd backend
npm ci --production=false  # need devDeps for tsc build
npm run build              # compiles TS → dist/
cd ..

# Install frontend
echo "Installing frontend dependencies..."
cd frontend
npm ci
npm run build              # builds Next.js production bundle
cd ..

# ── 6. Environment files ────────────────────
echo "[6/7] Setting up environment..."

# Backend .env (EDIT THESE VALUES!)
if [ ! -f backend/.env ]; then
cat > backend/.env << 'ENVEOF'
PORT=5000
DATABASE_URL=postgres://jaffa:CHANGE_ME_STRONG_PASSWORD@localhost:5432/jaffa
JWT_SECRET=GENERATE_A_RANDOM_64_CHAR_SECRET_HERE
OTP_SERVICE=mock
SPORTSMONK_API_KEY=YOUR_SPORTSMONK_KEY_HERE
CORS_ORIGIN=http://localhost:3000
ADMIN_API_KEY=GENERATE_ADMIN_KEY_HERE
OWNER_USER=admin
OWNER_PASS=CHANGE_THIS_PASSWORD
ENVEOF
echo ">>> IMPORTANT: Edit backend/.env with real values!"
fi

# Frontend .env.production
cat > frontend/.env.production << 'ENVEOF'
NEXT_PUBLIC_API_URL=/api
ENVEOF

# ── 7. Nginx + PM2 ──────────────────────────
echo "[7/7] Configuring Nginx and starting services..."

# Copy nginx config
sudo cp deploy/nginx.conf /etc/nginx/sites-available/jaffa
sudo ln -sf /etc/nginx/sites-available/jaffa /etc/nginx/sites-enabled/jaffa
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl restart nginx

# Start with PM2
pm2 start deploy/ecosystem.config.js
pm2 save
pm2 startup systemd -u ubuntu --hp /home/ubuntu | tail -1 | bash

echo ""
echo "========================================="
echo "  JAFFA is running!"
echo "========================================="
echo ""
echo "  Frontend: http://$(curl -s ifconfig.me)"
echo "  Backend:  http://$(curl -s ifconfig.me)/api/health"
echo ""
echo "  PM2 status:  pm2 status"
echo "  PM2 logs:    pm2 logs"
echo "  PM2 restart: pm2 restart all"
echo ""
echo "  NEXT STEPS:"
echo "  1. Edit backend/.env with real credentials"
echo "  2. pm2 restart jaffa-backend"
echo "  3. Open port 80 in EC2 Security Group"
echo "========================================="
