#!/bin/bash
# Cron setup script for Corpus scheduled syncs
# Run this script to add scheduled syncs to crontab

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CORPUS_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Ensure sync scripts are executable
chmod +x "$CORPUS_ROOT/infra/sync-full.sh" 2>/dev/null || true

# Add to crontab
(crontab -l 2>/dev/null; echo "") | crontab - 2>/dev/null || true

crontab -l 2>/dev/null | grep -v "corpus scheduler" | grep -v "corpus medical summary" | grep -v "corpus garmin sync" | grep -v "corpus full sync" | crontab - 2>/dev/null || true

# Only keep the full sync cron (runs every day at 06:30)
(crontab -l 2>/dev/null; echo "30 6 * * * cd $CORPUS_ROOT/infra && ./sync-full.sh >> /var/log/corpus-full-sync.log 2>&1 # corpus full sync") | crontab -

echo "Cron jobs checked/updated successfully!"
echo "Daily full sync runs at 06:30"
echo "Logs:"
echo "  - /var/log/corpus-full-sync.log"
echo ""
echo "Note: You can also manually trigger syncs from:"
echo "  - Web app: /fitnesssyncer page -> 'Sync Now' button"
echo "  - Mobile app: FitnessSyncer tab -> 'Sync Now' button"

