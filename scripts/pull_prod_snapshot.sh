#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SNAPSHOT_DB="$ROOT_DIR/prod-jam.db"
TIMESTAMP="$(date +%Y%m%d%H%M%S)"
LOCAL_TMP="/private/tmp/jam-session-prod-snapshot-$TIMESTAMP.db"
VM_NAME="${JAM_SESSION_VM_NAME:-jam-session-vm}"
VM_ZONE="${JAM_SESSION_VM_ZONE:-us-west1-b}"
REMOTE_DB="${JAM_SESSION_REMOTE_DB:-/var/www/jam-session/jam.db}"
REMOTE_TMP="/tmp/jam-session-prod-snapshot-$TIMESTAMP.db"

cleanup() {
  rm -f "$LOCAL_TMP"
  gcloud compute ssh "$VM_NAME" --zone="$VM_ZONE" --command "sudo rm -f '$REMOTE_TMP'" >/dev/null 2>&1 || true
}
trap cleanup EXIT

if ! command -v gcloud >/dev/null 2>&1; then
  echo "gcloud is required to pull the production database snapshot." >&2
  exit 1
fi

echo "Preparing production DB snapshot on $VM_NAME..."
gcloud compute ssh "$VM_NAME" --zone="$VM_ZONE" --command \
  "sudo cp '$REMOTE_DB' '$REMOTE_TMP' && sudo chmod 0644 '$REMOTE_TMP'"

echo "Downloading production DB snapshot..."
gcloud compute scp "$VM_NAME:$REMOTE_TMP" "$LOCAL_TMP" --zone="$VM_ZONE"

if command -v sqlite3 >/dev/null 2>&1; then
  sqlite3 "$LOCAL_TMP" "PRAGMA integrity_check;" | grep -qx "ok"
fi

cp "$LOCAL_TMP" "$SNAPSHOT_DB"
echo "Production snapshot refreshed for DataGrip: $SNAPSHOT_DB"

if command -v sqlite3 >/dev/null 2>&1; then
  TABLE_NAME="$(sqlite3 "$SNAPSHOT_DB" "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('members', 'musicians') ORDER BY CASE name WHEN 'members' THEN 0 ELSE 1 END LIMIT 1;")"
  if [[ -z "$TABLE_NAME" ]]; then
    MEMBER_COUNT=0
  else
    MEMBER_COUNT="$(sqlite3 "$SNAPSHOT_DB" "SELECT COUNT(*) FROM $TABLE_NAME;")"
  fi
  echo "Snapshot members count: $MEMBER_COUNT"
fi
