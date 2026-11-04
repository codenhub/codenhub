---
title: Vue
description: Cargar la hoja de estilos en una aplicación Vue / Vite.
order: 3
source: 9cc23f66518b0aa3ce886602f39d05820b2b8bcf
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

## Forzar un tema

Aplica `.dark` o `.light` en el elemento raíz para forzar un tema en lugar de seguir la preferencia del sistema; consulta [Temas → Claro y oscuro](../usage/theming.md#claro-y-oscuro).

## Siguiente paso

Vuelve al camino principal: [Construir una pantalla](../concepts.md) añade la primera tarjeta y el primer formulario a la página de ajustes. [Configuración inicial → Todos los puntos de entrada](../setup.md#todos-los-puntos-de-entrada) enumera todas las demás hojas de estilos que puedes importar.
