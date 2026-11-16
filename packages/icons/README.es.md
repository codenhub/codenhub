<!-- source: 965df1f1344b6de7db801484a24588f1c85f98c0 -->

# @codenhub/icons

Sistema de iconos sin runtime para la web. Escribe `ic-lucide-heart` en tu marcado y el icono llega como una máscara CSS: sin imports, sin componentes y sin librería de iconos en tu bundle. Una sola clase, sin JavaScript dando vueltas solo para dibujar un corazón.

`@codenhub/icons` incluye 15 familias base generadas que suman más de 36,000 iconos, cada una con los avisos de licencia que su material gráfico requiere, para que un proyecto pueda adoptar iconos sin pasarse una tarde revisando licencias a mano. Dos familias de marcas opcionales añaden logotipos: `simple-icons`, con más de 3,000 en un solo color de marca cada uno (como GitHub y npm), y `logos`, con más de 2,000 a todo color (como Google y Slack). Las marcas siguen sujetas a las guías de uso de marca de sus respectivos propietarios.

## Instalación

```sh
pnpm add @codenhub/icons
```

## Uso

Los iconos llegan al proyecto a través de CSS. Elige el punto de entrada que encaje con tu pipeline; todos entienden las mismas clases.

### Tailwind CSS v4

Una sola línea. Todas las familias excepto las de marcas (`simple-icons` y `logos`) se pueden resolver, y Tailwind emite únicamente los iconos que usó tu marcado. Para usar una familia de marcas, declara el plugin por tu cuenta con `families`, como se indica en [Tailwind](docs/es/delivery/tailwind.md).

```css
@import "tailwindcss";
@import "@codenhub/icons/tw";
```

### CSS simple, sin paso de build

Importa las reglas base y luego una hoja de estilos por familia. Cada familia está completa, así que nada tiene que escanear tu marcado: intercambias tamaño de archivo por cero configuración de build.

```css
@import "@codenhub/icons";
@import "@codenhub/icons/lucide";
```

### Vite o PostCSS

Los plugins escanean tu marcado y generan solo las reglas que necesita, lo que mantiene la salida ligera sin necesidad de Tailwind.

```ts
// vite.config.ts
import lucide from "@codenhub/icons/data/lucide";
import viteIcons from "@codenhub/icons/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [viteIcons({ content: ["./src/**/*.{html,ts,tsx}"], defaultPrefix: "lucide", families: [lucide] })],
});
```

```css
@import "@codenhub/icons";
```

### Sin herramienta de build

El comando `chi build` lee tus archivos y escribe una hoja de estilos con las reglas base y solo los iconos que usan, para un proyecto que no ejecuta Tailwind CSS, Vite ni PostCSS. Ejecútalo desde un script de `package.json`, o como `npx @codenhub/icons build`, como en [Comando de build](docs/es/delivery/cli.md).

```sh
chi build --content "app/views/**/*.erb" --output public/icons.css
```

### El marcado

Un icono es un elemento que lleva una clase de icono: un `<i>`, o `.ic` en cualquier elemento que tú controles.

```html
<!-- independiente -->
<i class="ic-lucide-heart" aria-hidden="true"></i>

<!-- icono junto a una etiqueta: un elemento real dentro del control -->
<button class="btn"><i class="ic-lucide-check" aria-hidden="true"></i>Submit</button>

<!-- .ic, para un componente que renderiza su propia etiqueta (métodos basados en CSS) -->
<span class="ic ic-lucide-search" aria-hidden="true"></span>

<!-- grosor de trazo, para familias basadas en trazos -->
<i class="ic-lucide-heart/1.5" aria-hidden="true"></i>

<!-- un tamaño del eje de tamaños -->
<i class="ic-lucide-search ic-lg" aria-hidden="true"></i>

<i class="ic-lucide-loader-circle ic-anim-spin" aria-hidden="true"></i>
```

El tamaño y el color siguen custom properties: define `--ic-size` y `--ic-color` en el icono o en cualquier ancestro. Las clases `ic-xs`–`ic-xl` son atajos que fijan `--ic-size` a un valor en rem; el valor por defecto es `1em`. Los iconos se pintan con el color del texto, salvo los iconos de marca, que llegan con su color de marca hasta que `--ic-color` indique lo contrario: `:root { --ic-color: currentColor; }` vuelve monocromáticos todos los iconos. No existe variante con `::before`, `::after` ni en controles de formulario; para un icono en `background-image`, resuelve el `url()` con `getIconMaskUrl` / `getIconCssProps`.

## Documentación

- [Introducción a la documentación](docs/es/index.md): qué es el paquete, instalación y la configuración mínima que funciona.
- [Conceptos](docs/es/concepts.md): familias, cómo encontrar nombres de iconos, resolución de nombres, color, grosor de trazo, tamaño y accesibilidad.
- [Métodos de entrega](docs/es/delivery/index.md): CSS simple, Tailwind CSS v4, el plugin de Vite y el plugin de PostCSS.
- [Frameworks](docs/es/frameworks/index.md): configuración para Astro, Next.js y SvelteKit.
- [API de JavaScript](docs/es/javascript-api.md): el registro, los renderizadores y el adaptador para conjuntos de terceros.
- [Licencias](docs/es/licensing.md): modos de atribución y qué debe incluir cada build.
- [Solución de problemas](docs/es/troubleshooting.md): cuando un icono no renderiza nada, sale como un cuadrado sólido o tiene el grosor incorrecto.
- [Referencia de la API](docs/reference/index.md): cada exportación de la raíz y de los puntos de entrada `/vite`, `/postcss` y `/play`, generada a partir del código fuente.

## Requisitos

| Requisito    | Detalles                                                                                                                                                                      |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Node.js      | 26 o posterior, para los plugins y helpers en tiempo de build, y `chi build`.                                                                                                 |
| Imports CSS  | Las herramientas del proyecto deben resolver imports de CSS desde paquetes.                                                                                                   |
| Navegadores  | Debe soportar `mask-image` en CSS, que usan todos los métodos excepto el modo SVG en línea. Las máscaras animadas se probaron en Chromium; Firefox y Safari están sin probar. |
| Tailwind CSS | Versión 4 o posterior, y solo para los puntos de entrada `/tw` y `/tailwind`.                                                                                                 |
| Opcional     | `vite` >= 5.0.0 para el plugin de Vite, `postcss` >= 8.0.0 para el plugin de PostCSS.                                                                                         |

## Notas

- Un icono se nombra `prefix:name`, escrito como `ic-prefix-name` en una clase, por ejemplo `ic-material-symbols-rounded-home`.
- El paquete no define ninguna familia por defecto, porque nadie se pone de acuerdo en si `close` debería llamarse `x` o `times`. Un nombre sin calificar como `ic-heart` solo se resuelve donde tú hayas indicado qué significa: mediante `defaultPrefix` en los plugins de Vite y PostCSS, mediante `default:` en el plugin de Tailwind, o, en la vía sin plugins, mediante la última hoja de estilos de familia que importaste y que lo defina. Una familia que no tiene un icono con ese nombre no reclama el selector sin prefijo, así que una familia anterior sigue respondiendo por él, y las hojas de estilos de familias de marcas no reclaman ningún nombre sin prefijo.
- El grosor de trazo es un modificador en la clase del icono, `ic-lucide-heart/1.5`, y aplica solo a familias dibujadas con trazos. Necesita uno de los plugins: una hoja de estilos sin plugin no tiene forma de saber qué grosores quieres, así que allí las familias se renderizan con su grosor original.
- Un icono es un `<i>` (o `.ic` en cualquier elemento, en los métodos basados en CSS). No existe forma con `::before`, `::after` ni en controles de formulario: un icono junto a una etiqueta es un `<i>` real dentro del control, y un icono en `background-image` sale de `getIconMaskUrl` / `getIconCssProps`.
- `anim` está reservado para las [utilidades de movimiento](docs/es/concepts.md#movimiento); los nombres de icono no pueden ser `anim` ni empezar por `anim-`, y los nombres exactos `on-hover` y `trigger` también están reservados.
- `xs`, `sm`, `md`, `lg` y `xl` están reservados (`ic-xs`–`ic-xl` son el eje de tamaños): ninguna familia puede usar uno como prefijo ni incluir un icono con ese nombre.
- El tamaño sigue `--ic-size`, `1em` por defecto. Cada una de las clases `ic-xs`–`ic-xl` lo fija a un valor en rem (`0.75`, `0.875`, `1`, `1.25`, `1.5`) y nada más, así que se combinan con un modificador de trazo. Un `<svg>` en línea proveniente del renderizador o de `mode: "svg"` lleva una caja propia de `1em` y respeta `--ic-size` a través de las reglas base.
- Las hojas de estilos `/lucide` y de las demás familias son grandes por diseño —una familia entera, porque nada la recorta—, y `dist/css` suma unos 39 MB entre las 17. Importa solo las familias que uses, o usa Tailwind o un plugin, que emiten únicamente lo que pidió tu marcado.
- `mode: "svg"` en el plugin de Vite reescribe etiquetas `<i class="ic-...">` a SVG en línea y nada más. Una clase en otro elemento no recibe ningún icono en este modo; el plugin avisa cuando encuentra una.
- El material gráfico animado proviene de `line-md` (1,222 iconos) y `svg-spinners` (46 indicadores de carga). `ic-on-hover` muestra el gráfico estático en reposo y lo reproduce al pasar el cursor usando solo CSS. Los iconos de una sola reproducción se vuelven a reproducir en cada hover, y no solo en el primero, con el helper opcional `@codenhub/icons/play`. Las máscaras de Line MD permanecen estáticas bajo movimiento reducido; el SVG en línea conserva la animación. Consulta [Familias animadas](docs/es/concepts.md#familias-animadas) para ver la configuración y los límites en navegadores.
- Los nombres de los iconos son los de la familia original: los nombres de Material Symbols conservan sus guiones bajos, como en `ic-material-symbols-rounded-check_circle`.

## Licencia

Este paquete tiene licencia [Apache-2.0](LICENSE).

El material gráfico de iconos generado e incluido proviene de terceros, bajo términos ISC, MIT, Apache-2.0 y CC0. Consulta [NOTICE](NOTICE) para ver la lista completa. Cada hoja de estilos de familia abre con su propio aviso, y los plugins emiten los avisos de las familias que el build realmente usó, así que quien consume el paquete no carga con una obligación aparte por ellos; consulta la documentación de las opciones `attribution` que lo controlan. Las familias de marcas `simple-icons` y `logos` no deben ningún aviso de licencia, pero sus signos son marcas registradas de sus propietarios: usar cualquiera está sujeto a las guías de marca de su propietario, algo que ninguna opción de build satisface. Un conjunto de terceros adoptado mediante `adoptIconifySet` no queda cubierto; quien lo consume sigue siendo responsable de sus términos de licencia y de su material de atribución.
