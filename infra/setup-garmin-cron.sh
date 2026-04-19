#!/bin/bash
# Setup cron job for daily Garmin data sync

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SYNC_SCRIPT="${SCRIPT_DIR}/sync-garmin.sh"

# Make sync script executable
chmod +x "${SYNC_SCRIPT}"

# Create log directory
mkdir -p "${SCRIPT_DIR}/logs"

# Add cron job (runs daily at 6:00 AM)
CRON_CMD="0 6 * * * cd ${SCRIPT_DIR} && ./sync-garmin.sh >> ${SCRIPT_DIR}/logs/garmin-sync.log 2>&1"

# Check if cron job already exists
if crontab -l 2>/dev/null | grep -q "sync-garmin.sh"; then
  echo "Garmin sync cron job already exists"
else
  # Add to crontab
  (crontab -l 2>/dev/null || true; echo "$CRON_CMD") | crontab -
  echo "Garmin sync cron job added successfully"
  echo "Will run daily at 6:00 AM"
fi

echo ""
echo "Current crontab:"
crontab -l

echo ""
echo "To test the sync manually, run:"
echo "  cd ${SCRIPT_DIR} && ./sync-garmin.sh"
