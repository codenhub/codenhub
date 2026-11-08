---
title: Estilos
description: La hoja de estilos, los colores con y sin @codenhub/styles, las clases de presentación, el tamaño, el modo oscuro, sobrescribir colores, la Content Security Policy y el orden de las hojas de estilos.
order: 4
source: d6079abe49e29d1f3fc1f994a6fdb31384bb4d37
---

# Estilos

Los toasts y los diálogos deberían parecer parte de tu app, no una biblioteca que se coló en la fiesta. Esta página cubre la hoja de estilos, de dónde salen los colores, las clases de presentación, el tamaño, el modo oscuro, cómo sobrescribir los colores tú mismo y la Content Security Policy. Todo lo de aquí es CSS normal y corriente: sin plugin de build, sin objeto de tema, sin API de estilos en runtime.

## La hoja de estilos

Carga la hoja de estilos una vez, donde arranca tu app:

```ts
import "@codenhub/toaster/styles";
```

Contiene todo lo visual: los stacks y sus posiciones, el layout de toasts y diálogos, las animaciones y los colores. Sin ella, los toasts se siguen añadiendo a la página, pero sin posición, sin layout y sin color. Si tu primer toast aparece como un párrafo olvidado al final de la página, la culpa es de este import.

El import funciona con cualquier bundler que maneje imports de CSS, como Vite, webpack o esbuild. Sin bundler, enlaza `dist/styles/index.css` del paquete con una etiqueta `<link rel="stylesheet">`.

### Lo que define fuera de los toasts

Casi todas las reglas están acotadas a los elementos del propio paquete, pero unas pocas afectan a toda la página, y es mejor que te enteres aquí que por un compañero desconcertado:

- **`color-scheme` en la raíz.** La hoja de estilos pone `color-scheme: light dark` en `:root`, así que el navegador dibuja los controles integrados, como las barras de desplazamiento y los campos de formulario, en modo oscuro cuando el sistema operativo prefiere el oscuro. Las clases `dark`, `light`, `theme-dark` y `theme-light` y el atributo `data-theme` también lo definen, en el elemento que los lleve; consulta [Modo oscuro](#modo-oscuro). Si tu página define su propio `color-scheme`, el tuyo se aplica allí donde tu regla sea más específica o se cargue después.

  La regla está ahí porque los colores integrados son pares `light-dark()`, que siguen a `color-scheme`: sin ella, los toasts sin `@codenhub/styles` se quedarían claros en un sistema oscuro. Si tu página solo tiene un diseño claro, el efecto secundario son barras de desplazamiento y campos de formulario oscuros para los visitantes cuyo sistema prefiere el oscuro. Para desactivarlo, usa la clase `light` en `<html>`, o una regla tuya cargada después de esta hoja de estilos y fuera de cualquier `@layer`, ya que la regla del toaster tampoco está en una:

  ```css
  :root {
    color-scheme: light;
  }
  ```

  Los toasts se adaptan y también se quedan claros, así que nada en la página cambia de tema a tus espaldas.

- **Clases de presentación.** Define `.solid`, `.soft`, `.ghost`, `.edged` y `.edgeless` de forma global, en la `@layer components` de CSS. Solo definen las custom properties `--ui-fill`, `--ui-fg-on-fill` y `--ui-border`. Un elemento tuyo que casualmente comparta nombre de clase no cambia por sí solo, pero esas propiedades se heredan, y los toasts y los componentes de `@codenhub/styles` las leen, así que cualquiera de ellos dentro de ese elemento recoge los valores. Si `.solid` ya significa otra cosa en tu app, cambia el nombre de la tuya.

## De dónde salen los colores

Los toasts y los diálogos eligen sus colores de una de dos formas, según si `@codenhub/styles` está o no en la página.

### Sin `@codenhub/styles`

Sin `@codenhub/styles`, la hoja de estilos usa colores integrados: una superficie neutra para los toasts por defecto, verde para éxito, rojo para error, ámbar para advertencia y azul para información, cada uno con una versión clara y otra oscura. No tienes que configurar nada.

### Con `@codenhub/styles`

[`@codenhub/styles`](https://www.npmjs.com/package/@codenhub/styles) es un sistema de diseño opcional. Cuando su hoja de estilos, versión 0.3.0 o posterior, está en la página, los toasts y los diálogos construyen sus colores a partir de su tema:

- **Colores de intención**: los toasts leen `--color-success`, `--color-destructive` (para errores), `--color-warning` y `--color-info`, y los botones de los diálogos leen `--color-primary`, `--color-accent` (para `type: "secondary"`), `--color-success` y `--color-destructive`, así que cambiar los colores de tu tema cambia ambos.
- **Presentación**: cuánto color llena el fondo y el borde sigue a `--ui-fill` y `--ui-border`.
- **Aspecto**: el radio de las esquinas, el grosor del borde, la sombra, el recorte y la elevación de un tema (`--ui-radius`, `--ui-border-width`, `--ui-surface-shadow`, `--ui-clip`, `--ui-elevation`) también se aplican a toasts y diálogos, así que un tema de cristal o neobrutalista también les llega.

Se leen en vivo. Cambia una variable o una clase del tema en runtime y los toasts que ya están en pantalla se actualizan con ella.

Por defecto, un toast se ve como un alert de `@codenhub/styles`: una superficie ligeramente teñida con borde y sin sombra. Los botones de los diálogos se ven como sus botones: color sólido, sin borde, un poco elevados.

## Clases de presentación

Pasa una clase de presentación con `className` para cambiar la intensidad del color de un toast:

| Clase      | Efecto                                           |
| ---------- | ------------------------------------------------ |
| `solid`    | Fondo con color completo.                        |
| `soft`     | Fondo ligeramente teñido. Por defecto en toasts. |
| `ghost`    | Sin relleno de fondo.                            |
| `edged`    | Dibuja el borde. Por defecto en toasts.          |
| `edgeless` | Quita el borde.                                  |

```ts
import { toast } from "@codenhub/toaster";

toast.error("No se pudo guardar la nota", { className: "solid" });
toast.info("Sincronizando en segundo plano", { className: "ghost edgeless" });
```

Estas clases funcionan sin `@codenhub/styles` y con él. Definen `--ui-fill` y `--ui-border`, así que una clase en el propio toast gana a una en cualquier ancestro. Para aplicar una a todos los toasts de un toaster, usa la opción `className` del toaster.

## Tamaño

Cada toast mide 22.25rem (356px) de ancho. En una pantalla estrecha se encoge para caber, manteniendo el margen del stack a ambos lados. Todos los toasts de un stack comparten el mismo ancho, así que el stack mantiene los bordes rectos.

Para cambiar el ancho, define `width` en una clase y pásala con `className`:

```css
.wide-toast {
  width: 28rem;
}
```

```ts
toast.info("Un mensaje más largo que necesita más espacio", { className: "wide-toast" });
```

## Velocidad de las animaciones

Los toasts entran y salen deslizándose en 400ms, y los diálogos aparecen y desaparecen con un fundido de 200ms. Los dos leen las mismas custom properties de movimiento que usa `@codenhub/styles`, así que puedes cambiarlas con él o sin él:

| Propiedad                  | Por defecto                  | Controla                                               |
| -------------------------- | ---------------------------- | ------------------------------------------------------ |
| `--motion-duration-slow`   | `400ms`                      | Entrada, salida y deslizamiento de toasts en un stack. |
| `--motion-ease`            | `cubic-bezier(0.2, 0, 0, 1)` | Easing de esas animaciones de toasts.                  |
| `--motion-duration-normal` | `200ms`                      | Fundidos del diálogo y del backdrop.                   |

```css
:root {
  --motion-duration-slow: 250ms;
}
```

El movimiento reducido las desactiva todas de todos modos; consulta [Movimiento reducido](accessibility.md#movimiento-reducido).

## Modo oscuro

Sin ningún tema definido, los toasts y los diálogos siguen la preferencia de modo claro u oscuro del sistema operativo. Para elegir de forma explícita, pon uno de estos en un ancestro, normalmente `<html>`:

- Oscuro: la clase `dark` o `theme-dark`, o `data-theme="dark"`.
- Claro: la clase `light` o `theme-light`, o `data-theme="light"`.

`@codenhub/theme` define la clase `theme-<nombre>` y `data-theme="<nombre>"`, así que los temas llamados `dark` y `light` funcionan sin más. Para temas oscuros con otros nombres, activa su opción `darkClass`, que añade la clase `dark`.

Los colores se resuelven con `light-dark()` de CSS según el `color-scheme` de cada elemento, así que una sección clara dentro de una página oscura funciona. Los toasts que se renderizan dentro de ella, con un [toaster acotado a esa sección](instances.md), usan colores claros:

```html
<html class="dark">
  <body>
    <aside id="preview" class="light" style="color-scheme: light">
      <!-- Un toaster creado con { container: preview } muestra toasts claros aquí. -->
    </aside>
  </body>
</html>
```

## Sobrescribir colores

Cuando un color tiene que ser distinto del tema, define la custom property `--toast-color-*` correspondiente en tu propio CSS. Sustituye el color calculado para ese único valor, con o sin `@codenhub/styles`. Cada valor es final: se usa exactamente como lo das, sin mezclarse con nada.

Las custom properties se heredan, así que dónde defines una decide a qué afecta:

```css
/* Todos los toasts y diálogos de la página. */
:root {
  --toast-color-success-bg: #0f2e1b;
  --toast-color-success-fg: #4ade80;
  --toast-color-success-edge: #166534;
}

/* Solo los toasts dentro de la barra lateral, de un toaster creado con { container: sidebar }. */
#sidebar {
  --toast-color-error-bg: #450a0a;
  --toast-color-error-fg: #fca5a5;
}

/* Un solo toast, con className. */
.quota-alert {
  --toast-color-error-bg: #7f1d1d;
}
```

```ts
toast.error("Almacenamiento casi lleno", { className: "quota-alert" });
```

Para los diálogos, pon la clase en el diálogo con el `className` de la llamada o el `className` de la instancia.

| Propiedad                    | Qué colorea                                                                                 |
| ---------------------------- | ------------------------------------------------------------------------------------------- |
| `--toast-color-default-bg`   | Fondo de un toast neutro.                                                                   |
| `--toast-color-default-fg`   | Texto e icono de un toast neutro.                                                           |
| `--toast-color-default-edge` | Borde de un toast neutro.                                                                   |
| `--toast-color-success-bg`   | Fondo de un toast de éxito.                                                                 |
| `--toast-color-success-fg`   | Texto e icono de un toast de éxito.                                                         |
| `--toast-color-success-edge` | Borde de un toast de éxito.                                                                 |
| `--toast-color-error-bg`     | Fondo de un toast de error.                                                                 |
| `--toast-color-error-fg`     | Texto e icono de un toast de error.                                                         |
| `--toast-color-error-edge`   | Borde de un toast de error.                                                                 |
| `--toast-color-warning-bg`   | Fondo de un toast de advertencia.                                                           |
| `--toast-color-warning-fg`   | Texto e icono de un toast de advertencia.                                                   |
| `--toast-color-warning-edge` | Borde de un toast de advertencia.                                                           |
| `--toast-color-info-bg`      | Fondo de un toast de información.                                                           |
| `--toast-color-info-fg`      | Texto e icono de un toast de información.                                                   |
| `--toast-color-info-edge`    | Borde de un toast de información.                                                           |
| `--toast-color-surface`      | Fondo de un diálogo y de su botón de cancelar.                                              |
| `--toast-color-text`         | Texto de un diálogo y de su botón de cancelar.                                              |
| `--toast-color-border`       | Borde de un diálogo y de su botón de cancelar con `edged`, y del campo de texto del prompt. |
| `--toast-color-primary-bg`   | Anillo de foco y borde con foco del campo de texto del prompt.                              |

El paquete nunca define estas propiedades por su cuenta. Son todas tuyas.

## Content Security Policy

El paquete no inyecta ningún elemento `<style>`. La hoja de estilos la cargas tú, y los únicos estilos que escribe el paquete son propiedades sueltas en elementos mediante `element.style.setProperty()`, que una política `style-src` no bloquea. Una política estricta como esta no necesita nonce ni excepción por él:

```http
Content-Security-Policy: style-src 'self';
```

Eso cubre al paquete. Cómo cargas la hoja de estilos es cosa tuya y de tu política: un `<link>` o un archivo CSS que genere tu bundler pasan sin problema con `style-src 'self'`, pero algunos montajes, como los servidores de desarrollo o `style-loader`, inyectan el CSS como un elemento `<style>`, que esta política bloquea. Si los toasts salen sin estilo bajo CSP, revisa eso primero.

Además, el paquete nunca interpreta HTML, así que también funciona con Trusted Types; consulta [Accesibilidad y seguridad](accessibility.md#trusted-types).

## Orden de las hojas de estilos con `@codenhub/styles/native`

Si usas la hoja de estilos para elementos nativos de `@codenhub/styles` (`@codenhub/styles/native` o `@codenhub/styles/tw/native`), impórtala **antes** que la hoja de estilos del toaster:

```ts
import "@codenhub/styles/native";
import "@codenhub/toaster/styles";
```

La hoja de estilos nativa estiliza cada `<button>` simple como un botón neutro. Los botones de los diálogos son elementos `<button>` simples, y las dos hojas los estilizan con selectores igual de débiles, así que gana la que se carga última. Carga la nativa la última y todos los botones de los diálogos se vuelven neutros, incluido el rojo de "Borrar", que es justo el botón que más necesita parecer peligroso.

## Siguiente

La app de notas ya se ve bien. La última página, [Accesibilidad y seguridad](accessibility.md), cubre lo que oyen los usuarios de lectores de pantalla, cómo se mueve el foco, el movimiento reducido y el límite de confianza del contenido personalizado.
