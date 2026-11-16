---
title: Introducción
description: Sistema de iconos sin runtime para la web — las clases de icono en tu marcado se convierten en reglas de máscara CSS en tiempo de build.
source: 488a9d5dc317d8c4723950a8660e38e4e260e846
---

# Iconos mediante CSS, sin runtime

Poner iconos en una página web suele implicar una de tres tareas pesadas: copiar archivos SVG a mano, envolver cada glifo en un componente de framework solo para mostrar un icono, o arrastrar toda una librería de iconos a tu bundle de JavaScript — y después pasar un viernes por la tarde rastreando avisos de licencias MIT, ISC y Apache-2.0. `@codenhub/icons` existe para ahorrarte las tres cosas.

Escribe una clase como `ic-lucide-heart` en tu HTML y el build la convierte en una regla de máscara CSS. No hay capa de componentes, ni librería de iconos en tu bundle, ni nada que importar por cada icono: sin JavaScript dando vueltas solo para dibujar un corazón. El paquete incluye 15 familias base generadas que suman más de 36,000 iconos, cada una con los avisos de licencia que su material gráfico requiere, además de dos familias de marcas opcionales: más de 3,000 logotipos monocromáticos y más de 2,000 a todo color.

## Configuración

### Instalación

```sh
pnpm add @codenhub/icons
```

### Inicio rápido

Los iconos llegan al proyecto a través de CSS. El camino más corto sin paso de build son las reglas base más una hoja de estilos de familia: cero configuración necesaria, siempre que no te importe cargar la familia entera:

```css
@import "@codenhub/icons";
@import "@codenhub/icons/lucide";
```

```html
<!-- independiente -->
<i class="ic-lucide-heart" aria-hidden="true"></i>

<!-- junto a una etiqueta -->
<button><i class="ic-lucide-check" aria-hidden="true"></i>Submit</button>
```

Un icono es un `<i>` que lleva una clase de icono (o `.ic` en cualquier elemento, en los métodos basados en CSS). El tamaño y el color siguen custom properties: define `--ic-size` y `--ic-color` en el icono o en cualquier ancestro, o usa las clases de tamaño `ic-xs`–`ic-xl`. Los iconos siguen el color del texto, salvo los iconos de marca, que llegan en su color de marca; consulta [Color](concepts.md#color).

Cuatro métodos de entrega entienden las mismas clases: CSS simple, Tailwind CSS v4, un plugin de Vite y un plugin de PostCSS. Los plugins escanean tu marcado y emiten únicamente las reglas que usaste; las hojas de estilos de familia en CSS simple están completas y son grandes por diseño. Consulta [Métodos de entrega](delivery/index.md) para elegir uno, y [Frameworks](frameworks/index.md) para la configuración específica de cada framework.

## Requisitos

| Requisito    | Detalles                                                                                  |
| ------------ | ----------------------------------------------------------------------------------------- |
| Node.js      | 26 o posterior, para los plugins y helpers en tiempo de build.                            |
| Imports CSS  | Las herramientas del proyecto deben resolver imports de CSS desde paquetes.               |
| Navegadores  | Debe soportar `mask-image` en CSS, que usan todos los métodos salvo el modo SVG en línea. |
| Tailwind CSS | Versión 4 o posterior, y solo para los puntos de entrada `/tw` y `/tailwind`.             |
| Opcional     | `vite` >= 5.0.0 para el plugin de Vite, `postcss` >= 8.0.0 para el plugin de PostCSS.     |

## Orden de lectura

La primera vez, léelas en orden. Cada página parte de la anterior y apunta a la siguiente:

1. [Conceptos](concepts.md): familias, cómo encontrar nombres de iconos, resolución de nombres, color, grosor de trazo, tamaño, movimiento y accesibilidad — el modelo compartido sobre el que se apoya cada método de entrega.
2. [Métodos de entrega](delivery/index.md): las cuatro formas en que los iconos llegan a tu CSS y cómo elegir la que encaja con tu build.
3. [Frameworks](frameworks/index.md): configuración y particularidades de cada framework para Astro, Next.js y SvelteKit.
4. [API de JavaScript](javascript-api.md): el registro, los renderizadores, la reproducción en tiempo de ejecución y el adaptador para conjuntos de terceros, para cuando sales de un build estándar de CSS.
5. [Licencias](licensing.md): modos de atribución, niveles de obligación, notas sobre marcas registradas y qué debe incluir cada build.
6. [Solución de problemas](troubleshooting.md): un icono que no renderiza nada, que sale como un cuadrado sólido o que tiene el grosor incorrecto.

Cuando necesites consultar una exportación u opción concreta, la [referencia de la API](../reference/index.md) enumera todas las exportaciones de `@codenhub/icons`, `/vite`, `/postcss` y `/play`.
