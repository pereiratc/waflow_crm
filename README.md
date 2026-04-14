<<<<<<< HEAD
# waflow_crm
WhatsApp flow CRM API
=======
# WaFlow CRM (Foundation)

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
Implement WhatsApp outbound sending (free-form + templates), shared inbox UI
filters + conversation assignment, lead pipeline (Kanban), and automation triggers.

>>>>>>> 47d318e (create the foundation of a SaaS)
