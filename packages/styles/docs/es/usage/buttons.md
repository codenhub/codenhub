---
title: Botones
description: Acciones destructivas y secundarias, botones de icono, tamaños, enlaces con aspecto de botón, estados deshabilitados e iconos de carga.
order: 1
source: 191dd268b7da59fd3b3bf82c23aa192207c89381
---

# Botones

La pantalla de ajustes tiene un botón Guardar y un botón Cancelar. Esta página añade el resto de sus acciones: una zona de peligro con un botón Eliminar destructivo, un botón de icono que copia una clave de API y botones más pequeños para una fila densa. También cubre los botones deshabilitados y cómo cargar los iconos que se usan aquí y en páginas posteriores.

## Añadir una zona de peligro

Una acción destructiva va en su propia tarjeta al final de la pantalla. La tarjeta es soft y destructiva para que se lea como una advertencia; el botón es sólido para que sea lo más llamativo de esa tarjeta:

```html
<section class="card soft destructive stack" aria-labelledby="danger-title">
  <h2 class="text-title-sm" id="danger-title">Delete account</h2>
  <p>This removes your projects, invoices, and API keys. It cannot be undone.</p>
  <div class="cluster">
    <button class="btn destructive" type="button">Delete account</button>
    <button class="btn ghost" type="button">Export data first</button>
  </div>
</section>
```

La tarjeta y el botón nombran cada uno `.destructive`, porque [la intención no se hereda](../concepts.md#intención-qué-color). Por el mismo motivo, el botón Exportar conserva su color neutro dentro de la tarjeta roja.

## Elegir un relleno y un borde

Un botón acepta una intención, una clase de relleno y una clase de borde, todas opcionales. Sin ninguna, un botón es sólido y sin borde:

```html
<button class="btn primary">Save changes</button>
<button class="btn secondary">Preview</button>
<button class="btn primary soft">Invite member</button>
<button class="btn destructive ghost edged">Revoke key</button>
<button class="btn ghost">Cancel</button>
```

Un botón **neutro** nunca se rellena del todo. Su color es el propio color de texto de la página, así que un relleno completo sería un bloque negro o blanco, lo más llamativo de la página para la intención que no significa nada en particular. Un botón neutro `.solid` se queda en un relleno del 20%, un gris discreto un paso más oscuro que `.soft`. Todas las intenciones con nombre se rellenan al 100%.

Con hover, el relleno de un botón se intensifica en `--hover-step` (14%), así que un botón `.ghost` toma un tinte y uno `.solid` cambia al color de hover de su intención. Al pulsarlo se encoge un poco (`scale(0.97)`); una [estética](./aesthetics.md) puede reemplazarlo por su propia pulsación, y la preferencia de movimiento reducido del usuario lo desactiva.

## Tamaños y formas

| Clase     | Efecto                                                                                                                                                                                      |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| _ninguna_ | Al menos 2.5rem de alto (`--control-height`), 1rem de relleno lateral y el mismo tamaño de fuente que el texto que lo rodea.                                                                |
| `.sm`     | Al menos 2rem de alto, 0.75rem de relleno lateral, texto de 0.875rem.                                                                                                                       |
| `.lg`     | Al menos 3rem de alto, 1.25rem de relleno lateral, texto de 1.0625rem.                                                                                                                      |
| `.pill`   | Extremos completamente redondeados.                                                                                                                                                         |
| `.icon`   | Cuadrado. Al menos 2.5rem por lado, 2rem con `.sm`, 3rem con `.lg`.                                                                                                                         |
| `.p-xs`   | El relleno más ajustado (0.5rem en los lados, 0.125rem arriba y abajo). También quita la altura mínima, para que un botón quepa en una celda de tabla o en una barra de herramientas densa. |
| `.p-sm`   | Relleno compacto (0.625rem en los lados, 0.25rem arriba y abajo).                                                                                                                           |
| `.p-lg`   | Relleno amplio (1.5rem en los lados, 0.75rem arriba y abajo).                                                                                                                               |

Una clase de tamaño y una de relleno se pueden combinar. Solo `.p-xs` quita la altura mínima de un botón con texto; cualquier otra combinación la conserva. En un botón de icono, cualquier clase `.p-*` quita el tamaño mínimo y el botón toma el tamaño de su icono más ese relleno: 0.125rem, 0.25rem o 0.75rem alrededor.

El aspecto base dibuja esquinas que escalan con el tamaño: un botón `.sm` o `.p-sm` tiene esquinas algo más pequeñas que uno por defecto, y `.lg` algo más grandes.

## Botones de icono

La lista de claves de API de la pantalla de ajustes tiene un botón de copiar junto a cada clave. Un botón que solo tiene un icono necesita un nombre accesible, porque el icono no tiene texto que un lector de pantalla pueda leer:

```html
<button class="btn icon ghost" type="button" aria-label="Copy API key">
  <i class="ic-lucide-copy" aria-hidden="true"></i>
</button>
<button class="btn ghost sm" type="button">
  <i class="ic-lucide-download" aria-hidden="true"></i>
  Download invoice
</button>
```

Un botón es una fila flex con una separación de 0.5rem, así que un icono junto a un texto queda espaciado sin markup adicional.

### Cargar los iconos

Este paquete no incluye iconos. Los ejemplos de esta documentación usan `@codenhub/icons` con la familia Lucide, y sus nombres de clase siempre se escriben con la familia, como `ic-lucide-copy`. Instálalo y cárgalo una vez, junto a este paquete:

```sh
pnpm add @codenhub/icons
```

Con CSS compilado, importa las reglas base y cada familia que uses:

```css
@import "@codenhub/styles";
@import "@codenhub/icons";
@import "@codenhub/icons/lucide";
```

Con código fuente de Tailwind, importa su punto de entrada de Tailwind después del de este paquete:

```css
@import "@codenhub/styles/tw";
@import "@codenhub/icons/tw";
```

Cualquier otro icono también funciona: un `<svg>` en línea con `stroke="currentColor"` o `fill="currentColor"` toma el color de texto del botón de la misma forma.

## Enlaces con aspecto de botón

Un enlace que navega, como "Ver historial de facturación", sigue siendo un enlace. Escríbelo como `<a href>` con `.btn` y obtiene el mismo aspecto:

```html
<a class="btn secondary ghost edged" href="/settings/billing">View billing history</a>
```

No uses `<div class="btn">` ni `<span class="btn">`: parecen botones, pero no pueden recibir el foco ni activarse con el teclado. Usa `<button>` para acciones y `<a href>` para navegación.

## Botones deshabilitados

Cualquiera de estos hace que un botón parezca deshabilitado: el atributo `disabled`, `.disabled`, `aria-disabled="true"` o `data-disabled`. Un botón deshabilitado se dibuja al 58% de opacidad con un cursor de no permitido, y no cambia con hover ni al pulsarlo.

```html
<button class="btn primary" type="submit" disabled>Save changes</button>

<a class="btn ghost" aria-disabled="true">Download invoice</a>
```

Solo el atributo `disabled` impide que el botón funcione. `.disabled`, `aria-disabled` y `data-disabled` solo cambian el aspecto: un clic o la tecla Enter siguen activándolo, así que tu código tiene que ignorarlo. `aria-disabled` es la opción correcta cuando el botón debe seguir pudiendo recibir el foco, por ejemplo para que un tooltip explique por qué está deshabilitado. Un enlace no tiene atributo `disabled`, así que quítale también el `href` cuando no deba navegar.

## Estado de carga

No hay una clase de carga. Un botón que está cargando es un botón deshabilitado con un icono de spinner que aportas tú, y [Feedback](./feedback.md#mostrar-que-el-formulario-se-está-guardando) lo construye para el botón Guardar. Deshabilítalo para que un segundo clic no envíe el formulario dos veces.

## Siguiente paso

Los botones están listos; la tarjeta que guardan todavía no tiene nada que guardar. [Formularios](./forms.md) añade los campos del perfil.
