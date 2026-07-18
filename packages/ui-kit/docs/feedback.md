---
title: Feedback
description: Register result feedback, control logging and toasts, and manage subscriptions.
---

# Feedback

The exported `feedback` singleton accepts `Result<T>` values from
`@codenhub/error`, returns the same result unchanged, and emits either a success
or error notification to subscribers.

```ts
import { err, ok } from "@codenhub/error";
import { feedback } from "@codenhub/ui-kit";

feedback.register(ok({ id: "file-1" }), {
  success: {
    key: "feedback.fileSaved",
    fallback: "File saved successfully.",
  },
});

feedback.register(err(new Error("request failed")), {
  fallback: "Could not save the file.",
});
```

## Success behavior

Success registration has no message and shows no toast by default. Supplying
`success` resolves its `key` through the active i18n instance. If translation is
unavailable, `fallback` is used; if neither resolves, the event entry has a
`null` message and no toast is shown.

A resolved success message displays a success `SemanticToast` by default.
`toast: false` suppresses it, while `toast: true` cannot create a toast when no
message resolved.

## Error behavior

Errors are logged with `console.error("Application error", error)` and displayed
in an error `SemanticToast` by default. Set `log: false` or `toast: false` to
suppress either side effect. `toastPosition` selects any supported toast
position.

An error with a `messageKey` first attempts i18n translation, then uses the
error's message. The registration `fallback` is used only for an `unknown` error
whose message is `DEFAULT_APP_ERROR_MESSAGE`. Other errors retain their own
message.

Feedback messages use the toast `message` path and are inserted as text, not
HTML. They do not create a trusted-HTML boundary.

## Subscriptions and lifetime

```ts
const unsubscribe = feedback.subscribe("error", ({ entry, error }) => {
  reportError({ message: entry.message, error });
});

// Call during owner teardown.
unsubscribe();
```

Success events contain `{ entry, value }`; error events contain
`{ entry, error }`. Listener failures are isolated, logged as
`"Feedback listener error"`, and do not stop later listeners.

`feedback` is a module singleton with no bulk reset method. Its listeners remain
registered until their unsubscribe functions are called, so tests and
short-lived UI owners must always clean them up. Default error and resolved
success toasts require a browser DOM. Disable toasts when registering feedback
in a non-DOM environment.
