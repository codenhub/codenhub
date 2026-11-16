---
title: Comando de build
description: Escribe una hoja de estilos con solo los iconos que usan tus archivos, para un proyecto que no ejecuta Tailwind CSS, Vite ni PostCSS.
order: 5
source: 31d4c3332f84d29527f07220bf97c5392efc13e6
---

# Comando de build

Para un proyecto sin Tailwind CSS, Vite ni PostCSS, como una app de Rails, Laravel o Django, o un sitio estático, el comando `build` lee tus archivos, encuentra las clases de icono que usan y escribe una hoja de estilos con solo esos iconos. Una página con tres iconos recibe unos 10 KB de CSS en lugar de una hoja de estilos de familia completa, donde Lucide por sí sola pesa unos 1.3 MB, y el modificador de grosor de trazo `ic-lucide-heart/1.5` funciona como con los plugins.

Ejecútalo desde un script de `package.json`, donde el comando del paquete se llama `chi`:

```json
{
  "scripts": {
    "build:icons": "chi build --content \"app/views/**/*.erb\" --output public/icons.css"
  }
}
```

O ejecútalo una vez sin script:

```sh
npx @codenhub/icons build --content "app/views/**/*.erb" --output public/icons.css
```

Usa `npx @codenhub/icons`, no `npx chi`: existe en npm un paquete no relacionado llamado `chi`, y `npx chi` lo ejecuta donde este paquete no está instalado.

Después enlaza la hoja de estilos que escribió. Ya contiene las reglas base `.ic`, así que no se importa nada más:

```html
<link rel="stylesheet" href="/icons.css" />
```

Ejecuta el comando de nuevo cada vez que tus archivos cambien los iconos que usan, como mínimo antes de cada despliegue. Escribe las mismas reglas que el [plugin de PostCSS](postcss.md) añade para los mismos archivos y opciones, así que un proyecto puede pasar de uno a otro sin que cambie su CSS.

## Opciones

| Flag                          | Propósito                                                                                                |
| ----------------------------- | -------------------------------------------------------------------------------------------------------- |
| `-c`, `--content <glob>`      | Archivos donde buscar clases de icono. Obligatorio y repetible.                                          |
| `-o`, `--output <file>`       | Hoja de estilos que se escribe. Obligatorio. Se crean las carpetas superiores.                           |
| `--family <prefix>`           | Una familia de la que resolver iconos. Repetible. Por defecto, todas excepto las de marcas.              |
| `--default-prefix <prefix>`   | Familia contra la que se resuelve un nombre sin familia, como `ic-heart`. Sin él, no se resuelve.        |
| `--prefix <prefix>`           | Prefijo de clase. Por defecto, `ic`.                                                                     |
| `--stroke-width <width>`      | Valor por defecto para las familias de trazos cuyas clases no llevan modificador.                        |
| `--no-base`                   | Omite las reglas base `.ic`, para una página que ya las carga desde `@codenhub/icons`.                   |
| `--attribution <auto \| off>` | `auto` escribe los avisos de licencia como un comentario al inicio; `off` no escribe ninguno. Ver abajo. |
| `--help`, `--version`         | Muestra el uso o la versión del paquete.                                                                 |

Cada opción es la del plugin de PostCSS, con el mismo valor por defecto, excepto `--family`. El plugin no resuelve ninguna familia hasta que le pasas una, mientras que el comando resuelve todas excepto `simple-icons` y `logos`, las familias de marcas, cuyos logotipos llevan los términos de marca de sus dueños. Nombra una familia de marcas para usarla, junto con todas las demás familias que uses, ya que nombrar una reemplaza el valor por defecto:

```sh
npx @codenhub/icons build --content "templates/**/*.html" --output static/icons.css --family lucide --family simple-icons
```

`--content` lee los globs como el plugin de PostCSS: relativos a la carpeta donde ejecutas el comando, con `**` para cualquier número de carpetas y `{html,erb}` para cualquiera de las dos extensiones. Una ruta que nombra un archivo existente se lee como ese archivo, aunque su nombre lleve un corchete, como el `app/[id]/page.tsx` de Next.js. Pon cada glob entre comillas, con `\"` dentro de un script de `package.json`, para que tu shell no lo expanda antes.

Escribe cada clase de icono completa en un archivo que el comando lea: una clase armada en tiempo de ejecución, como `` `ic-${name}` ``, no está en los archivos, así que su icono no recibe regla ni aviso. Cuando el nombre viene de datos, escribe completa cada clase que puede tomar en un archivo bajo `--content`.

## Atribución

Con `--attribution auto`, el valor por defecto, la hoja de estilos empieza con un comentario preservado que lleva el aviso de licencia de cada familia que usó. Un minificador lo conserva salvo que esté configurado para eliminar los comentarios legales, como con `legalComments: "none"`, así que conserva los comentarios legales en la configuración de tu minificador. Con `off`, no lleva ninguno, y el comando avisa cuando una familia que usó exige un aviso, para que lo distribuyas de otra forma. [Licencias](../licensing.md) explica qué exige cada familia.

## Fallos y avisos

El comando se detiene, no escribe nada e imprime una línea que empieza por `chi:` cuando el build saldría mal:

- **`--content "<glob>" matches no file in <folder>`.** Suele ser una errata, o el comando ejecutándose desde otra carpeta que la raíz de tu proyecto. Un build con archivos que faltan escribiría una hoja de estilos sin algunos iconos, y el sitio los perdería sin aviso.
- **Un archivo que no puede leer**, con el propio mensaje de Node.js.
- **`unexpected argument "<file>"`.** Casi siempre es un glob de `--content` sin comillas, que tu shell expandió. Pon el glob entre comillas.
- **`unknown family`, `unknown default prefix`**, con la lista de los válidos, y **un `--attribution` distinto de `auto` u `off`**, o **un `--stroke-width` que no es un número positivo**.
- **Un Node.js anterior a 26**, nombrando ambas versiones.

Una clase que no resuelve a ningún icono, como un `ic-lucide-hart` mal escrito, es un aviso, no un fallo: el comando lista cada una de esas clases una vez y escribe igualmente la hoja de estilos. Una palabra que solo parece una clase, como texto `ic-` en un comentario, detendría si no un build.

## Lo que no hace

- **SVG en línea y módulos por icono.** Cambian tus archivos fuente o sirven módulos a un bundler. Usa el [plugin de Vite](vite.md).
- **Un registro personalizado o un conjunto de iconos adoptado.** Requieren valores de JavaScript. Usa un plugin.
- **Modo watch, archivo de configuración y minificación.** Ejecuta el comando desde tu propio watcher o script de build, y minifica su salida en tu propio pipeline si minificas CSS.

## Ver también

- [Métodos de entrega](index.md) — cómo se comparan los métodos.
- [Plugin de PostCSS](postcss.md) — las mismas reglas, desde un pipeline de PostCSS.
- [Frameworks](../frameworks/index.md) — lo siguiente en el orden de lectura.
