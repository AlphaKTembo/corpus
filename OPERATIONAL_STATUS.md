# Corpus System - Operational Status

## ✅ Fully Operational Features

### Data Ingestion
- ✅ **CSV File Processing**: Complete implementation with mapping rules support
  - Automatic source detection (TrainingPeaks, Garmin, etc.)
  - Configurable column mapping via `mapping_rules.yml`
  - Supports activities, vitals, sleep, and body metrics
  - Writes to Parquet format using DuckDB

- ✅ **Parquet Writing**: Full implementation
  - Canonical table writes (activities, vitals_daily, sleep_daily, body_metrics)
  - Append operations with deduplication
  - Derived table writes (rolling_summary, today_brief)

- ✅ **Derived Dataset Computation**: Complete implementation
  - Rolling summaries (7d, 28d, 90d TSS calculations)
  - Today's brief with recovery status and recommendations
  - Load trend analysis
  - Risk flag generation

### API Endpoints
- ✅ **Authentication**: JWT-based with refresh tokens
- ✅ **Activities**: List, detail, and stream endpoints
- ✅ **Metrics**: Vitals, sleep, body metrics endpoints
- ✅ **Summary**: Today brief and rolling summary endpoints
- ✅ **Ingestion**: Sync trigger and status endpoints

### FitnessSyncer Integration
- ✅ **OAuth2 Flow**: Complete implementation
  - Authorization URL generation
  - Code exchange for tokens
  - Token refresh support
  - Secure token storage

- ✅ **Data Sync**: Full implementation
  - Activities sync
  - Vitals sync
  - Sleep sync
  - Body metrics sync
  - Automatic derived dataset recomputation

### Web Dashboard
- ✅ **Modern UI**: Black & white theme with rounded corners
- ✅ **All Pages**: Dashboard, Activities, Metrics, Ingestion
- ✅ **Authentication**: Protected routes with auto-redirect
- ✅ **Error Handling**: Error boundaries and graceful error states

## 🚧 Partially Implemented

### FIT File Processing
- ⚠️ Structure in place but requires FIT parser library
- To complete: Install `@garmin-fit/sdk` or similar library

### Stream Downsampling
- ⚠️ Basic implementation exists
- Can be enhanced with more sophisticated algorithms

## 📋 Setup Instructions

### 1. Environment Variables

Add to `.env`:

```bash
# Core
CORPUS_ROOT=/data/corpus
DRIVE_SYNC_ROOT=/data/drive_sync/TrainingPeaks

# Authentication
SINGLE_USER_USERNAME=admin
SINGLE_USER_PASSWORD_HASH=<bcrypt_hash>
JWT_SECRET=<random_string>
JWT_REFRESH_SECRET=<random_string>

# FitnessSyncer (optional)
FITNESSSYNCER_CLIENT_ID=<your_client_id>
FITNESSSYNCER_CLIENT_SECRET=<your_client_secret>
FITNESSSYNCER_REDIRECT_URI=http://localhost:3000/api/v1/fitnesssyncer/callback
```

### 2. Create Data Directories

```bash
mkdir -p /data/corpus/{raw/csv,raw/fit,canonical,derived,metadata}
mkdir -p /data/drive_sync/TrainingPeaks
```

### 3. Configure Mapping Rules

Copy and customize:
```bash
cp services/worker/src/config/mapping_rules.example.yml /data/corpus/metadata/mapping_rules.yml
```

### 4. Build and Run

```bash
# Build worker
cd services/worker
npm install
npm run build

# Build API
cd ../api
npm install
npm run build

# Run with Docker Compose
cd ../../infra
docker compose up -d
```

## 🔄 Usage

### CSV File Ingestion

1. Place CSV files in `/data/drive_sync/TrainingPeaks/`
2. Run sync:
   ```bash
   docker compose run --rm worker ingest --sync
   ```

### FitnessSyncer Integration

1. Get authorization URL:
   ```bash
   docker compose run --rm worker fitnesssyncer --auth-url
   ```

2. Visit URL and authorize, then exchange code:
   ```bash
   docker compose run --rm worker fitnesssyncer --exchange-code <code>
   ```

3. Sync data:
   ```bash
   docker compose run --rm worker fitnesssyncer --sync
   ```

### Via API

1. Get auth URL: `GET /api/v1/fitnesssyncer/authorize`
2. Callback: `POST /api/v1/fitnesssyncer/callback` with `{ code: "..." }`
3. Trigger sync: `POST /api/v1/fitnesssyncer/sync`

## 📊 Data Flow

```
CSV/FIT Files → Worker → Raw Storage → Processing → Canonical Parquet → Derived Parquet → API → Web/Mobile
FitnessSyncer API → Worker → Canonical Parquet → Derived Parquet → API → Web/Mobile
```

## ✨ Key Features

1. **Immutable Raw Data**: All source files preserved
2. **Reproducible**: Can rebuild all datasets from raw files
3. **No Database Server**: DuckDB reads Parquet directly
4. **API-First**: Single backend for web and mobile
5. **Self-Hosted**: Complete data ownership

## 🎯 System is Now Fully Operational!

All core functionality is implemented and ready for production use. The system can:
- Ingest CSV files with automatic mapping
- Process data into Parquet format
- Compute derived insights
- Sync from FitnessSyncer
- Serve data via REST API
- Display in modern web dashboard

