---
title: Astro
description: Cargar la hoja de estilos en una aplicación Astro.
order: 5
source: fe78710084a56e3e2d4bf199b4b00f729f04016b
---

# Astro

Astro renderiza los componentes de forma estática por defecto, pero el import de una hoja de estilos global sigue necesitando hacerse una sola vez: desde un layout compartido, no desde páginas o islas individuales.

## Importar la hoja de estilos

```astro
---
// src/layouts/Layout.astro
import "@codenhub/styles";
---

<html lang="en">
  <body>
    <slot />
  </body>
</html>
```

Cada página que usa este layout carga la hoja de estilos una vez. La plantilla mínima de Astro no crea ningún layout; si tu proyecto no tiene uno, crea este y envuelve tus páginas en él.

¿Usas Tailwind CSS v4? Configúralo con `npx astro add tailwind`, que añade el plugin `@tailwindcss/vite` y un `src/styles/global.css`. Sustituye el `@import "tailwindcss"` de ese archivo por `@import "@codenhub/styles/tw"`, e importa el archivo en el layout en lugar de `@codenhub/styles`:

```astro
---
// src/layouts/Layout.astro
import "../styles/global.css";
---
```

Consulta [Tailwind CSS v4](./tailwind.md), incluido cuándo hace falta realmente un `@source` explícito.

## Forzar un tema

Aplica `.dark` o `.light` en `<html>` para forzar un tema en lugar de seguir la preferencia del sistema; consulta [Temas → Claro y oscuro](../usage/theming.md#claro-y-oscuro).

## Siguiente paso

Vuelve al camino principal: [Construir una pantalla](../concepts.md) añade la primera tarjeta y el primer formulario a la página de ajustes. [Configuración inicial → Todos los puntos de entrada](../setup.md#todos-los-puntos-de-entrada) enumera todas las demás hojas de estilos que puedes importar.
