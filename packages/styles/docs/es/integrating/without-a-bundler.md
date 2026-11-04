---
title: Sin bundler
description: Enlazar las hojas de estilos compiladas desde HTML simple, Rails, Django o cualquier aplicación renderizada en el servidor.
order: 6
source: c18a6d2488839883d8171685e9916225c4eb98fd
---

# Sin bundler

Las hojas de estilos compiladas son CSS terminado: cada una es un único archivo sin `@import` ni referencias a otro archivo, y cada imagen que dibuja va incrustada como URL `data:`: las máscaras del tick y del guion del checkbox, y los filtros de lente SVG que usa `.glass-liquid`. Una página puede cargar una con una simple etiqueta `<link>`, desde cualquier servidor, sin paso de build, y la hoja de estilos no hace más peticiones.

Lo que necesita una herramienta de build es el _nombre_ del import. `@import "@codenhub/styles"` nombra un paquete, y encontrar el archivo que hay detrás de ese nombre, `node_modules/@codenhub/styles/dist/index.css`, lo hacen herramientas que conocen Node, como Vite, webpack o la CLI de Tailwind, que leen el mapa `exports` del paquete. Un navegador no: resuelve la URL de un `@import` respecto a la hoja de estilos que lo contiene y un `<link href>` respecto a la página, así que un nombre de paquete sin más se convierte en una petición a una ruta que no existe. Sin bundler, enlaza el archivo por su ruta.

Los puntos de entrada `/tw` son código fuente de Tailwind y necesitan un build de Tailwind. `/tw/aesthetics` es la excepción, CSS simple sin nada que Tailwind tenga que procesar, pero sin bundler enlaza en su lugar los archivos compilados de `dist/aesthetics/`, como se muestra abajo. Esta página cubre solo los puntos de entrada compilados, para una página que no tiene ningún build de CSS: HTML simple, Rails, Django o cualquier aplicación renderizada en el servidor.

## Qué archivo enlazar

Cada ruta de import compilada es un archivo en la carpeta `dist/` del paquete:

| Ruta de import                  | Archivo                                                        |
| ------------------------------- | -------------------------------------------------------------- |
| `@codenhub/styles`              | `dist/index.css`                                               |
| `@codenhub/styles/theme`        | `dist/theme.css`                                               |
| `@codenhub/styles/components`   | `dist/components.css`                                          |
| `@codenhub/styles/native`       | `dist/native.css`                                              |
| `@codenhub/styles/palette`      | `dist/palette.css`                                             |
| `@codenhub/styles/aesthetics`   | `dist/aesthetics/index.css`                                    |
| `@codenhub/styles/aesthetics/*` | `dist/aesthetics/<name>.css`, como `dist/aesthetics/pixel.css` |

Enlaza primero el archivo base y después una estética. [Configuración inicial → Todos los puntos de entrada](../setup.md#todos-los-puntos-de-entrada) explica qué contiene cada uno; enlaza un solo archivo base, no varios, porque se solapan.

## Desde un CDN

jsDelivr y unpkg sirven todos los archivos de cada versión publicada en npm, así que una página puede enlazar uno sin instalar nada:

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@codenhub/styles@0.7.0/dist/index.css" /> <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@codenhub/styles@0.7.0/dist/aesthetics/pixel.css" />
```

Pon la versión exacta en la URL. Sin ella, el CDN sirve la última versión, y por debajo de 1.0 una versión menor puede renombrar o eliminar una clase; consulta [Versionado](../index.md#versionado).

## Desde tu propio servidor

Instala el paquete y después sirve su carpeta `dist/` como archivos estáticos:

```sh
npm install @codenhub/styles
```

Cada framework sirve de forma distinta una carpeta de `node_modules`, así que abajo está cada uno. Donde el framework lee la carpeta en su sitio, como hacen Rails y Django, actualizar el paquete y volver a desplegar es todo lo que hace falta para una actualización.

### HTML simple

Copia `node_modules/@codenhub/styles/dist` en la carpeta que publica tu servidor y después enlázala:

```html
<link rel="stylesheet" href="/vendor/codenhub-styles/index.css" />
```

Repite la copia después de cada actualización, por ejemplo desde un script `postinstall` de npm.

### Ruby on Rails

Una aplicación Rails construida con `cssbundling-rails` ya usa un bundler: importa el paquete desde `app/assets/stylesheets/application.css` como en [Configuración inicial → Importar la hoja de estilos](../setup.md#importar-la-hoja-de-estilos).

Con Propshaft y sin bundler de CSS, añade la carpeta del paquete a las rutas de assets:

```ruby
# config/initializers/assets.rb
Rails.application.config.assets.paths << Rails.root.join("node_modules/@codenhub")
```

Después enlázala desde el layout, por su ruta dentro de esa carpeta:

```erb
<%# app/views/layouts/application.html.erb %>
<%= stylesheet_link_tag "styles/dist/index" %>
<%= stylesheet_link_tag "styles/dist/aesthetics/pixel" %>
```

Apunta la ruta a `node_modules/@codenhub` y no directamente a `dist/`. Propshaft sirve los archivos por su ruta dentro de cada carpeta de assets, así que añadir `dist/` directamente publicaría un `index.css` suelto que choca con cualquier `index.css` tuyo.

### Django

Añade la carpeta a `STATICFILES_DIRS` con un prefijo, que mantiene sus nombres de archivo separados de tus propios archivos estáticos:

```python
# settings.py
STATICFILES_DIRS = [
    ("codenhub-styles", BASE_DIR / "node_modules/@codenhub/styles/dist"),
]
```

```django
{% load static %}
<link rel="stylesheet" href="{% static 'codenhub-styles/index.css' %}" />
```

### Laravel

Una aplicación Laravel usa Vite por defecto, así que tiene un bundler: importa el paquete desde `resources/css/app.css` como en [Configuración inicial → Importar la hoja de estilos](../setup.md#importar-la-hoja-de-estilos), y carga ese archivo con la directiva `@vite` como de costumbre.

## Comprobar que funciona

Renderiza un elemento con estilo, como en [Integración → Comprobar que funciona](./index.md#comprobar-que-funciona):

```html
<button class="btn primary">Save changes</button>
```

Un botón redondeado relleno con el color principal significa que la hoja de estilos se ha cargado. Si el botón se ve como el predeterminado del navegador, abre el panel de red del navegador: un `404` en la hoja de estilos significa que la ruta o la configuración de archivos estáticos es incorrecta.

## Siguiente paso

Vuelve al camino principal: [Construir una pantalla](../concepts.md) añade la primera tarjeta y el primer formulario a la página de ajustes. [Configuración inicial → Todos los puntos de entrada](../setup.md#todos-los-puntos-de-entrada) enumera todas las demás hojas de estilos que puedes importar.
