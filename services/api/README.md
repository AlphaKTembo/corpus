# Corpus API

NestJS REST API for Corpus training and health data system.

## Endpoints

### Authentication

- `POST /api/v1/auth/login` - Login with username/password
- `POST /api/v1/auth/refresh` - Refresh access token
- `POST /api/v1/auth/logout` - Logout
- `GET /api/v1/auth/me` - Get current user info

### Ingestion

- `POST /api/v1/ingest/sync` - Trigger ingestion sync
- `GET /api/v1/ingest/status` - Get ingestion status

### Summary

- `GET /api/v1/summary/today` - Get today's brief
- `GET /api/v1/summary/rolling?days=7|28|90` - Get rolling summary

### Activities

- `GET /api/v1/activities` - List activities (with filters)
- `GET /api/v1/activities/:id` - Get activity details
- `GET /api/v1/activities/:id/streams` - Get activity time series data

### Metrics

- `GET /api/v1/metrics/vitals` - Get vitals data
- `GET /api/v1/metrics/sleep` - Get sleep data
- `GET /api/v1/metrics/body` - Get body metrics

### Notes & Medical Events

- `POST /api/v1/notes` - Create note
- `GET /api/v1/notes` - List notes
- `POST /api/v1/medical-events` - Create medical event
- `GET /api/v1/medical-events` - List medical events

### AI (Placeholder)

- `POST /api/v1/ask` - Ask questions about data (not yet implemented)

## Development

```bash
npm install
npm run start:dev
```

## Environment Variables

- `PORT`: Server port (default: 3000)
- `CORPUS_ROOT`: Path to corpus data directory
- `SINGLE_USER_USERNAME`: Username for single-user auth
- `SINGLE_USER_PASSWORD_HASH`: Bcrypt hash of password
- `JWT_SECRET`: Secret for JWT signing
- `JWT_REFRESH_SECRET`: Secret for refresh tokens
- `CORS_ORIGIN`: CORS allowed origin

