# WaFlow CRM — configuration reference

Put secrets in **`.env`** at the repo root (`WAflow_crm/.env`) and/or **`apps/backend/.env`**. If both exist, **`apps/backend/.env` wins** for duplicate keys. Copy from `.env.example` and adjust.

---

## 1. Always required (backend)

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string. **Docker backend:** `postgresql+psycopg2://waflow:waflow@db:5432/waflow`. **Uvicorn on host:** use `127.0.0.1` instead of `db`. |
| `REDIS_URL` | Redis for realtime pub/sub and Celery. **Docker:** `redis://redis:6379/0`. **Host:** `redis://127.0.0.1:6379/0`. |
| `JWT_SECRET` | Signing key for access tokens. Use a long random string in production. |

Docker Compose sets defaults for these when you do **not** use a custom `.env`.

---

## 2. WhatsApp (Meta Cloud API)

Used for webhook verification, inbound messages, and outbound sends (`/api/inbox/.../send`).

| Variable | Required? | Purpose |
|----------|-----------|---------|
| `WHATSAPP_VERIFY_TOKEN` | Yes (any string you choose) | Must match **Verify token** in Meta’s webhook configuration. |
| `WHATSAPP_APP_SECRET` | Recommended in production | Meta app **App Secret** — used to validate `X-Hub-Signature-256`. Leave **empty** for local Swagger/Postman without Meta signatures. |
| `WHATSAPP_ACCESS_TOKEN` | Yes for **sending** messages | A valid **temporary or system user** token with `whatsapp_business_messaging` (and related) permissions. |
| `WHATSAPP_GRAPH_API_VERSION` | No (default `v21.0`) | Graph API version prefix. |
| `WHATSAPP_CONVERSATION_WINDOW_HOURS` | No (default `24`) | Free-form outbound allowed for this many hours after the customer’s last **inbound** message. |
| `MEDIA_UPLOAD_DIR` | No | Where uploaded files are stored before sending to Meta (Docker often `/app/data/media`). |

**Meta / developer setup (outside `.env`):**

1. Create a Meta app + WhatsApp product, get **Phone number ID** and **WABA** IDs.
2. In the app dashboard, set the **Webhook** URL to `https://your-domain/api/whatsapp/webhook` and the **Verify token** to the same value as `WHATSAPP_VERIFY_TOKEN`.
3. Subscribe to `messages` (and related) fields.
4. Map your **Phone number ID** to your tenant with **`POST /api/whatsapp/phone-route`** (authenticated).

Without `WHATSAPP_ACCESS_TOKEN`, **inbound** webhooks still work (if routed); **outbound** API calls return **503** until a token is set.

---

## 3. Email (SMTP)

Used by **`POST /api/billing/test-email`** (admin/manager). Optional for MVP.

| Variable | Purpose |
|----------|---------|
| `SMTP_HOST` | SMTP server hostname. If unset, “send” is **logged only** (mock). |
| `SMTP_PORT` | Default `587`. |
| `SMTP_USE_TLS` | Default `true` (STARTTLS). Set `false` for plain servers (e.g. some local Mailhog). |
| `SMTP_USER` / `SMTP_PASSWORD` | Auth when required. |
| `EMAIL_FROM` | From address; required for real SMTP sends. |

---

## 4. Auth seed (optional)

| Variable | Purpose |
|----------|---------|
| `SEED_ADMIN` | `true` to create one org + admin on startup (if email not taken). |
| `SEED_ADMIN_ORG_NAME` | Org name. |
| `SEED_ADMIN_EMAIL` | Admin login email. |
| `SEED_ADMIN_PASSWORD` | Admin password. |

---

## 5. CORS (browser + API)

The FastAPI app reads **`CORS_ORIGINS`**: a comma-separated list of allowed origins (no spaces in the value itself, or use a single origin per line in `.env`).

Example:

```env
CORS_ORIGINS=https://app.example.com,https://www.example.com
```

For local development, defaults are `http://localhost:3000` and `http://localhost:5173`. The Socket.IO **realtime** service (`services/realtime`) uses the same **`CORS_ORIGINS`** (or legacy **`CORS_ORIGIN`** for a single origin).

See [DEPLOYMENT.md](DEPLOYMENT.md) for how this ties to HTTPS and your public URLs.

---

## 6. Docker Compose ports (optional)

| Variable | Purpose |
|----------|---------|
| `POSTGRES_*` | DB name, user, password, host port. |
| `BACKEND_PORT` | Host port for API (default `8000`). |
| `FRONTEND_PORT` | Host port for the **dev** Next.js service in `docker-compose.yml` (default `3000`). |
| `REDIS_PORT` | Host port for Redis. |
| `REALTIME_PORT` | Socket.IO service (default `4001`). |
| `CORS_ORIGIN` | Passed to realtime service for browser clients. |

---

## 7. Frontend (Next.js)

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_API_URL` | Base URL of the API **as requested by the browser** (e.g. `http://localhost:8000`). Use `apps/frontend/.env.local` when running `npm run dev` on the host. With **`docker compose`** (dev), the **`frontend`** service reads this from the repo `.env`; it must stay a **host-reachable** URL (same host/port you publish for `backend`), not `http://backend:8000`. |
| `NEXT_PUBLIC_REALTIME_URL` | Socket.IO gateway URL for the **Realtime** page (default `http://localhost:4001`). Must match where **`realtime`** is published for the browser. |

`docker-compose.prod.yml` bakes **`NEXT_PUBLIC_API_URL`** into the production image at **build time**; changing it requires a rebuild.

---

## 8. Celery (workers)

Uses the same **`REDIS_URL`** and **`DATABASE_URL`** as the API. Ensure **`docker compose`** passes them to `celery_worker` / `celery_beat` (already in `docker-compose.yml`). No extra secrets unless you add brokers later.

---

## 9. Tests

| Variable | Purpose |
|----------|---------|
| `TESTING` | Usually set by pytest `conftest`; `true` skips DB DDL in app lifespan. |

---

## 10. Billing (MVP mock)

No Stripe keys. Use **`GET /api/billing/usage`** and **`POST /api/billing/mock/subscribe`** (admin) for plan limits. Optional **`POST /api/billing/mock/webhook`** for scripted “checkout” in dev.

---

## 11. Auth profile

`GET /api/auth/me` (Bearer token) returns **`UserMeOut`**: the usual user fields plus **`organization_name`** and **`billing_plan`** from the linked organization. Login/register responses still return the smaller **`user`** object without those two fields.

---

## Quick checks

- Deployment guide: [DEPLOYMENT.md](DEPLOYMENT.md)
- API health: `GET http://localhost:8000/health`
- Readiness (DB + Redis): `GET http://localhost:8000/ready`
- Interactive docs: `http://localhost:8000/docs`
