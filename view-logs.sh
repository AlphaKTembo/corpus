#!/bin/bash
echo "📊 FitnessSyncer Sync Logs"
echo "=========================="
echo ""
tail -100 /tmp/api-dev.log 2>/dev/null | grep -E "FitnessSyncer|DuckDB" | tail -30
echo ""
echo "💡 To watch logs in real-time: tail -f /tmp/api-dev.log | grep FitnessSyncer"
