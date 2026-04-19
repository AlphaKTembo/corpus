# Garmin Body Battery Integration

This directory contains scripts and configuration for automatically syncing Garmin Body Battery, HRV, and Resting Heart Rate data.

## Architecture

1. **Python Garmin Service** (`services/garmin/`):
   - Flask API that interfaces with Garmin Connect API
   - Fetches Body Battery, HRV, and RHR data
   - Runs as a Docker container

2. **NestJS Garmin Module** (`services/api/src/garmin/`):
   - Calls the Python service to fetch data
   - Saves data to CSV files in `/data/corpus/metadata/`
   - Exposes REST API endpoints

3. **Frontend Integration**:
   - Body Battery charts on `/metrics` and `/dashboard` pages
   - Integration with recovery score calculation

## Environment Variables

Required in `infra/.env`:

```bash
# Garmin Credentials
GARMIN_EMAIL=your-garmin-email@example.com
GARMIN_PASSWORD=your-garmin-password
```

## Manual Sync

To manually sync Garmin data:

### Via API (Recommended)
```bash
curl -X POST http://localhost:3000/v1/garmin/sync \
  -H "Content-Type: application/json" \
  -d '{"days": 7}'
```

### Via Shell Script
```bash
cd infra
./sync-garmin.sh
```

## Automated Sync (Cron)

To set up daily automated sync:

```bash
cd infra
./setup-garmin-cron.sh
```

This will:
- Make sync scripts executable
- Create a cron job to run daily at 6:00 AM
- Create a log directory for sync logs

## Data Storage

Garmin data is stored in CSV files:

- **Body Battery**: `/data/corpus/metadata/body_battery.csv`
  - Columns: `date`, `timestamp`, `level`, `status`
  
- **HRV**: `/data/corpus/metadata/hrv_garmin.csv`
  - Columns: `date`, `hrv_ms`, `timestamp`

## API Endpoints

### Garmin Service (Python - Port 5000)
- `GET /health` - Health check
- `GET /api/body-battery?date=YYYY-MM-DD` - Get Body Battery for a date
- `GET /api/body-battery?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD` - Get range
- `GET /api/hrv?date=YYYY-MM-DD` - Get HRV data
- `GET /api/resting-heart-rate?date=YYYY-MM-DD` - Get RHR data
- `POST /api/sync` - Sync all data types

### NestJS API (Port 3000)
- `GET /v1/garmin/health` - Check Garmin service health
- `GET /v1/garmin/body-battery?date=YYYY-MM-DD` - Get Body Battery
- `GET /v1/garmin/hrv?date=YYYY-MM-DD` - Get HRV
- `GET /v1/garmin/resting-heart-rate?date=YYYY-MM-DD` - Get RHR
- `POST /v1/garmin/sync` - Sync all data and save to CSV
- `GET /v1/metrics/body-battery?from=YYYY-MM-DD&to=YYYY-MM-DD` - Get aggregated Body Battery data

## Recovery Score Integration

Body Battery is now integrated into the recovery score calculation:

- **Body Battery < 25**: -20 points, HIGH severity flag
- **Body Battery < 50**: -10 points, MEDIUM severity flag
- **Body Battery ≥ 75**: +5 bonus points

The recovery score uses multiple factors:
1. Training Load (TSS)
2. Resting Heart Rate Delta
3. Sleep Debt
4. **Body Battery** (new!)

## Troubleshooting

### Garmin Service Not Running
```bash
docker compose ps
docker compose logs garmin
```

### Authentication Issues
Check credentials in `.env`:
```bash
cat infra/.env | grep GARMIN
```

### No Data Appearing
1. Check if data was synced:
   ```bash
   ls -lh /data/corpus/metadata/body_battery.csv
   ```
2. Check logs:
   ```bash
   docker compose logs garmin
   docker compose logs api
   ```
3. Manually trigger sync:
   ```bash
   curl -X POST http://localhost:3000/v1/garmin/sync -H "Content-Type: application/json" -d '{"days": 7}'
   ```

### Cron Job Not Running
Check crontab:
```bash
crontab -l
```

Check logs:
```bash
tail -f infra/logs/garmin-sync.log
```

## Docker Compose

The Garmin service is defined in `docker-compose.yml`:

```yaml
garmin:
  build:
    context: ../services/garmin
    dockerfile: Dockerfile
  container_name: corpus-garmin
  ports:
    - "5000:5000"
  environment:
    - PORT=5000
    - GARMIN_EMAIL=${GARMIN_EMAIL:-}
    - GARMIN_PASSWORD=${GARMIN_PASSWORD:-}
  restart: unless-stopped
  networks:
    - corpus-network
```

To rebuild after changes:
```bash
docker compose build garmin
docker compose up -d garmin
```
