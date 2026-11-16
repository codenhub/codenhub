---
title: API de JavaScript
description: El registro, los renderizadores, la carga de familias bajo demanda y el adaptador para conjuntos de iconos de terceros.
order: 4
source: f64af0b24b731dc3d6c97dffc8ae37139abafe9b
---

# API de JavaScript

Los plugins de Tailwind, Vite y PostCSS son envoltorios ligeros sobre un conjunto pequeño de helpers exportados. Acude a estas funciones directamente cuando generes CSS o SVG fuera de un bundler, cargues familias de iconos de forma diferida en tiempo de ejecución, animes iconos desde eventos de la aplicación o prepares un `IconRegistry` preconfigurado para que lo reutilice un plugin.

```ts
import { generateIconSetCss, getIconCssProps, IconRegistry, renderSvg } from "@codenhub/icons";
import lucide from "@codenhub/icons/data/lucide";

const registry = new IconRegistry({ defaultPrefix: "lucide" });
registry.registerFamily(lucide);

const heart = registry.resolve("lucide:heart");
renderSvg(heart!, { strokeWidth: 1.5 });

const { css, families } = generateIconSetCss(["ic-lucide-heart", "ic-lucide-heart/1.5"], registry);

getIconCssProps("lucide:x", registry);
// { "--ic-uri": 'url("data:image/svg+xml;…")', "--ic-mask": "var(--ic-uri)" }
```

`generateIconSetCss` devuelve tanto el CSS generado como la lista de `families` de las que tomó iconos, para que quien la llama sepa qué avisos de licencia corresponden al encabezado. Cada exportación y cada opción están documentadas en la [referencia de la API](../reference/index.md).

## Generar CSS fuera de un bundler

En el fondo, cada plugin solo ejecuta un escaneo seguido de una emisión de CSS. Puedes ejecutar exactamente ese mismo flujo de dos pasos por tu cuenta en un script de build o generador estático:

```ts
import { generateIconSetCss, IconRegistry, renderAttributionBanner, scanFiles } from "@codenhub/icons";
import lucide from "@codenhub/icons/data/lucide";

const registry = new IconRegistry({ defaultPrefix: "lucide" });
registry.registerFamily(lucide);

const classes = scanFiles(["./src/**/*.html"]);
const { css, families } = generateIconSetCss(classes, registry);
const banner = renderAttributionBanner(families); // undefined cuando ninguna familia usada debe un aviso
const stylesheet = banner ? `${banner}\n${css}` : css;
```

`scanFiles` acepta rutas de archivo literales y patrones glob, y omite en silencio cualquier archivo que no pueda leer en lugar de hacer estallar tu script por un error de permisos suelto.

Si quieres una hoja de estilos completa de una familia — el mismo formato que publica `@codenhub/icons/<family>` — llama a `generateFamilyCss`. Ambos generadores de CSS emiten una propiedad `--ic-static-mask` para que la hoja de estilos base la intercambie en el reposo del hover y bajo movimiento reducido siempre que un icono proporcione `staticBody`; el registro conserva ese marcado SVG interno opcional en `ResolvedIcon`. Comparte la geometría del cuerpo animado y acepta el mismo grosor de trazo. `renderSvg`, por el contrario, conserva el `body` animado. Consulta [Familias animadas](concepts.md#familias-animadas).

## Un icono en `background-image`

La hoja de estilos base da estilo a los iconos en un elemento (`<i>` o `.ic`) o en un `<svg>` en línea. Cuando el CSS coloca el icono en un lugar sin elemento interno — un control de formulario personalizado, un adorno dentro de un input o un pseudoelemento `::before` que tú controlas — resuelve la `url()` en JavaScript y pásasela a tu CSS por tu cuenta:

```ts
getIconMaskUrl("lucide:search", registry); // 'url("data:image/svg+xml;…")'
getIconCssProps("lucide:search", registry); // { "--ic-uri": …, "--ic-mask": "var(--ic-uri)" }
```

`getIconMaskUrl` también acepta una cadena sin procesar que empiece por `<svg` y la codifica directamente sin consultar un registro: pasa el marcado del propio elemento, sin espacios iniciales ni declaración XML. `getIconCssProps` incluye `--ic-static-mask` cuando el icono resuelto aporta gráfico estático, que la hoja de estilos base usa para movimiento reducido y reposo del hover. Devuelve exactamente el objeto de custom properties que espera un atributo `style` en línea o un objeto CSS-in-JS; combina esas propiedades con `background-image: var(--ic-uri)` o `mask-image: var(--ic-mask)` y tus propias dimensiones.

## Reproducir iconos desde código

`@codenhub/icons/play` es un punto de entrada opcional para comportamiento de reproducción que CSS no puede manejar por sí solo. No carga datos de iconos, y simplemente importarlo no hace nada hasta que llamas a una de sus dos funciones:

```ts
import { bindIconPlayback, playIcon } from "@codenhub/icons/play";

// Repite el gráfico de una sola reproducción en cada hover, no solo en el primero:
const unbind = bindIconPlayback();

// Reproduce un icono ante un evento, como una copia exitosa:
copyButton.addEventListener("click", async () => {
  await navigator.clipboard.writeText(value);
  playIcon(copyButton.querySelector(".ic-anim-beat")!);
});

// Cuando se destruye la página o el componente:
unbind();
```

`playIcon(element, { prefix: "ic" })` reinicia un icono desde el fotograma cero, ya sea que use una clase `ic-anim-*` (en ejecución o terminada) o material gráfico SVG animado. Para el movimiento de glifo, limpia brevemente `animation-name` durante un recálculo de estilos y la restaura. Para un icono con máscara CSS, escribe una data URL de SVG nueva en la propiedad en línea `--ic-mask`, porque los navegadores se niegan a reiniciar una imagen de máscara animada que ya pintaron una vez. Una llamada directa deja esa sobrescritura en línea en el elemento, así que límpiala con `element.style.removeProperty("--ic-mask")` antes de cambiar la clase del icono más adelante. Los iconos `<svg>` en línea se reinician mediante `setCurrentTime(0)`. Un elemento sin ninguno de los dos tipos de movimiento queda intacto.

`bindIconPlayback(root = document, { prefix: "ic" })` llama a `playIcon` para cada icono `ic-on-hover` cuando se activa su disparador, siguiendo exactamente la misma regla de disparador que el CSS: el propio icono, su padre o cualquier ancestro `ic-trigger` en hover o `:focus-visible`. CSS por sí solo ya reinicia el movimiento de glifo y los gráficos en bucle en cada hover; este enlazador es lo que permite que el gráfico de una sola reproducción, como el trazado de entrada de Line MD, vuelva a reproducirse en cada hover en lugar de solo el primero. Adjunta listeners delegados, así que los iconos montados después funcionan automáticamente. Pasa un subárbol que contenga tanto los disparadores como sus iconos para acotarlo. Mover el puntero entre hijos dentro del mismo disparador conserva la reproducción activa y, cuando el disparador termina, el enlazador limpia su sobrescritura en línea de `--ic-mask` para que los futuros cambios de clase del icono funcionen con normalidad. Llamar a la función de limpieza devuelta elimina los listeners y limpia las sobrescrituras activas.

Pasar un `prefix` personalizado desplaza las clases, la custom property y los nombres de animación a los que apuntan ambas funciones. Ambas funciones no hacen nada cuando el dispositivo solicita movimiento reducido: los iconos con máscara CSS conservan su respaldo estático, mientras que el SVG en línea conserva su propio gráfico animado, así que sustituye por gráfico estático tú mismo cuando haga falta. Llamar a `bindIconPlayback` sin `root` fuera de un navegador devuelve una función de limpieza sin efecto. La reproducción en Chrome está verificada; Firefox y Safari están sin probar. Consulta [Movimiento](concepts.md#movimiento) para ver los controles CSS.

## Cargar una familia bajo demanda

En una interfaz de navegador como un selector de iconos, empaquetar todas las familias desde el principio pesaría megabytes. Registra cargadores asíncronos en su lugar para que las familias se carguen solo cuando alguien las pida:

```ts
registry.registerLoader("phosphor", () => import("@codenhub/icons/data/phosphor"));

await registry.resolveAsync("phosphor:heart");
```

`resolve` sigue siendo síncrono y comprueba solo las familias que ya están en memoria, mientras que `resolveAsync` carga primero la familia solicitada. Los plugins en tiempo de build se mantienen en la vía síncrona porque un build conoce sus familias configuradas antes de empezar a escanear.

## Conjuntos de iconos de terceros

`adoptIconifySet` convierte cualquier documento con forma de IconifyJSON al formato de familia que espera este paquete:

```ts
import { adoptIconifySet } from "@codenhub/icons";

registry.registerFamily(adoptIconifySet(someIconifySet, { attribution: "notice" }));
```

Pasa `attribution: "credit"` en su lugar cuando la licencia del conjunto adoptado exija un crédito visible de autoría, como CC-BY.

Los conjuntos adoptados pertenecen al nivel `extended`: la promesa de licencias que hace este paquete cubre las familias que él genera, no los datos que aporta quien lo consume. Consulta [Licencias](licensing.md).

## Siguiente paso

Lee [Licencias](licensing.md) para ver qué atribución emite tu build en cada método de entrega y qué obligaciones aplican a las familias base, de marcas y adoptadas.
