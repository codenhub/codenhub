---
title: Sin bundler
description: Enlazar las hojas de estilos compiladas desde HTML simple, Rails, Laravel, Django o cualquier aplicación renderizada en el servidor, y el build por línea de comandos.
order: 6
source: a78ea106637488608ee267f351e4d670916b703d
---

# Sin bundler

Las hojas de estilos compiladas son CSS terminado: cada una es un único archivo sin `@import` ni referencias a otro archivo, y cada imagen que dibuja va incrustada como URL `data:`: las máscaras del tick y del guion del checkbox, y los filtros de lente SVG que usa `.glass-liquid`. Una página puede cargar una con una simple etiqueta `<link>`, desde cualquier servidor, sin paso de build, y la hoja de estilos no hace más peticiones.

Lo que necesita una herramienta de build es el _nombre_ del import. `@import "@codenhub/styles"` nombra un paquete, y encontrar el archivo que hay detrás de ese nombre, `node_modules/@codenhub/styles/dist/index.css`, lo hacen herramientas que conocen Node, como Vite, webpack o la CLI de Tailwind, que leen el mapa `exports` del paquete. Un navegador no: resuelve la URL de un `@import` respecto a la hoja de estilos que lo contiene y un `<link href>` respecto a la página, así que un nombre de paquete sin más se convierte en una petición a una ruta que no existe. Sin bundler, enlaza el archivo por su ruta.

Los puntos de entrada `/tw` son código fuente de Tailwind y necesitan un build de Tailwind. `/aesthetics/tw` es la excepción, CSS simple sin nada que Tailwind tenga que procesar, pero sin bundler enlaza en su lugar los archivos compilados de `dist/aesthetics/`, como se muestra abajo. Esta página es para una página que no tiene un build de CSS con Node.js: HTML simple, Rails, Laravel, Django o cualquier aplicación renderizada en el servidor. Hay dos caminos:

1. **Enlazar la hoja de estilos compilada.** No necesita más que archivos estáticos. Envías todas las clases, las usen tus páginas o no.
2. **Generar una hoja de estilos con el comando `chs build` del paquete.** Escanea tus plantillas y escribe una hoja de estilos con solo las clases que usan. Consulta [Generar solo las clases que usas](#generar-solo-las-clases-que-usas).

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

Enlaza un solo archivo base, no varios, porque se solapan, y las estéticas que uses. Su orden no importa, porque cada archivo declara las [capas de cascada](../setup.md#capas-de-cascada) antes de usar alguna. [Configuración inicial → Todos los puntos de entrada](../setup.md#todos-los-puntos-de-entrada) explica qué contiene cada uno.

## Desde un CDN

jsDelivr y unpkg sirven todos los archivos de cada versión publicada en npm, así que una página puede enlazar uno sin instalar nada:

```html
<head>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@codenhub/styles@0.11.0/dist/index.css" />
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@codenhub/styles@0.11.0/dist/aesthetics/pixel.css" />
</head>
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

Los archivos que enlazas están en `dist/`, que contiene CSS terminado sin `@import` que resolver, más un `index.d.cts` vacío para TypeScript y el comando `chs build` con los archivos que lee. El código fuente de Tailwind vive en `tw/`, fuera de `dist/`, así que un pipeline estático que sirve `dist/` o le añade huellas no encuentra ningún `@import` que no pueda resolver.

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

Apunta el prefijo a `dist`, no a la carpeta del paquete. `dist/` contiene CSS terminado sin `@import` que resolver, más un `index.d.cts` vacío para TypeScript y el comando `chs build` con los archivos que lee, que el almacenamiento copia tal cual, así que `collectstatic` también funciona con `ManifestStaticFilesStorage`, que añade una huella a cada archivo y reescribe las referencias que contiene. La carpeta del paquete también contiene el código fuente de Tailwind en `tw/`, cuyas líneas `@import "tailwindcss/..."` ese almacenamiento no puede resolver.

### Laravel

Una aplicación Laravel usa Vite por defecto, así que tiene un bundler: importa el paquete desde `resources/css/app.css` como en [Configuración inicial → Importar la hoja de estilos](../setup.md#importar-la-hoja-de-estilos), y carga ese archivo con la directiva `@vite` como de costumbre.

## Generar solo las clases que usas

El paquete trae un comando, `chs`, que lee tus plantillas en busca de nombres de clase y escribe una sola hoja de estilos minificada con solo las clases de StyleKit que usan. Una página que usa un botón recibe alrededor de una séptima parte de la hoja de estilos completa; el tamaño exacto depende de las clases que uses, porque cada componente trae las reglas compartidas de las que depende.

El comando también sirve con un bundler. Un proyecto cuyo bundler no ejecuta Tailwind, como un build simple con Vite o webpack, puede escribir la hoja de estilos entre sus fuentes, `--output src/stylekit.css`, e importar ese archivo donde importaría `@codenhub/styles`. Un proyecto que usa Tailwind CSS v4 obtiene la misma reducción con el [punto de entrada de código fuente](./tailwind.md) y no necesita el comando.

Necesita Node.js 24 o posterior en la máquina que genera el CSS, sea tu portátil, un job de CI o un paso del despliegue, y nada más: el paquete es toda la instalación, sin Tailwind y sin configuración. Instálalo como dependencia de desarrollo desde la raíz de tu proyecto; npm crea un `package.json` si no tienes uno:

```sh
npm install --save-dev @codenhub/styles
```

La hoja de estilos que escribe el comando es CSS simple, así que los servidores que sirven tu sitio no necesitan ni Node.js ni el paquete. Añade el build a los scripts de tu `package.json`, donde el comando instalado está en el path con su nombre:

```json
{
  "scripts": {
    "build:css": "chs build --content \"app/views/**/*.erb\" --output public/stylekit.css"
  }
}
```

Después ejecútalo desde la raíz de tu proyecto:

```sh
npm run build:css
```

Para ejecutarlo una sola vez sin un script, llámalo por el nombre del paquete:

```sh
npx @codenhub/styles build --content "app/views/**/*.erb" --output public/stylekit.css
```

No escribas `npx chs`. `chs` es el nombre del comando dentro de este paquete, pero npm también tiene un paquete sin relación llamado `chs`, y `npx chs` ejecuta ese en cualquier carpeta donde este paquete no esté instalado.

Si todo va bien, el comando imprime una línea: la ruta absoluta que escribió y el tamaño del archivo en bytes:

```text
/home/you/shop/public/stylekit.css 24497 bytes
```

Enlaza ese archivo desde tu layout como cualquier hoja de estilos estática. Un build también puede imprimir en la salida de error líneas que empiezan por `chs: warning:`, como describe [Cómo se encuentran las clases](#cómo-se-encuentran-las-clases); no cambian su estado de salida.

Cada ejemplo de abajo lee también los scripts que añaden clases en el navegador, como `.active` o `.indeterminate` en una [barra de progreso](../usage/feedback.md#mostrar-el-progreso), porque una clase que no nombra ningún archivo que lee el build se queda fuera. Quita ese `--content` si tus scripts no añaden ninguna, porque un glob que no coincide con nada hace fallar el build.

### Vistas de Rails

```json
"build:css": "chs build --content \"app/views/**/*.erb\" --content \"app/helpers/**/*.rb\" --content \"app/javascript/**/*.js\" --output public/stylekit.css"
```

```erb
<%# app/views/layouts/application.html.erb %>
<link rel="stylesheet" href="/stylekit.css" />
```

### Vistas Blade de Laravel

```json
"build:css": "chs build --content \"resources/views/**/*.blade.php\" --content \"resources/js/**/*.js\" --output public/css/stylekit.css"
```

```blade
{{-- resources/views/layouts/app.blade.php --}}
<link rel="stylesheet" href="{{ asset('css/stylekit.css') }}" />
```

### Plantillas de Django

Un proyecto Django guarda las plantillas en una carpeta `templates/` del proyecto, en la carpeta `templates/` de cada app, o en ambas. Pasa un `--content` por cada lugar donde estén las tuyas, y deja fuera los que no uses, porque un glob que no coincide con nada hace fallar el build:

```json
"build:css": "chs build --content \"templates/**/*.html\" --content \"shop/templates/**/*.html\" --content \"static/js/**/*.js\" --output static/stylekit.css"
```

```django
{% load static %}
<link rel="stylesheet" href="{% static 'stylekit.css' %}" />
```

Escribe la salida en una carpeta incluida en `STATICFILES_DIRS`, aquí `static/`, para que `collectstatic` la recoja. La configuración de arriba solo incluye la carpeta del paquete, así que añade `BASE_DIR / "static"` a esa lista si tu proyecto aún no la tiene.

### Opciones

- `--content <glob>`, o `-c <glob>`, indica los archivos en los que buscar nombres de clase. Es obligatorio y se puede repetir: pásalo una vez por glob, y el build lee todos los archivos que coincidan con alguno. Un glob relativo se resuelve respecto a la carpeta desde la que ejecutas el comando, así que ejecútalo desde la raíz de tu proyecto; un glob absoluto se usa tal cual. Una ruta que nombra un archivo existente se lee como ese archivo, aunque su nombre lleve un corchete, como el `app/[id]/page.tsx` de Next.js; solo una ruta que no nombra ningún archivo se lee como glob. En un glob, un `[` abre un conjunto de caracteres, así que `app/[locale]/**/*.tsx` coincide con una carpeta cuyo nombre es una de las letras `l`, `o`, `c`, `a` o `e`, no con `[locale]`: escribe el corchete como `[[]`, como en `app/[[]locale]/**/*.tsx`, que funciona en cualquier sistema, mientras que `\[` no funciona en Windows. Una carpeta no es un glob de los archivos que contiene: escribe `app/views/**/*`, no `app/views`. `**` coincide con cualquier número de carpetas, y `{rb,erb}` con cualquiera de las dos extensiones. Las llaves de un glob pueden representar como mucho 1.024 patrones, contando cada opción de una lista, como `{rb,erb}`, y cada paso de un rango, como `{1..9}`, y multiplicando los grupos de un glob: por encima, el build falla y lo dice, porque el glob de Node.js tarda segundos con unos miles y minutos con más, así que escribe un `*` en lugar de una lista larga. Sirve cualquier archivo de texto, tenga la extensión que tenga, en UTF-8 o en UTF-16 con marca de orden de bytes, como lo escribe el `>` de Windows PowerShell 5.1. Cada glob tiene que coincidir con al menos un archivo, o el build falla y lo nombra, así que una errata no puede publicar una hoja de estilos vacía. Los archivos que excluye tu `.gitignore` se leen igualmente cuando un glob coincide con ellos, y no se lee nada fuera de tus globs. Un `*` o un `**` tampoco entra en una carpeta `node_modules`, así que las páginas de demostración de una dependencia nunca añaden clases: nómbrala para leer una, como en `node_modules/some-ui/**/*.html`. Un `*` o un `**` no coincide con un nombre que empieza por punto, así que `**/*.html` omite tanto `.hidden/page.html` como `.page.html`; escribe el punto para llegar a ellos, como en `.hidden/**/*.html`. El archivo de `--output` nunca se lee en busca de clases, aunque un glob coincida con él o con un enlace a él, y tampoco un archivo temporal con su nombre, `<output>.<random>.tmp`, que un build detenido antes de terminar puede dejar a su lado; un glob que no coincide con nada más falla.
- Pon cada glob entre comillas, con `\"` dentro de un script de `package.json`. Sin comillas, tu shell puede expandir el glob a una lista de archivos antes de que el comando lo vea, y solo el primer archivo cuenta como valor de `--content`. Cuando eso deja nombres de archivo sobrantes, el build los rechaza en lugar de leer en silencio menos de lo que querías; cuando el glob coincidió con un solo archivo, el build lee solo ese archivo y nada de lo que tus plantillas añadan más adelante.
- `--output <file>`, o `-o <file>`, es la hoja de estilos que se escribe. Es obligatorio, y se da una sola vez. Una ruta relativa se resuelve respecto a la carpeta desde la que ejecutas el comando, las carpetas padre que falten se crean, y una hoja de estilos que el comando escribió antes se reemplaza. Para que no pierdas un archivo por error, lee los primeros bytes de un archivo existente y rechaza el que no empiece con el aviso `/*! @codenhub/styles` del paquete, con el que empieza todo lo que escribe, tras el banner de Tailwind. Un archivo vacío o con solo espacios en blanco se reemplaza, y se rechazan un archivo que no puede leer, uno que nombre una entrada de `--content` y `-`, igual que una carpeta, una ruta que termina en un separador de carpetas o en un segmento `.` o `..`, como `public/` o `public/.`, un dispositivo como `/dev/null`, una tubería o un socket. En Windows también se rechaza una ruta cuando un nombre en ella, del archivo o de una carpeta, es uno que Windows reserva para un dispositivo en cada carpeta, como `NUL`, `CON`, `COM1` o `LPT1`, con o sin extensión, termina en un punto o un espacio, que Windows descarta, o contiene un carácter que Windows no admite en ningún nombre: `<`, `>`, `"`, `|`, `?`, `*`, un carácter de control, o un `:` en cualquier lugar que no sea tras la letra de una unidad, como en `C:\`. Cuando `--output` es un enlace, se escribe el archivo al que lleva y el enlace se queda. En Linux y macOS, la hoja de estilos que reemplaza conserva sus permisos, su dueño y su grupo; solo root puede mantener a otro usuario como dueño, así que para cualquier otro el archivo pasa a ser suyo, conserva su grupo si pertenece a él, y el comando imprime en la salida de error una línea que empieza por `chs: warning:`, y aun así termina con estado 0. Un archivo tuyo de un grupo al que no perteneces sigue siendo tuyo y toma tu grupo, y el aviso nombra solo el grupo. Cuando cambia el dueño y los permisos no dejan leer el archivo a nadie más que a su dueño, como `0600`, el aviso dice además que el dueño anterior, como el usuario de tu servidor web, puede que ya no consiga leerlo; y cuando cambia el grupo y los permisos solo dejan leerlo al dueño y al grupo, como `0640`, dice lo mismo de los miembros del grupo anterior, como tu servidor web. Devuélveles el permiso de lectura, o ejecuta el build como el dueño del archivo, en su grupo.
- `--aesthetic <name>` añade una de las [estéticas](../usage/aesthetics.md): `neobrutalism`, `glass`, `pixel`, `chunky-tile`, `cyber` o `sketch`. Repítelo para más de una; nombrar una dos veces la incluye una sola vez. Las estéticas se piden explícitamente porque el build no puede saber por tus plantillas cuál quieres: cada una se añade cuando la pides, sin sus reglas para las clases que tus plantillas no usan, y no se incluye ninguna cuando no lo haces. Cuando un archivo que lee el build nombra una clase de una estética, como `glass` o `glass-liquid`, y no pediste esa estética, el build escribe igualmente la hoja de estilos, sin ella, e imprime una línea `chs: warning:` que nombra la clase y el `--aesthetic` que añadir. También cuenta una palabra en un texto, así que una página que dice "pixel" o "sketch" puede imprimirla sin motivo.
- `--no-minify` escribe en su lugar CSS legible e indentado. Sirve para leer lo que generó el build; en producción sirve el archivo minificado.
- `--help`, o `chs help`, imprime el uso, con las estéticas que trae esta versión. `--version` imprime la versión del paquete. Ninguno genera nada, y todos terminan con estado 0.

La salida siempre contiene el tema, sus design tokens como propiedades personalizadas de CSS, el reset, las reglas base de las que dependen todos los componentes y cuatro clases, las nombre o no un archivo: `.dark`, `.theme-dark` y `.theme-light`, que cambian el tema, y `.disabled`. Encima va cada clase de StyleKit que usan los archivos que lee el build. Cualquier otra clase que un script añade en el navegador, como `.active` o `.indeterminate` en una barra de progreso, se conserva solo cuando la nombra un archivo que lee el build, así que pasa también tus scripts con un `--content`. La salida se construye a partir de la hoja de estilos completa, no de `/native`, así que no incluye los mapeos sin clases. Un build cuyas plantillas nombran todas las clases escribe la hoja de estilos completa, byte a byte.

### Cómo se encuentran las clases

El build no ejecuta tus plantillas. Lee como texto simple cada archivo que coincide con tus globs de `--content`, recoge cada palabra que podría ser un nombre de clase y escribe las reglas de las palabras que son clases de StyleKit. Tailwind CSS también lee el contenido así.

Solo se leen los archivos con los que coinciden tus globs, así que una clase que solo añade un script, como en `bar.classList.add("indeterminate")`, se encuentra solo cuando el script es uno de ellos. Nombra tus scripts con su propio `--content`, como `app/javascript/**/*.js`.

Una clase tiene que aparecer en un archivo como una palabra completa. `class="btn primary"`, `class: "btn primary"` y `classes = ["btn", "primary"]` funcionan, y también una clase escrita antes o después de dos puntos, como en `class:primary={isPrimary}` de Svelte o en `btn: true` de un hash de Ruby. Una palabra que solo parece una clase también cuenta: un comentario que dice "card" añade todas las reglas de la tarjeta a la hoja de estilos, lo que agranda el archivo y no cambia nada en la página.

Un nombre de clase que tu código arma al renderizar nunca aparece completo en ningún archivo, así que el build no puede encontrarlo. En `class="btn <%= @order.priority %>"`, `btn` se encuentra, pero la intención es lo que contenga `priority` al renderizar; si es `destructive`, el botón se renderiza sin su rojo. Hay dos salidas:

- **Escribe los nombres de clase completos.** Asigna cada valor a un nombre de clase completo en un archivo que el build lea, como `{ "urgent" => "destructive", "normal" => "neutral" }.fetch(@order.priority)` en un helper.
- **Enuméralos en un archivo de safelist.** Un archivo de texto simple con un nombre de clase por línea, añadido con su propio `--content`, como `--content config/stylekit-classes.txt`. Guárdalo junto al código que arma los nombres de clase, para que quien cambie uno vea el otro.

Algunos archivos con los que coincide un glob no se leen en busca de clases, porque cada uno nombra todas las clases del paquete y conservaría la hoja de estilos entera: un archivo que empieza con el aviso `/*! @codenhub/styles` del paquete, con el que empieza toda hoja de estilos que escribe el comando, así que dos builds sobre una misma carpeta nunca se leen entre sí; una lista de nombres de clase copiada de `dist/purge/classes.json` del paquete; y un archivo idéntico, byte a byte, a uno que la versión instalada trae en `dist/`, como las copias que hacen `collectstatic` o Propshaft. Una copia de otra versión del paquete que no empieza con el aviso, como una estética o `theme.css` que un despliegue anterior dejó en `STATIC_ROOT`, sí se lee, así que limita tus globs a tus plantillas y scripts en lugar de la carpeta donde se recogen tus archivos estáticos.

Una carpeta en la que un glob tiene que buscar y que no tienes permiso para listar hace fallar el build, que la nombra, en lugar de dejar fuera sus archivos.

Cuando los archivos no nombran ninguna clase de StyleKit, el build escribe igualmente el tema y el reset, y termina con estado 0, pero imprime una línea `chs: warning:` que nombra los globs, porque un glob que nombra los archivos equivocados dejaría el sitio sin estilos sin decir nada.

### Variantes

Una clase de intención, presentación o modificador puede llevar uno de diez prefijos, escritos como en Tailwind: `sm:`, `md:`, `lg:`, `xl:` y `2xl:` la aplican a partir de ese breakpoint, `hover:`, `focus:`, `focus-visible:` y `active:` mientras el elemento está en ese estado, y `dark:` allí donde se aplica el tema oscuro, como describe [Temas → La variante dark:](../usage/theming.md#la-variante-dark). `md:lg` hace grande un botón a partir del breakpoint `md`, y `hover:primary` le da la intención primary al pasar el cursor:

```html
<button class="btn sm md:lg ghost hover:soft">Save</button>
```

Eso abarca las intenciones como `primary` y `destructive`, las clases de relleno y de borde como `soft` y `edged`, y los modificadores como `sm`, `lg`, `raised`, `pill`, `tight` y `ruled`. `disabled` no lleva ninguno: es un estado en el que está el elemento, así que escríbelo como atributo o como clase. Las clases de componente como `btn` y `card`, y los helpers de texto y de layout, no llevan prefijo.

Cada prefijo es una copia fija de esas clases, incluida en el paquete, así que la lista recoge los más comunes y no todos los de Tailwind. El comando no apila prefijos, como en `md:hover:primary`, ni ofrece otros, como `print:` o `group-hover:`. Una clase así no recibe estilo, y el elemento se renderiza sin ella.

### Lo que no hace

- **No incluye utilidades de Tailwind.** `flex`, `mt-4`, `text-red-500` y el resto de Tailwind no son clases de StyleKit, así que el build las deja fuera. Para el layout, los propios [helpers de layout](../usage/content-and-layout.md) de StyleKit están en el build como cualquier otra clase. Un proyecto que quiere las utilidades de Tailwind, sus demás variantes o prefijos apilados ejecuta Tailwind por su cuenta e importa el [punto de entrada de código fuente](./tailwind.md), que da las tres cosas.
- **No tiene modo watch.** Genera una vez y termina. Vuelve a ejecutarlo después de cambiar una plantilla, desde un script o desde un observador de archivos que ya tengan tu framework o tu editor. Una clase que la hoja de estilos todavía no tiene deja su elemento sin estilo hasta el siguiente build.
- **No tiene archivo de configuración ni CSS propio.** No puedes añadir tus propios valores de `@theme`, definiciones de `@utility` ni plugins. Para cambiar el aspecto, sobrescribe las propiedades personalizadas en una hoja de estilos tuya cargada después de esta, como describe [Personalización](../usage/customizing.md).
- **No tiene otros comandos.** `build` es el único que genera, y `help` imprime el uso; `--help` y `--version` son los únicos flags que funcionan sin `build`.

### En un despliegue

Genera la hoja de estilos antes del paso que recoge o añade huella a tus assets, como `rails assets:precompile`, `php artisan optimize` o `python manage.py collectstatic`. Puedes hacer commit de la salida, de modo que los servidores no necesitan Node.js en absoluto, a cambio de un archivo generado que alguien tiene que acordarse de regenerar; o generarla en el despliegue, de modo que la máquina de build necesita Node.js 24 o posterior.

Fija la versión. Por debajo de 1.0 una versión menor puede renombrar o eliminar una clase, así que el mismo comando puede escribir otra hoja de estilos con una versión más nueva. La salida no depende de nada más que de la versión del paquete y de tus plantillas, así que haz commit de `package.json` y del lockfile que escribe npm, e instala con `npm ci` en la máquina de build, para que cada build use la versión que probaste.

### Cuando el build falla

Cada fallo imprime una línea que empieza por `chs:` en la salida de error estándar y termina con estado 1, sin escribir el archivo de salida, así que un script de despliegue se detiene en lugar de publicar una hoja de estilos desactualizada o vacía. La línea dice qué salió mal y qué hacer:

- **`missing --content` o `missing --output`.** Añade la que nombra. Un `--content` o un `--output` vacío o con solo espacios cuenta como ausente, como el que da una variable sin definir en `--content "$TEMPLATES"`.
- **`EACCES` o `EPERM`, nombrando una carpeta.** Un glob tiene que buscar en esa carpeta y no tienes permiso para listarla. Corrige sus permisos, o escribe el glob de modo que no entre en ella.
- **`--content "<glob>" matches no file in <folder>`.** Suele ser una errata en la ruta, un comando ejecutado desde una carpeta distinta de la raíz de tu proyecto, o un glob de un lugar que tu proyecto no usa. Generar a partir de nada escribiría una hoja de estilos sin clases de componente, y el sitio perdería sus estilos sin avisar. Cuando se conoce una causa más probable, la línea la nombra en lugar de la ruta: un `*` o un `**` que solo coincidió con archivos dentro de `node_modules`, donde no entra, o un `[` leído como el inicio de un conjunto de caracteres, cuando escribirlo como `[[]`, que lee un corchete, coincidiría con un archivo.
- **`--content "<path>" is a folder in <folder>, not a file`.** Nombra los archivos que contiene, como en `app/views/**/*`.
- **`--content "<glob>" expands to <count> patterns through its braces, more than the 1024 a glob may`.** Los grupos `{...}` del glob representan demasiados patrones juntos. Usa menos opciones, o un `*` en lugar de una lista larga.
- **`--content "<glob>" matches only --output <file>`.** El glob no coincidió con nada más que la hoja de estilos que escribe el build, que nunca se lee en busca de clases, como pasa con `public/*.css` una vez que el build escribió `public/stylekit.css`. Nombra las plantillas en su lugar.
- **`unexpected argument "<file>"`.** Casi siempre es un glob de `--content` sin comillas, que tu shell expandió a una lista de archivos. Pon el glob entre comillas.
- **`unknown option "<flag>"`.** Una errata, o una opción de otra herramienta, como `--watch` o `--config`. `--help` enumera las opciones.
- **`option "<flag>" is missing its value or does not take one`.** Un flag que lleva valor fue lo último de la línea, o se le dio un valor a `--no-minify`, como en `--no-minify=true`. Un valor que empieza por guion se lee como otro flag, así que la línea indica escribirlo después de `=`, como en `--output=-app.css`, salvo que lo que sigue sea una de las opciones del propio comando, como en `-c -o public/stylekit.css` o `-c -opublic/stylekit.css`, donde faltó el valor.
- **`--output is given more than once`.** Cada build escribe una sola hoja de estilos. Deja un solo `--output`, y vuelve a ejecutar el comando para otro archivo.
- **`unknown aesthetic "<name>"; choose from ...`.** Elige uno de los nombres de la lista. Van en minúsculas y con guion, como `chunky-tile`.
- **`missing command` o `unknown command "<name>"`.** La primera palabra después de `chs` tiene que ser `build`, o `help` para el uso.
- **`this command needs Node.js 24 or newer`.** Actualiza Node.js en la máquina que genera el CSS.
- **`cannot write --output <file>: <reason> (<code>); <what to do>`.** `<reason>` y `<code>` son los de Node.js. `EACCES` o `EPERM` significa que no puedes escribir ahí, y en Windows también que el archivo es de solo lectura; `ENOSPC` significa que el disco está lleno.
- **`--output <file> is a folder, not a file`**, o un dispositivo, una tubería o un socket, o **`--output <file> ends with a folder separator`**, o **`ends with a . or .. segment`**. Nombra un archivo de hoja de estilos, como uno dentro de la carpeta.
- **`--output <file> names "<name>", which Windows keeps for a device`**, **`which ends with a dot or a space that Windows drops`**, o **`holds "<character>", which Windows does not allow in a name`**. Solo en Windows. Un archivo o una carpeta con un nombre así, como `NUL`, `com1.css` o `app.css.`, es uno que `del` no puede borrar. Cambia el nombre de la parte que indica la línea.
- **`--output <file> holds something this command did not write`.** El archivo no es una hoja de estilos que escribió este comando, como una escrita a mano o la de un proveedor, así que reemplazarlo lo perdería. Nombra otro archivo o aparta este. Una copia de `@codenhub/styles`, `/components` o `/native` del paquete empieza con el mismo aviso, así que se reemplaza como una que escribió el comando; una copia de otro punto de entrada, como `/theme` o una estética, no, y se rechaza.
- **`--output <file> is also a --content file`.** La salida nombra una plantilla, como en `--content index.html --output index.html`. Nombra una hoja de estilos para escribir.
- **`cannot read --output <file> to check it is a stylesheet this command wrote`.** El archivo existe pero no puedes leerlo, así que el comando no puede saber si reemplazarlo perdería algo. Arregla sus permisos o nombra otro archivo.
- **`--output - would write a file named -`.** El comando solo escribe un archivo, nunca la salida estándar. Nombra una hoja de estilos.

## Comprobar que funciona

Renderiza un elemento con estilo, como en [Integración → Comprobar que funciona](./index.md#comprobar-que-funciona):

```html
<button class="btn primary">Save changes</button>
```

Un botón redondeado relleno con el color principal significa que la hoja de estilos se ha cargado. Si el botón se ve como el predeterminado del navegador, abre el panel de red del navegador: un `404` en la hoja de estilos significa que la ruta o la configuración de archivos estáticos es incorrecta.

## Siguiente paso

Vuelve al camino principal: [Construir una pantalla](../concepts.md) añade la primera tarjeta y el primer formulario a la página de ajustes. [Configuración inicial → Todos los puntos de entrada](../setup.md#todos-los-puntos-de-entrada) enumera todas las demás hojas de estilos que puedes importar.
