---
title: Visión general
description: Para qué sirve el paquete, cómo elige un tema y en qué orden leer sus páginas.
source: a5511e8d45e8b0788a0ad1943e44c616d4e0d24e
---

# Gestiona los temas del navegador

Casi toda app que ofrece un modo oscuro termina escribiendo el mismo código: buscar en `localStorage` una elección guardada, recurrir a la configuración clara u oscura del sistema operativo, poner una clase o un atributo en `<html>` para que el CSS reaccione, guardar la elección cuando el usuario pulsa un toggle y mantener de acuerdo todas las pestañas abiertas. Después la página destella en blanco al cargar para todos los que eligieron el oscuro, y el código crece una segunda copia de sí mismo dentro de un script inline para arreglarlo. Dos copias de la misma lógica, sincronizadas a fuerza de fe.

`@codenhub/theme` es ese código, escrito una sola vez. Tú describes tus temas, y el paquete decide cuál está activo, recuerda la elección del usuario, sigue al sistema operativo hasta que el usuario elige y se lo comunica a la página.

## Qué hace y qué te deja a ti

El paquete decide **qué** tema está activo. Tu CSS decide **cómo se ve** cada tema.

En cada cambio, escribe el tema activo en el elemento `<html>` (`document.documentElement`):

```html
<html data-theme="dark" class="theme-dark" style="color-scheme: dark"></html>
```

- `data-theme="dark"`: el nombre del tema, para selectores de CSS como `[data-theme="dark"]`.
- `class="theme-dark"`: el mismo nombre como clase `theme-<name>`, que se agrega por defecto para el código que prefiere clases (la opción `className` la cambia o la quita). Con `darkClass: true` también se agrega una clase `dark` para Tailwind CSS.
- `color-scheme: dark`: le indica al navegador que dibuje sus propios controles, como las barras de desplazamiento y los campos de formulario, en colores oscuros.
- Propiedades personalizadas de CSS, como `--color-primary`, para los tokens que enumeras en `tokenSchema` y a los que das valores en JavaScript.

No incluye CSS, ni colores, ni botón de toggle. Todo eso se queda en tu aplicación, en la forma en que ya lo escribes. Eso también deja algunas tareas en tus manos:

- **Accesibilidad.** El toggle es tu elemento, así que su nombre accesible también es tuyo: un botón que solo muestra un icono de sol necesita un `aria-label`, como "Cambiar al tema oscuro". El texto y el fondo de cada tema necesitan suficiente contraste, y ningún paquete puede comprobarlo por ti.
- **Seguridad.** Los valores de los tokens se escriben en la página como CSS inline sin comprobar que sean CSS válido. Cuando un valor viene de la entrada del usuario, valídalo antes; [Tokens de diseño](tokens.md#cambia-tokens-en-tiempo-de-ejecución) explica qué pasa si no.
- **Rendimiento.** Aplicar un tema escribe unos pocos atributos y propiedades, lo cual es barato. `readTokens()` es la única llamada que puede hacer que el navegador recalcule el layout; [Tokens de diseño](tokens.md#lee-los-valores-de-los-tokens) explica cuándo usarla.

## Cómo se elige un tema

Cuando arranca la página, el paquete elige un tema en este orden:

1. **La elección guardada del usuario.** Una vez que el usuario elige un tema, se guarda en el `localStorage` del navegador y gana en cada visita posterior.
2. **La configuración del sistema operativo.** Hasta que el usuario elige uno, el tema sigue el modo claro u oscuro del sistema y cambia con él.
3. **El tema por defecto.** Si no hay ninguno de los dos, como en un servidor, se aplica el tema por defecto: `light`, salvo que configures otro.

## El recorrido

Las páginas construyen desde cero el soporte de temas de una app: primero un toggle, luego una pantalla de ajustes con un menú de temas, un color de acento personalizado y, por último, la configuración de producción. Leídas en orden, te llevan de una página vacía a producción:

1. [Primeros pasos](getting-started.md): instala el paquete y construye un toggle claro y oscuro que funciona.
2. [Definir temas](themes.md): agrega tus propios temas, decide cómo eligen entre ellos el toggle y la configuración del sistema, y lee el estado actual.
3. [Tokens de diseño](tokens.md): mantén los colores de los temas en JavaScript y cámbialos en tiempo de ejecución.
4. [Guardar y sincronizar](persistence-and-sync.md): cómo se guarda la elección, cómo se mantienen de acuerdo las pestañas y cómo reaccionar cuando cambia el tema.
5. [Evitar el destello](preventing-the-flash.md): aplica el tema antes del primer pintado, en un sitio estático o en uno renderizado en el servidor.
6. [Frameworks](frameworks.md): usa el paquete con React y con la variante `dark:` de Tailwind CSS.
7. [Solución de problemas](troubleshooting.md): qué revisar cuando algo no funciona.

La [referencia de la API](../reference/index.md) (en inglés) enumera cada export con su firma completa. Consulta allí los detalles; lee el recorrido para aprender cómo encaja todo.

## Requisitos

- **Un navegador, para que el tema se vea.** El paquete usa `document.documentElement`, `localStorage`, `matchMedia`, eventos `storage` y `CustomEvent`, y trata cualquiera de ellos que falte como ausente en lugar de romper tu página. Una llamada a `localStorage` o a `matchMedia` que lanza una excepción, como en una ventana privada, se trata igual. En un servidor no hace nada que necesite un navegador; consulta [Evitar el destello](preventing-the-flash.md#lo-que-sabe-el-servidor).
- **Chrome 93, Firefox 92, Safari 15.4 o posterior**, tal como se publica. El paquete se distribuye como JavaScript moderno y llama a `Object.hasOwn`, que los navegadores más antiguos no tienen, así que allí `createTheme()` lanza un `TypeError`. Para dar soporte a un navegador más antiguo, haz que tu build transpile las dependencias y agregue polyfills para él. El script previo al pintado de [Evitar el destello](preventing-the-flash.md) es ES5 puro y sigue aplicando el tema en navegadores muy por debajo de ese mínimo, hasta Chrome 24, Firefox 24 y Safari 7.
- **TypeScript 5.4 o posterior**, si usas TypeScript. Los tipos usan `NoInfer`, que los compiladores más antiguos reportan como `Cannot find name 'NoInfer'`. Los proyectos en JavaScript puro no necesitan nada más.
- **Nada más.** Sin dependencias y sin framework.

¿Listo? [Primeros pasos](getting-started.md) tiene un toggle funcionando en cinco pasos.
