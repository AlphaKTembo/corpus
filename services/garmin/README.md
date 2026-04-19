# Garmin Service

Python Flask service for fetching Garmin Connect data (Body Battery, HRV, Resting Heart Rate).

## Environment Variables

Required:
- `GARMIN_EMAIL`: Your Garmin Connect email
- `GARMIN_PASSWORD`: Your Garmin Connect password
- `PORT`: Port to run the service on (default: 5000)

Optional:
- `GARMINTOKENS`: Tokenstore path or base64 token string from `export_tokens.py`.
  - Use this when Garmin login is blocked by reCAPTCHA.

## API Endpoints

### Health Check
```
GET /health
```

### Body Battery
```
GET /api/body-battery?date=2024-01-13
GET /api/body-battery?start_date=2024-01-01&end_date=2024-01-13
```

### HRV (Heart Rate Variability)
```
GET /api/hrv?date=2024-01-13
GET /api/hrv?start_date=2024-01-01&end_date=2024-01-13
```

### Resting Heart Rate
```
GET /api/resting-heart-rate?date=2024-01-13
GET /api/resting-heart-rate?start_date=2024-01-01&end_date=2024-01-13
```

### Sync All Data
```
POST /api/sync
Body: { "days": 7 }
```

## Local Development

```bash
pip install -r requirements.txt
python app.py
```

## Export Tokens (recommended when login is blocked)

```bash
python export_tokens.py > /tmp/garmin_tokens.txt
```

Set `GARMINTOKENS` to the printed string (in `infra/.env`) and restart the stack.

## Docker

Built and run as part of the main Docker Compose stack.
