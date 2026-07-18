---
title: Styles and icons
description: Understand the global stylesheet and process toast icon markers.
---

# Styles and icons

`@codenhub/ui-kit/styles` is the compiled style entrypoint used by the generated
toast class names. Import it once from application code or CSS:

```ts
import "@codenhub/ui-kit/styles";
```

## Full global style system

This entrypoint is not scoped or toast-only. It compiles the complete
`@codenhub/styles/tw` source and scans UI Kit scripts for utility classes. The
result includes Tailwind layers, design tokens, typography, utilities, component
classes, and a global reset.

The reset affects all elements and page structure. Among other effects, it
styles scrollbars and selection, sets root/background/text/font behavior, makes
`body` a flex column, changes focus-visible outlines, assigns body typography,
and reduces animation and transition durations for reduced-motion users. Audit
these global effects before combining the stylesheet with another reset or
design system.

Theme-dependent toast classes expect the tokens and dark-mode behavior supplied
by this stylesheet and the [theme helpers](./themes.md). `className` can append
toast root classes, but there are no public internal layout or color slots.

## Icon markers

Toast code emits marker elements for `ic-success`, `ic-error`, `ic-warning`,
`ic-info`, `ic-loader`, and `ic-close`. The stylesheet does not draw those
markers. A compatible build-time processor must replace marker elements in the
package's generated JavaScript with SVG. `@codenhub/vite-plugin-icons` is the
repository's compatible Vite integration when configured so dependency code is
passed through its transforms.

Verify the production output, because dependency optimization or an alternative
bundler may bypass marker transforms. Without compatible processing, marker
elements remain empty `<i>` elements: the toast message, semantic role, live
region, and dismiss button continue to work, but no leading, loader, or close
graphic is visible. The dismiss button remains named by `aria-label`.

Custom `content` suppresses the built-in leading icon entirely. It can therefore
provide its own accessible graphics, but trusted string content still follows
the security boundary documented in [toasts](./toasts.md).
