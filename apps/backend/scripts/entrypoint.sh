#!/bin/sh
set -e
cd /app

if [ "${RUN_MIGRATIONS:-}" = "true" ]; then
  alembic upgrade head
fi

if [ "${USE_GUNICORN:-}" = "true" ]; then
  exec gunicorn app.main:app \
    -k uvicorn.workers.UvicornWorker \
    -w "${WEB_CONCURRENCY:-4}" \
    -b "0.0.0.0:${PORT:-8000}" \
    --timeout "${GUNICORN_TIMEOUT:-120}" \
    --access-logfile - \
    --error-logfile -
fi

exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
