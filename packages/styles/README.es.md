<!-- source: 28634ba660bf4846ac6db6982468d92e43a1a579 -->

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

Para usar en su lugar los puntos de entrada de código fuente de Tailwind CSS v4, o para cargar solo una parte del paquete, consulta [Configuración inicial](./docs/es/setup.md). La [demo](https://demo.codenhub.dev/styles/) muestra cada componente en cada intención, presentación y estética.

## Documentación

La documentación construye una pantalla de ajustes de cuenta de principio a fin, en este orden:

- [Introducción](./docs/es/index.md): para qué sirve el paquete, qué cuesta y en qué orden leer.
- [Configuración inicial](./docs/es/setup.md): instala el paquete, elige entre CSS compilado o código fuente de Tailwind y renderiza la estructura base de la página.
- [Integración](./docs/es/integrating/index.md): carga la hoja de estilos en Next.js, Vue, Svelte, Astro, Tailwind CSS v4 o en una página sin bundler.
- [Construir una pantalla](./docs/es/concepts.md): maqueta la página y aprende qué son la intención, el relleno, el borde y la estética.
- [Uso](./docs/es/usage/index.md): guías de botones, formularios, feedback, tooltips, temas, estéticas y clases solo, y después las páginas de consulta con cada clase, token y valor por defecto.
- [Accesibilidad](./docs/es/accessibility.md): lo que el CSS hace por tus usuarios y lo que tu aplicación todavía les debe.
- [Changelog](./docs/changelog/index.md): historial de versiones, incluidos los cambios incompatibles.

## Requisitos

| Requisito      | Detalles                                                                                                                                                                                                                                             |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Imports de CSS | Las herramientas del proyecto deben resolver los imports de CSS de paquetes.                                                                                                                                                                         |
| Navegadores    | Chrome 123, Safari 17.5 o Firefox 128 y posteriores (`light-dark()` para los temas; `:has()` para el estado de `.input-group`; `@property` para una elevación que no se hereda).                                                                     |
| Tailwind CSS   | 4.3.2 o posterior, por debajo de 5; solo es necesario para los puntos de entrada de código fuente `/tw` y el comando `codenhub-styles build`, que además necesita `@tailwindcss/cli` en el mismo rango. Instala ambos tú; el paquete no los instala. |
| Node.js        | 24 o posterior, solo en la máquina que ejecuta el comando `codenhub-styles build`. Las hojas de estilos no lo necesitan.                                                                                                                             |
| Accesibilidad  | Tu proyecto aporta el HTML semántico, ARIA, el comportamiento de teclado y la gestión del foco.                                                                                                                                                      |

## Notas

Este paquete no tiene comportamiento en JavaScript. No incluye alias de compatibilidad: una clase o un token eliminado se documenta en el [changelog](./docs/changelog/index.md), no se conserva con un segundo nombre. Por debajo de 1.0, una versión menor puede romper la compatibilidad y una versión de parche nunca lo hace; consulta [Versionado](./docs/es/index.md#versionado).

## Licencia

Este proyecto tiene licencia [Apache-2.0](LICENSE). Las marcas de checkbox incrustadas derivan de los iconos `check` y `minus` de [Lucide](https://lucide.dev) (ISC), que Lucide deriva de [Feather](https://github.com/feathericons/feather) (MIT). Consulta [NOTICE](NOTICE) para los avisos obligatorios.
