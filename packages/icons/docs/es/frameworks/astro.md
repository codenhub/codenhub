---
title: Astro
description: CSS simple y Tailwind v4 funcionan sin configuración; el plugin de Vite funciona pero hay que indicarle los archivos .astro.
order: 1
source: 6a7502bd054b4f45ee6d40ecb6bc749d13ac4de2
---

# Astro

Astro corre sobre Vite, así que los cuatro [métodos de entrega](../delivery/index.md) están sobre la mesa. Dos de ellos funcionan sin ninguna configuración específica de Astro; el plugin de Vite lleva dos líneas extra porque Astro renderiza el HTML de producción fuera del propio pipeline HTML de Vite.

## CSS simple (sin configuración)

Importa las reglas base y una hoja de estilos de familia desde un layout o una hoja de estilos global:

```css
/* src/styles/icons.css */
@import "@codenhub/icons";
@import "@codenhub/icons/lucide";
```

```astro
---
import "../styles/icons.css";
---
<i class="ic-lucide-heart" aria-hidden="true"></i>
```

Astro resuelve directamente las exportaciones CSS del paquete. Este es el camino de menor esfuerzo — un import CSS y cero configuración — a cambio del tamaño de la hoja de estilos y sin modificador de grosor de trazo. Consulta [CSS simple](../delivery/plain-css.md).

## Tailwind CSS v4 (sin configuración)

Con `@tailwindcss/vite` configurado, añade un import a tu entrada de Tailwind:

```css
@import "tailwindcss";
@import "@codenhub/icons/tw";
```

Se emiten únicamente los iconos que usa tu marcado. Consulta [Tailwind CSS](../delivery/tailwind.md).

## Plugin de Vite

Añade el plugin en `astro.config.mjs`:

```js
import lucide from "@codenhub/icons/data/lucide";
import icons from "@codenhub/icons/vite";
import { defineConfig } from "astro/config";

export default defineConfig({
  vite: {
    plugins: [
      icons({
        families: [lucide],
        defaultPrefix: "lucide",
        content: ["./src/**/*.{astro,md,mdx,html}"],
      }),
    ],
  },
});
```

Después importa la hoja de estilos generada una sola vez, desde un layout que usen todas las páginas:

```astro
---
import "../styles/global.css"; // tu hoja de estilos con @import "@codenhub/icons"
import "virtual:icons.css";
---
```

La primera línea corresponde a la hoja de estilos que ya lleve `@import "@codenhub/icons";`; las reglas base pueden vivir en cualquier hoja de estilos que cargue la página. La segunda línea es obligatoria y específica de Astro. En cualquier otro sitio, el plugin de Vite inyecta la hoja de estilos generada en el HTML a través del hook `transformIndexHtml` de Vite. Un `astro build` de producción renderiza páginas mediante el propio pipeline de Astro en lugar de hacerlo como entradas HTML de Vite, así que `transformIndexHtml` nunca corre sobre ellas y este import explícito es lo que pone las reglas de máscara en la página. Sin él, el build termina bien, `@import "@codenhub/icons"` sigue aportando las reglas base y cada icono se renderiza como un cuadrado sólido de su color.

Conserva la entrada `content`. El plugin también escanea cada módulo que Vite transforma, incluidos los archivos `.astro`, pero la hoja de estilos se genera cuando el layout la importa, y un build puede llegar a ese import antes de que Vite haya transformado cada página y componente. `content` es lo que garantiza que cada clase escrita en `.astro`, `.md` o `.mdx` esté en ella.

Comprueba que cada clase que escribas se resuelva en una familia que hayas registrado. Un nombre de icono que el registro no pueda encontrar se queda sin regla y se renderiza como un cuadrado sólido. El modo CSS no informa nada cuando eso pasa — en cualquier entorno, no solo en Astro — así que el build queda en verde y la ausencia se ve recién en la página. El modo SVG en línea sí avisa, nombrando la clase y el archivo.

## Modo SVG en línea

`mode: "svg"` funciona en Astro y reescribe etiquetas `<i class="ic-...">` dentro de archivos `.astro` — en la plantilla, en el frontmatter y en bloques `<script>`, cada uno escapado según su contexto. Una etiqueta de icono escrita dentro de una _cadena_ en una expresión de plantilla, como `{cond ? '<i class="ic-x"></i>' : ''}`, es el único lugar donde sale mal: se reescribe como marcado, sin escapar las comillas que la rodean, porque distinguirla de marcado como `{cond && <i class="ic-x" />}` requiere un parser. El SVG en línea puede entonces cerrar la cadena antes de tiempo. Mueve esa etiqueta al frontmatter o a un componente. Todo lo anterior sobre cómo entregar la hoja de estilos de máscaras deja de aplicar aquí: el modo `svg` no emite reglas por icono, así que ni `virtual:icons.css` ni `content` hacen nada, y una clase en cualquier elemento distinto de una etiqueta `<i>` no renderiza nada porque no hay hoja de estilos detrás.

Aun así, mantén `@import "@codenhub/icons"`. Un `<svg>` en línea se renderiza a `1em` por su cuenta, pero esa hoja de estilos base es lo que permite que `--ic-size` y las clases de tamaño `ic-xs`–`ic-xl` le lleguen. Consulta [Plugin de Vite § Modo SVG en línea](../delivery/vite.md#modo-svg-en-línea).

`.md` y `.mdx` no se reescriben. Una clase de icono escrita en uno de esos archivos llega a la página como un elemento `<i>` pelado sin ninguna regla de máscara detrás, así que se renderiza como un cuadrado sólido con las reglas base cargadas, o como nada sin ellas. Tampoco nada lo reporta: la advertencia de clase sin resolver cubre únicamente los archivos que este modo reescribe, así que una página así compila en verde y publica iconos rotos.

Hay dos salidas para esto:

- **En `.mdx`**, envuelve el icono en un componente y renderiza ese componente desde tu markdown: el componente vive en un archivo `.astro`, `.jsx` o `.tsx`, todos los cuales sí se reescriben.
- **En `.md` normal**, que no puede importar componentes, usa el modo CSS en su lugar para que los globs de `content` cubran los archivos `.md` y `.mdx` como cualquier otra plantilla.

## Ver también

- [Plugin de Vite](../delivery/vite.md) — referencia completa de opciones y el modelo de escaneo.
- [Métodos de entrega](../delivery/index.md) — cómo se comparan los métodos.
- [Next.js](nextjs.md) y [SvelteKit](sveltekit.md) — las otras guías de frameworks.
- [API de JavaScript](../javascript-api.md) — lo siguiente en el orden de lectura, para generación programática de CSS o SVG.
