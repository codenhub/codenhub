---
title: Frameworks
description: "Usa el gestor en React con useSyncExternalStore, con renderizado en el servidor y con la variante dark: de Tailwind CSS."
order: 6
source: b1514205f8aa3f3b6fe55d0ec68db0e1b2ea5b08
---

# Frameworks

El paquete no tiene un adaptador para cada framework porque no lo necesita: un gestor es un objeto común, y sus métodos se pueden pasar como callbacks a cualquier parte. Un paquete menos que mantener al día con la próxima versión mayor de tu framework. Esta página muestra los patrones para React y para Tailwind CSS. Las mismas ideas sirven en otros frameworks: crea un gestor para la página, arráncalo una vez en el navegador y suscríbete a él dondequiera que la UI muestre el tema.

## React

### Un solo gestor para toda la app

Crea el gestor una vez, en su propio módulo, e impórtalo donde lo necesites. No lo crees dentro de un componente: cada render crearía uno nuevo, cada uno con sus propios listeners, y te enterarías por el profiler de memoria.

```ts
// src/theme.ts
import { createTheme } from "@codenhub/theme";

import { themeOptions } from "./theme-options";

export const theme = createTheme(themeOptions).init();
```

En una app que solo se ejecuta en el navegador, como una construida con Vite, está bien llamar a `init()` ahí mismo. Las apps renderizadas en el servidor lo arrancan de otra forma; consulta [Con renderizado en el servidor](#con-renderizado-en-el-servidor) más abajo.

### Mostrar el tema activo en un componente

React vuelve a renderizar un componente cuando cambian sus datos solo si se entera del cambio. `useSyncExternalStore` conecta React con una fuente externa como el gestor: `theme.subscribe` le dice a React cuándo volver a leer, y `theme.get` es lo que lee. `get()` devuelve el mismo objeto `ActiveTheme` hasta que cambia el tema, que es exactamente lo que React espera. Un getter que devolviera un objeto nuevo cada vez mandaría a React a un bucle de renders, y React te lo diría en rojo.

```tsx
import { useSyncExternalStore } from "react";

import { theme } from "./theme";

export function useActiveTheme() {
  return useSyncExternalStore(theme.subscribe, theme.get);
}

export function ThemeToggle() {
  const active = useActiveTheme();
  return (
    <button type="button" onClick={theme.toggle}>
      {active.colorScheme === "dark" ? "Cambiar a claro" : "Cambiar a oscuro"}
    </button>
  );
}
```

### Con renderizado en el servidor

En una app renderizada en el servidor, como Next.js o Remix, el mismo módulo también se ejecuta en el servidor, donde no hay nada que arrancar, y React renderiza la página por primera vez en el navegador **hidratando** el HTML del servidor: espera que el primer render en el navegador coincida con lo que renderizó el servidor.

Dos cambios resuelven eso. Arranca el gestor desde un efecto, que solo se ejecuta en el navegador, y dale a `useSyncExternalStore` un tercer argumento, `getServerSnapshot`, que devuelva el tema con el que renderizó el servidor:

```tsx
// src/theme.ts
import { createTheme } from "@codenhub/theme";
import { useSyncExternalStore } from "react";

import { themeOptions } from "./theme-options";

export const theme = createTheme(themeOptions);

// Se toma antes de init(), así que es el tema por defecto, el que renderiza el servidor.
const serverSnapshot = theme.get();

export function useActiveTheme() {
  return useSyncExternalStore(theme.subscribe, theme.get, () => serverSnapshot);
}
```

```tsx
// En tu componente cliente raíz:
useEffect(() => {
  theme.init();
}, []);
```

Así la hidratación renderiza el tema por defecto, igual que el servidor, y el componente se actualiza al tema del usuario justo después de que se ejecuta `init()`. La página en sí nunca muestra los colores equivocados: el [script previo al pintado](preventing-the-flash.md) ya aplicó el tema correcto a `<html>`, y solo los componentes que leen `useActiveTheme()` ven el tema por defecto por un instante. Llamar a `init()` más de una vez no hace nada después de la primera llamada, así que la doble ejecución de efectos de React en desarrollo es inofensiva.

Si en cambio tu servidor resuelve el tema en cada petición, por ejemplo a partir de una cookie, renderiza con ese tema, así que `getServerSnapshot` debe devolver ese mismo tema, enviado al navegador junto con la página.

### Limpieza

Un gestor creado una vez para toda la página vive lo que vive la página y no necesita limpieza: el navegador limpia cuando se cierra la pestaña. Un gestor que pertenece a algo de vida más corta, como un componente que se monta y se desmonta o un test, debe detenerse con `destroy()`:

```tsx
useEffect(() => {
  const theme = createTheme(options).init();
  return () => theme.destroy();
}, []);
```

Mantén un solo gestor arrancado por página. Dos se turnarían para escribir en `<html>`, y cada uno creería que su tema es el que se ve.

`destroy()` deja de escuchar al sistema operativo y a las otras pestañas, quita todos los suscriptores y descarta las sobrescrituras de tokens. Deja `<html>` y la elección guardada como están, así que la página no cambia cuando el componente se desmonta. Pasa `{ revertDom: true }` para quitar además el atributo, las clases, `color-scheme` y las propiedades de tokens que escribió el gestor, sin dejar rastro. Un gestor destruido se puede volver a arrancar con `init()`.

## Tailwind CSS

La variante `dark:` de Tailwind, como en `class="bg-white dark:bg-black"`, aplica sus estilos cuando decide que la página está en oscuro. Define `darkClass: true`, y el paquete agrega una clase `dark` a `<html>` siempre que el `colorScheme` del tema activo sea `"dark"`:

```ts
const theme = createTheme({ darkClass: true }).init();
```

Luego dile a Tailwind que busque esa clase en lugar de la configuración del sistema operativo, que es lo que usa por defecto. En Tailwind CSS v4, agrega esto a tu archivo CSS principal:

```css
@import "tailwindcss";

@custom-variant dark (&:where(.dark, .dark *));
```

En Tailwind CSS v3, configúralo en `tailwind.config.js`:

```js
export default {
  darkMode: "class",
  // …el resto de tu configuración
};
```

Como la clase `dark` sigue a `colorScheme` y no al nombre del tema, cada tema oscuro que definas, como un tema `dim`, también recibe los estilos `dark:`. Una sola variante `dark:` cubre todos los temas oscuros, así que un tema oscuro nuevo no significa otra pasada por cada componente. `darkClass` funciona junto con `className`, así que `<html>` puede llevar a la vez `dark` y `theme-dim`, para el CSS personalizado que solo necesita el tema `dim`.

A continuación, [Solución de problemas](troubleshooting.md) reúne los problemas más frecuentes.
