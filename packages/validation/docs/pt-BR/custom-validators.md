---
title: Validadores personalizados
description: Adicione regras com verificações, crie validadores que se comportam como os nativos, valide de forma assíncrona e nomeie os tipos que uma biblioteca de validadores exporta.
source: ff02e37f8386f3f2860d78df4b955d5115b9a260
order: 6
---

# Validadores personalizados

Os validadores nativos cobrem os casos comuns. Um cadastro de verdade tem regras próprias: um nome reservado, um nome de usuário que alguém já pegou, um código de produto que a sua empresa inventou anos atrás e que ninguém se atreve a mudar. Esta página mostra como escrevê-las. Nenhum dos dois tipos precisa de registro:

- Uma **verificação** adiciona uma regra a um validador que você já tem, como a de um nome não estar em uso.
- Um **validador** verifica um tipo ou um formato seu, como um código postal.

Os helpers `check`, `format` e `guard` constroem os dois sobre a mesma base interna dos nativos. Então o que você cria se comporta como eles: as mesmas estruturas de problema, uma opção `message` e verificações próprias.

## Adicionando uma regra com `check`

`check(test, issue?)` cria uma verificação a partir de um teste sobre um valor já tipado. Passe-a para um validador depois das opções dele:

```ts
import { check, number, string } from "@codenhub/validation";

const mustBeEven = check((n: number) => n % 2 === 0, "Must be even");

const seats = number({ int: true }, mustBeEven);
const username = string(
  { trim: true, max: 30 },
  check((name) => name !== "admin", { code: "reserved_name", message: "That name is reserved" }),
);

username("admin"); // { ok: false, ... }, code "reserved_name"
```

O teste recebe o valor que o validador produziu, depois da limpeza. Ele retorna `true` quando o valor é aceitável. Uma verificação do tipo errado, como uma verificação de número passada para `string`, é um erro de compilação.

O segundo argumento é o problema a reportar quando o teste retorna `false`:

- Uma string é a mensagem dele.
- Uma função do problema escreve o texto quando ele é reportado, como faz a mensagem de uma verificação nativa. Ela precisa retornar texto, ou o validador lança um `TypeError` ao reportar o problema.
- Um objeto pode definir `code`, `path`, `params` e `message`. Um `path` é uma lista de chaves e índices, cada índice um inteiro de zero ou mais, e `params` é um objeto simples. Um `path` de texto, um que contém um symbol ou um índice como `-1`, um `params` que não é um objeto simples e uma lista passada como o problema lançam, cada um, um `TypeError` quando a verificação é criada.

Sem código, o problema tem o código `custom`, no próprio local do valor. Um problema sem mensagem própria é descrito pela opção `message` do validador que recebe a verificação, quando ele tem uma. Caso contrário, só resta o código, e `formatIssue` diz "Invalid value". Então dê uma mensagem à verificação sempre que pessoas forem ler o que ela reporta.

Uma verificação roda depois que o valor tem o seu tipo e passou pelas opções do próprio validador. Então o `username` acima nunca testa um nome com mais de 30 caracteres. Para um objeto, isso significa depois que todas as propriedades passaram, então uma verificação pode compará-las. [Formulários](forms.md#campos-que-precisam-coincidir) mostra duas senhas que precisam coincidir, e [`checkFields`](forms.md#uma-regra-que-não-espera-os-outros-campos), uma verificação que roda antes de os outros campos passarem.

### Uma verificação que reporta vários problemas

Um teste também pode retornar os problemas que encontrou, e uma lista vazia para um valor que aceita. É assim que uma verificação reporta vários problemas de uma vez, ou escolhe um caminho para cada falha:

```ts
import { check, string, type IssueInput } from "@codenhub/validation";

const strongPassword = check((password: string) => {
  const issues: IssueInput[] = [];
  if (!/\d/.test(password)) {
    issues.push({ code: "missing_digit" });
  }
  if (!/[A-Z]/.test(password)) {
    issues.push({ code: "missing_uppercase" });
  }
  return issues;
});

const password = string({ min: 12, max: 200 }, strongPassword);

password("correct horse battery"); // { ok: false, ... }, code "missing_digit"
```

Cada problema da lista é um objeto, na forma que `fail()` aceita:

- Um problema sem `code` tem o código `custom`, e um sem `path` fica no próprio local do valor.
- Um problema sem `message` é descrito pelo segundo argumento de `check`, quando ele é uma mensagem ou um problema que tem uma.
- Qualquer outra coisa na lista, como `null` ou um texto, lança um `TypeError` quando a verificação a reporta. O mesmo vale para um `path` que não é uma lista, como `"confirm"`, para um índice de um `path` que é negativo ou não é inteiro, como `-1`, e para um `params` que não é um objeto simples.

Um teste que retorna qualquer coisa que não seja um booleano ou uma lista lança um `TypeError` quando a verificação roda. Isso inclui o `undefined` de um teste que esqueceu de retornar: lido como um valor que passou, ele aceitaria todo valor.

Um validador aceita como verificação só o que `check`, [`checkFields`](forms.md#uma-regra-que-não-espera-os-outros-campos) ou uma verificação nativa como `nonBlank()` criou. Uma função passada no lugar de uma verificação lança um `TypeError` quando o validador é criado. O código que roda um teste e lê a resposta dele vem com `check`, então um schema sem `check` não carrega nada desse código.

## Criando um validador

### Um formato com `format`

`format(name, test)` cria a factory de um formato de string, que se comporta como `email()` ou `uuid()`:

- Algo que não é string falha com `invalid_type`.
- Uma string que o teste rejeita falha com `invalid_format`, e `params.format` igual a `name`.
- Uma string que o teste aceita é produzida como foi escrita.

```ts
import { format } from "@codenhub/validation";

export const postcode = format("postcode", (text) => /^\d{5}(?:-\d{4})?$/.test(text));

postcode()("12345"); // { ok: true, value: "12345" }
postcode({ message: "Enter a ZIP code" })("abc"); // { ok: false, ... }
```

O teste precisa responder na hora. Um teste que retorna uma promise lança um `TypeError` quando o validador roda, já que uma resposta pendente deixaria passar todo valor. Uma regra que espera é uma verificação, como mostra [Regras assíncronas](#regras-assíncronas).

`name` faz parte do contrato do formato: quem chama decide com base nele e os mapas de mensagens o descrevem, então escolha-o uma vez só: renomeá-lo depois quebra todo código que decidia com base nele. O [JSON Schema](json-schema.md) não escreve nenhum `format` para ele, já que o JSON Schema não conhece o nome.

### Um tipo com `guard`

`guard(expected, typeGuard)` cria a factory de um validador para qualquer tipo, a partir de um type guard. Um valor que o guard rejeita falha com `invalid_type`, e `params.expected` igual a `expected`. O guard precisa responder na hora, assim como o teste de `format`:

```ts
import { guard, object } from "@codenhub/validation";

export const blob = guard("Blob", (input): input is Blob => input instanceof Blob);

const attachment = object({ content: blob({ message: "Choose a file" }) });
```

Para um `File` vindo de um formulário, use o [`file`](forms.md#file) do próprio pacote, que também verifica o tamanho e o tipo.

### Um validador com opções próprias

Um validador com opções é uma função que verifica as opções e retorna o que um builder ou um validador nativo cria. Verifique as opções quando a função é chamada, não quando o validador roda, para que um erro em um schema seja encontrado na hora:

```ts
import { check, string, type Validator } from "@codenhub/validation";

export function sku(prefix: string): Validator<string> {
  if (!/^[A-Z]{2,4}$/.test(prefix)) {
    throw new RangeError(`prefix must be 2 to 4 capital letters, received "${prefix}"`);
  }
  return string(check((text) => new RegExp(`^${prefix}-\\d{6}$`).test(text), { code: "invalid_sku", params: { prefix } }));
}
```

### À mão

`validator(validate)` cria um validador a partir de uma função que recebe uma entrada e retorna um resultado. Retorne `pass(value)` quando a entrada for aceitável, e `fail(...)` quando não for:

```ts
import { fail, pass, validator } from "@codenhub/validation";

const even = validator((input) => (typeof input === "number" && input % 2 === 0 ? pass(input) : fail({ code: "not_even" })));

even(4); // { ok: true, value: 4 }
even(3); // { ok: false, ... }, code "not_even"
```

O parâmetro é `unknown`, porque um validador existe para verificar dados em que você ainda não confia. O tipo que o validador produz é lido do que a função retorna, então `even` é um validador de `number`, e `Infer` diz isso.

- Para nomear um tipo que o corpo não mostra, tipe o que a função retorna: `validator((input): ValidationResult<User> => ...)`.
- Para dizer o que ele aceita, para [`InferInput`](forms.md#os-tipos-de-um-formulário), tipe a função como um validador antes de passá-la: uma tipada como `Validator<number, string>` lê um número a partir de texto. Sem isso, o tipo de entrada é `unknown`.
- Um issue guarda só seu `code`, `path`, `params` e `message`, como um feito com `fail()`, então uma propriedade que você adicione à mão, como a entrada, nunca chega ao resultado.

O que `validator` retorna funciona em todo lugar em que um nativo funciona, como dentro de `object`, `optional` e `pipe`, e é um [Standard Schema](standard-schema.md) como eles são. Ele não tem opção `message` nem verificações, a não ser que você as escreva, e é para isso que servem os builders.

Um compositor só aceita uma função escrita à mão por meio de `validator`. O código que chama uma função assim, verifica o que ela retornou e espera por ela vem com `validator`, então um schema sem `validator` não carrega nada desse código.

`fail` aceita um ou mais problemas. Cada um pode definir:

| Campo     | Significado                                                                                                                                                    |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `code`    | Uma string estável com base na qual quem chama decide o que fazer. O padrão é `"custom"`. Escolha a sua, como `"username_taken"`.                              |
| `path`    | Onde está o problema, relativo ao valor que você recebeu. O padrão é o próprio valor. Um pai adiciona os próprios segmentos na frente.                         |
| `params`  | Fatos sobre a falha, para montar uma mensagem ou para quem chama inspecionar. Nunca coloque a entrada aqui: um problema é algo que quem chama registra em log. |
| `message` | Texto fixo da mensagem. Sem ele, [`formatIssue`](errors.md#transformando-um-problema-em-texto) monta o texto a partir de `code` e `params`.                    |

`fail` lança um `TypeError` quando não recebe nenhum problema, já que uma falha sem problema não diz nada. Ele também lança para um `path` que não é uma lista, como `"confirm"` onde se queria `["confirm"]`, que seria dividido em um segmento por letra, para um índice de um `path` que é negativo ou não é inteiro, como `-1`, para um `params` que não é um objeto simples, e para uma lista passada como problema, como `fail(issues)` onde se queria `fail(...issues)`, que seria lida como um único problema que não diz nada.

### Uma função que não é um validador

Uma função que não foi criada por este pacote é recusada onde deveria estar um validador, com um `TypeError` que nomeia o argumento quando o compositor é criado:

```ts
import { object, string, type Validator } from "@codenhub/validation";

object({ name: string as unknown as Validator<string> }); // TypeError: shape.name is not a validator of this copy of the package. A factory is called first, as in string(), and any other function is given to validator()
```

A causa comum é passar uma factory onde deveria estar o validador dela, como `string` em vez de `string()`. Os tipos rejeitam isso, então acontece em JavaScript, ou depois de um cast. A outra é uma função escrita à mão que não foi passada para `validator`, o que os tipos aceitam quando ela é tipada como um `Validator`. O nome é o do argumento: `shape.name`, `item`, `options[1]` de um `union`, `key` de um `record`. Um `lazy` lê o validador dele quando roda pela primeira vez, então é nesse momento que ele lança.

Um validador feito por outra cópia instalada deste pacote é recusado da mesma forma, e uma de suas verificações também: acontece quando dois pacotes dependem de versões de `@codenhub/validation` que não coincidem, e um recebe um esquema do outro. Cada cópia relata os problemas a si mesma, então uma não consegue executar os validadores da outra como seus. Instale uma única versão para ambos, ou passe o validador para `validator`, que o executa como qualquer função escrita à mão e mantém seus problemas, embora não mais o que `describe` e `toJsonSchema` leem dele.

Uma função passada para `validator` que retorna qualquer coisa que não seja um resultado também é um bug: nada, a própria entrada ou uma falha sem problemas. O validador lança um `TypeError` quando roda, "A validator written by hand must return pass(value) or fail(issue)". Uma falha construída à mão em vez de com `fail` é verificada como `fail` verifica os problemas dela, então um `path` como `"confirm"` ou `[-1]`, ou um `params` que não é um objeto simples, também lança ali.

### Uma conversão que pode falhar

[`transform`](shaping-values.md#transform) transforma o valor que um validador produziu em outro, e não pode rejeitá-lo. Uma conversão que pode falhar, como ler um dia como um `Date`, é um validador por si só, colocado depois do primeiro com `pipe`:

```ts
import { fail, isoDate, pass, pipe, validator } from "@codenhub/validation";

// isoDate já verificou que o texto é um dia como 2026-09-28, então isto o lê como meia-noite UTC
// do mesmo jeito em todo runtime. `new Date(text)` com texto em formato livre não faria isso.
const startOfDay = validator((input) => {
  const date = new Date(`${String(input)}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? fail({ code: "invalid_date" }) : pass(date);
});

const birthday = pipe(isoDate(), startOfDay);
```

Para datas em geral, [`coerceDate`](text-input.md#datas) já faz essa conversão.

## Regras assíncronas

Uma regra que precisa esperar, como verificar um nome de usuário em um banco de dados, é uma verificação cujo teste retorna uma promise:

```ts
import { check, email, object, string } from "@codenhub/validation";

const username = string(
  { trim: true, min: 3, max: 30 },
  check(async (name) => !(await isTaken(name)), { code: "username_taken" }),
);

const signup = object({ username, email: email() });

const result = await signup(input);
```

Nada mais muda. Um validador que recebe uma verificação assíncrona vira um `AsyncValidator`, e o mesmo acontece com tudo que o contém: o `signup` acima é um porque `username` é.

O tipo diz ao compilador que o resultado precisa ser aguardado. Então ler `signup(input).ok` sem `await` é um erro que você encontra enquanto escreve, não um bug que você encontra em produção, onde uma promise não tem `ok`: `!result.ok` barraria todo cadastro, e `result.ok === false` deixaria todos passarem. Uma verificação cujo teste pode esperar é um `AsyncCheck<T>`, e uma cujo teste responde na hora é um `Check<T>`, que mantém os validadores dela síncronos.

Você também pode escrever um validador assíncrono diretamente:

```ts
import { fail, pass, validator } from "@codenhub/validation";

const existingUser = validator(async (input) => {
  const user = typeof input === "string" ? await findUser(input) : undefined;
  return user ? pass(user) : fail({ code: "unknown_user" });
});
```

O que um validador assim chama depois do próprio `await` é uma validação separada, já que o pacote não consegue acompanhar um `await` que não foi ele que fez. Um `lazy` que ele alcança volta a contar o `maxCalls` do zero, então a recursão por ali não tem limite. Quando o validador leva de volta a um schema recursivo, deixe o `await` em uma verificação, cujos awaits o próprio pacote faz.

O que saber sobre validação assíncrona:

- **Sempre use `await` no resultado de um `AsyncValidator`.** Ele pode ser uma promise, ou um resultado comum quando o validador conseguiu responder sem esperar, por exemplo `optional(existingUser)` recebendo `undefined`. `await` trata os dois casos.
- **Propriedades e itens independentes rodam as suas regras em paralelo.** No `signup` acima, a consulta do nome de usuário e a verificação do e-mail começam juntas. O mesmo vale para a regra de cada item de um array, sem limite. Dê um `max` ao array antes de validar uma lista que não foi você que escreveu, para que ela não consiga disparar milhares de consultas de uma vez.
- **Os problemas ficam em uma ordem fixa.** Eles seguem a ordem da estrutura e das verificações, não a ordem em que as promises terminaram.
- **`is` e `assert` precisam de um validador síncrono.** Eles lançam um `TypeError` para um que retorna uma promise.
- **Uma promise rejeitada é um bug, não uma entrada inválida.** Se o seu teste lançar uma exceção ou for rejeitado, a exceção se propaga. Reporte entrada inválida retornando `false` ou um problema. Só `instanceOf` transforma uma exceção em falha: um `Symbol.hasInstance` da classe, ou uma trap de protótipo do valor, que lança uma exceção faz o valor falhar com `invalid_type`, assim como `objectLike` reporta uma propriedade que não conseguiu ler.

## O que você não deve fazer

- **Não coloque a entrada em um problema.** Nenhum valor em `params`, e nenhuma `message` montada a partir da entrada. Problemas vão para logs, e entradas são senhas e tokens.
- **Não lance exceções para entrada ruim.** Retorne `false` ou uma lista de problemas de um teste, ou `fail` de um validador. Lance exceções só para um erro na configuração de um validador, e faça isso quando ele é criado, não quando roda.
- **Não modifique a entrada.** Retorne um novo valor com `pass` quando um validador o altera.
- **Não crie um validador no carregamento de um módulo a menos que a chamada seja marcada como pura.** `export const postcode = format(...)` roda quando o módulo carrega, então um bundler o mantém mesmo em um programa que nunca o usa. Em um app, isso é inofensivo. Uma biblioteca de validadores que quer que cada um seja descartado quando não for usado escreve `export const postcode = /* @__PURE__ */ format(...)`.

## Testando um validador

Um validador é uma função, então um teste o chama e olha o resultado:

```ts
import { expect, it } from "vitest";

// `even` é o validador escrito acima.
it("rejects odd numbers with the not_even code", () => {
  const result = even(3);
  expect(result.ok).toBe(false);
  expect(!result.ok && result.error.issues[0]?.code).toBe("not_even");
});
```

## Tipos

Uma biblioteca que exporta validadores próprios os nomeia nas suas declarações. Estes são os tipos que o pacote exporta para isso. Cada um está documentado no código-fonte e listado na [referência da API](../reference/index.md).

Os tipos que você mais escreve:

- `Validator<T, TInput?>` e `AsyncValidator<T, TInput?>`: um validador, síncrono ou não. `AnyValidator` é qualquer um dos dois.
- `Schema<T, TInput?>` e `AsyncSchema<T, TInput?>`: um validador criado por uma factory deste pacote, que também é um [Standard Schema](standard-schema.md). O que `validator` retorna também é um. Uma função só tipada como `Validator` não é, e nenhum compositor a aceita.
- `Check<T>` e `AsyncCheck<T>`: uma verificação.
- `Infer` e `InferInput`: o tipo que um validador produz, e o tipo que pode passar por ele.
- `ValidationResult<T>`, que é `ValidationOk<T>` ou `ValidationErr`. Um `ValidationErr` guarda um `ValidationFailure`, cujos `issues` são `ValidationIssue`s.
- `ValidationIssueCode`, os códigos nativos, aberto a qualquer outra string, e `ValidationPathSegment`, uma chave ou um índice de um `path`.
- `IssueInput`, um problema na forma que `fail` aceita, e `CheckAnswer`, o que o teste de um `check` retorna.
- `Validated`, o que uma função passada para `validator` retorna, e `ValidatedValue`, o tipo do valor que há nele.
- `Message`, o texto ou a função de uma opção `message`, e `MessageOptions`, as opções que todo validador aceita.

As opções de cada validador levam o nome dele: `StringOptions`, `NumberOptions`, `BigintOptions`, `DateOptions`, `FileOptions`, `ArrayOptions`, `TupleOptions`, `LazyOptions`, `FormDataOptions`, `SearchParamsOptions`, `CoerceDateOptions`, `EmailOptions`, `UrlOptions`, `IpOptions`, `UuidOptions`, `DatetimeOptions`, `TimeOptions` e `Base64Options`. `SizeOptions` guarda o `min`, o `max` e o `length` que `set`, `map` e `record` aceitam. `AssertOptions`, `JsonSchemaOptions` e os demais pertencem às páginas das suas funções.

Os tipos de estruturas, que nomeiam o que um compositor produz e aceita:

- `Shape`, as propriedades de um `object`, com `InferShape` e `InferShapeInput`.
- `InferRecord` e `InferRecordInput`, para um `record`.
- `InferTuple` e `InferTupleInput`, para um `tuple`.
- `Variants`, as variantes de uma união `tagged`, com `InferTagged` e `InferTaggedInput`.
- Os tipos de `pick` e companhia, em [Moldando valores](shaping-values.md#reaproveitando-estruturas).

A engrenagem das assinaturas, que você encontra mais nos tooltips do editor:

- `Factory<T, TOptions, TInput?>`, a factory que um builder como `format` retorna: primeiro as opções, depois as verificações.
- `Rest<T, TOptions>` e `AsyncRest<T, TOptions>`, o que vem depois dos argumentos próprios de um validador: opções, depois verificações.
- `Composed<TChildren, TOutput, TInput?>`, o validador que um compositor retorna: síncrono enquanto todos os filhos forem.
- `LiteralValue`, um valor que `literal` aceita. `EnumLike`, um objeto criado por um `enum` do TypeScript, que `oneOf` aceita. `AnyFunction`, qualquer função, para `func`. `Constructor`, uma classe, para `instanceOf`.

## Próximos passos

Muitas regras próprias são formatos de texto. Antes de escrever uma, veja se o pacote já a tem, já que toda regex de e-mail que circula por aí está errada de um jeito diferente. [Formatos](formats.md) lista endereços de e-mail, URLs, endereços IP, datas e o resto.
