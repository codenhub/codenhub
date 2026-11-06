---
title: Skills incluidas
description: Elige flujos de trabajo del catálogo y conoce el formato, la calidad y el versionado de las skills.
order: 1
source: 499b417fd0bb2d1c2b9c439aefa26f63f3edb1fc
---

# Elige tus skills

Una skill es una carpeta que contiene un archivo `SKILL.md`: instrucciones que le indican a un agente cuándo y cómo realizar un tipo de trabajo concreto. También puede incluir referencias, scripts, recursos y metadatos del harness. Instalar una skill coloca esa carpeta donde tu herramienta de agentes puede encontrarla; el harness decide cuándo cargarla y el agente sigue sus instrucciones durante la tarea. Una skill aporta un flujo de trabajo, no una garantía sobre el resultado.

Para nuestro proyecto con Claude y Codex, empieza con `brainstorming` cuando haya que aclarar los requisitos de una funcionalidad y luego usa `test-driven-development` cuando comience la implementación. No necesitas toda la colección para usar esas dos. Cada skill funciona por su cuenta.

## Catálogo de skills incluidas

Los IDs de la primera columna son los nombres de directorio que acepta `--skills`. Elige según el trabajo que quieres que haga el agente:

| ID de skill               | Cuándo la usa el agente                                                                                                                                                        |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `brainstorming`           | Antes de implementar, cuando los requisitos o el comportamiento necesitan definirse en colaboración.                                                                           |
| `test-driven-development` | Al cambiar el comportamiento del código: escribe una prueba que falle, implementa y luego refactoriza.                                                                         |
| `coding`                  | Al escribir o cambiar código en cualquier lenguaje, para manejar entradas, fallos, estado y rutas hermanas, con pruebas que demuestren cada comportamiento.                    |
| `ponytail`                | Al programar, para elegir la solución más simple que funcione y evitar código especulativo.                                                                                    |
| `audit`                   | Al revisar código, paquetes o pull requests en busca de defectos, vulnerabilidades, problemas de contrato o para evaluar si están listos para publicarse.                      |
| `ponytail-review`         | Al revisar la complejidad, buscar código que simplificar o eliminar, o enumerar trabajo pospuesto y atajos.                                                                    |
| `babysit-pr`              | Cuando se le pide acompañar un pull request de GitHub durante la CI y la revisión, corrigiendo verificaciones y respondiendo a quienes lo revisan hasta que se pueda integrar. |
| `subagent-specialist`     | Cuando se puede delegar trabajo: elige tareas, da instrucciones a los agentes que las realizarán, revisa sus resultados y los integra.                                         |
| `agents-md-improver`      | Al escribir, auditar o recortar instrucciones para agentes del repositorio, incluidos `AGENTS.md` y los archivos que lo cargan.                                                |
| `project-template`        | Al crear, adoptar, sincronizar o auditar un proyecto basado en la plantilla de proyecto compartida, o al cambiar un archivo gestionado por ella.                               |
| `writing-skills`          | Al crear, revisar o corregir skills para agentes y evaluar si sus instrucciones funcionan.                                                                                     |
| `branding`                | Al definir la estrategia de marca, la voz, los mensajes o un sistema de identidad visual y sus lineamientos.                                                                   |
| `naming`                  | Al generar, investigar, comparar o elegir nombres, incluidos los nombres en el código.                                                                                         |
| `design`                  | Al construir o revisar interfaces visuales, tipografía, layout, color, accesibilidad o movimiento de la interfaz en cualquier medio.                                           |
| `logo-design`             | Al crear o refinar un logo, símbolo, favicon o icono de aplicación, mediante archivos SVG y reglas de uso.                                                                     |
| `motion-graphics`         | Al crear el storyboard, animar o renderizar un video hecho con tecnología web.                                                                                                 |
| `caveman`                 | Cuando el usuario pide respuestas más cortas o un modo de comunicación más conciso.                                                                                            |
| `caveman-commit`          | Al escribir un mensaje de commit o preparar cambios en staging para un commit, siguiendo la convención del proyecto.                                                           |
| `playful-tone`            | Cuando el usuario pide o acepta un tono más ligero y con humor en documentación u otros textos públicos.                                                                       |

Las skills de planificación y programación cubren el camino desde una propuesta de cambio hasta su implementación. Las de revisión y entrega ayudan a inspeccionar ese trabajo y a llevarlo a través de un pull request. Las creativas cubren el nombre, la identidad, la interfaz y los videos de un producto. Las de instrucciones y escritura ayudan a mantener las instrucciones y los textos que acompañan el trabajo. Elige las partes que uses; instalar toda la colección es opcional.

## Formato de una skill

Solo necesitas esta sección si vas a inspeccionar un conjunto de skills o crear una. El árbol `skills/` es contenido del producto que se distribuye: los harnesses de agentes leen sus instrucciones y archivos de apoyo, en lugar de publicarse como páginas de documentación del paquete.

Cada skill ocupa un subdirectorio directo del directorio de skills de origen y debe contener `SKILL.md`, con exactamente esas mayúsculas:

```text
skills/
  example-skill/
    SKILL.md
    NOTICE
    agents/
    references/
    scripts/
    assets/
```

El instalador solo examina los subdirectorios directos y reconoce una skill por la presencia de `SKILL.md`. No busca más skills en carpetas anidadas. Copia todo el directorio de la skill, con la [exclusión de `agents` según el harness](cli.md#comportamiento-de-los-harnesses).

Los metadatos soportados forman un bloque de frontmatter plano al principio de `SKILL.md`:

```markdown
---
name: example-skill
description: Use when an agent needs the example workflow.
---
```

El instalador lee `name` y `description` para la pantalla de selección. El nombre del directorio es el ID de la skill que se usa en los comandos y las rutas de destino. Si `name` falta o está vacío, se usa ese ID; si `description` falta o está vacío, no se muestra ninguna descripción. Las skills incluidas deben aportar ambos campos según las reglas de calidad que se detallan más abajo.

Mantén esos campos en líneas planas `key: value`. El instalador lee un bloque de frontmatter al principio del archivo, admite una marca de orden de bytes inicial y requiere que los delimitadores `---` comiencen en sus propias líneas. Divide cada línea de metadatos en el primer signo de dos puntos y elimina los espacios en blanco de los extremos. Los valores siguen siendo cadenas de texto; las líneas sin dos puntos se ignoran y, si una clave se repite, se toma su último valor. Si no hay un bloque que coincida con ese formato, el instalador no lee metadatos y usa los valores de respaldo.

Si un valor empieza con comillas simples o dobles, el instalador toma el texto hasta la siguiente comilla del mismo tipo y quita las comillas; ignora el texto que siga a la comilla de cierre. En un valor sin comillas, un espacio en blanco seguido de `#` inicia un comentario al final de la línea. Pon entre comillas una descripción que contenga un ` #` literal para conservarlo. Este lector es limitado, no es un parser completo de YAML: no interpreta estructuras anidadas, arrays, valores de varias líneas, conversiones de tipo ni secuencias de escape. En particular, `description: >` o `description: |` muestra el indicador en lugar del párrafo siguiente. Pon la descripción completa en una sola línea.

`SKILL.md` puede ir acompañado de archivos de apoyo en Markdown o YAML, avisos, ejemplos y archivos de referencia. Su significado depende del harness o de la skill y el paquete no lo interpreta.

## Reglas de calidad

Las skills incluidas siguen la [especificación Agent Skills](https://agentskills.io/specification) y la guía de creación de la skill `writing-skills` incluida. La suite de pruebas del paquete aplica las reglas que se pueden comprobar de forma mecánica, por lo que `pnpm test skills` falla cuando una skill incluida incumple alguna:

- `name` coincide con el directorio, usa letras minúsculas, dígitos y guiones simples, tiene como máximo 64 caracteres y no contiene ni `anthropic` ni `claude`.
- `description` es una sola línea de entre 1 y 1024 caracteres, sin etiquetas XML ni indicadores de valores multilínea plegados o literales. `name` tampoco debe contener etiquetas XML.
- El frontmatter solo usa las claves de la especificación: `name`, `description`, `license`, `compatibility`, `metadata` y `allowed-tools`.
- El cuerpo de `SKILL.md` tiene menos de 500 líneas.
- Una skill solo contiene `SKILL.md`, `NOTICE`, `LICENSE`, `agents/`, `references/`, `scripts/` y `assets/`.
- Los archivos a los que hace referencia `SKILL.md` existen dentro de la skill y sus rutas usan barras diagonales, y todos los archivos de `references/` están referenciados desde `SKILL.md`.
- Los archivos de referencia no hacen referencia a otros archivos de la skill, y los de más de 100 líneas empiezan con una sección `## Contents`.
- Los archivos Markdown de una skill no nombran otra skill incluida, ya que el usuario podría no tenerla instalada.
- `agents/openai.yaml` define `display_name`, `short_description` y `default_prompt`.

El resto de la guía de creación, como la redacción de una descripción o la evaluación de un cambio, requiere criterio y se cubre durante la revisión. En los borradores solo se comprueba que los metadatos sean válidos.

## Versionado

A partir de 1.0, el número de versión de una publicación indica qué cambia para quien ya tiene las skills instaladas:

- **Mayor:** se elimina o se renombra una skill. El ID de una skill es el directorio que escribe el instalador, y este conserva los directorios antiguos, así que una skill eliminada o renombrada sigue instalada hasta que alguien la borre.
- **Menor:** se añade una skill o cambian las condiciones de activación, las reglas o el flujo de trabajo de una existente.
- **Parche:** cambios editoriales en una skill, como redacción, formato o enlaces, sin intención de cambiar su comportamiento.

La CLI sigue SemVer como de costumbre. Se descartó tratar todos los cambios de comportamiento de una skill como incompatibles. Casi todos los cambios de una skill alteran lo que hace un agente, así que esa regla convertiría casi todas las publicaciones en versiones mayores y la versión dejaría de indicar a quienes usan el paquete qué actualizaciones necesitan su atención.

El `SKILL.md` instalado y los recursos que lo acompañan son el contenido que prevalece para la versión del paquete instalada.

## Borradores

Las skills que siguen en desarrollo viven en `drafts/` dentro del repositorio, con el mismo formato. No se publican, no aparecen aquí y no se instalan salvo que la CLI se ejecute desde una copia de trabajo del repositorio con `--include-drafts` (consulta la [guía de la CLI](cli.md#skills-en-borrador)). Promover un borrador implica mover su directorio a `skills/` y añadirlo a este inventario y a [Procedencia de las skills](provenance.md).

## Material de terceros

Varias de las skills incluidas adaptan material de terceros; la tabla de procedencia indica cuáles. Los avisos del paquete y de cada skill acompañan a los recursos correspondientes. Consulta [Procedencia de las skills](provenance.md) y el [NOTICE](../../NOTICE) del paquete antes de redistribuirlas o modificarlas.

A continuación, usa el [instalador CLI](cli.md) para colocar las skills elegidas en las carpetas del proyecto que leen Claude y Codex.
