#!/usr/bin/env bash
set -euo pipefail

VM_NAME="${JAM_SESSION_VM_NAME:-jam-session-vm}"
VM_ZONE="${JAM_SESSION_VM_ZONE:-us-west1-b}"
REMOTE_DB="${JAM_SESSION_REMOTE_DB:-/var/www/jam-session/jam.db}"
REMOTE_BACKUP_DIR="${JAM_SESSION_REMOTE_BACKUP_DIR:-/var/www/jam-session/.db_backups}"
KEEP_BACKUPS="${JAM_SESSION_KEEP_BACKUPS:-30}"
TIMESTAMP="$(date +%Y%m%d%H%M%S)"

if ! command -v gcloud >/dev/null 2>&1; then
  echo "gcloud is required to back up the production database." >&2
  exit 1
fi

if ! [[ "$KEEP_BACKUPS" =~ ^[0-9]+$ ]] || [[ "$KEEP_BACKUPS" -lt 1 ]]; then
  echo "JAM_SESSION_KEEP_BACKUPS must be a positive integer." >&2
  exit 1
fi

echo "Creating production DB backup on $VM_NAME..."
gcloud compute ssh "$VM_NAME" --zone="$VM_ZONE" --command "
  set -euo pipefail
  sudo mkdir -p '$REMOTE_BACKUP_DIR'
  if [ ! -f '$REMOTE_DB' ]; then
    echo 'Production DB not found: $REMOTE_DB' >&2
    exit 1
  fi
  backup='$REMOTE_BACKUP_DIR/jam.db.backup.$TIMESTAMP'
  sudo cp '$REMOTE_DB' \"\$backup\"
  sudo chmod 0640 \"\$backup\"
  sudo find '$REMOTE_BACKUP_DIR' -maxdepth 1 -type f -name 'jam.db.backup.*' -print |
    sort -r |
    tail -n +$((KEEP_BACKUPS + 1)) |
    xargs -r sudo rm -f
  echo \"Backup created: \$backup\"
  echo 'Available backups:'
  sudo find '$REMOTE_BACKUP_DIR' -maxdepth 1 -type f -name 'jam.db.backup.*' -printf '%f\n' | sort -r | head -$KEEP_BACKUPS
"
