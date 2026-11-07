---
title: Registros
description: Os cinco buckets, como os identificadores são comparados, qual correspondência vence e quando usar um registro próprio em vez do global.
source: fe8b2fa94a77dd5c39e190922da020b0c0963f4a
order: 3
---

# Registros

Um registro é onde você descreve as falhas que conhece. Esta página explica como preencher um, como `createAppError` o vasculha e como escolher entre o registro global e registros próprios. Se algum dia um erro sair com uma mensagem que você não esperava, a resposta está em algum lugar desta página.

## Feedback: o que uma correspondência produz

Cada entrada associa um identificador a um feedback, um objeto `ErrorFeedback`. Aqui o gerenciador de projetos descreve o rate limit da sua API:

```ts
registry.codes.add("E_RATE_LIMIT", {
  message: "Recebemos requisições demais. Espere alguns minutos e tente de novo.",
  messageKey: "error.myApp.api.rateLimit",
  source: "my-app.api",
  isRetryable: false,
});
```

| Campo         | Obrigatório | Significado                                                                                                           |
| ------------- | ----------- | --------------------------------------------------------------------------------------------------------------------- |
| `message`     | Sim         | O texto que as pessoas veem. Escreva o que aconteceu e o que fazer em seguida.                                        |
| `messageKey`  | Não         | Uma chave de tradução. Qualquer string não vazia, então dá para reaproveitar as chaves que o seu catálogo já tem.     |
| `source`      | Não         | Um rótulo para a origem da falha. Qualquer string não vazia.                                                          |
| `isRetryable` | Não         | Se a chamada que falhou pode ser repetida como está. O padrão é `false`; veja [O AppError](app-error.md#isretryable). |

As entradas são verificadas e copiadas quando você as adiciona. Uma `message` vazia, ou um campo do tipo errado, lança `TypeError` ali mesmo, na inicialização, e não mais tarde, no meio do tratamento de algum outro erro.

## Os cinco buckets

Um registro tem cinco buckets, um para cada forma de reconhecer uma falha:

| Bucket     | Compara com                                | Identificador de exemplo       | Tipo do resultado |
| ---------- | ------------------------------------------ | ------------------------------ | ----------------- |
| `codes`    | A propriedade `code` do erro               | `"23505"`, `"ECONNREFUSED"`    | `"known"`         |
| `names`    | A propriedade `name` do erro               | `"AbortError"`                 | `"known"`         |
| `messages` | A `message` inteira                        | `"Upload failed"`              | `"known"`         |
| `prefixes` | O começo da `message`                      | `"Quota exceeded for bucket"`  | `"known"`         |
| `patterns` | Uma expressão regular aplicada à `message` | `/^request to .+ timed out$/i` | `"heuristic"`     |

Prefira os buckets do topo. Um código ou um nome é escolhido por quem escreveu o código que falha, e raramente muda. Uma mensagem é prosa, e a próxima versão de uma biblioteca pode reescrevê-la numa terça-feira qualquer sem avisar ninguém.

Todo bucket tem os mesmos métodos para escrever e ler:

- `add(identifier, feedback)` adiciona uma entrada, ou substitui a entrada com o mesmo identificador.
- `addList(entries)` adiciona uma lista de pares `[identifier, feedback]`. Ele verifica a lista inteira antes de adicionar qualquer coisa, então um erro na quinta entrada deixa o bucket como estava.
- `delete(identifier)` remove uma entrada e devolve `true` se havia uma para remover.
- `clear()` esvazia o bucket.
- `values()` devolve todas as entradas. Os buckets `codes`, `names` e `messages` devolvem pares `[identifier, feedback]` na ordem em que foram adicionados. O bucket `prefixes` devolve objetos com um campo `prefix` ao lado do feedback, do prefixo mais longo para o mais curto. O bucket `patterns` devolve objetos com um campo `pattern`, na ordem em que foram adicionados.

Os buckets `codes`, `names` e `messages` também têm `get(identifier)`, que devolve o feedback de um identificador, ou `undefined`.

### Como os identificadores são comparados

Cada bucket dá uma pequena arrumada nos identificadores antes de compará-los, do mesmo jeito quando você adiciona um e quando um erro é comparado:

- **Códigos e nomes** têm os espaços das pontas removidos e, fora isso, são comparados exatamente, incluindo maiúsculas e pontuação. Um `code` numérico, como um status HTTP, é comparado como texto, então `{ code: 404 }` corresponde a um `"404"` registrado.
- **Mensagens e prefixos** têm os espaços das pontas removidos, e todo `.`, `!`, `?` e espaço no final é retirado, então `"Upload failed"`, `"Upload failed."` e `"Upload failed!! "` são o mesmo identificador. A comparação diferencia maiúsculas de minúsculas: `"upload failed"` não corresponde.
- **Prefixos** correspondem quando a mensagem começa com o prefixo. Quando vários correspondem, o mais longo vence.
- **Patterns** rodam contra a mensagem crua, na ordem em que foram adicionados, e o primeiro que corresponder vence. As flags `g` e `y` são removidas quando um pattern é adicionado, porque elas fazem o `test()` lembrar a última posição e dar respostas diferentes para o mesmo texto. Use a flag `i` para comparar sem diferenciar maiúsculas de minúsculas.

Um `DOMException` é comparado como qualquer outro erro, por nome, mensagem, prefixo e pattern, exceto pelo `code` numérico, que é pulado. Esse é um número legado (`20` para `AbortError`, por exemplo), da época em que as Web APIs numeravam os seus erros, e esse número, de outro modo, corresponderia a códigos que não têm nada a ver.

Adicionar um identificador que já existe substitui o feedback dele. Para patterns, "o mesmo" quer dizer o mesmo source e as mesmas flags.

## Qual correspondência vence

`createAppError` junta o valor que você passou e todos os erros embrulhados dentro dele, começando pelo mais externo e indo para dentro. Depois escolhe um resultado, nesta ordem:

1. Uma correspondência **conhecida** em qualquer lugar: um código, nome, mensagem exata ou prefixo, ou um `AppError` que já é `"known"`. A mais externa vence, com uma exceção: quando você passa um `registry`, uma correspondência conhecida desse registro vence um `AppError` conhecido encontrado dentro do valor, por mais funda que a correspondência esteja, porque passar um registro é pedir o texto dele.
2. Senão, uma correspondência **heurística** em qualquer lugar: um pattern, ou um `AppError` que já é `"heuristic"`.
3. Senão, qualquer `AppError` encontrado dentro do valor.
4. Senão, um erro `"unknown"` com a mensagem de fallback.

Dentro de um mesmo valor embrulhado, a ordem é código, depois nome, depois mensagem exata, depois prefixo, depois pattern.

A primeira regra é o que faz falhas embrulhadas fundo funcionarem. Um `fetch` que falha no Node.js lança `TypeError: fetch failed`, que corresponde a um pattern. O `cause` dele, porém, carrega `code: "ECONNREFUSED"`, que corresponde a um código. A correspondência conhecida mais funda vence a heurística mais rasa, então você recebe a mensagem mais específica.

Erros embrulhados são procurados em `cause`, `originalError`, `error`, `err`, `inner` e `innerError`, e nas dez primeiras entradas de uma lista `errors`, como em um `AggregateError`. A busca desce três níveis, e uma cadeia de `cause` continua até oito; veja [O AppError](app-error.md#opções) para o `maxDepth`. Objetos já visitados são pulados, então um erro que é o próprio cause não consegue deixar a busca andando em círculos.

## O registro global ou um próprio

`getErrorRegistry()` devolve o registro global. Ele começa vazio, e é o que `createAppError` usa quando você não passa nenhum `registry`. Para a maioria das aplicações, um registro global configurado na inicialização é tudo de que você precisa.

Crie o seu com `createErrorRegistry()` quando um conjunto de mapeamentos não deve valer em todo lugar. O gerenciador de projetos recebe pagamentos, e o provedor de pagamento dele tem os seus próprios códigos:

```ts
import { createAppError, createErrorRegistry } from "@codenhub/error";

const billingRegistry = createErrorRegistry();
billingRegistry.codes.add("card_declined", {
  message: "O seu cartão foi recusado. Tente outro cartão.",
  source: "my-app.billing",
});

const error = createAppError(caught, { registry: billingRegistry });
```

Recorra a um registro separado quando:

- **Dois serviços usam o mesmo código para coisas diferentes.** O bucket `codes` é um namespace só, então se o seu provedor de pagamento e o seu banco usam os dois `"P0001"`, vence o que foi adicionado por último, e o outro fica errado de um jeito que nenhum teste percebe. Dê a cada serviço o seu registro e classifique os erros dele contra esse registro.
- **Os nomes de um preset são amplos demais para algum código.** O bucket `names` corresponde a qualquer valor com aquele nome. Com o preset de navegador no merge, a classe `TimeoutError` de uma biblioteca qualquer é classificada como a do navegador.
- **Você classifica dados vindos de outro lugar.** Corpos de resposta de outro serviço devem ser classificados contra os códigos desse serviço, não contra presets de rede feitos para o seu próprio runtime.

`createErrorRegistry(presets)` começa um registro a partir de uma lista de outros, com merge na ordem:

```ts
import { createErrorRegistry } from "@codenhub/error";
import { nodeErrorRegistry } from "@codenhub/error/registries/node";

const apiRegistry = createErrorRegistry([nodeErrorRegistry, myApiRegistry]);
```

`setErrorRegistry(registry)` substitui o registro global de vez. Ele é útil principalmente em testes, para começar cada teste de um estado conhecido.

## Combinando e congelando

`registry.merge(other)` copia todas as entradas de `other` para `registry`, substituindo as entradas com o mesmo identificador. Ele verifica a origem inteira antes, então uma entrada ruim deixa o destino como estava. `registry.clear()` esvazia todos os buckets.

`freezeRegistry(registry)` devolve um snapshot somente leitura, tipado como `ReadonlyErrorRegistry`. Ele tem só os métodos de leitura, mesmo que você vá procurar com reflection: `get` e `values` em `codes`, `names` e `messages`, e só `values` em `prefixes` e `patterns`. Mudanças posteriores no original não chegam até ele. Os presets nativos são snapshots congelados, e congelar é o jeito de compartilhar um conjunto de mapeamentos entre pacotes ou times sem que ninguém o mude por acidente:

```ts
import { createErrorRegistry, freezeRegistry } from "@codenhub/error";

const registry = createErrorRegistry();
registry.codes.add("project.not_found", { message: "Não encontramos esse projeto. Ele pode ter sido excluído." });

export const projectErrors = freezeRegistry(registry);
```

Um registro congelado funciona em qualquer lugar em que um registro é lido: como a opção `registry`, no `merge` e na lista que você passa para `createErrorRegistry`.

Tudo o que um bucket devolve também é congelado. `values()` devolve a mesma lista congelada até o bucket mudar, e as entradas, os objetos de feedback e as expressões regulares dela são todos congelados. Espalhe um deles em um objeto novo quando precisar de uma cópia que possa alterar, e copie um pattern com `new RegExp(pattern.source, pattern.flags)`.

## Escrevendo patterns

Um pattern roda contra a mensagem de toda falha que chega a `createAppError`, e mensagens podem vir de qualquer lugar, inclusive de alguém tentando deixar o seu servidor lento. Um pattern com muito backtracking, como `/(a+)+$/`, pode travar por segundos com uma mensagem montada para isso. Mantenha os patterns simples:

- Ancore-os com `^` e `$`.
- Evite repetição aninhada, como um `+` dentro de um grupo que também se repete.
- Use um código, nome, mensagem ou prefixo sempre que existir um.

Ancorar também impede um pattern de corresponder a coisa demais. `/load failed/i` corresponde a `"Config load failed"`; `/^load failed\.?$/i` corresponde só à mensagem do próprio navegador.

## Tipos

Os tipos de registro são exportados para código que monta registros ou os passa adiante:

| Tipo                                                      | Use para                                                                   |
| --------------------------------------------------------- | -------------------------------------------------------------------------- |
| `ErrorFeedback`                                           | O objeto de feedback de uma entrada, como em uma checagem com `satisfies`. |
| `ErrorRegistry`                                           | Um registro que você pode alterar, vindo de `createErrorRegistry`.         |
| `ReadonlyErrorRegistry`                                   | Um snapshot congelado, vindo de `freezeRegistry`, e todo preset.           |
| `ErrorRegistryBucket`                                     | Os buckets `codes`, `names` e `messages`.                                  |
| `ErrorPrefixRegistryBucket`, `ErrorPatternRegistryBucket` | Os buckets `prefixes` e `patterns`.                                        |
| `ErrorPrefixDefinition`, `ErrorPatternDefinition`         | O que os buckets `prefixes` e `patterns` devolvem em `values()`.           |

## Próximos passos

Agora você consegue escrever os seus próprios mapeamentos. A maioria das aplicações também quer os que alguém já escreveu: [Presets](presets.md) lista todas as falhas que os presets de navegador, Node.js, HTTP e Supabase reconhecem.
