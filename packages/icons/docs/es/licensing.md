---
title: Licencias
description: Qué debe incluir cada build por el material gráfico que distribuye, los modos de atribución y cómo viaja el aviso según el método de entrega.
order: 5
source: ee37c2be06074477ad7b3efecbf5375cd3ba983c
---

# Licencias y atribución

Esta página explica qué debe incluir tu build por el material gráfico de iconos que distribuye, cómo funciona la opción `attribution`, cómo transporta cada método de entrega el aviso obligatorio y qué restricciones de marca registrada aplican a los iconos de marca.

Cada familia generada e incluida trae el texto de licencia y el aviso de atribución que su material gráfico requiere; esos archivos viajan con el paquete sin importar qué emita un build. Un conjunto de terceros adoptado mediante `adoptIconifySet` no está cubierto por esa garantía — aporta su licencia y su material de atribución por tu cuenta.

## Modos de atribución

La opción `attribution` controla cómo llegan los avisos de licencia a la salida de tu build:

| Modo             | Comportamiento                                                                                                                                                                                            |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auto` (defecto) | Antepondrá un encabezado `/*! … */` al CSS generado, nombrando solo las familias que usó el build. El modo SVG en línea de Vite, que no tiene hoja de estilos, emite `icons-attribution.txt` en su lugar. |
| `file`           | Emite `icons-attribution.txt` como un asset del build en su lugar. Solo en Vite.                                                                                                                          |
| `off`            | No emite nada, y avisa cuando una familia usada sigue requiriendo un aviso.                                                                                                                               |

## Cómo viaja el aviso

Cada método de entrega transporta el aviso a través de un mecanismo que su pipeline soporta:

| Método             | Cómo viaja el aviso                                                                                           |
| ------------------ | ------------------------------------------------------------------------------------------------------------- |
| Vite               | Un encabezado `/*! … */` en el CSS generado, o `icons-attribution.txt` bajo `file` y en el modo SVG en línea. |
| PostCSS            | Un encabezado `/*! … */` en el CSS generado.                                                                  |
| Tailwind `/tw`     | Un encabezado `/*! … */` al inicio de `dist/tw/index.css`, nombrando cada familia que resuelve.               |
| Tailwind `@plugin` | Una custom property `--ic-attribution-<family>` en `:root`, una por cada familia que usó el build.            |
| CSS simple         | Un encabezado `/*! … */` al inicio de cada hoja de estilos de familia que importaste.                         |

`@import "@codenhub/icons/tw"` inserta un archivo estático, así que lleva un encabezado `/*! … */` normal. Como ese archivo hace resolubles todas las familias incluidas salvo las de marcas, el encabezado nombra todas esas familias base — un aviso superconjunto que satisface de forma segura el requisito de licencia. Declarar el plugin por tu cuenta con `@plugin "@codenhub/icons/tailwind"` acota la resolución, y allí el aviso se emite como una custom property `--ic-attribution-<family>` en su lugar: la API de plugins de Tailwind genera declaraciones CSS en lugar de comentarios, y la propiedad se emite la primera vez que una familia produce una utilidad, de modo que la salida lleva avisos solo para el material gráfico que realmente distribuyó.

## Niveles de obligación

Las licencias permisivas siguen teniendo distintos requisitos de distribución, agrupados en tres niveles:

- **`none`** — dedicaciones al dominio público. No se debe nada en la salida distribuida.
- **`notice`** — MIT, ISC y Apache-2.0. El aviso de copyright y licencia debe acompañar a la salida distribuida, algo de lo que `auto` y `file` se encargan automáticamente.
- **`credit`** — CC-BY y licencias similares. El autor debe recibir crédito de forma visible.

Todas las familias incluidas excepto `simple-icons` y `logos` pertenecen al nivel `core`, lo que significa que su nivel de obligación es `none` o `notice`, así que un build por defecto cumple sus términos de licencia automáticamente. Ten en cuenta que un minificador configurado con `legalComments: "none"` elimina los comentarios CSS, incluidos los encabezados `/*! … */`; usa `attribution: "file"` en Vite, o conserva los comentarios legales en la configuración de tu minificador.

Un conjunto adoptado mediante `adoptIconifySet` pertenece al nivel `extended`: sigues siendo responsable de cumplir sus términos de licencia y de aportar su material de atribución. Consulta [API de JavaScript](javascript-api.md).

## Familias de marcas

`simple-icons` y `logos` pertenecen al nivel `brand`: logotipos monocromáticos de [Simple Icons](https://simpleicons.org) y logotipos a todo color de [gilbarbara/logos](https://github.com/gilbarbara/logos), ambos dedicados al dominio público bajo CC0. Ninguna de las dos familias debe un aviso de licencia, pero un logotipo es una marca registrada, y la marca registrada es independiente de la licencia de derechos de autor: usar una marca sigue estando sujeto a las guías de marca de su propietario, algo que ninguna opción de build puede satisfacer ni verificar.

- **Solo bajo activación explícita.** Vite y PostCSS cargan únicamente las familias que pasas. `@codenhub/icons/tw` nunca resuelve familias de marcas; un `@plugin "@codenhub/icons/tailwind"` declarado las resuelve solo cuando su opción `families` las nombra.
- **Línea de aviso de marca registrada.** La línea de aviso de cada familia, dondequiera que el build emita una, declara que los signos son marcas registradas de sus propietarios. Fijar `attribution: "off"` la suprime sin advertencia porque ninguna licencia la exige.
- **Entradas excluidas de Simple Icons.** Simple Icons registra una licencia aparte para algunos iconos. Los iconos cuya propia licencia añade alguna obligación quedan excluidos, así que ningún icono de la familia lleva una obligación de licencia registrada: cada uno es CC0, Unlicense o no tiene ninguna licencia registrada en el proyecto original.
- **Recoloreado y guías.** Cada icono de marca se renderiza con sus colores de marca por defecto, y `--ic-color` puede recolorearlo; un logotipo a todo color se convierte en una silueta monocromática. Las guías de los propietarios suelen permitir una marca en sus colores oficiales o en monocromo simple y restringir colores arbitrarios; consulta los términos del propietario al recolorear una marca. Consulta [Color](concepts.md#color).
- **Eliminaciones en Simple Icons.** Simple Icons elimina iconos cuando los propietarios de las marcas lo solicitan. Actualizar el paquete a través de una versión mayor del proyecto original puede eliminar nombres de iconos; consulta el changelog para ver los nombres eliminados.
- **Origen fijado de `logos`.** gilbarbara/logos no publica lanzamientos versionados, así que `logos` se genera desde un commit fijado, y actualizarlo puede eliminar o renombrar logotipos; consulta el changelog para ver los cambios. Unos pocos archivos originales cuyo marcado no puede renderizarse como un icono autónomo, como archivos que incrustan un mapa de bits, quedan excluidos, y el archivo `ATTRIBUTION.md` de la familia los enumera.

## Siguiente paso

Lee [Solución de problemas](troubleshooting.md) si un icono no aparece, se renderiza como un cuadrado sólido, ignora el grosor de trazo o pierde su aviso de licencia.
