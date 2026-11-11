---
title: Introducción
description: Para qué sirve @codenhub/styles, qué cuesta y en qué orden leer esta documentación.
source: 32c428e21117cdc980f1689f61bf3efa2274fce8
---

# @codenhub/styles

`@codenhub/styles` te permite construir una interfaz coherente y con temas escribiendo nombres de clase sobre HTML normal. Importas una hoja de estilos y obtienes tokens, un reset, helpers de layout y de tipografía, y clases para botones, campos de formulario, alertas, tarjetas, tablas y tooltips. No hay JavaScript que cargar ni una librería de componentes que envolver: un `<button class="btn primary">` es toda la integración.

Esta documentación construye una pequeña pantalla de principio a fin: una página de ajustes de cuenta con un formulario de perfil, un resumen del plan y una zona de peligro. Cada página le añade algo, así que al final habrás visto todas las partes del paquete trabajando juntas en lugar de por separado.

```html
<main class="section">
  <div class="section-content narrow stack">
    <h1 class="text-title">Account settings</h1>
    <form class="card stack">
      <h2 class="text-title-sm">Profile</h2>
      <div class="field">
        <label class="label" for="display-name">Display name</label>
        <input class="ipt" id="display-name" name="display-name" value="Ada Lovelace" />
      </div>
      <div class="cluster">
        <button class="btn primary" type="submit">Save changes</button>
        <button class="btn ghost" type="reset">Cancel</button>
      </div>
    </form>
  </div>
</main>
```

## Tres decisiones por componente

Cada componente responde con clases a tres preguntas independientes, así que un aspecto nuevo nunca necesita una nueva variante del componente:

- **Intención: ¿qué color?** `.primary`, `.secondary`, `.success`, `.warning`, `.destructive` o `.info`. Si no pones ninguna, es neutro.
- **Presentación: ¿cuánto de ese color?** `.solid`, `.soft` o `.ghost` definen el relleno; `.edged` o `.edgeless` definen el borde.
- **Estética: ¿de qué está hecho?** Una clase opcional, como `.neobrutalism` o `.glass`, cambia las esquinas, el grosor del borde, las sombras y la tipografía de todo lo que contiene.

`<button class="btn destructive ghost edged">Delete account</button>` es un botón rojo con contorno, y envolver la página en `.pixel` lo convierte en uno de pixel art sin tocar el botón. [Construir una pantalla](./concepts.md) presenta cada eje a medida que la página de ajustes lo necesita.

## CSS compilado o código fuente de Tailwind

El paquete ofrece las mismas clases de dos formas:

- **CSS compilado**, listo para usar. Impórtalo desde cualquier bundler o enlaza el archivo desde un CDN. No necesitas Tailwind.
- **Código fuente de Tailwind CSS v4**, en `@codenhub/styles/tw`. Úsalo cuando tu proyecto ya usa Tailwind v4, para que tu build compile el paquete junto con tus propias utilidades y tu tema.

[Configuración inicial](./setup.md) te ayuda a elegir.

## Lo que no hace

- **Sin JavaScript.** No hay runtime, ni bindings para frameworks, ni código generado. Todo lo que necesite un script, como abrir un diálogo, cambiar de tema o cerrar un tooltip, es código tuyo.
- **Sin semántica ni comportamiento.** Las clases pintan elementos; no añaden semántica HTML, ARIA, manejo del teclado, gestión del foco, validación ni anuncios. [Accesibilidad](./accessibility.md) marca el límite exacto.
- **Sin cambio de tema.** Elegir claro u oscuro es una clase o un atributo que pones tú. El paquete independiente `@codenhub/theme` puede recordar y aplicar esa elección por ti.
- **Sin fuentes ni iconos.** No se descarga ningún archivo de fuente. Las estéticas que quieren una fuente especial usan una fuente del sistema hasta que tú aportes una. Los iconos, incluidos los spinners de carga, vienen de tu propio conjunto de iconos, como `@codenhub/icons`.
- **Sin alias de compatibilidad.** Una clase o un token eliminado aparece en el changelog, no se conserva con su nombre antiguo.

## Contrapartidas

Conoce estos costes antes de adoptarlo:

- **Los nombres de clase son cortos y no llevan prefijo.** `.primary`, `.success`, `.dark`, `.label`, `.field`, `.section`, `.stack`, `.flat` y `.ghost` son nombres globales. Otra hoja de estilos en la misma página que los use choca con esta. El paquete está en [capas de cascada](./setup.md#capas-de-cascada), así que tu propio CSS sin capa gana en caso de choque, pero las reglas de una librería de terceros para el mismo nombre se siguen aplicando junto a las del paquete.
- **Las hojas de estilos completas son grandes antes de comprimir.** En el momento de escribir esto, minificada, la hoja de estilos completa ocupa unos 230 KB, `/native` unos 355 KB y `/components` unos 185 KB. Servidas con gzip ocupan unos 18 KB, 25 KB y 14 KB. Los archivos específicos son mucho más pequeños: `/theme` ocupa unos 12 KB (3 KB con gzip) y una estética, de 4 a 14 KB (de 1 a 2 KB con gzip). La mayor parte del tamaño es composición que cada componente repite, y por eso la compresión elimina tanto. Importa el punto de entrada más reducido que cubra una página; consulta [Configuración inicial → Todos los puntos de entrada](./setup.md#todos-los-puntos-de-entrada).
- **`--color-foreground` es un fondo, no un color de texto.** Es el tono un paso por encima de la página sobre el que se apoya una tarjeta o un panel discreto. El color de texto es `--color-text`.
- **Cuatro colores de hover son valores fijos.** `--color-success-hover`, `--color-warning-hover`, `--color-destructive-hover` y `--color-info-hover` están precalculados, porque mezclarlos en vivo hacía fallar WebKit. Si sobrescribes solo `--color-success`, su hover conserva el tono anterior, así que reemplaza la familia completa; consulta [Temas → Tokens de color](./usage/theming.md#tokens-de-color).
- **Solo navegadores modernos.** Chrome 123, Safari 17.5 o Firefox 128 y posteriores. No hay una capa de respaldo para navegadores antiguos.

## Qué se considera soportado

Una combinación de clases está soportada cuando esta documentación la describe y la demo pública en [demo.codenhub.dev/styles](https://demo.codenhub.dev/styles/) la muestra. La demo renderiza los fixtures de prueba del paquete, incluidas las matrices completas de intención, presentación y estética, con el CSS compilado. Una combinación que ni está documentada ni aparece en la demo puede seguir produciendo CSS, pero no se mantiene y puede cambiar en cualquier versión.

La demo se reconstruye desde la rama principal, no desde cada versión. Puede mostrar trabajo que todavía no se ha publicado, así que, cuando la demo y esta documentación no coinciden sobre una versión publicada, mandan la documentación y el [changelog](../changelog/index.md) de esa versión.

## Versionado

El paquete está por debajo de 1.0 y sigue la [regla del versionado semántico para las versiones 0.x](https://semver.org/#spec-item-4): la superficie pública todavía puede cambiar entre versiones menores.

- Una versión menor, como de 0.7.0 a 0.8.0, puede romper la compatibilidad. Puede renombrar o eliminar una clase o un token, o cambiar un valor por defecto. Cada cambio incompatible aparece en **Changed** o **Removed** en la página del [changelog](../changelog/index.md) de esa versión, con lo que debes usar en su lugar.
- Una versión de parche, como de 0.7.0 a 0.7.1, nunca rompe la compatibilidad.

El rango por defecto de npm para una nueva dependencia, `^0.7.0`, ya acepta solo parches, porque por debajo de 1.0 un rango con caret no pasa a la siguiente versión menor. Lee el changelog antes de subirlo. Cuando enlaces un archivo desde un CDN, pon la versión exacta en la URL; consulta [Sin bundler](./integrating/without-a-bundler.md).

Los cambios incompatibles no se suavizan con alias porque el modelo todavía se está asentando, y mantener cada nombre antiguo junto a su reemplazo haría crecer la superficie en cada versión. Un cambio de nombre o una eliminación suele costar un buscar y reemplazar al actualizar; un valor por defecto que cambia puede requerir que reajustes tu propio CSS.

## Orden de lectura

La primera vez, léelas en orden. Cada página añade algo a la pantalla de ajustes y termina indicando la siguiente.

1. [Configuración inicial](./setup.md): instala el paquete, elige entre CSS compilado o código fuente de Tailwind y renderiza la estructura vacía de la página.
2. [Integración](./integrating/index.md): solo si usas Next.js, Vue, Svelte, Astro, Tailwind v4 o ningún bundler. Cada guía te devuelve al camino principal.
3. [Construir una pantalla](./concepts.md): maqueta la página, define su tipografía y añade una tarjeta y un botón Guardar, aprendiendo por el camino la intención, el relleno y el borde.
4. [Uso](./usage/index.md): el resto de la pantalla, en orden:
   - [Botones](./usage/buttons.md): acciones secundarias y destructivas, tamaños, botones de icono y estados deshabilitados.
   - [Formularios](./usage/forms.md): campos con etiqueta, pistas, errores, iconos, selects, checkboxes, radios y switches.
   - [Feedback](./usage/feedback.md): un estado de guardado, una alerta de éxito, un badge del plan, un placeholder de carga y una barra de uso.
   - [Tooltips](./usage/tooltips.md): ayuda de campo que funciona con ratón, con teclado y con lector de pantalla.
   - [Temas](./usage/theming.md): modo claro y oscuro, colores de marca y tus propias intenciones.
   - [Estéticas](./usage/aesthetics.md): cambia el estilo de toda la pantalla con una sola clase.
   - [Clases solo](./usage/solo.md): pinta una estética sobre un componente al que este paquete no da estilo.
   - [Composición](./usage/composing.md), [Personalización](./usage/customizing.md) y [Contenido y layout](./usage/content-and-layout.md): páginas de consulta con cada regla de eje, token, valor por defecto y clase helper.
   - [Preajustes](./usage/presets.md): define un aspecto una sola vez, para una región, un tema o tu propia clase de componente, en lugar de repetirlo en cada elemento.
5. [Accesibilidad](./accessibility.md): lo que el CSS resuelve por ti y lo que tu aplicación todavía debe hacer.

El [changelog](../changelog/index.md) enumera cada versión y lo que cambió en ella.
