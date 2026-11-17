---
title: Guardar y sincronizar
description: Cómo se guarda la elección, qué pasa cuando falla el almacenamiento, cómo se mantienen de acuerdo las pestañas y cómo reaccionar a los cambios de tema.
order: 4
source: eb1875a05ca133e656b658636da57ad7a47cc408
---

# Guardar y sincronizar

El cambio de tema ya recuerda la elección del usuario y sigue al sistema operativo. Esta página explica cómo funciona eso, qué pasa cuando el navegador se interpone y cómo el resto de tu código, como un gráfico que tiene que redibujarse con los nuevos colores, puede enterarse cuando cambia el tema.

## Cómo se guarda la elección

`set()` y `toggle()` guardan el nombre del tema elegido en `localStorage`, con la clave `"app-theme-preference"` salvo que definas `storageKey`. En la siguiente visita, `init()` lo encuentra y lo aplica. `clearPreference()` lo borra y vuelve a la configuración del sistema operativo.

Solo cuenta un nombre que coincide con un tema configurado. Si el valor guardado nombra un tema que quitaste después, el paquete lo ignora, como si no hubiera nada guardado. Renombrar `sepia` a `parchment` es seguro; los usuarios que lo eligieron vuelven al tema de su sistema.

Mientras hay una elección guardada, los cambios del modo claro u oscuro del sistema operativo se ignoran: el usuario ya dijo lo que quiere. Vuelven a aplicarse una vez que se ejecuta `clearPreference()`.

## Cuando falla el almacenamiento

Los navegadores pueden rechazar `localStorage`: una ventana privada puede bloquearlo, un usuario puede desactivar los datos de sitios o el almacenamiento puede estar lleno. El paquete nunca deja que eso rompa tu página, y cada tipo de fallo (lectura, escritura, borrado) se registra una sola vez con `console.error`, no en cada llamada:

- **Una lectura fallida** cuenta como ausencia de elección guardada, así que se aplica la configuración del sistema operativo, salvo que el usuario ya haya elegido un tema con `set()` o `toggle()` en esta página, que se mantiene.
- **Una escritura fallida** conserva lo que estuviera guardado antes, si había algo. La nueva elección del usuario sigue funcionando mientras la página esté abierta: después de `set()` o `toggle()`, el tema elegido se mantiene, y los cambios del sistema operativo no lo reemplazan. Al recargar, vuelve a aplicarse el tema guardado antes, o la configuración del sistema operativo. La única excepción es una elección hecha antes de `init()`: `init()` lee primero el almacenamiento, así que un tema guardado antes la reemplaza.
- **Un borrado fallido** en `clearPreference()` deja guardada la elección anterior. La página cambia al tema del sistema, pero al recargar se restaura la elección guardada, y los cambios del sistema operativo se siguen ignorando mientras esté ahí.

`theme.preference` informa la elección guardada cuando nombra uno de tus temas, y `null` en caso contrario, así que en esa situación puede no coincidir con el tema activo: se queda en `null` cuando el almacenamiento no se puede leer en absoluto, y conserva el tema guardado antes cuando solo falla el guardado, como con la cuota llena.

## Mantener las pestañas de acuerdo

Un usuario con tu app abierta en dos pestañas que cambia el tema en una espera que la otra lo siga. Y la sigue, automáticamente: cada pestaña cuyo gestor ejecutó `init()` con la misma `storageKey` escucha los cambios de la elección guardada. Cuando otra pestaña la guarda, la borra o la reemplaza, incluso con `localStorage.clear()`, cada pestaña vuelve a elegir su tema a partir del almacenamiento y del sistema operativo, como hace `init()`.

Una elección que una pestaña no pudo guardar se descarta en ese momento, porque el almacenamiento ya no coincide con ella. La excepción es una pestaña en la que el mismo acceso a `window.localStorage` lanza una excepción: ignora estos eventos y conserva su elección. Una pestaña que puede acceder a `localStorage` pero no logra leer de él descarta su elección como cualquier otra.

Solo se sincroniza el tema. Las sobrescrituras de tokens de `setTokens()` pertenecen a la pestaña que las definió.

## Reaccionar a los cambios

Otras partes de tu código pueden necesitar saber cuándo cambia el tema: el gráfico que se redibuja con nuevos colores, o el icono del toggle que muestra un sol o una luna. `subscribe()` llama a una función después de cada cambio y devuelve una función que lo detiene:

```ts
const unsubscribe = theme.subscribe(({ name, theme: active, source }) => {
  console.log(`Ahora se muestra ${name}, un tema ${active.colorScheme}, por ${source}.`);
});

// Más tarde, cuando ya no haga falta:
unsubscribe();
```

La función, con tipo `ThemeChangeListener`, recibe un `ThemeChangeDetail`:

- `name`: el nombre del tema activo.
- `theme`: el mismo objeto que devuelve `theme.get()`.
- `source`: qué causó el cambio, con tipo `ThemeChangeSource`. Es el método que se ejecutó, `"init"`, `"set"`, `"toggle"`, `"clearPreference"` o `"setTokens"`; `"system"` cuando cambió el modo del sistema operativo; o `"storage"` cuando otra pestaña cambió la elección guardada.

Esos tipos ayudan cuando el suscriptor vive en otro lugar:

```ts
import type { ThemeChangeListener } from "@codenhub/theme";

const redrawChart: ThemeChangeListener = ({ theme: active }) => {
  chart.setColors(active.tokens);
};

theme.subscribe(redrawChart);
```

Un cambio se anuncia incluso cuando termina en el tema que ya estaba activo, como `set("dark")` mientras se muestra `dark`. Compara `name` con el anterior cuando solo un cambio real deba hacer algo.

`source` importa cuando tu app también guarda el tema en otro lugar, como un perfil de usuario en tu servidor. Reacciona solo a `"set"`, `"toggle"` y `"clearPreference"`, las acciones del propio usuario. Si no, cada pestaña abierta repite la misma petición cuando recibe el cambio a través de `"storage"`, y tu servidor se entera del tema del usuario una vez por pestaña.

Algunas garantías hacen que los suscriptores sean seguros de escribir:

- Un suscriptor que lanza una excepción se registra, y los demás se siguen ejecutando.
- Un suscriptor que cambia el tema él mismo, por ejemplo llamando a `set()`, detiene la entrega del cambio que recibió: los suscriptores que van después solo reciben el cambio más nuevo, así que ninguno actúa sobre un tema que ya no está.
- Un suscriptor agregado mientras se entrega un cambio solo recibe los cambios posteriores.

### Desde código sin acceso al gestor

Hay código que no puede importar el gestor, como un widget de terceros o un script separado. El paquete también despacha un evento `themechange` en `window` después de cada cambio que un suscriptor no reemplazó por uno más nuevo, con el mismo `ThemeChangeDetail` en su `detail`. Importa el nombre y el tipo del evento en lugar de escribir el string tú mismo:

```ts
import { THEME_CHANGE_EVENT, type ThemeChangeEvent } from "@codenhub/theme";

window.addEventListener(THEME_CHANGE_EVENT, (event) => {
  const { name } = (event as ThemeChangeEvent).detail;
  console.log(`Ahora se muestra ${name}.`);
});
```

El evento no dice qué gestor lo envió. Si una página ejecuta más de un gestor, usa `subscribe()` en el que te interesa.

A continuación, [Evitar el destello](preventing-the-flash.md) hace que el tema correcto aparezca antes de que la página se dibuje por primera vez.
