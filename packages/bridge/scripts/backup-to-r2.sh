#!/bin/sh
# =============================================================================
# backup-to-r2.sh — Daily Keb data backup to Cloudflare R2
#
# Runs from a dedicated Alpine sidecar container (backup.Dockerfile).
# Creates a tar.gz of the Keb data directory and uploads it to an R2 bucket.
# Old backups beyond the retention period are pruned automatically.
#
# Environment variables (all required except RETENTION_DAYS):
#   R2_ACCOUNT_ID          — Cloudflare account ID (subdomain in R2 endpoint)
#   R2_ACCESS_KEY_ID       — R2 API token access key ID
#   R2_SECRET_ACCESS_KEY   — R2 API token secret access key
#   R2_BUCKET              — R2 bucket name (e.g., "keb-backups")
#   R2_BACKUP_RETENTION_DAYS — max age in days before pruning (default: 30)
#   BACKUP_DATA_DIR        — path to Keb data directory (default: /data)
#
# Usage:
#   # Manual invocation (inside container):
#   backup-to-r2.sh
#
#   # Verify without uploading (dry-run rclone):
#   R2_ACCOUNT_ID=... ... backup-to-r2.sh
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
DATA_DIR="${BACKUP_DATA_DIR:-/data}"

# ---------------------------------------------------------------------------
# Pre-flight checks
# ---------------------------------------------------------------------------
if [ ! -d "${DATA_DIR}" ] || [ -z "$(ls -A "${DATA_DIR}" 2>/dev/null)" ]; then
    echo "[backup] Data directory is empty or missing — skipping"
    exit 0
fi

R2_ACCOUNT_ID="${R2_ACCOUNT_ID:?R2_ACCOUNT_ID is required}"
R2_ACCESS_KEY_ID="${R2_ACCESS_KEY_ID:?R2_ACCESS_KEY_ID is required}"
R2_SECRET_ACCESS_KEY="${R2_SECRET_ACCESS_KEY:?R2_SECRET_ACCESS_KEY is required}"
R2_BUCKET="${R2_BUCKET:?R2_BUCKET is required}"
RETENTION_DAYS="${R2_BACKUP_RETENTION_DAYS:-30}"

# Inline rclone remote config for S3-compatible Cloudflare R2.
# No config file needed — everything is passed via the URL-style syntax.
RCLONE_REMOTE=":s3,provider=Cloudflare,access_key_id=${R2_ACCESS_KEY_ID},secret_access_key=${R2_SECRET_ACCESS_KEY},region=auto,endpoint=https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com:${R2_BUCKET}"

TIMESTAMP=$(date -u +%Y%m%dT%H%M%SZ)
BACKUP_FILE="/tmp/keb-backup-${TIMESTAMP}.tar.gz"
BACKUP_PATH="keb-backups/${TIMESTAMP}.tar.gz"

# ---------------------------------------------------------------------------
# Backup
# ---------------------------------------------------------------------------
echo "[backup] Creating archive: ${BACKUP_FILE}"
tar --warning=no-file-changed -czf "${BACKUP_FILE}" -C "${DATA_DIR}" .

echo "[backup] Uploading to R2: s3://${R2_BUCKET}/${BACKUP_PATH}"
rclone copy "${BACKUP_FILE}" "${RCLONE_REMOTE}/${BACKUP_PATH}"

echo "[backup] Pruning backups older than ${RETENTION_DAYS} days"
rclone delete --min-age "${RETENTION_DAYS}d" "${RCLONE_REMOTE}/keb-backups/"

# ---------------------------------------------------------------------------
# Cleanup
# ---------------------------------------------------------------------------
rm -f "${BACKUP_FILE}"
echo "[backup] Done — ${BACKUP_PATH}"
