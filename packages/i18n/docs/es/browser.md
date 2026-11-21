---
title: Traduce una app de navegador
description: Detecta y recuerda el idioma del visitante, mantén sincronizados lang y dir, vuelve a renderizar un framework, traduce HTML y ejecuta en un Web Worker.
order: 2
source: 3f61176770f045618c178c16faabb283c0548b56
---

# Traduce una app de navegador

En un navegador, quien traduce sigue siendo el gestor de la [visión general](index.md). `@codenhub/i18n/browser` agrega las piezas que solo tiene un navegador: la configuración de idioma del visitante, un lugar donde recordar su elección y la propia página.

Esta página configura todo eso para la app `en` y `pt` de la tienda de té de la visión general. Al final, la tienda saluda a cada visitante en su idioma, lo recuerda, tiene un selector de idioma y mantiene al día el contador del carrito cuando cambia el idioma.

## Empieza con `initializeBrowserI18n`

Usa `initializeBrowserI18n()` en lugar de `i18n.init()`. Elige un locale, arranca el gestor con él y después mantiene la página sincronizada:

```ts
// src/main.ts
import { initializeBrowserI18n } from "@codenhub/i18n/browser";
import { i18n } from "./i18n";

await initializeBrowserI18n({ i18n });
```

Sin ninguna otra opción, esto:

1. Elige el locale del visitante (consulta más abajo) y lo carga.
2. Asigna `<html lang="pt" dir="ltr">` para que coincida, así los lectores de pantalla pronuncian bien el texto y los [idiomas de derecha a izquierda](index.md#idiomas-de-derecha-a-izquierda) se maquetan bien.
3. Guarda el idioma que elige tu app y lo vuelve a leer en la siguiente visita.

Devuelve un binding. Guárdalo si tu selector de idioma tiene una opción "Sistema", como muestra [Ofrece una opción "Sistema"](#ofrece-una-opción-sistema). Su método `disconnect()` solo hace falta cuando desmontas la app, como en los tests o en los micro-frontends.

### Cómo se elige el locale

Gana la primera de estas opciones que dé un locale soportado:

1. La opción `locale`, cuando pasas una. Cuenta como elección de tu app, así que también se guarda, salvo que `persistLocale` sea `false`.
2. La elección guardada del visitante en una visita anterior. Un locale guardado que ya no configuras, como `pt-PT` después de que te quedas solo con `pt-BR`, se compara como una preferencia del navegador, y el valor guardado se queda como estaba.
3. La configuración de idioma del navegador, `navigator.languages`, comparada con tus locales mediante [`matchLocale()`](index.md#convierte-entradas-externas-en-un-locale). Un visitante cuyo navegador pide `pt-BR` recibe tu `pt`.
4. Tu locale por defecto.

Pasa `locale` cuando la página ya conoce su idioma, por ejemplo por la URL en [un sitio localizado](localized-urls.md#lee-el-locale-en-el-cliente). Entonces se impone a todo lo demás, así que el navegador no puede discrepar con el servidor sobre en qué idioma está la página.

En un sitio localizado, eso significa que cada vista de página guarda el idioma de su URL. Normalmente es lo que quieres: el idioma guardado es el último que leyó el visitante, y en eso se apoya [la redirección del sitio estático](localized-urls.md#detecta-el-idioma-en-un-sitio-estático).

También significa que un visitante que sigue un enlace compartido en portugués hacia un té tiene el portugués guardado desde ese momento, hasta que lea una página en otro idioma, aunque su navegador pida inglés. Basta un enlace de un amigo brasileño para que la tienda le hable en portugués.

Si prefieres guardar solo lo que el visitante elige en tu selector de idioma, desactiva el guardado con `persistLocale: false` y guarda tú la elección del selector. Esa opción también hace que el binding deje de leer la elección guardada, así que lee la tuya y pásala como `locale`. Si tu selector también tiene [una opción "Sistema"](#ofrece-una-opción-sistema), borra la elección que guardaste cuando el visitante la elija, y arranca sin `locale` mientras no haya nada guardado, para que el binding vuelva a detectar.

#### Cuando un loader falla durante el arranque

Si tu loader falla con un locale guardado, el binding advierte y prueba el locale que detecta a partir del navegador, y después el locale por defecto, para que el visitante siga recibiendo un idioma que lee en lugar de una app rota. Un locale detectado que falla recurre al locale por defecto de la misma forma. La elección guardada se conserva para la próxima vez.

Dos fallos siguen rechazándose:

- Un fallo del loader con un locale que pasaste explícitamente, o con el locale por defecto, porque no hay nada sensato a lo que recurrir.
- Un diccionario que carga pero [rompe las reglas](troubleshooting.md#se-rechaza-un-diccionario), sea cual sea el locale. Eso es un bug que hay que corregir, no un tropiezo de la red que se puede aguantar.

## Deja que los visitantes cambien de idioma

Llama a `setLocale()` desde tu selector de idioma. El binding reacciona a cada cambio que se aplica: guarda la elección y actualiza `lang` y `dir`.

```ts
const picker = document.querySelector<HTMLSelectElement>("#language")!;

picker.value = i18n.locale;
picker.addEventListener("change", async () => {
  await i18n.setLocale(picker.value as (typeof i18n.locales)[number]);
});
```

Del visitante que cambia de opinión rápido ya se encarga el paquete. Cuando dos cambios se superponen, gana el posterior, y el anterior se resuelve sin cambiar nada, como explica [Gana la última llamada](index.md#gana-la-última-llamada). Así que lee `i18n.locale` después del `await` en lugar de dar por hecho el valor del selector.

Solo se guardan las elecciones que hace tu app: la opción `locale` y cada `setLocale()` o `init()` aplicado después de que el binding arrancó. Estas no se guardan:

- Un idioma detectado a partir de la configuración del navegador.
- El locale por defecto al que recurrió el binding.

Un visitante que nunca eligió uno sigue la configuración de su navegador, también cuando agregas su idioma más adelante.

La elección se guarda en `localStorage` como `{"locale":"pt"}` bajo la clave `"i18n"`. Cambia la clave con `storageKey`, o desactiva el guardado con `persistLocale: false`. Si el almacenamiento no está disponible, como en algunos modos de navegación privada, el binding advierte y sigue sin él.

### Ofrece una opción "Sistema"

Cuando un visitante elige un idioma, se queda, y esa es la idea. Una opción "Sistema" en el selector le permite deshacerlo y volver a seguir a su navegador. Guarda el binding que devuelve `initializeBrowserI18n()`; esto sustituye el arranque y el selector de arriba:

```ts
const binding = await initializeBrowserI18n({ i18n });
const picker = document.querySelector<HTMLSelectElement>("#language")!;

picker.value = binding.isUsingSystemLocale ? "system" : i18n.locale;
picker.addEventListener("change", async () => {
  try {
    if (picker.value === "system") {
      await binding.switchToSystemLocale();
    } else {
      await i18n.setLocale(picker.value as (typeof i18n.locales)[number]);
    }
  } finally {
    // Muestra la elección del visitante, aunque el cambio fallara o uno posterior lo adelantara.
    picker.value = binding.isUsingSystemLocale ? "system" : i18n.locale;
  }
});
```

`switchToSystemLocale()` olvida la elección guardada y cambia al idioma que el binding detecta ahora, por la configuración del navegador y después por el locale por defecto. Ese idioma no se guarda, así que la próxima visita vuelve a detectar. Si no se puede limpiar el almacenamiento, el binding advierte, y la próxima visita aún encuentra la elección anterior.

`isUsingSystemLocale` dice qué opción mostrar seleccionada. Es `true` cuando el binding arrancó sin nada elegido y después de `switchToSystemLocale()`. Pasa a `false` cuando tu app aplica un locale con `setLocale()` o `init()`, incluido el que ya se muestra: un visitante que elige inglés mientras se detectó inglés lo ha elegido.

Mientras `isUsingSystemLocale` es `true`, el binding también escucha el evento `languagechange` del navegador, así que un visitante que cambia el idioma del navegador en mitad de la visita recibe el nuevo sin recargar. Un idioma que el visitante acaba de elegir y que aún está cargando se mantiene, no se pisa.

En un framework, renderiza el selector desde `binding.subscribe()` en lugar de `i18n.subscribe()`. Elegir el idioma que ya se muestra, o "Sistema" mientras el idioma detectado es el que se muestra, cambia la selección sin cambiar el idioma, así que el gestor no tiene nada que avisar. El binding avisa de ambos casos, y de cada cambio de idioma. En React:

```tsx
import { useState, useSyncExternalStore } from "react";
import type { BrowserI18nBinding } from "@codenhub/i18n/browser";
import { i18n } from "./i18n";

export function LanguagePicker({ binding }: { binding: BrowserI18nBinding }) {
  const selected = useSyncExternalStore(binding.subscribe, () => (binding.isUsingSystemLocale ? "system" : i18n.locale));
  // La elección del visitante, mostrada mientras carga su idioma, para que el select no vuelva de golpe al anterior.
  const [pending, setPending] = useState<string>();

  return (
    <select
      value={pending ?? selected}
      onChange={(event) => {
        const value = event.target.value;
        setPending(value);
        const switching = value === "system" ? binding.switchToSystemLocale() : i18n.setLocale(value as (typeof i18n.locales)[number]);
        // Después la selección vuelve a venir del binding, incluso cuando el cambio falló o uno posterior lo adelantó.
        switching.catch((error: unknown) => console.error(error)).finally(() => setPending((current) => (current === value ? undefined : current)));
      }}
    >
      <option value="system">System</option>
      {i18n.locales.map((locale) => (
        <option key={locale} value={locale}>
          {locale}
        </option>
      ))}
    </select>
  );
}
```

Cuando el idioma detectado no carga, `switchToSystemLocale()` rechaza con el `I18nError` del loader, y la página mantiene su idioma actual; la elección guardada ya está olvidada. Aun así `isUsingSystemLocale` es `true`, así que el selector muestra "System" sobre el idioma anterior: es lo que eligió el visitante, y la próxima visita o el próximo `languagechange` vuelve a intentar el idioma detectado. Un fallo tras un `languagechange` advierte y mantiene el idioma actual. Ninguno cae al idioma por defecto como hace el arranque, porque la página ya tiene un idioma que mostrar.

"Sistema" es para un sitio donde el binding elige el idioma. En un sitio con el idioma en sus URLs, lo elige la URL: cada página pasa su locale a `initializeBrowserI18n()`, como hace [URLs localizadas](localized-urls.md), que lo guarda y deja de seguir el sistema, así que una elección de "Sistema" dura solo hasta la página siguiente. Ahí, haz que "Sistema" navegue, a la URL de la página actual en el idioma que encuentra `i18n.matchLocale(navigator.languages)`, o deja fuera esa opción.

## Vuelve a renderizar un framework

Frameworks como React, Vue, Svelte o Solid renderizan el texto por su cuenta llamando a `t()`. Necesitan saber cuándo volver a renderizar, y `i18n.subscribe()` se los dice. Llama a tu función después de cada `init()` aplicado y de cada cambio de idioma aplicado, y devuelve una función que lo detiene. Un `setLocale()` al idioma que ya se muestra, o uno al que se adelantó una llamada posterior, no cambia nada y no llama a nada.

En React, `useSyncExternalStore` conecta los dos. Aquí mantiene el contador del carrito de la tienda en el idioma actual:

```tsx
import { useSyncExternalStore } from "react";
import { i18n, t } from "./i18n";

export function useLocale() {
  return useSyncExternalStore(i18n.subscribe, () => i18n.locale);
}

export function CartBadge({ count }: { count: number }) {
  useLocale(); // vuelve a renderizar este componente cuando cambia el idioma
  return <span>{t("cart.items", { count })}</span>;
}
```

Los demás frameworks siguen el mismo patrón: guarda `i18n.locale` en un valor reactivo y actualízalo desde `subscribe()`.

## Traduce HTML sin un framework

Para páginas estáticas, o para HTML que tu framework no renderiza, el binding puede traducir la propia página. Marca los elementos con la clave y pasa como `root` la parte de la página que hay que traducir:

```html
<h1 data-i18n="home.title">Welcome</h1>
<input data-i18n-placeholder="search.hint" placeholder="Search teas" />
<button data-i18n-aria-label="menu.open"><svg>…</svg></button>
```

```ts
await initializeBrowserI18n({ i18n, root: document });
```

Cómo se comporta cada parte:

- **`data-i18n` reemplaza todo el contenido de un elemento.** El elemento tiene que contener solo texto, sin elementos hijos, para que una traducción nunca pueda borrar tu marcado. Los elementos con hijos se omiten con una advertencia.
- **Los comentarios también se reemplazan.** No son elementos, así que no cuentan como hijos. No pongas `data-i18n` en un elemento que un framework renderiza o hidrata, porque los frameworks guardan marcadores en comentarios ahí; traduce ese texto con `t()`.
- **`data-i18n-<atributo>` traduce un atributo.** Solo se permiten los atributos que contienen texto para personas o lectores de pantalla: `alt`, `title`, `placeholder`, `label`, `aria-label`, `aria-description`, `aria-placeholder`, `aria-roledescription` y `aria-valuetext`. Los demás, como `data-i18n-href` o `data-i18n-onclick`, se ignoran, así que una traducción nunca puede cambiar un enlace, un estilo ni un manejador de eventos. El `title` de un `<style>`, o de un `<link rel="stylesheet">`, se omite con una advertencia, porque ahí nombra un conjunto de hojas de estilo, y cambiarle el nombre podría desactivar los estilos de la página.
- **El texto que ya está en el HTML es el último respaldo.** Una clave que le falta a un idioma muestra el texto del siguiente locale de su cadena de respaldo, igual que `t()`: un padre configurado, como `pt` para `pt-BR`, y después el locale por defecto. El texto original vuelve solo cuando ningún diccionario de la cadena tiene la clave. Un elemento que muestra texto en un idioma distinto del que ya tiene, por su propio `lang` o, si no, por el de su ancestro más cercano, recibe el `lang` de ese locale, como `<p lang="en">` en una página en portugués, para que un lector de pantalla lo pronuncie en el idioma correcto. Con `syncDocument: false`, ese es el idioma que declara tu página y no el locale activo, y el locale activo solo cuando no hay ningún `lang`. El binding restaura el `lang` propio del elemento cuando el texto vuelve a estar en ese idioma, y una vez que tu código cambia ese `lang`, el binding se lo deja a tu código. Un elemento con contenido propio, como texto o hijos, se marca solo por su texto de `data-i18n`, ya que `lang` cubriría también ese contenido, y un elemento cuyas claves muestran texto de locales distintos, o el propio texto del HTML tras una clave que falta, no se marca.
- **El texto se asigna como texto plano, nunca como HTML.** El texto de `<script>`, `<style>`, `<noscript>`, `<template>`, `<iframe>`, `<noembed>`, `<noframes>`, `<xmp>` y `<plaintext>` nunca se toca, ya que se ejecuta como código, decide qué se muestra o se escribe sin escapar cuando la página se guarda como HTML. Sus atributos se traducen como los de cualquier otro, así que `<iframe data-i18n-title="video.title">` recibe un nombre accesible traducido. Un elemento dentro de uno de ellos, que solo tu código puede poner ahí, se omite entero, texto y atributos, con una advertencia, ya que la página también escribiría sus atributos sin escapar.
- **Un mensaje que necesita valores conserva el texto del HTML**, con una advertencia una vez por clave, porque en el HTML no hay de dónde pasar un valor. Eso abarca `{name}` y cualquier otro argumento, como un plural entero, que si no mostraría su sintaxis ICU a los visitantes. Renderiza el texto con valores desde tu código con `t()`.
- **La página muestra el texto de su HTML hasta que el diccionario del visitante carga**, y después cambia en el lugar, algo que en una conexión lenta se nota. Hay dos formas de evitarlo:
  - Renderiza de antemano una página por idioma, como en [Genera un sitio estático](server-rendering.md#genera-un-sitio-estático), y pasa su `locale`.
  - Mantén oculto el root hasta que la promesa del binding termine, ya sea que se resuelva o se rechace, con un plazo máximo en el loader como en [Nunca falla, solo se queda colgado](troubleshooting.md#nunca-falla-solo-se-queda-colgado), para que una solicitud trabada no pueda dejar la página en blanco.

### Controles de formulario

Dos elementos de formulario requieren cuidado, porque su texto también es lo que envía el formulario. El checkout de la tienda tiene los dos:

- **Dale un `value` a cada `<option>` traducido.** Una opción sin `value` envía su texto, así que `<option data-i18n="shipping.standard">Standard shipping</option>` envía `Envio padrão` en cuanto la página está en portugués, y tu servidor recibe un método de envío del que nunca oyó hablar. Escribe `<option value="standard" data-i18n="shipping.standard">Standard shipping</option>`, y el formulario envía `standard` en todos los idiomas.
- **Usa `<button>` para un botón de envío traducido.** La etiqueta de `<input type="submit" value="Place order">` es su `value`, y `value` no es un atributo que el binding traduzca, porque también es un dato que envía el formulario. `<button type="submit" data-i18n="checkout.submit">Place order</button>` se traduce como cualquier otro texto.

### Observa los cambios

La página se vuelve a traducir en cada cambio de idioma. Para traducir también los elementos que tu código agrega después, activa `observe`:

```ts
await initializeBrowserI18n({ i18n, root: document.querySelector("#app")!, observe: true });
```

Con `observe`, agregar un elemento, o cambiar o quitar una clave `data-i18n`, se procesa en el momento en que ocurre. Eso incluye los elementos que otro código agrega mientras el binding está traduciendo, como un custom element que renderiza hijos cuando cambia su atributo.

El texto de un elemento pertenece a su clave `data-i18n`, así que con `observe` el binding vuelve a escribir la traducción sobre el texto que pone tu código al reemplazar el contenido del elemento, como hace `textContent`: un botón cuya etiqueta tu código cambia a "Enviando pedido…" vuelve a decir "Hacer pedido" al instante, y "Enviando pedido…" nunca pasa a ser su respaldo: un idioma sin la clave, o quitar la clave, muestra el texto del HTML. Una edición de un nodo de texto existente, como `button.firstChild.data`, no se observa, y se queda hasta el siguiente cambio de idioma. Quita la clave antes de poner el texto, lo que restaura primero el texto del HTML, o pon el texto que cambia en un elemento sin clave.

El binding procesa esos cambios una vez por pasada. Si ese código vuelve a cambiar una clave en respuesta, como haría un elemento que restablece una y otra vez su propio atributo `data-i18n-*`, el segundo cambio espera al siguiente cambio de locale en lugar de iniciar un bucle infinito. Dos piezas de código que no dejan de contestarse son una conversación sin fin, y el binding se retira con educación.

Un elemento que se agrega y después se mueve fuera de `root` antes de que el binding llegue a él no se traduce: para entonces pertenece a otra parte de la página.

Deja `observe` desactivado cuando un framework renderiza la página: el framework ya llama a `t()`, y observar la página solo duplicaría su trabajo.

### Custom elements

El binding no mira dentro de los custom elements y no advierte cuando omite uno. Eso abarca las etiquetas con guion, como `<my-widget>`, y los elementos integrados personalizados, tanto si el HTML marca uno con `is`, como en `<button is="my-button">`, como si tu código crea uno con `document.createElement("button", { is: "my-button" })`, que no pone ningún atributo `is`. En un navegador sin `customElements.getName()`, uno que crea tu código se traduce como un elemento normal.

El binding tampoco entra nunca en un shadow root, sea de un custom element o de cualquier otro. Un shadow root puede ser él mismo el `root` que pasas, cuando esa es la parte de la página que traduce el binding.

Un componente tiene vida propia: puede renderizarse después de que se tradujo la página, y agrega y quita texto a medida que la gente lo usa, texto que de todos modos tiene que traducir él mismo. Así que el componente traduce su propio contenido: llama a `i18n.t()` cuando renderiza, y vuelve a renderizar desde `i18n.subscribe()`. La tarjeta de producto de la tienda hace exactamente eso:

```ts
class ProductCard extends HTMLElement {
  #unsubscribe?: () => void;

  connectedCallback() {
    // El elemento puede conectarse antes de que el gestor esté listo; `subscribe()` también avisa cuando `init()` se aplica.
    this.#unsubscribe = i18n.subscribe(() => this.render());
    if (i18n.isReady) {
      this.render();
    }
  }

  disconnectedCallback() {
    this.#unsubscribe?.();
  }

  render() {
    this.querySelector("button")!.textContent = i18n.t("cart.add");
  }
}
```

Eso incluye un custom element que se usa solo como envoltorio, cuyos hijos escribiste en la página, como `<site-nav><a data-i18n="nav.home">Home</a></site-nav>`: esos enlaces también se omiten. Usa un elemento simple, como `<nav>`, para un envoltorio cuyo texto traduce la página.

Un componente no puede tener su propio binding sobre el mismo gestor, porque un gestor tiene un solo binding.

## En un Web Worker

Un Web Worker no tiene página, así que no hay un `<html>` en el que asignar `lang` ni nada que traducir. Supongamos que la tienda formatea su historial de pedidos en un worker. El gestor del núcleo y `@codenhub/i18n/routing` funcionan ahí como en cualquier otro lugar. El binding del navegador todavía puede elegir y guardar el locale, si desactivas las partes que necesitan una página:

```ts
// worker.ts
await initializeBrowserI18n({ i18n, syncDocument: false });
```

Pasa `syncDocument: false` y ningún `root`. Con el valor por defecto `syncDocument: true` y sin `document`, `initializeBrowserI18n()` lanza `TypeError: [I18n] Document synchronization requires a page document; pass syncDocument: false without one.` antes de arrancar el gestor, así que el gestor queda sin arrancar en lugar de quedar a medio vincular.

Un worker tampoco tiene `localStorage`, así que el guardado advierte y se omite. Agrega `persistLocale: false` para arrancar sin ruido.

## Opciones

| Opción          | Valor por defecto | Qué hace                                                                                                                     |
| --------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `i18n`          | (obligatoria)     | El gestor que hay que arrancar.                                                                                              |
| `locale`        | ninguno           | Un locale que se impone al guardado y al detectado. También se guarda mientras `persistLocale` está activado.                |
| `persistLocale` | `true`            | Lee la elección guardada, y guarda la opción `locale` y cada cambio de idioma que hace tu app después del arranque.          |
| `storageKey`    | `"i18n"`          | La clave de `localStorage` para la elección guardada.                                                                        |
| `syncDocument`  | `true`            | Mantiene `<html lang>` y `dir` sincronizados con el locale. Necesita un `document` de página; pasa `false` en un Web Worker. |
| `root`          | ninguno           | La parte de la página que se traduce con atributos `data-i18n`.                                                              |
| `observe`       | `false`           | Traduce también los cambios debajo de `root` a medida que ocurren. Necesita `root`.                                          |

## Reglas que conviene saber

- **Un binding por gestor.** Una segunda llamada a `initializeBrowserI18n()` para el mismo gestor se rechaza hasta que el primero se desconecta.
- **Inicia el binding una sola vez, cuando arranca la app**, con un `await` en el nivel superior de un módulo o antes de montar la app, no en el efecto de un componente. Un inicio que todavía está cargando no se puede cancelar, así que un segundo inicio, como el que provoca el StrictMode de React al ejecutar un efecto dos veces, se rechaza con `Error: [I18n] The manager already has a browser binding.`, sin un binding al que llamar `disconnect()` todavía.
- **Dale a cada binding su propia parte de la página.** Dos bindings, como en los micro-frontends, cada uno con su propio gestor, necesitan `root`s que no se contengan entre sí. Donde se superponen, cada uno traduce los elementos compartidos en su propio idioma, y gana el que se ejecuta último. También comparten la elección guardada y `<html lang>` salvo que se indique lo contrario: dale a cada binding adicional su propio `storageKey`, para que la elección que guarda un binding no sobrescriba la de otro, y `syncDocument: false` a todos menos al binding dueño de la página.
- **Deja que el binding arranque el gestor.** La promesa del binding se rechaza con `Error: [I18n] Browser initialization was superseded before its locale became active.` cuando, antes de que el locale del binding esté activo, tu código:
  - llama a `i18n.init()`, o
  - llama a `i18n.setLocale()` sobre un gestor que ya estaba inicializado, aunque sea al locale que ya se muestra.

  El gestor se queda con el resultado de la llamada posterior, según [la regla de la última llamada](index.md#gana-la-última-llamada), y el binding no queda conectado. Sobre un gestor que todavía no estaba inicializado, `setLocale()` simplemente falla con su propio error y el binding sigue adelante. Llamar a `init()` o a `setLocale()` después de que la promesa del binding se resolvió no es problema.

- **`disconnect()` deja de reaccionar pero no deshace nada.** Deja de guardar, de sincronizar, de traducir, de seguir el idioma del navegador y de llamar a los listeners de `binding.subscribe()`, pero deja el texto, los atributos y la elección guardada tal como están. Un cambio a un idioma detectado que aún está cargando se descarta, y `switchToSystemLocale()` rechaza después. Después puedes arrancar un binding nuevo.

La [referencia del navegador](../reference/browser.md) (en inglés) documenta cada opción y cada fallo, y [Solución de problemas](troubleshooting.md#el-binding-del-navegador-advierte-o-rechaza) enumera cada advertencia que registra el binding.

## Siguiente

Una app de navegador que además se renderiza en un servidor, o que se genera de antemano, tiene una segunda mitad: [Renderiza en un servidor o en tiempo de build](server-rendering.md) la cubre, incluido cómo pasarle al navegador el locale del servidor. Si tu app solo se ejecuta en el navegador y pone el idioma en sus URLs, ve directo a [URLs localizadas](localized-urls.md), donde la página "acerca de" se convierte en `/sobre`.
