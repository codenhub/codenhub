---
title: Integrações
description: Use um validador com bibliotecas de formulário, frameworks de RPC e HTTP, as ferramentas de um modelo de linguagem, OpenAPI e dentro de um schema zod ou valibot, com um exemplo para cada, executado com a biblioteca que ele cita.
source: d9f2e9d9e221aead7e7ebb6594d84d1e856e230c
order: 11
---

# Integrações

O cadastro roda dentro de outras bibliotecas: uma biblioteca de formulários no navegador, um framework no servidor, talvez as ferramentas de um modelo de linguagem. Esta página mostra um validador em cada uma das mais comuns, para você copiar as poucas linhas que cada uma precisa.

Um validador entra onde uma biblioteca pede um schema de uma de três formas:

- Como um [Standard Schema](standard-schema.md), que a maioria das bibliotecas de formulário e dos frameworks aceita.
- Como um [JSON Schema](json-schema.md), em que são escritas as ferramentas de modelos de linguagem e os documentos OpenAPI.
- Chamado diretamente, como qualquer função. É também assim que um campo de um [schema zod ou valibot](#dentro-de-um-schema-zod-ou-valibot) pode usá-lo.

Todo validador que uma factory deste pacote cria já é um Standard Schema, com mensagens em inglês curto. Os exemplos de formulários, RPC e HTTP o passam por `standard`, que escreve os problemas em inglês completo, e foram executados assim. Os outros exemplos usam o que a seção deles nomeia: `standardJsonSchema`, `toJsonSchema` ou o validador chamado diretamente. Cada exemplo foi executado com a versão da biblioteca que ele cita, em 2026-10-07: validou uma entrada que passa e uma que falha, e deu o que o texto em volta dele diz.

## Formulários

Um formulário guarda o que o usuário digitou, que é o tipo de entrada do validador e não o que ele produz. Então tipe os valores do formulário com [`InferInput`](forms.md#os-tipos-de-um-formulário) e o que ele envia com `Infer`. Um campo de `coerceNumber()` guarda texto ou um número, e o que é enviado é um número.

### react-hook-form

Verificado com react-hook-form 7.89.0 e @hookform/resolvers 5.9.1.

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

O resolver dá a cada campo a mensagem do primeiro problema dele, em inglês, a menos que `standard` receba outro mapa de mensagens, e, no envio, os valores que o validador produziu: o nome com trim, e o endereço como o parser o lê.

### TanStack Form

Verificado com @tanstack/form-core 1.33.5. Os adaptadores de framework, como o `useForm` de @tanstack/react-form, recebem a mesma opção `validators`.

```ts
import { FormApi } from "@tanstack/form-core";

import { email, object, standard, string } from "@codenhub/validation";

export const form = new FormApi({
  defaultValues: { name: "", email: "" },
  validators: { onChange: standard(object({ name: string({ min: 2, max: 100 }), email: email() })) },
});
```

Um validador passado em `validators` reporta cada problema no campo dele, `form.state.fieldMeta.email.errors`, como `{ message, path }`.

## RPC e HTTP

### tRPC

Verificado com @trpc/server 11.19.0.

```ts
import { initTRPC } from "@trpc/server";

import { email, object, standard, string } from "@codenhub/validation";

const t = initTRPC.create();

export const appRouter = t.router({
  signup: t.procedure.input(standard(object({ name: string({ min: 2, max: 100 }), email: email() }))).mutation(({ input }) => ({ id: "u1", ...input })),
});
```

Uma entrada que falha vira um `TRPCError` com o código `BAD_REQUEST` e os problemas como causa, e a procedure recebe o que o validador produziu.

### Hono

Verificado com hono 4.13.13 e @hono/standard-validator 0.4.0.

```ts
import { sValidator } from "@hono/standard-validator";
import { Hono } from "hono";

import { email, object, standard, string } from "@codenhub/validation";

const signup = standard(object({ name: string({ min: 2, max: 100 }), email: email() }));

const app = new Hono();

app.post(
  "/signup",
  // Sem um hook, a resposta 400 repete o corpo que foi enviado, senha incluída.
  sValidator("json", signup, (result, c) => {
    if (!result.success) {
      return c.json({ issues: result.error }, 400);
    }
  }),
  (c) => c.json(c.req.valid("json"), 201),
);
```

Passe um hook para `sValidator`, como acima. Sem ele, a resposta a uma entrada que falha repete a entrada enviada, que os problemas deste pacote nunca guardam. Assim, uma senha ou um token enviado ao endpoint voltaria na resposta e em tudo que a registra em log.

## Ferramentas de um modelo de linguagem

Um modelo escolhe uma ferramenta e preenche os argumentos dela a partir do JSON Schema da entrada. Então descreva cada argumento com [`meta`](shaping-values.md#meta): a descrição é o que o modelo lê.

### AI SDK

Verificado com ai 7.0.131. O AI SDK escreve a entrada de uma ferramenta com `~standard.jsonSchema`, que [`standardJsonSchema`](standard-schema.md#com-seu-json-schema) adiciona e `standard` não, no draft-07.

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

Argumentos enviados pelo modelo que falham são recusados antes de `execute` rodar, com os problemas escritos em inglês.

### Model Context Protocol

Verificado com @modelcontextprotocol/sdk 1.32.1. O `McpServer.registerTool` dele só aceita schemas zod, então a ferramenta é declarada no `Server` que fica por baixo dele, que aceita um JSON Schema, e o handler recusa uma ferramenta que não tem e valida os argumentos.

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

O OpenAPI 3.1 escreve schemas em JSON Schema 2020-12, que é o que `toJsonSchema` escreve, então um schema entra em `components.schemas` sem mudanças. Um schema recursivo é a exceção. Ele se refere às suas definições como `#/$defs/schema1`, a partir da raiz do documento em que está, e a raiz de um documento OpenAPI não tem `$defs`. Então um schema assim precisa ter as definições movidas para `components.schemas` e as referências reescritas para apontar para lá. O OpenAPI 3.0 usa um dialeto mais antigo, que `toJsonSchema` não escreve.

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

## Dentro de um schema zod ou valibot

Um código que usa zod ou valibot pode usar um validador deste pacote em um campo, como `url()` para um link que o servidor vai buscar ou `email()` para um endereço que ele vai guardar, sem migrar os outros schemas. Nenhuma das duas bibliotecas aceita um Standard Schema como parte dos próprios schemas, então o validador roda num transform: o que ele produz é o valor do campo, e cada problema que ele reporta vira um problema da outra biblioteca, com o texto de `formatIssue`. Só um validador síncrono funciona assim.

O problema passa então a seguir as regras da outra biblioteca: os problemas do valibot guardam a entrada que receberam, então o que [Problemas e mensagens](errors.md) diz sobre problemas nunca guardarem um valor da entrada vale aqui para o resultado do validador, não para o problema que o valibot reporta.

### zod

Verificado com zod 4.6.5. Cada problema mantém o caminho dele abaixo do campo, então um problema vindo de um `object` cai na propriedade dele.

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
// issues: "Invalid URL" em ["callback"], "Invalid email address" em ["owner"]
```

### valibot

Verificado com valibot 1.5.0. O transform tira o tipo de entrada do validador, então ele vem depois de um schema cuja saída é o que o validador aceita, como `v.string()` para `url()`. Todo problema cai no próprio campo.

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
// issues: "Invalid URL" em callback, "Invalid email address" em owner
```

O adaptador são algumas linhas no seu código, e não um export deste pacote. Assim, a API deste pacote não precisa acompanhar o contexto que cada biblioteca passa a um transform, que o zod mudou entre as versões 3 e 4.

## Próximos passos

Em produção, um validador encontra entradas escritas para prejudicá-lo. [Limites](limits.md) diz o que o pacote limita por você e o que deixa para você.
