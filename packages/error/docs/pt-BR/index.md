---
title: Visão geral
description: Para que o ErrorKit serve, a ideia por trás dele, um tour de cinco minutos e a ordem em que ler o resto da documentação.
source: 2f96329b1cd9629ce0b944a81f0dfd91ea08a4b3
---

# Transforme o que você capturou em um erro que dá para usar

O `@codenhub/error` (ErrorKit) pega qualquer valor que o seu código capturou e devolve um único `AppError` previsível. Esse erro tem uma mensagem que você pode mostrar para uma pessoa, uma chave que você pode traduzir, um código para decidir o que fazer e uma flag que diz se repetir a chamada é seguro. O valor original continua anexado para os seus logs.

## O problema

Em TypeScript, um bloco `catch` te entrega um `unknown`, que é o jeito educado do sistema de tipos dizer "boa sorte". Na prática, esse valor pode ser qualquer coisa:

- Um `fetch` que falhou é um `TypeError`, e a mensagem dele depende de qual navegador você pergunta.
- Uma chamada ao Supabase devolve um objeto com um `code` como `"invalid_credentials"`.
- Um driver de banco lança um erro cujo `code` é `"23505"`, que é como o PostgreSQL diz "esse valor já está em uso".
- Uma biblioteca embrulha a falha de verdade três níveis abaixo, em `cause`.
- E em algum lugar alguém lança uma string pura. Deve ter tido os seus motivos.

Então cada lugar que captura um erro acaba com o seu próprio tradutorzinho, e com o tempo esses tradutores vão se distanciando. Uma tela mostra para o cliente `duplicate key value violates unique constraint "projects_name_key"`, e agora ele sabe o nome das suas tabelas e continua sem ideia do que fazer. Outra tela mostra "Algo deu errado" para uma falha que poderia ter dito exatamente como resolver.

## A ideia

O ErrorKit divide o trabalho em dois:

1. **Um registro descreve as falhas que você conhece.** Você o preenche uma vez, quando a aplicação inicia. Cada entrada associa algo que identifica uma falha (um código, um nome de erro, uma mensagem exata, um prefixo de mensagem ou uma expressão regular) ao feedback que você quer que as pessoas vejam.
2. **`createAppError` normaliza qualquer coisa** contra esse registro. Ele vasculha o valor e os erros embrulhados dentro dele, escolhe a melhor correspondência e devolve um `AppError`. Quando nada corresponde, você ainda recebe um `AppError`, com uma mensagem genérica segura, então o texto cru de uma falha inesperada nunca chega à tela.

Registros prontos, chamados presets, cobrem falhas comuns de navegador, Node.js, HTTP e Supabase. Eles são opcionais: importar um não muda nada até você fazer o merge dele.

Por cima disso ficam os helpers de resultado (`ok`, `err`, `attempt`, `attemptAsync` e companhia), para código que prefere devolver uma falha em vez de lançá-la.

## Instalação

```sh
pnpm add @codenhub/error
```

O pacote é ESM e não tem dependências em runtime. Ele tem oito entrypoints, então você importa só o que usa:

| Caminho de import                     | O que contém                                                                           |
| ------------------------------------- | -------------------------------------------------------------------------------------- |
| `@codenhub/error`                     | `createAppError`, as funções de registro e os helpers de resultado                     |
| `@codenhub/error/registries/browser`  | O preset de navegador e Web APIs                                                       |
| `@codenhub/error/registries/node`     | O preset de rede do Node.js                                                            |
| `@codenhub/error/registries/http`     | O preset de status de resposta HTTP                                                    |
| `@codenhub/error/registries/supabase` | O preset do Supabase                                                                   |
| `@codenhub/error/registries`          | Os quatro presets em um import só                                                      |
| `@codenhub/error/react`               | `AppErrorBoundary`, um error boundary de React; veja [Error boundaries](frameworks.md) |
| `@codenhub/error/svelte`              | `createAppErrorBoundary`, para um `<svelte:boundary>` do Svelte                        |

## Um tour de cinco minutos

Todos os exemplos desta documentação pertencem a uma mesma aplicação pequena: um gerenciador de projetos em que as pessoas entram com o Supabase, criam projetos, e o navegador chama a API da própria aplicação com `fetch`. Cada página acrescenta uma peça a ela.

Primeiro, descreva as falhas que você conhece, uma vez, na inicialização:

```ts
// src/errors.ts, importado uma vez quando a aplicação inicia
import { getErrorRegistry } from "@codenhub/error";
import { browserErrorRegistry } from "@codenhub/error/registries/browser";

const registry = getErrorRegistry();

registry.merge(browserErrorRegistry);
registry.codes.add("project.limit_reached", {
  message: "Você atingiu o limite de projetos do seu plano. Arquive um projeto e tente de novo.",
  messageKey: "error.project.limitReached",
  source: "my-app.projects",
});
```

Depois, normalize em todo lugar por onde uma falha entra no seu código:

```ts
import { createAppError } from "@codenhub/error";

try {
  await createProject(draft);
} catch (caught) {
  const error = createAppError(caught);

  showToast(error.message); // Seguro para mostrar: veio do registro ou do fallback.
  console.error(error.originalError); // O valor cru, para você, não para quem lê.
}
```

Eis o que o toast diz em cada caso:

- `createProject` lançou `{ code: "project.limit_reached" }`: o toast explica o limite do plano.
- A rede caiu: o preset de navegador reconhece o `fetch` que falhou e diz isso.
- Algo que ninguém previu: o toast diz `"An unexpected error occurred."`, e o seu log ainda tem a história toda.

Se você prefere devolver falhas em vez de lançá-las, a mesma normalização alimenta os helpers de resultado:

```ts
import { attemptAsync } from "@codenhub/error";

const result = await attemptAsync(() => createProject(draft));

if (!result.ok) {
  showToast(result.error.message);
}
```

## Requisitos

- Node.js 24 ou mais recente, ou um navegador, worker ou runtime de edge compatível com ES2022.
- Suporte nativo a `cause` em `Error`, que todos os runtimes acima têm.
- ESM. Código CommonJS pode carregar o pacote com `require()` nos runtimes que permitem fazer `require` de módulos ES, como o Node.js 24.
- Só para os adaptadores: React 18 ou mais recente para `@codenhub/error/react`, e Svelte 5.3 ou mais recente para `@codenhub/error/svelte`. Os dois são peer dependencies opcionais, então o resto do pacote instala sem eles.

O pacote nunca mexe em globais do navegador ou do Node.js, então roda igual no navegador, no servidor, durante a renderização no servidor, em um worker ou em um runtime de edge. Importar um preset não contata nenhum serviço e não precisa de nenhum outro pacote.

## O que ele não faz

O ErrorKit decide o que uma falha significa. O que acontece depois é com você:

- **Ele não reporta erros.** Ele te dá os campos para decidir quais valem a pena reportar e guarda o valor cru para o seu error tracker; veja [Receitas](recipes.md#reportar-para-um-error-tracker).
- **Ele não tenta de novo.** `isRetryable` diz quando uma nova tentativa é segura, e [Receitas](recipes.md#tentar-de-novo-com-segurança) mostra um loop pequeno que usa isso.
- **Ele não vem com traduções.** Toda mensagem de preset tem uma chave de tradução estável para o seu próprio catálogo; veja [Receitas](recipes.md#traduzir-mensagens).
- **Ele não lê status HTTP sozinho.** O `fetch` resolve normalmente com um `404`, então você passa o status; veja [Receitas](recipes.md#classificar-respostas-http).

[Ressalvas e limitações](caveats.md) cobre o resto das surpresas.

## Caminho de leitura

Na primeira vez, leia nesta ordem; cada página se apoia nas anteriores.

1. [Primeiros passos](getting-started.md): configure o registro do gerenciador de projetos, normalize as falhas onde elas entram e decida o que mostrar e o que reportar.
2. [O AppError](app-error.md): cada campo e o que ele promete, o que acontece quando um erro é normalizado duas vezes e como mandar um do servidor para o cliente.
3. [Registros](registries.md): as cinco formas de reconhecer uma falha, qual correspondência vence e quando um registro próprio é melhor que o global.
4. [Presets](presets.md): todas as falhas que os presets de navegador, Node.js, HTTP e Supabase reconhecem, com a chave de tradução e a flag de nova tentativa de cada uma.
5. [Resultados](results.md): devolva falhas em vez de lançá-las, com `Result`, `attempt` e os helpers que os encadeiam.
6. [Error boundaries](frameworks.md): mostre uma mensagem segura quando um componente React ou Svelte falha ao renderizar, e reporte uma vez só.
7. [Receitas](recipes.md): soluções completas para status HTTP, chamadas ao Supabase, os seus próprios códigos de erro, novas tentativas, traduções, envio para um error tracker e testes.
8. [Ressalvas e limitações](caveats.md): tudo o que surpreende as pessoas, por que funciona assim e o que fazer em vez disso.

A [referência da API](../reference/index.md) (em inglês) lista todos os exports com as suas assinaturas, gerada a partir do código-fonte. É o lugar para consultar alguma coisa, não para começar.
