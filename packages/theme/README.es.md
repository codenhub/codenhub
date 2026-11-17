<!-- source: 0f9e1f73bd89fb68ad8c92108dab49c6b4ce001f -->

# @codenhub/theme

Modo claro y oscuro para apps del navegador, sin el código repetitivo de siempre. `@codenhub/theme` decide qué tema está activo, recuerda la elección del usuario en `localStorage`, sigue la configuración clara u oscura del sistema operativo hasta que el usuario elige una, mantiene de acuerdo las pestañas abiertas y escribe el resultado en `<html>` para que tu CSS le dé estilo. No tiene dependencias, funciona con cualquier framework o sin ninguno y no incluye CSS: tus hojas de estilos deciden cómo se ve cada tema.

## Instalación

```sh
npm install @codenhub/theme
pnpm add @codenhub/theme
yarn add @codenhub/theme
bun add @codenhub/theme
```

## Uso

Dale estilo a cada tema por su nombre, que el paquete escribe en `<html>` como `data-theme`:

```css
:root,
[data-theme="light"] {
  --background: #ffffff;
  --text: #171717;
}

[data-theme="dark"] {
  --background: #171717;
  --text: #f5f5f5;
}

body {
  background: var(--background);
  color: var(--text);
}
```

Luego crea el gestor una vez, arráncalo y conecta un botón:

```ts
import { createTheme } from "@codenhub/theme";

const theme = createTheme().init();

document.querySelector("#theme-toggle")?.addEventListener("click", theme.toggle);
```

Sin opciones hay dos temas, `light` y `dark`. `init()` aplica la elección guardada del usuario o, si no hay ninguna, la configuración del sistema operativo, y `toggle()` cambia de tema y guarda la elección.

Como este script se ejecuta después de que el navegador pinta por primera vez, un usuario que eligió el oscuro ve por un instante el tema claro al cargar, justo lo único que pidió no ver. Las apps en producción también incrustan en el `<head>` el script de `getPrePaintScript()` para aplicar el tema antes del primer pintado; [Evitar el destello](docs/es/preventing-the-flash.md) explica cómo.

## Documentación

- [Visión general de la documentación](docs/es/index.md): cómo funciona el paquete y un recorrido desde el primer tema hasta la configuración de producción.
- [Primeros pasos](docs/es/getting-started.md): un toggle claro y oscuro que funciona, paso a paso.
- [Evitar el destello](docs/es/preventing-the-flash.md): aplicar el tema antes del primer pintado, en apps estáticas y renderizadas en el servidor.
- [Frameworks](docs/es/frameworks.md): React y Tailwind CSS.
- [Referencia de la API](docs/reference/index.md) (en inglés): cada export con su firma completa.
- [Registro de cambios](docs/changelog/index.md) (en inglés): los cambios de cada versión.

## Requisitos

- Un navegador para aplicar el tema: Chrome 93, Firefox 92, Safari 15.4 o posterior, porque el paquete llama a `Object.hasOwn`. Para navegadores más antiguos, transpila las dependencias y agrega polyfills en tu build. En un servidor, el gestor omite sin errores todo lo que necesita un navegador e informa el tema por defecto.
- Tu propio CSS para cada tema. El paquete escribe en `<html>` el nombre del tema, una clase opcional, `color-scheme` y propiedades personalizadas de CSS opcionales; no incluye estilos.
- TypeScript 5.4 o posterior, si usas TypeScript, por el `NoInfer` del que dependen los tipos.

## Notas

- `createTheme()` valida sus opciones de inmediato y lanza un `Error` que nombra el problema, como un `defaultTheme` que no es uno de tus temas.
- Cuando el navegador bloquea `localStorage`, el paquete registra cada tipo de fallo (lectura, escritura, borrado) una sola vez con `console.error` y sigue funcionando; una elección que no pudo guardar dura hasta que se cierra la página.

## Licencia

Este proyecto tiene licencia [Apache-2.0](LICENSE).
