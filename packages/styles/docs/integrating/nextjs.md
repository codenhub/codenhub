---
title: Next.js
description: Loading the stylesheet in a Next.js / React app.
order: 2
---

# Next.js

Next.js has two router architectures, and they treat global CSS differently:

- **App Router** (an `app/` directory): global CSS — including an external package's stylesheet like this one — can be imported from any layout, page, or component under `app/`. Importing it from the root layout is only a recommendation, for predictable CSS ordering across routes; Next.js does not enforce it and no error occurs if you import it elsewhere.
- **Pages Router** (a `pages/` directory, no `app/`): a stylesheet from a package, like this one, can be imported from any page or component too. Your own global `.css` files are the restricted ones: they can be imported only from `pages/_app.tsx`, and importing one anywhere else fails the build. That matters for `/tw`, which lives in a CSS file of yours. Next.js enforces this itself, not this package; see [Troubleshooting](#troubleshooting). Import the stylesheet from `pages/_app.tsx` anyway, for the same predictable order.
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

Running Tailwind CSS v4? `@import "@codenhub/styles/tw"` is a CSS directive, so it belongs in a CSS file, not a bare import in `layout.tsx`/`_app.tsx` — add it (with `@source` if needed; `/tw` imports Tailwind itself, so leave out your own `@import "tailwindcss"`) to your global CSS file, and import that file from the same root file shown above instead. See [Tailwind CSS v4](./tailwind.md).

## Force a theme

Apply `.theme-dark` or `.theme-light` (or `data-theme="dark"` or `"light"`) on `<html>` to force a theme instead of following the system preference; see [Theming → Light and dark](../usage/theming.md#light-and-dark).

```tsx
<html lang="en" className="dark">
```

In the Pages Router, `pages/_document.tsx` renders `<html>`, so put the class on its `<Html>` component:

```tsx
<Html lang="en" className="dark">
```

## Troubleshooting

**Pages Router build fails with "Global CSS cannot be imported from files other than your Custom `<App>`"**

- **What happened:** Next.js rejected an `import` of one of your own global `.css` files outside `pages/_app.tsx`, such as the file that holds `@import "@codenhub/styles/tw"`. This restriction is specific to the Pages Router, and Next.js enforces it itself, not this package. It does not cover a stylesheet imported straight from a package, so `import "@codenhub/styles"` builds from any page or component, and it does not apply to the App Router at all. Checked with Next.js 16.4, with Turbopack and with webpack.
- **Why:** the Pages Router has no per-route CSS boundary the way the App Router does, so Next.js requires one predictable file for your global stylesheets to avoid ordering conflicts between pages.
- **Fix:** move the import of your CSS file to `pages/_app.tsx`, and remove it from wherever it currently is.

## Next

Return to the main path: [Building a screen](../concepts.md) adds the first card and form to the settings page. [Setup → All entrypoints](../setup.md#all-entrypoints) lists every other stylesheet you can import.
