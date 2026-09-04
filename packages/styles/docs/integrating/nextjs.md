---
title: Next.js
description: Loading the stylesheet in a Next.js / React app.
order: 2
---

# Next.js

Next.js only allows global CSS to be imported from one place: the root layout in the App Router, or the custom App in the Pages Router. Importing it from a page or a component further down the tree fails the build — Next.js enforces this itself, not this package.

## Import the stylesheet

A Next.js project uses one router architecture, App Router or Pages Router, never both at once — so only one of the two examples below applies to your project, not both. If your project has an `app/` directory, it's on the App Router; if it has a `pages/` directory and no `app/` directory, it's on the Pages Router. Add the import to whichever root file matches:

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

Running Tailwind CSS v4? Import `@codenhub/styles/tw` from the same file instead — see [Tailwind CSS v4](./tailwind.md).

## Force a theme

Apply `.dark` or `.light` on `<html>` to force a theme instead of following the system preference; see [Setup → Configuration](../setup.md#configuration).

```tsx
<html lang="en" className="dark">
```

## Troubleshooting

**Build fails with "Global CSS cannot be imported from files other than your Custom `<App>`"**

- **What happened:** Next.js rejected a global CSS `import` statement that isn't in `app/layout.tsx` (App Router) or `pages/_app.tsx` (Pages Router). This is Next.js's own restriction, not this package's — it applies to any global CSS import, not specifically to `@codenhub/styles`.
- **Why:** Next.js resolves global stylesheets once per build and needs one predictable place to find them; allowing imports from arbitrary components would leave their load order undefined.
- **Fix:** move the `import "@codenhub/styles"` line to one of the two root files shown above, and remove it from wherever it currently is.

## See also

- [Setup → Import paths](../setup.md#import-paths): every entrypoint this package publishes.
- [Usage](../usage/index.md): component classes to compose once the stylesheet is loaded.
