# WaFlow CRM — configuration and deployment guide

This document walks you from **environment variables** through **production deployment**. For day-to-day variable reference, see [CONFIGURATION.md](CONFIGURATION.md).

---

## 1. What you are deploying

| Component | Role |
|-----------|------|
| **backend** | FastAPI API (`/api/...`), webhooks, health. Production uses **Gunicorn** + Uvicorn workers. |
| **frontend** | Next.js UI (browser). Built with `NEXT_PUBLIC_*` baked in at **build time**. |
| **realtime** | Socket.IO server (JWT auth, Redis pub/sub). |
| **celery_worker** | Background jobs (automation, WhatsApp sends). |
| **celery_beat** | Celery scheduler (e.g. inactivity triggers). |
| **db** | PostgreSQL. |
| **redis** | Redis (Celery broker + realtime pub/sub). |

**Billing** is Stripe-mock in MVP; real payments are a follow-up. **Media uploads** use a local directory (`MEDIA_UPLOAD_DIR`) by default; for multiple API replicas, use a shared volume or object storage (S3-compatible) — not in this repo yet.

---

## 2. Prerequisites

- **Docker** and **Docker Compose** (Compose v2) on the server or your laptop.
- A **public HTTPS URL** for the API if you use WhatsApp Cloud webhooks (Meta requires HTTPS).
- **DNS** for your app domain and (optionally) API subdomain.

---

## 3. Configuration checklist (before first deploy)

### 3.1 Secrets (required in production)

| Variable | Notes |
|----------|--------|
| `JWT_SECRET` | Long random string; never commit. Rotating it invalidates all sessions. |
| `POSTGRES_PASSWORD` | Strong password; must match the password in `DATABASE_URL` if you use the bundled Postgres. |
| `DATABASE_URL` | Postgres DSN, e.g. `postgresql+psycopg2://USER:PASSWORD@db:5432/waflow` inside Compose. |
| `REDIS_URL` | e.g. `redis://redis:6379/0` inside Compose. |

### 3.2 Browser origins (CORS)

Browsers send an **Origin** header (`https://app.yourdomain.com`). The API and realtime service must allow that origin.

| Variable | Where | Example |
|----------|--------|---------|
| `CORS_ORIGINS` | **backend** + **realtime** | Comma-separated, no spaces required: `https://app.example.com,https://www.example.com` |

Do **not** put the API URL here unless the browser loads the SPA from the same host. Use the **frontend** origin(s) users actually open in the browser.

### 3.3 Frontend build-time URL

| Variable | Notes |
|----------|--------|
| `NEXT_PUBLIC_API_URL` | Base URL of the API **as seen by the browser** (e.g. `https://api.example.com`). Set when **building** the frontend image. |

If you change the API URL later, **rebuild** the frontend image.

### 3.4 WhatsApp (Meta Cloud API)

| Variable | Notes |
|----------|--------|
| `WHATSAPP_VERIFY_TOKEN` | Must match Meta’s “Verify token” in the webhook. |
| `WHATSAPP_APP_SECRET` | **Strongly recommended in production** — validates `X-Hub-Signature-256`. |
| `WHATSAPP_ACCESS_TOKEN` | Required for **outbound** sending. |

In Meta: webhook URL = `https://<your-api-host>/api/whatsapp/webhook` (HTTPS).

### 3.5 Email (optional)

Set `SMTP_HOST`, `SMTP_*`, `EMAIL_FROM` if you use billing test email or future email features. See [CONFIGURATION.md](CONFIGURATION.md).

### 3.6 Seed admin (optional, usually **off** in production)

| Variable | Notes |
|----------|--------|
| `SEED_ADMIN` | `true` only if you want a one-time admin user; use a strong password and disable after first login. |

### 3.7 Migrations and schema

| Variable | Notes |
|----------|--------|
| `RUN_MIGRATIONS` | When `true`, the backend entrypoint runs `alembic upgrade head` before starting (production compose sets this). |
| `AUTO_CREATE_TABLES` | `true` runs SQLAlchemy `create_all` on startup. Keep **`true`** until you have a **full** Alembic baseline for all tables; then you can switch to **`false`** and rely only on migrations. |

---

## 4. Prepare environment files

1. Copy the repo root `.env.example` to `.env`.
2. Fill in secrets and URLs (`JWT_SECRET`, `POSTGRES_PASSWORD`, `CORS_ORIGINS`, `NEXT_PUBLIC_API_URL`, etc.).
3. For local backend-only dev, you can still use `apps/backend/.env` (see [CONFIGURATION.md](CONFIGURATION.md) for precedence).

**Example fragment for production-like `.env`:**

```env
JWT_SECRET=your-long-random-secret
POSTGRES_PASSWORD=your-strong-db-password
DATABASE_URL=postgresql+psycopg2://waflow:your-strong-db-password@db:5432/waflow

CORS_ORIGINS=https://app.example.com
NEXT_PUBLIC_API_URL=https://api.example.com

WHATSAPP_VERIFY_TOKEN=your-meta-verify-token
WHATSAPP_APP_SECRET=your-meta-app-secret
WHATSAPP_ACCESS_TOKEN=your-token

SEED_ADMIN=false
```

---

## 5. Production stack with Docker Compose

Use the production compose file (no bind-mounted source, Gunicorn, built frontend and realtime):

```bash
docker compose -f docker-compose.prod.yml --env-file .env up -d --build
```

Services:

- **Frontend:** port `FRONTEND_PORT` (default `3000`).
- **Backend:** `BACKEND_PORT` (default `8000`).
- **Realtime:** `REALTIME_PORT` (default `4001`).
- **Media:** Docker volume `waflow_media` mounted at `/app/data/media` on backend and celery worker.

### 5.1 First deploy

1. Ensure `.env` sets required variables (`JWT_SECRET`, `POSTGRES_PASSWORD`, `CORS_ORIGINS`, `NEXT_PUBLIC_API_URL`).
2. Run the command above.
3. Check health: `curl http://localhost:8000/health` (or your host port after TLS proxy).
4. Check readiness: `GET /ready` (DB + Redis).

### 5.2 Upgrades

1. Pull new images or rebuild: `docker compose -f docker-compose.prod.yml build --pull`.
2. `docker compose -f docker-compose.prod.yml up -d` — migrations run when `RUN_MIGRATIONS=true`.

### 5.3 TLS and reverse proxy (typical)

Put **Caddy**, **NGINX**, **Traefik**, or a cloud load balancer in front:

- Terminate HTTPS.
- Proxy `https://api.example.com` → backend `8000`.
- Proxy `https://app.example.com` → frontend `3000`.
- Proxy `wss://` for realtime if you expose Socket.IO on a host (e.g. `realtime.example.com:443` → `4001`).

**NGINX** (illustrative — adjust paths and SSL cert paths):

```nginx
server {
    listen 443 ssl;
    server_name api.example.com;
    ssl_certificate     /etc/letsencrypt/live/api.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Use `https://api.example.com` as `NEXT_PUBLIC_API_URL` and include `https://app.example.com` in `CORS_ORIGINS`.

---

## 6. Development vs production

| Topic | Dev (`docker-compose.yml`) | Prod (`docker-compose.prod.yml`) |
|-------|---------------------------|----------------------------------|
| Code | Bind-mounted `./apps/backend`, `realtime` | Baked into image only |
| API server | `uvicorn --reload` (compose override) | Gunicorn + Uvicorn workers (`USE_GUNICORN=true`) |
| Frontend | Often `npm run dev` on host | Next.js `standalone` image |
| Realtime | `npm run dev` (tsx) | `node dist/index.js` |
| Migrations | Manual or optional | `RUN_MIGRATIONS=true` on container start |

---

## 7. Operational recommendations

- **Backups:** schedule Postgres dumps or use a managed database with automated backups.
- **Monitoring:** watch `/health` and `/ready`, Celery worker logs, and disk use for `waflow_media`.
- **Rate limiting:** add at the edge (CDN/WAF) or reverse proxy for `/api/auth/*` and webhooks.
- **Rotating secrets:** changing `JWT_SECRET` logs everyone out; plan maintenance windows.

---

## 8. CI

GitHub Actions (`.github/workflows/ci.yml`) runs **`pytest`** on `apps/backend` for pushes and PRs to `main` / `master`.

---

## 9. Quick reference

| Check | Command / URL |
|--------|----------------|
| API health | `GET /health` |
| DB + Redis | `GET /ready` |
| Interactive API | `/docs` (disable or protect in production) |

Full variable list: [CONFIGURATION.md](CONFIGURATION.md).
