#!/usr/bin/env bash
# 04-backups-restore-proof.sh — pre-cutover backup + restore proofs.
#
#   A. Encrypt the authoritative D1 export artifact and upload it off-site (R2).
#   B. Trigger the target PostgreSQL backup and upload it off-site (R2).
#   C. Restore the D1-derived artifact into an isolated database -> verify counts.
#   D. Restore the target backup into a second isolated database -> verify counts.
#
# Every step fails closed. Prints counts only; never prints credentials or rows.
set -euo pipefail
ACC="20af8653055a0b9e99aa4a30e346f3d4"
BUCKET="vps-backups"
PREFIX="jobs-db-backups"
ENDPOINT="https://${ACC}.r2.cloudflarestorage.com"
export AWS_EC2_METADATA_DISABLED=true
PG=jobs-postgres
DB=jobs
DIR=/root/jobsmig
TS="$(date +%Y%m%d-%H%M%S)"
PASSFILE=/root/jobs-backup-passphrase

mkdir -p "$DIR" && chmod 700 "$DIR"

if [ ! -f "$PASSFILE" ]; then
  umask 077
  openssl rand -hex 32 > "$PASSFILE"
  chmod 600 "$PASSFILE"
  echo "[proof] created backup passphrase"
fi

cat > "$DIR/counts.sql" <<'SQL'
SELECT string_agg(relname || '=' || cnt, ',' ORDER BY relname)
FROM (
  SELECT c.relname,
         (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM %I.%I', n.nspname, c.relname), false, true, '')))[1]::text::bigint AS cnt
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relkind = 'r' AND n.nspname = 'public'
) s;
SQL

counts_of() { docker exec -i "$PG" psql -U jobs -d "$1" -tA < "$DIR/counts.sql"; }

# --- A. authoritative D1 export -> encrypted off-site ----------------------------
echo "[proof] A. encrypting D1 export artifact"
if [ ! -f "$DIR/d1-precutover.tar" ]; then
  tar -C "$DIR/export" -cf "$DIR/d1-precutover.tar" .
fi
gpg --batch --yes --pinentry-mode loopback --passphrase-file "$PASSFILE" \
  --symmetric --cipher-algo AES256 --output "$DIR/d1-precutover-${TS}.tar.gpg" "$DIR/d1-precutover.tar" 2>/dev/null
aws s3 cp "$DIR/d1-precutover-${TS}.tar.gpg" "s3://${BUCKET}/${PREFIX}/d1-precutover-${TS}.tar.gpg" \
  --endpoint-url "$ENDPOINT" >/dev/null
echo "[proof] A. uploaded s3://${BUCKET}/${PREFIX}/d1-precutover-${TS}.tar.gpg ($(du -h "$DIR/d1-precutover-${TS}.tar.gpg" | cut -f1))"

# --- B. target PostgreSQL backup (manual trigger of the daily script) ------------
echo "[proof] B. triggering target backup"
bash /usr/local/bin/jobs-db-backup.sh >/dev/null
LATEST=$(aws s3 ls "s3://${BUCKET}/${PREFIX}/" --endpoint-url "$ENDPOINT" | awk '{print $4}' | grep '^pg_dump-'"$DB"'-' | sort | tail -1)
echo "[proof] B. newest target backup object: $LATEST"
[ -n "$LATEST" ] || { echo "[proof] B. FAILED: no target backup found"; exit 1; }

# --- C. restore the D1-derived artifact into an isolated database ----------------
echo "[proof] C. restore-test source artifact -> isolated db jobs_verify_d1"
docker exec -i "$PG" psql -U jobs -d postgres -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
DROP DATABASE IF EXISTS jobs_verify_d1;
CREATE DATABASE jobs_verify_d1 OWNER jobs;
SQL
docker exec -i "$PG" psql -U jobs -d jobs_verify_d1 -v ON_ERROR_STOP=1 < /root/jobsmig/schema.sql >/dev/null
docker exec -i "$PG" psql -U jobs -d jobs_verify_d1 -v ON_ERROR_STOP=1 < /root/jobsmig/data.sql >/dev/null
echo "[proof] C. jobs_verify_d1 counts: $(counts_of jobs_verify_d1)"

# --- D. restore the target backup into a second isolated database ---------------
echo "[proof] D. restore-test target backup -> isolated db jobs_verify_pg"
aws s3 cp "s3://${BUCKET}/${PREFIX}/${LATEST}" "$DIR/restore-test.gpg" --endpoint-url "$ENDPOINT" >/dev/null
gpg --batch --yes --pinentry-mode loopback --passphrase-file "$PASSFILE" \
  --decrypt "$DIR/restore-test.gpg" 2>/dev/null | gunzip > "$DIR/restore-test.sql"
docker exec -i "$PG" psql -U jobs -d postgres -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
DROP DATABASE IF EXISTS jobs_verify_pg;
CREATE DATABASE jobs_verify_pg OWNER jobs;
SQL
docker exec -i "$PG" psql -U jobs -d jobs_verify_pg -v ON_ERROR_STOP=1 < "$DIR/restore-test.sql" >/dev/null
echo "[proof] D. jobs_verify_pg counts: $(counts_of jobs_verify_pg)"
echo "[proof] D. live ${DB} counts:    $(counts_of "$DB")"

rm -f "$DIR/restore-test.sql" "$DIR/restore-test.gpg"
echo "[proof] done"
