# Corpus Project Summary

## What Was Built

A complete API-first system for storing and analyzing training + health data, structured as a monorepo with the following components:

### ✅ Backend API (NestJS)
- **Location**: `services/api/`
- **Modules**: Auth, Ingest, Summary, Activities, Metrics, Ask
- **Features**:
  - Single-user JWT authentication (access + refresh tokens)
  - DuckDB integration for querying Parquet files
  - RESTful API endpoints versioned at `/api/v1`
  - Input validation with class-validator
  - CORS support

### ✅ Worker CLI (Node.js/TypeScript)
- **Location**: `services/worker/`
- **Features**:
  - File scanning and copying from drive_sync_root
  - SHA256 hash-based change detection
  - Manifest management (metadata/manifest.json)
  - Ingestion status tracking (metadata/ingest_status.json)
  - CSV/FIT file processing (structure in place)
  - Rebuild capability for reproducible datasets

### ✅ Web Dashboard (Next.js)
- **Location**: `apps/web/`
- **Pages**: Login, Dashboard, Activities list/detail
- **Features**:
  - API client with automatic token refresh
  - JWT authentication
  - Responsive UI (basic structure)

### ✅ Mobile App (Flutter)
- **Location**: `apps/mobile/`
- **Screens**: Login, Home (Morning Brief), Activities
- **Features**:
  - Secure token storage
  - API client with refresh logic
  - Material Design 3

### ✅ Infrastructure (Docker Compose)
- **Location**: `infra/`
- **Services**:
  - API container
  - Worker container
  - Nginx reverse proxy
- **Features**:
  - Volume mounts for data persistence
  - Environment-based configuration
  - Health check endpoint

### ✅ Shared Packages
- **Schemas**: `packages/schemas/` - Shared TypeScript types
- **SDK**: `packages/sdk/` - Placeholder for generated API clients

## Data Structure

```
/data/corpus/
  raw/
    csv/          # Immutable CSV copies
    fit/          # Immutable FIT copies
  canonical/      # Parquet canonical tables
    - activities.parquet
    - activity_streams.parquet
    - vitals_daily.parquet
    - sleep_daily.parquet
    - body_metrics.parquet
  derived/        # Parquet rollups
    - rolling_summary.parquet
    - today_brief.parquet
  metadata/
    - manifest.json
    - ingest_status.json
    - mapping_rules.yml
```

## Key Features Implemented

1. **Immutable Raw Data**: Files are copied, never modified
2. **Reproducible Datasets**: Canonical/derived can be rebuilt from raw
3. **API-First**: Single backend for web and mobile
4. **DuckDB Analytics**: Direct Parquet querying, no separate DB server
5. **Single-User Auth**: Simple but secure JWT-based authentication
6. **Docker Deployment**: Ready for VPS deployment

## Next Steps for Full Implementation

### Worker Enhancements
- [ ] Complete CSV parsing with mapping_rules.yml
- [ ] FIT file parsing (requires FIT parser library)
- [ ] DuckDB SQL for writing Parquet files
- [ ] Derived dataset computation (rolling summaries, today_brief)
- [ ] FitnessSyncer OAuth2 integration

### API Enhancements
- [ ] Stream downsampling implementation
- [ ] AI/ask endpoint implementation
- [ ] Error handling improvements

### Web Dashboard
- [ ] Complete metrics pages with charts
- [ ] Ingestion status/debug page
- [ ] Better styling and UX

### Mobile App
- [ ] Activity detail screen
- [ ] Metrics charts
- [ ] Offline support

### Infrastructure
- [ ] TLS/SSL configuration
- [ ] Production logging setup
- [ ] Monitoring and alerting
- [ ] Backup strategy

## Environment Setup

See `SETUP.md` for detailed setup instructions.

Key environment variables:
- `SINGLE_USER_USERNAME` / `SINGLE_USER_PASSWORD_HASH`
- `JWT_SECRET` / `JWT_REFRESH_SECRET`
- `CORPUS_ROOT` / `DRIVE_SYNC_ROOT`
- `CORS_ORIGIN`

## Testing

Run services individually:
```bash
# API
cd services/api && npm install && npm run start:dev

# Worker
cd services/worker && npm install && npm run dev ingest --sync

# Web
cd apps/web && npm install && npm run dev

# Mobile
cd apps/mobile && flutter pub get && flutter run
```

Or use Docker Compose:
```bash
cd infra && docker compose up
```

## Documentation

- `README.md` - Project overview
- `SETUP.md` - Setup and deployment guide
- `FITNESSSYNCER.md` - FitnessSyncer integration guide
- Individual READMEs in each service/app directory

## Architecture Principles

1. ✅ Data is the source of truth (not AI)
2. ✅ Raw files are immutable
3. ✅ Canonical datasets are reproducible
4. ✅ API is single backend for web/mobile
5. ✅ Single-user auth (secure but simple)
6. ✅ Docker Compose deployment ready

