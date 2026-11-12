---
title: Configuración inicial
description: Instala el paquete, elige entre CSS compilado o código fuente de Tailwind y renderiza la estructura base de la página de ajustes.
order: 1
source: 01adaabea85fb4d04139c86d9ad693e23c321d04
---

# Configuración inicial

Esta página lleva la hoja de estilos a tu proyecto y pone en la página la estructura vacía de la pantalla de ajustes. Hace falta una instalación, un import y una decisión: CSS compilado o código fuente de Tailwind. El resto de la página es referencia a la que puedes volver: cada punto de entrada, la opción sin clases, las capas de cascada y qué falla cuando falta un import.

## Instalación

```sh
pnpm add @codenhub/styles
```

`npm install @codenhub/styles` y `yarn add @codenhub/styles` funcionan igual.

## Importar la hoja de estilos

Importa una vez la hoja de estilos compilada completa, en el archivo CSS que tu aplicación ya carga de forma global:

```css
@import "@codenhub/styles";
```

Después escribe la estructura de la pantalla de ajustes. Es una sección de página con una columna estrecha y centrada:

```html
<main class="section">
  <div class="section-content narrow stack">
    <h1 class="text-title">Account settings</h1>
    <p>Manage your profile, plan, and security.</p>
  </div>
</main>
```

Si el encabezado aparece con una fuente de título en negrita y compacta, con el párrafo separado debajo, y la columna queda en el centro de una ventana ancha, la hoja de estilos funciona. Si parecen los estilos por defecto del navegador, consulta [Cuando nada tiene estilo](#cuando-nada-tiene-estilo).

La hoja de estilos completa incluye el reset, los tokens, los helpers de layout y de tipografía, y todas las clases de componentes. Aplica reglas globales a tu página: el reset, el tema raíz y los anillos de foco. No incluye las estéticas ni el mapeo de elementos sin clases; ambos son imports separados, descritos más abajo.

## Elige tu camino

Elige uno:

- **CSS compilado** (`@codenhub/styles`, el del ejemplo anterior). Úsalo salvo que tengas un motivo para no hacerlo. Funciona cualquier bundler que resuelva imports de CSS desde paquetes, como Vite, webpack o la CLI de Tailwind. Incluye todas las clases, las usen tus páginas o no.
- **Código fuente de Tailwind CSS v4** (`@codenhub/styles/tw`). Úsalo cuando tu proyecto ya usa Tailwind v4. Tu build compila el paquete junto con tus propias utilidades, así que obtienes una sola hoja de estilos y la variante `dark:` de Tailwind coincide con el tema del paquete. Necesita Tailwind 4.3.2 o posterior, por debajo de 5.
- **Sin bundler.** Enlaza el archivo compilado desde `node_modules` o desde un CDN con una etiqueta `<link>`; consulta [Sin bundler](./integrating/without-a-bundler.md).

Para incluir solo las clases que usan tus páginas en un proyecto que no usa Tailwind, con bundler o sin él, el comando `chs build` del paquete lee tus archivos y escribe una hoja de estilos con solo esas clases, que importas o enlazas en lugar de la compilada; consulta [Generar solo las clases que usas](./integrating/without-a-bundler.md#generar-solo-las-clases-que-usas).

Tu framework puede necesitar su propia configuración, como dónde va la hoja de estilos global en Next.js o en Astro. Cada una de estas guías cubre una configuración y después te devuelve aquí:

- [Tailwind CSS v4](./integrating/tailwind.md)
- [Next.js](./integrating/nextjs.md)
- [Vue](./integrating/vue.md)
- [Svelte](./integrating/svelte.md)
- [Astro](./integrating/astro.md)
- [Sin bundler](./integrating/without-a-bundler.md)

## Añadir una estética (opcional)

Las estéticas son hojas de estilos aparte porque la mayoría de las páginas usa una o ninguna. Importa las seis a la vez, o solo la que uses:

```css
@import "@codenhub/styles";
@import "@codenhub/styles/aesthetics/neobrutalism";
```

El orden de los dos imports no importa, porque cada punto de entrada declara las [capas de cascada](#capas-de-cascada) antes de usar alguna. [Estéticas](./usage/aesthetics.md) muestra lo que hace cada una; puedes ignorarlas hasta entonces.

## Requisitos

- **Navegadores:** Chrome 123, Safari 17.5 o Firefox 128 y posteriores. Los colores usan `light-dark()` y `color-scheme` (Firefox 120). `.input-group` lee el estado inválido y deshabilitado de un control anidado con `:has()` (Firefox 121). Las clases de elevación registran una propiedad que no se hereda con `@property` (Firefox 128); sin ella, una clase de elevación también llegaría a los elementos sin clase que contiene.
- **Herramientas:** un `@import` con un nombre de paquete necesita una herramienta que resuelva imports de CSS desde paquetes a través de su mapa `exports`. Si no tienes una, enlaza el archivo compilado por su ruta o desde un CDN; consulta [Sin bundler](./integrating/without-a-bundler.md). Dos herramientas habituales necesitan un pequeño ajuste, descrito en [Integración → Bundlers que necesitan un empujón](./integrating/index.md#bundlers-que-necesitan-un-empujón): Parcel, y PostCSS con `postcss-import`.
- **Tailwind:** 4.3.2 o posterior, por debajo de 5, solo para los puntos de entrada de código fuente `/tw`. Es una peer dependency opcional, así que ni los puntos de entrada compilados ni el comando `chs build` la instalan.
- **Node.js:** 24 o posterior en la máquina que ejecuta el comando `chs build`. Las hojas de estilos no lo necesitan, pero el paquete lo declara como su engine, así que Yarn 1, y npm con `engine-strict`, rechazan la instalación en un Node.js anterior.
- **Tu aplicación:** el paquete no tiene JavaScript. El HTML semántico, ARIA, el comportamiento de teclado, la gestión del foco, la validación y los anuncios son cosa tuya; consulta [Accesibilidad](./accessibility.md).

## Cuando nada tiene estilo

- **Falta el import o no se carga de forma global.** Las clases no hacen nada hasta que la hoja de estilos está en la página. Impórtala una vez en una hoja de estilos que cargue cada página, no en un componente que puede no renderizarse.
- **El nombre del paquete no se resuelve.** Un `<link>` simple o una herramienta sin resolución de paquetes CSS no puede leer `@import "@codenhub/styles"`. Enlaza `node_modules/@codenhub/styles/dist/index.css`, o sigue [Sin bundler](./integrating/without-a-bundler.md). Parcel y `postcss-import` lo resuelven con un pequeño cambio; consulta [Integración → Bundlers que necesitan un empujón](./integrating/index.md#bundlers-que-necesitan-un-empujón).
- **Se carga una ruta `/tw` sin Tailwind.** Los archivos `/tw` son código fuente de Tailwind: contienen `@theme`, `@utility` y `@apply`, que los navegadores no entienden. Tu build de Tailwind tiene que compilarlos; consulta [Tailwind CSS v4](./integrating/tailwind.md).
- **Un punto de entrada `/tw` específico se importa sin Tailwind antes.** `@codenhub/styles/tw/button` y los demás archivos de un solo componente no importan Tailwind. Importados solos, compilan sin error pero no producen ninguna regla de componente. Pon `@import "tailwindcss";` antes; consulta [Tailwind CSS v4 → Usar un punto de entrada específico](./integrating/tailwind.md#usar-un-punto-de-entrada-específico).
- **Falta una clase construida en tiempo de ejecución (solo con código fuente de Tailwind).** Tailwind genera una clase de utilidad, también los componentes del paquete como `.btn`, solo cuando encuentra su nombre en tus archivos fuente. Un nombre armado a partir de strings, como `` `btn ${tone}` ``, es invisible para ese escaneo. Escribe los nombres de clase completos, o enuméralos como se describe en [Tailwind CSS v4](./integrating/tailwind.md).

### CSS crítico en línea

Puedes pegar una hoja de estilos **compilada**, de `dist/` o de la salida de tu propio build, dentro de un elemento HTML `<style>`, por ejemplo para poner en línea el CSS crítico en un head renderizado en el servidor. Ninguno de los archivos compilados contiene la secuencia `</style` que cerraría el elemento antes de tiempo.

Eso no se aplica a los archivos `/tw`. Son código fuente de Tailwind, no CSS terminado, así que pegar uno dentro de `<style>` le da al navegador directivas que ignora y las clases nunca se generan. Compílalos primero con Tailwind y después pon en línea el resultado.

## Todos los puntos de entrada

Los puntos de entrada compilados son CSS terminado. Los puntos de entrada `/tw` publican el código fuente sin compilar desde `tw/`, junto a `dist/`, que un build de Tailwind v4 tiene que procesar. Un punto de entrada `/tw` de un solo componente incluye los tokens del tema, así que sus clases no necesitan nada más del paquete, pero necesita `@import "tailwindcss";` antes; consulta [Tailwind CSS v4 → Usar un punto de entrada específico](./integrating/tailwind.md#usar-un-punto-de-entrada-específico).

Cada ruta de import resuelve el mismo archivo con las condiciones de exportación `style`, `import` y `default`. Antes va una condición `types` que apunta a una declaración vacía, así que TypeScript acepta un import por efecto secundario como `import "@codenhub/styles";` con `noUncheckedSideEffectImports`, que TypeScript 6 activa por defecto. Un import de CSS es un efecto secundario, así que asegúrate de que tu bundler no lo descarte como no usado.

| Ruta de import                   | Qué contiene y qué cambia                                                                                                                                                                                                                                                                                                                         |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@codenhub/styles`               | Hoja de estilos completa compilada: la salida base y de tema de Tailwind, tokens, tipografía, helpers de layout y de contenido, componentes y el reset. Aplica el reset global, el tema raíz y las reglas de foco.                                                                                                                                |
| `@codenhub/styles/theme`         | Tokens compilados y las clases de intención, presentación, elevación y patrón de esquinas. Define las propiedades del tema raíz y los selectores claro y oscuro. Sin reset ni componentes.                                                                                                                                                        |
| `@codenhub/styles/palette`       | Custom properties `--palette-*` generadas: el color de relleno, de texto y de borde de cada combinación de intención y presentación como valor plano, más los colores planos `border`, `surface` y `text`. Para código que no puede usar el propio paquete; consulta [Personalización → Paleta generada](./usage/customizing.md#paleta-generada). |
| `@codenhub/styles/components`    | Tokens compilados, helpers de tipografía y todas las clases de componentes. Cada componente lleva su propia regla de movimiento reducido, y la corrección para `<dialog>` cerrado viene con `.card`. Sin reset, sin helpers de layout ni de contenido, sin mapeo sin clases.                                                                      |
| `@codenhub/styles/native`        | Tokens, tipografía, helpers de layout y de contenido, componentes y el reset del paquete compilados, más el [mapeo sin clases](#html-sin-clases) para elementos HTML simples. Sin el Preflight de Tailwind. Aplica el reset y selectores de elemento amplios.                                                                                     |
| `@codenhub/styles/aesthetics`    | Las seis estéticas compiladas, `.neobrutalism`, `.glass`, `.pixel`, `.chunky-tile`, `.cyber` y `.sketch`, cada una con su clase `-solo`. No trae tokens ni componentes propios; impórtalo en cualquier orden.                                                                                                                                     |
| `@codenhub/styles/aesthetics/*`  | Una estética compilada y su clase solo: `/neobrutalism`, `/glass`, `/pixel`, `/chunky-tile`, `/cyber` o `/sketch`.                                                                                                                                                                                                                                |
| `@codenhub/styles/tw`            | Versión en código fuente de la hoja de estilos completa. Importa el propio Tailwind y después el tema, la tipografía, los helpers, los componentes y el reset. Las mismas reglas globales.                                                                                                                                                        |
| `@codenhub/styles/tw/theme`      | Tema, tokens y clases de eje en código fuente. Importa la capa de tema de Tailwind, emite los selectores de tema y define la variante `dark:` del paquete.                                                                                                                                                                                        |
| `@codenhub/styles/tw/components` | Tema, tipografía, botones, feedback, formularios, superficies y tooltips en código fuente. Sin reset, sin helpers de layout ni de contenido, sin mapeo sin clases.                                                                                                                                                                                |
| `@codenhub/styles/tw/surface`    | Tema en código fuente más `.surface`, `.card` y `.panel`.                                                                                                                                                                                                                                                                                         |
| `@codenhub/styles/tw/button`     | Tema en código fuente más `.btn`.                                                                                                                                                                                                                                                                                                                 |
| `@codenhub/styles/tw/form`       | Tema en código fuente más `.field`, `.text-control`, `.ipt`, `.textarea`, `.select`, `.input-group`, `.checkbox`, `.radio` y `.switch`.                                                                                                                                                                                                           |
| `@codenhub/styles/tw/feedback`   | Tema en código fuente más `.alert`, `.badge`, `.skeleton` y `.progress`, con sus animaciones.                                                                                                                                                                                                                                                     |
| `@codenhub/styles/tw/tooltip`    | Tema en código fuente más las clases de tooltip.                                                                                                                                                                                                                                                                                                  |
| `@codenhub/styles/tw/reset`      | Tema, helpers de tipografía y el reset global en código fuente. Cambia la raíz, el body y los elementos, y define reglas de selección, movimiento, foco, barras de desplazamiento y colores forzados.                                                                                                                                             |
| `@codenhub/styles/tw/native`     | Versión en código fuente de `/native`: todo salvo el Preflight de Tailwind, más el reset del paquete y el mapeo sin clases. El efecto global más amplio.                                                                                                                                                                                          |
| `@codenhub/styles/tw/typography` | Tema en código fuente más los helpers de tipografía. Define los selectores de tema; sin reset, sin mapeo sin clases.                                                                                                                                                                                                                              |
| `@codenhub/styles/tw/utilities`  | Tema y tipografía en código fuente más los helpers de layout y de contenido.                                                                                                                                                                                                                                                                      |
| `@codenhub/styles/tw/aesthetics` | Las seis estéticas en código fuente. `/tw/aesthetics/neobrutalism`, `/glass`, `/pixel`, `/chunky-tile`, `/cyber` y `/sketch` publican una cada uno. CSS simple, sin efectos secundarios de tema ni de reset.                                                                                                                                      |
| `@codenhub/styles/package.json`  | El manifiesto del paquete, como JSON. Para herramientas que leen la versión instalada o el mapa de exportaciones; no es una hoja de estilos.                                                                                                                                                                                                      |

No importes en un mismo build dos puntos de entrada que se solapan, como `@codenhub/styles` y `@codenhub/styles/components`, salvo que el CSS duplicado te resulte aceptable. Elige el punto de entrada más reducido que cubra lo que necesita una página.

## HTML sin clases

`@codenhub/styles/native` da estilo a elementos HTML simples sin ninguna clase, para contenido al que no puedes añadir clases, como la salida de Markdown o el cuerpo de un CMS. Contiene todo lo que contiene la hoja de estilos completa salvo el Preflight de Tailwind, el reset de los valores por defecto del navegador que `@codenhub/styles` trae con Tailwind. El reset propio del paquete sí está: el box sizing, el fondo, el color del texto y la fuente de la raíz, el reset de márgenes de títulos, párrafos y listas, los colores de selección, los anillos de foco y la regla de movimiento reducido. Después añade este mapeo:

| Elemento                                                                                                                                      | Con el estilo de                                                                     |
| --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `h1`, `h2`, `h3`, `h4`, `h5` y `h6`                                                                                                           | `.text-title-lg`, `.text-title`, `.text-title-sm`, `.text-label-lg`, `.text-label`   |
| `body`                                                                                                                                        | `.text-body`, heredado por los párrafos, los elementos de lista y el resto del texto |
| `table`                                                                                                                                       | `.data-table`                                                                        |
| `kbd`, `blockquote`, `q`, `code`, `pre`                                                                                                       | `.kbd`, `.quote`, `.quote-inline`, `.code`, `.pre`                                   |
| `hr`                                                                                                                                          | `.divider`                                                                           |
| `input` sin tipo, o con tipo `text`, `number`, `email`, `password`, `url`, `tel`, `search`, `month`, `week`, `time`, `date`, `datetime-local` | `.ipt`                                                                               |
| `textarea`, `select`                                                                                                                          | `.textarea`, `.select`                                                               |
| `input type="checkbox"`, `input type="radio"`                                                                                                 | `.checkbox`, `.radio`                                                                |
| `button`, `input type="button"`, `type="submit"`, `type="reset"`                                                                              | `.btn`                                                                               |
| `dialog`                                                                                                                                      | `.card.floating`: oculto hasta que se abre, y entonces una tarjeta flotante centrada |
| `progress`                                                                                                                                    | `.progress`, lleno hasta su `value`; sin `value` es el barrido indeterminado         |

```html
<article>
  <h2>Two-factor authentication</h2>
  <p>Press <kbd>Ctrl</kbd> + <kbd>K</kbd> to open the command menu.</p>
  <label for="code">Verification code</label>
  <input id="code" type="text" inputmode="numeric" />
  <label><input type="checkbox" /> Remember this device</label>
  <button type="submit">Verify</button>
</article>
```

Lo que no hace:

- **Algunos tipos de input se quedan como están:** `file`, `range`, `color` y `hidden` conservan el aspecto propio del navegador.
- **Sin switch.** Un checkbox con `role="switch"` se sigue pintando como checkbox; el mapeo no lee roles. A una página que necesita switches le conviene más la hoja de estilos basada en clases.
- **Los enlaces mantienen el texto que los rodea.** Un enlace dentro de un encabezado conserva el tamaño del encabezado; un enlace nunca recibe estilo de botón.
- **El texto de cuerpo se define una sola vez.** `p` y `li` toman su tipografía del elemento en el que están, así que un contenedor que define su propio tamaño, peso o espaciado entre letras lo aplica al Markdown que contiene. Los controles conservan su propio espaciado entre letras: un botón, un badge y un campo de texto quedan en `normal`, sea lo que sea que definan la página o el contenedor.
- **El comportamiento nativo sigue siendo nativo.** Un `<dialog>` se abre con `show()` o `showModal()` como siempre; el mapeo solo lo pinta. El barrido de un `<progress>` se detiene con la preferencia de movimiento reducido, y en colores forzados la barra usa los colores del sistema.
- **`pre code` no recibe estilo doble.** El código dentro de un `pre` pierde el chip que dibujaría por sí solo: fondo, relleno, borde, sombra, brillo y recorte.

El mapeo es global: se da estilo a cada elemento de la página que coincida, incluidos los elementos dentro de widgets de terceros. Está en la [capa de cascada](#capas-de-cascada) `base`, así que cualquier clase lo supera. Añade una clase de intención o de presentación a un elemento mapeado, como `<button class="destructive">`, y se aplica igual que en `.btn`.

## Capas de cascada

Cada punto de entrada pone su CSS en las cuatro capas de cascada de Tailwind y declara su orden antes de usar alguna, así que el resultado no depende de qué archivo se carga primero:

| Capa         | Contiene                                                                                                                                                                                                                                                                         |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `theme`      | El tema de Tailwind, los tokens base, los selectores de tema y `/palette`.                                                                                                                                                                                                       |
| `base`       | El reset y los estilos de elementos sin clases.                                                                                                                                                                                                                                  |
| `components` | Las clases de estética y los valores de intención neutros de los que parte cada componente.                                                                                                                                                                                      |
| `utilities`  | Todos los componentes (`.btn`, `.card`, `.ipt`, etc.), junto a tus propias utilidades de Tailwind. Las clases de intención, presentación, borde, elevación, esquina y tamaño están en `utilities.families`, una subcapa que pierde frente a cualquier otra regla de `utilities`. |
| _sin capa_   | Las sobrescrituras de colores forzados y de movimiento reducido, la corrección para `<dialog>` cerrado y las clases `-solo`.                                                                                                                                                     |

Lo que eso significa cuando escribes tu propio CSS:

- **Tu utilidad o tu CSS sin capa supera a una clase de intención, presentación, elevación o estética** en el mismo elemento. `[--ui-fill:50%]` en un botón `.solid`, `font-serif` en una región `.pixel` o `.my-card { --ui-radius-surface: 0 }` en tu propia hoja de estilos se aplican.
- **Un componente y tu utilidad comparten la capa `utilities`.** Entre ellos decide la especificidad y después el orden en el código, como entre dos utilidades cualesquiera. Tu CSS sin capa siempre supera a un componente.
- **Tu utilidad supera los valores por defecto internos de un componente.** `p-0 text-center` en una celda de tabla, `text-sm` en una `.label` o `px-8` en un `.btn.sm` se aplican, porque el componente escribe esos valores por defecto de modo que gane una clase en el elemento.
- **El estado supera a tu intención.** Un campo con `aria-invalid="true"` sigue siendo destructivo aunque lleve una utilidad de intención.
- **Las clases `-solo` no tienen capa a propósito**, para que superen los estilos con capa o de especificidad cero de un componente de terceros. Una regla sin capa más específica, o una igual de específica que se cargue después, sigue superándolas; consulta [Clases solo](./usage/solo.md).

## Siguiente paso

Con la estructura en la página, continúa con [Construir una pantalla](./concepts.md) para añadir una tarjeta, un encabezado de formulario y un botón Guardar. Si usas uno de los frameworks anteriores y todavía no lo has configurado, hazlo primero.
