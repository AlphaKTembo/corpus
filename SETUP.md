# Corpus Setup Guide

## Overview

Corpus is an API-first system for storing and analyzing training + health data. This guide will help you set up the complete system.

## Prerequisites

- Node.js 20+
- Docker and Docker Compose
- VPS or local machine with sufficient storage
- (Optional) Flutter SDK for mobile development

## Quick Start

### 1. Clone and Setup

```bash
cd /path/to/corpus
```

### 2. Configure Environment

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` and set:
- `SINGLE_USER_PASSWORD_HASH`: Generate with:
  ```bash
  node -e "const bcrypt=require('bcrypt');bcrypt.hash('yourpassword',10).then(h=>console.log(h))"
  ```
- `JWT_SECRET` and `JWT_REFRESH_SECRET`: Use strong random strings
- `CORPUS_DATA_PATH` and `DRIVE_SYNC_PATH`: Set your data paths

### 3. Create Data Directories

```bash
# On VPS or local
mkdir -p /data/corpus/{raw/csv,raw/fit,canonical,derived,metadata}
mkdir -p /data/drive_sync/TrainingPeaks

# Copy mapping rules template
cp services/worker/src/config/mapping_rules.example.yml /data/corpus/metadata/mapping_rules.yml
```

### 4. Build Services

```bash
# Build API
cd services/api
npm install
npm run build

# Build Worker
cd ../worker
npm install
npm run build
```

### 5. Start with Docker Compose

```bash
cd infra
docker compose up -d
```

### 6. Verify

- API health: `curl http://localhost/health`
- API endpoint: `curl http://localhost/api/v1/auth/me` (requires auth)

## Development

### API Development

```bash
cd services/api
npm install
npm run start:dev
```

### Worker Development

```bash
cd services/worker
npm install
npm run dev ingest --sync
```

### Web Development

```bash
cd apps/web
npm install
npm run dev
```

### Mobile Development

```bash
cd apps/mobile
flutter pub get
flutter run
```

## Data Ingestion

### Manual Sync

```bash
# Via Docker
cd infra
docker compose run --rm worker ingest --sync

# Or directly
cd services/worker
node dist/cli.js ingest --sync
```

### Automated Sync (Cron)

#### Option 1: Use the setup script

```bash
cd infra
chmod +x cron-setup.sh
./cron-setup.sh
```

This will add a daily sync at 6 AM that runs both file ingestion and FitnessSyncer sync.

#### Option 2: Manual cron setup

Add to crontab (`crontab -e`):

```bash
# Daily sync at 6 AM - syncs both CSV/FIT files and FitnessSyncer
0 6 * * * cd /path/to/corpus/infra && docker compose run --rm worker scheduler >> /var/log/corpus-scheduler.log 2>&1

# Or sync individually:
# File ingestion only
0 5 * * * cd /path/to/corpus/infra && docker compose run --rm worker ingest --sync

# FitnessSyncer only (if connected)
0 6 * * * cd /path/to/corpus/infra && docker compose run --rm worker fitnesssyncer --sync
```

### Rebuild Datasets

```bash
docker compose run --rm worker ingest --rebuild
```

## FitnessSyncer Integration

FitnessSyncer provides an API for accessing aggregated health data. To integrate:

1. Register your application with FitnessSyncer
2. Obtain OAuth2 credentials (Client ID, Client Secret)
3. Implement OAuth2 flow in the worker to fetch data
4. Map FitnessSyncer data to canonical schema

See `services/worker/src/services/ingest.service.ts` for where to add this integration.

## Architecture

- **API**: NestJS REST API serving `/api/v1/*` endpoints
- **Worker**: CLI tool for ingesting CSV/FIT files and computing derived datasets
- **Storage**: Parquet files in `canonical/` and `derived/` directories
- **Query**: DuckDB reads Parquet files directly (no separate database server)

## Next Steps

1. Configure `mapping_rules.yml` for your CSV exports
2. Set up FitnessSyncer OAuth2 integration
3. Customize derived dataset computations
4. Deploy to VPS with TLS/SSL
5. Build out web dashboard UI
6. Enhance mobile app features

## Troubleshooting

### API won't start
- Check environment variables are set
- Verify port 3000 is available
- Check logs: `docker compose logs api`

### Worker fails to process files
- Verify `DRIVE_SYNC_ROOT` path exists
- Check file permissions
- Review `metadata/ingest_status.json` for errors

### DuckDB errors
- Ensure Parquet files exist in `canonical/` directory
- Check file permissions
- Verify DuckDB can read the files

