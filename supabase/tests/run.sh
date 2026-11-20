#!/bin/sh
# Runs every migration against a throwaway database, then the checks.
# Needs a local Postgres: PGHOST/PGPORT/PGUSER as usual.
set -e
cd "$(dirname "$0")/.."
db=hive_test_$$
createdb "$db"
trap 'dropdb "$db"' EXIT
psql -q -v ON_ERROR_STOP=1 -d "$db" -f tests/supabase-stub.sql
for f in migrations/*.sql; do psql -q -v ON_ERROR_STOP=1 -d "$db" -f "$f"; done
for f in tests/*.test.sql; do psql -q -v ON_ERROR_STOP=1 -d "$db" -f "$f"; done
