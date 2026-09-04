---
title: Next.js
description: Loading the stylesheet in a Next.js / React app.
order: 2
---

# Next.js

Next.js has two router architectures, and they treat global CSS differently:

- **App Router** (an `app/` directory): global CSS — including an external package's stylesheet like this one — can be imported from any layout, page, or component under `app/`. Importing it from the root layout is only a recommendation, for predictable CSS ordering across routes; Next.js does not enforce it and no error occurs if you import it elsewhere.
- **Pages Router** (a `pages/` directory, no `app/`): global CSS is restricted to `pages/_app.tsx`. Importing it from anywhere else fails the build — Next.js enforces this itself, not this package; see [Troubleshooting](#troubleshooting).
- **Both directories present** (mid-migration): import the stylesheet in both root files. The two routers serve their own routes independently, so a route under `pages/` never sees a stylesheet imported only in `app/layout.tsx`, and vice versa.

## Import the stylesheet

Add the import to the root file for your router:

**App Router**

```tsx
// app/layout.tsx
import "@codenhub/styles";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

**Pages Router**

```tsx
// pages/_app.tsx
import "@codenhub/styles";
import type { AppProps } from "next/app";

export default function App({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />;
}
```

Running Tailwind CSS v4? `@import "@codenhub/styles/tw"` is a CSS directive, so it belongs in a CSS file, not a bare import in `layout.tsx`/`_app.tsx` — add it (with `@import "tailwindcss"` and, if needed, `@source`) to your global CSS file, and import that file from the same root file shown above instead. See [Tailwind CSS v4](./tailwind.md).

## Force a theme

Apply `.dark` or `.light` on `<html>` to force a theme instead of following the system preference; see [Setup → Configuration](../setup.md#configuration).

```tsx
<html lang="en" className="dark">
```

## Troubleshooting

**Pages Router build fails with "Global CSS cannot be imported from files other than your Custom `<App>`"**

- **What happened:** Next.js rejected a global CSS `import` statement outside `pages/_app.tsx`. This restriction is specific to the Pages Router — Next.js enforces it itself, not this package, and it applies to any global CSS import, not specifically to `@codenhub/styles`. It does not apply to the App Router, where the same import works from any layout, page, or component.
- **Why:** the Pages Router has no per-route CSS boundary the way the App Router does, so Next.js requires one predictable file for global stylesheets to avoid ordering conflicts between pages.
- **Fix:** move the `import "@codenhub/styles"` line to `pages/_app.tsx`, and remove it from wherever it currently is.

## See also

- [Setup → Import paths](../setup.md#import-paths): every entrypoint this package publishes.
- [Usage](../usage/index.md): component classes to compose once the stylesheet is loaded.
