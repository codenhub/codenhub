---
title: Solución de problemas
description: Síntomas, cómo confirmar su causa y cómo resolverlos.
order: 7
source: d8cb7e198162be48eb6fd956c960af106d16ae9d
---

# Solución de problemas

Empieza por el síntoma que ves. Cada entrada dice cómo confirmar la causa y luego cómo resolverla. Revisa la primera entrada antes que cualquier otra: en ese caso, el paquete hizo su trabajo y la hoja de estilos no tiene ninguna regla para el tema. Es el arreglo más barato de esta página.

## Nada cambia cuando cambia el tema

Abre las herramientas de desarrollo del navegador e inspecciona el elemento `<html>` mientras haces clic en el toggle.

- **`data-theme` cambia, pero la página no.** El paquete funciona; tu CSS no tiene reglas para ese nombre de tema. Agrega una regla `[data-theme="<name>"]` para cada tema, como en [Primeros pasos](getting-started.md#2-escribe-el-css-de-cada-tema). Si definiste `attribute`, usa ese nombre de atributo en tus selectores.
- **`data-theme` nunca aparece.** Si definiste `attribute`, busca ese atributo. Si tampoco aparece, no se llamó a `init()`, o el código que lo llama nunca se ejecutó. `createTheme()` solo no le hace nada a la página. Busca en la consola un error lanzado antes, como uno de `createTheme()` sobre opciones inválidas.
- **Los estilos `dark:` de Tailwind no se aplican.** Comprueba que las opciones tengan `darkClass: true`, que `<html>` tenga una clase `dark` y que esté la configuración de Tailwind de [Frameworks](frameworks.md#tailwind-css). Sin esa configuración, Tailwind sigue la configuración del sistema operativo e ignora la clase.

## El tema equivocado parpadea al cargar la página

El script previo al pintado falta, está bloqueado o no coincide con tu app. En orden:

1. Mira el código fuente de la página, no la vista de elementos de las herramientas de desarrollo, y comprueba que el script esté dentro del `<head>`. Si no está, configúralo como en [Evitar el destello](preventing-the-flash.md).
2. Busca en la consola un error de Content Security Policy. Si hay uno, permite el script con un nonce o un hash; consulta [Content Security Policy](preventing-the-flash.md#content-security-policy).
3. Comprueba que el script y el gestor de tu app usen las mismas opciones, sobre todo `storageKey` y `themes`. Importar las dos cosas desde un mismo módulo las mantiene alineadas.

## La elección se olvida al recargar

- **El navegador bloquea el almacenamiento**, como hacen algunas ventanas privadas. La consola muestra un error `[theme]` la primera vez que falla el guardado. La elección sigue funcionando hasta que se cierra la página; no hay dónde conservarla más tiempo. Consulta [Cuando falla el almacenamiento](persistence-and-sync.md#cuando-falla-el-almacenamiento).
- **Otra app del mismo dominio usa la misma `storageKey`** y la sobrescribe. Dale a tu app su propia `storageKey`.
- **El tema guardado ya no existe**, porque se renombró o se quitó de `themes`. El paquete ignora un nombre guardado que no reconoce, así que el usuario vuelve a la configuración del sistema operativo.

## El tema ignora el sistema operativo

El usuario hizo una elección, que siempre gana. `theme.preference` muestra una elección guardada; una que el navegador no pudo guardar, porque el almacenamiento está bloqueado o lleno, sigue ganando mientras la página está abierta, salvo que otra pestaña cambie el tema, aunque `theme.preference` muestre entonces `null` o una elección guardada anterior. Una elección hecha antes de `init()` es la excepción; consulta [Cuando falla el almacenamiento](persistence-and-sync.md#cuando-falla-el-almacenamiento). Llama a `theme.clearPreference()`, desde una opción "Automático" o "Sistema" de tu UI, para volver a seguir al sistema operativo. Si el navegador se niega a borrar la elección guardada, la consola muestra un error `[theme]`, el tema del sistema se aplica una vez y los cambios del sistema operativo se siguen ignorando mientras la elección siga guardada.

## `createTheme()` lanza una excepción

Las opciones son inválidas, y el mensaje de error nombra el problema. Los más comunes:

- **Falta un tema.** Unos `themes` personalizados sin `light` y `dark` también necesitan `defaultTheme` y `systemTheme` que nombren temas que definiste; consulta [Elige los temas que usa el sistema](themes.md#elige-los-temas-que-usa-el-sistema).
- **Un `pairedTheme`, `defaultTheme` o `systemTheme` que nombra un tema que no está en `themes`.** Revisa cómo está escrito.
- **Un nombre de tema que no puede ser una clase.** Mientras `className` es `true`, cada nombre pasa a formar parte de una clase `theme-<name>`, así que no puede contener espacios. Renombra el tema, o define `className` como `false` o como una función.
- **`tokens` sin un `tokenSchema`, o un token que no figura en él.** Cada token necesita una entrada en `tokenSchema`; consulta [Tokens de diseño](tokens.md).

## TypeScript informa `Cannot find name 'NoInfer'`

Tu versión de TypeScript es anterior a la 5.4, que agregó `NoInfer`. Actualiza TypeScript en tu proyecto. Activar `skipLibCheck` oculta el error, pero entonces los tipos también aceptan nombres de tema que no configuraste.

## El navegador informa `Object.hasOwn is not a function` o un `SyntaxError`

`createTheme()` lanza `TypeError: Object.hasOwn is not a function` o, en un navegador anterior a Chrome 85, Firefox 79 o Safari 14, el paquete no llega a cargarse y falla con un `SyntaxError` antes de que se ejecute tu código. En ambos casos, el navegador es anterior a Chrome 93, Firefox 92 o Safari 15.4, las versiones más antiguas en las que funciona el paquete publicado; [Requisitos](index.md#requisitos) las enumera. Actualiza el navegador, o haz que tu build transpile las dependencias y agregue polyfills para los navegadores que soportas. El script previo al pintado sigue poniendo el atributo y las clases del tema en navegadores hasta Chrome 24, Firefox 24 y Safari 7, pero el toggle y todo lo demás necesitan el gestor.

## Un aviso de hidratación de React menciona `<html>`

React encontró el `data-theme`, la clase o el `style` que agregó el script previo al pintado. Esa diferencia es esperable; agrega `suppressHydrationWarning` a tu elemento `<html>`, como se muestra en [Evitar el destello](preventing-the-flash.md#en-una-app-renderizada-en-el-servidor).

¿Sigues atascado? La [referencia de la API](../reference/index.md) (en inglés) enumera cada regla que aplica cada método y cada error que lanza.
