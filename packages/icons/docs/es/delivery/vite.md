---
title: Plugin de Vite
description: Escanea el marcado que Vite transforma, más los globs que enumeres, y sirve únicamente las reglas de máscara que necesita.
order: 3
source: 5b2824dab3c360911a7c471f1d7277e32fffda81
---

# Plugin de Vite

Cuando tu build corre sobre Vite sin Tailwind, el plugin de Vite escanea tus archivos y sirve únicamente las reglas de máscara CSS que usa tu marcado — o reescribe las etiquetas `<i class="ic-...">` directamente en SVGs en línea si prefieres no tener hoja de estilos por icono en absoluto.

```ts
// vite.config.ts
import lucide from "@codenhub/icons/data/lucide";
import viteIcons from "@codenhub/icons/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [viteIcons({ content: ["./src/**/*.{html,ts,tsx}"], defaultPrefix: "lucide", families: [lucide] })],
});
```

```css
@import "@codenhub/icons";
```

| Opción          | Propósito                                                                                         |
| --------------- | ------------------------------------------------------------------------------------------------- |
| `families`      | Familias contra las que resolver. No se incluye ninguna por defecto.                              |
| `defaultPrefix` | Familia contra la que se resuelve un nombre sin calificar. No hay valor por defecto.              |
| `content`       | Archivos y globs para escanear, además de lo que transforma el build.                             |
| `prefix`        | Prefijo de clase. Por defecto `ic`.                                                               |
| `strokeWidth`   | Valor por defecto para familias de trazos cuyas clases no llevan modificador.                     |
| `mode`          | `css` sirve reglas de máscara; `svg` reemplaza `<i class="ic-...">` con SVG en línea al compilar. |
| `attribution`   | `auto`, `file` u `off`. Consulta [Licencias](../licensing.md).                                    |
| `registry`      | Un `IconRegistry` preparado, en lugar de `families`.                                              |

La hoja de estilos generada se sirve como `virtual:icons.css` y se inyecta en cada punto de entrada HTML. `@import "@codenhub/icons";` se deja intacto — se resuelve mediante la condición de exportación `style` del paquete hacia las reglas base `.ic` y significa lo mismo haya o no un plugin en el pipeline. Mantenlo en tu hoja de estilos; el plugin añade las reglas por icono alrededor de él, no en su lugar.

## Escaneo

`content` acepta rutas literales y patrones glob como `src/**/*.{html,tsx}`, que se expanden cuando corre el escaneo. Las rutas relativas se resuelven desde el [`root`](https://vite.dev/config/shared-options.html#root) de Vite, igual que Vite resuelve sus propias rutas, así que la misma configuración funciona sin importar desde qué directorio lances el build. `content` es aditivo: el plugin también escanea cada archivo fuente que Vite transforma, así que solo necesitas `content` para archivos que el bundler nunca ve — y para primeros pintados limpios en desarrollo.

El escaneo en tiempo de transformación lee cada módulo que Vite transforma, sea cual sea su extensión. Un archivo que Vite nunca transforma se ve únicamente mediante `content`, y lo mismo ocurre con una clase en un módulo transformado después de generarse la hoja de estilos, algo que puede pasar cuando un framework importa la hoja de estilos por su cuenta, como hacen Astro y SvelteKit. Consulta [Frameworks](../frameworks/index.md). Ten en cuenta que esto aplica solo a la generación de hojas de estilos; el [modo SVG en línea](#modo-svg-en-línea) reescribe un conjunto distinto de tipos de archivo.

En desarrollo, Vite sirve el cascarón HTML antes de transformar un solo módulo de JavaScript, así que una clase de icono escrita únicamente dentro del módulo de un componente sigue siendo un misterio cuando la página carga por primera vez. Para evitar dejarla en blanco, desarrollo sirve la hoja de estilos como un módulo en lugar de insertarla en línea, y el plugin invalida ese módulo cada vez que una transformación revela una clase nueva — el icono llega sin recargar la página. Enumerar tus fuentes en `content` se ahorra por completo esa ida y vuelta de actualización porque los archivos se leen desde disco por adelantado.

En modo `css`, un build de producción con entradas HTML escribe la hoja de estilos como un asset CSS nombrado según su hash de contenido, `assets/codenhub-icons-[hash].css` por defecto, y lo enlaza desde cada entrada HTML. Como un build transforma todos los módulos antes de emitir HTML, ese archivo ya contiene todas las clases que vio el build. Un build sin entradas HTML, como un build de librería, no emite ninguna hoja de estilos, y tampoco lo hace el [modo SVG en línea](#modo-svg-en-línea). Un asset de hoja de estilos enlazado no necesita nonce ni hash en una Content Security Policy: `style-src 'self'` lo permite cuando se sirve desde el origen de la página. Con un `base` en otro origen, como un CDN, la política debe permitir ese origen, como ya debe hacerlo para el propio CSS de Vite. Se descartaron dos alternativas:

- **Un `<style>` en línea**. Una política sin `'unsafe-inline'`, un nonce o un hash lo rechaza, así que todos los iconos se renderizarían en blanco en producción mientras que desarrollo, que usa un script de módulo del mismo origen, sigue funcionando.
- **Una opción `nonce` en el plugin.** El propio [`html.cspNonce`](https://vite.dev/config/shared-options#html-cspnonce) de Vite ya estampa un nonce en las etiquetas del HTML compilado, y un nonce necesita un servidor que envíe uno nuevo en cada respuesta, algo que un alojamiento estático no puede hacer.

## Modo SVG en línea

`mode: "svg"` omite por completo la generación de hojas de estilos y reescribe las etiquetas `<i class="ic-...">` en elementos `<svg>` en línea en tiempo de build. Reescribe etiquetas `<i>` y nada más: una clase de icono en otro elemento — o `.ic` en un `<span>` — no renderiza nada en este modo porque no hay ninguna hoja de estilos que aporte su máscara. El plugin avisa en tiempo de build cuando encuentra una clase de icono en un elemento que no va a reescribir, nombrando la clase y el archivo.

El material gráfico SVG animado conserva su animación SMIL en este modo, incluso cuando se solicita movimiento reducido: CSS no puede detener SMIL. El respaldo estático de Line MD, y el hecho de que `ic-on-hover` mantenga el gráfico en reposo, aplican únicamente en modo CSS; las clases de movimiento de glifo funcionan en ambos. El helper opcional `@codenhub/icons/play` reinicia un SVG en línea con `setCurrentTime(0)`; omite los reinicios bajo movimiento reducido pero no detiene una animación SMIL ya en curso. Consulta [Familias animadas](../concepts.md#familias-animadas) para ver los tiempos y los límites en navegadores.

Cambiar un proyecto existente desde modo CSS implica algo más que cambiar una bandera de configuración, porque el elemento que llega al navegador cambia de `<i>` a `<svg>`. Revisa dos detalles que tu antiguo `<i>` resolvía en silencio:

- **Tamaño.** El `<svg>` renderizado lleva una caja de `1em` como atributo de presentación, así que un icono se renderiza al tamaño del texto sin necesidad de hoja de estilos. CSS sigue ganando sobre eso: mantén `@import "@codenhub/icons"` en una hoja de estilos y las reglas base dimensionan el `<svg>` en línea a partir de `--ic-size` exactamente igual que dimensionan un `<i>`, de modo que tanto fijar `--ic-size` en un ancestro como las clases `ic-xs`–`ic-xl` funcionan. Sin ese import, un icono queda fijo en `1em`.
- **`hidden`.** `[hidden] { display: none }` es una regla de user-agent para elementos HTML, y un icono en línea vive en el espacio de nombres SVG, así que el atributo deja de ocultarlo. Un script que alterna un icono necesita una regla explícita `[hidden] { display: none }`, y una guarda escrita como `instanceof HTMLElement` deja de coincidir — un elemento SVG no lo es.

Una limitación es propia de los logotipos. Alrededor de 400 iconos de `logos` dibujan con gradientes, máscaras o rutas de recorte (`clip-path`), a los que hacen referencia por `id`. Los IDs de cada logo llevan su nombre como prefijo, así que dos logos distintos nunca colisionan, pero dos copias del mismo logo los comparten, y el navegador dibuja ambas copias desde la primera. Si esa primera copia está dentro de un elemento oculto con `display: none`, como en un menú móvil colapsado, todas las copias posteriores se renderizan en blanco (observado en Chromium). Coloca una copia visible antes de la oculta, oculta con `visibility: hidden` en su lugar o usa el modo CSS para un logotipo que aparece más de una vez, ya que allí cada imagen de máscara es un documento propio. Lo mismo aplica a `renderSvg` y a [un módulo por icono](#un-módulo-por-icono).

La reescritura cubre `.html`, `.js`, `.jsx`, `.ts`, `.tsx`, `.vue`, `.svelte` y `.astro`. Un archivo `.astro` se reescribe en ambas mitades, su frontmatter escapado como JavaScript y su plantilla dejada como marcado; los archivos `.vue` y `.svelte` se dividen igual, con la plantilla leída como marcado y `<script>` como JavaScript. Un icono escrito como elemento JSX recibe los nombres de atributo de React, como `strokeWidth`, y un objeto `style` cuando el proyecto usa `@vitejs/plugin-react` o `@vitejs/plugin-react-swc`; Solid, Preact y Vue JSX reciben los nombres HTML, que pasan directo al DOM. `content` no interviene en el modo `svg` porque alimenta la generación de hojas de estilos, que este modo omite.

Escribe cada clase de icono completa como una cadena literal para que el plugin pueda detectarla: una clase armada en tiempo de ejecución, como `` `ic-${name}` ``, es invisible en tiempo de build. En modo CSS ese elemento simplemente se queda sin regla; en modo `svg` no hay hoja de estilos a la que recurrir, así que el elemento no renderiza nada. Siempre que el nombre del icono venga de estado o datos en tiempo de ejecución, usa [un módulo por icono](#un-módulo-por-icono) — es el patrón soportado y funciona en ambos modos.

## Un módulo por icono

Cuando un icono se elige de forma dinámica en tiempo de ejecución, importa un módulo virtual para ese icono en lugar de distribuir una familia entera:

```ts
const { svg } = await import("virtual:@codenhub/icons/lucide/heart");
element.innerHTML = svg;
```

El módulo exporta el marcado renderizado tanto como `svg` como en su exportación por defecto, junto con el objeto de icono resuelto como `icon`. El `<svg>` lleva la clase calificada del icono (como `ic-lucide-heart` bajo el `prefix` configurado) igual que el modo SVG en línea, así que las reglas base lo dimensionan y colorean mediante `--ic-size`, `--ic-color` y las clases `ic-xs`–`ic-xl`. No lleva atributo `aria-hidden`: añádelo tú mismo para un icono decorativo, o dale a un icono con significado `role="img"` y una etiqueta. Cada import se convierte en su propio módulo, permitiendo al bundler hacer code-split y tree-shaking hasta iconos individuales. Una ruta sin calificar como `virtual:@codenhub/icons/close` se resuelve mediante tu prefijo por defecto configurado igual que cualquier otro nombre corto, y un icono desconocido hace fallar el build de forma explícita en lugar de enviar un elemento en blanco.

## Ver también

- [Métodos de entrega](index.md) — cómo se comparan los métodos.
- [Plugin de PostCSS](postcss.md) — el siguiente método de entrega, para builds de PostCSS sin Vite.
- [Frameworks](../frameworks/index.md) — Astro y SvelteKit se apoyan en este plugin.
- [API de JavaScript](../javascript-api.md) — preparar un `registry` a mano.
