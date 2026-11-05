---
title: Seguridad y fallos
description: Entiende los riesgos de sobrescritura y limpieza, diagnostica instalaciones fallidas y recupérate de escrituras parciales.
order: 3
source: 2e1bc5678c893e5bf5327e32407eba66f7f0edca
---

# Instala con seguridad y recupérate de los fallos

La instalación del [ejemplo de Claude y Codex](cli.md#repite-la-selección-sin-preguntas) escribe directamente en dos carpetas de skills. Esta página explica qué puede cambiar allí, qué protegen las comprobaciones de rutas del instalador y cómo recuperarte si la copia falla. El instalador lee y escribe de forma síncrona y no revierte los cambios si algo falla.

## Protege las skills existentes

Por defecto, la instalación combina directorios y sobrescribe archivos con rutas coincidentes. Si editaste `.agents/skills/brainstorming/SKILL.md`, volver a instalar esa skill reemplaza tus cambios. Haz una copia de seguridad de las skills personalizadas antes de actualizar.

Los archivos que solo están en el destino permanecen. Un archivo de referencia antiguo o una skill eliminada de una versión posterior del paquete sigue instalada hasta que la elimines tú. Para eliminar una skill obsoleta, borra su directorio en cada destino donde se haya instalado. El instalador no lleva un registro de qué archivos le pertenecen.

### Limpieza destructiva

`--cleanup` elimina de forma recursiva y forzada todos los directorios raíz de skills de los harnesses seleccionados antes de copiar cualquier skill. Para nuestras dos instalaciones locales, eso significa todo el contenido de `.claude/skills` y `.agents/skills`, incluidas las skills de otros paquetes y los archivos gestionados manualmente. Los destinos compartidos se eliminan una sola vez, pero todos los harnesses que los leen se ven afectados.

Los directorios raíz son fijos según el harness y el ámbito seleccionados. Los del espacio de trabajo se resuelven desde el directorio de trabajo actual y los globales desde tu directorio personal. Comprueba ambos antes de ejecutar la limpieza y haz una copia de seguridad de todos los directorios raíz seleccionados. La [tabla de destinos](cli.md#destinos-de-instalación) enumera las rutas.

Los fallos de limpieza se muestran como `Failed cleaning`, pero la instalación continúa en el destino afectado. Un fallo de limpieza por sí solo no establece un código de salida distinto de cero, así que el código de salida `0` no demuestra que se haya limpiado el directorio. En la automatización, inspecciona tanto la salida de la limpieza como el estado de salida. Si la limpieza falla, resuelve el problema del sistema de archivos indicado e inspecciona el contenido restante antes de intentarlo de nuevo.

## Confianza y comprobaciones de rutas

Las skills contienen instrucciones que un agente puede seguir y pueden incluir scripts. Revisa su contenido y procedencia antes de permitir que un agente las use. Elige árboles de origen de confianza cuando ejecutes desde una copia de trabajo del repositorio, concede solo los permisos del sistema de archivos necesarios y comprueba que los destinos seleccionados sean adecuados. El instalador no determina si las instrucciones o los scripts son seguros.

Antes de copiar cada skill, el instalador resuelve su origen y la parte de la ruta de destino que ya exista a sus ubicaciones reales en el sistema de archivos. Rechaza un destino que se resuelva al propio origen o a una ubicación dentro de él, incluso a través de enlaces simbólicos existentes en el destino. Esto evita la copia recursiva sobre sí mismo. Si la disposición de la copia de trabajo o de los enlaces simbólicos provoca este error, instala en un directorio separado, fuera del árbol de origen de esa skill.

Los enlaces simbólicos del origen deben resolverse dentro del árbol de origen de esa misma skill. Un enlace a una skill hermana o a un archivo en otra ubicación se rechaza con un error de recorrido de directorios. Si el enlace se acepta, se sigue y se copia el contenido al que apunta, en lugar de conservar el enlace. Los directorios canónicos ya visitados se omiten para evitar ciclos de enlaces simbólicos. Al crear una skill, coloca los archivos necesarios dentro de su propio directorio en lugar de enlazar archivos externos.

Estas comprobaciones limitan las lecturas del origen y evitan la copia sobre sí mismo; no son un sandbox del sistema de archivos. No hacen que sea seguro copiar un árbol que no es de confianza en un destino sensible. El estado del sistema de archivos también puede cambiar entre las comprobaciones y las operaciones. Evita instalar desde árboles controlados por un atacante o en rutas que otras personas puedan modificar durante la instalación.

## Diagnostica una instalación fallida

El comando muestra los fallos y usa estos códigos de salida:

- **`0`:** las copias seleccionadas se completaron correctamente o se mostró la ayuda. No seleccionar skills o harnesses en el asistente muestra un mensaje de salida y también devuelve `0`, sin instalar. Aun así, puede haber habido fallos de limpieza.
- **`130`:** Ctrl+C canceló el asistente interactivo antes de la instalación. Vuelve a ejecutar el instalador cuando quieras hacer una selección.
- **`1`:** argumentos no válidos, IDs de skills desconocidos, etiquetas de harnesses no válidas para el ámbito, ningún harness detectado, skills faltantes, fallos al cargar las fuentes, una excepción no controlada o cualquier fallo al copiar una skill. La salida de error indica qué corregir.

Para los errores de argumentos, usa los IDs del [catálogo](skills.md#catálogo-de-skills-incluidas) y las etiquetas con ámbito de la [guía de la CLI](cli.md#opciones). Si no se detecta ningún harness, selecciona explícitamente los destinos que quieras con `--harnesses` o usa `--all-harnesses` cuando quieras todos los destinos del ámbito. No añadas limpieza para resolver un error de selección.

Si no se encuentran skills o no se puede leer una fuente incluida, usa una instalación íntegra del paquete o restaura los archivos de skills de la copia de trabajo. `--include-drafts` también falla cuando no hay borradores o el ID de un borrador duplica el de una skill incluida; omite la opción en instalaciones del paquete publicado.

Una copia puede fallar porque su origen haya desaparecido, se haya incumplido una restricción de rutas o haya fallado la lectura, resolución, creación o escritura de una entrada del sistema de archivos. La CLI muestra `Failed copying` para cada skill afectada y luego continúa con las skills y los destinos restantes. Termina con el código `1` después de intentarlos todos. Para errores de permisos, habilita la escritura en el destino seleccionado; para conflictos entre archivos y directorios, haz una copia de seguridad y resuelve la entrada en conflicto. Comprueba la ruta indicada antes de cambiar nada.

## Recupérate de escrituras parciales

Las copias no son transaccionales: los archivos escritos antes de un error permanecen, los archivos sobrescritos no se restauran y las limpiezas completadas no se deshacen. Un fallo posterior en el destino de Codex no deshace una instalación correcta de Claude. La copia fallida de una skill también puede contener una mezcla de archivos antiguos y nuevos.

Inspecciona la skill y el destino indicados, corrige la causa y vuelve a ejecutar la misma selección sin limpieza para copiar de nuevo los archivos faltantes o incompletos. Restaura tu copia de seguridad si necesitas la versión anterior o tus cambios locales. Una nueva ejecución sigue dejando en su sitio los archivos que solo existen en el destino; inspecciona y elimina los archivos obsoletos por separado cuando sea necesario. Usar `--cleanup` para recuperarte también eliminaría skills ajenas al problema.

A continuación, revisa [Procedencia de las skills](provenance.md) para conocer los orígenes y los avisos de licencia que acompañan a las skills que instalas y compartes.
