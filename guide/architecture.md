# Architecture

## Three-tier topology

```
brightman-ai/deepwork          (Tier 2: CE App Shell — this repo)
  └─ frontend/src/             ← canonical framework source
       @ce alias points here

brightman-ai/deepwork-terminal (Tier 1: module)
brightman-ai/deepwork-browser  (Tier 1: module, Go only)
  └─ @ce → ../../deepwork/frontend/src

brightman-ai/deepwork-pro      (Tier 3: private portals)
  └─ @ce → ../../deepwork/frontend/src
```

The `@ce` Vite alias is the only coupling point between a module and the CE shell. The CE shell itself uses the same alias with a self-referential path (`@ce → ./src`) so framework files are portable without rewriting imports.

## Framework packages

| Import path | Description |
|---|---|
| `@ce/framework/portal` | Portal registry, `definePortal`, feature flags |
| `@ce/composables/layout` | Layout policy, pane state, scenario machine |
| `@ce/composables/channel` | Channel runtime, message bus |
| `@ce/composables/platform` | Platform detection (desktop/web/mobile) |
| `@ce/components/pane` | Resizable pane primitives |
| `@ce/components/assistant-stream` | LLM stream renderer |
| `@ce/components/ui` | Shared UI kit (buttons, dialogs, etc.) |
| `@ce/layouts/MainLayout.vue` | Root shell layout with nav + pane grid |
| `@ce/api/client` | Typed HTTP fetch wrappers |
| `@ce/boot` | App-level bootstrapping utilities |
| `@ce/lib` | Generic utilities (date, string, etc.) |

## Portal system

A portal is a self-contained route region registered via `definePortal`:

```typescript
import { definePortal } from '@ce/framework/portal'

export const myPortal = definePortal({
  id: 'my-portal',
  label: 'My Portal',
  icon: MyIcon,
  route: '/portal/my-portal',
  scenarios: {
    initial: 'idle',
    states: { idle: {}, active: {} },
  },
  routes: [
    {
      path: '/portal/my-portal',
      component: () => import('./MyPortalPage.vue'),
    },
  ],
})
```

Register at module load time (imported in `router/index.ts` before `portalRegistry.getAll()`):

```typescript
// portals/my-portal/index.ts
import { portalRegistry } from '@ce/framework/portal'
import { myPortal } from './descriptor'

portalRegistry.register(myPortal)
```

The CE shell's router picks up all registered portals automatically — no manual route list needed.

## Module plugin interface

Each Tier 1 module exports a Vue Plugin as its integration surface:

```typescript
// deepwork-terminal/frontend/src/plugin.ts
export default {
  install(app: App, { router, routePrefix = '/terminal' }: TerminalPluginOptions) {
    router.addRoute({ path: routePrefix, component: TerminalListPage })
  }
}
```

This keeps module-to-shell coupling to a single `app.use()` call.
