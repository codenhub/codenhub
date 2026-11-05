---
title: Primeiros passos
description: O que é um validador, como ler o resultado dele e os validadores para strings, números, datas, valores fixos e objetos.
source: c75ad2300c395a779c01fac37ccbabdf2d9c403f
order: 1
---

# Primeiros passos

Esta página cobre a base de todas as outras: como um validador é criado e chamado, o que ele devolve e os validadores para cada tipo básico de valor. Ao final, você consegue escrever a primeira versão do cadastro: um objeto com nome, endereço de e-mail e senha, e o tipo TypeScript que sai dele.

## Um validador é uma função

Todo validador recebe qualquer entrada e devolve um resultado. Você cria um validador chamando uma função, com opções se quiser. Depois chama o validador com o valor:

```ts
import { number, string } from "@codenhub/validation";

const port = number({ int: true, min: 1, max: 65535 });

port(8080); // { ok: true, value: 8080 }
port(70000); // { ok: false, ... }, code "too_big"

string({ min: 3 })("ab"); // { ok: false, ... }
```

A primeira linha roda uma vez, quando o módulo carrega, e devolve uma função que você reaproveita para todos os valores. Para verificar um único valor uma única vez, faça as duas chamadas de uma vez: `number({ int: true })(input)`.

Como um validador é só uma função, você pode passar qualquer validador onde outro é esperado, e pode escrever o seu sem helper nenhum. [Validadores personalizados](custom-validators.md) mostra como.

### A ordem dos argumentos

Todo validador recebe os argumentos na mesma ordem:

1. Os argumentos próprios dele, como a estrutura de um objeto ou o validador dos itens de um array.
2. Um objeto de opções, como `{ min: 3 }`.
3. Qualquer número de verificações, que são regras para casos mais raros, como `string({ min: 3 }, startsWith("a"))`.

As opções podem ser omitidas quando há verificações: `string(startsWith("a"))`. Todo validador que reporta um problema próprio também aceita a opção `message`, que [Problemas e mensagens](errors.md#o-texto-de-um-validador) explica.

### Erros nas opções lançam na hora

As opções são lidas uma vez, quando o validador é criado. Uma opção sem sentido é um erro no seu código, não na entrada, então a factory lança um `RangeError` ou um `TypeError` nesse momento, e o programa falha onde está o erro:

- Um valor que nenhuma entrada consegue satisfazer: um comprimento negativo, um limite `NaN` ou limites que se contradizem, como `{ min: 5, max: 2 }`.
- Opções que não são um objeto simples, como `string(/^a/)` quando a intenção era `string(pattern(/^a/))`. Se fossem ignoradas, aceitariam qualquer string.
- Um filho que não é uma função, como `object({ name: undefined })` depois de um import que não resolveu para nada. Todo compositor verifica os validadores e callbacks que recebe, e aponta qual está errado.
- Um nome de opção que o validador não conhece, como `string({ mni: 2 })`, que lança `TypeError: Unknown option mni`. Se fosse ignorado, deixaria sem definir o limite que deveria definir. O TypeScript também acusa um nome assim, mas não em opções lidas de uma configuração, tipadas de forma frouxa ou escritas em JavaScript.

Uma opção passada como `undefined` conta como nenhuma opção. Então um limite que pode não existir pode ser passado diretamente: `string({ max: limit })`.

## Lendo o resultado

Um resultado é um de dois objetos simples, então você decide pelo `ok`:

```ts
import { email, formatIssue } from "@codenhub/validation";

const result = email()(input);

if (result.ok) {
  save(result.value); // tipado como string
} else {
  for (const issue of result.error.issues) {
    console.log(issue.path, formatIssue(issue));
  }
}
```

Quando algo está errado, o validador reporta todos os problemas que consegue encontrar, não só o primeiro, para que um formulário possa mostrar todos os erros de uma vez. Cada problema tem um `code` estável para você decidir o que fazer, o `path` até o valor que falhou e `params` que descrevem o que estava errado. [Problemas e mensagens](errors.md) os descreve em detalhes.

### Uma entrada inválida não lança exceção

Uma entrada inválida é um resultado esperado, não um bug, então o validador a devolve no resultado. Se você prefere interromper o programa, é uma linha: `if (!result.ok) throw new Error(...)`, ou [`assert`](errors.md#lançando-um-erro-para-configuração-inválida), que escreve a mensagem por você.

Um tipo de entrada ainda pode lançar exceção: a entrada que executa código próprio enquanto é lida, como um getter ou um trap de `Proxy` que lança. Essa exceção se propaga, como uma vinda de um callback seu. Dados obtidos de JSON não têm código assim. Dois validadores se comportam diferente:

- [`objectLike`](#objetos-que-não-são-simples) reporta como problema uma propriedade que não conseguiu ler.
- `instanceOf` rejeita o valor com `invalid_type` quando o trap de protótipo do valor, ou o `Symbol.hasInstance` da classe, lança.

### O valor pode ser diferente da entrada

`result.value` é o valor depois que o validador rodou, que nem sempre é a entrada que você passou:

- A limpeza que você pediu é aplicada, como `trim`, `case` ou `clamp`.
- Um objeto descarta as propriedades que a estrutura dele não lista.
- Um formato com várias grafias para um mesmo valor produz uma delas. `email` e `url` produzem o que o parser de URL lê, como um domínio em minúsculas, e `phone` produz `+` e os dígitos.

Assim, uma verificação feita depois sobre o valor vê o que um servidor de e-mail ou uma requisição vai ver. A entrada em si nunca é modificada.

## Strings

`string(options?)` aceita strings e produz uma string. Qualquer outra coisa falha com `invalid_type`, citando o tipo que recebeu.

```ts
import { string } from "@codenhub/validation";

const name = string({ trim: true, min: 2, max: 100 });

name("  Ada  "); // { ok: true, value: "Ada" }
name("A"); // { ok: false, ... }, code "too_small"
```

| Opção     | Significado                                                                                                                                          |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `trim`    | Remove espaços em branco do início e do fim, como faz `String.prototype.trim`, antes de as outras opções rodarem e na saída.                         |
| `case`    | `"lower"` ou `"upper"`: converte a string antes de as outras opções rodarem e na saída, com o mapeamento Unicode completo, igual em qualquer locale. |
| `min`     | No mínimo esta quantidade de caracteres.                                                                                                             |
| `max`     | No máximo esta quantidade de caracteres.                                                                                                             |
| `length`  | Exatamente esta quantidade de caracteres.                                                                                                            |
| `message` | O texto dos problemas que ele mesmo reporta.                                                                                                         |

A limpeza sempre acontece primeiro, e todas as opções e verificações veem a string já limpa. Então `string({ trim: true, min: 1 })` rejeita uma string só de espaços. Alguns detalhes:

- `trim` remove os espaços em branco e os terminadores de linha do Unicode, então um espaço sem quebra (no-break space) sai. Um espaço de largura zero (U+200B) não é espaço em branco e fica, então `string({ trim: true, min: 1 })` o aceita. A verificação `nonBlank()` o rejeita.
- `case` pode mudar o comprimento que as outras opções veem: `ß` em maiúsculas é `SS`, e `İ` em minúsculas são duas unidades de código.
- Os comprimentos contam unidades de código UTF-16, como `String.length`, então um emoji pode contar como dois.

Cada opção que falha reporta um problema próprio:

| Falha                   | `code`         | `params`                                   |
| ----------------------- | -------------- | ------------------------------------------ |
| Não é uma string        | `invalid_type` | `{ expected: "string", received }`         |
| Mais curta que `min`    | `too_small`    | `{ minimum, type: "string" }`              |
| Mais longa que `max`    | `too_big`      | `{ maximum, type: "string" }`              |
| Mais curta que `length` | `too_small`    | `{ minimum, exact: true, type: "string" }` |
| Mais longa que `length` | `too_big`      | `{ maximum, exact: true, type: "string" }` |

Regras mais raras são verificações, passadas depois das opções: `pattern`, `startsWith`, `endsWith`, `includes`, `nonBlank`, `lowercase` e `uppercase`. [Verificações](#verificações) as lista.

```ts
import { pattern, string } from "@codenhub/validation";

const handle = string({ trim: true, min: 3, max: 30 }, pattern(/^[a-z0-9_]+$/));
```

## Números

`number(options?)` aceita números finitos e produz um número. `NaN`, os infinitos e qualquer outro tipo falham com `invalid_type`. `-0` é aceito e produzido como veio, já que é um número à parte.

```ts
import { number } from "@codenhub/validation";

const age = number({ int: true, min: 0, max: 130 });

age(42); // { ok: true, value: 42 }
age(1.5); // { ok: false, ... }, code "invalid_value"
```

| Opção        | Significado                                                                                                           |
| ------------ | --------------------------------------------------------------------------------------------------------------------- |
| `clamp`      | `{ min, max }`: em vez de rejeitar, traz um valor finito para dentro do intervalo, antes de as outras opções rodarem. |
| `min`, `max` | No mínimo ou no máximo este valor, inclusive.                                                                         |
| `gt`, `lt`   | Estritamente maior ou menor que este valor.                                                                           |
| `int`        | Um número inteiro.                                                                                                    |
| `safeInt`    | Um número inteiro que um double representa com exatidão, ou seja, dentro de `Number.MAX_SAFE_INTEGER`.                |
| `message`    | O texto dos problemas que ele mesmo reporta.                                                                          |

Positivo, negativo e as variantes "não" deles são limites: positivo é `gt: 0`, não negativo é `min: 0`, negativo é `lt: 0` e não positivo é `max: 0`.

`clamp` continua rejeitando um infinito, como todo `number` faz, já que um infinito costuma indicar mais uma falha anterior no programa do que um valor a ser ajustado ao intervalo.

Os limites são verificados quando o validador é criado:

- Um limite `NaN`, ou limites que nenhum número finito satisfaz, como `{ min: 5, max: 2 }`, `{ gt: 1, lt: 1 }` ou `{ min: Infinity }`, lançam um `RangeError`.
- Um limite que não é número, ou um `clamp` que não seja um intervalo com `min` e `max` numéricos, lança um `TypeError`.
- Um `clamp` lança um `RangeError` para um limite `NaN`, um mínimo `Infinity`, um máximo `-Infinity`, um mínimo acima do máximo, ou um intervalo em que todo valor viola algum limite, como `{ clamp: { min: 0, max: 10 }, min: 11 }`.

Limites que contêm números mas nenhum inteiro, como `{ int: true, gt: 1, lt: 2 }`, não são detectados, já que essa verificação aumentaria o tamanho de todo programa que usa `number`. Um validador assim rejeita qualquer entrada.

| Falha                   | `code`          | `params`                                         |
| ----------------------- | --------------- | ------------------------------------------------ |
| Não é um número finito  | `invalid_type`  | `{ expected: "number", received }`               |
| Abaixo de `min` ou `gt` | `too_small`     | `{ minimum, inclusive, type: "number" }`         |
| Acima de `max` ou `lt`  | `too_big`       | `{ maximum, inclusive, type: "number" }`         |
| `int` ou `safeInt`      | `invalid_value` | `{ type: "number", format: "int" \| "safeInt" }` |

`multipleOf(step)` e `nonZero()` são verificações: `number({ min: 0 }, multipleOf(0.01))`.

## Booleanos e símbolos

`boolean()` aceita `true` e `false` e produz um booleano. Valores truthy e falsy, e textos como `"true"`, falham com `invalid_type` e `{ expected: "boolean", received }`. Para ler `"true"` de um formulário ou de uma variável de ambiente, use `coerceBoolean`, de [Entrada em texto](text-input.md).

`symbol()` aceita símbolos e falha da mesma forma, com `expected: "symbol"`. Para aceitar um único símbolo, use `literal`.

## Bigints

`bigint(options?)` aceita bigints e produz um bigint. Números, inclusive os inteiros, falham com `invalid_type`.

As opções são bigints: `min` e `max` são inclusivos, e `gt` e `lt`, exclusivos. Elas falham como os limites de um número: `too_small` com `{ minimum, inclusive, type: "bigint" }`, ou `too_big` com `{ maximum, inclusive, type: "bigint" }`. Positivo é `gt: 0n`, não negativo é `min: 0n` e negativo é `lt: 0n`.

Em `params`, um limite é escrito com os seus dígitos decimais, `"10"` para `10n`, para que um problema possa ser enviado como JSON, que não comporta bigint. Leia-o de volta com `BigInt(params.minimum)`.

## Datas

`date(options?)` aceita objetos `Date` válidos e produz o mesmo `Date`. Uma data inválida como `new Date("nope")`, um timestamp ou uma string falham com `invalid_type` e `{ expected: "valid date", received }`. Para verificar texto de data, use [`isoDate` ou `datetime`](formats.md#datetime-e-time). Para ler um `Date` a partir de texto, use [`coerceDate`](text-input.md).

As opções `min` e `max` são `Date`s, ambas inclusivas:

- Um valor que não é `Date`, como uma string de data, lança um `TypeError` quando o validador é criado.
- Um `Date` inválido, ou `min` depois de `max`, lança um `RangeError`.
- Elas são lidas quando o validador é criado, então alterar os objetos `Date` depois não tem efeito.

Uma data anterior a `min` falha com `too_small` e `{ minimum, inclusive: true, type: "date" }`, e uma posterior a `max`, com `too_big` e `{ maximum, inclusive: true, type: "date" }`. O limite em `params` é um `Date`.

## Valores fixos

`literal(value)` aceita exatamente um valor, comparado com `===`, e produz esse valor com o tipo exato dele. Então `literal("admin")` produz o tipo `"admin"`, não `string`.

- Qualquer primitivo funciona, e é assim que se validam `null` e `undefined`: `literal(null)`.
- Ele produz o valor declarado, não a entrada. Os dois só diferem no zero: `===` considera `-0` igual a `0`, e `literal(0)` produz `0` para qualquer um dos dois.
- `NaN` é recusado com um `RangeError` quando o validador é criado. `NaN === NaN` é falso, então `literal(NaN)` não aceitaria nada.

`oneOf(values)` aceita qualquer valor de uma lista e produz a união deles: `oneOf(["admin", "user"])` produz `"admin" | "user"`.

- Os valores podem ser quaisquer primitivos que `literal` aceita, então `oneOf([true, false, null])` é uma flag com três estados.
- Ele também aceita um `enum` do TypeScript. Ele ignora os nomes de mapeamento reverso que o TypeScript acrescenta a um enum numérico, então só os números são valores. Um objeto escrito como um enum é lido do mesmo jeito, então `{ a: 1, "1": "a" }` contém só o `1`.
- Ele produz o valor listado, então `oneOf([0])` produz `0` para `-0`.
- Os valores são copiados quando o validador é criado.
- Estes casos lançam um `TypeError` quando o validador é criado: nenhum valor, uma lista com um buraco como `[, "a"]`, que aceitaria `undefined`, e um `Set` ou outro objeto de uma classe, que seria lido como um enum sem membros. Uma lista que contém `NaN`, ao qual nenhum valor é igual, lança um `RangeError`.

```ts
import { literal, oneOf } from "@codenhub/validation";

const plan = oneOf(["free", "pro"]);
const version = literal("v1", { message: "Only v1 is supported" });

enum Status {
  Active = "active",
  Archived = "archived",
}
const status = oneOf(Status);
```

Os dois falham com `invalid_value`: `literal` reporta `{ expected }`, e `oneOf` reporta `{ options }`, a lista de valores aceitos.

Um bigint é reportado com os seus dígitos decimais, para que o problema possa ser enviado como JSON: `literal(1n)` reporta `{ expected: "1", type: "bigint" }`, e um `oneOf` só de bigints também acrescenta `type: "bigint"`. Em um `oneOf` que mistura bigints com outros valores, um bigint é reportado com os seus dígitos, sem nada que o diferencie de uma string.

Como toda regra, `literal` e `oneOf` reportam aquilo com que foram configurados, aqui os valores que aceitam. Então não verifique um segredo, como uma chave de API, com eles nem com uma verificação como `startsWith`: uma verificação que falhasse o exibiria, como explica [O problema](errors.md#o-problema).

## Qualquer valor, nenhum valor, funções e instâncias

- `unknown()` aceita qualquer valor e o repassa sem alteração. Use-o para uma propriedade que você não verifica, ou como base para verificações sobre um valor sem tipo específico: `unknown(check((value) => JSON.stringify(value) !== undefined))`.
- `never()` rejeita qualquer valor com `invalid_type` e `{ expected: "never", received }`. Use-o para proibir uma propriedade, ou para um ramo que nunca deve casar.
- `func()` aceita qualquer função de qualquer realm, como um iframe, inclusive classes e funções assíncronas e geradoras, e a produz sem alteração. Ele falha com `invalid_type` e `{ expected: "function", received }`. Ele só consegue verificar que o valor é uma função, não os parâmetros que ela recebe nem o que devolve. Então informe a assinatura que você espera como argumento de tipo, `func<(value: string) => void>()`, e ela vira o tipo de saída sem ser verificada, como faria um cast. Sem ela, a saída aceita quaisquer argumentos e devolve `unknown`.
- `instanceOf(Class)` aceita instâncias de uma classe, inclusive de subclasses e de classes abstratas, verificadas com `instanceof`. Ele falha com `invalid_type` e `{ expected: "instance of Class", received }`. Uma instância de outro realm, como um iframe, não é reconhecida; `date`, `map`, `set` e `object` aceitam valores de qualquer realm. Um alvo que não é uma função, como um import que não resolveu para nada, lança um `TypeError` quando o validador é criado.

## Verificações

Uma verificação é uma regra sobre um valor que já tem o seu tipo, passada a um validador depois das opções:

```ts
import { check, number, startsWith, string, uppercase } from "@codenhub/validation";

string({ min: 2 }, startsWith("A"), uppercase());
number(check((n: number) => n % 2 === 0, "Must be even"));
```

Uma verificação só roda depois que o valor passou no teste de tipo do validador e em todas as opções:

- Para uma string ou um número, depois que a entrada tem o tipo e passou em opções como `min`, `max` ou `int`.
- Para um formato, depois que o texto está no formato, então uma verificação passada a `ip()` ou `uuid()` nunca vê um texto que não seja um endereço ou um UUID.
- Para um objeto ou uma coleção, depois que todos os filhos passaram, já que antes disso não existe um valor do tipo para verificar.

Enquanto uma opção falha, nenhuma verificação roda, e o validador reporta o problema de cada opção que falhou. Assim, `max` impede que uma string longa chegue a um `pattern` custoso, e uma verificação assíncrona, como uma que pergunta a um servidor se um nome já está em uso, nunca vê um valor que as opções já rejeitaram. Quando as opções passam, todas as verificações rodam e todos os problemas são reportados.

As verificações nativas são importadas uma a uma, e recebem a mensagem como último argumento:

| Verificação        | Para    | Exige                                                                                                                          | `code` e `params`                                                  |
| ------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `pattern(regex)`   | strings | Uma correspondência. As flags `g` e `y` são ignoradas, então a mesma verificação dá sempre a mesma resposta.                   | `invalid_format`, `{ format: "regex", pattern }`                   |
| `startsWith(text)` | strings | Este prefixo.                                                                                                                  | `invalid_format`, `{ format: "startsWith", value }`                |
| `endsWith(text)`   | strings | Este sufixo.                                                                                                                   | `invalid_format`, `{ format: "endsWith", value }`                  |
| `includes(text)`   | strings | Este texto em qualquer posição.                                                                                                | `invalid_format`, `{ format: "includes", value }`                  |
| `lowercase()`      | strings | Não muda com `toLowerCase()`, então uma string sem letras passa. Não altera nada; quem converte é `string({ case: "lower" })`. | `invalid_format`, `{ format: "lowercase" }`                        |
| `uppercase()`      | strings | Não muda com `toUpperCase()`.                                                                                                  | `invalid_format`, `{ format: "uppercase" }`                        |
| `nonBlank()`       | strings | Um caractere que não esteja em branco. Não altera nada; quem remove os espaços é `string({ trim: true, min: 1 })`.             | `invalid_format`, `{ format: "nonBlank" }`                         |
| `multipleOf(step)` | números | Um múltiplo do passo, comparado pelos decimais com que os dois são escritos, então `0.3` é múltiplo de `0.1`.                  | `invalid_value`, `{ type: "number", format: "multipleOf", value }` |
| `nonZero()`        | números | Qualquer coisa menos zero.                                                                                                     | `invalid_value`, `{ type: "number", format: "nonZero" }`           |
| `unique(by?)`      | arrays  | Itens distintos, como explica [Corpos de requisição](request-bodies.md#array).                                                 | `invalid_value`, `{ unique: true }`, no índice de cada repetição   |

Alguns detalhes:

- A mensagem em inglês de `pattern` mostra a expressão, como em `Must match /^[a-z0-9_]+$/`. Onde pessoas vão lê-la, dê uma mensagem à verificação: `pattern(regex, "Use letters, digits and _")`.
- Para `nonBlank`, em branco são os espaços em branco, os caracteres de formatação (categoria Unicode Cf), os preenchimentos do Hangul e o padrão braille vazio, que são todos exibidos como espaço. Então `""`, `"  "` e um espaço de largura zero falham.
- Um `pattern` que não seja uma expressão regular, e um passo de `multipleOf` que não seja um número finito positivo, lançam quando a verificação é criada.
- `multipleOf` é exato para todo número na forma escrita dele: o texto mais curto que, lido de volta, dá o mesmo número, que é o que o JSON transporta. Acima de `Number.MAX_SAFE_INTEGER`, esse texto nem sempre é o número que o double guarda: `2 ** 60` é escrito `1152921504606847000`, então não é múltiplo de `1024`, embora `1e23` seja múltiplo de `10`.
- Um número calculado em ponto flutuante nem sempre é o decimal que parece ser: `0.1 + 0.2` é `0.30000000000000004`, que não é múltiplo de `0.1`.

`check(test, issue?)` cria uma verificação sua. [Validadores personalizados](custom-validators.md) trata disso.

## Objetos

`object(shape, options?, ...checks)` recebe uma estrutura, um objeto cujos valores são validadores, e devolve um validador para objetos com essa estrutura. Esta é a primeira versão do cadastro:

```ts
import { email, number, object, optional, string, type Infer } from "@codenhub/validation";

const signup = object({
  name: string({ trim: true, min: 2, max: 100 }),
  email: email(),
  password: string({ min: 12, max: 200 }),
  age: optional(number({ int: true, min: 18 })),
});

export type Signup = Infer<typeof signup>;
// { name: string; email: string; password: string; age?: number | undefined }

signup({ name: "Ada", email: "ada@example.com", password: "correct horse battery" }); // ok
signup({ email: "nope" }); // { ok: false, ... }, code "invalid_type"
```

A segunda chamada reporta três problemas, cada um no seu caminho: `["name"]` e `["password"]` estão faltando, e `["email"]` não é um endereço. Os caminhos dos problemas descem até o valor que falhou, então um problema dentro de uma lista tem segmentos como `["addresses", 0, "street"]`.

Como `object` lê a entrada:

- Ele só aceita objetos simples, criados por `{}`, `Object.create(null)` ou `JSON.parse`, neste realm ou em outro, como um iframe. Arrays, instâncias de classe, objetos com um protótipo próprio, `Map`s, `Date`s e `null` falham com `invalid_type` e `{ expected: "object", received }`.
- Ele só lê propriedades próprias, então um valor herdado pelo protótipo nunca satisfaz uma propriedade obrigatória.
- Ele valida todas as propriedades, mesmo depois que uma anterior falhou.
- Uma propriedade cujo validador aceita `undefined`, como uma envolvida em `optional`, é opcional no tipo, e fica fora da saída quando a entrada não a tem. [Formulários](forms.md#campos-opcionais-e-valores-padrão) trata de `optional` e dos valores padrão dele.
- A saída é um objeto novo, e a entrada nunca é modificada. A cópia é rasa: o valor de uma propriedade é o que o validador dela produziu. Então um valor que `unknown()` deixa passar é o próprio objeto da entrada, e alterá-lo na saída altera também a entrada.

Uma estrutura só contém chaves de texto enumeráveis. `object` lança um `TypeError` quando é criado com uma chave símbolo ou uma chave não enumerável, cujo validador nunca rodaria.

### Chaves que a estrutura não lista

A opção `unknownKeys` decide o que acontece com as propriedades da entrada que a estrutura não lista:

| `unknownKeys`   | Efeito                                                                                        |
| --------------- | --------------------------------------------------------------------------------------------- |
| `"strip"`       | Descarta-as da saída. É o padrão.                                                             |
| `"strict"`      | Rejeita cada uma com um problema `unrecognized_key` no caminho da chave, e `params: { key }`. |
| `"passthrough"` | Copia-as para a saída sem alteração e sem verificação, exceto `__proto__`, que é rejeitada.   |

Qualquer outro valor, como um `"Strict"` com erro de digitação, lança um `TypeError` quando o validador é criado, em vez de cair para `"strip"`.

Um objeto passthrough rejeita `__proto__` porque uma chave `__proto__` mantida viraria o protótipo de qualquer cópia da saída feita por atribuição, como `Object.assign({}, output)`. O problema é `invalid_key` com um problema dentro, `invalid_value` com `{ reserved: true }`.

### Objetos que não são simples

`objectLike(shape, options?, ...checks)` valida qualquer objeto que tenha as propriedades listadas, enquanto `object` só aceita objetos simples. Use-o para um valor entregue como instância, como um `Error` ou um objeto com métodos, e use `object` para dados.

```ts
import { boolean, objectLike, optional, string } from "@codenhub/validation";

const feedback = objectLike({ message: string({ min: 1 }), isRetryable: optional(boolean()) });

feedback(new Error("Try again")); // { ok: true, value: { message: "Try again" } }
feedback({ message: "" }); // { ok: false, ... }, code "too_small"
```

- Ele aceita todo objeto que não seja um array: um objeto simples, uma instância de classe, um `Map`, um `Date`. Qualquer outra coisa, inclusive uma função, falha com `invalid_type` e `{ expected: "object", received }`.
- Ele lê cada propriedade listada como `input[key]`, então conta uma propriedade herdada, não enumerável ou calculada por um getter.
- Uma propriedade que lança ao ser lida, como pode acontecer com um getter ou um trap de `Proxy`, é reportada como `invalid_value` com `params: { unreadable: true }` no caminho da propriedade, e as outras propriedades continuam sendo validadas.
- A saída é um novo objeto simples que contém só as propriedades listadas, sem as que têm valor `undefined`. Não existe a opção `unknownKeys`.
- As verificações dele rodam depois que todas as propriedades passaram, e veem a saída.

Para escolher entre instâncias por uma propriedade, coloque os validadores `objectLike` em uma `union`. `tagged` só lê a tag de um objeto simples, como explica [Corpos de requisição](request-bodies.md#tagged).

## O tipo que um validador produz

`Infer<typeof validator>` é o tipo TypeScript que um validador produz, seja ele síncrono ou assíncrono. O validador é a única fonte da verdade, então não existe uma interface separada para manter em sincronia com ele. No cadastro acima, `Signup` tem `name`, `email` e `password` obrigatórios e um `age` opcional.

Um validador também pode aceitar um tipo diferente do que produz, como um texto que ele lê como número. `InferInput` lê esse tipo, que é o que um formulário guarda: [Formulários](forms.md#os-tipos-de-um-formulário) trata disso.

## Perguntando só se um valor passa

Quando você só precisa de um sim ou não, use `is(validator, input)`, que devolve um `boolean`:

```ts
import { is, number } from "@codenhub/validation";

const isPort = (input: unknown): boolean => is(number({ int: true, min: 1, max: 65535 }), input);

isPort(8080); // true
```

`is` não estreita o tipo da entrada, e `isPort` não é um type guard, pelo mesmo motivo. Um type guard também afirma que um valor que falha não é do tipo, o que é falso para a maioria dos validadores: `string({ min: 3 })` recusa `"ab"`, que é uma string. Chame o validador e leia `result.value` onde você quiser o valor tipado.

Você pode envolver `is` em um type guard seu quando o validador aceita todo valor do tipo, como faz `string()` sem opções: `(input: unknown): input is string => is(string(), input)`. `number()` não é um validador assim, já que recusa `NaN`.

`is` só aceita validadores síncronos, e lança um `TypeError` para um que devolva uma promise.

## Síncrono e assíncrono

Um validador é síncrono, a menos que algo que ele executa seja assíncrono. Verificar um nome em um banco de dados é assíncrono; verificar o comprimento dele, não.

Você não escolhe um modo. Você escreve a regra, e os tipos acompanham: um validador que contém uma regra assíncrona é um `AsyncValidator`, o resultado dele precisa de `await`, e o compilador impede que você o leia como se já estivesse pronto. Todos os outros validadores continuam síncronos e não pagam nada pelos assíncronos. [Validadores personalizados](custom-validators.md#regras-assíncronas) tem um exemplo.

## Próximos passos

O cadastro agora tem uma estrutura e um tipo. [Formulários](forms.md) o transforma em um formulário: uma senha digitada duas vezes, campos opcionais com valores padrão, um arquivo de avatar e erros exibidos ao lado de cada campo.
