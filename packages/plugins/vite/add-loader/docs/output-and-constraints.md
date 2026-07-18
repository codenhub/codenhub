---
title: Output and Constraints
---

# Generated output and constraints

## Generated output

For eligible HTML, the plugin inserts:

- A `<style>` immediately before `</head>`.
- `<div id="page-loader" role="status" aria-label="Loading">` with an animated inline SVG immediately after the opening `<body>`.
- A `noscript` style that hides the overlay.
- An inline script that waits for `window.load`, or the configured timeout, adds `hidden`, and removes the overlay after its opacity transition or a 500 ms fallback.

The overlay is fixed to the viewport with `z-index: 9999`. Existing HTML comments and `pre`, `script`, `style`, and `noscript` blocks are restored without searching them for insertion boundaries. Multi-page builds receive one overlay per transformed HTML entry. The generated browser code adds no package runtime dependency.

## CSP and security

Without `nonce`, the generated inline styles and script require a CSP that permits them. With `nonce`, the plugin adds the exact value to the outer generated styles and script, including the `noscript` style. The spinner SVG also contains an inner `<style>` without a nonce, so a strict style policy can still block its animation. Test the emitted document against the deployed policy; this option does not configure CSP headers.

The nonce, CSS values, and timeout are trusted build inputs and are not escaped or validated. Never derive them from untrusted data. The fixed `page-loader` ID can collide with application markup or CSS.

## Accessibility

The overlay exposes a status named `Loading`, but it does not mark the underlying application as busy or manage focus. Confirm that the overlay does not hide critical content indefinitely and add application-level busy semantics when needed. Its SVG animation has no generated `prefers-reduced-motion` override; applications supporting reduced motion must override the spinner animation in their own CSS or choose another loading treatment.

When JavaScript is disabled, the generated `noscript` style hides the loader so it cannot permanently cover the page.

## Failure behavior

- Missing `</head>` or opening `<body>`: returns the original HTML unchanged.
- Missing `#page-loader` at runtime: the generated script exits without throwing.
- Missing `window.load`: the timeout starts removal; `timeout: 0` schedules it immediately.
- Missing transition completion: a 500 ms fallback removes the element.
- Blocked inline code: CSP may leave an unstyled, non-animated, or persistent overlay depending on what is blocked.
