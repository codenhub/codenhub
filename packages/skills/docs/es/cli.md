---
title: Instalador CLI
description: Instala las skills seleccionadas de forma local o global, elige los harnesses de destino y automatiza las actualizaciones.
order: 2
source: ef1ab911764995d981a00857ef67223eb8b30162
---

# Instala skills en tus herramientas de agentes

Una vez que hayas [elegido las skills](skills.md), el instalador copia sus carpetas en las ubicaciones que leen tus herramientas de agentes. Esta guía instala `brainstorming` y `test-driven-development` para Claude y Codex en un proyecto, y luego deja las mismas dos disponibles de forma global.

El ejecutable se llama `codenhub-skills`. Ejecútalo sin añadir una dependencia al proyecto mediante un ejecutor de paquetes:

```sh
pnpm dlx @codenhub/skills@latest
```

Usa `npx @codenhub/skills@latest` como equivalente con npm. Se requiere Node.js 24 o posterior.

## Empieza en un proyecto

Abre una terminal en el directorio del repositorio donde quieres las skills. Las rutas locales son relativas al directorio actual, por lo que ejecutar el instalador desde un subdirectorio instala allí; el instalador no busca la raíz de un repositorio en los directorios superiores.

Ejecuta el comando anterior en una terminal interactiva y luego:

1. Elige **Locally (project workspace)**, el ámbito por defecto.
2. Responde **No** a instalar todas las skills. La opción por defecto es **Yes**; al rechazarla se abre la pantalla de selección individual, inicialmente con todas las skills marcadas.
3. Deja seleccionadas solo `brainstorming` y `test-driven-development`.
4. Selecciona `Claude Workspace` y `Codex Workspace` y desmarca cualquier otro harness.
5. Deja la limpieza en su valor por defecto, **No**, para conservar otras skills instaladas.

Usa las flechas arriba y abajo para moverte, Espacio para marcar o desmarcar casillas e Intro para confirmar un paso. Retroceso o la flecha izquierda vuelve al paso anterior cuando esa opción está disponible. Ctrl+C cancela el asistente. La instalación comienza en cuanto confirmas el paso de limpieza.

Cada skill pasa a ser un subdirectorio de `.claude/skills` y `.agents/skills`. Por ejemplo, Codex recibe `.agents/skills/brainstorming/SKILL.md`. Si los directorios de destino no existen, se crean. Por defecto, los directorios existentes se combinan y los archivos coincidentes se sobrescriben; los archivos que solo están en el destino permanecen. Haz una copia de seguridad de tus cambios locales antes de actualizar.

El instalador copia archivos e informa del resultado. Consulta las instrucciones de tu harness para cargar las skills instaladas; el paquete no comprueba que un harness pueda interpretar todos los archivos incluidos.

## Modos

El asistente solo aparece cuando stdin es una TTY (una terminal interactiva) y no se proporcionan argumentos, con la excepción de `--include-drafts`, que por sí solo mantiene el modo interactivo. El ámbito, la selección de skills, los harnesses y la limpieza se eligen en el asistente. Las rutas de harnesses detectadas se preseleccionan; cambia esa selección antes de confirmar si quieres menos destinos.

Cuando stdin no es una TTY o se proporciona cualquier otro argumento, la CLI no hace preguntas. Incluso `--local` por sí solo inicia una instalación con los valores por defecto: todas las skills, ámbito local, harnesses detectados y sin limpieza. Usa selecciones explícitas en los scripts para que el resultado no dependa de las carpetas que ya existan.

La detección consiste en comprobar si existe la carpeta de skills de destino o su directorio padre; no comprueba si la aplicación del harness está instalada. Por ejemplo, un directorio `.claude/` existente permite detectar `Claude Workspace` incluso sin `.claude/skills/`. La detección se limita al ámbito seleccionado. Si no se detecta nada, el comando falla. Elige etiquetas con `--harnesses` para crear sus destinos o usa `--all-harnesses` para seleccionar todos los destinos de ese ámbito.

## Repite la selección sin preguntas

Esto instala nuestras dos skills para Claude y Codex en el repositorio actual, existan o no sus carpetas:

```sh
pnpm dlx @codenhub/skills@latest --local --skills=brainstorming,test-driven-development --harnesses="Claude Workspace,Codex Workspace"
```

Para instalar las mismas dos en tu directorio personal, cambia tanto el ámbito como las etiquetas:

```sh
pnpm dlx @codenhub/skills@latest --global --skills=brainstorming,test-driven-development --harnesses="Claude Global,Codex Global"
```

El ámbito global usa ubicaciones fijas dentro de tu directorio personal, independientemente del proyecto actual. Para hacer ambas instalaciones en una sola ejecución, usa `--both` y enumera las cuatro etiquetas:

```sh
pnpm dlx @codenhub/skills@latest --both --skills=brainstorming,test-driven-development --harnesses="Claude Workspace,Codex Workspace,Claude Global,Codex Global"
```

Las copias locales y globales son archivos independientes. Actualizar una no actualiza la otra. Si ambas están instaladas, tu harness determina cómo resolverlas.

## Opciones

| Opción               | Comportamiento                                                                                                           |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `--local`            | Usa los destinos del espacio de trabajo. Es el ámbito por defecto.                                                       |
| `--global`           | Usa los destinos dentro del directorio personal del usuario actual.                                                      |
| `--both`             | Incluye tanto los destinos del espacio de trabajo como los globales.                                                     |
| `--skills=<list>`    | Instala los IDs de skills separados por comas, distinguiendo mayúsculas de minúsculas.                                   |
| `--all-skills`       | Instala todas las skills disponibles. Es el valor por defecto; incluye los borradores si están habilitados.              |
| `--harnesses=<list>` | Instala en las etiquetas de harnesses separadas por comas, sin distinguir mayúsculas de minúsculas.                      |
| `--all-harnesses`    | Selecciona todos los harnesses válidos para el ámbito elegido.                                                           |
| `--cleanup`          | Elimina los directorios raíz completos de los destinos de skills seleccionados antes de copiar. Desactivado por defecto. |
| `--include-drafts`   | Ofrece también las skills en borrador. Solo funciona desde una copia de trabajo del repositorio.                         |
| `--help`, `-h`       | Muestra la ayuda del comando.                                                                                            |

Las etiquetas de harnesses incluyen su ámbito, por ejemplo, `Claude Workspace` y `Claude Global`. Una etiqueta proporcionada a `--harnesses` debe ser válida para el ámbito seleccionado. Pon toda la lista entre comillas, como se muestra arriba, para mantener las etiquetas con espacios en un solo argumento.

Usa la forma con `=` para las opciones de lista: `--skills=brainstorming`, no `--skills brainstorming`. Las listas eliminan los espacios en blanco de los extremos, ignoran los elementos vacíos entre comas y eliminan los elementos idénticos repetidos, pero deben contener al menos un elemento. Los IDs de skills desconocidos y las etiquetas de harnesses no válidas provocan un fallo antes de la instalación.

Es preferible usar una sola opción de ámbito y una sola forma de selección por lista. Si se repiten, gana la última opción de ámbito y la última lista de `--skills` o `--harnesses` reemplaza a las anteriores. `--all-skills` y `--all-harnesses` tienen prioridad sobre sus respectivas listas, aunque una lista sintácticamente vacía sigue provocando un fallo. Los argumentos desconocidos provocan un fallo. `--help` o `-h` tiene prioridad sobre todos los demás argumentos, incluidos los desconocidos o no válidos: muestra las instrucciones de uso y termina con el código de salida 0 sin instalar, después de cargar las fuentes de las skills.

## Destinos de instalación

Las rutas del espacio de trabajo se resuelven desde el directorio de trabajo actual del proceso. Las rutas globales se resuelven desde el directorio personal del usuario actual. Los destinos `Agent Skills` son las ubicaciones estándar compartidas entre harnesses (`.agents/skills`) que la mayoría lee de forma nativa; instala ahí, y no en el directorio propio del harness, cuando el harness lea ambos.

| Harness      | Destino en el espacio de trabajo | Destino global               |
| ------------ | -------------------------------- | ---------------------------- |
| Agent Skills | `.agents/skills`                 | `~/.agents/skills`           |
| Antigravity  | `.agents/skills`                 | `~/.gemini/config/skills`    |
| Claude       | `.claude/skills`                 | `~/.claude/skills`           |
| Cline        | `.cline/skills`                  | `~/.cline/skills`            |
| Codex        | `.agents/skills`                 | `~/.agents/skills`           |
| Copilot      | `.github/skills`                 | `~/.copilot/skills`          |
| Cursor       | `.cursor/skills`                 | `~/.cursor/skills`           |
| Gemini CLI   | `.gemini/skills`                 | `~/.gemini/skills`           |
| Kiro         | `.kiro/skills`                   | `~/.kiro/skills`             |
| OpenCode     | `.opencode/skills`               | `~/.config/opencode/skills`  |
| Trae         | `.trae/skills`                   | `~/.trae/skills`             |
| Windsurf     | `.windsurf/skills`               | `~/.codeium/windsurf/skills` |
| ZCode        | `.zcode/skills`                  | `~/.zcode/skills`            |

Varias etiquetas se resuelven al mismo directorio porque esos harnesses también lo leen: `Agent Skills Workspace`, `Antigravity Workspace` y `Codex Workspace` comparten `.agents/skills`; `Agent Skills Global` y `Codex Global` comparten `~/.agents/skills`. Seleccionar etiquetas que comparten un destino instala cada skill una sola vez, en lugar de copiarla repetidamente.

Esto significa que seleccionar tanto `Agent Skills Workspace` como `Codex Workspace` no te da dos instalaciones independientes. Ambas apuntan a los mismos archivos, así que las actualizaciones o la limpieza afectan a las skills que leen todos los harnesses que usan esa ruta.

## Comportamiento de los harnesses

Los destinos seleccionados mediante una etiqueta de Codex reciben el directorio completo de la skill incluida, con un directorio `agents` cuando la skill lo tiene. Cualquier otro destino excluye las entradas cuyo nombre base es exactamente `agents` a cualquier profundidad. Cuando una etiqueta de Codex comparte un destino con otras etiquetas seleccionadas, la copia compartida conserva el directorio `agents`. Las demás referencias, ejemplos, avisos y archivos de apoyo se copian sin cambios.

En nuestro ejemplo, Codex recibe el archivo `agents/openai.yaml` de cada skill cuando existe; la copia de Claude lo excluye. Seleccionar solo `Agent Skills Workspace` también excluye las entradas `agents`, aunque Codex lea ese destino. Selecciona una etiqueta de Codex cuando quieras incluir sus metadatos. La exclusión omite entradas del origen; no elimina una carpeta `agents` que haya dejado una instalación anterior.

## Limpieza destructiva

`--cleanup` elimina de forma recursiva todo el destino de skills de cada harness seleccionado antes de instalar. Esto borra todo el contenido de ese directorio, incluidas las skills y los archivos que no gestiona `@codenhub/skills`. En nuestro ejemplo local, añadirlo elimina `.claude/skills` y `.agents/skills` como directorios completos, aunque solo haya dos skills seleccionadas. Las etiquetas que comparten un destino, como `Codex Workspace` y `Agent Skills Workspace`, eliminan ese único directorio una sola vez.

Todos los directorios raíz seleccionados se limpian antes de copiar cualquier skill. Haz una copia de seguridad de esos directorios y comprueba primero el directorio de trabajo actual y el ámbito seleccionado. Para eliminar una sola skill obsoleta, borra su propia carpeta en lugar de limpiar todo el directorio raíz.

Si la limpieza falla, se muestra el error y el instalador continúa copiando en ese destino, lo que puede dejar una mezcla de contenido antiguo y nuevo. Un fallo de limpieza por sí solo no establece un código de salida distinto de cero. Inspecciona tanto la salida como el estado de salida cuando automatices la limpieza. La copia no revierte los cambios si algo falla; consulta [Seguridad y fallos](security-and-failures.md) para saber cómo recuperarte.

## Skills en borrador

Las skills en borrador viven en el repositorio junto a las incluidas, en `packages/skills/drafts/`, y no se publican. El instalador las ignora salvo que se indique `--include-drafts`, que las añade a las skills que ofrece, cada una con la etiqueta `(draft)` en el asistente. La opción indica de dónde vienen las skills, no qué instalar, así que por sí sola mantiene el asistente; con otras opciones, `--all-skills` y la selección por defecto también incluyen los borradores.

Ejecútalo desde una copia de trabajo del repositorio después de compilar el paquete, desde el directorio donde quieras instalar:

```sh
pnpm build skills
node "<checkout>/packages/skills/dist/cli.js" --include-drafts
```

Reemplaza `<checkout>` con la ruta a la copia de trabajo del repositorio. El comando de compilación se ejecuta desde esa copia de trabajo; ejecuta el comando `node` desde el proyecto donde deban instalarse las skills en borrador.

Si no hay borradores, incluso en una instalación del paquete publicado, la opción falla con el código de salida `1`. Un borrador cuyo ID coincida con el de una skill incluida también provoca un fallo. Usa el instalador publicado sin esta opción para las instalaciones normales.

## Ejemplo de automatización

Para ampliar nuestro ejemplo a todos los harnesses de espacio de trabajo soportados, reemplaza la lista explícita de harnesses por `--all-harnesses`:

```sh
pnpm dlx @codenhub/skills@latest --local --all-harnesses --skills=brainstorming,test-driven-development
```

Esto crea todos los destinos locales de la tabla, incluso para herramientas que no usas. Para un script de configuración controlado, la selección explícita de Claude y Codex anterior abarca menos destinos. Fija una versión exacta del paquete en lugar de `@latest` cuando el script deba instalar el mismo contenido publicado en cada ejecución.

A continuación, lee [Seguridad y fallos](security-and-failures.md) para interpretar los códigos de salida y recuperarte cuando solo una parte de la instalación se completa correctamente.
