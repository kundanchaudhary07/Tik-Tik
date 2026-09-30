#!/usr/bin/env bash
set -e
pg_ctlcluster 15 main start || true
export PYTHONPATH=backend
alembic -c backend/alembic.ini upgrade head
python3 backend/app/db/seed.py
exec uvicorn app.main:app --host 127.0.0.1 --port 8001
