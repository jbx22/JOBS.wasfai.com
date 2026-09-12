#!/usr/bin/env bash
# jobs-db-backup.sh — daily encrypted off-server backup of the Jobs PostgreSQL DB.
#
#   dump (as the container's admin role) -> gzip -> AES-256 (gpg) -> Cloudflare R2
#   Retention: 14 days on-host, 30 days on R2.
#   Failure visibility: non-zero exit + explicit FAILED marker in the log.
#
# Installed at /usr/local/bin/jobs-db-backup.sh and scheduled from /etc/crontab.
set -u
ACC="20af8653055a0b9e99aa4a30e346f3d4"
BUCKET="vps-backups"
PREFIX="jobs-db-backups"
ENDPOINT="https://${ACC}.r2.cloudflarestorage.com"
export AWS_EC2_METADATA_DISABLED=true

PG="jobs-postgres"
DB="jobs"
DB_BACKUP_DIR="/root/jobs-backups"
RETENTION_LOCAL_DAYS=14
RETENTION_R2_DAYS=30
PASSPHRASE_FILE="/root/jobs-backup-passphrase"
TS="$(date +%Y%m%d-%H%M%S)"
STAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

fail() { echo "[$STAMP] FAILED: $*"; exit 1; }

mkdir -p "$DB_BACKUP_DIR" || fail "cannot create $DB_BACKUP_DIR"
chmod 700 "$DB_BACKUP_DIR"

docker inspect "$PG" >/dev/null 2>&1 || fail "container $PG not found"

DUMP="$DB_BACKUP_DIR/pg_dump-${DB}-${TS}.sql.gz"
echo "[$STAMP] dumping ${DB} from ${PG}"
if ! docker exec "$PG" pg_dump -U jobs -d "$DB" --no-owner --no-privileges 2>/tmp/jobs-pg.err \
  | gzip > "$DUMP"; then
  fail "pg_dump failed: $(tail -2 /tmp/jobs-pg.err)"
fi
[ -s "$DUMP" ] || fail "empty dump"
echo "[$STAMP] dump size: $(du -h "$DUMP" | cut -f1)"

# --- off-site: encrypt + upload -------------------------------------------------
if [ ! -f "$PASSPHRASE_FILE" ] || [ ! -f /root/.aws/credentials ]; then
  fail "R2/encryption not configured (missing $PASSPHRASE_FILE or /root/.aws/credentials)"
fi
KEY="$(basename "${DUMP%.gz}").gpg"
if ! gpg --batch --yes --pinentry-mode loopback --passphrase-file "$PASSPHRASE_FILE" \
  --symmetric --cipher-algo AES256 --output "$DB_BACKUP_DIR/$KEY" "$DUMP" 2>/dev/null; then
  fail "gpg encryption failed"
fi
if aws s3 cp "$DB_BACKUP_DIR/$KEY" "s3://${BUCKET}/${PREFIX}/${KEY}" --endpoint-url "$ENDPOINT" \
  >>/tmp/jobs-r2.err 2>&1; then
  echo "[$STAMP] R2 off-site OK: s3://${BUCKET}/${PREFIX}/${KEY}"
else
  fail "R2 upload failed: $(tail -2 /tmp/jobs-r2.err)"
fi
rm -f "$DB_BACKUP_DIR/$KEY"

# --- retention ------------------------------------------------------------------
find "$DB_BACKUP_DIR" -name "pg_dump-${DB}-*.sql.gz" -mtime +$RETENTION_LOCAL_DAYS -delete 2>/dev/null

CUTOFF="$(date -u -d "-${RETENTION_R2_DAYS} days" +%Y-%m-%d)"
aws s3 ls "s3://${BUCKET}/${PREFIX}/" --endpoint-url "$ENDPOINT" 2>/dev/null | while read -r line; do
  [ -n "$line" ] || continue
  obj_date="${line%% *}"
  obj_name="${line##* }"
  case "$obj_name" in
    pg_dump-${DB}-*.sql.gz.gpg)
      if [ "$obj_date" \< "$CUTOFF" ]; then
        aws s3 rm "s3://${BUCKET}/${PREFIX}/${obj_name}" --endpoint-url "$ENDPOINT" >>/tmp/jobs-r2.err 2>&1 \
          && echo "[$STAMP] pruned R2 object older than ${RETENTION_R2_DAYS}d: $obj_name"
      fi
      ;;
  esac
done

echo "[$STAMP] OK. latest local:"
ls -lht "$DB_BACKUP_DIR" | head -4
echo "[$STAMP] R2 objects:"
aws s3 ls "s3://${BUCKET}/${PREFIX}/" --endpoint-url "$ENDPOINT" 2>&1 | tail -5
