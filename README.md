WhatsApp flow CRM API
=======


This repository is the foundation for a SaaS-style WhatsApp CRM:
- multi-tenant (organizations)
- role-based access control (admin/manager/agent)
- JWT authentication
- PostgreSQL + Redis
- a Socket.IO realtime gateway (`services/realtime`)

## Local setup (Docker)
1. Copy `.env.example` to `.env` and adjust secrets.
2. Start services:
   - `docker compose up --build`
3. Open the UI at **`http://localhost:${FRONTEND_PORT:-3000}`** (Next.js dev server). The API defaults to **`http://localhost:${BACKEND_PORT:-8000}`**; set **`NEXT_PUBLIC_API_URL`** in `.env` to that full URL so the browser can reach the backend from your machine. If you change **`FRONTEND_PORT`**, add the matching origin to **`CORS_ORIGINS`** for the API and realtime services.

## API vs UI (quick matrix)

| Backend area | Covered in the Next.js UI |
|--------------|---------------------------|
| Auth: login, register, me | `/login`, `/register`, `/` dashboard |
| Inbox (conversations, assign, filters, messages, attachments, send) | `/inbox` — text, templates, Meta media id, file upload + send |
| Pipeline, stages, leads, move stage, patch | `/pipeline` — create pipeline (admin/manager), create lead, stage/priority/assignee |
| Contacts list / get / patch | `/contacts` |
| Automation rules | `/automation` |
| Team users | `/team` |
| WhatsApp phone routes + webhook URL hint | `/whatsapp` |
| Billing usage, mock subscribe, test email | `/billing` |
| Health / ready | `/status` (no auth) |
| Socket.IO | `/realtime` (CDN client; set `NEXT_PUBLIC_REALTIME_URL`) |
| Meta inbound webhook | Configure at Meta → hits API directly (not a UI form) |

## Production deployment

See **[DEPLOYMENT.md](DEPLOYMENT.md)** for environment variables, HTTPS, `docker-compose.prod.yml`, and operations. Variable reference: [CONFIGURATION.md](CONFIGURATION.md).

## Backend
Once running, the backend exposes:
- `GET /health`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET /api/whatsapp/webhook` (Meta webhook verification)
- `POST /api/whatsapp/webhook` (inbound message ingestion)
- `POST /api/whatsapp/phone-route` (map Meta `phone_number_id` to a tenant)

## Next steps
The API already supports WhatsApp outbound (text, templates, media, attachments). Still useful: richer inbox UI (templates, uploads), Kanban and lead actions in the UI, automation rule management, realtime client, and production billing (real Stripe).

