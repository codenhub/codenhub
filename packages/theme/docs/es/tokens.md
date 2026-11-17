---
title: Tokens de diseño
description: Da valores a los temas en JavaScript con tokenSchema, sobrescríbelos en tiempo de ejecución con setTokens() y vuelve a leerlos.
order: 3
source: 4b484eb3f6aeb728f1a2b7572998a7208612ae5c
---

# Tokens de diseño

Hasta ahora, cada color vivía en el CSS, indexado por `[data-theme]`. Es la configuración más simple, y a menudo todo lo que una app necesita. Luego la pantalla de ajustes suma un selector de color de acento, y el color tiene que venir de JavaScript. Los colores cargados desde una configuración JSON y un gráfico en canvas que necesita valores de color reales terminan en el mismo lugar. Los **tokens** cubren esos casos. Un token es un valor con nombre, como `primary`, que el paquete escribe en una propiedad personalizada de CSS, como `--color-primary`, cada vez que su tema está activo.

## Nombra tus tokens

`tokenSchema` enumera los tokens y la propiedad personalizada en la que se escribe cada uno:

```ts
import { createTheme } from "@codenhub/theme";

const theme = createTheme({
  themes: {
    light: { colorScheme: "light", tokens: { primary: "#171717", surface: "#ffffff" } },
    dark: { colorScheme: "dark", tokens: { primary: "#f9fafb", surface: "#171717" } },
  },
  tokenSchema: { primary: "--color-primary", surface: "--color-surface" },
}).init();
```

Los `tokens` de cada tema contienen sus valores. Cuando `dark` se activa, el paquete define `--color-primary: #f9fafb` y `--color-surface: #171717` en `<html>`, y tu CSS los usa como cualquier otra propiedad personalizada:

```css
button {
  background: var(--color-primary);
  color: var(--color-surface);
}
```

En TypeScript, las claves de `tokenSchema` dan tipo a cada objeto `tokens`, así que un nombre de token mal escrito es un error de compilación. Sin un `tokenSchema`, los tokens no se permiten en absoluto.

Cada valor de `tokenSchema` debe ser un nombre de propiedad personalizada que una hoja de estilos pueda usar tal cual: `--` seguido de letras, dígitos, `-`, `_` o caracteres no ASCII. Cualquier otra cosa, como `"--"` solo o un nombre con un espacio, hace que `createTheme()` lance una excepción. Lo mismo pasa si dos tokens apuntan a la misma propiedad, ya que se pasarían cada cambio de tema pisándose el uno al otro.

## Mezcla tokens con CSS

Un tema no tiene que definir todos los tokens. Cuando el tema activo omite un token, el paquete quita esa propiedad de `<html>`, y se aplica lo que diga tu hoja de estilos. Los valores de los tokens se definen como estilos inline en `<html>`, así que cuando un tema sí define uno, gana sobre un valor para la misma propiedad en una regla `[data-theme]`, salvo que esa regla use `!important`.

Eso te permite dejar la mayoría de los valores en el CSS y mover solo los que JavaScript debe controlar. La mayoría de las apps terminan con una hoja de estilos larga y dos o tres tokens, que es la proporción correcta.

## Cambia tokens en tiempo de ejecución

`setTokens()` sobrescribe valores de tokens para todos los temas, que es lo que necesita el selector de acento:

```ts
const picker = document.querySelector<HTMLInputElement>("#accent-picker");

picker?.addEventListener("input", () => {
  theme.setTokens({ primary: picker.value });
});
```

Las sobrescrituras ganan sobre los `tokens` propios de los temas y se mantienen cuando cambia el tema. Cada llamada reemplaza todas las sobrescrituras anteriores, así que pasa todos los tokens que quieras sobrescribir, y pasa `{}` para quitarlas todas.

Algunas reglas mantienen los valores predecibles:

- **Las sobrescrituras no se guardan.** Duran hasta que la página se descarga o se ejecuta `destroy()`. Para conservar el color de un usuario, guárdalo tú y vuelve a llamar a `setTokens()` en la siguiente visita.
- **Un valor vacío significa "sin sobrescritura".** Un token definido como `""` o `undefined` vuelve al valor propio del tema, o a tu CSS cuando el tema no define ninguno. Por eso un input de texto vaciado vuelve al color del tema en lugar de quitarlo. Un input de color siempre contiene un color y no se puede vaciar, así que dale al selector de acento un botón de restablecer que vuelva a llamar a `setTokens()` con todas las sobrescrituras salvo `primary`, es decir, `{}` cuando el acento es la única.
- **Los números se escriben como strings.** En JavaScript, `setTokens({ radius: 4 })` escribe `"4"`; los tipos de TypeScript solo aceptan strings, así que ahí escribe `"4"`. Cualquier valor que no sea un string, un número finito, `undefined` o `""` lanza una excepción, igual que un nombre de token que no está en `tokenSchema`.
- **Los valores no se comprueban como CSS.** Un valor que el navegador rechaza, como `"red; color: blue"`, no se aplica, y la propiedad conserva su valor anterior, aunque `get().tokens` sigue informando el valor rechazado. Como las sobrescrituras se mantienen cuando cambia el tema, la propiedad conserva ese valor también entre cambios de tema, hasta que una sobrescritura válida o `setTokens({})` lo reemplace. Comprueba los valores que vienen de la entrada del usuario antes de pasarlos.
- **Antes de `init()`, las sobrescrituras esperan.** Si se llama antes de que se aplique el primer tema, o después de `destroy()`, `setTokens()` solo registra las sobrescrituras; el siguiente cambio, normalmente `init()`, las aplica. Así una llamada temprana no muestra el tema por defecto encima del que ya está en la página.

## Lee los valores de los tokens

`theme.get().tokens` contiene los valores que JavaScript conoce: los `tokens` del tema activo con tus sobrescrituras encima. Nunca lee la página.

`theme.readTokens()` también incluye los tokens definidos solo en el CSS. Para cada token del que JavaScript no tiene valor, lee el valor que el navegador calculó para la propiedad personalizada en `<html>`:

```ts
theme.setTokens({ primary: "#00c853" });

// Con el tema claro activo:
theme.get().tokens; // { primary: "#00c853", surface: "#ffffff" }
theme.readTokens(); // lo mismo, más cualquier token que el tema dejó al CSS
```

Leer estilos calculados puede hacer que el navegador recalcule el layout, así que prefiere `get().tokens` salvo que necesites los valores que solo están en el CSS, y deja `readTokens()` fuera de todo lo que se ejecute en cada frame. Se salta la lectura por completo cuando JavaScript conoce todos los tokens. Si el navegador rechaza la lectura, como hacen algunos entornos aislados (sandbox), el error se registra con `console.error` y recibes los tokens que JavaScript conoce.

A continuación, [Guardar y sincronizar](persistence-and-sync.md) cubre cómo se guarda la elección del usuario y cómo el gráfico que necesita esos colores se entera de que cambió el tema.
