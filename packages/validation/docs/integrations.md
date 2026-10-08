---
title: Integrations
description: Use a validator with form libraries, RPC and HTTP frameworks, the tools of a language model, OpenAPI, and inside a zod or valibot schema, with an example for each that was run against the library it names.
---

# Integrations

A validator goes where a library asks for a schema in one of three ways: as a [Standard Schema](standard-schema.md), which most form libraries and frameworks accept; as a [JSON Schema](json-schema.md), which tools of language models and OpenAPI documents are written in; or called directly, as any function is, which is also how one field of a [zod or valibot schema](#inside-a-zod-or-valibot-schema) can use it. Each example below was run against the version of the library it names, on 2026-10-07: it validated input that passes and input that fails, and gave what the text around it says.

## Forms

A form holds what the user typed, which is the validator's input type and not what it produces, so type the form's values with [`InferInput`](validators.md#inferinput) and what it submits with `Infer`. A field of `coerceNumber()` holds text or a number, and what is submitted is a number.

### react-hook-form

Checked with react-hook-form 7.89.0 and @hookform/resolvers 5.9.1.

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

The resolver gives each field the message of its first issue, in English unless `standard` is given another message map, and the values the validator produced on submit: the name trimmed, and the address as its parser reads it.

### TanStack Form

Checked with @tanstack/form-core 1.33.5. The framework adapters, such as `useForm` of @tanstack/react-form, take the same `validators` option.

```ts
import { FormApi } from "@tanstack/form-core";

import { email, object, standard, string } from "@codenhub/validation";

export const form = new FormApi({
  defaultValues: { name: "", email: "" },
  validators: { onChange: standard(object({ name: string({ min: 2, max: 100 }), email: email() })) },
});
```

A validator given to `validators` reports each issue under its field, `form.state.fieldMeta.email.errors`, as `{ message, path }`.

## RPC and HTTP

### tRPC

Checked with @trpc/server 11.19.0.

```ts
import { initTRPC } from "@trpc/server";

import { email, object, standard, string } from "@codenhub/validation";

const t = initTRPC.create();

export const appRouter = t.router({
  signup: t.procedure.input(standard(object({ name: string({ min: 2, max: 100 }), email: email() }))).mutation(({ input }) => ({ id: "u1", ...input })),
});
```

Input that fails is a `TRPCError` with the code `BAD_REQUEST` and the issues as its cause, and the procedure receives what the validator produced.

### Hono

Checked with hono 4.13.13 and @hono/standard-validator 0.4.0.

```ts
import { sValidator } from "@hono/standard-validator";
import { Hono } from "hono";

import { email, object, standard, string } from "@codenhub/validation";

const signup = standard(object({ name: string({ min: 2, max: 100 }), email: email() }));

const app = new Hono();

app.post(
  "/signup",
  // Without a hook, the 400 response repeats the body it was sent, a password included.
  sValidator("json", signup, (result, c) => {
    if (!result.success) {
      return c.json({ issues: result.error }, 400);
    }
  }),
  (c) => c.json(c.req.valid("json"), 201),
);
```

Give `sValidator` a hook as above. Without one, the response to input that fails repeats the input it was sent, which this package's issues never hold, so a password or a token sent to the endpoint would come back in the response and in whatever logs it.

## Tools of a language model

A model chooses a tool and fills in its arguments from the JSON Schema of its input, so describe each argument with [`meta`](validators.md#meta): the description is what the model reads.

### AI SDK

Checked with ai 7.0.131. The AI SDK writes a tool's input with `~standard.jsonSchema`, which [`standardJsonSchema`](standard-schema.md#with-its-json-schema) adds and `standard` does not, in draft-07.

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

Arguments the model sends that fail are refused before `execute` runs, with the issues worded in English.

### Model Context Protocol

Checked with @modelcontextprotocol/sdk 1.32.1. Its `McpServer.registerTool` takes zod schemas only, so the tool is declared on the `Server` below it, which takes a JSON Schema, and the handler refuses a tool it does not have and validates the arguments.

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

OpenAPI 3.1 writes schemas in JSON Schema 2020-12, which `toJsonSchema` writes, so a schema goes under `components.schemas` as it is. OpenAPI 3.0 uses an older dialect, which `toJsonSchema` does not write.

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

## Inside a zod or valibot schema

A codebase on zod or valibot can use a validator of this package for one field, such as `url()` for a link the server will fetch or `email()` for an address it will store, without moving its other schemas. Neither library takes a Standard Schema as part of its own schemas, so the validator runs in a transform: what it produces is the field's value, and each issue it reports becomes an issue of the other library, worded by `formatIssue`. Only a synchronous validator fits this way.

The issue then follows the other library's rules: valibot's issues hold the input they were given, so what [Issues and messages](errors.md) says about issues never holding a value of the input is true of the validator's result here, not of the issue valibot reports.

### zod

Checked with zod 4.6.5. Each issue keeps its path below the field, so one from an `object` lands on its property.

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
// issues: "Invalid URL" at ["callback"], "Invalid email address" at ["owner"]
```

### valibot

Checked with valibot 1.5.0. The transform takes its input type from the validator, so it follows a schema whose output is what the validator accepts, such as `v.string()` for `url()`. Every issue lands on the field itself.

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
// issues: "Invalid URL" at callback, "Invalid email address" at owner
```

The adapter is a few lines in your code and not an export of this package, so this package's API does not follow the context each library gives a transform, which zod changed between its versions 3 and 4.
