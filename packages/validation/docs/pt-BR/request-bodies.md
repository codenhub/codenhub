---
title: Corpos de requisição
description: Texto JSON, listas, tuplas, dicionários, sets e maps, uma escolha entre estruturas e dados recursivos.
source: cafb386ee90fc6dd3ca6b8e33415a1a57425b76a
order: 3
---

# Corpos de requisição

Um servidor recebe o que qualquer cliente resolveu mandar, e cliente é bicho criativo. Esta página cobre as estruturas que um corpo de requisição tem além de um objeto plano: texto JSON, listas, dicionários, uma escolha entre estruturas e dados que se aninham dentro de si mesmos. A API de cadastro ganha uma lista de interesses, uma indicação que pode ter duas estruturas e um corpo que ainda é texto JSON.

## Texto JSON

`json(validator?, options?, ...checks)` aceita texto que contém JSON, faz o parse e passa o valor resultante para `validator`:

```ts
import { array, email, json, object, pipe, string, unique } from "@codenhub/validation";

const signupBody = pipe(
  string({ max: 100_000 }),
  json(
    object({
      name: string({ trim: true, min: 2, max: 100 }),
      email: email(),
      interests: array(string({ max: 50 }), { max: 10 }, unique()),
    }),
  ),
);

signupBody('{"name":"Ada","email":"ada@example.com","interests":["math"]}'); // ok
signupBody("{"); // { ok: false, ... }, code "invalid_format"
```

- Um valor que não é string falha com `invalid_type`, e texto que não é JSON falha com `invalid_format` e `{ format: "json" }`.
- Sem validador, o resultado é `unknown`.
- Os caminhos dos problemas vindos de `validator` são relativos ao valor resultante do parse.
- Uma função na primeira posição é o validador, então verificações exigem um: `json(object(shape), {}, check(...))`.
- Qualquer outra coisa na primeira posição que não sejam opções lança um `TypeError` na criação, inclusive `undefined`. Assim, um validador que está faltando, como um lido de uma chave que não existe, nunca gera um `json` que aceita qualquer JSON.

O texto passa por `JSON.parse`, então duas regras dele valem aqui:

- Uma chave repetida fica com o último valor: `{"a":1,"a":2}` dá `{ a: 2 }`.
- Um número além do que um double guarda com exatidão perde dígitos: `12345678901234567890` vira `12345678901234567000`, um ID que agora pertence a outra pessoa. Envie esses números como strings e leia-os com `coerceBigint`.

O `string({ max: 100_000 })` na frente limita o texto antes do parse. [Limites](limits.md) explica por que um corpo precisa de um limite como esse.

## Listas e outras coleções

Todo validador de coleção recebe o validador dos itens, depois opções e verificações. Ele verifica todos os itens e reporta cada problema com um caminho que passa pela posição do item.

As opções de tamanho são `min`, `max` e `length`, todas inteiros não negativos, e `min` e `max` são inclusivos:

- Uma falha de tamanho é `too_small` com `{ minimum, type }` ou `too_big` com `{ maximum, type }`, em que `type` é `"array"`, `"set"`, `"map"` ou `"record"`. Para `length`, é acrescentado `exact: true`.
- Um tamanho errado é reportado de imediato, sem validar os itens, então os itens de uma entrada enorme nunca são validados só para ela ser rejeitada. Um `record` ainda lista as chaves da entrada, para contá-las.
- Um tamanho que não é número, como `"3"`, lança um `TypeError` quando o validador é criado. Um número que não é inteiro não negativo lança um `RangeError`, assim como limites que nenhum tamanho satisfaz juntos, como `min` acima de `max`, ou um `length` fora deles.

Uma coleção também para depois que seus itens reportaram 1.000 problemas. [Limites](limits.md#uma-entrada-inválida-tem-custo-limitado) explica esse limite.

### `array`

`array(item, options?, ...checks)` aceita arrays em que todo item passa por `item`, e produz um novo array com o que `item` produziu. Recebe `min`, `max` e `length`.

Os buracos de um array esparso são validados como `undefined`, então o trabalho cresce com o `length` do array, não com os itens que ele tem. Dê um `max` à entrada não confiável, que é verificado antes de qualquer item.

A verificação `unique(by?, message?)` rejeita repetições:

```ts
import { array, string, unique } from "@codenhub/validation";

const interests = array(string({ trim: true, min: 1, max: 50 }), { max: 10 }, unique());

interests(["math", "music"]); // ok
interests(["math", "math"]); // { ok: false, ... }, code "invalid_value"
```

- Ela compara os itens validados como um `Set` compara, ou pela chave que `by` retorna para cada item: `unique((user) => user.id)` torna os ids únicos.
- Cada repetição é reportada no próprio índice, como `invalid_value` com `{ unique: true }`, e a primeira ocorrência é mantida.
- Como toda verificação, ela só roda quando todos os itens são válidos.
- Um `Set` só considera dois objetos iguais quando são o mesmo objeto. Todo objeto ou lista que um composer como `object` ou `array` produz é novo, e duas `Date`s do mesmo instante são dois objetos. Então, sem `by`, `unique()` não acharia repetição entre eles. Os tipos dela só a aceitam para um array de primitivos; um array de objetos, listas ou datas precisa de `by`, como `unique((day) => day.getTime())`.

### `tuple`

`tuple(items, options?)` aceita um array de tamanho fixo em que cada posição tem seu próprio validador, e produz um tipo tupla:

```ts
import { number, string, tuple } from "@codenhub/validation";

const point = tuple([number(), number()]); // [number, number]
const call = tuple([string()], { rest: number(), max: 10 }); // [string, ...number[]], no máximo 10 itens
```

- Sem `rest`, o array precisa ter exatamente o tamanho de `items`. Um tamanho errado falha com `too_small` e `{ minimum, type: "array", exact: true }`, ou `too_big` e `{ maximum, type: "array", exact: true }`.
- A opção `rest` é um validador para toda posição depois das fixas, então o array pode ser mais longo. Ele ainda precisa ter pelo menos tantos itens quanto `items`, e falha com `too_small`, sem `exact`, quando tem menos.
- `max` só é permitido com `rest`, e limita o tamanho total, contando os itens fixos. Um array mais longo falha de imediato com `too_big` e `{ maximum, type: "array" }`, sem validar os itens. Dê um `max` à entrada não confiável, como faria com um `array`.

### `record`

`record(key, value, options?)` aceita um objeto simples usado como dicionário: qualquer número de chaves, cada uma passando por `key`, cada valor passando por `value`.

```ts
import { number, oneOf, record, string } from "@codenhub/validation";

const scores = record(string({ max: 50 }), number(), { max: 100 });
const hours = record(oneOf(["mon", "tue"]), number()); // { mon?: number; tue?: number }
```

- O caminho de um problema termina na chave a que ele pertence.
- Uma chave que falha é reportada como um único problema `invalid_key`, cujo `params.issues` guarda o que o validador de chave encontrou, para não ser confundida com um problema no valor. O valor de uma chave inválida continua sendo verificado.
- Uma chave que o validador de chave altera, por exemplo passando para minúsculas, precisa continuar distinta. `{ A: 1, a: 2 }` com `string({ case: "lower" })` reporta a segunda chave como `invalid_key` com um problema `invalid_value` dentro, `{ unique: true }`, em vez de descartar um valor.
- O tipo da saída tem todas as chaves quando `key` produz `string`, e é parcial quando `key` produz um conjunto fixo de strings, como `oneOf(["mon", "tue"])`.
- Uma chave `__proto__`, que um JSON após o parse pode conter, é reportada como `invalid_key`, com um problema `invalid_value` dentro, `{ reserved: true }`. Isso vale tanto se a entrada tem a chave quanto se o validador de chave a produz. Mantida, ela viraria o protótipo de qualquer cópia da saída feita por atribuição, como `Object.assign({}, output)`.
- `min`, `max` e `length` contam chaves, então `record(string(), number(), { max: 100 })` rejeita um dicionário com mais de 100 chaves antes de verificar qualquer uma delas.

### `set` e `map`

`set(item, options?)` aceita um `Set` e produz um novo `Set` com os valores validados. `map(key, value, options?)` aceita um `Map` e produz um novo `Map`. Arrays e objetos simples não são aceitos por eles. Os dois recebem `min`, `max` e `length`.

- Em um set, o caminho passa pela posição do valor, na ordem de iteração.
- Em um map, o caminho passa pela chave da entrada quando a chave é string, e pela posição dela, um número, para qualquer outra chave. Assim, uma chave numérica e uma chave objeto nunca compartilham um caminho.
- Uma chave de map que falha é reportada como `invalid_key`, como em `record`. O mesmo vale para uma chave que outra entrada já tem depois que o validador de chave a alterou.
- Um valor de set que `item` torna igual a um anterior, como `"A"` e `"a"` com `string({ case: "lower" })`, é reportado como `invalid_value` com `{ unique: true }` na posição dele, em vez de ser mesclado. Assim, a saída nunca tem menos valores do que as opções de tamanho permitem.

## Uma escolha entre estruturas

### `union`

`union(options)` aceita um valor que passa por qualquer um de vários validadores, e produz o que o primeiro que o aceitar produziu. Quem chega primeiro bebe água limpa, então coloque as opções mais específicas primeiro:

```ts
import { coerceNumber, number, string, union } from "@codenhub/validation";

const id = union([string({ min: 1 }), number({ int: true })]);

union([coerceNumber(), string()])("5"); // { ok: true, value: 5 }
union([string(), coerceNumber()])("5"); // { ok: true, value: "5" }
```

Um valor que nenhuma opção aceita falha com um único problema `invalid_union` no próprio caminho do valor. O `params.issues` dele lista, para cada opção em ordem, os problemas que aquela opção encontrou, com caminhos relativos ao valor que a união recebeu.

- Uma união que falhou dentro de uma opção, como uma usada numa propriedade de uma opção objeto, é listada com o código e o caminho dela, sem os problemas das próprias opções. [Problemas por trás de um problema](errors.md#problemas-por-trás-de-um-problema) explica por quê. Para ver esses problemas, chame a união interna com o valor.
- Todas as opções rodam até uma aceitar o valor. Então, numa união recursiva de objetos, todas as opções chegam aos filhos. Use `tagged` para objetos diferenciados por uma propriedade, que valida só a variante correspondente.
- Um limite de `lazy` que interrompeu a validação é mantido, como [Limites](limits.md#dados-recursivos) explica.

### `tagged`

`tagged(key, variants, options?, ...checks)` serve para objetos que compartilham uma propriedade de tag e diferem no resto, como eventos com um `type`. Ele recebe o nome da propriedade de tag e um registro com um validador para cada valor de tag. A tag da entrada escolhe a variante, e a variante valida o resto da entrada. Uma falha reporta os problemas da própria variante, não uma lista de tudo que não correspondeu.

O cadastro aceita uma indicação de um amigo ou de uma campanha:

```ts
import { email, object, string, tagged, type Infer } from "@codenhub/validation";

const referral = tagged("source", {
  friend: object({ email: email() }),
  campaign: object({ code: string({ min: 3, max: 20 }) }),
});

type Referral = Infer<typeof referral>;
// { source: "friend"; email: string } | { source: "campaign"; code: string }

referral({ source: "campaign", code: "SPRING" }); // { ok: true, value: { source: "campaign", code: "SPRING" } }
referral({ source: "ad" }); // { ok: false, ... }, code "invalid_union"
```

**Uma variante não pode listar a tag.** Em algumas outras bibliotecas, cada variante é escrita `object({ source: literal("friend"), ... })`. Aqui, a variante recebe a entrada sem a tag, então uma variante que lista a tag nunca passaria. O tipo dela é rejeitado, então o erro aparece na compilação, naquela variante. A chave do registro já diz para qual tag a variante é.

Como uma variante nunca vê a tag:

- Um `object` estrito funciona como variante, e um `record` também, que verifica todas as chaves menos a tag.
- Uma saída que declara a tag ao lado de uma index signature continua sendo rejeitada, já que a variante nunca a recebe.
- O tipo de uma variante `record` tem uma index signature ao lado da tag. Ler esse tipo e fazer narrowing pela tag funcionam, mas o TypeScript rejeita escrever um objeto assim à mão quando a tag não é do tipo de valor do registro.

A tag é devolvida à saída, então o resultado é uma tagged union de verdade, e verificar `referral.source` faz o narrowing do tipo. Uma tag ausente, desconhecida ou que não é string falha com `invalid_union` no caminho da tag, com `params: { discriminator, options }` listando as tags aceitas.

Cada variante precisa produzir um objeto simples, já que é ele que pode levar a tag. Uma variante tipada para produzir um array ou uma função é um erro de compilação. Uma variante que produz qualquer outro valor que não seja um objeto simples em tempo de execução, como uma `Date` ou uma instância de classe vinda de um `transform`, lança um `TypeError` com o nome da variante, já que é um erro no schema. `tagged` só lê a tag de um objeto simples, então rejeita uma instância de classe antes que qualquer variante a veja. Para escolher entre instâncias, coloque validadores `objectLike` em uma `union`.

### `intersection`

`intersection(left, right)` só aceita um valor quando ele passa pelos dois validadores. Ela reporta os problemas dos dois juntos e produz as duas saídas mescladas:

- Objetos simples são mesclados chave a chave, e arrays do mesmo tamanho, item a item, recursivamente.
- Dois `Map`s ou dois `Set`s do mesmo tamanho são mesclados entrada a entrada na ordem de iteração, que os dois validadores preservam da entrada. Assim, um map com chaves objeto, ou um set de objetos, também é mesclado. Um conflito dentro de um deles é reportado na chave da entrada quando ela é string, e senão na posição dela.
- Objetos cíclicos ou compartilhados nas saídas são mesclados uma vez, e a saída mesclada mantém a estrutura deles.
- Qualquer outro par precisa ser o mesmo valor, com `0` e `-0` mesclados como `0`, ou duas datas do mesmo instante.

Onde as saídas diferem de outra forma, como `"  ab "` difere quando um lado aplica trim e o outro passa para maiúsculas, nenhum valor satisfaz os dois. Cada um desses pontos falha com `invalid_intersection` no caminho dele, em vez de um lado vencer em silêncio.

O objeto mesclado é novo. Então uma chave `__proto__` própria que um dos lados deixou passar sem verificar, como faz `unknown()`, é reportada como `invalid_key` com um problema dentro, `{ reserved: true }`, como `record` a reporta. Dois casos mantêm a chave:

- **Um lado cuja estrutura lista `__proto__` naquele ponto, e produziu o valor ali.** A estrutura tem que ser a última coisa que mexeu no valor. Ela não é quando algo depois dela produziu um valor novo:
  - Uma estrutura dentro de um `transform`. O valor é o que a função do transform retornou, não o que a estrutura verificou.
  - Uma estrutura numa etapa de `pipe` que uma etapa posterior substitui por um objeto novo.
  - O validador de chave de uma entrada de `map`. Ele produziu a chave, não o valor da entrada.
- **Um valor que os dois lados deixaram passar inteiro,** como por `unknown()` nos dois. Ele é o próprio objeto da entrada, e é mantido sem alteração.

Então `intersection(object({ ["__proto__"]: unknown() }), unknown())` mantém uma chave `__proto__`, já que a estrutura da esquerda a lista e produziu o valor. Envolva esse `object` num `transform` e a chave passa a ser reportada, a não ser que o `transform` devolva o próprio objeto da entrada. A chave computada faz diferença: escrita como `{ __proto__: unknown() }`, o literal define o protótipo da estrutura e não lista chave nenhuma. Sim, é sério.

Os dois validadores veem a entrada inteira, então dois `object`s com `unknownKeys: "strict"` só passam juntos quando toda chave da entrada está listada nas duas estruturas: cada um rejeita as chaves que só o outro lista. Para combinar estruturas estritas, espalhe-as em uma só: `object({ ...named, ...aged }, { unknownKeys: "strict" })`.

## Dados recursivos

`lazy(getter, options?, ...checks)` busca outro validador na primeira vez que roda, para que um validador possa referenciar a si mesmo. O TypeScript não consegue inferir um tipo que referencia a si mesmo, então anote a variável com o tipo que ela produz:

```ts
import { array, lazy, object, string, type Validator } from "@codenhub/validation";

interface Category {
  name: string;
  children: Category[];
}

const category: Validator<Category> = object({
  name: string({ max: 100 }),
  children: array(
    lazy(() => category),
    { max: 50 },
  ),
});

category({ name: "Science", children: [{ name: "Math", children: [] }] }); // ok
```

Uma entrada recursiva pode ser profunda o bastante para estourar a pilha, ou larga o bastante para o trabalho crescer mais rápido que a entrada. `lazy` tem dois limites para esses casos:

- `maxDepth`, 128 por padrão: o máximo de níveis de `lazy` que podem estar abertos ao mesmo tempo. Uma entrada mais profunda falha com `too_big` e `{ maximum, type: "depth" }`.
- `maxCalls`, 10.000 por padrão: o máximo de chamadas que um `lazy` pode fazer em uma validação. Passando disso, cada chamada falha com `too_big` e `{ maximum, type: "calls" }`.

Uma entrada aninhada milhares de níveis, ou um objeto cíclico, volta como uma dessas falhas e não lança, desde que `maxDepth` caiba na pilha. Um schema com muitos validadores em cada nível pode estourar a pilha de um worker antes, então [reduza `maxDepth`](limits.md#maxdepth) para ele no worker. [Limites](limits.md#dados-recursivos) explica os dois limites, quando alterá-los e como montar um schema recursivo para que eles se mantenham.

## Próximos passos

O corpo de uma requisição é JSON, mas muito do que um servidor lê é texto: uma query string, uma variável de ambiente, um campo de formulário. [Entrada em texto](text-input.md) lê números, flags e datas a partir de texto.
