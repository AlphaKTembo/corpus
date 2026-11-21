#!/bin/bash
# Corpus health checks. Run from cron every 5 minutes as root.
#
# Alerts go to every channel configured in infra/.env (any combination):
#   ALERT_EMAIL=you@example.com              (needs a working sendmail/MTA)
#   ALERT_TELEGRAM_BOT_TOKEN=... and ALERT_TELEGRAM_CHAT_ID=...
#   ALERT_WEBHOOK_URL=https://...            (POSTs {"text": "..."}; Slack/Discord-compatible)
# and are always appended to /var/log/corpus-monitor.log.
#
# Each failing check alerts at most once per ALERT_REPEAT_HOURS (default 6),
# and sends one "resolved" message when it recovers.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG=/var/log/corpus-monitor.log
STATE_DIR=/var/lib/corpus-monitor
DATA_VOL=/var/lib/docker/volumes/infra_corpus_data/_data
BACKUP_DIR="${BACKUP_DIR:-/root/backups/corpus}"
SYNC_LOG=/var/log/corpus-full-sync.log
mkdir -p "$STATE_DIR"

envval() { grep -E "^$1=" "$SCRIPT_DIR/.env" 2>/dev/null | tail -1 | cut -d= -f2-; }
ALERT_EMAIL="$(envval ALERT_EMAIL)"
TG_TOKEN="$(envval ALERT_TELEGRAM_BOT_TOKEN)"
TG_CHAT="$(envval ALERT_TELEGRAM_CHAT_ID)"
WEBHOOK="$(envval ALERT_WEBHOOK_URL)"
REPEAT_HOURS="$(envval ALERT_REPEAT_HOURS)"; REPEAT_HOURS="${REPEAT_HOURS:-6}"

now() { date +%s; }
log() { echo "$(date -Iseconds) $*" >> "$LOG"; }

send() {
  local msg="[Corpus] $1"
  log "SEND: $msg"
  if [ -n "$ALERT_EMAIL" ] && command -v sendmail >/dev/null 2>&1; then
    printf 'To: %s\nSubject: %s\n\n%s\n' "$ALERT_EMAIL" "$msg" "$msg" | sendmail -t 2>/dev/null || log "email send failed"
  fi
  if [ -n "$TG_TOKEN" ] && [ -n "$TG_CHAT" ]; then
    curl -s --max-time 15 -o /dev/null "https://api.telegram.org/bot$TG_TOKEN/sendMessage" \
      --data-urlencode "chat_id=$TG_CHAT" --data-urlencode "text=$msg" || log "telegram send failed"
  fi
  if [ -n "$WEBHOOK" ]; then
    curl -s --max-time 15 -o /dev/null -H 'content-type: application/json' \
      -d "$(python3 -c 'import json,sys; print(json.dumps({"text": sys.argv[1]}))' "$msg")" "$WEBHOOK" \
      || log "webhook send failed"
  fi
}

# check <name> <ok:0|1> <message>
check() {
  local name="$1" failing="$2" msg="$3" f="$STATE_DIR/$1"
  if [ "$failing" = 1 ]; then
    local last=0; [ -f "$f" ] && last="$(cat "$f")"
    if [ $(( $(now) - last )) -ge $(( REPEAT_HOURS * 3600 )) ]; then
      send "ALERT $name: $msg"
      now > "$f"
    fi
  elif [ -f "$f" ]; then
    send "RESOLVED $name"
    rm -f "$f"
  fi
}

age_hours() { [ -e "$1" ] && echo $(( ($(now) - $(stat -c %Y "$1")) / 3600 )) || echo 9999; }

# 1. API up (internal and public)
code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 http://127.0.0.1:3000/ || echo 000)"
check api_down "$([ "$code" = 200 ] && echo 0 || echo 1)" "API returned HTTP $code on 127.0.0.1:3000"
pcode="$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 https://corpus.kurasika.tech/api/ || echo 000)"
check public_api_down "$([ "$pcode" = 200 ] && echo 0 || echo 1)" "https://corpus.kurasika.tech/api/ returned HTTP $pcode"

# 2. AI provider failures in the last hour (from the API's usage log)
ai="$(python3 - "$DATA_VOL/metadata/ai_usage.jsonl" <<'PY'
import json, sys, datetime as dt
cut = dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=1)
ok = bad = missing = 0
try:
    with open(sys.argv[1]) as f:
        for line in f.readlines()[-2000:]:
            try:
                e = json.loads(line)
                if dt.datetime.fromisoformat(e["ts"].replace("Z", "+00:00")) < cut: continue
                if e.get("ok"): ok += 1
                else:
                    bad += 1
                    if e.get("error") == "api_key_missing": missing += 1
            except Exception: pass
except FileNotFoundError: pass
print(ok, bad, missing)
PY
)"
read -r ai_ok ai_bad ai_missing <<< "$ai"
check ai_failing "$([ "${ai_missing:-0}" -gt 0 ] || [ "${ai_bad:-0}" -ge 3 ] && echo 1 || echo 0)" \
  "AI calls failing in the last hour: $ai_bad failed, $ai_ok ok, $ai_missing missing API key"

# 3. Daily full sync (cron 06:30) succeeded recently
sync_failing=0; sync_msg=""
if [ "$(age_hours "$SYNC_LOG")" -ge 26 ]; then
  sync_failing=1; sync_msg="no sync run logged in 26h"
elif ! tail -n 1 "$SYNC_LOG" | grep -q '"success":true'; then
  sync_failing=1; sync_msg="last sync run failed: $(tail -n 1 "$SYNC_LOG" | cut -c1-160)"
fi
check daily_sync "$sync_failing" "$sync_msg"

# 4. Backups
check backup_stale "$([ "$(age_hours "$BACKUP_DIR/last_success")" -ge 26 ] && echo 1 || echo 0)" \
  "no successful backup in 26h (last: $(cat "$BACKUP_DIR/last_success" 2>/dev/null || echo never))"

# 5. Disk
disk="$(df --output=pcent / | tail -1 | tr -dc 0-9)"
check disk_full "$([ "$disk" -ge 90 ] && echo 1 || echo 0)" "root disk ${disk}% full"

# Heartbeat for "is the monitor itself running?"
now > "$STATE_DIR/heartbeat"
