"""
Pytest loads this before test modules. Defaults for local runs (sqlite + no DDL in lifespan).
If you pass DATABASE_URL=postgresql+... (e.g. Docker), TESTING stays off unless you set TESTING=true.
"""

import os

if "DATABASE_URL" not in os.environ:
    os.environ["DATABASE_URL"] = "sqlite+pysqlite:///:memory:"
if "REDIS_URL" not in os.environ:
    os.environ["REDIS_URL"] = "redis://localhost:6379/0"
if "JWT_SECRET" not in os.environ:
    os.environ["JWT_SECRET"] = "test-secret-key-for-pytest-only-32chars"
if "TESTING" not in os.environ and "sqlite" in os.environ.get("DATABASE_URL", "").lower():
    os.environ["TESTING"] = "true"
