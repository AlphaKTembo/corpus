# Corpus Deployment Guide

Complete guide for hosting the Corpus system on a VPS or cloud server.

## Prerequisites

- **VPS/Server**: Ubuntu 22.04+ or similar Linux distribution
- **Domain name**: Pointed to your server's IP address
- **Docker & Docker Compose**: Installed on the server
- **Node.js 20+**: For building services (if not using Docker)
- **Ports**: 80, 443 (HTTP/HTTPS), 3000 (API, optional)

## Server Setup

### 1. Initial Server Configuration

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# Install Docker Compose
sudo apt install docker-compose-plugin -y

# Log out and back in for Docker group to take effect
```

### 2. Create Data Directories

```bash
# Create corpus data directories
sudo mkdir -p /data/corpus/{raw/csv,raw/fit,canonical,derived,metadata}
sudo mkdir -p /data/drive_sync/TrainingPeaks

# Set ownership (replace $USER with your username)
sudo chown -R $USER:$USER /data/corpus /data/drive_sync

# Set permissions
chmod -R 755 /data/corpus /data/drive_sync
```

### 3. Clone Repository

```bash
# Clone to your preferred location
cd /opt  # or /home/$USER or wherever you prefer
git clone <your-repo-url> corpus
cd corpus
```

## Environment Configuration

### 1. Create Environment File

```bash
# Copy example (if exists) or create new
cp .env.example .env  # or create .env manually
nano .env
```

### 2. Configure Environment Variables

Add to `.env` in the project root:

```bash
# Server Paths
CORPUS_DATA_PATH=/data/corpus
DRIVE_SYNC_PATH=/data/drive_sync

# API Configuration
NODE_ENV=production
PORT=3000
CORS_ORIGIN=https://yourdomain.com,https://www.yourdomain.com

# FitnessSyncer OAuth2 (Required for FitnessSyncer integration)
FITNESSSYNCER_CLIENT_ID=your_client_id_here
FITNESSSYNCER_CLIENT_SECRET=your_client_secret_here
FITNESSSYNCER_REDIRECT_URI=https://yourdomain.com/api/v1/fitnesssyncer/callback

# JWT Secrets (Generate strong random strings)
JWT_SECRET=$(openssl rand -base64 32)
JWT_REFRESH_SECRET=$(openssl rand -base64 32)

# Single User Auth (if using - generate hash)
# SINGLE_USER_USERNAME=admin
# SINGLE_USER_PASSWORD_HASH=$(node -e "const bcrypt=require('bcrypt');bcrypt.hash('yourpassword',10).then(h=>console.log(h))")
```

**Important**: Update `FITNESSSYNCER_REDIRECT_URI` with your actual domain!

### 3. Generate Secrets

```bash
# Generate JWT secrets
echo "JWT_SECRET=$(openssl rand -base64 32)" >> .env
echo "JWT_REFRESH_SECRET=$(openssl rand -base64 32)" >> .env
```

## Docker Deployment

### 1. Build and Start Services

```bash
cd infra

# Build images
docker compose build

# Start services
docker compose up -d

# Check status
docker compose ps

# View logs
docker compose logs -f api
```

### 2. Verify API is Running

```bash
# Health check
curl http://localhost/health

# API endpoint
curl http://localhost/api/v1
```

## Web App Deployment

The web app (Next.js) can be deployed in two ways:

### Option A: Standalone Next.js (Recommended)

```bash
cd apps/web

# Install dependencies
npm install

# Set API URL
export NEXT_PUBLIC_API_BASE_URL=https://yourdomain.com

# Build for production
npm run build

# Start production server
npm start
# Or use PM2 for process management:
npm install -g pm2
pm2 start npm --name "corpus-web" -- start
pm2 save
pm2 startup
```

### Option B: Docker (Add to docker-compose.yml)

Add web service to `infra/docker-compose.yml`:

```yaml
web:
  build:
    context: ../apps/web
    dockerfile: Dockerfile
  container_name: corpus-web
  environment:
    - NEXT_PUBLIC_API_BASE_URL=https://yourdomain.com
  ports:
    - "3001:3000"
  restart: unless-stopped
  networks:
    - corpus-network
```

Create `apps/web/Dockerfile`:

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.js ./
EXPOSE 3000
CMD ["npm", "start"]
```

## SSL/TLS Setup with Let's Encrypt

### 1. Install Certbot

```bash
sudo apt install certbot python3-certbot-nginx -y
```

### 2. Update Nginx Configuration

Edit `infra/nginx/conf.d/default.conf`:

```nginx
upstream api {
    server api:3000;
}

upstream web {
    server web:3000;  # If using Docker for web, or localhost:3001 if standalone
}

server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com www.yourdomain.com;

    # SSL certificates (will be added by Certbot)
    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    # SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Web app
    location / {
        proxy_pass http://web;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # API endpoints
    location /api/ {
        proxy_pass http://api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Health check
    location /health {
        access_log off;
        return 200 "healthy\n";
        add_header Content-Type text/plain;
    }
}
```

### 3. Get SSL Certificate

```bash
# Stop nginx temporarily
docker compose stop nginx

# Get certificate
sudo certbot certonly --standalone -d yourdomain.com -d www.yourdomain.com

# Update nginx config with certificate paths
# Then restart
docker compose start nginx
```

### 4. Auto-Renewal Setup

```bash
# Test renewal
sudo certbot renew --dry-run

# Add to crontab (auto-renewal)
sudo crontab -e
# Add: 0 0 * * * certbot renew --quiet && docker compose -f /path/to/corpus/infra/docker-compose.yml restart nginx
```

## Cron Job Setup

### 1. Set Up Hourly Sync

```bash
cd /path/to/corpus/infra
chmod +x cron-setup.sh
./cron-setup.sh
```

Or manually add to crontab:

```bash
crontab -e

# Add hourly sync
0 * * * * cd /path/to/corpus/infra && docker compose run --rm worker scheduler >> /var/log/corpus-scheduler.log 2>&1
```

### 2. Verify Cron Job

```bash
# List cron jobs
crontab -l

# Check logs
tail -f /var/log/corpus-scheduler.log
```

## Mobile App Configuration

Update the mobile app to point to your hosted API:

### For iOS/Android Build:

```bash
cd apps/mobile

# Build with API URL
flutter build ios --dart-define=API_BASE_URL=https://yourdomain.com
flutter build android --dart-define=API_BASE_URL=https://yourdomain.com
```

Or update `apps/mobile/lib/services/api_client.dart`:

```dart
static String get baseUrl {
  const envUrl = String.fromEnvironment('API_BASE_URL');
  if (envUrl.isNotEmpty) {
    return envUrl;
  }
  return 'https://yourdomain.com'; // Production default
}
```

## Monitoring & Maintenance

### 1. View Logs

```bash
# API logs
docker compose logs -f api

# Worker logs
docker compose logs -f worker

# All logs
docker compose logs -f

# Web app logs (if using PM2)
pm2 logs corpus-web
```

### 2. Restart Services

```bash
# Restart all
docker compose restart

# Restart specific service
docker compose restart api

# Rebuild and restart
docker compose up -d --build
```

### 3. Backup Data

```bash
# Backup corpus data
tar -czf corpus-backup-$(date +%Y%m%d).tar.gz /data/corpus

# Backup to remote location (example)
scp corpus-backup-*.tar.gz user@backup-server:/backups/
```

### 4. Update Deployment

```bash
# Pull latest code
git pull origin main

# Rebuild and restart
cd infra
docker compose build
docker compose up -d

# Rebuild web app (if standalone)
cd ../apps/web
npm install
npm run build
pm2 restart corpus-web
```

## Firewall Configuration

```bash
# Allow HTTP/HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Enable firewall
sudo ufw enable

# Check status
sudo ufw status
```

## Troubleshooting

### API Not Accessible

```bash
# Check if API is running
docker compose ps

# Check API logs
docker compose logs api

# Test API directly
curl http://localhost:3000/api/v1
```

### SSL Certificate Issues

```bash
# Check certificate expiry
sudo certbot certificates

# Renew manually
sudo certbot renew

# Restart nginx
docker compose restart nginx
```

### Data Not Syncing

```bash
# Check cron job
crontab -l

# Check scheduler logs
tail -f /var/log/corpus-scheduler.log

# Run sync manually
cd infra
docker compose run --rm worker scheduler
```

### Web App Not Loading

```bash
# Check web app logs
pm2 logs corpus-web

# Check nginx config
docker compose exec nginx nginx -t

# Restart web app
pm2 restart corpus-web
```

## Security Checklist

- [ ] Strong JWT secrets generated
- [ ] SSL/TLS certificates installed and auto-renewing
- [ ] Firewall configured (only 80, 443 open)
- [ ] Environment variables secured (`.env` not in git)
- [ ] Docker containers running as non-root user
- [ ] Regular backups configured
- [ ] Logs monitored for suspicious activity
- [ ] API rate limiting considered (add if needed)

## Next Steps

1. **Connect FitnessSyncer**: Visit `https://yourdomain.com/fitnesssyncer` and connect your account
2. **Test Sync**: Trigger a manual sync from the web interface
3. **Monitor**: Set up log monitoring (e.g., with `journalctl` or a logging service)
4. **Backup**: Configure automated backups
5. **Mobile App**: Build and distribute mobile app with production API URL

## Support

For issues or questions:
- Check logs: `docker compose logs`
- Review environment variables: Ensure all required vars are set
- Verify network: Ensure domain DNS points to server IP
- Test endpoints: Use `curl` to test API endpoints directly
