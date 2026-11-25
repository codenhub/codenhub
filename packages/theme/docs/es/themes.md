---
title: Definir temas
description: Agrega tus propios temas, elige qué temas usan la configuración del sistema y el toggle, lee el estado actual y conoce cada opción con su valor por defecto.
order: 2
source: 632c7fdf59665808b4b91a309deb37754c6f814c
---

# Definir temas

[Primeros pasos](getting-started.md) usó los dos temas integrados. Las apps reales suelen querer más: un tema oscuro más tenue para los que trasnochan, uno de alto contraste, un tema de marca que cambia de nombre dos veces antes del lanzamiento. Esta página los agrega y construye un menú de temas para una pantalla de ajustes, con una entrada "Automático" que sigue al sistema operativo. De paso explica cómo eligen entre los temas el toggle y la configuración del sistema, y cómo leer cuál está activo.

## Describe tus temas

Pasa `themes` a `createTheme()`, con el nombre de cada tema como clave:

```ts
import { createTheme } from "@codenhub/theme";

const theme = createTheme({
  themes: {
    light: { colorScheme: "light" },
    dark: { colorScheme: "dark" },
    dim: { colorScheme: "dark" },
  },
}).init();
```

Cada nombre es lo que termina en `data-theme`, así que el CSS de Primeros pasos gana un bloque más:

```css
[data-theme="dim"] {
  --background: #2b2b33;
  --text: #e4e4e7;
}
```

Cada entrada es un `ThemeDefinition`, el tipo exportado para un tema. `colorScheme` dice si un tema es claro u oscuro. Es obligatorio y cumple tres funciones: el paquete lo escribe en `color-scheme` para que los controles del navegador coincidan, el toggle lo usa para encontrar el tema opuesto y la clase `dark` de Tailwind lo sigue.

`themes` reemplaza la lista integrada en lugar de sumarse a ella. Mantén temas llamados `light` y `dark`, como arriba, o dile al paquete qué temas usar en su lugar, como muestran las secciones siguientes.

## Cambia a un tema concreto

`set()` aplica un tema y lo guarda como elección del usuario, igual que el toggle. Es lo que llama un menú de temas:

```ts
const menu = document.querySelector<HTMLSelectElement>("#theme-menu");

menu?.addEventListener("change", () => {
  if (menu.value === "auto") {
    theme.clearPreference();
  } else {
    theme.set(menu.value as "light" | "dark" | "dim");
  }
});
```

Los nombres vienen de tu objeto `themes`, así que en TypeScript un nombre mal escrito, como `theme.set("dimm")`, es un error de compilación. En JavaScript lanza `Theme is not configured: dimm.`

`clearPreference()`, usado arriba para la entrada "Automático", olvida la elección del usuario y vuelve a seguir al sistema operativo.

## Elige los temas que usa el sistema

Cuando el usuario no eligió un tema, el paquete sigue al sistema operativo: `light` cuando está en modo claro, `dark` cuando está en modo oscuro. `systemTheme` cambia cuáles de tus temas son esos. Su tipo se exporta como `SystemThemeMap`:

```ts
const theme = createTheme({
  themes: {
    paper: { colorScheme: "light" },
    ink: { colorScheme: "dark" },
  },
  systemTheme: { light: "paper", dark: "ink" },
  defaultTheme: "paper",
});
```

`defaultTheme` es el tema que se usa cuando no hay una configuración del sistema que leer, como en un servidor o en un navegador sin `matchMedia`, y antes de que se ejecute `init()`. Como estos temas no se llaman `light` y `dark`, aquí hacen falta las dos opciones; sin ellas, `createTheme()` lanza un error que nombra el tema que falta.

## Decide qué hace el toggle

Un toggle alterna entre dos cosas, pero una app puede tener más de dos temas, y el toggle tiene que ir a alguna parte. `toggle()` decide a partir del tema activo:

1. Si el tema activo tiene un `pairedTheme`, va a ese.
2. Si no, va al tema del sistema del esquema de color opuesto: de un tema oscuro a `systemTheme.light`, de uno claro a `systemTheme.dark`.

Con los tres temas del principio de esta página, el toggle va de `light` a `dark` y de vuelta, y `dim` iría a `light`, el tema claro del sistema. Para mandar `dim` a otro lado, empareja los temas:

```ts
const theme = createTheme({
  themes: {
    light: { colorScheme: "light" },
    dark: { colorScheme: "dark" },
    dim: { colorScheme: "dark", pairedTheme: "light" },
    sepia: { colorScheme: "light", pairedTheme: "dim" },
  },
});
```

Ahora `sepia` alterna a `dim`, y `dim` vuelve a `light`. Un emparejamiento va en un solo sentido: dale a cada tema su propio `pairedTheme` cuando el toggle deba volver al tema de donde vino.

## Sigue al sistema dentro de un par

Algunas apps ofrecen familias de temas, cada una con una variante clara y una oscura, y dejan que el usuario elija la familia mientras el sistema operativo sigue eligiendo entre claro y oscuro. Empareja las variantes y pásale `followSystem` a `set()`:

```ts
const theme = createTheme({
  themes: {
    light: { colorScheme: "light" },
    dark: { colorScheme: "dark" },
    "ocean-light": { colorScheme: "light", pairedTheme: "ocean-dark" },
    "ocean-dark": { colorScheme: "dark", pairedTheme: "ocean-light" },
  },
}).init();

theme.set("ocean-light", { followSystem: true });
```

Ahora el tema activo es `ocean-light` u `ocean-dark`, el que tenga el esquema de color del sistema operativo, y cambia cuando cambia el sistema operativo, informando `source: "system"`. Cualquiera de las dos variantes nombra la misma elección, pero `theme.preference` conserva la que pasaste, sea cual sea la activa, así que un menú que marca la familia seleccionada debe reconocer sus dos variantes. Sin `matchMedia`, se aplica el tema que pasaste. La elección se guarda, así que sobrevive a una recarga y llega a las otras pestañas, y [el script previo al pintado](preventing-the-flash.md) aplica la variante correcta antes del primer pintado.

`followSystem` necesita un tema cuyo `pairedTheme` tenga el `colorScheme` opuesto; con cualquier otro tema, `set()` lanza un error y no cambia nada. Un `set()` normal o un `toggle()` vuelven a guardar una elección fija, y `clearPreference()` regresa a `systemTheme`. Si más adelante quitas el par del tema de una elección guardada, ese tema se queda aplicado como elección fija.

## Lee el estado actual

El menú de temas necesita mostrar qué entrada está seleccionada. El gestor responde cinco preguntas:

| Miembro               | Responde                                                                                                                                                                                       |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `theme.name`          | Qué tema está activo, como `"dim"`.                                                                                                                                                            |
| `theme.get()`         | Todo sobre el tema activo: `name`, `colorScheme`, `tokens` y `pairedTheme`.                                                                                                                    |
| `theme.preference`    | Qué tema eligió el usuario: el guardado, o el elegido en esta página cuando el almacenamiento no pudo guardarlo. `null` cuando no hay elección o el nombre guardado ya no es uno de tus temas. |
| `theme.followsSystem` | Si esa elección sigue al sistema operativo dentro de su par, como la hace `set(name, { followSystem: true })`.                                                                                 |
| `theme.system`        | A qué tema corresponde ahora mismo la configuración del sistema operativo, se esté mostrando o no.                                                                                             |

`preference` es lo que hace posible la entrada "Automático": el menú muestra "Automático" como seleccionada mientras vale `null`. Ejecútalo también en cada cambio, para que el menú se entere cuando el toggle u otra pestaña cambian el tema a sus espaldas:

```ts
const showSelection = () => {
  if (menu) {
    menu.value = theme.preference ?? "auto";
  }
};

showSelection();
theme.subscribe(showSelection);
```

`preference` lee lo que de verdad está guardado. Mientras el navegador bloquea `localStorage`, informa en su lugar la elección que el usuario hizo en esta página, que se aplica mientras la página está abierta, así que el menú la sigue marcando; [Guardar y sincronizar](persistence-and-sync.md#cuando-falla-el-almacenamiento) cubre ese caso.

`get()` devuelve un `ActiveTheme`: un objeto congelado, y el mismo objeto hasta el próximo cambio de tema. Eso lo hace seguro para entregarlo a un framework de UI como snapshot de un store, algo de lo que depende [Frameworks](frameworks.md#react).

## Cada opción y su valor por defecto

Todas las opciones son opcionales, y su tipo se exporta como `ThemeOptions`. Una opción con valor `undefined` recibe su valor por defecto, exactamente igual que una omitida, así que un wrapper puede reenviar sus propios ajustes opcionales sin revisarlos.

| Opción         | Valor por defecto                                                    | Qué controla                                                                                                                    |
| -------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `themes`       | `{ light: { colorScheme: "light" }, dark: { colorScheme: "dark" } }` | Los temas disponibles, con su nombre como clave.                                                                                |
| `defaultTheme` | `"light"`                                                            | El tema que se usa cuando no se puede leer ninguna configuración del sistema, y antes de `init()`.                              |
| `systemTheme`  | `{ light: "light", dark: "dark" }`                                   | Los temas que se usan para los modos claro y oscuro del sistema operativo.                                                      |
| `storageKey`   | `"app-theme-preference"`                                             | La clave de `localStorage` con la que se guarda la elección del usuario.                                                        |
| `attribute`    | `"data-theme"`                                                       | El atributo de `<html>` que contiene el nombre del tema.                                                                        |
| `className`    | `true`                                                               | La clase de `<html>`: `true` agrega `theme-<name>`, `false` no agrega ninguna y una función devuelve una personalizada.         |
| `darkClass`    | `false`                                                              | Si se agrega una clase `dark` mientras hay un tema oscuro activo, para [Tailwind CSS](frameworks.md#tailwind-css).              |
| `tokenSchema`  | ninguno                                                              | Las propiedades personalizadas de CSS en las que se escriben los valores de los tokens; consulta [Tokens de diseño](tokens.md). |

Algunas merecen un comentario:

- **`storageKey`**: Todas las apps del mismo dominio comparten un solo `localStorage`. Si dos apps de un mismo dominio usan este paquete, dale a cada una su propia clave, como `"my-app-theme"`, o se turnarán para pisarse la elección.
- **`attribute`**: Sirve cualquier nombre de atributo HTML válido, uno sin espacios, comillas, `/`, `>` ni `=`, excepto `class` y `style`, porque escribir ahí el nombre del tema borraría las clases y los estilos inline que tu página puso en `<html>`. Usa `className` para obtener una clase.
- **`className`**: Una función, con tipo `ThemeClassResolver`, recibe el tema, incluidos sus tokens estáticos, y devuelve un nombre de clase sin espacios. `className: (theme) => theme.name` da clases como `dark` y `dim` en lugar de `theme-dark`. El paquete le pide a la función la clase de todos los temas a la vez, la primera vez que necesita una, normalmente en `init()` o `getPrePaintScript()`. Una función que devuelve un nombre vacío o con espacios para cualquier tema hace que esa llamada lance una excepción, aunque el tema rechazado no sea el que se está aplicando. Sea cual sea `className`, incluido `false`, también se agrega la clase `theme-light` o `theme-dark` que sigue el `colorScheme` del tema, como describe la [visión general](index.md#qué-hace-y-qué-te-deja-a-ti).

## Cuando la configuración está mal

`createTheme()` revisa cada opción de inmediato y lanza un `Error` que describe el primer problema que encuentra, como un `defaultTheme` o un `pairedTheme` que no nombra ningún tema configurado, un `colorScheme` que no es ni `"light"` ni `"dark"` o, mientras `className` es `true`, un nombre de tema que no puede formar parte de una clase. Nada de unas opciones inválidas llega a la página, así que un error aparece la primera vez que se ejecuta el código, y no como un tema que en silencio nunca se aplica. La [referencia de `createTheme`](../reference/index.md#createtheme) (en inglés) enumera cada regla, y [Solución de problemas](troubleshooting.md#createtheme-lanza-una-excepción) cubre las más comunes con sus soluciones.

A continuación, [Tokens de diseño](tokens.md) agrega a la pantalla de ajustes un selector de color de acento, lo que implica mover algunos colores del CSS a JavaScript.
