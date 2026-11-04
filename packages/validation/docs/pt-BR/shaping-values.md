---
title: Moldando valores
description: Encadeie validadores, converta valores, escreva-os de volta, marque e congele valores, descreva-os, troque uma falha por um fallback e reaproveite a estrutura de um objeto.
source: 1b3c3ad3d66b0d6207d5dffe49e43473f3dd567d
order: 8
---

# Moldando valores

Um validador faz mais que aceitar ou rejeitar. Ele pode limpar um valor, convertê-lo em outro tipo e, depois, escrevê-lo de volta. Esta página trata das ferramentas que mudam o que um validador produz, ou como ele é descrito, e das formas de construir um objeto a partir de outro. No cadastro, elas leem como `Date` o horário em que um convite expira, marcam o id de um usuário para que nenhuma outra string passe por um, e derivam a atualização de perfil a partir do objeto do cadastro.

## `pipe`

`pipe(a, b, ...)` executa validadores em ordem. Cada um recebe o valor que o anterior produziu, e `pipe` produz o que o último produz:

```ts
import { coerceNumber, email, pipe, string } from "@codenhub/validation";

const address = pipe(string({ trim: true, max: 254 }), email());
const age = pipe(string({ trim: true }), coerceNumber({ int: true, min: 13 }));
```

A primeira falha interrompe a sequência, porque um passo seguinte não teria nada válido com que trabalhar. Use-o para limpar um valor antes de verificar um formato, ou para verificar uma regra depois da outra.

O tipo de entrada dele é o tipo de entrada do primeiro validador.

## `transform`

`transform(validator, convert)` transforma o valor que um validador produziu em outro, como um texto no seu comprimento:

```ts
import { string, transform } from "@codenhub/validation";

const length = transform(string(), (text) => text.length);

length("Ada"); // { ok: true, value: 3 }
```

- `convert` só roda quando `validator` teve sucesso, e não pode rejeitar o valor. Para rejeitar o que ele produziu, coloque depois dele, com `pipe`, um validador com verificações. Uma conversão que pode falhar é um validador por si só, como mostra [Validadores personalizados](custom-validators.md#uma-conversão-que-pode-falhar).
- Um `convert` que lança uma exceção é um bug, e a exceção se propaga.
- Um `transform` só vai num sentido. [`encode`](#encode) não consegue escrever o valor dele de volta, e lança uma exceção que indica onde ele está. Onde um valor precisa voltar, use um [`codec`](#codec).

Um `convert` que retorna uma promise torna o resultado assíncrono. O mesmo vale para um tipado como podendo retornar uma, inclusive um tipado como retornando `unknown`. E também para qualquer valor com um método `then`, já que `await` o trataria como uma promise. Envolva um valor desses num objeto antes de retorná-lo.

Um `convert` tipado como retornando `any`, como `JSON.parse`, abriu mão da checagem de tipos, e é tipado como síncrono. Então `transform(string(), JSON.parse)` não precisa de `await`. Se ele puder retornar uma promise, diga isso no tipo de retorno.

## `codec`

`codec(input, output, { decode, encode })` lê um valor na forma em que ele é enviado, retorna o valor que um programa usa, e consegue escrevê-lo de volta. Ele valida com `input`, passa o que isso produziu para `decode` e valida o resultado com `output`. Assim, as duas pontas são verificadas:

```ts
import { bigint, codec, date, datetime, pattern, string } from "@codenhub/validation";

const expiresAt = codec(datetime(), date(), {
  decode: (text) => new Date(text),
  encode: (value) => value.toISOString(),
});

// A entrada aceita só o texto que BigInt lê, então decode nunca lança exceção.
const amount = codec(string({ max: 40 }, pattern(/^-?\d+$/)), bigint(), {
  decode: (text) => BigInt(text),
  encode: (value) => value.toString(),
});
```

- `decode` recebe o que `input` produziu e retorna o que `output` valida. `encode` recebe o que `output` produziu e retorna o que `input` valida. Cada uma é tipada assim, e `Conversions<typeof input, typeof output>` é o tipo do par.
- Uma função que lança uma exceção é um bug e se propaga, como a função de um `transform`. Para falhar, retorne um valor que o outro validador recuse: um `decode` que gera um `Date` inválido falha em `date()`. Ou deixe `input` aceitar só o que `decode` consegue ler, como faz `amount`, já que `BigInt` lança uma exceção para outros textos.
- As duas são síncronas. Uma que retorna uma promise lança um `TypeError` quando é chamada, já que o codec é tipado como não esperando. Uma regra que espera vai numa verificação.
- Ele é escrito como JSON Schema como o seu `input`, ou como o seu `output` com `io: "output"`. Uma saída que o JSON Schema não consegue expressar, como o `Date` de `expiresAt`, lança uma exceção nesse ponto, a menos que `unrepresentable: "any"` seja passado, como diz [JSON Schema](json-schema.md).

## `encode`

`encode(validator, value)` escreve um valor do tipo que um validador produz de volta no que o validador aceita: o `Date` que um `codec` leu de volta no texto dele, um objeto desses de volta num objeto de textos, e o que `json` interpretou de volta em JSON. Ele retorna um resultado, como um validador:

```ts
import { codec, date, datetime, encode, object, string } from "@codenhub/validation";

const expiresAt = codec(datetime(), date(), {
  decode: (text) => new Date(text),
  encode: (value) => value.toISOString(),
});
const invitation = object({ code: string(), expiresAt });

encode(invitation, { code: "AB12", expiresAt: new Date(0) });
// { ok: true, value: { code: "AB12", expiresAt: "1970-01-01T00:00:00.000Z" } }
```

`Encoded<typeof validator>` é o tipo do que ele retorna: um resultado, que precisa de `await` quando o validador é assíncrono. Cada tipo de parte é escrito de volta do seu jeito:

- **Um `codec`** escreve o valor de volta primeiro pelo seu `output`. Um codec dentro do output escreve a parte dele primeiro. Um output escrito à mão verifica o valor e o repassa sem alterações. Depois, o codec executa o seu `encode` sobre o resultado e verifica se o seu `input` aceita o que ele retorna.
- **Uma parte que produz o que aceita**, como `string`, `number`, um formato ou uma conversão, valida o valor e devolve o que produziu. `email()` devolve o endereço como o parser o lê, e `coerceNumber()` devolve o número, que ele aceita.
- **Um compositor**, como `object`, `array`, `tuple`, `record`, `map`, `set`, `union` ou `tagged`, escreve de volta cada uma das suas partes com as próprias opções, e executa suas verificações sobre o valor quando as partes passaram. `optional`, `nullable` e `nullish` mantêm o que deixam passar, e um `pipe` escreve seus passos de volta a partir do último.
- **`json` e `searchParams`** escrevem texto: o `JSON.stringify` do que o validador deles escreveu de volta, e uma query string com cada valor como texto e cada item de uma lista como uma chave repetida. O validador de origem então lê o texto de volta, então um texto que ele recusaria falha: uma lista escrita como chave repetida, que `searchParams` só lê com `repeated: true`, e `undefined`, que não é JSON. O que `JSON.stringify` altera fica alterado: `NaN` é escrito como `null`, e uma propriedade `undefined` é omitida.
- **`optional` com um valor padrão** escreve o valor padrão de volta como `undefined` quando a parte interna o recusa, já que só `undefined` o produziu: `optional(string({ min: 3 }), "")` escreve `""` de volta como `undefined`. Um valor padrão gerado por uma função não pode ser comparado. Um valor de `fallback` que a parte interna recusa falha, já que toda entrada que a parte interna recusa o produz, e não se sabe qual delas foi dada.

**O que não pode voltar lança** um `TypeError` que indica onde está, como em `TypeError: encode cannot write back a transform at the root. Use a codec there`. Isso vale para um `transform`, cuja função só vai num sentido, um validador escrito à mão e um `codec` com um `transform` no output. `formData` também é recusado.

Assim, um valor que o validador não poderia ter produzido falha com os problemas que tem, nos caminhos deles: `encode(expiresAt, new Date(Number.NaN))` falha como `date()` falharia.

- Ele é síncrono, a menos que uma parte espere.
- Uma conversão escreve de volta o valor que produziu, que ela aceita. Então, dentro de `json`, um `bigint` vindo de `coerceBigint()` não pode ser escrito como JSON, e lança um `TypeError` que indica onde está. Use um codec que o escreva como texto, como faz `amount` acima.
- A cada chamada, ele constrói um validador de cada parte do schema no sentido inverso, a partir das mesmas factories. Então um programa que o chama leva todos os compositores no bundle.

## `brand`

`brand(validator, name)` marca com um nome o que um validador produz, só nos tipos. O TypeScript trata dois tipos com a mesma estrutura como um só, então uma função que recebe uma `string` que ela chama de id de usuário também recebe um e-mail, ou um texto que ninguém validou. Com uma marca, o único caminho para um valor do tipo passa pelo validador:

```ts
import { brand, uuid, type Infer } from "@codenhub/validation";

const userId = brand(uuid(), "UserId");
type UserId = Infer<typeof userId>;

declare function loadUser(id: UserId): Promise<unknown>;

const result = userId(input);
if (result.ok) {
  await loadUser(result.value);
}
// loadUser("not validated") é um erro de compilação
```

- Nada muda em tempo de execução. `brand` retorna o validador que recebeu, então ele valida, é descrito e é escrito como JSON Schema como antes. `pick` e seus parentes continuam lendo um `object` marcado.
- O tipo de entrada não é marcado, já que o que é passado a um validador ainda não passou por ele.
- `null` e `undefined` ficam sem marca, então `brand(optional(string()), "Id")` produz uma string marcada ou `undefined`.
- Marcas se somam, então `brand(brand(string(), "A"), "B")` produz um tipo com as duas.
- `Branded<T, "Name">` é o tipo marcado, para quando você precisar escrevê-lo.

## `readonly`

`readonly(validator)` torna somente leitura o que um validador produz: no tipo, e congelando o objeto ou array. `ReadonlyOutput<T>` é o tipo que ele dá.

```ts
import { array, object, readonly, string, type Infer } from "@codenhub/validation";

const settings = readonly(object({ theme: string(), tags: readonly(array(string())) }));
type Settings = Infer<typeof settings>; // { readonly theme: string; readonly tags: readonly string[] }
```

- Ele congela o próprio valor, e não o que está dentro dele, como faz `Object.freeze` e como diz o tipo. Envolva também um validador interno onde o valor dele não puder mudar, como `tags` acima.
- Um valor que é a própria entrada nunca é congelado, já que pertence a quem chamou. `instanceOf`, `guard` e `unknown` produzem o que receberam, então `readonly` muda só o tipo deles. `object`, `objectLike`, `array`, `tuple`, `record`, `set` e `map` produzem um valor novo, que é congelado.
- Um `Map` ou um `Set` é tipado como `ReadonlyMap` ou `ReadonlySet`, e só o tipo o protege: congelar um deles não impede `set` nem `add`. Um typed array não pode ser congelado, e fica sem congelar, assim como um `DataView`. O tipo cobre propriedades e não métodos, então um `Date` mantém seus setters.
- Um valor só conta como de quem chamou quando é a própria entrada. Quando um `transform` retorna um valor de dentro da entrada, como `(value) => value.tags`, esse valor é congelado. Faça uma cópia ali quando quem chamou precisar mantê-lo alterável. O mesmo vale para um objeto que ele retorne dos seus próprios dados: `readonly(transform(string(), (key) => cache[key]))` congela a entrada em `cache`, então retorne uma cópia ali também.
- `pick`, `omit`, `required` e `partial` leem um `object`, então mude a estrutura primeiro e envolva depois: `readonly(pick(user, ["name"]))`.

## `meta`

`meta(validator, { title, description, examples, deprecated })` diz para que serve um validador a quem lê o schema: uma pessoa lendo a documentação de uma API, ou um modelo de linguagem escolhendo uma ferramenta e preenchendo os argumentos dela. [`toJsonSchema`](json-schema.md#dizendo-para-que-serve-um-valor) escreve cada chave ao lado dos tipos, com o nome que o JSON Schema tem para ela. `Meta` é o tipo do segundo argumento.

```ts
import { meta, number, object, string } from "@codenhub/validation";

const forecast = meta(
  object({
    city: meta(string({ min: 1 }), { description: "The city to get the weather for", examples: ["Lisbon"] }),
    days: meta(number({ int: true, min: 1, max: 7 }), { description: "How many days ahead" }),
  }),
  { title: "Forecast", description: "The weather for the coming days" },
);
```

- Ele retorna um novo validador, que valida exatamente como o que recebeu. A descrição dele é a do que recebeu, com o `meta` acrescentado. O validador recebido não é alterado, então o mesmo validador pode ser descrito de formas diferentes em dois lugares.
- Um `meta` dado a um validador que já tem um substitui as chaves que nomeia e mantém as outras. Uma chave passada como `undefined` conta como não passada.
- `title` e `description` são texto. `examples` é uma lista de valores JSON: `null`, booleanos, números finitos, texto, e listas e objetos simples desses valores. `deprecated` é `true` ou `false`. Qualquer outro valor, ou qualquer outra chave, é um `TypeError` quando o validador é criado.
- Um JSON Schema é JSON, então um exemplo de `Date` é escrito como texto. Os exemplos são mantidos como foram passados e não são validados, já que podem mostrar a entrada ou a saída.
- `pick`, `omit`, `required`, `partial` e `extend` leem através dele até o objeto que ele descreve. O que eles criam não tem `meta`, já que um título escrito para um objeto raramente serve para outro: dê ao novo um `meta` próprio.
- O que `standard` criou continua sendo um Standard Schema sob `meta`.

## `fallback`

`fallback(validator, value)` substitui um valor que falha em `validator` por um fallback, então o resultado nunca falha:

```ts
import { fallback, oneOf } from "@codenhub/validation";

const theme = fallback(oneOf(["light", "dark"]), "light");

theme("purple"); // { ok: true, value: "light" }
```

Isso transforma entrada ruim num valor com cara de válido. Reserve-o para dados em que um valor padrão sensato é mais seguro que um erro, como uma preferência armazenada que pode estar desatualizada.

- O fallback é confiável, e não é validado.
- Uma função é chamada com os problemas encontrados, e esse é o lugar para registrá-los no log. Então um fallback que é ele mesmo uma função é retornado por outra: `fallback(validator, () => callback)`. Os tipos rejeitam o próprio callback sempre que o validador interno pode produzir uma função. Pelo mesmo motivo, uma função que lê um argumento, como `Array` ou `String`, receberia os problemas: escreva `() => []`, não `Array`.
- Um primitivo é usado diretamente. Um array ou um objeto precisa vir de uma função, como `fallback(array(string()), () => [])`. Um único valor seria compartilhado por todos os resultados, e uma alteração em um apareceria no próximo. Os tipos o rejeitam, e `fallback` lança um `TypeError` quando é criado a partir de JavaScript.
- Um valor cuja validação `lazy` interrompeu num dos seus limites, como uma entrada cíclica ou uma entrada aninhada além de `maxDepth`, também falha, então é substituído como qualquer outra falha. Quando esses limites precisarem ser reportados, não use `fallback` num schema recursivo.

O tipo de entrada dele é `unknown`, já que ele aceita qualquer coisa.

## Reaproveitando estruturas

### Espalhando uma estrutura

Uma estrutura é um objeto comum, então é reaproveitada com JavaScript comum. Espalhe uma dentro de outra para estendê-la, e deixe chaves de fora com desestruturação. `partial(shape)` retorna uma nova estrutura com cada propriedade envolvida em `optional`, para uma atualização em que qualquer campo pode ficar de fora:

```ts
import { email, number, object, partial, string } from "@codenhub/validation";

const account = { name: string({ trim: true, min: 2, max: 100 }), email: email() };

const createAccount = object(account);
const updateAccount = object(partial(account)); // todas as propriedades opcionais
const withAge = object({ ...account, age: number({ int: true, min: 13 }) });
```

- A estrutura original não muda, então a versão com campos obrigatórios continua disponível.
- Uma propriedade deixada de fora continua de fora. Então um valor padrão dado com `optional(validator, value)` na estrutura não é aplicado pela versão `partial` dela: uma atualização deixa de fora o que não muda.
- Uma estrutura só tem chaves de texto enumeráveis. `object`, `partial` e `tagged` lançam um `TypeError` quando são criados com uma chave symbol ou uma chave não enumerável, já que o validador dela nunca rodaria.

`PartialShape<TShape>` é o tipo que `partial(shape)` retorna.

### `pick`, `omit`, `required`, `partial` e `extend`

Quando o que você tem é o validador e não a estrutura dele, como um que outro módulo exporta, estas funções recebem o validador. Cada uma recebe um validador criado por `object` e retorna um novo. O recebido não é alterado:

```ts
import { boolean, email, extend, number, object, omit, optional, partial, pick, required, string } from "@codenhub/validation";

const user = object({ id: number(), name: string({ min: 2 }), email: email(), bio: optional(string()) });

const contact = pick(user, ["name", "email"]); // { name: string; email: string }
const draft = omit(user, ["id"]); // tudo menos o id
const patch = partial(user); // todas as propriedades opcionais
const complete = required(user); // bio também é obrigatório
const admin = extend(user, { admin: boolean() }); // todas as propriedades de user, mais admin
```

- `pick(validator, keys)` mantém as propriedades nomeadas, e `omit(validator, keys)` as deixa de fora. Uma chave que o objeto não tem é um `TypeError` quando o validador é criado, já que é um erro de digitação.
- `partial(validator)` envolve cada propriedade em `optional`, como `partial(shape)` faz.
- `extend(validator, shape)` acrescenta as propriedades de `shape`, como espalhar uma estrutura dentro de outra. Uma propriedade que o objeto já tem é substituída pela passada, na mesma posição.
- `required(validator)` torna todas as propriedades obrigatórias. Uma propriedade criada com `optional` vira o validador que ela envolvia, então o valor padrão dela também é removido, e uma propriedade ausente falha. Uma criada com `nullish` vira `nullable`, que ainda aceita `null`. Uma propriedade que aceita `undefined` de outro jeito, como `unknown()`, é mantida sem alterações.

O novo objeto mantém as opções do objeto de origem, `unknownKeys` e `message`. Ele aceita opções e verificações próprias depois dos argumentos, como `object`: `pick(user, ["name"], { unknownKeys: "strict" }, check(...))`.

- Cada opção passada substitui a de mesmo nome e mantém as outras. Então um objeto strict do qual se faz `pick` passando só uma `message` continua strict.
- Uma opção passada como `undefined` conta como não passada, e mantém a do original. Então `pick(strictUser, ["name"], { unknownKeys: undefined })` continua strict.

Um objeto com verificações é recusado com um `TypeError`. Uma verificação lê o objeto inteiro, então pode ler uma propriedade que o novo objeto não tem. Mantida, ela poderia fazer todo valor falhar. Descartada sem aviso, o novo objeto aceitaria o que o primeiro foi escrito para recusar. Crie o objeto sem as verificações, derive a partir dele e dê a cada resultado as verificações de que ele precisa.

Elas precisam de um validador criado por `object`, já que é assim que conhecem a estrutura dele. `objectLike`, um `pipe` ou um `transform` em volta de um objeto, e um validador escrito à mão, são um `TypeError`. Elas leem a estrutura por meio de [`describe`](json-schema.md#lendo-um-schema), que é como você escreveria uma função dessas por conta própria.

Os tipos que elas retornam têm nomes, para uma biblioteca que exporta o que deriva:

- `Picked<T, K>` e `Omitted<T, K>`: o tipo do objeto só com as propriedades nomeadas, ou sem elas.
- `AllOptional<T>` e `AllRequired<T>`: o tipo do objeto com todas as propriedades opcionais, ou com todas presentes e nenhuma `undefined`.
- `Extended<T, TShape>`: o tipo de objeto `T` com as propriedades de `TShape` acrescentadas ou substituídas.
- `Reshaped<TValidator, T, TInput?>`: um validador de `T` que é síncrono quando o validador de origem é.

## Próximos passos

Um validador feito com essas ferramentas continua sendo um validador, então as bibliotecas que recebem um schema o recebem diretamente. [Standard Schema](standard-schema.md) mostra como.
