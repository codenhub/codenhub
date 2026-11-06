---
title: Visión general
description: Para qué sirve el paquete de validación, cómo instalarlo y en qué orden leer sus páginas.
source: b740f4e453473d7b05f56526e86c13e78a07780d
---

# Valida valores y formas

`@codenhub/validation` responde una sola pregunta: ¿este valor es lo que dije que debía ser? Le das un valor a un validador. Recibes de vuelta ese mismo valor, tipado, o una lista de lo que tiene de malo.

Funciona igual para un solo valor, como una dirección de correo o un número de puerto, que para un objeto entero, como un formulario o el cuerpo de una solicitud.

## Por qué validar

Los datos que cruzan una frontera que no controlas pueden traer cualquier cosa: una solicitud, un formulario, una query string, una variable de entorno, un archivo, un mensaje de otro servicio. TypeScript revisa los tipos al compilar, no cuando el programa se ejecuta. Así que el tipo que escribiste para esos datos es una promesa, y los datos nunca la firmaron. Un validador es lo que la hace cumplir.

El paquete está hecho para esa frontera, donde la entrada puede ser hostil:

- **Un formato te da lo que leyó el parser.** `email()` y `url()` producen el valor que lee el parser de URL de la plataforma. El valor que guardas es el que usará una solicitud o un servidor de correo.
- **Lo que reporta una entrada que falla está acotado.** Cada colección deja de reportar en 1000 problemas, como explica [Límites](./limits.md#una-entrada-que-falla-tiene-un-costo-acotado). Una entrada anidada demasiado profundo es un solo problema, no un desbordamiento de pila, siempre que el límite de profundidad de un esquema recursivo, [`maxDepth`](./limits.md#maxdepth), quepa en la pila.
- **Un problema nunca contiene un valor de la entrada.** Un registro de fallos no contiene ninguna contraseña que se haya enviado. Un problema sí contiene aquello con lo que se configuró el esquema, como los valores que acepta un `oneOf` o el prefijo de un `startsWith`, y las claves de la entrada, en su `path`, como dice [El problema](./errors.md#el-problema).

El límite de 1000 problemas de una colección acota su reporte, no el trabajo: una entrada que pasa, o que falla solo cerca de su final, se revisa igual elemento por elemento, así que una entrada grande cuesta lo que mide. [Límites](./limits.md) explica cómo acotar su tamaño y su profundidad.

## Instalación

```sh
pnpm add @codenhub/validation
```

El paquete es solo ESM y no tiene dependencias. Sus tipos necesitan TypeScript 5.0 o posterior. Todo se importa por nombre desde `@codenhub/validation`. La única otra exportación es `@codenhub/validation/package.json`, para las herramientas que leen la versión.

## Un primer validador

```ts
import { email, object, string } from "@codenhub/validation";

const signup = object({
  name: string({ trim: true, min: 2, max: 100 }),
  email: email(),
});

signup({ name: "  Ada ", email: "ada@example.com" }); // { ok: true, value: { name: "Ada", email: "ada@example.com" } }
signup({ name: "A", email: "nope" }); // { ok: false, ... }: "too_small" para name, "invalid_format" para email
```

Estas páginas siguen un único ejemplo: el registro de una aplicación web. Aquí empieza con dos campos y, como todo formulario de registro que se haya construido, crece un poco en cada página. Cada página le agrega lo que esa página enseña, como un formulario con verificación de contraseña, el cuerpo JSON de una solicitud, la configuración del servidor y los mensajes que lee un usuario.

## Orden de lectura

Lee las páginas en este orden para aprender el paquete de principio a fin, o salta a la que necesites:

1. [Primeros pasos](./getting-started.md): qué es un validador, cómo leer su resultado y los validadores para cadenas, números, fechas, valores fijos y objetos.
2. [Formularios](./forms.md): reglas entre campos, campos opcionales y valores predeterminados, errores por campo, archivos y los tipos de un formulario.
3. [Cuerpos de solicitud](./request-bodies.md): texto JSON, listas y diccionarios, una elección entre formas y datos recursivos.
4. [Entrada de texto](./text-input.md): números, flags y fechas que llegan como texto, desde variables de entorno, query strings y campos de formulario.
5. [Problemas y mensajes](./errors.md): qué contiene un resultado fallido, los códigos integrados y el texto que lee una persona, en inglés, en portugués o con tus propias palabras.
6. [Validadores personalizados](./custom-validators.md): reglas, formatos y tipos propios, reglas asíncronas y cómo probarlos.
7. [Formatos](./formats.md): cada formato integrado, como `email`, `url`, `ip` y `datetime`, qué acepta y qué produce.
8. [Dar forma a los valores](./shaping-values.md): cambiar un valor, volver a escribirlo, marcar su tipo, describirlo y derivar un objeto de otro.
9. [Standard Schema](./standard-schema.md): pasa un validador a cualquier biblioteca que acepte un Standard Schema.
10. [JSON Schema](./json-schema.md): escribe un validador como JSON Schema y lee de qué está hecho un validador.
11. [Integraciones](./integrations.md): usa un validador con react-hook-form, TanStack Form, tRPC, Hono, el AI SDK, el Model Context Protocol, OpenAPI, zod y valibot.
12. [Límites](./limits.md): lo que cuesta una entrada que puede ser hostil, los límites de los datos recursivos y cómo comprobar que un esquema tenga los límites que necesita.

Para consultar una exportación, usa la [referencia de la API](../reference/index.md), generada a partir del código fuente. El [registro de cambios](../changelog/index.md) enumera cada versión y las migraciones entre ellas.
