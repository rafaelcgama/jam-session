#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCAL_DB="$ROOT_DIR/jam.db"
TIMESTAMP="$(date +%Y%m%d%H%M%S)"
BACKUP_DIR="$ROOT_DIR/.db_backups"
BACKUP_DB="$BACKUP_DIR/jam.db.backup.$TIMESTAMP"
LOCAL_TMP="/private/tmp/jam-session-prod-$TIMESTAMP.db"
VM_NAME="${JAM_SESSION_VM_NAME:-jam-session-vm}"
VM_ZONE="${JAM_SESSION_VM_ZONE:-us-west1-b}"
REMOTE_DB="${JAM_SESSION_REMOTE_DB:-/var/www/jam-session/jam.db}"
REMOTE_TMP="/tmp/jam-session-prod-$TIMESTAMP.db"

cleanup() {
  rm -f "$LOCAL_TMP"
  gcloud compute ssh "$VM_NAME" --zone="$VM_ZONE" --command "sudo rm -f '$REMOTE_TMP'" >/dev/null 2>&1 || true
}
trap cleanup EXIT

if ! command -v gcloud >/dev/null 2>&1; then
  echo "gcloud is required to pull the production database." >&2
  exit 1
fi

if [[ -f "$LOCAL_DB" ]]; then
  mkdir -p "$BACKUP_DIR"
  cp "$LOCAL_DB" "$BACKUP_DB"
  echo "Backed up local DB to: $BACKUP_DB"
else
  echo "No local jam.db found. A new one will be created from production."
fi

echo "Preparing production DB copy on $VM_NAME..."
gcloud compute ssh "$VM_NAME" --zone="$VM_ZONE" --command \
  "sudo cp '$REMOTE_DB' '$REMOTE_TMP' && sudo chmod 0644 '$REMOTE_TMP'"

echo "Downloading production DB..."
gcloud compute scp "$VM_NAME:$REMOTE_TMP" "$LOCAL_TMP" --zone="$VM_ZONE"

if command -v sqlite3 >/dev/null 2>&1; then
  sqlite3 "$LOCAL_TMP" "PRAGMA integrity_check;" | grep -qx "ok"
fi

cp "$LOCAL_TMP" "$LOCAL_DB"
echo "Local DB refreshed from production: $LOCAL_DB"

if command -v sqlite3 >/dev/null 2>&1; then
  HAS_MEMBERS="$(sqlite3 "$LOCAL_DB" "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='members';")"
  if [[ "$HAS_MEMBERS" == "0" ]]; then
    MEMBER_COUNT=0
  else
    MEMBER_COUNT="$(sqlite3 "$LOCAL_DB" "SELECT COUNT(*) FROM members;")"
  fi
  echo "Local members count: $MEMBER_COUNT"
fi
