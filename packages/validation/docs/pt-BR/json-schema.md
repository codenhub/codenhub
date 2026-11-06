---
title: JSON Schema
description: Escreva um validador como um JSON Schema, para o corpo de uma API HTTP, os argumentos de uma ferramenta que um modelo de linguagem chama ou um gerador de formulários.
source: 7cffb6323c34985f02326fa5baac10fb40002fa0
order: 10
---

# JSON Schema

`toJsonSchema(validator)` escreve um validador como um [JSON Schema](https://json-schema.org/), draft 2020-12. É o que um documento OpenAPI, as definições de ferramentas de um modelo de linguagem e muitos geradores de formulários recebem. Assim, um mesmo validador pode tanto verificar um valor quanto dizer a outro programa qual forma o valor precisa ter. O endpoint de cadastro pode publicar o corpo dele num documento OpenAPI a partir do mesmo validador que o verifica.

Esta página mostra o que o schema promete, como cada validador é escrito e como ler um validador você mesmo com `describe`. O schema retornado tem o tipo `JsonSchema`, e as opções, o tipo `JsonSchemaOptions`.

```ts
import { email, number, object, optional, string, toJsonSchema } from "@codenhub/validation";

const user = object({
  name: string({ min: 2 }),
  email: email(),
  age: optional(number({ int: true, min: 0 })),
});

toJsonSchema(user);
// {
//   $schema: "https://json-schema.org/draft/2020-12/schema",
//   type: "object",
//   properties: {
//     name: { type: "string", minLength: 2 },
//     email: { type: "string" },
//     age: { type: "integer", minimum: 0 },
//   },
//   required: ["name", "email"],
// }
```

O resultado é um novo objeto simples que `JSON.stringify` consegue escrever. Ele tem um import próprio, então um programa que nunca pede um schema não inclui no bundle o código que escreve um.

## O que o schema promete

Um schema diz menos do que um validador verifica. `email()` recusa um endereço em `localhost`, e o formato `email` do JSON Schema não tem opinião sobre o assunto. Por isso o schema é escrito para cumprir uma promessa: **um valor que o validador aceita passa no schema**. O schema pode aceitar um valor que o validador depois recusa, e o validador continua sendo a verificação que vale. Valide o que você recebe com o validador, e entregue o schema a quem precisa conhecer a estrutura.

Em três casos essa promessa é flexibilizada. Em dois, o validador limpa um valor antes de verificá-lo, e um schema não consegue dizer isso, e no outro, os dois contam o tamanho do texto de formas diferentes:

- **Opções de limpeza.** `string({ trim: true, max: 5 })` é escrito com `maxLength: 5`, que descreve um texto que não precisa de trim. Um texto com espaços em volta de cinco letras passa no validador e não no schema. Com `case` é igual, e com `clamp` ao lado de um limite também, como em `number({ max: 10, clamp: { min: 0, max: 10 } })`: o schema descreve o valor depois da limpeza. O intervalo de um `clamp` não é escrito.
- **Comprimento de texto.** O `length` de uma string conta um emoji, e qualquer outro caractere fora do Plano Multilíngue Básico, como dois, e o JSON Schema o conta como um, então um `min` ou `max` pode diferir pelo número desses caracteres. Com `pattern` é igual: um schema o lê no modo Unicode, a flag `u`, então num pattern escrito sem essa flag, `.` e uma classe negada como `[^a]` casam com um caractere inteiro no schema e com metade de um emoji no validador.
- **Formatos que aceitam várias grafias.** `phone()` aceita `+55 (11) 98765-4321` e produz `+5511987654321`. Uma verificação num formato assim, como em `hostname(pattern(/^[a-z.]+$/))`, vê a grafia que o formato produz e é escrita para o texto como ele chega, então `EXAMPLE.com` passa no validador e não no schema.

## Entrada e saída

Um validador que muda o valor tem duas estruturas: o que ele aceita e o que ele produz. Por padrão, `toJsonSchema` escreve a entrada, já que é ela que uma requisição ou uma chamada de ferramenta precisa satisfazer. Passe `{ io: "output" }` para o que o validador produz, como o corpo de uma resposta.

```ts
import { coerceNumber, object, oneOf, optional, toJsonSchema } from "@codenhub/validation";

const query = object({
  page: coerceNumber({ int: true }),
  sort: optional(oneOf(["new", "top"]), "new"),
});

toJsonSchema(query).properties;
// { page: { anyOf: [{ type: "integer" }, { type: "string" }] }, sort: { enum: ["new", "top"], default: "new" } }
// e só `page` é obrigatório

toJsonSchema(query, { io: "output" }).properties;
// { page: { type: "integer" }, sort: { enum: ["new", "top"] } }
// e os dois são obrigatórios
```

| Validador                                         | Entrada                                                                                                                                                           | Saída                                                      |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `optional(validator, value)`                      | O schema do validador, não obrigatório, com `default` quando o valor padrão é um primitivo JSON                                                                   | O schema do validador, obrigatório                         |
| `lazy`, `json` ou `searchParams` com verificações | Para `lazy` e `json`, as verificações num `allOf` ao lado daquilo a que se refere ou em que é convertido. Para `searchParams`, uma string, que não diz nada delas | As verificações num `allOf` ao lado do schema do validador |
| Os validadores `coerce`                           | Um `anyOf` do schema do tipo que produzem, com limites e verificações, e dos tipos de que convertem                                                               | O tipo que produzem                                        |
| `transform`                                       | O schema do validador de que converte                                                                                                                             | Não pode ser escrito                                       |
| `pipe`                                            | O primeiro validador                                                                                                                                              | O último                                                   |
| `json(validator)`                                 | Uma string, com `contentSchema` para o que ela vira depois do parse                                                                                               | O schema do validador                                      |
| `searchParams(validator)`                         | Uma string                                                                                                                                                        | O schema do validador                                      |
| `fallback`                                        | Qualquer coisa, já que nunca falha                                                                                                                                | O schema do validador que ele envolve                      |

O lado da saída considera que um valor padrão e o valor de um `fallback` passam no validador a que são dados. Nenhum dos dois é validado, então `optional(string({ min: 3 }), "")` produz um texto que o próprio schema de saída recusa: dê um valor padrão que o validador aceite.

## Como cada validador é escrito

| Validador                                                   | Schema                                                                                                                     |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `string`                                                    | `type: "string"` com `minLength` e `maxLength`                                                                             |
| `number`                                                    | `type: "number"`, ou `"integer"` com `int` ou `safeInt`, com `minimum`, `maximum`, `exclusiveMinimum` e `exclusiveMaximum` |
| `boolean`, `unknown`, `never`                               | `type: "boolean"`, `{}` e `{ not: {} }`                                                                                    |
| `literal`, `oneOf`                                          | `const` e `enum`                                                                                                           |
| Um formato                                                  | `type: "string"` com `format`, como a tabela abaixo o escreve                                                              |
| `port`, `base64`                                            | Um inteiro de 1 a 65535, e uma string com `contentEncoding`                                                                |
| `object`, `objectLike`                                      | `type: "object"` com `properties`, `required` e `additionalProperties` se strict ou com validador de chaves desconhecidas  |
| `array`                                                     | `type: "array"` com `items`, `minItems` e `maxItems`                                                                       |
| `tuple`                                                     | `prefixItems`, com `items` para `rest` e `false` sem ele                                                                   |
| `record`                                                    | `propertyNames` e `additionalProperties`, com `minProperties` e `maxProperties`                                            |
| `union`, `intersection`                                     | `anyOf` e `allOf`                                                                                                          |
| `tagged`                                                    | `oneOf`, com a tag como uma propriedade `const` de cada variante                                                           |
| `nullable`, `nullish`                                       | `anyOf` com `type: "null"`                                                                                                 |
| `readonly`, `brand`                                         | O que o validador de dentro vira                                                                                           |
| `codec`                                                     | O `input` dele, ou o `output` com `io: "output"`                                                                           |
| `lazy`                                                      | Um `$ref` para uma definição em `$defs`                                                                                    |
| `pattern`, `startsWith`, `endsWith`, `includes`, `nonBlank` | `pattern`                                                                                                                  |
| `multipleOf`, `nonZero`, `unique()`                         | `multipleOf`, `not: { const: 0 }` e `uniqueItems`                                                                          |

`multipleOf` só é escrito para um passo que o ponto flutuante binário representa exatamente: um inteiro que ele representa como escrito, então não `1e23`, ou uma fração como `0.5` ou `0.25`. Quem lê o schema divide em binário, onde `0.3 / 0.1` não é `3`, então com um passo como `0.1` ou `0.01` recusaria valores que o validador aceita; um passo assim fica de fora. O Ajv também recusa alguns números muito grandes: ele divide o valor pelo passo e lê o resultado com `parseInt`, que interpreta errado um resultado de `1e21` ou mais, então recusa `1e25` com `multipleOf: 5`, que `number(multipleOf(5))` aceita. Onde o Ajv lê o schema, dê ao número um `min` e um `max` que mantenham o valor dividido pelo passo estritamente entre `-1e21` e `1e21`. Acima de `2 ** 53`, onde um número não é o inteiro que seus dígitos indicam, qualquer leitor que divida pode recusar um valor que o validador aceita, como recusa `20054952883093950` com `multipleOf(5)`. `uniqueItems` só é escrito para itens primitivos, já que `unique()` compara um objeto pela identidade e `uniqueItems` pelo conteúdo.

Um formato é escrito com o nome que o JSON Schema dá a ele, e sem `format` onde as regras desse nome recusam um texto que o validador aceita, o que quebraria a promessa acima:

| Formato                                                                | Entrada                                               | Saída      |
| ---------------------------------------------------------------------- | ----------------------------------------------------- | ---------- |
| `email`                                                                | Nenhum, já que o domínio pode ser internacionalizado  | `email`    |
| `domain`                                                               | Nenhum, pelo mesmo motivo                             | `hostname` |
| `hostname`, `uuid`                                                     | O próprio nome                                        | O mesmo    |
| `datetime`                                                             | `date-time`, e nenhum com `local`, que não tem offset | O mesmo    |
| `isoDate`                                                              | `date`                                                | O mesmo    |
| `ip`                                                                   | `ipv4` com `version: "v4"`, e nenhum nos outros casos | O mesmo    |
| `time`, `duration`, `url`                                              | Nenhum                                                | Nenhum     |
| `port`, `base64`                                                       | Como a tabela acima os escreve                        | O mesmo    |
| Qualquer outro, e qualquer um feito com `format`, seja qual for o nome | Nenhum                                                | Nenhum     |

Um formato fica de fora onde o do JSON Schema tem regras mais rígidas: `time` exige um offset, que uma hora do dia como `12:00` nunca tem; `duration` não permite fração, como em `PT0.5S`, nem semanas ao lado de dias, como em `P1W1D`; um endereço IPv6 pode ter uma zona, como em `fe80::1%eth0`, que `ipv6` não permite; e uma URL pode conter `|` ou `^`, que uma URI não pode. A entrada de `email` e `domain` pode ser internacionalizada, como em `user@bücher.example`, o que `email` e `hostname` recusam; `idn-email` e `idn-hostname` serviriam, mas o [ajv-formats](https://github.com/ajv-validator/ajv-formats) não os conhece, e o Ajv, no modo strict padrão, se recusa a compilar um schema com um formato que não conhece. É também por isso que um formato para o qual o JSON Schema não tem nome, como `phone`, `slug` ou um feito com `format`, é escrito sem nenhum.

Um `object` escreve `additionalProperties: false` quando é strict, e o schema do validador ao qual passa as chaves desconhecidas quando tem um, como um `record` escreve o schema dos valores dele. Um objeto passthrough ou que descarta as chaves não escreve nenhum, já que qualquer outra chave passa.

Uma propriedade fica de fora de `required` quando o validador dela aceita `undefined`: `optional`, `nullish`, `unknown`, `fallback`, um `literal` ou um `oneOf` de `undefined`, uma `union` com um desses, ou um `lazy`, `nullable`, `readonly`, `transform` ou `pipe` em volta de um deles. Uma `intersection` fica de fora quando todos os validadores dela aceitam `undefined`. JSON não tem `undefined`, então `literal(undefined)` numa `union` fica de fora do `anyOf` dela, e uma `union` ou um `oneOf` só com ele é escrito como `{ not: {} }`, em que nenhum valor passa.

Um schema recursivo é escrito uma vez, como uma definição a que o schema se refere:

```ts
import { array, lazy, object, string, toJsonSchema, type Validator } from "@codenhub/validation";

interface Category {
  name: string;
  children: Category[];
}

const category: Validator<Category> = object({ name: string(), children: array(lazy(() => category)) });

toJsonSchema(category).$defs;
// {
//   schema1: {
//     type: "object",
//     properties: { name: { type: "string" }, children: { type: "array", items: { $ref: "#/$defs/schema1" } } },
//     required: ["name", "children"],
//   },
// }
```

Crie um schema recursivo uma vez só e faça referência a ele, como explica [Limites](limits.md#crie-um-schema-recursivo-uma-vez-só). Um schema criado de novo a cada nível, como `lazy(() => build())` dentro de `build` faz, não tem fim para escrever, e `toJsonSchema` lança um `TypeError` que diz isso.

## Dizendo para que serve um valor

Um schema que só dá os tipos diz a quem lê o que enviar, e não o que aquilo significa. [`meta`](shaping-values.md#meta) adiciona um título, uma descrição, exemplos e se um valor está obsoleto à parte a que é aplicado, e `toJsonSchema` escreve cada um na palavra-chave de mesmo nome do JSON Schema. Um modelo de linguagem lê a `description` dos argumentos de uma ferramenta para decidir o que colocar neles, e um documento OpenAPI mostra os quatro.

```ts
import { meta, number, object, string, toJsonSchema } from "@codenhub/validation";

const forecast = meta(
  object({
    city: meta(string({ min: 1 }), { description: "The city to get the weather for", examples: ["Lisbon"] }),
    days: meta(number({ int: true, min: 1, max: 7 }), { description: "How many days ahead" }),
  }),
  { title: "Forecast" },
);

toJsonSchema(forecast);
// {
//   $schema: "https://json-schema.org/draft/2020-12/schema",
//   type: "object",
//   title: "Forecast",
//   properties: {
//     city: { type: "string", minLength: 1, description: "The city to get the weather for", examples: ["Lisbon"] },
//     days: { type: "integer", minimum: 1, maximum: 7, description: "How many days ahead" },
//   },
//   required: ["city", "days"],
// }
```

As chaves são escritas no schema em que a parte vira, seja ele qual for: ao lado de um `$ref` para um `lazy` e ao lado de um `anyOf` para um `nullable`, e do mesmo jeito no lado da entrada e no da saída. No draft-07, que ignora uma palavra-chave ao lado de um `$ref`, a referência é envolvida num `allOf` e as chaves são escritas ao lado dele. Os exemplos são escritos como foram dados e não são verificados contra o validador.

## Drafts

O schema é escrito no draft 2020-12, a menos que `target: "draft-07"` peça o draft mais antigo, que alguns leitores, como as ferramentas de um modelo de linguagem no AI SDK, ainda aceitam. No draft-07, os itens de uma `tuple` são listados em `items` e o `rest` dela em `additionalItems`, as definições ficam em `definitions`, e o que `json` lê não é escrito, já que esse draft não tem `contentSchema`. Qualquer outro alvo causa um `TypeError`, assim como uma opção que `toJsonSchema` não tem, como `draft` escrito no lugar de `target`, do mesmo jeito que uma opção desconhecida causa numa factory. [`standardJsonSchema`](standard-schema.md#com-seu-json-schema) escreve o draft que uma biblioteca pede, pela mesma função.

## O que não pode ser escrito

O JSON Schema não tem como expressar parte do que um validador consegue verificar, e o JSON não tem valor para parte do que ele consegue produzir:

- `date`, `bigint`, `symbol`, `func`, `instanceOf`, `set`, `map` e `file`, nenhum dos quais é um valor JSON; `formData`, que lê um formulário e não JSON; e um validador criado por `guard`, cujo teste é uma função que ninguém consegue ler.
- Um validador que você escreveu à mão, e uma verificação criada por `check`, cuja regra é uma função que ninguém consegue ler.
- `lowercase`, `uppercase`, `unique` com uma função de chave, e um `pattern` com uma flag como `i` ou `v`, que os patterns do JSON Schema não têm. As flags `g` e `y`, que `pattern` descarta, ficam de fora, assim como `u`, o modo em que um schema lê todo pattern.
- Um `pattern` escrito sem `u` que o modo Unicode lê de outro jeito: um que é erro nesse modo, como `/^\@x$/`, cujo `\@` só esse modo recusa, e um com `\u{…}` ou `\p{…}`, que só são escapes nesse modo e, sem ele, são texto com chaves.
- O que um `transform` retorna, no lado da saída.
- Uma verificação num `object`, e uma variante de `tagged` que não é um `object`, como um `lazy`. Com `unrepresentable: "any"`, essa variante é escrita como um objeto só com a tag dela, para que as outras variantes continuem casando com um ramo do `oneOf`.

Por padrão, `toJsonSchema` lança um `TypeError` que nomeia a parte e onde ela está, como `toJsonSchema cannot write a validator of kind "date" at createdAt`, para que um schema nunca fique, sem aviso, mais fraco do que você queria. Passe `{ unrepresentable: "any" }` para escrever uma parte assim como `{}`, que aceita qualquer coisa, e deixar uma verificação assim de fora:

```ts
import { check, date, object, string, toJsonSchema } from "@codenhub/validation";

const post = object({ title: string(check((text) => !text.includes("spam"))), createdAt: date() });

toJsonSchema(post, { unrepresentable: "any" }).properties;
// { title: { type: "string" }, createdAt: {} }
```

Para enviar uma data como JSON, valide o texto em que ela trafega, com `datetime()` ou `isoDate()`, ou converta-a com `coerceDate()`, cujo lado da entrada é uma string ou um número inteiro de milissegundos.

## Lendo um schema

`toJsonSchema` escreve uma notação, e sempre existe mais uma. Para escrevê-la, ou para montar um formulário a partir de um schema, leia o validador você mesmo. `describe(validator)` retorna aquilo de que um validador é feito, como dados simples, com o tipo `Description`: o `kind` dele, as `options` que recebeu, as `checks` dele e os validadores dentro dele. Um programa percorre um schema com ele, para escrevê-lo em outra notação, montar um formulário a partir dele ou criar outro validador com as partes dele.

```ts
import { describe, email, object, optional, string, type AnyValidator } from "@codenhub/validation";

const signupForm = object({ name: string({ min: 2 }), email: email(), nickname: optional(string()) });

const top = describe(signupForm);
top?.kind; // "object"
const shape = top?.["shape"] as Record<string, AnyValidator>;
describe(shape["name"] as AnyValidator)?.options; // { min: 2 }
describe(shape["email"] as AnyValidator)?.["format"]; // "email"
describe(shape["nickname"] as AnyValidator)?.kind; // "optional"
```

Um validador dentro de outro aparece como o próprio validador, para ser descrito por sua vez. Assim, um schema recursivo é lido um nível por vez, e nunca sem fim. A descrição e as opções dela estão congeladas e são uma cópia do que a factory recebeu. Então mudar um objeto de opções depois não muda nem o validador nem o que ele diz de si mesmo.

| `kind`                                                                                                  | Criado por                                             | Além de `options` e `checks`                                                                                               |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `"string"`, `"number"`, `"bigint"`, `"boolean"`, `"date"`, `"symbol"`, `"unknown"`, `"never"`, `"file"` | O validador de mesmo nome                              |                                                                                                                            |
| `"function"`                                                                                            | `func`                                                 |                                                                                                                            |
| `"literal"`                                                                                             | `literal`                                              | `value`                                                                                                                    |
| `"oneOf"`                                                                                               | `oneOf`                                                | `values`, uma lista, também para um enum                                                                                   |
| `"instance"`                                                                                            | `instanceOf`                                           | `target`, a classe                                                                                                         |
| `"guard"`                                                                                               | Uma factory criada por `guard`                         | `expected`                                                                                                                 |
| `"format"`                                                                                              | Todo formato, `port` e uma factory criada por `format` | `format`, o nome dele, como no problema que ele reporta                                                                    |
| `"coerce"`                                                                                              | Os validadores `coerce`                                | `inner`, o validador estrito, que tem as opções; `options` para uma opção da própria conversão, `zoneless` de `coerceDate` |
| `"object"`, `"objectLike"`                                                                              | `object`, `objectLike`                                 | `shape`                                                                                                                    |
| `"array"`, `"set"`                                                                                      | `array`, `set`                                         | `item`                                                                                                                     |
| `"tuple"`                                                                                               | `tuple`                                                | `items`, e `rest` quando houver                                                                                            |
| `"record"`, `"map"`                                                                                     | `record`, `map`                                        | `key`, `value`                                                                                                             |
| `"union"`, `"intersection"`                                                                             | `union`, `intersection`                                | `members`                                                                                                                  |
| `"tagged"`                                                                                              | `tagged`                                               | `key`, `variants`                                                                                                          |
| `"optional"`                                                                                            | `optional`                                             | `inner`, `default`; sem `options` nem `checks`                                                                             |
| `"nullable"`, `"nullish"`                                                                               | `nullable`, `nullish`                                  | `inner`; sem `options` nem `checks`                                                                                        |
| `"readonly"`                                                                                            | `readonly`                                             | `inner`; sem `options` nem `checks`                                                                                        |
| `"fallback"`                                                                                            | `fallback`                                             | `inner`, `value`; sem `options` nem `checks`                                                                               |
| `"transform"`                                                                                           | `transform`                                            | `inner`, `convert`; sem `options` nem `checks`                                                                             |
| `"pipe"`                                                                                                | `pipe`                                                 | `steps`; sem `options` nem `checks`                                                                                        |
| `"codec"`                                                                                               | `codec`                                                | `input`, `output`, `decode`, `encode`; sem `options` nem `checks`                                                          |
| `"lazy"`                                                                                                | `lazy`                                                 | `getter`, que retorna o validador                                                                                          |
| `"json"`, `"searchParams"`, `"formData"`                                                                | `json`, `searchParams`, `formData`                     | `inner`                                                                                                                    |
| `"check"`                                                                                               | Toda verificação embutida                              | `code` e `params` do problema que ela reporta                                                                              |

Uma verificação é descrita do mesmo jeito, então a lista em `checks` também pode ser lida: `describe(pattern(/^a/))` dá `{ kind: "check", code: "invalid_format", params: { format: "regex", pattern: "/^a/" } }`. Uma verificação criada por `checkFields` dá `{ kind: "check", fields }`, as propriedades que ela espera, e nenhum `params`, já que o teste dela é uma função. O que ninguém consegue ler dá `undefined`: um validador ou uma verificação que você escreveu à mão, e uma verificação criada por `check`, cujo teste é uma função. Quem lê um schema decide o que uma regra assim significa para ele, e um código que converte um schema para outra notação geralmente a recusa. A função com que um `transform` converte e o getter de um `lazy` aparecem na descrição como funções, pelo mesmo motivo. O teste de um `guard` e aquilo com que um formato lê não aparecem: um `guard` dá o `expected` que nomeia, e um formato, o nome dele.

O que `standard` retorna é descrito como o validador que ele envolve, e o que `meta` retorna também, com uma parte `meta` adicionada: `{ title, description, examples, deprecated }`, cada chave só quando foi dada. Um validador escrito à mão que recebeu `meta` é descrito como `{ kind: "meta", inner, meta }`. As partes têm o tipo `unknown`, já que o que uma parte é depende do kind: leia `kind` primeiro, depois as partes desse kind na tabela.

## Próximos passos

As bibliotecas que recebem um Standard Schema ou um JSON Schema têm, cada uma, alguns detalhes próprios, que é o jeito educado de dizer manias. [Integrações](integrations.md) mostra as mais comuns, com o cadastro.
