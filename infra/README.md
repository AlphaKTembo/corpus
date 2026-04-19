# Corpus Infrastructure

This directory contains the Docker Compose configuration for the Corpus system.

## Environment Variables

**IMPORTANT**: Create a `.env` file in this directory (`infra/.env`) with the following required variables:

```bash
# Required: FitnessSyncer OAuth2 Credentials
FITNESSSYNCER_CLIENT_ID=your_client_id_here
FITNESSSYNCER_CLIENT_SECRET=your_client_secret_here
FITNESSSYNCER_REDIRECT_URI=https://personal.fitnesssyncer.com/

# Optional: Other environment variables
SINGLE_USER_USERNAME=admin
SINGLE_USER_PASSWORD_HASH=your_password_hash_here
JWT_SECRET=change-me-in-production
JWT_REFRESH_SECRET=change-me-refresh
```

## Quick Start

1. **Create `.env` file**:
   ```bash
   cp .env.example .env
   # Edit .env and add your credentials
   ```

2. **Start services**:
   ```bash
   docker compose up -d
   ```

3. **Check status**:
   ```bash
   docker compose ps
   docker compose logs api
   ```

## Services

- **api**: REST API service (port 3000)
- **web**: Next.js web application
- **worker**: Background worker for data ingestion
- **nginx**: Reverse proxy (ports 8080/8443)

## Notes

- Docker Compose automatically reads the `.env` file from this directory
- The `.env` file should NOT be committed to version control (it's in .gitignore)
- If you see "FitnessSyncer credentials not configured" error, check that `.env` exists and contains the required variables
