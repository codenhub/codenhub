---
title: Evitar el destello
description: Aplica el tema antes del primer pintado con getPrePaintScript(), en apps estáticas y renderizadas en el servidor, también bajo una Content Security Policy.
order: 5
source: 2f612948b70990d4b0dee1b718bb9d57ec09d484
---

# Evitar el destello

Recarga la página de [Primeros pasos](getting-started.md) con el tema oscuro elegido y mira con atención: por un instante, se ve clara. Un usuario que eligió el oscuro a medianoche recibe un destello blanco en cada visita, que es justo lo que quería evitar al elegirlo. El navegador dibuja la página en cuanto tiene el HTML y el CSS, y tu script, que llama a `init()`, se ejecuta después. Hasta entonces, `<html>` no tiene `data-theme`, así que la página muestra sus colores por defecto.

La solución es un script diminuto que se ejecuta **antes** del primer pintado. Tiene que escribirse directamente en el `<head>` de la página, no cargarse desde un archivo, para que el navegador lo ejecute antes de dibujar nada. `getPrePaintScript()` devuelve ese script como string. Repite exactamente lo que decide `init()`, la elección guardada o, si no hay, la configuración del sistema operativo, y aplica el atributo, las clases, `color-scheme` y los tokens del tema. Cuando `init()` se ejecuta después, el tema correcto ya está ahí y no cambia nada visible. El script es ES5 puro y atrapa sus propios errores, así que un navegador demasiado antiguo para el paquete en sí igual recibe el tema correcto, y un fallo en él nunca puede impedir que la página cargue.

## Comparte las opciones

El script previo al pintado y el gestor de tu app tienen que coincidir en todas las opciones: si uno usa otra `storageKey`, no se ponen de acuerdo sobre la elección guardada y el destello vuelve, ahora con una segunda opinión. Mantén las opciones en un módulo que importen los dos:

```ts
// src/theme-options.ts
import type { ThemeOptions } from "@codenhub/theme";

export const themeOptions = {
  themes: {
    light: { colorScheme: "light" },
    dark: { colorScheme: "dark" },
  },
  storageKey: "my-app-theme",
} satisfies ThemeOptions;
```

```ts
// src/main.ts
import { createTheme } from "@codenhub/theme";

import { themeOptions } from "./theme-options";

export const theme = createTheme(themeOptions).init();
```

`satisfies ThemeOptions` comprueba el objeto contra los tipos de las opciones sin perder sus nombres de tema exactos, así que `theme.set()` sigue aceptando solo `"light"` y `"dark"`. Anotarlo como `const themeOptions: ThemeOptions` ampliaría los nombres a cualquier string, y el compilador dejaría de atrapar errores de escritura.

Dónde se genera el script depende de cómo se produce tu HTML.

## En un sitio estático

Una single-page app construida con Vite tiene un solo `index.html`, escrito en tiempo de build. `createTheme()` es seguro de llamar fuera de un navegador, así que un pequeño plugin en `vite.config.ts` puede generar el script durante el build y ponerlo al principio del `<head>`:

```ts
// vite.config.ts
import { createTheme } from "@codenhub/theme";
import { defineConfig } from "vite";

import { themeOptions } from "./src/theme-options";

export default defineConfig({
  plugins: [
    {
      name: "theme-pre-paint",
      transformIndexHtml() {
        return [
          {
            tag: "script",
            children: createTheme(themeOptions).getPrePaintScript(),
            injectTo: "head-prepend",
          },
        ];
      },
    },
  ],
});
```

Arranca el servidor de desarrollo, mira el código fuente de la página y verás el script como lo primero del `<head>`: una línea larguísima que nadie debería tener que leer, y por eso la escribe una función. Otras herramientas de build tienen un paso equivalente para editar el HTML; lo que importa es que el string termine dentro de un elemento `<script>` en el `<head>`, antes de tus hojas de estilos.

## En una app renderizada en el servidor

Cuando un servidor construye cada página, el script se genera ahí y se escribe en el HTML que envía. Con cualquier servidor de Node.js que escribe el HTML como string:

```ts
import { createTheme } from "@codenhub/theme";

import { themeOptions } from "./theme-options";

// El script depende solo de las opciones, así que constrúyelo una vez.
const prePaintScript = createTheme(themeOptions).getPrePaintScript();

function renderPage(body: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <script>${prePaintScript}</script>
    <link rel="stylesheet" href="/styles.css" />
  </head>
  <body>${body}</body>
</html>`;
}
```

El script se puede poner tal cual dentro de `<script>` sin riesgo: los nombres de los temas y los valores de los tokens no pueden cerrar el elemento ni escaparse de él.

En un framework de React que renderiza `<html>` por sí mismo, como Next.js, ponlo en el layout raíz:

```tsx
// src/app/layout.tsx
import { createTheme } from "@codenhub/theme";

import { themeOptions } from "../theme-options";

const prePaintScript = createTheme(themeOptions).getPrePaintScript();

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: prePaintScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
```

`suppressHydrationWarning` hace falta porque el script cambia `<html>` antes de que cargue React: React encuentra un `data-theme`, una clase y un `style` que el servidor no renderizó, y avisaría de que no coinciden. La diferencia es intencional. La opción silencia ese aviso solo en `<html>`, no en sus hijos.

## Lo que sabe el servidor

En un servidor no hay `localStorage` ni configuración del sistema operativo, así que ahí el gestor no hace nada que necesite un navegador: no aplica nada, no guarda nada, no escucha nada, y `theme.system` informa `defaultTheme`. Todos los métodos se pueden llamar igual sin riesgo; ninguno lanza una excepción por la falta de `window` o `document`.

Eso significa que el servidor no puede saber qué tema eligió el usuario, y el HTML que envía no lleva ninguno. El script previo al pintado lo completa antes del primer pintado, lo cual basta para la mayoría de las apps. Si tu servidor tiene que renderizar el tema correcto por sí mismo, por ejemplo porque renderiza markup específico de cada tema, tiene que conocer la elección a partir de la petición, normalmente de una cookie que tu app define cuando cambia el tema. Esa lógica la escribes tú; mantén sus nombres de tema, su atributo y sus clases alineados con las mismas opciones.

## Content Security Policy

Si tu sitio envía una Content Security Policy cuyo `script-src` no incluye `'unsafe-inline'`, el navegador bloquea el script inline, el destello vuelve y la única señal es un error en la consola. Permite el script de una de estas dos formas:

- **Nonce:** renderiza el elemento como `<script nonce="…">`, con el nonce por petición que tu política ya nombra.
- **Hash:** agrega a `script-src` el `'sha256-…'` del texto del script. El script es el mismo para las mismas opciones, así que calcula el hash una vez en tiempo de build, por ejemplo con `createHash("sha256").update(script).digest("base64")` de `node:crypto`. Inserta el string exactamente como se devuelve: cualquier cambio, incluso espacios en blanco a su alrededor dentro del elemento, cambia el hash.

## Lo que el script no incluye

Las sobrescrituras de tokens de `setTokens()` existen solo en la página en ejecución, así que el script no puede conocerlas; aplica los `tokens` propios de los temas. Las sobrescrituras que tu app guarda por su cuenta aparecen una vez que tu código vuelve a llamar a `setTokens()`.

A continuación, [Frameworks](frameworks.md) muestra cómo usar el gestor dentro de componentes de React y con Tailwind CSS.
