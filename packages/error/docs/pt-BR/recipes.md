---
title: Receitas
description: Exemplos completos para fetch e códigos de status HTTP, chamadas ao Supabase, os seus próprios códigos de erro, novas tentativas seguras, traduções, envio para um error tracker e testes.
source: 5ba3a1cf6af91494fe3f087e91d41cdafb163eaf
order: 7
---

# Receitas

Cada receita aqui resolve um problema do começo ao fim, usando as peças das páginas anteriores. São as perguntas que aparecem na primeira semana de uso do ErrorKit, geralmente nesta ordem. Copie as partes de que precisar; nenhuma depende de outra.

## Classificar respostas HTTP

O `fetch` só rejeita quando a requisição nem chegou a ser feita. Uma resposta com status `404` ou `500` resolve normalmente: o servidor respondeu, e o `fetch` considera o trabalho dele feito. Então `createAppError(response)` não tem nada para reconhecer e devolve um erro `"unknown"`. Códigos de status precisam de um mapeamento próprio.

Passe o status como `code` e classifique-o contra o preset de HTTP. Mantenha esse preset fora do registro global: códigos de status são números curtos que poderiam colidir com os códigos de outros serviços, e só significam algo para respostas.

```ts
import { attemptAsync, err, type Result } from "@codenhub/error";
import { httpErrorRegistry } from "@codenhub/error/registries/http";

export async function getJson<T>(url: string): Promise<Result<T>> {
  const sent = await attemptAsync(() => fetch(url));

  if (!sent.ok) {
    return sent; // A requisição nunca terminou; o registro global a classificou.
  }

  const response = sent.value;

  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    return err({ code: response.status, cause: body }, { registry: httpErrorRegistry });
  }

  return attemptAsync(() => response.json() as Promise<T>);
}
```

Passar o corpo como `cause` o mantém em `originalError` para os seus logs. Um status que o preset não mapeia, como `418`, resulta na mensagem de fallback. [Presets](presets.md#http) lista o que ele mapeia. Para dar um texto próprio a um status em um endpoint, como um `401` de um formulário de login, monte um registro a partir do preset e acrescente o seu: `createErrorRegistry([httpErrorRegistry])`, depois `.codes.add("401", …)`.

Quando o servidor é seu e manda `error.toJSON()`, reconstrua o erro dele: `appErrorFromJSON(body.error)`. Veja [O AppError](app-error.md#mandando-um-erro-para-o-outro-lado).

## Lidar com chamadas ao Supabase

O cliente do Supabase devolve as falhas em vez de lançá-las, como `{ data, error }`. Passe o `error` para `err` e o preset do Supabase faz o resto:

```ts
import { err, ok, type Result } from "@codenhub/error";

export async function signIn(email: string, password: string): Promise<Result<Session>> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  return error ? err(error) : ok(data.session);
}
```

Isso supõe que o preset do Supabase está no merge do registro global, como em [Primeiros passos](getting-started.md). O `code` do resultado diz qual foi a falha quando você precisa agir sobre ela:

```ts
const result = await signIn(email, password);

if (!result.ok && result.error.code === "email_not_confirmed") {
  redirectTo("/confirm-email");
}
```

Erros de banco funcionam do mesmo jeito: `supabase.from("projects").insert(row)` devolve um `error` cujo `code` é um código do PostgreSQL, como `"23505"`.

## Lançar os seus próprios erros

Um erro que você levanta com um código é tão bom quanto o registro dele. `err({ code: "project.name_mising" })`, com um erro de digitação ou com um mapeamento que ninguém adicionou, é um erro `"unknown"` cujo `code` é `null`, e uma checagem `error.code === "project.name_missing"` nunca dispara. Nada te avisa. Achou o erro de digitação? Pois é, o code review também não vai achar.

Mantenha os seus códigos e o feedback deles em um único objeto, registre-os a partir dele e levante erros por uma função que só aceita as chaves desse objeto. Aí um erro de digitação vira erro de tipo, e todo código que você consegue levantar está registrado:

```ts
import { err, getErrorRegistry, type ErrorFeedback } from "@codenhub/error";

export const projectErrors = {
  "project.name_missing": { message: "Dê um nome ao projeto e salve de novo.", source: "my-app.projects" },
  "project.not_found": { message: "Não encontramos esse projeto.", source: "my-app.projects" },
} satisfies Record<string, ErrorFeedback>;

export type ProjectErrorCode = keyof typeof projectErrors;

getErrorRegistry().codes.addList(Object.entries(projectErrors));

export const projectError = (code: ProjectErrorCode, details?: Record<string, unknown>) => err({ code }, { details });
```

Assim, `projectError("project.name_missing", { field: "name" })` diz exatamente o que é, e `error.code` pode ser comparado com um `ProjectErrorCode`.

Quando os códigos são registrados em mais de um lugar, confira-os em um teste; veja [Configurar erros nos testes](#configurar-erros-nos-testes).

## Tentar de novo com segurança

`isRetryable` diz que uma chamada que falhou pode ser repetida sem o risco de rodar duas vezes. Use-a para tentar de novo só em volta da chamada que falhou, não em volta de uma operação maior que a contém:

```ts
import { attemptAsync, type Result } from "@codenhub/error";

export async function withRetry<T>(call: () => Promise<T>, attempts = 3): Promise<Result<T>> {
  for (let attempt = 1; ; attempt += 1) {
    const result = await attemptAsync(call);

    if (result.ok || !result.error.isRetryable || attempt === attempts) {
      return result;
    }

    await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
  }
}

const users = await withRetry(() => db.query("select * from users"));
```

Embrulhe a consulta única ao banco ou o `fetch` único, não uma função `publish()` que faz upload de um arquivo e depois salva um registro. Se o salvamento falhar com um `ECONNREFUSED` retryable, repetir `publish()` faz o upload do arquivo uma segunda vez. [O AppError](app-error.md#isretryable) explica por que a flag é tão rígida.

O loop espera 500 ms e depois 1 s entre as tentativas. Acrescente jitter se muitos clientes puderem falhar no mesmo instante, para que eles não voltem todos no mesmo instante também.

## Traduzir mensagens

Todo mapeamento de preset, e qualquer mapeamento que você registre com um, traz um `messageKey`. Procure a chave no seu catálogo e use a mensagem em inglês como fallback quando o catálogo não tiver a entrada:

```ts
import type { AppError } from "@codenhub/error";

export function errorText(error: AppError, translate: (key: string) => string | undefined): string {
  return (error.messageKey === null ? undefined : translate(error.messageKey)) ?? error.message;
}
```

As chaves são estáveis entre versões, e cada uma carrega sempre a mesma mensagem. [Presets](presets.md) lista todas as chaves nativas. Para montar um catálogo em código, leia-as dos mapeamentos crus:

```ts
import { browserErrorNames, browserErrorPatterns } from "@codenhub/error/registries/browser";

const browserKeys = new Set([...Object.values(browserErrorNames).map((feedback) => feedback.messageKey), ...browserErrorPatterns.map(([, feedback]) => feedback.messageKey)]);
```

O ErrorKit não vem com traduções. As chaves são o contrato; as palavras são suas.

## Reportar para um error tracker

Reporte o que ninguém descreveu ainda, mais as falhas que você já descreveu mas que continuam sendo bugs:

```ts
import type { AppError } from "@codenhub/error";

// Falhas que só um desenvolvedor consegue resolver. Os presets dão a todas a mesma mensagem compartilhada.
const BUG_CODES = new Set(["42P01", "42703", "unexpected_failure", "InvalidStateError", "500"]);

export function shouldReport(error: AppError): boolean {
  return error.type === "unknown" || (error.code !== null && BUG_CODES.has(error.code));
}

if (shouldReport(error)) {
  errorTracker.captureException(error.originalError, { tags: { source: error.source ?? "none" } });
}
```

Reporte o `originalError`, não o `AppError`: o original carrega a mensagem e a stack de verdade. A maioria dos trackers também segue o `cause` de um erro, e o `cause` de um `AppError` é esse mesmo valor original, então reportar o próprio `AppError` também funciona.

Não reporte só por `type === "heuristic"`. Uma correspondência heurística geralmente é uma falha de rede do lado de quem está usando, e nenhum deploy seu vai consertar o 4G de quem acabou de entrar no túnel do metrô.

## Ignorar requisições canceladas

Cancelar uma requisição com um `AbortController` faz ela falhar com um `AbortError`, que o preset de navegador transforma em "The request was cancelled before it finished." (a requisição foi cancelada antes de terminar). Quando foi o seu próprio código que cancelou, como faz o cleanup de um effect ou uma busca mais nova substituindo uma mais antiga, ninguém deveria ver isso:

```ts
const result = await attemptAsync(() => fetch(url, { signal }));

if (!result.ok && signal.aborted) {
  return; // Fomos nós que cancelamos.
}
```

Checar `signal.aborted` funciona com ou sem o preset de navegador, e não esconde um abort que veio de outro lugar.

## Configurar erros nos testes

O registro global é compartilhado por todos os testes do mesmo arquivo. Substitua-o em um hook de setup para que cada teste comece com os mesmos mapeamentos:

```ts
import { createErrorRegistry, setErrorRegistry } from "@codenhub/error";
import { supabaseErrorRegistry } from "@codenhub/error/registries/supabase";
import { beforeEach } from "vitest";

beforeEach(() => {
  setErrorRegistry(createErrorRegistry([supabaseErrorRegistry]));
});
```

Faça as asserções sobre `code`, `messageKey` ou `type`, e não sobre `message`. Mensagens são escritas para pessoas e acabam sendo reescritas; códigos e chaves são a parte estável. Um teste que quebra porque alguém corrigiu uma vírgula é um teste que o time aprende a ignorar.

Para pegar um código que a sua aplicação levanta mas nunca registrou, liste-os e confira cada um contra o registro que a sua aplicação monta na inicialização:

```ts
import { getErrorRegistry } from "@codenhub/error";
import { expect, it } from "vitest";

import { RAISED_CODES } from "../src/errors";
import { setUpErrors } from "../src/setup-errors";

it.each(RAISED_CODES)("registers %s", (code) => {
  setUpErrors();
  expect(getErrorRegistry().codes.get(code)).toBeDefined();
});
```

## Próximos passos

As receitas cobrem os caminhos comuns. [Ressalvas e limitações](caveats.md) cobre os incomuns: cada surpresa que o pacote pode causar, por que funciona assim e o que fazer em vez disso. Leia uma vez agora, e ela vai te poupar uma sessão de depuração mais tarde.
