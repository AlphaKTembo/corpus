# Corpus Web Dashboard

Next.js web application for viewing and analyzing training and health data.

## Features

- **Authentication**: JWT-based login with automatic token refresh
- **Dashboard**: Today's brief with recovery status, training load, and recommendations
- **Activities**: List and detail views of all training activities
- **Metrics**: Charts for vitals, sleep, and body metrics (using Recharts)
- **Ingestion**: Monitor and trigger data ingestion sync

## Pages

- `/login` - Login page
- `/dashboard` - 90-day trends and quick tiles
- `/activities` - Activity list with filters
- `/activities/[id]` - Activity detail view
- `/metrics` - Vitals/sleep/body charts
- `/ingestion` - Ingestion status/debug

## Development

```bash
npm install
npm run dev
```

The app will run on `http://localhost:3001` (or next available port).

## Environment Variables

Create a `.env.local` file:

```bash
NEXT_PUBLIC_API_BASE_URL=http://localhost:3000
```

For production behind nginx, use:
```bash
NEXT_PUBLIC_API_BASE_URL=/api
```

## API Client

The API client (`src/lib/api-client.ts`) handles:
- Automatic token management from localStorage
- Token refresh on 401 errors
- Redirect to login on auth failure
- All API endpoints

## Styling

Currently uses inline styles. Consider migrating to:
- Tailwind CSS
- CSS Modules
- Styled Components
- Material-UI

## Build

```bash
npm run build
npm start
```

## Deployment

The web app can be:
1. Built as static export and served via nginx
2. Deployed as a Next.js server
3. Containerized with Docker

For Docker deployment, add to `infra/docker-compose.yml`:

```yaml
web:
  build:
    context: ../apps/web
  ports:
    - "3001:3000"
  environment:
    - NEXT_PUBLIC_API_BASE_URL=/api
  depends_on:
    - nginx
```
