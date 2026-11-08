---
title: Error boundaries
description: Muestra un AppError normalizado cuando un componente de React o Svelte falla al renderizar, y repórtalo una sola vez.
order: 6
source: 7c089a14a60e0e6aa8332a148059264556b71cce
---

# Error boundaries

Cuando un componente lanza una excepción mientras se renderiza, React y Svelte reemplazan la parte rota de la página por un fallback que escribes tú. El valor que le pasan a ese fallback es lo que sea que se haya lanzado, así que un fallback que muestra `error.message` le filtra texto crudo a quien lee. Esta página cubre los dos adaptadores que lo resuelven: primero normalizan el valor atrapado en un `AppError`, así que el fallback muestra un mensaje que se puede mostrar sin riesgo, y tu tracker de errores igual recibe el valor original.

Usan el mismo registro y las mismas opciones que `createAppError`, así que no hay nada nuevo que configurar.

Cada adaptador es su propio punto de entrada. El framework es una peer dependency opcional: instala el paquete junto al framework que ya usas, y no viene nada más con él.

| Ruta de importación      | Qué contiene                                       | Necesita               |
| ------------------------ | -------------------------------------------------- | ---------------------- |
| `@codenhub/error/react`  | El componente `AppErrorBoundary`                   | React 18 o posterior   |
| `@codenhub/error/svelte` | `createAppErrorBoundary`, para `<svelte:boundary>` | Svelte 5.3 o posterior |

## React

`AppErrorBoundary` es un componente error boundary. Renderiza sus hijos hasta que uno de ellos lanza una excepción, y entonces renderiza `fallback` con el error normalizado y una función `reset`. Aquí protege la página de proyecto del gestor de proyectos:

```tsx
import { AppErrorBoundary } from "@codenhub/error/react";

export function ProjectPage({ id }: { id: string }) {
  return (
    <AppErrorBoundary
      fallback={({ error, reset }) => (
        <div role="alert">
          <p>{error.message}</p>
          <button onClick={reset}>Reintentar</button>
        </div>
      )}
      onError={(error, info) => tracker.captureException(error.originalError ?? error, { extra: info })}
      resetKeys={[id]}
    >
      <Project id={id} />
    </AppErrorBoundary>
  );
}
```

| Prop        | Qué hace                                                                                                                             |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `fallback`  | Obligatoria. Se renderiza en lugar de los hijos, con `{ error, reset }`.                                                             |
| `onError`   | Se llama una vez por cada error atrapado, después de que se renderiza el fallback, con el mismo `AppError` y el error info de React. |
| `options`   | Opciones de normalización, como en `createAppError`: `registry`, `fallbackMessage` y las demás.                                      |
| `resetKeys` | Valores que reinician el boundary cuando alguno cambia, comparados con `Object.is`, como la ruta o un id.                            |
| `onReset`   | Se llama cuando el boundary se reinicia, mediante `reset` o por un cambio en `resetKeys`.                                            |

Los tipos de las props se exportan como `AppErrorBoundaryProps`, y el objeto que recibe `fallback` como `AppErrorBoundaryFallbackProps`, para cuando envuelvas el boundary en un componente propio.

Algunos detalles que vale la pena conocer:

- **Las `options` solo se revisan cuando se atrapa un error.** Una opción inválida lanza entonces una excepción mientras se renderiza el fallback, así que el boundary de arriba recibe un `TypeError` en lugar del error original, y `onError` no se llama. Prueba las opciones con `createAppError` en una prueba para detectarlo antes de que lo haga una caída del servicio.
- **`reset` vuelve a renderizar los hijos.** Si lo que los hizo fallar no cambió, vuelven a lanzar y el fallback reaparece al instante. Reinicia después de que cambie el estado que causó el fallo, o deja que `resetKeys` lo haga cuando quien lee navega. En el ejemplo de arriba, abrir otro proyecto reinicia el boundary. Un cambio de clave solo reinicia un error que ya estaba en pantalla: cuando lo que lanza es abrir el proyecto en sí, aparece el fallback y se queda, en lugar de que el boundary se reinicie directo hacia el mismo fallo y lo reporte dos veces. `reset` no es un reintento de una llamada fallida, y no depende de `isRetryable`, que trata de llamadas, no de renderizados.
- **El fallback y `onError` reciben la misma instancia de `AppError`,** así que lo que ve quien lee y lo que reportas siempre coinciden.
- **Lanzar `null` o `undefined` también cuenta como error.** Lanzarlos es JavaScript válido, aunque no sea buena idea, y el boundary igual muestra el fallback con el mensaje genérico.

## Svelte

Svelte 5 trae `<svelte:boundary>` integrado. `createAppErrorBoundary` devuelve las dos piezas que necesita: un handler `onerror`, y una función `toAppError` para el snippet `failed`.

```svelte
<script>
  import { createAppErrorBoundary } from "@codenhub/error/svelte";

  const boundary = createAppErrorBoundary({
    options: { fallbackMessage: "No se pudo cargar este proyecto." },
    onError: (error) => tracker.captureException(error.originalError ?? error),
  });
</script>

<svelte:boundary onerror={boundary.onerror}>
  <Project />

  {#snippet failed(error, reset)}
    <div role="alert">
      <p>{boundary.toAppError(error).message}</p>
      <button onclick={reset}>Reintentar</button>
    </div>
  {/snippet}
</svelte:boundary>
```

`createAppErrorBoundary` recibe un `AppErrorBoundaryConfig` y devuelve `AppErrorBoundaryHandlers`:

- **`options`** son las opciones de normalización, como en `createAppError`. Un valor inválido lanza una excepción cuando llamas a `createAppErrorBoundary`, no cuando llega el primer error, así que falla mientras se configura el componente y no en plena caída del servicio. Eso sí, un nombre de opción mal escrito se ignora, igual que en `createAppError`.
- **`onError`** recibe el `AppError` y el `reset` del boundary, una vez por cada error atrapado. Pasar algo que no es una función lanza `TypeError` de inmediato.
- **`toAppError`** devuelve la misma instancia de `AppError` para el error que vio `onerror`, así que el snippet y el reporte coinciden.

Crea un juego de handlers por cada boundary: cada uno recuerda el último error que normalizó. El helper no importa Svelte; solo sigue la forma con la que lo llama el boundary.

## Lo que un boundary no atrapa

Ambos frameworks atrapan los errores que se lanzan durante el renderizado y durante la ejecución de efectos, y React también atrapa los que se lanzan en los métodos del ciclo de vida. Ninguno atrapa un error lanzado en un manejador de eventos, en un `setTimeout` o en una promesa que nadie esperó durante el renderizado, y los boundaries de React no se ejecutan durante el renderizado en el servidor. Maneja esos casos donde ocurren, con `attempt` o `attemptAsync`:

```ts
import { attemptAsync } from "@codenhub/error";

async function save() {
  const result = await attemptAsync(() => api.saveProject(draft));

  if (!result.ok) {
    showToast(result.error.message);
  }
}
```

Para un fallo de la página completa en un framework con su propia página de error, como un `+error.svelte` de SvelteKit o un `error.tsx` de Next.js, llama a `createAppError` con el error que recibe esa página.

## Siguiente

Con eso ya viste todas las piezas del paquete. [Recetas](recipes.md) las combina en soluciones completas para problemas con los que te vas a topar tarde o temprano: estados HTTP, llamadas a Supabase, reintentos, traducciones, reporte de errores y pruebas.
