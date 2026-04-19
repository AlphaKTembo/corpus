# Corpus Worker

CLI tool for ingesting training and health data.

## Usage

```bash
# Sync new files from drive_sync_root
node dist/cli.js ingest --sync

# Rebuild canonical and derived datasets from raw
node dist/cli.js ingest --rebuild
```

## Environment Variables

- `CORPUS_ROOT`: Path to corpus data directory (default: `/data/corpus`)
- `DRIVE_SYNC_ROOT`: Path to drive-synced input folder (default: `/data/drive_sync/TrainingPeaks`)

## Development

```bash
npm install
npm run build
npm run dev ingest --sync
```

