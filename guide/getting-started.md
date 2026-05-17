# Getting Started

## Requirements

- Node.js 20+
- pnpm 9+ (or npm 10+)

## Standalone dev (CE shell only)

```bash
cd deepwork/frontend
npm install
npm run dev
```

## Monorepo dev (with a module like deepwork-terminal)

The CE shell resolves packages through the module's `node_modules` via a symlink. This is set up once:

```bash
ln -s ../../deepwork-terminal/frontend/node_modules deepwork/frontend/node_modules
```

Then in the module repo:

```bash
cd deepwork-terminal/frontend
npm install
npm run dev    # vite resolves @ce → ../../deepwork/frontend/src
```

## Adding a module to the CE shell

1. Install the module's Vue plugin in `main.ts`:

```typescript
import TerminalPlugin from 'deepwork-terminal/src/plugin'

app.use(TerminalPlugin, { router, routePrefix: '/terminal' })
```

2. Add the `@ce` alias in the module's `vite.config.ts`:

```typescript
'@ce': fileURLToPath(new URL('../../deepwork/frontend/src', import.meta.url))
```

3. Add the path mapping in `tsconfig.json`:

```json
"paths": {
  "@ce/*": ["../../deepwork/frontend/src/*"]
}
```

## Build

```bash
cd deepwork/frontend
npm run build    # outputs to dist/
```
