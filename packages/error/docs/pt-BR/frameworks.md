---
title: Error boundaries
description: Mostre um AppError normalizado quando um componente React ou Svelte falha ao renderizar, e reporte-o uma vez só.
source: 7c089a14a60e0e6aa8332a148059264556b71cce
order: 6
---

# Error boundaries

Quando um componente lança uma exceção durante a renderização, o React e o Svelte trocam a parte quebrada da página por um fallback escrito por você. O valor que eles entregam a esse fallback é o que foi lançado, seja lá o que for, então um fallback que mostra `error.message` vaza texto cru para quem está lendo. Esta página cobre os dois adaptadores que resolvem isso: eles normalizam o valor capturado em um `AppError` antes, para que o fallback mostre uma mensagem segura, e o seu error tracker continue recebendo o valor original.

Eles usam o mesmo registro e as mesmas opções que `createAppError`, então não há nada novo para configurar.

Cada adaptador é um entrypoint próprio. O framework é uma peer dependency opcional: instale o pacote ao lado do framework que você já usa, e nada mais vem junto.

| Caminho de import        | O que contém                                       | Precisa de                 |
| ------------------------ | -------------------------------------------------- | -------------------------- |
| `@codenhub/error/react`  | O componente `AppErrorBoundary`                    | React 18 ou mais recente   |
| `@codenhub/error/svelte` | `createAppErrorBoundary`, para `<svelte:boundary>` | Svelte 5.3 ou mais recente |

## React

`AppErrorBoundary` é um componente de error boundary. Ele renderiza os filhos até um deles lançar exceção, e então renderiza o `fallback` com o erro normalizado e uma função `reset`. Aqui ele protege a página de projeto do gerenciador de projetos:

```tsx
import { AppErrorBoundary } from "@codenhub/error/react";

export function ProjectPage({ id }: { id: string }) {
  return (
    <AppErrorBoundary
      fallback={({ error, reset }) => (
        <div role="alert">
          <p>{error.message}</p>
          <button onClick={reset}>Tentar de novo</button>
        </div>
      )}
      onError={(error, info) => tracker.captureException(error.originalError ?? error, { extra: info })}
      resetKeys={[id]}
    >
      <Project id={id} />
    </AppErrorBoundary>
  );
}
```

| Prop        | O que faz                                                                                                            |
| ----------- | -------------------------------------------------------------------------------------------------------------------- |
| `fallback`  | Obrigatória. Renderiza no lugar dos filhos, com `{ error, reset }`.                                                  |
| `onError`   | Chamada uma vez por erro capturado, depois que o fallback renderiza, com o mesmo `AppError` e o error info do React. |
| `options`   | Opções de normalização, como as de `createAppError`: `registry`, `fallbackMessage` e as demais.                      |
| `resetKeys` | Valores que resetam o boundary quando algum deles muda, comparados com `Object.is`, como a rota ou um id.            |
| `onReset`   | Chamada quando o boundary reseta, pelo `reset` ou por uma mudança em `resetKeys`.                                    |

Os tipos das props são exportados como `AppErrorBoundaryProps`, e o objeto que o `fallback` recebe como `AppErrorBoundaryFallbackProps`, para quando você embrulhar o boundary em um componente seu.

Alguns detalhes que vale saber:

- **`options` só são conferidas quando um erro é capturado.** Uma opção inválida então lança exceção enquanto o fallback renderiza, e aí o boundary acima deste recebe um `TypeError` no lugar do erro original, e o `onError` não é chamado. Experimente as opções com `createAppError` em um teste para pegar isso antes que um incidente pegue.
- **`reset` renderiza os filhos de novo.** Se o que os fez lançar exceção não mudou, eles lançam de novo e o fallback volta na hora. Resete depois que o estado que causou a falha mudar, ou deixe o `resetKeys` fazer isso quando a pessoa navegar. No exemplo acima, abrir outro projeto reseta o boundary. Uma mudança de chave só reseta um erro que já estava na tela: quando abrir um projeto é justamente o que lança exceção, o fallback aparece e fica, em vez de o boundary resetar direto para a mesma falha e reportá-la duas vezes. `reset` não é uma nova tentativa de uma chamada que falhou, e não depende de `isRetryable`, que é sobre chamadas, não sobre renderizações.
- **O fallback e o `onError` recebem a mesma instância de `AppError`,** então o que a pessoa vê e o que você reporta sempre batem.
- **`null` ou `undefined` lançados também contam como erro.** Lançar esses valores é JavaScript válido, ainda que não seja boa ideia, e o boundary mostra o fallback com a mensagem genérica mesmo assim.

## Svelte

O Svelte 5 tem o `<svelte:boundary>` embutido. `createAppErrorBoundary` devolve as duas peças de que ele precisa: um handler `onerror` e uma função `toAppError` para o snippet `failed`.

```svelte
<script>
  import { createAppErrorBoundary } from "@codenhub/error/svelte";

  const boundary = createAppErrorBoundary({
    options: { fallbackMessage: "Não foi possível carregar este projeto." },
    onError: (error) => tracker.captureException(error.originalError ?? error),
  });
</script>

<svelte:boundary onerror={boundary.onerror}>
  <Project />

  {#snippet failed(error, reset)}
    <div role="alert">
      <p>{boundary.toAppError(error).message}</p>
      <button onclick={reset}>Tentar de novo</button>
    </div>
  {/snippet}
</svelte:boundary>
```

`createAppErrorBoundary` recebe um `AppErrorBoundaryConfig` e devolve `AppErrorBoundaryHandlers`:

- **`options`** são as opções de normalização, como as de `createAppError`. Um valor inválido lança exceção quando você chama `createAppErrorBoundary`, e não quando o primeiro erro chega, então ele falha enquanto o componente é montado, e não no meio de um incidente. Um nome de opção escrito errado, por outro lado, é ignorado, como no `createAppError`.
- **`onError`** recebe o `AppError` e o `reset` do boundary, uma vez por erro capturado. Passar algo que não é função lança `TypeError` na hora.
- **`toAppError`** devolve a mesma instância de `AppError` para o erro que o `onerror` viu, então o snippet e quem reporta concordam.

Crie um conjunto de handlers por boundary: cada um lembra do último erro que normalizou. O helper não importa o Svelte; ele só segue o formato que o boundary chama.

## O que um boundary não captura

Os dois frameworks capturam erros lançados durante a renderização e durante a execução de effects, e o React também captura os lançados em métodos de ciclo de vida. Nenhum dos dois captura um erro lançado em um event handler, em um `setTimeout` ou em uma promise que ninguém aguardou durante a renderização, e os boundaries do React não rodam durante a renderização no servidor. Trate esses casos onde eles acontecem, com `attempt` ou `attemptAsync`:

```ts
import { attemptAsync } from "@codenhub/error";

async function save() {
  const result = await attemptAsync(() => api.saveProject(draft));

  if (!result.ok) {
    showToast(result.error.message);
  }
}
```

Para uma falha da página inteira em um framework com página de erro própria, como um `+error.svelte` do SvelteKit ou um `error.tsx` do Next.js, chame `createAppError` no erro que essa página recebe.

## Próximos passos

Isso cobre todas as peças do pacote. [Receitas](recipes.md) junta tudo em soluções completas para problemas que você vai encontrar mais cedo ou mais tarde: status HTTP, chamadas ao Supabase, novas tentativas, traduções, envio para um error tracker e testes.
