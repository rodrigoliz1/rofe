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
# Enable the same query guard as PostgREST for every test connection, including races.
# SAFEUPDATE_LIBRARY points to a locally built module; never disables server protections.
if [[ -n "${SAFEUPDATE_LIBRARY:-}" ]]; then
  export PGOPTIONS="${PGOPTIONS:-} -c session_preload_libraries=$SAFEUPDATE_LIBRARY"
else
  echo 'pg-safeupdate unavailable: set SAFEUPDATE_LIBRARY for production-parity checks.' >&2
fi
psql -X -v ON_ERROR_STOP=1 -h "$test_root" -d rofe_migration_test -f "$root_dir/tests/sql/cash-sessions.sql"
psql -X -v ON_ERROR_STOP=1 -h "$test_root" -d rofe_migration_test -f "$root_dir/tests/sql/critical-flows.sql"
bash "$root_dir/tests/sql/cash-concurrency.sh" "$test_root" rofe_migration_test
bash "$root_dir/tests/sql/concurrency.sh" "$test_root" rofe_migration_test
# Reapplying 009 against populated historical fixtures must preserve every financial row.
before_snapshot=$(psql -X -q -t -A -v ON_ERROR_STOP=1 -h "$test_root" -d rofe_migration_test -f "$root_dir/tests/sql/cash-snapshot.sql")
psql -X -v ON_ERROR_STOP=1 -h "$test_root" -d rofe_migration_test -f "$root_dir/migrations/009_cash_session_safe_updates.sql" >/dev/null
after_snapshot=$(psql -X -q -t -A -v ON_ERROR_STOP=1 -h "$test_root" -d rofe_migration_test -f "$root_dir/tests/sql/cash-snapshot.sql")
[[ "$before_snapshot" == "$after_snapshot" ]] || { echo 'Migration changed financial fixture data'; exit 1; }
echo 'PostgreSQL migrations, cash sessions and transactional payment checks passed; 009 preserves populated records.'
