---
title: Output and Constraints
---

# Transformed output and constraints

## Transformed output

Given:

```html
<link rel="stylesheet" href="/assets/app.css" media="screen" />
```

the default output is equivalent to:

```text
<link rel="preload" href="/assets/app.css" media="screen" as="style" onload="this.onload=null;this.rel='stylesheet'" />
```

The plugin removes an existing `onload` attribute, replaces the complete matching `rel` attribute with `rel="preload"`, preserves other attributes, and appends `as="style"`. Before `</head>`, it adds a `noscript` block containing normalized copies of the original stylesheet links.

With `nonce`, transformed links receive `data-defer-css` instead of `onload`, and one `<script nonce="...">` listens for load and error events and changes their `rel` to `stylesheet`. The generated browser code adds no package runtime dependency.

## Development and builds

The same HTML transform runs in Vite development and production builds for each HTML entry. This can make development rendering differ from a project without the plugin. JavaScript-imported CSS is unchanged. Existing HTML comments and `pre`, `script`, `style`, and `noscript` blocks are restored without transforming stylesheet text inside them.

## CSP and security

The default inline event handler is commonly blocked by strict `script-src-attr` policies. A nonce does not authorize event attributes, so nonce mode removes them and emits a nonced script instead. The application must send a matching CSP header; the plugin does not create headers or generate per-request nonces. The configured nonce is not escaped and must be trusted.

## Rendering and accessibility

Deferred CSS can expose unstyled content, change focus visibility, and cause layout shifts before the stylesheet applies. Do not defer styles required for readable content, keyboard focus, hidden labels, or other essential accessibility behavior without measuring the result. The `noscript` copy supports browsers with JavaScript disabled, not JavaScript that is enabled but blocked or fails.

## Failure behavior

- No matching stylesheet links: returns the original HTML.
- Missing `</head>`: still converts matching links but cannot inject the `noscript` fallback or nonce helper. In nonce mode those links then have no generated restoration mechanism.
- Stylesheet load failure in default mode: `onload` does not run, so the link remains a preload and styles remain unapplied.
- Stylesheet load error in nonce mode: the helper changes `rel` to `stylesheet`; the browser may retry, but successful CSS application is not guaranteed.
- Blocked inline code: deferred styles may never apply.
- Malformed or dynamically generated tags that do not match the supported static syntax are left alone; the plugin does not throw a custom validation error.
