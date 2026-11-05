---
title: Introducción
description: Elige skills para agentes e instálalas en las carpetas que usan tus herramientas.
source: e8cf45dade9d688c28c9dc80fe8f106bd39dfbf5
---

# Instala y administra skills para agentes

Cada herramienta de agentes busca las skills en carpetas específicas. Si usas varias herramientas, puedes acabar copiando los mismos directorios de skills en cada proyecto y en tu directorio personal, y repitiendo el trabajo cada vez que cambian. `@codenhub/skills` te ofrece una colección seleccionada y un instalador que coloca lo que elijas en esas carpetas. Que recordar los nombres de las carpetas siga siendo el pasatiempo de otra persona.

Un harness de agentes es la aplicación que ejecuta un agente, como Claude o Codex. Una skill le da a ese agente instrucciones para un tipo de trabajo concreto. Esta colección cubre planificación, programación, revisión, diseño, branding, escritura y mantenimiento de instrucciones para agentes. Puedes instalar solo las skills que necesitas; cada una incluye sus archivos de apoyo y los avisos obligatorios que le correspondan.

Esta documentación sigue un proyecto que usa Claude y Codex. Empezamos con `brainstorming` para aclarar un cambio antes de implementarlo y con `test-driven-development` para implementarlo con pruebas; después instalamos las mismas dos skills de forma global para usarlas en varios proyectos.

## Inicio rápido

Con Node.js 24 o posterior, abre una terminal interactiva en el directorio de tu proyecto y ejecuta:

```sh
pnpm dlx @codenhub/skills@latest
```

El equivalente con npm es `npx @codenhub/skills@latest`. Ninguno de los dos comandos añade una dependencia a tu proyecto.

En el asistente, elige el ámbito local, rechaza la opción de instalar todas las skills, selecciona `brainstorming` y `test-driven-development`, y elige `Claude Workspace` y `Codex Workspace`. Deja desactivada la limpieza para conservar otras skills instaladas. El instalador copia los directorios seleccionados en `.claude/skills` y `.agents/skills` dentro del directorio actual.

Para hacer la misma selección sin preguntas:

```sh
pnpm dlx @codenhub/skills@latest --local --skills=brainstorming,test-driven-development --harnesses="Claude Workspace,Codex Workspace"
```

Cualquier argumento salvo `--include-drafts` desactiva el asistente. Sin argumentos y fuera de una terminal interactiva, el instalador selecciona todas las skills incluidas y los harnesses locales detectados. La [guía de la CLI](cli.md#modos) explica la detección y cómo elegir los destinos explícitamente.

## Antes de instalar

Necesitas permisos del sistema de archivos para leer las skills incluidas y escribir en todos los destinos seleccionados. Revisa las skills que instales: contienen instrucciones que un agente puede seguir y pueden incluir scripts. El instalador copia archivos; tu harness decide cómo cargarlos y usarlos. No hay imports de librería para uso programático soportados.

Los archivos existentes en rutas coincidentes se sobrescriben, los directorios se combinan y los archivos obsoletos permanecen. La instalación no revierte los cambios si algo falla. La opción `--cleanup` elimina toda la carpeta de skills seleccionada, incluidas las skills de otras fuentes. Lee [Seguridad y fallos](security-and-failures.md) antes de usar la limpieza o actualizar instalaciones personalizadas.

## Orden de lectura

1. [Skills incluidas](skills.md): elige flujos de trabajo, conoce el contenido de una skill y aprende el formato, las reglas de calidad y la política de versionado.
2. [Instalador CLI](cli.md): instala las dos skills para Claude y Codex, repite la instalación de forma global y conoce todas las opciones, los destinos y las diferencias entre harnesses.
3. [Seguridad y fallos](security-and-failures.md): entiende qué puede sobrescribir una actualización, diagnostica una instalación parcial e interpreta los códigos de salida.
4. [Procedencia de las skills](provenance.md): consulta sus orígenes, licencias y los avisos que debes conservar al compartir las skills instaladas.

El [changelog](../changelog/index.md) registra los cambios de cada versión. El `SKILL.md` instalado y sus archivos adjuntos describen los flujos de trabajo de la versión que instalaste.

Empieza por [Skills incluidas](skills.md) para decidir cuáles necesita tu proyecto.
