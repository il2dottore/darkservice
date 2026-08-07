# LoadService Infrastructure

The `servers` directory provides the local stateful infrastructure required by the LoadService backend: PostgreSQL, Redis, and RabbitMQ.

## Project Map

| Path | Responsibility |
|---|---|
| `docker-compose.yml` | Starts the three infrastructure services and persistent volumes |
| `docker/postgres/init-multiple-dbs.sh` | Creates one PostgreSQL database per backend service on first initialization |

## Services

| Service | Image | Port(s) | Persistent volume |
|---|---|---|---|
| PostgreSQL | `postgres:16-alpine` | `5432` | `postgresql-data` |
| Redis | `redis:7-alpine` | `6379` | `redis-data` |
| RabbitMQ | `rabbitmq:4-management-alpine` | `5672`, `15672` | `rabbitmq-data` |

The initialization script reads `POSTGRES_MULTIPLE_DATABASES` and creates `core_service_db`, `payment_service_db`, and `attack_service_db` only when PostgreSQL initializes a new data directory.

## Prerequisites

- Docker Engine.
- Docker Compose v2 (`docker compose`).
- Free local ports `5432`, `6379`, `5672`, and `15672`.

## Configuration

The Compose file currently contains checked-in development credentials for PostgreSQL and RabbitMQ. Change them before using this stack on a shared host, then update `backend/.env` and `attack-node-service/.env` to match.

Do not publish database, cache, AMQP, or management ports to untrusted networks.

## Run Infrastructure

```bash
docker compose up -d
docker compose ps
```

RabbitMQ Management is available at:

```text
http://localhost:15672
```

View logs:

```bash
docker compose logs -f postgres redis rabbitmq
```

Stop containers without deleting data:

```bash
docker compose down
```

## Connect The Backend

For backend processes running directly on the same host, use:

```env
POSTGRES_HOST=127.0.0.1
POSTGRES_PORT=5432
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
RABBITMQ_URL=amqp://<user>:<password>@127.0.0.1:5672/
```

When the backend runs in containers, put it on a shared Docker network and use service names such as `postgres`, `redis`, and `rabbitmq`; host-loopback addresses will not reach sibling containers.

## Data Lifecycle

Named volumes preserve state across `docker compose down` and container recreation:

```text
postgresql-data
redis-data
rabbitmq-data
```

Removing these volumes permanently deletes local databases, Redis data, RabbitMQ queues, and messages. Back up required data and verify the exact Compose project before any volume-removal command.

## Useful Checks

```bash
docker compose config
docker compose ps
docker compose exec postgres pg_isready
docker compose exec redis redis-cli ping
docker compose exec rabbitmq rabbitmq-diagnostics -q ping
```

List the created PostgreSQL databases:

```bash
docker compose exec postgres psql -U <postgres-user> -l
```

## Troubleshooting

- A port is already allocated: stop the conflicting local service or change the left side of the relevant port mapping.
- Backend authentication fails: make sure backend credentials match the Compose values.
- One or more databases are missing: the init script runs only for a new PostgreSQL volume; create the database manually or reinitialize only disposable local data.
- RabbitMQ is not ready: wait for its health check and inspect `docker compose logs rabbitmq`.
- Containers cannot resolve each other: attach them to the same Docker network and use Compose service names.
- Data unexpectedly persists after rebuilding: images and containers can be replaced while named volumes remain; this is intentional.

## Notes For Development

- PostgreSQL is the source of truth for application records.
- Redis holds sessions, expiring tokens, cache entries, and temporary slot reservations.
- RabbitMQ transports attack and payment workflow events.
- This stack has development defaults, no TLS, and host-published ports; harden it before any non-local deployment.
