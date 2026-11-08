---
title: Primeiros passos
description: Configure um registro para uma aplicação real, normalize as falhas onde elas entram e decida o que mostrar e o que reportar.
source: b3987f9858b83a8e0f1ef31626e30f78e7976e33
order: 1
---

# Primeiros passos

Esta página monta o tratamento de erros do gerenciador de projetos da [visão geral](index.md): uma aplicação web em que as pessoas entram com o Supabase, criam projetos e chamam a API da própria aplicação com `fetch`. No final, toda falha que a aplicação captura vira uma mensagem com a qual uma pessoa consegue fazer alguma coisa, e toda falha que ninguém previu ainda chega inteira aos seus logs.

São cinco passos, e os presets escrevem a maior parte das mensagens por você.

## 1. Instale o pacote

```sh
pnpm add @codenhub/error
```

## 2. Crie um módulo que configura os erros

Coloque toda a configuração do registro em uma função e chame-a uma vez, antes de qualquer outra coisa rodar. O registro é estado comum de módulo: tudo o que você registra fica visível para todas as chamadas seguintes de `createAppError` que usam a mesma cópia do pacote. Uma função, em vez de código que roda na importação, permite que um teste a chame de novo depois de substituir o registro; veja [Configurar erros nos testes](recipes.md#configurar-erros-nos-testes).

```ts
// src/errors.ts
import { getErrorRegistry } from "@codenhub/error";
import { browserErrorRegistry } from "@codenhub/error/registries/browser";
import { supabaseErrorRegistry } from "@codenhub/error/registries/supabase";

export function setUpErrors(): void {
  const registry = getErrorRegistry();

  // 1. Presets primeiro: eles descrevem falhas que vêm da plataforma e do Supabase.
  registry.merge(browserErrorRegistry);
  registry.merge(supabaseErrorRegistry);

  // 2. Os seus mapeamentos por último, para que vençam onde se sobrepõem a um preset.
  registry.codes.addList([
    [
      "project.limit_reached",
      {
        message: "Você atingiu o limite de projetos do seu plano. Arquive um projeto e tente de novo.",
        messageKey: "error.project.limitReached",
        source: "my-app.projects",
      },
    ],
    [
      "23505",
      {
        message: "Você já tem um projeto com esse nome. Escolha outro.",
        messageKey: "error.project.nameTaken",
        source: "my-app.projects",
      },
    ],
  ]);
}
```

```ts
// src/main.ts
import { setUpErrors } from "./errors";

setUpErrors();
// …o resto da sua aplicação
```

Chame a função antes de qualquer outra coisa no entry point. Os imports estáticos ainda rodam antes dela, então um módulo que normaliza um erro enquanto é importado, e não dentro de uma função que exporta, vê o registro vazio.

A ordem importa aqui. Quando dois mapeamentos no mesmo bucket usam o mesmo identificador, o adicionado por último substitui o outro. É por isso que o mapeamento de `23505` acima vem depois do preset do Supabase: a mensagem do preset para esse código é genérica, sobre um valor duplicado, porque o preset não tem como saber qual valor colidiu, e nesta aplicação o único valor único em que as pessoas podem esbarrar é o nome do projeto, então a nossa diz isso.

Escolha os presets conforme onde o código roda:

- O preset de navegador para código que roda no navegador.
- O preset do Node.js para código que roda no servidor.
- O preset do Supabase onde quer que você chame o Supabase.

[Presets](presets.md) lista exatamente o que cada um cobre. Fazer merge de todos "só por garantia" é como uma mensagem de navegador pedindo para checar o Wi-Fi vai parar em um log de servidor, então escolha de propósito.

Quando a mesma configuração roda em um servidor e em um navegador, como em uma aplicação Next.js ou SvelteKit, receba o preset de runtime como parâmetro e passe o certo a partir de cada entry point. Adivinhar o runtime por globais dá errado justamente nos lugares que você menos testa, como um web worker, que não tem `window`. Esta versão substitui a de cima:

```ts
// src/errors.ts
import { getErrorRegistry, type ReadonlyErrorRegistry } from "@codenhub/error";

export function setUpErrors(runtimePreset: ReadonlyErrorRegistry): void {
  const registry = getErrorRegistry();

  registry.merge(runtimePreset);
  // …o preset do Supabase e os seus mapeamentos, como acima
}

// No entry do cliente, de "@codenhub/error/registries/browser": setUpErrors(browserErrorRegistry);
// No entry do servidor, de "@codenhub/error/registries/node": setUpErrors(nodeErrorRegistry);
```

## 3. Normalize onde as falhas entram no seu código

Chame `createAppError` na fronteira em que uma falha chega a um código que precisa decidir o que fazer com ela. Normalmente é um event handler, um route handler ou um data loader:

```ts
import { createAppError } from "@codenhub/error";

async function onSubmit(form: FormData) {
  try {
    await createProject(form);
    showToast("Projeto criado.");
  } catch (caught) {
    const error = createAppError(caught);

    showToast(error.message);
    reportIfUnexpected(error);
  }
}
```

Você não precisa desembrulhar nada antes. `createAppError` procura erros embrulhados dentro do valor em `cause`, `originalError`, `error`, `err`, `inner`, `innerError` e nas dez primeiras entradas de uma lista `errors`. Um `23505` enterrado dois `cause`s abaixo ainda vira "Você já tem um projeto com esse nome.", desde que nenhum embrulho do lado de fora tenha uma correspondência conhecida própria. Uma correspondência por pattern do lado de fora não interrompe a busca; [Qual correspondência vence](registries.md#qual-correspondência-vence) traz a ordem completa.

## 4. Decida o que mostrar

Todo `AppError` tem uma `message`, e essa mensagem é segura para mostrar desde que as mensagens que você registra também sejam:

- Quando um mapeamento correspondeu, é a mensagem que você ou o preset registrou. Um erro reconstruído com `appErrorFromJSON` traz a mensagem de quem enviou, então reconstrua só o que veio de quem você confia.
- Quando nada correspondeu, é `"An unexpected error occurred."`, nunca o texto cru da falha.

Essa segunda regra é proposital. Mensagens cruas são escritas para desenvolvedores, e muitas vezes trazem nomes de tabela, caminhos de arquivo, detalhes de stack ou dados de outra pessoa. O ErrorKit só mostra texto que alguém registrou de propósito.

Onde você sabe mais sobre o contexto do que "algo falhou", troque o texto genérico:

```ts
const error = createAppError(caught, {
  fallbackMessage: "Não conseguimos criar o seu projeto. Tente de novo daqui a pouco.",
});
```

## 5. Decida o que reportar

`error.type` diz como o erro foi reconhecido:

| `type`        | Significado                                                                    |
| ------------- | ------------------------------------------------------------------------------ |
| `"known"`     | Um código, nome, mensagem exata ou prefixo de mensagem correspondeu.           |
| `"heuristic"` | Só uma expressão regular correspondeu, como no "Failed to fetch" do navegador. |
| `"unknown"`   | Nada correspondeu. A mensagem é a de fallback.                                 |

Um erro `"unknown"` é o que você mais quer ver no seu error tracker, porque é uma falha que ninguém descreveu ainda. O valor cru fica em `error.originalError`, e também em `error.cause`, que a maioria dos error trackers já segue:

```ts
import type { AppError } from "@codenhub/error";

function reportIfUnexpected(error: AppError) {
  if (error.type === "unknown") {
    errorTracker.captureException(error.originalError);
  }
}
```

Um detalhe para ter em mente: `type` diz como o erro foi reconhecido, não o quanto ele é grave. Uma tabela que não existe no banco é `"known"` assim que o código dela é registrado, e continua sendo bug, e dos bons. [Receitas](recipes.md#reportar-para-um-error-tracker) mostra como reportar esses também.

## Próximos passos

Agora você tem o ciclo completo: descrever, normalizar, mostrar, reportar. A próxima página, [O AppError](app-error.md), passa por cada campo que você acabou de usar, incluindo `code`, para decidir o que fazer com uma falha específica, e `isRetryable`, para saber quando uma nova tentativa é segura.
