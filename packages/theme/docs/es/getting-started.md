---
title: Primeros pasos
description: Instala el paquete y construye un toggle claro y oscuro que recuerda la elección del usuario.
order: 1
source: eca118a71bac8067e11fe04becde446f68807303
---

# Primeros pasos

Esta página construye lo más pequeño que ya sirve para algo: una página con un tema claro y uno oscuro, y un botón que cambia entre ellos. Cinco pasos, y el botón ya recordará la elección del usuario y seguirá a su sistema operativo. Supone un proyecto con un bundler, como [Vite](https://vite.dev/), que resuelve las sentencias `import` desde `node_modules`.

## 1. Instala el paquete

Instálalo con el gestor de paquetes de tu proyecto:

```sh
npm install @codenhub/theme
```

```sh
pnpm add @codenhub/theme
```

```sh
yarn add @codenhub/theme
```

```sh
bun add @codenhub/theme
```

## 2. Escribe el CSS de cada tema

El paquete escribe el nombre del tema en `<html>`, como `data-theme="light"` o `data-theme="dark"`, junto con la propiedad `color-scheme` y, por defecto, una clase `theme-<name>` que coincide. Tu hoja de estilos le da a cada nombre su aspecto. Las propiedades personalizadas de CSS lo mantienen breve: define los colores una vez por tema y úsalos en todas partes.

```css
/* styles.css */
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

`:root` le da a la página los colores claros antes de que se aplique cualquier tema, así que nunca se renderiza sin colores.

## 3. Agrega un botón

Cualquier elemento sirve. Este tiene un `id` para que el script pueda encontrarlo:

```html
<button id="theme-toggle" type="button">Cambiar tema</button>
```

Su texto es su nombre accesible. Si más adelante cambias el texto por un icono de sol o de luna, como tarde o temprano hace toda app, agrega un `aria-label` para que los lectores de pantalla sigan oyendo algo más útil que "botón".

## 4. Crea el gestor de temas

```ts
// main.ts
import { createTheme } from "@codenhub/theme";

import "./styles.css";

const theme = createTheme().init();

document.querySelector("#theme-toggle")?.addEventListener("click", theme.toggle);
```

Aquí pasan tres cosas:

- `createTheme()` crea un **gestor de temas**, el objeto dueño del tema activo. Sin opciones, conoce dos temas, `light` y `dark`. Crearlo todavía no cambia nada en la página.
- `.init()` lo arranca. Elige el tema que se muestra, la elección guardada del usuario o, si no hay, la configuración del sistema operativo, lo aplica a `<html>` y empieza a escuchar los cambios del sistema. Devuelve el mismo gestor, así que las dos llamadas se encadenan.
- `theme.toggle` cambia al otro tema y guarda la elección. Cada método del gestor se puede pasar solo como callback, como aquí, sin envolverlo en una arrow function. Ningún `this` salió herido.

El tipo del gestor se exporta como `Theme`, para cuando necesites nombrarlo, por ejemplo en una función que recibe el gestor como parámetro.

## 5. Pruébalo

Abre la página y haz clic en el botón: los colores cambian. Ahora recarga la página. El tema que elegiste sigue ahí, porque `toggle()` lo guardó en `localStorage`.

Para ver la parte del sistema operativo, borra la elección guardada ejecutando esto en la consola del navegador:

```js
localStorage.removeItem("app-theme-preference");
```

Recarga y luego cambia tu sistema entre el modo claro y el oscuro. Sin una elección guardada, la página lo sigue, sin necesidad de recargar.

## Lo que tienes y lo que sigue

Ya tienes un cambio de tema que funciona. Todavía faltan dos cosas para una app en producción:

- **Un destello al cargar.** Tu script se ejecuta después de que el navegador ya pintó la página una vez, así que un usuario que eligió el oscuro recibe primero un breve destello claro, en cada visita. [Evitar el destello](preventing-the-flash.md) lo arregla con un pequeño script inline.
- **La limpieza**, si el gestor vive dentro de un componente que puede desmontarse. Llama a `theme.destroy()` en su limpieza para detener los listeners del gestor. Un gestor creado una sola vez para toda la página, como el de arriba, nunca la necesita. [Frameworks](frameworks.md#limpieza) muestra dónde va en React.

A continuación, [Definir temas](themes.md) convierte el toggle en una pantalla de ajustes con temas propios.
