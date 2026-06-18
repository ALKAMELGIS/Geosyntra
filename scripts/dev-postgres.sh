#!/usr/bin/env bash
# Local PostgreSQL for GeoSyntra Rust/sqlx dev (Nix devShell + direnv).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PGDATA="${PGDATA:-$ROOT_DIR/.postgres/data}"
PGHOST="${PGHOST:-127.0.0.1}"
PGPORT="${PGPORT:-5433}"
PGUSER="${PGUSER:-geosyntra}"
PGPASSWORD="${PGPASSWORD:-geosyntra}"
PGDATABASE="${PGDATABASE:-geosyntra_dev}"
LOG_FILE="${PGDATA}/postgres.log"
PID_FILE="${PGDATA}/postmaster.pid"

export PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE

require_tools() {
  for tool in initdb pg_ctl psql createdb createuser; do
    if ! command -v "$tool" >/dev/null 2>&1; then
      echo "dev-postgres: missing $tool (enter the Nix devShell first)" >&2
      exit 1
    fi
  done
}

is_running() {
  if [[ -f "$PID_FILE" ]] && pg_ctl -D "$PGDATA" status >/dev/null 2>&1; then
    return 0
  fi
  return 1
}

bootstrap_cluster() {
  if [[ -d "$PGDATA" ]]; then
    return 0
  fi

  echo "dev-postgres: initializing cluster at $PGDATA"
  mkdir -p "$(dirname "$PGDATA")"
  initdb -D "$PGDATA" -A trust --encoding=UTF8 --locale=C

  cat >>"$PGDATA/postgresql.conf" <<EOF
listen_addresses = '127.0.0.1'
port = ${PGPORT}
unix_socket_directories = '${PGDATA}'
EOF

  cat >"$PGDATA/pg_hba.conf" <<EOF
local   all             all                                     trust
host    all             all             127.0.0.1/32            trust
host    all             all             ::1/128                 trust
EOF
}

bootstrap_roles() {
  psql -v ON_ERROR_STOP=1 postgres <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${PGUSER}') THEN
    CREATE ROLE ${PGUSER} WITH LOGIN SUPERUSER PASSWORD '${PGPASSWORD}';
  END IF;
END
\$\$;
SQL

  if ! psql -Atqc "SELECT 1 FROM pg_database WHERE datname='${PGDATABASE}'" postgres | grep -q 1; then
    createdb -O "$PGUSER" "$PGDATABASE"
  fi
}

start_server() {
  require_tools
  bootstrap_cluster

  if is_running; then
    echo "dev-postgres: already running on ${PGHOST}:${PGPORT}"
  else
    echo "dev-postgres: starting on ${PGHOST}:${PGPORT}"
    pg_ctl -D "$PGDATA" -l "$LOG_FILE" -o "-p ${PGPORT} -h ${PGHOST}" start
  fi

  bootstrap_roles
  echo "dev-postgres: DATABASE_URL=postgres://${PGUSER}:${PGPASSWORD}@${PGHOST}:${PGPORT}/${PGDATABASE}"
}

stop_server() {
  require_tools
  if is_running; then
    pg_ctl -D "$PGDATA" stop -m fast
    echo "dev-postgres: stopped"
  else
    echo "dev-postgres: not running"
  fi
}

status_server() {
  require_tools
  if is_running; then
    echo "dev-postgres: running (${PGHOST}:${PGPORT}, db=${PGDATABASE})"
  else
    echo "dev-postgres: stopped"
    exit 1
  fi
}

case "${1:-start}" in
  start) start_server ;;
  stop) stop_server ;;
  status) status_server ;;
  restart)
    stop_server || true
    start_server
    ;;
  *)
    echo "usage: $0 {start|stop|status|restart}" >&2
    exit 1
    ;;
esac
