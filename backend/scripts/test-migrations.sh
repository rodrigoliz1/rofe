#!/usr/bin/env bash
# Always creates its own disposable database; never reads a production DATABASE_URL.
set -euo pipefail
root_dir="$(cd "$(dirname "$0")/.." && pwd)"
test_root="$(mktemp -d "${TMPDIR:-/tmp}/rofe-postgres.XXXXXX")"
cleanup() {
  pg_ctl -D "$test_root/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$test_root"
}
trap cleanup EXIT
initdb -D "$test_root/data" --auth=trust --no-locale -E UTF8 >/dev/null
# A private Unix socket and no TCP listener keep the fixture isolated.
pg_ctl -D "$test_root/data" -l "$test_root/server.log" -o "-h '' -k '$test_root'" -w start >/dev/null
createdb -h "$test_root" rofe_migration_test
for migration in "$root_dir"/migrations/*.sql; do
  psql -X -v ON_ERROR_STOP=1 -h "$test_root" -d rofe_migration_test -f "$migration" >"$test_root/migrations.log" 2>&1 || { cat "$test_root/migrations.log"; exit 1; }
done
psql -X -v ON_ERROR_STOP=1 -h "$test_root" -d rofe_migration_test -f "$root_dir/tests/sql/critical-flows.sql"
bash "$root_dir/tests/sql/concurrency.sh" "$test_root" rofe_migration_test
echo 'PostgreSQL migrations and transactional payment checks passed.'
