---
title: Accessibility and Content
---

# Accessible and custom content

## Toast Announcements

Semantic defaults use `status` for success/info and `alert` for error/warning;
loading uses `status`. Consumers can override roles where options permit. The
package supplies live-region attributes and an accessible dismiss label.
Consumers remain responsible for concise meaningful messages, appropriate
urgency, enough reading/dismissal time, keyboard alternatives, and token color
contrast.

## Native Dialogs

Interactive APIs use native modal `<dialog>` behavior for top-layer modality and
focus containment. The package associates title/message text, sets initial
focus, and restores prior focus when possible. Consumers must provide meaningful
labels and verify browser support; no dialog polyfill or non-modal fallback is
included. Reduced-motion preference skips transition waits.

Dialog title, message, labels, placeholder, and normal toast messages are
inserted as text rather than HTML.

## Custom Content Trust Boundary

`ToastContent` accepts a string, a DOM `Node`, or a function returning either.
Strings are parsed and sanitized. Application-supplied nodes are trusted and
inserted without sanitization; consumers own their semantics, accessible names,
event cleanup, and security.

Sanitized strings allow `a`, `b`, `br`, `code`, `div`, `em`, headings, `i`,
lists, `p`, `pre`, `span`, and `strong`. Only `href`, `target`, and `rel`
attributes survive. Explicit URL protocols are limited to `http`, `https`,
`mailto`, and `tel`; relative, fragment, and protocol-relative links remain.
Targets are limited to `_blank` and `_self`, and `_blank` receives
`noopener noreferrer`. Script, style, iframe, object, and embed elements are
removed with their content; other unsupported wrappers are unwrapped after
their descendants are sanitized.

Use text messages for untrusted plain content. Use custom HTML only when the
allowed formatting and link behavior are needed. Treat a `Node` or node factory
as an explicit trusted-code boundary.
