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
pnpm dev:server
```

The server listens on `http://localhost:3000` and exposes `GET /health`.

## Mobile Install

`apps/mobile` is excluded from the pnpm workspace and uses **yarn** (`yarn@1.22.x`)
for its dependencies. The mobile app consumes `@personal-ai-assistant/shared`
through a `file:` reference to `packages/shared`, and Metro resolves that package
to the shared TypeScript source during development.

```bash
pnpm install --filter @personal-ai-assistant/shared...

cd apps/mobile
yarn install

# iOS only
cd ios && bundle install && bundle exec pod install
```

Do not run `pnpm install` inside `apps/mobile`.

## Server Runtime

`apps/server` is relay-only and does not require a local database. Mobile task history is kept on
the mobile client, while the server only routes WebSocket events between bound devices.

```bash
pnpm dev:server
```

For production-style startup:

```bash
pnpm --filter @personal-ai-assistant/server start
```

## Mobile Animation Rule

For React Native animation code, use `react-native-reanimated`. Do not import or require
`Animated` from `react-native`. The mobile `typecheck` script runs
`yarn check:animations` to enforce this rule.

## Architecture Notes

See [docs/architecture.md](docs/architecture.md).
