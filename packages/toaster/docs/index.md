---
title: Overview
description: What Toaster is for, how to install it, and the order to read its pages in.
---

# Toaster

Every app eventually needs to say two kinds of things to the person using it. Some news can wait in a corner: "Saved", "Copied", "Sync failed, retrying". Some questions can't: "Delete this note forever?" `@codenhub/toaster` handles both. Toasts are small notifications that stack in a corner of the screen and leave on their own. Dialogs are modal questions that block the page until someone answers.

What it saves you from writing by hand:

- **The stack.** Toasts line up at one of six screen positions. Extra ones wait in a queue, and the oldest one that isn't busy leaves to make room. A toast stays put while someone is hovering over it, has focus inside it, or is waiting on a loading spinner.
- **The timers.** By default, each toast closes after a set time, except a loading one, which waits for its result. The countdown pauses while the pointer is on it, while it has focus, and while the browser tab is in the background, so time nobody could spend reading doesn't count.
- **The async dance.** `toast.promise()` shows a spinner while your work runs and turns into a success or error toast when it's done. Dialogs return something you can `await`, so `if (await dialog.confirm("Delete?"))` really is `true` or `false`.
- **The accessibility plumbing.** Screen readers hear every toast, with [one catch while a modal dialog is open](dialogs.md#toasts-while-a-dialog-is-open). Dialogs use the browser's own `<dialog>` element, so focus trapping, <kbd>Escape</kbd>, and returning focus afterward all come from the platform.
- **The security homework.** Strings are always shown as plain text and never parsed as HTML. The package injects no `<style>` element, so a strict Content Security Policy needs no exceptions for it, as long as the stylesheet itself [loads as a file](styling.md#content-security-policy).

It's plain TypeScript working directly with the DOM. There's no framework to adopt and no runtime dependency to install.

## Installation

```sh
pnpm add @codenhub/toaster
```

`npm install`, `yarn add`, and `bun add` work too. The package is ESM only and has two entry points plus a stylesheet:

| Import                     | What you get                                                       |
| -------------------------- | ------------------------------------------------------------------ |
| `@codenhub/toaster`        | `toast`, a ready-made toaster, and `createToaster()` to make more. |
| `@codenhub/toaster/dialog` | `dialog`, a ready-made dialogs instance, and `createDialogs()`.    |
| `@codenhub/toaster/styles` | The stylesheet. Required; nothing looks right without it.          |

Dialogs live in their own entry point so an app that only shows toasts doesn't bundle them. A toast-only bundle costs about 9 KB gzipped.

## A first toast

Load the stylesheet once, in the file where your app starts, then call `toast` anywhere:

```ts
import "@codenhub/toaster/styles";
import { toast } from "@codenhub/toaster";

toast.success("Note saved");
```

That's the whole setup. There's no provider to mount and no container to create. The first toast creates its own stack in `document.body`.

Toaster needs a browser. Importing it during server-side rendering is safe, but showing a toast there throws, because there is no page to put it on. [Toaster instances](instances.md#server-side-rendering) covers how to handle that.

## Reading path

The pages build on each other, and together they follow one small example: a notes app that saves, syncs, renames, and deletes notes. Read them in order the first time.

1. [Toasts](toasts.md): every kind of toast, actions, loading and promise toasts, updating a toast after it's shown, and how stacking, queueing, and timers behave.
2. [Dialogs](dialogs.md): `confirm`, `prompt`, and `alert`, what they resolve to, how they queue, translating their buttons, and what happens to toasts while a dialog is open.
3. [Toaster instances](instances.md): every configuration option and its default, per-kind defaults, scoped toasters for panels and widgets, cleanup with `destroy()`, and server-side rendering.
4. [Styling](styling.md): the stylesheet, colors, presentation classes, dark mode, and Content Security Policy.
5. [Accessibility and security](accessibility.md): what screen readers hear, keyboard and focus behavior, reduced motion, and the trust boundary of custom content.

The [API reference](reference/index.md) lists every exported symbol and signature, generated from the source. The [changelog](changelog/index.md) says what changed in each release.

## Requirements

- A browser with native `<dialog>` support (`HTMLDialogElement.showModal()`) if you use dialogs. Every current browser has it.
- `@codenhub/toaster/styles` loaded once on the page.
- Optional: `@codenhub/styles` 0.3.0 or newer. When it's on the page, toasts and dialogs take their colors and look from its theme. Without it, the package uses its own built-in colors. [Styling](styling.md) explains both.

The package is experimental. Its API, rendering, and CSS class names can still change before a stable release, and the [changelog](changelog/index.md) says what changed each time.
