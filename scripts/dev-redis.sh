#!/usr/bin/env bash
# Local Redis for GeoSyntra Axum auth cache (Task 23.6 dev).
set -euo pipefail

REDIS_HOST="${REDIS_HOST:-127.0.0.1}"
REDIS_PORT="${REDIS_PORT:-6379}"
REDIS_DATA="${REDIS_DATA:-$(cd "$(dirname "$0")/.." && pwd)/.redis/data}"

start() {
  if command -v redis-cli >/dev/null 2>&1 && redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" ping 2>/dev/null | grep -qx PONG; then
    echo "dev-redis: already running on ${REDIS_HOST}:${REDIS_PORT}"
    return 0
  fi
  if ! command -v redis-server >/dev/null 2>&1; then
    echo "dev-redis: install redis (e.g. nix-shell -p redis) or use docker run -p 6379:6379 redis:7-alpine" >&2
    exit 1
  fi
  mkdir -p "$REDIS_DATA"
  echo "dev-redis: starting on ${REDIS_HOST}:${REDIS_PORT}"
  redis-server --daemonize yes --port "$REDIS_PORT" --bind "$REDIS_HOST" --dir "$REDIS_DATA" --save ""
  redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" ping
  echo "dev-redis: REDIS_URL=redis://${REDIS_HOST}:${REDIS_PORT}/0"
}

stop() {
  if command -v redis-cli >/dev/null 2>&1; then
    redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" shutdown nosave 2>/dev/null || true
    echo "dev-redis: stopped"
  fi
}

case "${1:-start}" in
  start) start ;;
  stop) stop ;;
  status)
    redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" ping || exit 1
    ;;
  *)
    echo "usage: $0 {start|stop|status}" >&2
    exit 1
    ;;
esac
