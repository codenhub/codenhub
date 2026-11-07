---
title: Resultados
description: Devolva falhas em vez de lançá-las, com Result, attempt e os helpers que os encadeiam.
source: 01f341c6456e7b0ebe5207982191462e13e8d0f6
order: 5
---

# Resultados

Um erro lançado é invisível no tipo de uma função. `loadProject(id): Promise<Project>` não diz nada sobre as formas como ela pode falhar, então cada chamador precisa lembrar do seu próprio `try`/`catch`, e quem esquece descobre em produção. Um `Result` coloca a falha no tipo, e o compilador passa a lembrar por você.

Esta página mostra como criar resultados, lê-los, embrulhar código que lança exceção e encadear vários passos. Tudo aqui é opcional: se o seu código vive bem com `try`/`catch` e `createAppError`, pule direto para [Error boundaries](frameworks.md).

```ts
type Result<T> = Ok<T> | Err;

interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}

interface Err {
  readonly ok: false;
  readonly error: AppError;
}
```

O lado da falha é sempre um `AppError`, normalizado pelo mesmo registro que o `createAppError` usa. Um `Result` é o mesmo tratamento de erros com outro formato, não um segundo sistema para configurar.

## Criando resultados

`ok(value)` embrulha um sucesso, e `ok()` sem argumento cria um `Ok<void>` para operações que não devolvem nada. `err(error, options?)` normaliza uma falha exatamente como `createAppError(error, options)` faria. Aqui o gerenciador de projetos confere o nome de um projeto antes de salvá-lo:

```ts
import { err, getErrorRegistry, ok, type Result } from "@codenhub/error";

getErrorRegistry().codes.add("project.name_missing", {
  message: "Dê um nome ao projeto e salve de novo.",
  source: "my-app.projects",
});

function validateName(name: string): Result<string> {
  const trimmed = name.trim();
  return trimmed === "" ? err({ code: "project.name_missing" }) : ok(trimmed);
}
```

Os dois devolvem objetos congelados.

Levante as suas próprias falhas por código, como acima, e não por mensagem. Uma string passada para `err` é comparada como texto de mensagem com os buckets `messages`, `prefixes` e `patterns`, nunca com `codes`. E uma string que não corresponde a nada não vira a mensagem: `err("Name is required")` te dá `"An unexpected error occurred."`, a não ser que essa mensagem exata esteja registrada. É a mesma regra que mantém texto cru longe da tela, aplicada às suas próprias strings também. O ErrorKit não faz panelinha, nem com você.

## Lendo resultados

Confira o `ok`, e o TypeScript faz o narrowing do resto:

```ts
const name = validateName(input);

if (!name.ok) {
  showFieldError(name.error.message);
  return;
}

save(name.value); // aqui name.value é uma string
```

## Embrulhando código que lança exceção

A maior parte do código que você chama lança exceção em vez de devolver resultados: `JSON.parse`, `fetch`, clientes de banco de dados. `attempt` e `attemptAsync` rodam um callback e transformam qualquer coisa que ele lance em um `Err`:

```ts
import { attempt, attemptAsync } from "@codenhub/error";

const config = attempt(() => JSON.parse(text) as Config);
const project = await attemptAsync(() => api.loadProject(id));
```

Os dois recebem as mesmas opções de `createAppError` como segundo argumento, como um `fallbackMessage` para aquela chamada ou um `registry`.

Algumas regras os mantêm honestos:

- **`attempt` é só para callbacks síncronos.** Um callback que devolve uma promise é erro de tipo. Em runtime, onde o type checker não enxerga (um callback tipado como `any`, ou JavaScript puro), `attempt` lança `TypeError` em vez de devolver um `Ok` com uma promise cuja rejeição ninguém nunca capturaria. Use `attemptAsync` para qualquer coisa assíncrona.
- **Dentro de uma função genérica, passe o argumento de tipo em vez de fazer cast.** A checagem de tipo acima precisa saber o que o callback devolve, então um callback que devolve um valor de um parâmetro de tipo também é erro de tipo: `attempt(() => JSON.parse(text) as T)` não compila. Escreva `attempt<T>(() => JSON.parse(text))`. Para um callback que devolve um `T` que ele recebeu de outro lugar, faça cast do resultado para `never`: `attempt<T>(() => read() as never)`. A checagem em runtime continua rejeitando uma promise.
- **`attemptAsync` nunca rejeita por algo que o callback fez.** A promise dele sempre resolve para um `Result`.
- **Os dois verificam os argumentos antes de rodar o callback.** Um callback que não é função, ou uma opção inválida, lança `TypeError` sem rodar nada. No `attemptAsync`, a promise rejeita com esse erro.

## Encadeando resultados

A maioria dos helpers restantes trabalha no lado do sucesso e deixa um `Err` passar intacto. `orElse` e `orElseAsync` trabalham no lado da falha:

| Helper                           | O que faz                                                                                                    |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `map(result, mapper)`            | Transforma o valor de um `Ok`. Devolve o `Err` sem mudanças.                                                 |
| `mapAsync(result, mapper)`       | Como `map`, com um mapper que pode devolver uma promise. Sempre devolve uma promise.                         |
| `andThen(result, mapper)`        | Roda um mapper que devolve outro `Result`, então você recebe `Result<U>`, e não `Result<Result<U>>`.         |
| `andThenAsync(result, mapper)`   | Como `andThen`, com um mapper que pode devolver uma promise de um `Result`. Sempre devolve uma promise.      |
| `orElse(result, recover)`        | Roda `recover` em um `Err` e devolve o `Result` que ele devolver. Devolve o `Ok` sem mudanças.               |
| `orElseAsync(result, recover)`   | Como `orElse`, com uma recuperação que pode devolver uma promise de um `Result`. Sempre devolve uma promise. |
| `all(results)`                   | Um `Ok` com todos os valores, em ordem, ou o primeiro `Err`.                                                 |
| `match(result, { onOk, onErr })` | Chama exatamente um dos dois callbacks e devolve o que ele devolver.                                         |
| `unwrap(result)`                 | Devolve o valor do `Ok`, ou lança o `AppError`.                                                              |
| `unwrapOr(result, fallback)`     | Devolve o valor do `Ok`, ou `fallback`.                                                                      |

Juntando tudo, um pipeline pequeno se lê de cima para baixo. Este lê a porta de um arquivo de configuração:

```ts
import { andThen, attempt, err, map, match, ok } from "@codenhub/error";

const port = andThen(
  attempt(() => JSON.parse(text) as { port?: unknown }),
  (config) => (typeof config.port === "number" ? ok(config.port) : err({ code: "config.port_missing" })),
);

const label = match(
  map(port, (value) => `Listening on ${value}`),
  {
    onOk: (text) => text,
    onErr: (error) => error.message,
  },
);
```

`orElse` trata as falhas com as quais você consegue fazer algo e repassa o resto. Devolva `err(error)` para toda falha que a recuperação não trata; ela já é um `AppError`, então volta do jeito que está. Aqui o gerenciador de projetos recorre à lista de projetos em cache quando a rede cai:

```ts
import { attemptAsync, err, ok, orElse } from "@codenhub/error";

const projects = orElse(await attemptAsync(() => api.listProjects()), (error) => (error.messageKey === "error.browser.requestFailed" ? ok(cache.projects) : err(error)));
```

`all` transforma vários resultados em um só, e mantém o tipo de cada posição quando você passa uma tupla. Para chamadas que rodam em paralelo, faça o `await` delas juntas antes:

```ts
const loaded = all(await Promise.all([attemptAsync(() => api.user(id)), attemptAsync(() => api.projects(id))]));

if (loaded.ok) {
  const [user, projects] = loaded.value;
}
```

Os helpers não capturam exceções. Se um mapper ou um callback de `match` lançar, a exceção se propaga como se propagaria de qualquer outra função. Quando um passo pode lançar, embrulhe esse passo em `attempt` ou `attemptAsync`.

Use `unwrap` na borda em que o seu código volta a lançar exceções, como um framework que espera que um loader lance, e mantenha `Result` em todo o caminho entre uma ponta e outra.

## Próximos passos

Resultados tratam falhas em código que você chama. Falhas também podem acontecer enquanto um componente renderiza, onde não há nenhum `try` seu por perto. [Error boundaries](frameworks.md) cobre esses casos, para React e Svelte.
