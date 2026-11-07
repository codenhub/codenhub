<!-- source: 1d6c0b91961d5af28e479b0d8a8fd113b0916067 -->

# @codenhub/skills

Una colección seleccionada de skills para agentes y una CLI que las instala en las carpetas que usan tus herramientas de agentes. Elige los flujos de trabajo que necesitas e instálalos en un proyecto, en tu directorio personal o en ambos.

## Instalación

Ejecuta el instalador sin añadirlo al proyecto:

```sh
pnpm dlx @codenhub/skills@latest
```

O usa npm:

```sh
npx @codenhub/skills@latest
```

## Uso

Ejecuta el comando desde el directorio de tu proyecto. En una terminal interactiva, el asistente te pregunta dónde instalar, si quieres incluir todas las skills o elegir algunas, qué harnesses usar como destino y si quieres limpiar antes sus carpetas de skills. La limpieza está desactivada por defecto.

Para repetir una instalación sin preguntas, selecciona explícitamente las skills y los destinos:

```sh
pnpm dlx @codenhub/skills@latest --local --skills=brainstorming,test-driven-development --harnesses="Claude Workspace,Codex Workspace"
```

La colección cubre planificación e implementación (`brainstorming`, `test-driven-development`, `coding`, `ponytail`), revisión y entrega (`audit`, `babysit-pr`), trabajo creativo (`branding`, `design`, `logo-design`, `motion-graphics`, `naming`), e instrucciones para agentes y escritura. Consulta el [catálogo de skills](docs/es/skills.md) para conocer cada skill y cuándo se aplica.

## Documentación

- [Introducción a la documentación](docs/es/index.md): documentación completa del paquete.
- [Skills incluidas](docs/es/skills.md): elige skills y conoce su formato y versionado.
- [Instalador CLI](docs/es/cli.md): opciones, destinos y comportamiento de los harnesses.
- [Seguridad y fallos](docs/es/security-and-failures.md): riesgos de la limpieza, instalaciones parciales y recuperación.
- [Changelog](docs/changelog/index.md): historial de versiones.

## Requisitos

- Node.js 24 o posterior.
- Permisos del sistema de archivos para leer las skills de origen y modificar los destinos seleccionados.
- Una terminal interactiva (TTY) para el asistente; las opciones explícitas de la CLI permiten automatizar la instalación.

## Notas

- Por defecto, los archivos existentes se combinan y sobrescriben; los archivos obsoletos solo se eliminan si usas `--cleanup`.
- `--cleanup` elimina de forma recursiva todo el directorio de skills de cada harness seleccionado antes de instalar.
- La instalación escribe directamente en disco y no revierte los cambios si algo falla. Haz una copia de seguridad de las skills personalizadas antes de actualizar; consulta el [comportamiento ante fallos](docs/es/security-and-failures.md).
- El paquete ofrece un instalador CLI, sin imports de librería para uso programático soportados.

## Licencia

Distribuido bajo la licencia Apache-2.0. Las skills incluidas contienen material adaptado de terceros; consulta [NOTICE](NOTICE) y la [procedencia de las skills](docs/es/provenance.md).
