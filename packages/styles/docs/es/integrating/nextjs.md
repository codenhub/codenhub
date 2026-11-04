---
title: Next.js
description: Cargar la hoja de estilos en una aplicación Next.js / React.
order: 2
source: fd8dc12652c64995638c5b902a1ca35787f9a37c
---

# Next.js

Next.js tiene dos arquitecturas de router, y tratan el CSS global de forma distinta:

- **App Router** (un directorio `app/`): el CSS global, incluida la hoja de estilos de un paquete externo como este, se puede importar desde cualquier layout, página o componente dentro de `app/`. Importarlo desde el layout raíz es solo una recomendación, para que el orden del CSS sea predecible entre rutas; Next.js no lo impone y no se produce ningún error si lo importas en otro sitio.
- **Pages Router** (un directorio `pages/`, sin `app/`): el CSS global está restringido a `pages/_app.tsx`. Importarlo desde cualquier otro sitio hace fallar el build; lo impone el propio Next.js, no este paquete; consulta [Solución de problemas](#solución-de-problemas).
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

Aplica `.dark` o `.light` en `<html>` para forzar un tema en lugar de seguir la preferencia del sistema; consulta [Temas → Claro y oscuro](../usage/theming.md#claro-y-oscuro).

```tsx
<html lang="en" className="dark">
```

## Solución de problemas

**El build con Pages Router falla con "Global CSS cannot be imported from files other than your Custom `<App>`"**

- **Qué ha pasado:** Next.js ha rechazado una sentencia `import` de CSS global fuera de `pages/_app.tsx`. Esta restricción es propia del Pages Router: la impone el propio Next.js, no este paquete, y se aplica a cualquier import de CSS global, no solo a `@codenhub/styles`. No se aplica al App Router, donde el mismo import funciona desde cualquier layout, página o componente.
- **Por qué:** el Pages Router no tiene un límite de CSS por ruta como el App Router, así que Next.js exige un único archivo predecible para las hojas de estilos globales y así evitar conflictos de orden entre páginas.
- **Solución:** mueve la línea `import "@codenhub/styles"` a `pages/_app.tsx` y quítala de donde esté ahora.

## Siguiente paso

Vuelve al camino principal: [Construir una pantalla](../concepts.md) añade la primera tarjeta y el primer formulario a la página de ajustes. [Configuración inicial → Todos los puntos de entrada](../setup.md#todos-los-puntos-de-entrada) enumera todas las demás hojas de estilos que puedes importar.
