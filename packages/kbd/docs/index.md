# @codenhub/kbd

`@codenhub/kbd` registers exact keyboard bindings against the document or an
explicit event target while sharing one DOM listener per target and event type.

Use it for application shortcuts that need explicit modifier matching, scoped
targets, and lifecycle control without tying shortcut handling to a framework.

> [!WARNING]
> This package is experimental. Its API, matching behavior, and support level
> may change before a stable release.

## Quick Start

```ts
import { KEYS, keyboard } from "@codenhub/kbd";

const registration = keyboard.register(KEYS.escape, () => closeDialog(), {
  ignoreInput: false,
});

registration.unregister();
```

The shared `keyboard` suits page-level shortcuts. Construct `Keyboard` when a
feature needs isolated enable, disable, and cleanup ownership. Always unregister
bindings when their owner is removed; registration without an explicit target
is an inactive no-op during SSR.

Shortcuts should preserve native keyboard behavior and have discoverable
click or touch alternatives.

## Continue

- [API, matching, and lifecycle](reference.md): Complete exports, options, errors,
  exact matching, SSR, input handling, listener ownership, cleanup, and
  accessibility responsibilities.
