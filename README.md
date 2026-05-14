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
pnpm --filter @personal-ai-assistant/server db:push
pnpm dev:server
```

The server listens on `http://localhost:3000` and exposes `GET /health`.

## Architecture Notes

See [docs/architecture.md](docs/architecture.md).
