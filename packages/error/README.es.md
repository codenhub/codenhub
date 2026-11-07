<!-- source: 736e4ede3d33716e688ebb49dae4a39535510100 -->

# @codenhub/error

Convierte cualquier cosa que atrape tu código TypeScript en un único `AppError` predecible. Cada uno trae un mensaje que se puede mostrar sin riesgo, una clave de traducción, un código para ramificar, un flag que dice si reintentar es seguro y el valor original guardado para tus logs. Describes una sola vez, en un registro, los fallos que conoces, y los presets opcionales cubren fallos comunes del navegador, de Node.js, de HTTP y de Supabase. También incluye helpers de resultados para el código que prefiere devolver los fallos en lugar de lanzarlos.

En resumen: `catch` te da `unknown`, y esto te da algo que de verdad le puedes mostrar a una persona.

## Instalación

```sh
pnpm add @codenhub/error
```

## Uso

Describe tus fallos una vez, cuando arranca la aplicación, y después normaliza lo que sea que atrapes:

```ts
import { createAppError, getErrorRegistry } from "@codenhub/error";
import { browserErrorRegistry } from "@codenhub/error/registries/browser";

const registry = getErrorRegistry();

registry.merge(browserErrorRegistry);
registry.codes.add("project.limit_reached", {
  message: "Llegaste al límite de proyectos de tu plan. Archiva un proyecto y vuelve a intentarlo.",
  messageKey: "error.project.limitReached",
});

try {
  await createProject(draft);
} catch (caught) {
  const error = createAppError(caught);

  showToast(error.message);
}
```

Un fallo que nadie registró se convierte en `type: "unknown"` con el mensaje `"An unexpected error occurred."`, nunca en su texto crudo. Tus clientes no tienen por qué aprenderse los nombres de tus tablas.

## Documentación

- [Visión general](docs/es/index.md): para qué sirve el paquete, un recorrido de cinco minutos y el orden de lectura.
- [Primeros pasos](docs/es/getting-started.md): configura una aplicación real paso a paso.
- [El AppError](docs/es/app-error.md): cada campo, y cómo enviar un error de un servidor a un cliente.
- [Registros](docs/es/registries.md) y [Presets](docs/es/presets.md): cómo se reconocen los fallos, y cada fallo que conocen los presets.
- [Resultados](docs/es/results.md): `Result`, `attempt` y los helpers que los encadenan.
- [Error boundaries](docs/es/frameworks.md): fallbacks de React y Svelte que muestran un error normalizado.
- [Recetas](docs/es/recipes.md): estados HTTP, Supabase, reintentos, traducciones, reporte de errores y pruebas.
- [Salvedades y limitaciones](docs/es/caveats.md): lo que el paquete no hace, y cómo arreglártelas.
- [Referencia de la API](docs/reference/index.md) (en inglés): cada export, generado a partir del código fuente.
- [Registro de cambios](docs/changelog/index.md) (en inglés): qué cambió en cada versión.

## Requisitos

- Node.js 24 o posterior, o un navegador, worker o runtime de edge compatible con ES2022 que soporte de forma nativa `cause` en `Error`.
- ESM. El código CommonJS puede cargarlo con `require()` en los runtimes que permiten hacer `require` de módulos ES.
- Sin dependencias en runtime, y sin acceso a globales del navegador ni de Node.js.
- El adaptador de React necesita React 18 o posterior, y el de Svelte necesita Svelte 5.3 o posterior. Ambos son peer dependencies opcionales.

## Notas

- Los presets no cambian nada hasta que los fusionas, y el último mapeo que se agrega para un identificador es el que gana.
- El registro global es estado compartido del módulo: configúralo una vez al arrancar, no en cada solicitud.
- `isRetryable` significa que repetir la llamada que falló no puede hacer que se ejecute dos veces, no que un reintento vaya a funcionar probablemente. Reintenta solo alrededor de la llamada que falló.
- Los valores de `messageKey` integrados son estables; el paquete solo trae mensajes en inglés.

## Licencia

Este proyecto tiene licencia [Apache-2.0](LICENSE).
