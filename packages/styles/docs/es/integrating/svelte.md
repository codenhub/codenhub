---
title: Svelte
description: Cargar la hoja de estilos en una aplicación Svelte / SvelteKit.
order: 4
source: 9c8bc0fee69e4b2bf1edd85c784b7df8ff1e883d
---

# Svelte

Svelte y SvelteKit te permiten importar CSS desde cualquier componente, pero el reset y los tokens del paquete deberían cargarse una vez, antes de que se renderice cualquier componente. Esta página muestra dónde va ese único import en SvelteKit y en una aplicación Svelte simple.

## Importar la hoja de estilos

**SvelteKit**: importa desde el layout raíz para que se cargue una vez para todas las rutas:

```svelte
<!-- src/routes/+layout.svelte -->
<script>
  import "@codenhub/styles";
  let { children } = $props();
</script>

{@render children()}
```

**Svelte simple + Vite**: importa en su lugar desde el archivo de entrada:

```ts
// main.ts
import "@codenhub/styles";
import { mount } from "svelte";
import App from "./App.svelte";

mount(App, { target: document.getElementById("app")! });
```

¿Usas Tailwind CSS v4? Importa en su lugar `@codenhub/styles/tw` desde la entrada CSS de la aplicación; consulta [Tailwind CSS v4](./tailwind.md).

## Forzar un tema

Aplica `.dark` o `.light` en `<html>` (edita `src/app.html` en SvelteKit) para forzar un tema en lugar de seguir la preferencia del sistema; consulta [Temas → Claro y oscuro](../usage/theming.md#claro-y-oscuro).

## Siguiente paso

Vuelve al camino principal: [Construir una pantalla](../concepts.md) añade la primera tarjeta y el primer formulario a la página de ajustes. [Configuración inicial → Todos los puntos de entrada](../setup.md#todos-los-puntos-de-entrada) enumera todas las demás hojas de estilos que puedes importar.
