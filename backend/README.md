# LoadService Backend

The LoadService backend is a NestJS monorepo with five independently runnable services: Common, Attack, Payment, Gateway, and Node Router. They share infrastructure libraries and conventions while keeping their HTTP APIs and PostgreSQL schemas separated.

## Project Map

| Path | Responsibility |
|---|---|
| `apps/common` | Identity, users, roles, permissions, plans, features, news, and tickets |
| `apps/attack` | Benchmark lifecycle, methods, networks, servers, entitlements, and status events |
| `apps/payment` | Payment records, VietQR generation, SePay webhook handling, and plan activation |
| `apps/gateway` | REST and Socket.IO reverse proxy for the three domain services |
| `apps/node-router` | RabbitMQ consumer that selects and dispatches attack nodes |
| `libs/auth` | JWT strategy and authorization guards/decorators |
| `libs/common` | Consistent HTTP response interceptor and exception filter |
| `libs/config` | Namespaced environment configuration |
| `libs/database` | PostgreSQL connection module and base repository |
| `libs/rabbitmq` | RabbitMQ client registration and queue tokens |
| `libs/redis` | Redis client and convenience operations |
| [`dev-scripts`](dev-scripts/) | Multi-application build and watch helpers |
| `db-scripts` | Schema reset and development seed scripts |
| `drizzle*.config.ts` | Core, attack, and payment Drizzle configurations |

## Services

| Service | Port | Main API modules | Realtime / messaging |
|---|---:|---|---|
| `common` | `3000` | `auth`, `users`, `roles`, `permissions`, `features`, `plans`, `news`, `tickets` | Socket.IO `/tickets` |
| `attack` | `4000` | `attacks`, `methods`, `networks`, `servers` | Socket.IO `/events`; consumes `attack.updateStatus` |
| `payment` | `5000` | `payments` | Socket.IO `/payments`; consumes and publishes payment events |
| `gateway` | `8080` | Proxies configured `/api/v1/...` routes | Proxies `/socket.io/common`, `/socket.io/attack`, and `/socket.io/payment` |
| `node-router` | — | — | Consumes `attack.fired`/`attack.cancel`; publishes failure status events |

All regular REST endpoints have the `/api/v1` prefix. Swagger is available directly from each service at `/api-docs`.

The SePay callback is the exception: `POST /payments/sepay-webhook` on the Payment service intentionally has no `/api/v1` prefix.

## Main Features

- JWT access/refresh authentication with Argon2 password hashing and Redis session rotation.
- Registration, email verification, password reset, device/session listing, logout, and Google account linking.
- Role-based authorization with resource-owner and ticket permission checks.
- Plans, features, duration limits, concurrency limits, and network/method entitlements.
- Attack creation, Redis slot reservation, RabbitMQ dispatch/cancel events, persisted status history, and Socket.IO updates.
- Server health aggregation with a 15-second Redis cache.
- Support tickets with claim, release, reply, status, and live update workflows.
- Pending payment creation, QR URL generation, downgrade protection, SePay callbacks, and plan assignment.
- Separate core, attack, and payment PostgreSQL databases through Drizzle ORM.

## Prerequisites

- Node.js `>=24`.
- pnpm.
- PostgreSQL, Redis, and RabbitMQ.
- The Common, Attack, and Payment database names configured in `.env`.
- Optional Google OAuth, SMTP, and SePay/VietQR credentials for those features.

## Configuration

```bash
cp .env.example .env
corepack enable
pnpm install
```

Configuration groups in `.env`:

| Group | Variables |
|---|---|
| Service URLs/ports | `COMMON_SERVICE_URL`, `ATTACK_SERVICE_URL`, `PAYMENT_SERVICE_URL`, `COMMON_PORT`, `ATTACK_PORT`, `PAYMENT_PORT` |
| Gateway | `GATEWAY_PORT`, `PROXY_CONFIG` |
| Browser access | `CORS_ORIGIN` |
| Worker health | `ATTACK_NODE_PROTOCOL`, `ATTACK_NODE_PORT` |
| Redis | `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` |
| PostgreSQL | `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_USER`, `POSTGRES_PASS`, `CORE_SERVICE_DB`, `ATTACK_SERVICE_DB`, `PAYMENT_SERVICE_DB` |
| JWT | `JWT_ACCESS_SECRET`, `JWT_ACCESS_EXPIRES_IN`, `JWT_REFRESH_SECRET`, `JWT_REFRESH_EXPIRES_IN` |
| RabbitMQ | `RABBITMQ_URL`, `RABBITMQ_ATTACK_QUEUE`, `RABBITMQ_ATTACK_STATUS_QUEUE`, `RABBITMQ_PAYMENT_QUEUE` |
| Payment | `SEPAY_HMAC_SHA256_KEY`, `QR_CODE_BANK`, `QR_CODE_ACCOUNT`, `QR_CODE_HOLDER`, `QR_CODE_GEN_API` |
| Google OAuth | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`, `GOOGLE_OAUTH_SCOPES`, `GOOGLE_FRONTEND_CALLBACK_URL` |
| Email | `MAIL_HOST`, `MAIL_PORT`, `MAIL_SECURE`, `MAIL_USER`, `MAIL_PASSWORD`, `MAIL_FROM`, and the mail callback URLs |
| Reporting | `APP_TIMEZONE` |

Use direct, mutually reachable URLs for service-to-service calls. Never commit `.env` or production credentials.

## Database And Seed Data

Create these databases before applying the schemas:

```text
core_service_db
attack_service_db
payment_service_db
```

Apply each schema:

```bash
pnpm db:migrate
pnpm db:migrate:attack
pnpm db:migrate:payment
```

Seed the core and attack databases:

```bash
pnpm db:seeder:core
pnpm db:seeder:attack
```

Core seeding creates sample users, roles, ticket permissions, plans, and feature assignments. Attack seeding creates `HTTP_FREE`, `TLS_BYPASS`, `TCP_FREE`, and `TCP_PREMIUM`, plus a sample network and server.

To recreate everything:

```bash
pnpm db:reset
```

Warning: `db:reset` drops the configured databases/schemas before migrating and seeding them. Do not run it against data you need to keep.

## Run Backend

Start every service in a separate terminal:

```bash
pnpm dev:common
pnpm dev:attack
pnpm dev:payment
pnpm dev:gateway
pnpm dev:node-router
```

Build all backend applications through the repository helper:

```bash
node dev-scripts/build.js
```

Build only selected applications when needed:

```bash
node dev-scripts/build.js common attack

# Build the gateway only
node dev-scripts/build.js gateway
```

The package-level build scripts delegate to `dev-scripts/build.js`:

```bash
pnpm build
pnpm run build:common
pnpm run build:attack
pnpm run build:payment
pnpm run build:gateway
pnpm run build:node-router
```

The development scripts delegate to `dev-scripts/watch.js`:

```bash
pnpm dev
pnpm run dev:common
pnpm run dev:attack
pnpm run dev:payment
pnpm run dev:gateway
pnpm run dev:node-router
```

## Main Flows

### Authentication

1. Registration hashes the password, creates default access, stores a one-day email-verification token in Redis, and sends an email.
2. Login accepts username or email and returns access token, refresh token, and session ID.
3. Refresh-token rotation verifies the stored token hash and replaces the session token.
4. Logout removes one session; logout-all removes all sessions except an optional current session.

### Attack orchestration

1. `POST /api/v1/attacks` validates plan duration/concurrency and method features using the Common service.
2. The Attack service resolves plan-allowed servers, persists the attack, and publishes `attack.fired`.
3. The `node-router` service selects a worker; the worker publishes `attack.updateStatus` events.
4. The Attack service persists status timestamps, releases matching Redis reservations, and emits `attack.status` on `/events`.
5. Setting an attack to `CANCELLED` publishes `attack.cancel` for the router.

### Payment

1. `POST /api/v1/payments` validates the plan purchase with Common and stores a pending payment.
2. A QR URL is generated using the configured VietQR endpoint and transaction code.
3. When both values exist, `POST /payments/sepay-webhook` compares the bearer authorization value with the hex HMAC-SHA256 of the JSON payload using timing-safe comparison.
4. A matching transaction becomes paid and emits `payment.paid`.
5. The Payment consumer assigns the plan through Common and broadcasts `payment.status`.

## RabbitMQ Contracts

| Queue | Pattern | Producer | Consumer |
|---|---|---|---|
| `attack.events` | `attack.fired`, `attack.cancel` | Attack service | `node-router` service |
| `attack.status.events` | `attack.updateStatus` | Router / worker | Attack service |
| `payment.events` | `payment.created`, `payment.paid` | Payment service | Payment service event controller |

Queue names are configurable and must match every participating process.

## Docker

The default Compose file is intended to build services from this checkout:

```bash
docker compose up --build -d
```

The Dockerfile receives a `SERVICE` build argument and runs `node dev-scripts/build.js ${SERVICE}`, so image builds use the same helper as local builds. BuildKit caches the pnpm store, while the runtime stage copies only `dist/apps/${SERVICE}/main.js` and production dependencies.

Use published images:

```bash
echo "$DOCKERHUB_TOKEN" | docker login --username "$DOCKERHUB_USERNAME" --password-stdin
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

The release workflow publishes `loadservice-common`, `loadservice-attack`, `loadservice-payment`, `loadservice-gateway`, and `loadservice-node-router` to Docker Hub. Set `DOCKERHUB_USERNAME` before using this Compose file.

Both Compose files expose `3000`, `4000`, `5000`, and `8080` and read the same `.env`; `node-router` has no HTTP port. Infrastructure is not included here; start `../servers/docker-compose.yml` separately.

## Useful Checks

```bash
pnpm build
pnpm lint
```

`pnpm test` and `pnpm test:cov` are configured, but currently fail before discovery because Jest resolves `rootDir` to the missing `backend/src` directory. Update the Jest monorepo configuration before treating them as validation commands.

Database commands:

| Command | Purpose |
|---|---|
| `pnpm db:migrate` | Push the core schema |
| `pnpm db:migrate:attack` | Push the attack schema |
| `pnpm db:migrate:payment` | Push the payment schema |
| `pnpm db:seeder:core` | Replace and seed core development data |
| `pnpm db:seeder:attack` | Replace and seed attack development data |
| `pnpm db:reset` | Drop, migrate, and seed all configured databases |

## Troubleshooting

- Startup database error: confirm the three databases exist and the configured user can connect to them.
- `Unable to verify user plan...`: confirm `COMMON_SERVICE_URL` is reachable from the Attack or Payment process.
- User allowed-server lookup fails: confirm `ATTACK_SERVICE_URL` points to the Attack API.
- RabbitMQ event is not consumed: verify URL, queue names, durable queue declarations, and that the router/worker is running.
- Server status is offline: verify `ATTACK_NODE_PROTOCOL`, `ATTACK_NODE_PORT`, and the database server address.
- Browser CORS error: include the exact dashboard origin in the comma-separated `CORS_ORIGIN` list.
- Build output is missing for one service: run `pnpm run build:<service>` or `node dev-scripts/build.js <service>` and verify the service is registered in `nest-cli.json`.
- `pnpm test` reports that `backend/src` does not exist: the Jest `rootDir` setting has not been adapted to the monorepo.
- Google, mail, or SePay failure: verify credentials and ensure callback URLs match the externally reachable routes.

## Notes For Development

- PostgreSQL is the source of truth; Redis is used for sessions, expiring tokens, health cache, and temporary slot keys.
- Swagger endpoints are served directly by the Common, Attack, and Payment applications; Gateway only proxies the configured REST and Socket.IO paths.
- Service responses are wrapped by the global transform interceptor; account for the `data` envelope in service-to-service clients.
- The SePay handler currently skips its HMAC comparison when either the secret or authorization header is absent; enforce authentication before exposing it.
- The checked-in backend currently has no Jest test files, and its Jest root directory is invalid for the monorepo layout.
- Load-testing APIs must only be used with explicit target authorization.
- See [`dev-scripts/README.md`](dev-scripts/README.md) for multi-service build and watch commands.
