---
title: Overview
---

# Register keyboard shortcuts

The `@codenhub/kbd` package registers exact keyboard bindings against the
document or an explicit event target while sharing one DOM listener per target
and event type.

Use it for application shortcuts that need explicit modifier matching, scoped
targets, and lifecycle control without tying shortcut handling to a framework.

## Setup

### Installation

```sh
pnpm add @codenhub/kbd
```

### Quick start

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

## Requirements

- Registration uses DOM `EventTarget`, `KeyboardEvent`, and `document` by
  default. Pass a target to scope a binding.
- During SSR, registration without a target returns an inactive no-op handle.
- Call `unregister()` for individual bindings or `clear()` for an instance.

Shortcuts should preserve native keyboard behavior and have discoverable
click or touch alternatives.

## Next steps

- [API, matching, and lifecycle](reference.md): Complete exports, options, errors,
  exact matching, SSR, input handling, listener ownership, cleanup, and
  accessibility responsibilities.
