# @codenhub/vite-plugin-defer-css

`@codenhub/vite-plugin-defer-css` changes stylesheet links in Vite HTML entries
into preloads, then restores `rel="stylesheet"` after each file loads. It is
useful when you have measured that deferring HTML-linked CSS is appropriate. It
does not process CSS imported from JavaScript modules.

> [!WARNING]
> Experimental: the matching rules, generated HTML/JavaScript, and loading behavior may change before a stable release.

The plugin turns this:

```html
<link rel="stylesheet" href="/assets/app.css" />
```

into a preload that becomes a stylesheet after loading, with a `noscript`
fallback when `</head>` is available. Register it with
`plugins: [deferCssPlugin()]` in your Vite configuration.

Do not defer CSS required for readable content, focus visibility, or stable
layout without testing the result. The default output uses an inline `onload`
handler; strict CSP deployments should review nonce mode and its requirements.

## Continue

- [Configure and integrate the plugin](integration.md) for registration,
  matching rules, nonce mode, plugin order, and the public API.
- [Inspect transformed output and constraints](output-and-constraints.md) for
  exact markup, CSP behavior, rendering and accessibility risks, and failures.

Vite `^8.0.0` is supported. The transform runs in development and production
builds.
