# Corpus Mobile App

Flutter mobile application for daily morning brief and activity tracking.

## Screens

- Login - Authenticate with API
- Home - Morning brief with recovery status and training load
- Activities - List of activities
- Activity Detail - Activity summary (to be implemented)
- Metrics - Simple charts (to be implemented)

## Development

```bash
flutter pub get
flutter run
```

## Environment Variables

Set API base URL via build configuration:

```bash
flutter run --dart-define=API_BASE_URL=http://your-api-url:3000
```

Or configure in `lib/services/api_client.dart`.

## Features

- Secure token storage using flutter_secure_storage
- Automatic token refresh
- Material Design 3 UI
- API client with error handling

