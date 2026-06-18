# =============================================================================
# backup.Dockerfile — Dedicated backup sidecar for chrome-keb bridge
#
# Lightweight Alpine image with rclone + dcron. Runs the backup-to-r2.sh
# script daily at midnight Bangkok time (TZ=Asia/Bangkok).
#
# Build:
#   docker compose -f packages/bridge/docker-compose.yml build backup
#
# Or standalone:
#   docker build -f packages/bridge/backup.Dockerfile -t chrome-keb-backup .
#
# Run (for testing):
#   docker run --rm \
#     -e R2_ACCOUNT_ID=... \
#     -e R2_ACCESS_KEY_ID=... \
#     -e R2_SECRET_ACCESS_KEY=... \
#     -e R2_BUCKET=keb-backups \
#     -v ./data/keb:/data:ro \
#     chrome-keb-backup \
#     /usr/local/bin/backup-to-r2.sh
# =============================================================================

FROM alpine:3.21

# Install rclone (cloud storage sync) and dcron (cron daemon for Alpine)
RUN apk add --no-cache \
    rclone \
    dcron

# Copy the backup script
COPY packages/bridge/scripts/backup-to-r2.sh /usr/local/bin/backup-to-r2.sh
RUN chmod +x /usr/local/bin/backup-to-r2.sh

# Schedule daily backup at midnight local time (00:00)
# TZ=Asia/Bangkok is set at runtime via docker-compose environment
RUN echo "0 0 * * * /usr/local/bin/backup-to-r2.sh" > /etc/crontabs/root

# Run dcron in the foreground
CMD ["crond", "-f", "-l", "2"]
