# @codenhub/kbd API, Matching, and Lifecycle

## Register Bindings

`keyboard` is a shared page-level `Keyboard` instance. `new Keyboard(options?)`
creates isolated state. `KeyboardOptions.onError` receives handler failures and
registration diagnostics; `isMac` overrides `cmdOrCtrl` platform resolution.

`register(binding, handler, options?)` returns `KeyboardRegistration`:

- `active` reports whether the target resolved and registration succeeded.
- `disable()` and `enable()` pause only that binding.
- `unregister()` permanently removes it and removes the scope's DOM listener
  when it was the last binding.

`Keyboard.disable()` and `enable()` pause or resume the whole instance.
`Keyboard.clear()` removes every binding and listener while preserving the
instance enabled state. `setErrorHandler(handler)` replaces the error reporter.

## Bindings and Matching

`KeyboardBinding` is a `KeyboardKey` or `KeyboardShortcut`. A shortcut has a
`key` and `ModifierKey[]`; modifiers are `ctrl`, `alt`, `shift`, `meta`, and
`cmdOrCtrl`. Matching is exact: unlisted modifiers prevent a match. Shifted
symbols are handled as their emitted character. Single-character keys are
case-insensitive; named keys use browser-standard values.

`KEYS` maps supported control, navigation, media, letter, digit, function, and
symbol names to browser key values. `KeyboardKey` is the union of those values.
Runtime JavaScript can register an unknown string, but `onError` receives a
warning and browser matching is not guaranteed.

## Subscription Options

`KeyboardSubscriptionOptions` contains:

- `target`: listener target, default `document`.
- `event`: `KeyboardEventName`, either `keydown` (default) or `keyup`.
- `ignoreInput`: ignores input, textarea, select, and contenteditable sources by
  default unless Ctrl, Alt, or Meta is held. Shadow DOM sources use
  `composedPath()` when available.
- `stopPropagation`: after a matching handler, calls
  `stopImmediatePropagation()` and stops this scope's iteration, even if the
  handler throws.

`KeyboardHandler` receives the original `KeyboardEvent`; consumers call
`preventDefault()` themselves when needed.

## Errors, SSR, and Cleanup

Invalid binding/handler values and a missing default target return an inactive
no-op registration and report through `onError` when configured. Handler errors
are caught and reported rather than rethrown. During SSR, registration without
an explicit target follows the same inactive path.

Always call `unregister()` when a binding owner is removed, or `clear()` when an
instance owner is removed. The shared singleton otherwise retains page-level
listeners and registrations.

## Accessibility

The package only dispatches shortcuts. Consumers must preserve browser and
assistive-technology conventions, avoid overriding expected keys, expose a
click/touch alternative, describe shortcuts where useful, and intentionally
choose whether shortcuts run while users edit text.

## Public Exports

The root exports `KEYS`, `Keyboard`, and `keyboard`, plus `KeyboardKey`,
`KeyboardBinding`, `KeyboardEventName`, `KeyboardHandler`, `KeyboardOptions`,
`KeyboardRegistration`, `KeyboardShortcut`, `KeyboardSubscriptionOptions`, and
`ModifierKey` types.
