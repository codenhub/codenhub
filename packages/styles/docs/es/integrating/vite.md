---
title: Vite
description: Incluir solo las clases que usan tus páginas desde un proyecto Vite que no usa Tailwind, con el plugin de Vite del paquete.
order: 6
source: 0f469456ec2da35eeaacd597532087ca4e99a23e
---

# Vite

La hoja de estilos compilada contiene todas las clases del paquete, así que una página de ajustes que usa unos botones, una tarjeta y un formulario también se lleva las tablas, los tooltips y las alertas, por si cambia de idea. En un proyecto Vite que no usa Tailwind CSS, el plugin de Vite del paquete lo resuelve sin tocar tus imports. Cuando Vite arranca, lee los archivos de tu proyecto en busca de nombres de clase y cambia la hoja de estilos que importas por una con solo las clases de StyleKit que usan esos archivos. No hay comando que ejecutar ni archivo de salida que nombrar: añades una línea a `vite.config.ts` y el resto del proyecto queda como estaba.

Un proyecto que ya usa Tailwind CSS v4 no necesita el plugin. Su propio build recorta el [punto de entrada de código fuente](./tailwind.md) de la misma manera. Un proyecto sin Vite, con otro bundler o sin ninguno, escribe la hoja de estilos recortada con el [comando `chs build`](./without-a-bundler.md#generar-solo-las-clases-que-usas) del paquete.

## Añadir el plugin

Con el paquete instalado como en [Configuración inicial](../setup.md#instalación), añade el plugin a tu configuración de Vite:

```ts
// vite.config.ts
import viteStyles from "@codenhub/styles/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [viteStyles()],
});
```

`viteStyles` también se exporta con ese nombre, como en `import { viteStyles } from "@codenhub/styles/vite"`.

Mantén el import que ya tienes, desde tu entrada de JavaScript o tu hoja de estilos global:

```ts
// main.ts
import "@codenhub/styles";
```

```css
/* app.css */
@import "@codenhub/styles";
@import "@codenhub/styles/aesthetics/neobrutalism";
```

Esa es toda la configuración. `vite` y `vite build` sirven y publican ahora una hoja de estilos recortada a las clases que nombra la página de ajustes: `section`, `stack`, `text-title`, `btn` y las demás, y ninguno de los componentes que nunca usa.

Medido con Vite 8.3.6 en una página con un botón `btn primary`, el build publica unos 38 KB de CSS (8 KB con gzip), donde la misma página sin el plugin publica unos 255 KB (21 KB). Las dos cifras incluyen lo que añade el propio minificador de CSS de Vite 8: para sus navegadores de destino por defecto, escribe una alternativa junto a cada color `light-dark()`, con el plugin o sin él. El archivo que el plugin le entrega a Vite es el que `chs build` escribe para la misma página, byte a byte.

## Qué imports se recortan

Se recortan la hoja de estilos completa y las estéticas. Las demás hojas de estilos se cargan enteras, exactamente como sin el plugin:

| Import                                          | Con el plugin                                 |
| ----------------------------------------------- | --------------------------------------------- |
| `@codenhub/styles`                              | Recortada a las clases que usan tus archivos. |
| `@codenhub/styles/aesthetics`                   | Recortada, cada estética a las clases usadas. |
| `@codenhub/styles/aesthetics/<name>`            | Recortada a las clases usadas.                |
| `/components`, `/native`, `/theme` y `/palette` | Entera.                                       |
| Las rutas `/tw`                                 | Sin tocar; son código fuente de Tailwind.     |

Así que, para publicar menos, importa la hoja de estilos completa en lugar de `/components`. Para la página de un botón de arriba, la hoja de estilos recortada ocupa alrededor de una quinta parte de los 186 KB que `/components` carga entera. La hoja de estilos recortada se genera a partir de la completa, no de `/native`, así que no incluye los mapeos sin clases; una página que depende de ellos importa `/native`, que se carga entera.

El import se recorta dondequiera que Vite lo resuelva: un `import` de JavaScript, un `@import` de CSS, un archivo CSS que otro archivo CSS importa, un `@use` o un `@import` de Sass, Lightning CSS como transformador de CSS de Vite, y las consultas `?inline`, `?url` y `?raw` de Vite.

La hoja de estilos recortada contiene lo que escribe [`chs build`](./without-a-bundler.md#opciones): el tema y sus tokens, el reset, las reglas base de las que depende cada componente, las cuatro clases que se conservan las nombre o no un archivo (`.dark`, `.theme-dark`, `.theme-light` y `.disabled`), y cada clase de StyleKit que usan tus archivos. Siempre va minificada. Una estética que importas se recorta igual, a sus reglas para las clases que usan tus archivos; el import ya dice qué estéticas quieres, así que no hay nada que configurar.

## Qué archivos se leen

Se lee todo lo que hay bajo la raíz de Vite: la carpeta en la que ejecutas Vite, salvo que el comando nombre otra, como en `vite build apps/web`, o que tu configuración defina [`root`](https://vite.dev/config/shared-options.html#root). La detección automática de fuentes de Tailwind lee un proyecto de la misma manera. Se dejan fuera unas pocas cosas, cada una porque leerla conservaría clases que tus páginas no usan:

- **Lo que excluye tu `.gitignore`.** El `.gitignore` de la raíz, el de cada carpeta por debajo y el de cada carpeta por encima hasta la que contiene `.git`, con las reglas de git: gana la última línea que coincide, y un archivo más profundo prevalece sobre uno más alto. La raíz nunca se deja fuera, aunque el repositorio la ignore con una línea como `playground/`. Una línea que nombra los archivos bajo la raíz y no la carpeta, como `playground/**`, sí los deja fuera; nómbralos en [`content`](#archivos-fuera-de-la-raíz), como en `content: ["index.html", "src/**/*"]`, o cambia la línea al nombre de la propia carpeta. No se leen `.git/info/exclude` ni un archivo de exclusiones global, y la coincidencia distingue mayúsculas en todos los sistemas, así que todas las máquinas generan la misma hoja de estilos.
- **`node_modules` y `.git`**, a cualquier profundidad. Los archivos de una dependencia nombran clases que ninguna de tus páginas usa.
- **La salida del build de Vite.** `build.outDir` y, en Vite 6 y posteriores, la carpeta de salida de cada entorno, además de la carpeta de caché de Vite. La salida de un build nombra las clases que conservó el último build, así que releerla conservaría una clase que tus fuentes ya no usan. Una carpeta de salida que solo nombra otra configuración, como `dist/server` de un comando `vite build --ssr` aparte, se lee salvo que `.gitignore` la excluya; el `.gitignore` de cada plantilla de create-vite excluye `dist` y `dist-ssr`.
- **Las hojas de estilos**: `.css`, `.scss`, `.sass`, `.less`, `.styl`, `.stylus`, `.pcss`, `.postcss` y `.sss`. El valor de una propiedad también es una palabra, y `border: 1px solid` conservaría `.solid`. El CSS dentro de un archivo `.vue` o `.svelte` se lee con el resto del archivo.
- **Los archivos binarios**, con la regla de git: un archivo con un byte NUL en sus primeros 8000 bytes, salvo que empiece con una marca de orden de bytes UTF-16. Solo se leen esos bytes, así que un vídeo en `public/` no cuesta nada.
- **Las copias de los propios archivos del paquete**, como una hoja de estilos que escribió `chs build` o una copia de la lista de clases del paquete, con las reglas de [Cómo se encuentran las clases](./without-a-bundler.md#cómo-se-encuentran-las-clases). Cada una nombra todas las clases del paquete y conservaría la hoja de estilos entera.

Un enlace a un archivo se lee; un enlace a una carpeta no se sigue, así que un enlace que vuelve sobre sí mismo no puede colgar el escaneo.

Los nombres de clase se encuentran como palabras, igual que los encuentra el comando `chs build`: cuenta una clase escrita completa en cualquier archivo, y una clase que tu código arma al renderizar, como en `` `btn ${tone}` ``, nunca se encuentra. [Cómo se encuentran las clases](./without-a-bundler.md#cómo-se-encuentran-las-clases) explica las reglas y las dos salidas. Una de ellas es más fácil aquí: una lista de clases permitidas es cualquier archivo de texto bajo la raíz, como `stylekit-classes.txt` con un nombre de clase por línea, y el plugin lo lee como el resto, sin opción que configurar. Los diez prefijos de variante, como `md:lg` y `hover:primary`, funcionan como describe [Variantes](./without-a-bundler.md#variantes).

## Archivos fuera de la raíz

La opción `content` añade archivos fuera de la raíz, como una carpeta de componentes compartida en un monorepo. Es la única opción del plugin:

```ts
// apps/web/vite.config.ts
export default defineConfig({
  plugins: [viteStyles({ content: ["../../packages/ui/src/**/*.{vue,ts}"] })],
});
```

Cada entrada es una ruta o un glob, leído desde la raíz de Vite, con las reglas de glob del comando que recoge [Opciones](./without-a-bundler.md#opciones). Los archivos que nombra una entrada se leen aunque un `.gitignore` los excluya, y un `*` o un `**` no entra en una carpeta `node_modules`, así que una biblioteca de componentes que instalas añade sus clases solo cuando la nombras, como en `node_modules/some-ui/dist/**/*.js`. Cada entrada tiene que coincidir con al menos un archivo, o Vite no arranca y la nombra, así que una errata no puede dejar caer en silencio las clases de una carpeta.

## Mientras trabajas

El servidor de desarrollo sigue tus archivos a medida que cambian, sin recargar a mano:

- **Guardar un archivo que nombra una clase nueva** actualiza la hoja de estilos en el sitio. Quitar el último uso de una clase elimina su regla.
- **Crear o borrar un archivo** cuenta como un cambio en sus clases.
- **Guardar un archivo HTML** recarga la página, como hace Vite con el HTML, y la página que recarga recibe la hoja de estilos nueva.
- **Cambiar un `.gitignore`**, bajo la raíz o por encima de ella, vuelve a leer toda la raíz, porque cambia lo que se lee. Un `.gitignore` creado por encima de la raíz mientras Vite se ejecuta se lee en el siguiente arranque.
- **Un archivo que nombra una entrada de `content`** también se sigue, y también un archivo creado en una carpeta en la que lee una entrada.

La hoja de estilos que carga un renderizado en el servidor sigue los mismos cambios, y un build de renderizado en el servidor incrusta la hoja de estilos recortada donde incrusta CSS.

`vite build --watch` sigue los archivos que ha leído. Guardar uno vuelve a generar el build con sus clases, aunque ningún módulo lo importe, como una plantilla HTML que renderiza tu servidor, y borrarlo las quita. Cada nuevo build vuelve a leer el proyecto, así que un archivo creado mientras se ejecuta cuenta desde el siguiente build, que empieza al guardar cualquier archivo que ya sigue. En Vite 8, un cambio que cambia la hoja de estilos genera el build dos veces seguidas, y el segundo build escribe los mismos archivos que el primero.

## Dónde están los archivos recortados

El plugin escribe las hojas de estilos recortadas en la carpeta de caché de Vite, `node_modules/.vite/codenhub-styles/` salvo que tu configuración defina [`cacheDir`](https://vite.dev/config/shared-options.html#cachedir). Es donde Vite guarda sus propios archivos generados, así que tu proyecto ya la deja fuera del control de versiones. Borrarla es seguro: el plugin la vuelve a escribir cuando Vite arranca y, si la borras mientras corre el servidor de desarrollo, cuando reinicias el servidor o guardas un cambio que añade o quita una clase. Las herramientas de desarrollo del navegador muestran la hoja de estilos en su ruta dentro de esa carpeta y no en el paquete.

## Tu propio alias gana

Si tu configuración u otro plugin ya asocia `@codenhub/styles` en `resolve.alias`, por ejemplo a un fork o a una copia propia, ese import conserva tu alias y no se recorta. Vite imprime un aviso al arrancar:

```text
@codenhub/styles/vite: resolve.alias already maps "@codenhub/styles", so that import keeps your alias and is not trimmed; remove the alias to trim it.
```

Quita el alias para recortar el import. Los imports que tu alias no asocia, como una estética, se siguen recortando.

## Requisitos

- **Vite:** 5.0.0 o posterior. El paquete declara Vite como dependencia peer opcional, así que instalar el paquete nunca instala Vite. Un proyecto con Vite 4 o anterior no puede hacer `npm install @codenhub/styles`, aunque nunca cargue el plugin: npm se detiene con `ERESOLVE`, nombrando `peerOptional vite@">=5.0.0"`. Actualiza Vite, o instala con `npm install --legacy-peer-deps`, que desactiva la comprobación de peers de npm para toda esa instalación. pnpm solo avisa.
- **Node.js:** 24 o posterior en la máquina que ejecuta Vite. Vite 5 funciona en Node.js 18, así que el plugin comprueba la versión y falla con un mensaje en lugar de funcionar a medias.
- **Tailwind:** ninguno. Un proyecto que usa Tailwind CSS v4 recorta con el [punto de entrada de código fuente](./tailwind.md) y no necesita el plugin.

## Cuando Vite no arranca

Cada mensaje que imprime el plugin empieza por `@codenhub/styles/vite:`, y un fallo mientras Vite arranca detiene el servidor o el build, así que una errata no puede publicar una hoja de estilos sin tus clases. El mensaje dice qué salió mal y qué hacer:

- **`this plugin needs Node.js 24 or newer; this is Node.js <version>`.** Actualiza Node.js en la máquina que ejecuta Vite.
- **`content must be an array of paths or globs`.** La opción recibió algo que no es una lista de cadenas, como `content: "../shared/**/*.html"`. Pon el glob en una lista, como en `content: ["../shared/**/*.html"]`.
- **`content holds an empty entry`.** Una entrada está vacía o tiene solo espacios, como la que da una variable de entorno sin definir. Quítala, o nombra una ruta o un glob.
- **`content "<entry>" matches no file in <root>`.** La entrada se lee desde la raíz de Vite que nombra el mensaje, que puede no ser la carpeta que contiene el archivo de configuración, así que comprueba la ruta desde ahí. Cuando se conoce una causa más probable, el mensaje la nombra en su lugar: un `*` o un `**` que solo coincidió con archivos dentro de `node_modules`, donde no entra, o un `[` leído como el inicio de un conjunto de caracteres, donde `[[]` coincidiría con el corchete.
- **`content "<entry>" is a folder in <root>, not a file`.** Nombra los archivos que contiene, como en `../shared/**/*`.
- **`cannot read "<path>" (<code>)`.** El plugin no pudo leer un archivo o listar una carpeta, normalmente por sus permisos, con el código de Node.js, como `EACCES`. Generar sin él quitaría sus clases, así que el plugin se detiene. Corrige sus permisos o, como dice el mensaje, añádelo a `.gitignore` cuando está bajo la raíz, o cambia `content` cuando lo nombra una entrada. Un `.gitignore` se lee antes de que se aplique ninguna regla, así que para uno el mensaje dice que lo elimines.
- **`cannot write to "<path>": <reason> (<code>); fix that, or set cacheDir to a folder you can write to`.** El plugin no pudo escribir la hoja de estilos recortada en la carpeta de caché de Vite. `<reason>` y `<code>` son los de Node.js; `EACCES` o `EPERM` significa que no puedes escribir ahí, y `ENOSPC` que el disco está lleno.
- **`a file changed before the plugin read the project; restart Vite`.** Reinicia Vite.

Mientras corre el servidor de desarrollo, un error de un cambio, como una hoja de estilos que no puede escribir, se muestra en la página como Vite muestra sus propios errores. La página conserva la última hoja de estilos escrita, y el siguiente cambio que guardes vuelve a intentar la escritura.

## Comprobar que funciona

Renderiza un elemento con estilo, como en [Integración → Comprobar que funciona](./index.md#comprobar-que-funciona):

```html
<button class="btn primary">Save changes</button>
```

Un botón redondeado relleno del color primario significa que la hoja de estilos se cargó. Para ver el recorte, ejecuta `vite build` y compara el tamaño que imprime para el archivo CSS de `dist/assets/` con el que imprime sin el plugin.

## Siguiente paso

Vuelve al recorrido principal: [Construir una pantalla](../concepts.md) añade la primera tarjeta y el primer formulario a la página de ajustes. Cada clase que añadas ahí llega a la hoja de estilos en cuanto guardas.
