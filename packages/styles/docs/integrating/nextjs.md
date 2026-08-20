---
title: Next.js
description: Loading the stylesheet in a Next.js / React app.
---

# Next.js

Next.js only allows global CSS to be imported from one place. Import the
package from the root layout in the App Router, or from the custom App in
the Pages Router — not from a page or component further down the tree.

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

```tsx
// pages/_app.tsx
import "@codenhub/styles";
import type { AppProps } from "next/app";

export default function App({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />;
}
```

Apply `.dark` or `.light` on `<html>` to force a theme instead of following
the system preference; see [Setup → Configuration](../setup.md#configuration).

```tsx
<html lang="en" className="dark">
```

A project running Tailwind CSS v4 imports `@codenhub/styles/tw` from the
same file instead; see [Tailwind CSS v4](./tailwind.md) for the `@source`
directive Next.js needs to scan its own `app`/`src` directories.
