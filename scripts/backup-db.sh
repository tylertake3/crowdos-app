#!/usr/bin/env bash
# Back up the CrowdOS Supabase database to a dated, compressed file in backups/.
#
# Run with:  npm run backup
#
# Needs SUPABASE_DB_URL in .env.local — the "Session pooler" connection string
# from the Supabase dashboard (Connect button, top of the dashboard), with
# [YOUR-PASSWORD] replaced by the real database password.
#
# What's saved: the public schema (all app tables + policies) and the auth
# schema (user accounts), so owner links survive a restore. Restore with:
#   gunzip -c backups/<file>.sql.gz | psql "$SUPABASE_DB_URL"
# — restore into a SCRATCH/DEV project to test, never straight into a live one.
set -euo pipefail
cd "$(dirname "$0")/.."

PG_DUMP="/opt/homebrew/opt/libpq/bin/pg_dump"
[ -x "$PG_DUMP" ] || PG_DUMP="$(command -v pg_dump || true)"
if [ -z "$PG_DUMP" ]; then
  echo "pg_dump not found — install with: brew install libpq" >&2; exit 1
fi

DB_URL="$(grep -E '^SUPABASE_DB_URL=' .env.local 2>/dev/null | cut -d= -f2- || true)"
if [ -z "$DB_URL" ]; then
  echo "SUPABASE_DB_URL is not set in .env.local" >&2
  echo "Dashboard → Connect → Session pooler URI, replace [YOUR-PASSWORD], then add:" >&2
  echo "SUPABASE_DB_URL=postgresql://postgres.xxxx:PASSWORD@aws-0-eu-west-2.pooler.supabase.com:5432/postgres" >&2
  exit 1
fi

mkdir -p backups
STAMP="$(date +%Y-%m-%d_%H%M)"
OUT="backups/crowdos-${STAMP}.sql.gz"

"$PG_DUMP" "$DB_URL" \
  --schema=public --schema=auth \
  --no-owner --no-privileges \
  | gzip > "$OUT"

SIZE="$(du -h "$OUT" | cut -f1)"
echo "✓ Backup written: $OUT ($SIZE)"
echo "  Keep copies somewhere other than this Mac too (e.g. iCloud/Drive)."
