# Icons generated SVG and constraints

## Generated output

For a known icon, this marker:

```html
<i id="status-icon" class="ic-success size-4 text-green" aria-hidden="true"></i>
```

becomes a Lucide-derived `<svg>` whose root receives `id`, `aria-hidden`, and the non-icon classes. The resolved `ic-success` class and the `<i>` closing tag are removed. If custom SVG already has a root `class` or `className`, marker classes are appended to it; otherwise the marker's attribute spelling is used. Other marker attributes pass through to the SVG root.

In JavaScript string literals, generated quote and template characters are escaped for the detected enclosing quote. Module transforms return no source map. Built-in SVG names and exact markup are experimental rather than a stable asset manifest.

## Development and builds

The same pre transforms run in Vite development and production builds. HTML entries are always scanned. Module files are scanned only for `.js`, `.ts`, `.jsx`, or `.tsx` IDs that contain `ic-`; unsupported extensions return no transform result. JavaScript comments are ignored by module matching, and unchanged modules return no transform result.

## Security and CSP

Custom `markup` is inserted verbatim and is not sanitized. Treat it as executable document input: event attributes, links, styles, foreign content, or other active markup can survive into application output and may interact with CSP. Use only controlled SVG sources and sanitize before configuration when provenance is not trusted. CSP is defense in depth, not a substitute for sanitization.

Built-in SVGs contain presentation attributes but no generated scripts. The plugin does not add CSP nonces or configure response headers.

## Accessibility

The plugin does not decide whether an icon is decorative or meaningful and built-in SVGs do not add a name automatically.

- Decorative icon: put `aria-hidden="true"` on the marker; it passes to the SVG.
- Meaningful icon: provide an accessible name and suitable semantics, for example `role="img" aria-label="Success"`, or supply trusted custom SVG containing a correctly associated `<title>`.
- Icon-only control: label the control itself; do not rely on the icon shape as its name.

Verify custom root attributes after class merging and preserve visible focus indicators when icons appear in controls.

## Failure behavior

- Unknown name, malformed marker, or dynamic class expression: leaves the marker unchanged when it does not match supported syntax. Use empty markers; a non-empty body may remain after the opening marker is replaced.
- Multiple `ic-` classes: uses the first class whose name resolves; unresolved `ic-` classes remain as ordinary classes.
- No `ic-` text, unsupported module extension, or no changed module marker: returns no module transform result.
- HTML comments, `pre`, and `noscript`: remain unchanged. HTML `script` and `style` content is not protected or string-escaped by the HTML hook, so inspect output when marker text appears there.
- Invalid custom SVG: no custom validation error is raised; malformed output can be emitted.

## Attribution

The built-in SVG assets are derived from [Lucide](https://lucide.dev) and licensed under the ISC License. Preserve the package [NOTICE](../NOTICE) in redistributed copies; it contains the Lucide Contributors copyright and required permission and warranty text. The plugin package itself is Apache-2.0 licensed.
