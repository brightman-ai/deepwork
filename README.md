# deepwork

Community Edition App Shell — Vue framework and portal system for deepwork modules.

## What this is

`deepwork` is the community edition frontend framework that modules like `deepwork-terminal` build on. It provides:

- **Portal system** — register and compose independent module UIs
- **Layout engine** — responsive pane grid, scenario-based layouts
- **Channel abstractions** — LLM streaming, workstream orchestration
- **Assistant stream UI** — generic LLM response rendering
- **Component library** — shadcn-vue base components

## Module integration

Each module exports a Vue Plugin:

```typescript
import TerminalPlugin from 'deepwork-terminal/plugin'

const app = createApp(App)
app.use(TerminalPlugin, { router })
```

## License

MIT
