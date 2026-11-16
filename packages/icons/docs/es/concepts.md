---
title: Conceptos
description: Familias, resolución de nombres, nombres reservados, grosor de trazo y las formas del marcado — el modelo que comparte cada método de entrega.
order: 1
source: 514d5acfaaa74c953f1b2bf01e0f36f5bef74062
---

# Cómo encaja el sistema de iconos

Todos los métodos de entrega leen las mismas clases y siguen las mismas reglas. Esta página enseña ese modelo compartido de una sola vez — desde los nombres de familia y la herencia de color hasta el grosor de trazo, el tamaño y el movimiento — para que puedas cambiar entre CSS simple, Tailwind, Vite o PostCSS sin volver a aprender cómo se comportan los iconos.

## Familias

Una familia de iconos es un espacio de nombres con su propio prefijo, geometría y licencia, como `lucide` o `material-symbols-rounded-fill`. Las familias son módulos de datos simples generados a partir de sus proyectos originales, lo que mantiene el material gráfico desacoplado de cualquier framework de renderizado:

```ts
import lucide from "@codenhub/icons/data/lucide";
import phosphorFill from "@codenhub/icons/data/phosphor-fill";
```

Familias disponibles:

| Prefijo                                                          | Iconos    | Estilo                         | Licencia   |
| ---------------------------------------------------------------- | --------- | ------------------------------ | ---------- |
| `line-md`                                                        | 1222      | animado, basado en trazos      | MIT        |
| `svg-spinners`                                                   | 46        | indicadores de carga animados  | MIT        |
| `lucide`                                                         | 2317      | contorno, basado en trazos     | ISC        |
| `phosphor`                                                       | 1512      | contorno                       | MIT        |
| `phosphor-thin`, `phosphor-light`, `phosphor-bold`               | 1512 cada | contorno, otros pesos          | MIT        |
| `phosphor-fill`                                                  | 1512      | relleno                        | MIT        |
| `phosphor-duotone`                                               | 1512      | duotono                        | MIT        |
| `material-symbols-outlined`, `-rounded`, `-sharp`                | 3940 cada | contorno                       | Apache-2.0 |
| `material-symbols-outlined-fill`, `-rounded-fill`, `-sharp-fill` | 3940 cada | relleno                        | Apache-2.0 |
| `simple-icons` (marca)                                           | 3255      | logos rellenos, color de marca | CC0-1.0    |
| `logos` (marca)                                                  | 2016      | logos a todo color             | CC0-1.0    |

Las variantes como relleno o duotono viven en familias separadas en lugar de actuar como conmutadores sobre una sola familia. Así, un nombre de clase sigue siendo un prefijo y un nombre de icono, sin tener que adivinar una sintaxis extra de variantes.

`simple-icons` y `logos` son familias de marcas y se reparten el trabajo: `simple-icons` dibuja cada logotipo en un solo color de marca, como en `ic-simple-icons-github` e `ic-simple-icons-npm`, mientras que `logos` los dibuja a todo color, como en `ic-logos-google-icon` e `ic-logos-slack-icon`, para marcas que un solo color no puede representar, como la G de cuatro colores de Google. La mayoría de las marcas aparece en solo una de las dos, así que se complementan en lugar de duplicarse.

Como es natural, los logotipos a todo color pesan más que los iconos de un solo color. Con los plugins de build, un proyecto paga solo por los logotipos que realmente usa: unos 2 KB de CSS para un logo típico, y menos de 8 KB para el 95% de ellos. Un puñado de logos trazados con mucho detalle se sitúa en el extremo pesado de la escala, desde unos 60 KB hasta 150 KB cada uno: `lerna` (149 KB), `effector` (120 KB), `composer` (88 KB), `hugo` (85 KB), `tastejs` (69 KB), `matplotlib` (66 KB), `matplotlib-icon` (65 KB) y `chalk` (60 KB). Gzip o Brotli reducen esas cifras varias veces al viajar por la red, y cuando el peso siga importando, prefiere una variante `-icon` más ligera o la entrada de la marca en `simple-icons` si existe. Las familias de marcas son opcionales en todas partes — `@codenhub/icons/tw` nunca las resuelve, y un `@plugin` declarado las resuelve solo cuando su opción `families` las nombra — y sus signos siguen siendo marcas registradas de sus propietarios. Consulta [Licencias → Familias de marcas](licensing.md#familias-de-marcas).

### Familias animadas

`line-md` ofrece 1,222 iconos animados de Line MD 3.0.5 de Vjacheslav Trushkin, y `svg-spinners` ofrece 46 indicadores de carga de Utkarsh Verma, generados a partir del material gráfico SMIL original en el commit `abfa05c49acf005b8b1e0ef8eb25a67a7057eb20`. Ambas son familias base con licencia MIT, disponibles mediante `@import "@codenhub/icons/tw"` por defecto, a través de las hojas de estilos de familia `@codenhub/icons/line-md` y `@codenhub/icons/svg-spinners`, o como `@codenhub/icons/data/line-md` y `@codenhub/icons/data/svg-spinners` para un plugin o registro configurado.

```html
<i class="ic-line-md-heart/1.5" aria-hidden="true"></i>
<i class="ic-line-md-loading-loop" aria-hidden="true"></i>
<i class="ic-svg-spinners-90-ring" aria-hidden="true"></i>
```

Las animaciones viven dentro del material SVG y se ejecutan mediante SMIL. Los iconos `-loop` de Line MD se animan de forma continua, y el resto de sus iconos se dibuja una vez. Sin un [disparador de movimiento](#movimiento), un icono se reproduce la primera vez que la página lo muestra. Chrome está verificado; Firefox y Safari están sin probar, así que no des por sentado el soporte de máscaras animadas a partir del soporte de máscaras estáticas.

Añade `ic-on-hover` para mostrar el gráfico estático en reposo y reproducir la animación mientras el disparador tiene hover o foco visible (`:focus-visible`), como se describe en [Movimiento](#movimiento):

```html
<button>
  <i class="ic-line-md-loading-loop ic-on-hover" aria-hidden="true"></i>
  Refresh
</button>
```

Los iconos en bucle se reproducen en cada hover usando solo CSS. Un icono de una sola reproducción, como `ic-line-md-heart`, se reproduce solo en el primer hover usando solo CSS, porque los navegadores no reinician una imagen animada que ya pintaron una vez. Para volver a reproducir un icono de una sola reproducción en cada hover, llama una vez a [`bindIconPlayback`](javascript-api.md#reproducir-iconos-desde-código) desde `@codenhub/icons/play`. Los iconos que no tienen gráfico estático conservan su máscara habitual en reposo.

El modo CSS y el modo SVG en línea gestionan el movimiento reducido y el reposo del hover de forma distinta:

- **Modo máscara CSS** (hojas de estilos completas de familia, Tailwind, modo CSS de Vite y PostCSS, incluidos los modificadores de trazo como `/1.5`): bajo `prefers-reduced-motion: reduce`, las máscaras de Line MD pintan siempre el gráfico estático original, incluso durante el hover. Cada icono lleva su gráfico estático opcional en `--ic-static-mask`, y las reglas base lo eligen para movimiento reducido y reposo del hover. Los SVG Spinners no tienen respaldo estático, así que proporciona una etiqueta de carga accesible independientemente de su movimiento.
- **Modo SVG en línea** (`mode: "svg"` de Vite, módulos virtuales y `renderSvg`): conserva el `body` animado. Como CSS no puede detener una línea temporal SMIL, `ic-on-hover` no puede mantener el SVG en línea en reposo, y esas vías no intercambian el gráfico para movimiento reducido. `playIcon` reinicia un SVG en línea, pero omite el reinicio bajo movimiento reducido; no detiene una línea temporal que ya está corriendo. Elige el modo CSS para el intercambio automático, o lee el `staticBody` del icono resuelto antes de llamar a `renderSvg` cuando necesites SVG en línea estático; `staticBody` comparte el `viewBox` del cuerpo animado. `getIconMaskUrl` devuelve el gráfico animado, mientras que `getIconCssProps` también incluye la propiedad de máscara estática cuando está disponible.

## Nombres

Un icono se identifica mediante `prefix:name`. Como los nombres de clase CSS no pueden contener dos puntos, una clase sustituye los dos puntos por un guion:

```html
<!-- lucide:heart -->
<i class="ic-lucide-heart"></i>

<!-- material-symbols-rounded:home -->
<i class="ic-material-symbols-rounded-home"></i>
```

Cuando dos prefijos de familia cargados comparten el inicio, gana el prefijo coincidente más largo, de modo que `material-symbols-outlined` vence a `material` cuando ambos están cargados.

Un nombre sin calificar como `ic-heart` se resuelve contra una familia por defecto configurada, y contra nada si no hay ninguna configurada. El paquete no elige ninguna familia por defecto propia ni incluye un mapa de alias semánticos, porque nadie se pone de acuerdo en si `close` debería llamarse `x` o `times`. Así que `ic-close` significa lo que tu familia elegida llame `close`, y no renderiza ningún icono si esa familia usa otro nombre. Lucide llama `x` a ese icono, así que bajo Lucide escribes `ic-x`. En CSS simple, donde se pueden importar varias hojas de estilos de familia en secuencia, una hoja de estilos de familia reclama únicamente los nombres sin prefijo que de hecho define, de modo que una familia importada antes sigue respondiendo por los nombres sin prefijo que le falten a la posterior.

De dónde sale la familia por defecto depende del método de entrega:

| Método        | Familia por defecto                                                                                                                                                                         |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vite, PostCSS | La opción `defaultPrefix`.                                                                                                                                                                  |
| Tailwind      | La opción `default:` del plugin.                                                                                                                                                            |
| CSS simple    | La última hoja de estilos de familia base importada. Una hoja de estilos de familia de marca no reclama nombres sin prefijo, así que importarla al final deja el valor por defecto intacto. |

```ts
import { IconRegistry } from "@codenhub/icons";
import lucide from "@codenhub/icons/data/lucide";

const registry = new IconRegistry({ defaultPrefix: "lucide" });
registry.registerFamily(lucide);

registry.resolve("heart"); // lucide:heart
registry.resolve("close"); // undefined -- lucide lo llama "x"
```

### Cómo encontrar el nombre de un icono

Los nombres de los iconos son siempre los del proyecto original, así que navega por el sitio de la familia y usa el nombre exacto que aparece ahí:

| Familia                | Explora en                                                                       | Clase de ejemplo                                |
| ---------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------- |
| `line-md`              | [github.com/cyberalien/line-md](https://github.com/cyberalien/line-md)           | `ic-line-md-heart`, `ic-line-md-loading-loop`   |
| `svg-spinners`         | [github.com/n3r4zzurr0/svg-spinners](https://github.com/n3r4zzurr0/svg-spinners) | `ic-svg-spinners-90-ring`                       |
| `lucide`               | [lucide.dev/icons](https://lucide.dev/icons)                                     | `ic-lucide-circle-check`                        |
| `phosphor`, variantes  | [phosphoricons.com](https://phosphoricons.com)                                   | `ic-phosphor-fill-check-circle`                 |
| `material-symbols-*`   | [fonts.google.com/icons](https://fonts.google.com/icons)                         | `ic-material-symbols-rounded-check_circle`      |
| `simple-icons` (marca) | [simpleicons.org](https://simpleicons.org)                                       | `ic-simple-icons-github`, `ic-simple-icons-npm` |
| `logos` (marca)        | [svgporn.com](https://svgporn.com)                                               | `ic-logos-google`, `ic-logos-google-icon`       |

Las peculiaridades de nomenclatura originales se conservan tal cual en lugar de normalizarlas:

- **Material Symbols** conserva los guiones bajos de Google: `check_circle`, no `check-circle`.
- **Simple Icons** usa el slug del icono, con cualquier `_` escrito como `-`.
- **`logos`** usa el nombre de archivo original, en minúsculas, con cualquier `_` o `.` escrito como `-`: `socket.io` se convierte en `ic-logos-socket-io`. Algunas marcas incluyen tanto un logotipo tipográfico completo como un símbolo terminado en `-icon`, y algunas añaden variantes `-dark` o `-alt`.

Un nombre mal escrito no lanza ningún error: la clase no se resuelve a nada, así que el elemento se renderiza como un cuadrado sólido cuando las reglas base están cargadas, o como nada en absoluto cuando faltan. Comprueba el nombre frente a la familia cuando desaparezca un icono — o lee directamente las claves del objeto `icons` del módulo de la familia.

## Nombres reservados

Como las clases de utilidad viven en el mismo espacio de nombres `ic-*` que las clases de icono, unos pocos nombres quedan fuera de límites para que tus iconos nunca colisionen con los helpers:

- **`xs`, `sm`, `md`, `lg` y `xl`** pertenecen al [eje de tamaños](#tamaño) (`ic-xs` a `ic-xl`). Ninguna familia puede usar uno como prefijo. Una familia base o extendida que incluya un icono con ese nombre falla en la generación; una familia de marcas omite ese icono y lo enumera en el archivo de atribución de la familia.
- **`anim`, `on-hover` y `trigger`** pertenecen a las [utilidades de movimiento](#movimiento). Una familia no puede usar `anim` como prefijo, y un icono llamado `anim` o que empiece por `anim-` se trata igual que un nombre de tamaño: falla en la generación para una familia base o extendida y se omite en una familia de marcas. Los nombres exactos `on-hover` y `trigger` están reservados de la misma forma, mientras que los nombres que simplemente empiezan por ellos — junto con `animation` — siguen disponibles.
- **El grosor de trazo** vive después de una `/` en la propia clase del icono, así que no ocupa ningún prefijo.

## Marcado

Un icono es un elemento HTML que lleva una clase de icono. Escribe un `<i>` — corto, neutro en semántica y el único elemento que reescribe el [modo SVG en línea](delivery/vite.md#modo-svg-en-línea):

```html
<i class="ic-lucide-search" aria-hidden="true"></i>

<!-- grosor de trazo, solo para familias basadas en trazos -->
<i class="ic-lucide-heart/1.5"></i>

<!-- un tamaño del eje -->
<i class="ic-lucide-search ic-lg"></i>
```

En los métodos basados en CSS, la misma clase también funciona en cualquier elemento si añades `.ic`, lo que ayuda cuando un componente de framework insiste en renderizar su propia etiqueta:

```html
<span class="ic ic-lucide-search" aria-hidden="true"></span>
```

No existe forma con `::before`, `::after` ni en controles de formulario. Un icono junto a una etiqueta es un `<i>` real dentro del botón o enlace, así que se alinea con los espacios de flex o grid y se comporta igual en todos los métodos de entrega. Cuando realmente necesites un icono en `background-image` — como un control personalizado o un adorno dentro de un input — resuelve su `url()` con [`getIconMaskUrl` o `getIconCssProps`](javascript-api.md) y colócalo por tu cuenta.

El tamaño y el color siguen custom properties CSS definidas en el icono o en cualquier ancestro:

```css
.toolbar {
  --ic-size: 1.25rem;
  --ic-color: var(--color-accent);
}
```

Consulta [Tamaño](#tamaño) y [Color](#color).

## Color

Un icono se pinta con la primera fuente que aplique, en este orden:

1. `--ic-color`, definido en el propio icono o heredado de cualquier ancestro.
2. El material gráfico propio del icono, en el caso de un icono de `logos` a todo color: `ic-logos-google-icon` conserva los cuatro colores de Google y sus degradados.
3. El color propio del icono, en el caso de `simple-icons`: `ic-simple-icons-github` usa el `#181717` de GitHub, e `ic-simple-icons-npm` usa el `#cb3837` de npm.
4. `currentColor`, coincidiendo con el color del texto circundante.

En resumen, los iconos base siguen el color de tu texto automáticamente, mientras que los iconos de marca aparecen con sus propios colores de marca hasta que les indiques otra cosa. Definir `--ic-color` sobrescribe los colores de marca en el ámbito donde lo apliques; ten en cuenta que, en un logotipo a todo color, `--ic-color` convierte el icono en una silueta monocromática de su contorno, de modo que los detalles contrastados dentro de la marca — como el `31` del icono de Google Calendar — se rellenan de forma sólida:

```css
/* todos los iconos de la página, incluidos los de marca, en el color del texto */
:root {
  --ic-color: currentColor;
}

/* todos los iconos de la barra de herramientas */
.toolbar {
  --ic-color: var(--color-accent);
}

/* solo los iconos de marca, de vuelta a monocromo */
[class*="ic-simple-icons-"],
[class*="ic-logos-"] {
  --ic-color: currentColor;
}
```

```html
<!-- un icono -->
<i class="ic-simple-icons-npm" style="--ic-color: white" aria-hidden="true"></i>
```

Para restaurar los colores de marca dentro de un subárbol que define `--ic-color`, restablece la propiedad en esos iconos con `--ic-color: initial`.

Algunos colores de marca son casi negros — entre ellos GitHub, X y Vercel — y desaparecen sin hacer ruido sobre un fondo oscuro. Sobrescríbelos en tu tema oscuro:

```css
@media (prefers-color-scheme: dark) {
  .ic-simple-icons-github,
  .ic-simple-icons-x {
    --ic-color: white;
  }
}
```

Con un `prefix` de clase personalizado, cada nombre de custom property coincide con él: `--ux-color` bajo `prefix: "ux"`. El `color` normal de CSS por sí solo no recolorea un icono de marca, porque su propio color de marca va por delante de `currentColor`; define `--ic-color` en su lugar, o `--<prefix>-color` bajo un prefijo personalizado. Todo esto funciona igual en cada método de entrega CSS y en el [modo SVG en línea](delivery/vite.md#modo-svg-en-línea), donde los colores de marca viajan dentro del propio `<svg>`. Allí aplica una excepción: bajo una Content Security Policy que bloquee atributos `style`, un icono de marca en línea conserva sus colores de marca, pero `--ic-color` (o `--<prefix>-color`) ya no puede sobrescribirlos.

## Accesibilidad

Un elemento de icono no tiene contenido de texto, así que la tecnología de asistencia no anuncia nada para él, o hace una suposición poco útil. Marca cada icono según su función:

```html
<!-- decorativo, junto a una etiqueta visible: ocúltalo -->
<button><i class="ic-lucide-trash" aria-hidden="true"></i>Delete</button>

<!-- el único contenido de un control: etiqueta el control, oculta el icono -->
<button aria-label="Delete"><i class="ic-lucide-trash" aria-hidden="true"></i></button>

<!-- con significado propio, fuera de un control: dale un rol y un nombre -->
<i class="ic-lucide-triangle-alert" role="img" aria-label="Warning"></i>
```

En el [modo SVG en línea](delivery/vite.md#modo-svg-en-línea), los atributos que pongas en el `<i>` pasan al `<svg>` que lo sustituye.

## Grosor de trazo

El grosor de trazo es un modificador escrito directamente en la clase del icono, y solo las familias dibujadas con trazos responden a él. De las familias incluidas, Lucide y Line MD lo soportan; las demás familias lo ignoran:

```html
<!-- un trazo más fino -->
<i class="ic-lucide-heart/1.5"></i>

<!-- un trazo más grueso -->
<i class="ic-lucide-heart/3"></i>
```

El grosor se hornea directamente en el material SVG que lleva la regla, así que no se puede aplicar como una clase separada encima. `ic-heart` e `ic-heart/1.5` son dos iconos distintos en lo que respecta a CSS, no un mismo icono con un conmutador. Como una clase produce una regla, tu hoja de estilos solo paga por los grosores de trazo que de hecho escribiste.

Por eso también el modificador requiere un paso de build: Vite, PostCSS y Tailwind escanean tu marcado y generan los grosores solicitados bajo demanda, mientras que las hojas de estilos de familia sin plugin renderizan cada icono con su grosor original.

## Tamaño

El tamaño por defecto de los iconos es `1em`, igual que el tamaño de fuente que los rodea. Define `--ic-size` en el icono o en cualquier ancestro para redimensionarlo, o añade una clase del eje de tamaños:

| Clase   | `--ic-size` |
| ------- | ----------- |
| `ic-xs` | `0.75rem`   |
| `ic-sm` | `0.875rem`  |
| `ic-md` | `1rem`      |
| `ic-lg` | `1.25rem`   |
| `ic-xl` | `1.5rem`    |

```html
<i class="ic-lucide-search ic-lg"></i>
```

Cada clase de tamaño hace una sola cosa — fijar `--ic-size` a un valor en rem — así que se combina limpiamente con modificadores de trazo y funciona sin importar en qué elemento caiga. A diferencia del grosor de trazo, el tamaño no se hornea en el material gráfico, así que el eje viene en las reglas base y funciona en todos los métodos de entrega, incluido el [modo SVG en línea](delivery/vite.md#modo-svg-en-línea) siempre que `@import "@codenhub/icons"` esté presente. Usar `.ic` en un elemento distinto de `<i>` sigue siendo exclusivo de los métodos basados en CSS, como se indica en [Marcado](#marcado).

Como estas cinco clases se emiten siempre, `xs`, `sm`, `md`, `lg` y `xl` están [reservados](#nombres-reservados): ninguna familia puede incluir un icono ni tomar un prefijo con esos nombres.

## Movimiento

Los iconos se mueven de dos maneras: las clases de movimiento animan el glifo completo para cualquier icono de cualquier familia, mientras que las [familias animadas](#familias-animadas) animan su propio material gráfico sin necesitar ninguna clase de movimiento. Tres controles gobiernan ambos casos:

| Pregunta            | Control                                                                                  | Por defecto                                  |
| ------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------- |
| Qué se mueve        | una clase `ic-anim-*`, o un icono de una familia animada                                 | nada                                         |
| Cuándo se reproduce | siempre, `ic-on-hover`, o [`playIcon`](javascript-api.md#reproducir-iconos-desde-código) | siempre                                      |
| Con qué frecuencia  | `--ic-anim-iterations`                                                                   | siempre; una vez por hover con `ic-on-hover` |

Cinco clases de movimiento para todo el glifo vienen en los estilos base:

| Clase            | Movimiento                                        | Duración por defecto |
| ---------------- | ------------------------------------------------- | -------------------- |
| `ic-anim-spin`   | Una vuelta completa a velocidad constante         | `1s`                 |
| `ic-anim-pulse`  | La opacidad oscila entre 1 y 0.55                 | `2s`                 |
| `ic-anim-beat`   | Dos pequeños latidos, hasta 1.1 veces su tamaño   | `1s`                 |
| `ic-anim-bounce` | Un rebote vertical, el 15% de la altura del icono | `1s`                 |
| `ic-anim-wiggle` | Rotación de ida y vuelta de 6 grados              | `1s`                 |

`ic-anim-spin` usa temporización lineal; las otras cuatro usan entrada y salida suaves (`ease-in-out`). Define `--ic-anim-duration` en el icono o en un ancestro para cambiar la duración del ciclo. Usa como máximo una clase de movimiento por elemento: sustituye la propiedad `animation` CSS del elemento, y los movimientos basados en transformaciones también sustituyen su `transform` mientras corren.

**Siempre.** Sin clase disparadora, el movimiento corre mientras la clase permanezca en el elemento. Activa `ic-anim-spin` en un icono de recarga mientras una petición está en curso y quítala cuando la petición termine:

```html
<i class="ic-lucide-loader-circle ic-anim-spin" aria-hidden="true"></i>
```

**En hover.** `ic-on-hover` reproduce el movimiento mientras su disparador tiene el cursor encima o `:focus-visible`, y queda en reposo el resto del tiempo. El disparador puede ser el propio icono, su elemento padre o cualquier ancestro que lleve `ic-trigger` — práctico para tarjetas o botones donde el icono va dentro de un envoltorio. Cada hover reinicia desde el principio y se reproduce una vez por defecto:

```html
<button>
  <i class="ic-lucide-refresh-cw ic-anim-spin ic-on-hover" aria-hidden="true"></i>
  Reload
</button>

<a class="card ic-trigger" href="/inbox">
  <span class="card-icon"><i class="ic-lucide-bell ic-anim-wiggle ic-on-hover" aria-hidden="true"></i></span>
  Notifications
</a>
```

**Con qué frecuencia.** `--ic-anim-iterations` establece el número de repeticiones: cualquier número, o `infinite`. Define `--ic-anim-iterations: infinite` cuando un icono deba seguir moviéndose durante todo el hover, como un ventilador. Como se hereda, una sola regla en una barra de herramientas fija el conteo para todos los iconos dentro de ella. El material gráfico animado sigue su propia línea temporal original e ignora `--ic-anim-iterations`: los iconos `-loop` de Line MD se repiten, y el resto se reproduce una vez.

**Desde código.** Para feedback ligado a un evento — un icono de copiar que destella al completarse, o un icono de «me gusta» que salta al hacer clic — llama a `playIcon(element)` desde el punto de entrada opcional [`@codenhub/icons/play`](javascript-api.md#reproducir-iconos-desde-código). Reinicia por igual el movimiento del glifo y el material gráfico animado.

El import base, `@import "@codenhub/icons"`, incluye los keyframes y las clases de movimiento, así que funcionan con hojas de estilos de familia en CSS simple, Vite, PostCSS y el modo SVG en línea. Tailwind también los registra como utilidades, manteniendo disponibles variantes como `group-hover:ic-anim-spin`. Con un `prefix` de clase personalizado, cada clase, custom property y nombre de keyframe cambia a la vez: `ux-anim-spin`, `ux-on-hover`, `ux-trigger`, `--ux-anim-duration` y `--ux-anim-iterations` bajo `prefix: "ux"`.

Cuando el dispositivo del usuario solicita movimiento reducido, las clases de movimiento se detienen, Line MD muestra su gráfico estático incluso durante el hover y `playIcon` no hace nada. Los SVG Spinners siguen moviéndose, porque no tienen gráfico estático. Mantén la información de carga o de estado disponible en texto; el movimiento nunca debería ser la única forma de entender un estado.

Las clases de movimiento mueven el elemento del icono completo. En modo máscara CSS, el gráfico es una imagen, así que CSS no puede meterse dentro para apuntar a trazos individuales ni animarlos. `ic-on-hover` se apoya en selectores `:not()` complejos y `:focus-visible`, que funcionan juntos en Chrome 88+, Firefox 85+ y Safari 15.4+. El movimiento se verificó en Chrome; Firefox y Safari están sin probar.

## Siguiente paso

Lee [Métodos de entrega](delivery/index.md) para elegir cómo las clases de icono se convierten en CSS en tu build: CSS simple, Tailwind CSS v4, Vite o PostCSS.
