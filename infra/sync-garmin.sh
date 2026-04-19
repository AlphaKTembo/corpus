#!/bin/bash
# Sync Garmin Body Battery, HRV, and RHR data daily
# This script is designed to run as a cron job

set -e

API_URL="${API_URL:-http://localhost:3000}"
DAYS="${DAYS:-7}"

echo "$(date): Starting Garmin data sync..."

# Call the Garmin sync endpoint
response=$(curl -s -X POST \
  "${API_URL}/v1/garmin/sync" \
  -H "Content-Type: application/json" \
  -d "{\"days\": ${DAYS}}")

echo "$(date): Sync response: ${response}"

# Check if sync was successful
if echo "$response" | grep -q '"success":true'; then
  echo "$(date): Garmin sync completed successfully"
  exit 0
else
  echo "$(date): Garmin sync failed: ${response}"
  exit 1
fi
