<!-- source: 7414f5d5ff9350ff0874ac597ab5f113a3e4da61 -->

# @codenhub/styles

Construye una interfaz coherente y con temas escribiendo nombres de clase sobre HTML normal: una hoja de estilos con tokens, un reset, helpers de layout y de tipografía, y clases para botones, campos de formulario, alertas, tarjetas, tablas y tooltips. No hay JavaScript que cargar ni una librería de componentes que envolver.

## Instalación

```sh
pnpm add @codenhub/styles
```

## Uso

Importa la hoja de estilos compilada, que contiene todo lo que incluye el paquete:

```css
@import "@codenhub/styles";
```

```html
<form class="card stack">
  <h2 class="text-title-sm">Profile</h2>
  <div class="field">
    <label class="label" for="display-name">Display name</label>
    <input class="ipt" id="display-name" name="display-name" />
  </div>
  <button class="btn primary" type="submit">Save changes</button>
</form>
```

Para usar en su lugar los puntos de entrada de código fuente de Tailwind CSS v4, o para cargar solo una parte del paquete, consulta [Configuración inicial](./docs/es/setup.md). En un proyecto Vite, el [plugin de Vite](./docs/es/integrating/vite.md) del paquete recorta ese mismo import a las clases que usan tus páginas. La [demo](https://demo.codenhub.dev/styles/) muestra cada componente en cada intención, presentación y estética.

## Documentación

La documentación construye una pantalla de ajustes de cuenta de principio a fin, en este orden:

- [Introducción](./docs/es/index.md): para qué sirve el paquete, qué cuesta y en qué orden leer.
- [Configuración inicial](./docs/es/setup.md): instala el paquete, elige entre CSS compilado o código fuente de Tailwind y renderiza la estructura base de la página.
- [Integración](./docs/es/integrating/index.md): carga la hoja de estilos en Next.js, Vue, Svelte, Astro, Tailwind CSS v4, Vite o en una página sin bundler.
- [Construir una pantalla](./docs/es/concepts.md): maqueta la página y aprende qué son la intención, el relleno, el borde y la estética.
- [Uso](./docs/es/usage/index.md): guías de botones, formularios, feedback, tooltips, temas, estéticas y clases solo, y después las páginas de consulta con cada clase, token y valor por defecto.
- [Accesibilidad](./docs/es/accessibility.md): lo que el CSS hace por tus usuarios y lo que tu aplicación todavía les debe.
- [Changelog](./docs/changelog/index.md): historial de versiones, incluidos los cambios incompatibles.

## Requisitos

| Requisito      | Detalles                                                                                                                                                                                                                                                                |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Imports de CSS | Las herramientas del proyecto deben resolver los imports de CSS de paquetes.                                                                                                                                                                                            |
| Navegadores    | Chrome 123, Safari 17.5 o Firefox 128 y posteriores (`light-dark()` para los temas; `:has()` para el estado de `.input-group`; `@property` para una elevación que no se hereda).                                                                                        |
| Tailwind CSS   | 4.3.2 o posterior, por debajo de 5, solo para los puntos de entrada de código fuente `/tw`. Instálalo tú; el paquete no lo instala.                                                                                                                                     |
| Vite           | 5.0.0 o posterior, solo para el plugin de Vite. Es un peer opcional, así que npm rechaza la instalación con Vite 4 o anterior, aunque no se use el plugin.                                                                                                              |
| Node.js        | 24 o posterior en la máquina que ejecuta el comando `chs build` o el plugin de Vite. Las hojas de estilos no lo necesitan, pero el paquete lo declara como su engine, así que Yarn 1, y npm o pnpm con `engine-strict`, rechazan la instalación en un Node.js anterior. |
| Accesibilidad  | Tu proyecto aporta el HTML semántico, ARIA, el comportamiento de teclado y la gestión del foco.                                                                                                                                                                         |

## Notas

Este paquete no tiene comportamiento en JavaScript. No incluye alias de compatibilidad: una clase o un token eliminado se documenta en el [changelog](./docs/changelog/index.md), no se conserva con un segundo nombre. Por debajo de 1.0, una versión menor puede romper la compatibilidad y una versión de parche nunca lo hace; consulta [Versionado](./docs/es/index.md#versionado).

## Licencia

Este proyecto tiene licencia [Apache-2.0](LICENSE). Los valores del tema, el Preflight y los registros de propiedades de Tailwind, incluidos en las hojas de estilos compiladas de `dist/`, y los registros de propiedades de `tw/theme.css` provienen de [Tailwind CSS](https://tailwindcss.com) (MIT). Las marcas de checkbox incrustadas derivan de los iconos `check` y `minus` de [Lucide](https://lucide.dev) (ISC), que Lucide deriva de [Feather](https://github.com/feathericons/feather) (MIT). Consulta [NOTICE](NOTICE) para los avisos obligatorios. Cada hoja de estilos de `dist/` y de `tw/` que contiene las marcas los lleva en un comentario `/*!`, pero la mayoría de los bundlers quitan ese comentario en cuanto el CSS del paquete no es lo primero de la salida, tanto con los puntos de entrada compilados como con `/tw`: Vite 8 lo hace cuando otra hoja de estilos se importa antes que la del paquete, el `--minify` de la CLI de Tailwind lo hace después de `@import "tailwindcss"`, y Next.js 16 con Turbopack lo hace en su chunk. Así que una compilación que incluya el checkbox debe conservar los avisos por otra vía. Lo más sencillo es servir `NOTICE` con tu app, por ejemplo copiando `node_modules/@codenhub/styles/NOTICE` a tu carpeta pública, o añadir su texto a la página de licencias de tu app. `LICENSE` termina con los mismos avisos, así que el `build.license` de Vite, que lista el `LICENSE` de cada paquete, los lleva. En Vite, `build.cssMinify: false` deja el comentario donde está, a cambio de dejar tu propio CSS sin minificar; el del paquete ya viene minificado.
