#!/bin/bash
# Nightly backup of Corpus user data. Run from cron as root.
#
#   <BACKUP_DIR>/data-<timestamp>.tar.gz     corpus.db (consistent online copy),
#                                            corpus_data.tar + drive_sync.tar (the volumes)
#   <BACKUP_DIR>/secrets/env-<timestamp>     infra/.env, incl. CORPUS_ENCRYPTION_KEY
#   <BACKUP_DIR>/last_success                timestamp read by monitor.sh
#
# The env file is kept apart from the data on purpose: if you copy data
# archives off-site, don't ship the key that decrypts them in the same place.
# Off-site copy: set BACKUP_RSYNC_TARGET (e.g. user@host:/backups/corpus) in
# infra/.env to rsync data archives after each run.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="${BACKUP_DIR:-/root/backups/corpus}"
KEEP_DAYS="${KEEP_DAYS:-14}"
DATA_VOL="/var/lib/docker/volumes/infra_corpus_data/_data"
DRIVE_VOL="/var/lib/docker/volumes/infra_drive_sync/_data"
TS="$(date +%Y%m%d-%H%M%S)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

BACKUP_RSYNC_TARGET="$(grep -E '^BACKUP_RSYNC_TARGET=' "$SCRIPT_DIR/.env" 2>/dev/null | cut -d= -f2- || true)"

umask 077
mkdir -p "$BACKUP_DIR/secrets"
chmod 700 "$BACKUP_DIR" "$BACKUP_DIR/secrets"

# 1. Consistent SQLite copy via the running API container (online backup API).
docker exec corpus-api node -e '
  const db = new (require("better-sqlite3"))("/data/corpus/corpus.db", { readonly: true });
  db.backup("/data/corpus/.backup-corpus.db").then(() => db.close());
'
mv "$DATA_VOL/.backup-corpus.db" "$WORK/corpus.db"

# 2. Data volumes, each in its own inner archive (excluding the live DB files,
#    which were copied consistently above).
tar -cf "$WORK/corpus_data.tar" -C "$DATA_VOL" \
  --exclude='./corpus.db' --exclude='./corpus.db-wal' --exclude='./corpus.db-shm' .
tar -cf "$WORK/drive_sync.tar" -C "$DRIVE_VOL" .
tar -czf "$BACKUP_DIR/data-$TS.tar.gz" -C "$WORK" corpus.db corpus_data.tar drive_sync.tar

# 3. Verify the archive and the DB inside it before trusting it.
tar -tzf "$BACKUP_DIR/data-$TS.tar.gz" >/dev/null
tar -tf "$WORK/corpus_data.tar" >/dev/null && tar -tf "$WORK/drive_sync.tar" >/dev/null
python3 -c "import sqlite3,sys; c=sqlite3.connect(sys.argv[1]); assert c.execute('pragma integrity_check').fetchone()[0]=='ok'" "$WORK/corpus.db"

# 4. Secrets, separately.
cp "$SCRIPT_DIR/.env" "$BACKUP_DIR/secrets/env-$TS"

# 5. Retention.
find "$BACKUP_DIR" -maxdepth 1 -name 'data-*.tar.gz' -mtime +"$KEEP_DAYS" -delete
find "$BACKUP_DIR/secrets" -maxdepth 1 -name 'env-*' -mtime +"$KEEP_DAYS" -delete

# 6. Optional off-site copy (data archives only).
if [ -n "$BACKUP_RSYNC_TARGET" ]; then
  rsync -a --include='data-*.tar.gz' --exclude='*' "$BACKUP_DIR/" "$BACKUP_RSYNC_TARGET/"
fi

date -Iseconds > "$BACKUP_DIR/last_success"
echo "$(date -Iseconds) backup ok: data-$TS.tar.gz ($(du -h "$BACKUP_DIR/data-$TS.tar.gz" | cut -f1))"
