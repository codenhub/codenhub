---
title: Preajustes
description: Tres formas de definir un aspecto una sola vez en lugar de en cada elemento, y cuándo recurrir a cada una.
order: 11
source: 0d391b14289260acf66efcf0063dd36165665abb
---

# Preajustes

A estas alturas, la pantalla de ajustes dice `btn primary soft sm` en una docena de sitios, y cambiar de opinión significa cambiar una docena de sitios. Esta página cubre las tres formas de definir un aspecto una sola vez: clases de eje en un contenedor, tokens de tema y de material, y tus propias clases de componente hechas con `@apply`. Cada una encaja con un tipo distinto de "una sola vez".

## Cuál usar

| Quieres                                                                              | Recurre a                                                             |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| Que todos los componentes de una región compartan un relleno, un borde o un material | [Clases de eje en un contenedor](#clases-de-eje-en-un-contenedor)     |
| Otros colores, esquinas, bordes o profundidad para una página o una región           | [Tokens de tema y de material](#tokens-de-tema-y-de-material)         |
| Un nombre para una receta que repites, como "el botón de guardar"                    | [Tus propias clases de componente](#tus-propias-clases-de-componente) |

Se combinan. Una región puede definir un token de material, estar bajo una estética y contener tu propia clase de botón, y cada elemento puede seguir sobrescribiendo lo que hereda.

## Clases de eje en un contenedor

Algunas clases funcionan en un contenedor además de en un componente, y todo lo que hay dentro las toma:

- Las clases de presentación: `.solid`, `.soft`, `.ghost`, `.edged` y `.edgeless`.
- Los patrones de esquina: `.cut-diagonal` y `.cut-diagonal-reverse`.
- Las [estéticas](./aesthetics.md), como `.glass` o `.pixel`.

```html
<div class="cluster soft edged">
  <button class="btn primary" type="button">Negrita</button>
  <button class="btn" type="button">Cursiva</button>
  <button class="btn destructive solid" type="button">Quitar formato</button>
</div>
```

Los botones de la barra son soft y con borde, y el último pide su propio relleno. Una clase en el elemento siempre gana a la de un contenedor.

Los demás ejes no se heredan. La intención, la elevación (`.flat`, `.raised`, `.floating`) y el tamaño (`.sm`, `.lg`) cambian solo el elemento en el que están, así que una barra `.sm` no encoge sus botones; [Composición → Combinar clases](./composing.md#combinar-clases) explica por qué. Una clase de estética también define su propio patrón de esquina en su región, así que un `.cut-diagonal` por encima de una región `.pixel` no llega a su interior.

Usa una clase de contenedor cuando el aspecto pertenece a la región, como una barra lateral discreta, y no a los componentes que contiene.

## Tokens de tema y de material

Los tokens son propiedades personalizadas de CSS. Defínelo en `:root` y toda la página lo sigue; defínelo en un elemento y solo lo sigue lo que hay dentro. Llegan más lejos que las clases, porque los componentes los leen al dibujarse:

```css
.admin {
  --radius-control: 0.25rem;
  --radius-surface: 0.5rem;
  --border-width: 2px;
}
```

Cada botón, campo, burbuja de tooltip y superficie dentro de `.admin` toma las esquinas más cerradas y el borde más grueso, sin una clase en ninguno de ellos. Las casillas de verificación, `.kbd` y `.code` mantienen su propia esquina más pequeña, `--radius-small`.

Las tablas están donde se explican los tokens, así que esta página no las repite:

- [Temas → Tokens de color](./theming.md#tokens-de-color): colores de marca y de estado, en los dos temas.
- [Temas → Tokens base](./theming.md#tokens-base): esquinas, grosor del borde, altura de los controles, anillo de foco, profundidad y movimiento.
- [Personalización → Tokens de presentación](./customizing.md#tokens-de-presentación): cuánto aportan un relleno, un borde o un hover.
- [Personalización → Tokens de material](./customizing.md#tokens-de-material): lo que define una estética, y que puedes definir tú, como `--ui-radius`.
- [Personalización → Tokens de estética](./customizing.md#tokens-de-estética): los controles de cada estética, como `--neo-offset`.

Usa tokens cuando el cambio es un valor, como un color o una esquina, y no una elección entre clases.

## Tus propias clases de componente

Con los puntos de entrada de código fuente de Tailwind, cada componente, helper y clase de eje es una utilidad de Tailwind, así que una clase tuya puede llevar la receta completa:

```css
@import "@codenhub/styles/tw";

@utility btn-save {
  @apply btn primary soft sm;
}
```

```html
<button class="btn-save" type="submit">Guardar cambios</button>
```

`btn-save` se comporta como `btn primary soft sm` escrito completo, con estéticas y hover incluidos, y cambiar la receta cambia todos los botones de guardar. Los modificadores que pertenecen a un componente, como `.tight` en `.stack` o `.icon` en `.btn`, también son utilidades, así que `@apply btn icon` te da un botón de icono propio. [Tailwind CSS v4 → Construir tus propios componentes con `@apply`](../integrating/tailwind.md#construir-tus-propios-componentes-con-apply) tiene las reglas, incluido por qué `@utility` es mejor que una regla simple.

Con el CSS compilado no hay `@apply`. Guarda la receta en un solo lugar del otro lado: un parcial de plantilla, un componente de tu framework o una constante como `const saveButton = "btn primary soft sm"`.

Usa tu propia clase cuando la misma combinación nombra una sola cosa de tu diseño, como el botón de guardar o la tarjeta de plan.

## Siguiente paso

[Accesibilidad](../accessibility.md) enumera lo que el CSS hace por tus usuarios y lo que tu aplicación todavía les debe.
