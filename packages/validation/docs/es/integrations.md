---
title: Integraciones
description: Usa un validador con bibliotecas de formularios, frameworks de RPC y HTTP, las herramientas de un modelo de lenguaje, OpenAPI y dentro de un esquema de zod o valibot, con un ejemplo para cada caso que se ejecutó con la biblioteca que nombra.
order: 11
source: 0ff1b6d8fe7f58ddc0b039eea6f27e06def3269e
---

# Integraciones

El registro se ejecuta dentro de otras bibliotecas: una biblioteca de formularios en el navegador, un framework en el servidor, quizás las herramientas de un modelo de lenguaje. Esta página muestra un validador en cada una de las más comunes, para que puedas copiar las pocas líneas que cada una necesita.

Un validador entra donde una biblioteca pide un esquema de una de estas tres formas:

- Como un [Standard Schema](./standard-schema.md), que la mayoría de las bibliotecas de formularios y de los frameworks aceptan.
- Como un [JSON Schema](./json-schema.md), el formato en que se escriben las herramientas de los modelos de lenguaje y los documentos de OpenAPI.
- Llamado directamente, como cualquier función. Así es también como un campo de un [esquema de zod o valibot](#dentro-de-un-esquema-de-zod-o-valibot) puede usarlo.

Todo validador que crea una fábrica de este paquete ya es un Standard Schema, con mensajes en inglés breve. Los ejemplos de formularios, RPC y HTTP lo pasan por `standard`, que redacta sus problemas en el inglés completo, y se ejecutaron así. Los demás ejemplos usan lo que nombra su sección: `standardJsonSchema`, `toJsonSchema` o el validador llamado directamente. Cada ejemplo se ejecutó con la versión de la biblioteca que nombra, el 2026-10-07: validó una entrada que pasa y una que falla, y dio lo que dice el texto que lo rodea.

## Formularios

Un formulario contiene lo que escribió el usuario, que es el tipo de entrada del validador y no lo que este produce. Así que tipa los valores del formulario con [`InferInput`](./forms.md#los-tipos-de-un-formulario). Un campo de `coerceNumber()` contiene texto o un número. Lo que envía el formulario depende de la biblioteca: react-hook-form envía lo que produjo el validador, tipado con `Infer`, y TanStack Form envía los valores tal como se escribieron.

### react-hook-form

Probado con react-hook-form 7.89.0 y @hookform/resolvers 5.9.1.

```ts
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { useForm } from "react-hook-form";

import { email, object, standard, string, type Infer, type InferInput } from "@codenhub/validation";

const signup = standard(object({ name: string({ trim: true, min: 2, max: 100 }), email: email() }));

export function useSignupForm() {
  return useForm<InferInput<typeof signup>, unknown, Infer<typeof signup>>({
    resolver: standardSchemaResolver(signup),
  });
}
```

El resolver le da a cada campo el mensaje de su primer problema, en inglés salvo que se le pase a `standard` otro mapa de mensajes, y al enviar, los valores que produjo el validador: el nombre sin espacios al inicio ni al final, y la dirección tal como la lee su parser.

### TanStack Form

Probado con @tanstack/form-core 1.33.5. Los adaptadores de cada framework, como `useForm` de @tanstack/react-form, aceptan la misma opción `validators`.

```ts
import { FormApi } from "@tanstack/form-core";

import { email, object, standard, string } from "@codenhub/validation";

export const form = new FormApi({
  defaultValues: { name: "", email: "" },
  validators: { onChange: standard(object({ name: string({ min: 2, max: 100 }), email: email() })) },
});
```

Un validador pasado en `validators` reporta cada problema en su campo, `form.state.fieldMeta.email.errors`, como `{ message, path }`. `onSubmit` recibe los valores tal como se escribieron, no lo que produjo el validador, así que llama al validador con ellos para obtener, por ejemplo, el número de un campo de `coerceNumber()`.

## RPC y HTTP

### tRPC

Probado con @trpc/server 11.19.0.

```ts
import { initTRPC } from "@trpc/server";

import { email, object, standard, string } from "@codenhub/validation";

const t = initTRPC.create();

export const appRouter = t.router({
  signup: t.procedure.input(standard(object({ name: string({ min: 2, max: 100 }), email: email() }))).mutation(({ input }) => ({ id: "u1", ...input })),
});
```

Una entrada que falla se convierte en un `TRPCError` con el código `BAD_REQUEST` y los problemas como su causa, y el procedimiento recibe lo que produjo el validador.

### Hono

Probado con hono 4.13.13 y @hono/standard-validator 0.4.0.

```ts
import { sValidator } from "@hono/standard-validator";
import { Hono } from "hono";

import { email, object, standard, string } from "@codenhub/validation";

const signup = standard(object({ name: string({ min: 2, max: 100 }), email: email() }));

const app = new Hono();

app.post(
  "/signup",
  // Sin un hook, la respuesta 400 repite el cuerpo que recibió, contraseña incluida.
  sValidator("json", signup, (result, c) => {
    if (!result.success) {
      return c.json({ issues: result.error }, 400);
    }
  }),
  (c) => c.json(c.req.valid("json"), 201),
);
```

Pásale a `sValidator` un hook como el de arriba. Sin él, la respuesta a una entrada que falla repite la entrada que recibió, algo que los problemas de este paquete nunca contienen. Así, una contraseña o un token enviados al endpoint volverían en la respuesta y en cualquier lugar que la registre.

## Herramientas de un modelo de lenguaje

Un modelo elige una herramienta y completa sus argumentos a partir del JSON Schema de su entrada, así que describe cada argumento con [`meta`](./shaping-values.md#meta): la descripción es lo que lee el modelo.

### AI SDK

Probado con ai 7.0.131. El AI SDK escribe la entrada de una herramienta con `~standard.jsonSchema`, que [`standardJsonSchema`](./standard-schema.md#con-su-json-schema) agrega y `standard` no, en draft-07.

```ts
import { tool } from "ai";

import { meta, number, object, optional, standardJsonSchema, string } from "@codenhub/validation";

export const forecast = tool({
  description: "Get the weather forecast for a city",
  inputSchema: standardJsonSchema(
    object({
      city: meta(string({ min: 1, max: 100 }), { description: "The city, such as Lisbon" }),
      days: optional(meta(number({ int: true, min: 1, max: 7 }), { description: "How many days ahead" })),
    }),
  ),
  execute: async ({ city, days = 1 }) => `${city}: sunny for ${days} days`,
});
```

Los argumentos que envía el modelo y que fallan se rechazan antes de que se ejecute `execute`, con los problemas redactados en inglés.

### Model Context Protocol

Probado con @modelcontextprotocol/sdk 1.32.1. Su `McpServer.registerTool` solo acepta esquemas de zod, así que la herramienta se declara en el `Server` que está debajo, que acepta un JSON Schema, y el handler rechaza una herramienta que no tiene y valida los argumentos.

```ts
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ErrorCode, ListToolsRequestSchema, McpError } from "@modelcontextprotocol/sdk/types.js";

import { formatIssue, meta, number, object, optional, string, toJsonSchema } from "@codenhub/validation";

const forecastInput = object({
  city: meta(string({ min: 1, max: 100 }), { description: "The city, such as Lisbon" }),
  days: optional(meta(number({ int: true, min: 1, max: 7 }), { description: "How many days ahead" })),
});

export const server = new Server({ name: "weather", version: "1.0.0" }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, () => ({
  tools: [
    {
      name: "forecast",
      description: "Get the weather forecast for a city",
      inputSchema: { ...toJsonSchema(forecastInput), type: "object" as const },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, (request) => {
  if (request.params.name !== "forecast") {
    throw new McpError(ErrorCode.InvalidParams, `Unknown tool: ${request.params.name}`);
  }
  const result = forecastInput(request.params.arguments);
  if (!result.ok) {
    const text = result.error.issues.map((issue) => formatIssue(issue)).join("\n");
    return { isError: true, content: [{ type: "text", text }] };
  }
  const { city, days = 1 } = result.value;
  return { content: [{ type: "text", text: `${city}: sunny for ${days} days` }] };
});
```

## OpenAPI

OpenAPI 3.1 escribe los esquemas en JSON Schema 2020-12, que es lo que escribe `toJsonSchema`, así que un esquema va sin cambios en `components.schemas`. Un esquema con un `lazy`, recursivo o no, es la excepción. Se refiere a sus definiciones como `#/$defs/schema1`, desde la raíz del documento en el que está, y la raíz de un documento OpenAPI no tiene `$defs`. Así que un esquema así necesita que sus definiciones se muevan a `components.schemas` y que sus referencias se reescriban para apuntar ahí. OpenAPI 3.0 usa un dialecto anterior, que `toJsonSchema` no escribe.

```ts
import { email, meta, object, string, toJsonSchema } from "@codenhub/validation";

const signup = meta(object({ name: string({ min: 2, max: 100 }), email: email() }), {
  title: "Signup",
  examples: [{ name: "Ada Lovelace", email: "ada@example.com" }],
});

export const document = {
  openapi: "3.1.0",
  info: { title: "Accounts", version: "1.0.0" },
  paths: {
    "/signup": {
      post: {
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/Signup" } } } },
        responses: { "201": { description: "Created" } },
      },
    },
  },
  components: { schemas: { Signup: toJsonSchema(signup) } },
};
```

## Dentro de un esquema de zod o valibot

Un código basado en zod o valibot puede usar un validador de este paquete para un solo campo, como `url()` para un enlace que el servidor va a descargar o `email()` para una dirección que va a guardar, sin migrar sus demás esquemas. Ninguna de las dos bibliotecas acepta un Standard Schema como parte de sus propios esquemas, así que el validador se ejecuta en una transformación: lo que produce es el valor del campo, y cada problema que reporta se convierte en un problema de la otra biblioteca, redactado por `formatIssue`. Solo un validador síncrono encaja de esta forma.

El problema sigue entonces las reglas de la otra biblioteca: los problemas de valibot contienen la entrada que recibieron, así que lo que dice [Problemas y mensajes](./errors.md) sobre que los problemas nunca contienen un valor de la entrada aquí vale para el resultado del validador, no para el problema que reporta valibot.

### zod

Probado con zod 4.6.5. Cada problema conserva su ruta por debajo del campo, así que uno que viene de un `object` cae en su propiedad.

```ts
import { z } from "zod";

import { email, formatIssue, url, type Validator } from "@codenhub/validation";

const ours =
  <T>(validator: Validator<T>) =>
  (value: unknown, ctx: z.RefinementCtx): T => {
    const result = validator(value);
    if (result.ok) {
      return result.value;
    }
    for (const issue of result.error.issues) {
      ctx.addIssue({ code: "custom", message: formatIssue(issue), path: [...issue.path] });
    }
    return z.NEVER;
  };

const webhook = z.object({
  callback: z.string().transform(ours(url())),
  owner: z.string().transform(ours(email())),
});

webhook.safeParse({ callback: "https://Example.com/hooks/../events", owner: "Ada@EXAMPLE.com" });
// { success: true, data: { callback: "https://example.com/events", owner: "Ada@example.com" } }
webhook.safeParse({ callback: "http://169.254.169.254/latest", owner: "ada@localhost" });
// problemas: "Invalid URL" en ["callback"], "Invalid email address" en ["owner"]
```

### valibot

Probado con valibot 1.5.0. La transformación toma su tipo de entrada del validador, así que va después de un esquema cuya salida es lo que acepta el validador, como `v.string()` para `url()`. Todos los problemas caen en el propio campo.

```ts
import * as v from "valibot";

import { email, formatIssue, url, type Validator } from "@codenhub/validation";

const ours = <T, TInput>(validator: Validator<T, TInput>) =>
  v.rawTransform<TInput, T>(({ dataset, addIssue, NEVER }) => {
    const result = validator(dataset.value);
    if (result.ok) {
      return result.value;
    }
    for (const issue of result.error.issues) {
      addIssue({ message: formatIssue(issue) });
    }
    return NEVER;
  });

const webhook = v.object({
  callback: v.pipe(v.string(), ours(url())),
  owner: v.pipe(v.string(), ours(email())),
});

v.safeParse(webhook, { callback: "https://Example.com/hooks/../events", owner: "Ada@EXAMPLE.com" });
// { success: true, output: { callback: "https://example.com/events", owner: "Ada@example.com" }, ... }
v.safeParse(webhook, { callback: "http://169.254.169.254/latest", owner: "ada@localhost" });
// problemas: "Invalid URL" en callback, "Invalid email address" en owner
```

El adaptador son unas pocas líneas en tu código y no una exportación de este paquete, así que la API de este paquete no depende del contexto que cada biblioteca le pasa a una transformación, que zod cambió entre sus versiones 3 y 4.

## Siguiente

Un validador en producción se enfrenta a entradas escritas para hacerle daño. [Límites](./limits.md) dice qué limita el paquete por ti y qué te deja a ti.
