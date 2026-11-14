# Refugee Identity Verification Platform — Backend MVP

Backend starter for a multi-tenant hosted registration and identity-verification platform.

## Important boundary

The identity provider in this repository is a **mock**. It does not connect to RRS, UNHCR, NIDP or Fayda, and it must never be represented as real identity verification. Obtain written authorization, API documentation and an approved data-sharing arrangement before implementing a live provider.

## Requirements

- Node.js 20+
- Docker + Docker Compose

## Setup

```bash
cp .env.example .env
```

Generate secrets and put them in `.env`:

```bash
openssl rand -hex 32
openssl rand -hex 32
```

Use separate generated values for `API_KEY_PEPPER` and `REGISTRATION_TOKEN_SECRET`.

For local Redis, update `REDIS_URL` to:

```text
redis://:local_redis_password@localhost:6379
```

Start dependencies and install packages:

```bash
docker compose up -d
npm install
```

Run the API and worker in separate terminals:

```bash
npm run dev
npm run worker
```

API health: `GET http://localhost:4000/health`
RabbitMQ management UI: `http://localhost:15672` (local development only; app/local_rabbit_password).

## Initial API flow

1. `POST /api/v1/companies/register` with `{ "name": "Example Company", "email": "dev@example.com" }`.
2. Save the returned `apiKey` securely. It is displayed once.
3. Use `X-API-Key: <credential-id>.<secret>` to call company endpoints.
4. `POST /api/v1/registrations` to create a registration. Save the returned `registrationToken` securely.
5. Save steps using `PUT /api/v1/registrations/:id/steps/:step` and header `X-Registration-Token`.
6. Submit verification using `POST /api/v1/registrations/:id/verify`.

Allowed step keys: `personal_information`, `contact_information`, `account_security`, `identity_document`, `review`.

## MVP limitations — do not deploy with real refugee data

- No live RRS/NIDP provider, OCR, image upload, SMS integration, company email verification, webhooks or production monitoring yet.
- Registration fields are held in Redis temporarily. A production design needs explicit retention/deletion policies and encrypted durable storage for any information that must survive Redis loss.
- The current worker marks mock outcomes for manual review; it does not verify identity.
- Add bounded retry/backoff and a dead-letter queue before production.
- Configure TLS, private networking, backups, secret management, access controls, consent/legal review and security testing before handling real data.
