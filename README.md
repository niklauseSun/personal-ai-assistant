# Personal AI Assistant

Lightweight monorepo for a personal AI coding assistant.

## Workspaces

- `apps/mobile`: React Native + TypeScript mobile client.
- `apps/desktop`: Electron + React + TypeScript desktop client.
- `apps/server`: NestJS + TypeScript API and WebSocket server.
- `packages/shared`: Shared TypeScript contracts.

## First Commands

```bash
pnpm install --filter @personal-ai-assistant/server...
pnpm --filter @personal-ai-assistant/server db:migrate
pnpm dev:server
```

The server listens on `http://localhost:3000` and exposes `GET /health`.

## Server Database

`apps/server` uses PostgreSQL through Prisma. For local development:

```bash
cp apps/server/.env.example apps/server/.env
docker compose -f apps/server/docker-compose.postgres.yml up -d
pnpm --filter @personal-ai-assistant/server db:migrate
pnpm dev:server
```

For production, set `DATABASE_URL` to your managed PostgreSQL connection string and run:

```bash
pnpm --filter @personal-ai-assistant/server db:deploy
pnpm --filter @personal-ai-assistant/server start
```

Server tests use `TEST_DATABASE_URL`. The provided compose file exposes the test database on
`localhost:5433`.

## Architecture Notes

See [docs/architecture.md](docs/architecture.md).
