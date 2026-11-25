---
title: Vue
description: Cargar la hoja de estilos en una aplicación Vue / Vite.
order: 3
source: 7d4ebf5802e552d16b046796756c807ee9baa159
---

# Vue

Vue no pone ninguna restricción sobre desde dónde se importa el CSS, pero importarlo una vez, desde el archivo de entrada de la aplicación, evita que el reset y los tokens se carguen más de una vez y garantiza que estén listos antes de que se renderice cualquier componente.

## Importar la hoja de estilos

```ts
// main.ts
import "@codenhub/styles";
import { createApp } from "vue";
import App from "./App.vue";

createApp(App).mount("#app");
```

¿Usas Tailwind CSS v4? Importa `@codenhub/styles/tw` desde un archivo CSS de entrada en lugar de `main.ts`, con el plugin `@tailwindcss/vite`; consulta [Tailwind CSS v4](./tailwind.md).

¿No usas Tailwind? El import de arriba incluye todas las clases. Añade el [plugin de Vite](./vite.md) del paquete a `vite.config.ts` y el mismo import incluye solo las clases que usan tus archivos `.vue` y el resto del proyecto.

## Forzar un tema

Aplica `data-theme="light"` o `data-theme="dark"` en `<html>`, en `index.html`, para forzar un tema en lugar de seguir la preferencia del sistema; consulta [Temas → Claro y oscuro](../usage/theming.md#claro-y-oscuro).

## Siguiente paso

Vuelve al camino principal: [Construir una pantalla](../concepts.md) añade la primera tarjeta y el primer formulario a la página de ajustes. [Configuración inicial → Todos los puntos de entrada](../setup.md#todos-los-puntos-de-entrada) enumera todas las demás hojas de estilos que puedes importar.
