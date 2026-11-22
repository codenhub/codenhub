---
title: Next.js
description: Cargar la hoja de estilos en una aplicación Next.js / React.
order: 2
source: b229c0204095ccf30396f20e8b7f8033f7004285
---

# Next.js

Next.js tiene dos arquitecturas de router, y tratan el CSS global de forma distinta:

- **App Router** (un directorio `app/`): el CSS global, incluida la hoja de estilos de un paquete externo como este, se puede importar desde cualquier layout, página o componente dentro de `app/`. Importarlo desde el layout raíz es solo una recomendación, para que el orden del CSS sea predecible entre rutas; Next.js no lo impone y no se produce ningún error si lo importas en otro sitio.
- **Pages Router** (un directorio `pages/`, sin `app/`): la hoja de estilos de un paquete, como esta, también se puede importar desde cualquier página o componente. Los restringidos son tus propios archivos `.css` globales: solo se pueden importar desde `pages/_app.tsx`, e importar uno en cualquier otro sitio hace fallar el build. Eso importa para `/tw`, que vive en un archivo CSS tuyo. Lo impone el propio Next.js, no este paquete; consulta [Solución de problemas](#solución-de-problemas). Importa la hoja de estilos desde `pages/_app.tsx` de todos modos, por el mismo orden predecible.
- **Ambos directorios presentes** (a mitad de una migración): importa la hoja de estilos en los dos archivos raíz. Los dos routers sirven sus propias rutas de forma independiente, así que una ruta dentro de `pages/` nunca ve una hoja de estilos importada solo en `app/layout.tsx`, y viceversa.

## Importar la hoja de estilos

Añade el import al archivo raíz de tu router:

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

¿Usas Tailwind CSS v4? `@import "@codenhub/styles/tw"` es una directiva de CSS, así que va en un archivo CSS, no como import suelto en `layout.tsx`/`_app.tsx`: añádelo (con `@source` si hace falta; `/tw` ya importa Tailwind, así que no pongas tu propio `@import "tailwindcss"`) a tu archivo CSS global, e importa ese archivo desde el mismo archivo raíz de arriba. Consulta [Tailwind CSS v4](./tailwind.md).

## Forzar un tema

Aplica `.theme-dark` o `.theme-light` (o `data-theme="dark"` o `"light"`) en `<html>` para forzar un tema en lugar de seguir la preferencia del sistema; consulta [Temas → Claro y oscuro](../usage/theming.md#claro-y-oscuro).

```tsx
<html lang="en" className="dark">
```

En el Pages Router, `<html>` lo renderiza `pages/_document.tsx`, así que pon la clase en su componente `<Html>`:

```tsx
<Html lang="en" className="dark">
```

## Solución de problemas

**El build con Pages Router falla con "Global CSS cannot be imported from files other than your Custom `<App>`"**

- **Qué ha pasado:** Next.js ha rechazado un `import` de uno de tus propios archivos `.css` globales fuera de `pages/_app.tsx`, como el archivo que contiene `@import "@codenhub/styles/tw"`. Esta restricción es propia del Pages Router, y la impone el propio Next.js, no este paquete. No cubre una hoja de estilos importada directamente de un paquete, así que `import "@codenhub/styles"` compila desde cualquier página o componente, y no se aplica en absoluto al App Router. Comprobado con Next.js 16.4, con Turbopack y con webpack.
- **Por qué:** el Pages Router no tiene un límite de CSS por ruta como el App Router, así que Next.js exige un único archivo predecible para tus hojas de estilos globales y así evitar conflictos de orden entre páginas.
- **Solución:** mueve el import de tu archivo CSS a `pages/_app.tsx` y quítalo de donde esté ahora.

## Siguiente paso

Vuelve al camino principal: [Construir una pantalla](../concepts.md) añade la primera tarjeta y el primer formulario a la página de ajustes. [Configuración inicial → Todos los puntos de entrada](../setup.md#todos-los-puntos-de-entrada) enumera todas las demás hojas de estilos que puedes importar.
