# Corpus

API-first system for storing and analyzing training + health data over time.

## Architecture

- **Backend API**: NestJS (Node.js, TypeScript)
- **Worker**: Node.js CLI for ingestion
- **Analytics**: DuckDB reading Parquet/CSV
- **Web**: Next.js dashboard
- **Mobile**: Flutter app
- **Storage**: Drive-synced folder + Corpus data folders

## Project Structure

```
corpus/
  apps/
    web/                # Next.js dashboard
    mobile/             # Flutter app
  services/
    api/                # NestJS API
    worker/             # Node worker / CLI
  packages/
    sdk/                # Generated API clients (optional)
    schemas/            # Shared DTOs / validators
  infra/
    docker-compose.yml
    nginx/              # Nginx config
```

## Data Storage

- `DRIVE_SYNC_ROOT`: Read-only input folder (e.g., `/data/drive_sync/TrainingPeaks`)
- `CORPUS_ROOT`: Corpus-managed store (e.g., `/data/corpus`)
  - `raw/csv/` - Immutable CSV copies
  - `raw/fit/` - Immutable FIT copies
  - `canonical/` - Parquet canonical tables
  - `derived/` - Parquet rollups and brief outputs
  - `metadata/` - Manifests and status files

## Getting Started

1. Copy `.env.example` to `.env` and configure
2. Run `docker compose up -d` (from `infra/`)
3. Access API at `http://localhost/api/v1`

## Development

See individual package READMEs for development instructions.

