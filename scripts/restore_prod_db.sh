#!/usr/bin/env bash
set -euo pipefail

VM_NAME="${JAM_SESSION_VM_NAME:-jam-session-vm}"
VM_ZONE="${JAM_SESSION_VM_ZONE:-us-west1-b}"
REMOTE_DB="${JAM_SESSION_REMOTE_DB:-/var/www/jam-session/jam.db}"
REMOTE_BACKUP_DIR="${JAM_SESSION_REMOTE_BACKUP_DIR:-/var/www/jam-session/.db_backups}"
SERVICE_NAME="${JAM_SESSION_SERVICE_NAME:-jam-session}"
BACKUP_NAME="${1:-latest}"

if ! command -v gcloud >/dev/null 2>&1; then
  echo "gcloud is required to restore the production database." >&2
  exit 1
fi

if [[ "$BACKUP_NAME" == "--list" ]]; then
  gcloud compute ssh "$VM_NAME" --zone="$VM_ZONE" --command "
    set -euo pipefail
    sudo find '$REMOTE_BACKUP_DIR' -maxdepth 1 -type f -name 'jam.db.backup.*' -printf '%f\n' | sort -r
  "
  exit 0
fi

echo "Restoring production DB on $VM_NAME from: $BACKUP_NAME"
gcloud compute ssh "$VM_NAME" --zone="$VM_ZONE" --command "
  set -euo pipefail
  if [ '$BACKUP_NAME' = 'latest' ]; then
    backup=\$(sudo find '$REMOTE_BACKUP_DIR' -maxdepth 1 -type f -name 'jam.db.backup.*' -print | sort -r | head -1)
  else
    backup='$REMOTE_BACKUP_DIR/$BACKUP_NAME'
  fi

  if [ -z \"\${backup:-}\" ] || [ ! -f \"\$backup\" ]; then
    echo 'Backup not found. Available backups:' >&2
    sudo find '$REMOTE_BACKUP_DIR' -maxdepth 1 -type f -name 'jam.db.backup.*' -printf '%f\n' | sort -r >&2
    exit 1
  fi

  safety='$REMOTE_BACKUP_DIR/jam.db.pre-restore.'\$(date +%Y%m%d%H%M%S)
  if [ -f '$REMOTE_DB' ]; then
    sudo cp '$REMOTE_DB' \"\$safety\"
    sudo chmod 0640 \"\$safety\"
    echo \"Current DB backed up before restore: \$safety\"
  fi

  sudo cp \"\$backup\" '$REMOTE_DB'
  sudo chmod 0644 '$REMOTE_DB'
  sudo systemctl restart '$SERVICE_NAME'
  sleep 2
  echo \"Restored from: \$backup\"
  sudo systemctl is-active --quiet '$SERVICE_NAME'
  echo 'Service restarted successfully.'
"
