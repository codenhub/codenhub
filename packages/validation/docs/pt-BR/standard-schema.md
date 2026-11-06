---
title: Standard Schema
description: Use um validador em qualquer biblioteca que aceite um Standard Schema, como bibliotecas de formulário, frameworks de API e roteadores.
source: 73e46b19be7edce0bf1530eb1b7febf6e6a3f8dd
order: 9
---

# Standard Schema

O formulário de cadastro roda numa biblioteca de formulários, e o endpoint de cadastro num framework web. Nenhum dos dois deveria precisar de um adaptador para cada biblioteca de validação, e bibliotecas de validação não faltam. Sim, sabemos que fizemos mais uma. O [Standard Schema](https://standardschema.dev/) é uma pequena interface compartilhada que permite a uma biblioteca aceitar um validador sem depender da biblioteca que o criou. Bibliotecas de formulário, frameworks de API e roteadores que dão suporte a ela aceitam diretamente qualquer validador compatível, de qualquer biblioteca. Esta página mostra como um validador deste pacote é um Standard Schema e como escolher o texto das mensagens dele.

Todo validador criado por uma factory deste pacote já é um Standard Schema:

```ts
import { email, number, object } from "@codenhub/validation";

const signup = object({ email: email(), age: number({ int: true }) });

signup["~standard"].validate({ email: "nope", age: 1.5 });
// {
//   issues: [
//     { message: "Invalid email", path: ["email"] },
//     { message: "Must be an integer", path: ["age"] },
//   ],
// }
```

Passe `signup` para a biblioteca que pede um Standard Schema, e ela mesma vai chamar `~standard.validate`. Você não precisa chamá-lo, a menos que esteja escrevendo essa biblioteca. O tipo dele é [`Schema`](#os-tipos), que diz isso ao TypeScript.

## Inglês curto, ou `standard`

A especificação exige uma mensagem em todo problema. O `~standard` de um validador escreve cada uma em inglês curto: a `message` do próprio problema, definida com a opção `message` ou por uma verificação, ou uma frase para o código dele, como "Must be at least 2 characters" ou "Invalid email". Ele é curto porque todo programa que cria um validador o inclui no bundle.

Alguns problemas recebem menos que uma frase:

- Uma verificação cujo nome é um identificador de código, como `startsWith`, e um formato cujo nome é escrito assim, como `creditCard`, viram "Invalid value". O inglês curto não mostra o nome de uma função a quem lê.
- Uma chave não reconhecida vira "Unrecognized key", já que a chave é o último segmento do caminho.

`standard` escreve os dois por extenso.

`standard(validator, messages?)` devolve o mesmo validador com um `~standard` próprio, que escreve os problemas como [`formatIssue`](errors.md#transformando-um-problema-em-texto) faz. Use-o para:

- **O inglês completo**, como "Invalid email address" e "Must contain at most 3 items", que é o padrão.
- **Outro idioma**, com `portugueseMessages`, `spanishMessages` ou um mapa seu.
- **Um validador que você escreveu à mão**, que não tem `~standard` próprio, já que não foi este pacote que o criou.

```ts
import { email, number, object, portugueseMessages, standard } from "@codenhub/validation";

const signup = standard(object({ email: email(), age: number({ int: true }) }), portugueseMessages);
```

## Os tipos

Uma factory retorna um `Schema<T, TInput>`, ou um `AsyncSchema<T, TInput>` quando uma das regras dele espera: um `Validator` ou `AsyncValidator` que também é um `StandardSchemaV1<TInput, T>`. Ele é aceito em qualquer lugar onde um `Validator` é, então um código que recebe um validador, como `assert` ou uma função sua, continua recebendo-o como antes. Um validador que você escreve à mão tem o tipo `Validator`, que não exige `~standard`, e `brand` aplicado a ele continua sendo um `Validator`, já que `brand` retorna o validador que recebe.

## O que `standard` retorna

Um validador que se comporta exatamente como o que você passou, com a propriedade `~standard` adicionada, então ele continua sendo um validador comum que você pode chamar e compor. O validador que você passou não é modificado, então o mesmo validador pode ser exposto duas vezes, com mensagens diferentes para públicos diferentes.

`~standard.validate` retorna `{ value }` no sucesso e `{ issues }` na falha, nunca os dois. Ele retorna o resultado diretamente para um validador síncrono e uma `Promise` para um assíncrono, o que a especificação permite. Isso vale até para um validador seu que retorne outro tipo de thenable, como o de um query builder, já que quem chama distingue os dois com `instanceof Promise` e leria qualquer outra coisa como um resultado sem problemas. O tipo de entrada é o que o validador aceita, [`InferInput`](forms.md#os-tipos-de-um-formulário), e o tipo de saída é o que ele produz. Assim, uma biblioteca que infere tipos de um Standard Schema recebe os dois. Uma biblioteca de formulários tipa o campo de um `coerceNumber()` como `string | number`, já que um número também passa, e tipa o que entrega a você depois da validação como um número.

O pacote exporta o tipo `StandardSchemaV1`, para você aceitar um no seu próprio código, e `StandardJSONSchemaV1`, para um que também traz o seu JSON Schema.

## Mensagens de `standard`

`standard` monta cada mensagem a partir do mapa de mensagens passado como segundo argumento: o inglês embutido quando você não passa nenhum, `portugueseMessages` para português, ou um mapa seu. Um programa que chama `standard` inclui o inglês no bundle, mesmo quando passa outro mapa, já que ele é o padrão. Um programa que escreve os problemas com um mapa próprio e nunca chama `standard` não o inclui. Um segundo argumento omitido ou passado como `undefined` é o inglês; qualquer outro que não seja um mapa, como `null`, um texto ou uma lista, causa um `TypeError` quando `standard` é chamado. As mensagens então vêm de [`formatIssue`](errors.md#transformando-um-problema-em-texto): a `message` do próprio problema, depois uma entrada para o `code` dele no mapa, depois a entrada `default` do mapa, depois "Invalid value".

```ts
import { englishMessages, number, standard } from "@codenhub/validation";

const age = standard(number({ min: 18 }), {
  ...englishMessages,
  too_small: (issue) => `Você precisa ter pelo menos ${String(issue.params?.minimum)} anos`,
});
```

O `path` de cada problema é o caminho do próprio problema, como um array de strings e números.

## Com seu JSON Schema

Algumas bibliotecas também precisam escrever o schema, como o AI SDK, que envia os argumentos de uma ferramenta a um modelo de linguagem como um JSON Schema. Elas o leem de `~standard.jsonSchema`, que o [Standard JSON Schema](https://standardschema.dev/json-schema) adiciona à especificação. `standardJsonSchema(validator, messages?)` retorna o mesmo que `standard`, com ele adicionado:

```ts
import { meta, number, object, optional, standardJsonSchema, string } from "@codenhub/validation";

const forecast = standardJsonSchema(
  object({
    city: meta(string({ min: 1, max: 100 }), { description: "The city to get the weather for" }),
    days: optional(number({ int: true, min: 1, max: 7 })),
  }),
);

forecast["~standard"].jsonSchema.input({ target: "draft-07" });
// { $schema: "http://json-schema.org/draft-07/schema#", type: "object", properties: { city: { ..., description: "The city to get the weather for" }, ... }, required: ["city"] }
```

`input` e `output` escrevem o validador com [`toJsonSchema`](json-schema.md), no lado e no draft pedidos. `"draft-2020-12"` e `"draft-07"` são escritos, e qualquer outro alvo lança um `TypeError`. Quando uma parte do validador não pode ser escrita como JSON Schema, como uma verificação personalizada, `toJsonSchema` lança um erro para ela, e `input` e `output` também, a menos que a biblioteca passe `libraryOptions: { unrepresentable: "any" }`. Essa é a única opção de biblioteca, e qualquer outro nome em `libraryOptions`, como um digitado errado, lança um `TypeError` em vez de ser ignorado. Aplique [`meta`](shaping-values.md#meta) ao validador antes de passá-lo aqui, já que o schema é escrito a partir do validador que `standardJsonSchema` recebe.

É um export separado para que `standard`, que um formulário no navegador usa, não inclua no bundle o código que escreve um schema: use `standard` onde só se pede validação, e `standardJsonSchema` onde o schema também é lido.

## Uma observação sobre funções

Aqui, um validador é uma função, e `standard` anexa `~standard` a uma função. A especificação permite qualquer objeto, e em JavaScript uma função é um, diga o `typeof` o que disser. As bibliotecas que a seguem leem a propriedade, então isso funciona. Uma biblioteca que exija `typeof schema === "object"` antes de olhar não o reconheceria; se você encontrar uma assim, envolva o validador num objeto seu: `{ "~standard": standard(validator)["~standard"] }`.

## Próximos passos

Algumas bibliotecas leem um schema em vez de chamá-lo: uma descrição de API, um gerador de formulários ou um modelo de linguagem escolhendo os argumentos de uma ferramenta. [JSON Schema](json-schema.md) mostra como escrever um validador como um.
