---
title: Problemas e mensagens
description: O que um resultado com falha contém, os códigos de problema nativos e seus params, e como transformar problemas em texto em inglês, em português ou com as suas próprias palavras.
source: 7c3d1cece87a2afa6e15d3455f3522040965b8a1
order: 5
---

# Problemas e mensagens

Quando um valor não é válido, o resultado diz exatamente por quê. Esta página descreve o que um resultado com falha contém, os códigos que os validadores nativos reportam e como transformá-los em texto para uma pessoa: as mensagens do formulário de cadastro, em inglês ou em português, e o erro que um servidor lança para uma configuração errada.

Os validadores não escrevem texto quando falham, a não ser que você dê a um deles uma [`message`](#o-texto-de-um-validador). Eles reportam os fatos e deixam a redação para quem os mostra, então um programa que nunca mostra um problema não carrega texto nenhum.

## O resultado com falha

```ts
// O que um validador retornou para { name: "A", email: "nope" }
const result = {
  ok: false,
  error: {
    issues: [
      { code: "too_small", path: ["name"], params: { minimum: 2, type: "string" } },
      { code: "invalid_format", path: ["email"], params: { format: "email" } },
    ],
  },
};
```

`error.issues` lista todos os problemas que o validador encontrou, em uma ordem fixa, e nunca está vazio. O tipo também diz isso, então `result.error.issues[0]` é um problema e não `undefined`, mesmo com `noUncheckedIndexedAccess`.

- A ordem segue o schema, não o tempo que cada regra levou. Um `object` estrito reporta primeiro as chaves não reconhecidas, depois os problemas das propriedades, na ordem em que a estrutura as lista.
- Uma coleção para em 1.000 problemas, como [Limites](limits.md#uma-entrada-inválida-tem-custo-limitado) explica.

## O problema

| Campo     | Significado                                                                                                                                            |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `code`    | Uma string estável que nomeia o tipo de falha. Use-a para decidir o que fazer, nunca o texto da mensagem.                                              |
| `path`    | Onde está o valor inválido, a partir da raiz do que você validou. Chaves são strings e índices de array são números. Vazio para a própria raiz.        |
| `params`  | Os fatos por trás da falha, como o limite que foi ultrapassado. Presente quando há algum.                                                              |
| `message` | Texto fixo, quando o problema recebeu um: pela opção `message` de um validador, pela mensagem de uma verificação ou por um validador escrito por você. |

**Um problema nunca contém um valor da entrada.** Não há campo para isso, e `params` guarda nomes de tipo e aquilo com que o schema foi configurado, como um limite, nunca o valor testado. Entradas muitas vezes são senhas ou tokens, e problemas vão para logs e para a tela, então isso é uma regra, não um padrão. Se você precisa do valor, você já o tem.

Chaves não são valores, e elas aparecem nos problemas:

- Um caminho passa pelas chaves da entrada, então um problema de `record` ou de `map` nomeia a chave a que pertence.
- Um `object` estrito reporta cada chave que não reconhece, no caminho e em `params.key`.

Então não coloque segredos em nomes de chaves que você valida. Uma chave também é um texto que o remetente escolheu. `englishMessages` a coloca dentro da mensagem como uma string entre aspas, como em `Unrecognized key "…"`, com aspas e quebras de linha escapadas. `formatPath` a coloca entre aspas do mesmo jeito nos nomes de campo de `flatten`. Assim, uma chave não consegue quebrar uma linha de log. Escape os dois quando for colocá-los em HTML.

O mesmo vale para o que o seu próprio schema nomeia: uma regra reporta aquilo com que foi configurada, em `params` e na mensagem em inglês. Isso inclui os valores que `literal` e `oneOf` aceitam, o texto de `startsWith`, `endsWith` e `includes`, e a expressão de `pattern`. Então não escreva um segredo, como uma chave de API, em um schema: uma verificação que falhasse o exibiria.

### Escrevendo um caminho

`formatPath(path)` escreve um caminho para exibição:

```ts
import { formatPath } from "@codenhub/validation";

formatPath(["user", "addresses", 0, "street"]); // "user.addresses[0].street"
formatPath([0, "title"]); // "[0].title"
formatPath(["a.b"]); // '["a.b"]'
```

Uma chave vai entre aspas dentro de colchetes quando está vazia ou contém `.`, `[`, `]`, `"`, um caractere de controle como uma quebra de linha, ou um separador de linha, com esses caracteres escapados. Assim, uma chave chamada `a.b` e o caminho `a`, `b` nunca resultam no mesmo texto.

## Códigos nativos

O conjunto de códigos é aberto: um validador personalizado reporta o código que quiser. Estes são os códigos que os validadores nativos usam. Cada página lista o código e os `params` exatos ao lado dos validadores que cobre.

| Código                 | Significado                                                                                                                                                                                                                               | `params`                                                                                                                                                                                                                                    |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `invalid_type`         | O valor não é do tipo esperado, ou não pôde ser convertido para ele.                                                                                                                                                                      | `expected` e `received`, ambos nomes de tipo, e `coerced: true` quando um validador de conversão não conseguiu converter o valor.                                                                                                           |
| `invalid_format`       | Uma string não tem o formato exigido.                                                                                                                                                                                                     | `format`, como `"email"` ou `"regex"`, mais o que a regra precisar. Para uma parte de `url` ou de `email` que falhou, `part` e `issues`, o que o validador da parte encontrou.                                                              |
| `invalid_value`        | O valor tem o tipo certo, mas é um valor que não é permitido.                                                                                                                                                                             | Depende da regra, como diz a lista abaixo desta tabela.                                                                                                                                                                                     |
| `too_small`            | Abaixo de um mínimo: curto demais, com itens de menos, ou um número ou uma data pequenos demais.                                                                                                                                          | `minimum`, `type`, e `inclusive` ou `exact` quando se aplicam.                                                                                                                                                                              |
| `too_big`              | Acima de um máximo; aninhado mais fundo, ou com mais recursão, do que `lazy` permite; ou uma coleção que parou em 1.000 problemas.                                                                                                        | `maximum`, `type` (`"depth"` ou `"calls"` para `lazy`, `"issues"` para uma coleção que parou), e `inclusive` ou `exact` quando se aplicam.                                                                                                  |
| `unrecognized_key`     | Um objeto tem uma propriedade que a estrutura não lista, no modo estrito.                                                                                                                                                                 | `key`. O caminho do problema termina na chave.                                                                                                                                                                                              |
| `invalid_key`          | Uma chave de um `record` ou de um `map` falhou no validador de chave; o validador de chave a transformou em uma chave que uma entrada anterior já tem; uma chave foi informada duas vezes; ou uma chave é `__proto__` onde seria copiada. | `issues`: o que o validador de chave encontrou, com caminhos relativos à chave; para uma chave repetida, um problema `invalid_value` com `unique: true`; para `__proto__`, um com `reserved: true`. O caminho do problema termina na chave. |
| `invalid_intersection` | Os dois validadores de um `intersection` passaram, mas produziram valores que não podem ser mesclados em um só.                                                                                                                           | Nenhum. O caminho do problema é onde as duas saídas diferem.                                                                                                                                                                                |
| `invalid_union`        | Um valor não correspondeu a nenhuma das opções de um `union`, ou uma união `tagged` recebeu uma tag ausente ou desconhecida.                                                                                                              | Para `union`, `issues`: os problemas que cada opção encontrou, em ordem, com caminhos relativos ao valor da união. Para `tagged`, `discriminator` e `options`, e o caminho do problema é o da tag.                                          |
| `custom`               | O código padrão de uma chamada de `check` ou de `fail` que não nomeia código.                                                                                                                                                             | O que quem reportou definir.                                                                                                                                                                                                                |

Os `params` de `invalid_value`:

- `expected` para um `literal`, e `options` para uma lista de valores.
- Para um número, `type` e `format` (`"int"`, `"safeInt"`, `"nonZero"` ou `"multipleOf"`), com o passo em `value` para `"multipleOf"`.
- `unique: true` para uma repetição em um array ou em um set.
- `reserved: true` dentro do `invalid_key` de uma chave `__proto__`.
- `unreadable: true` para uma propriedade de uma entrada de `objectLike` que lançou uma exceção ao ser lida, ou para um arquivo que `contentType` não conseguiu ler.
- `content: true` ao lado de `options` para um arquivo cujos primeiros bytes não são de nenhum dos tipos que `contentType` lista.
- `encodedSeparator: true` e `dotSegment: true` para os caminhos de URL descritos em [Formatos](formats.md#caminhos-que-um-servidor-lê-de-outro-jeito).

Uma chave `__proto__` é reportada onde seria copiada para um novo objeto: em um `record`, entre as chaves não listadas de um `object` em modo passthrough, e em um `intersection` cujos lados a repassaram sem verificar.

`englishMessages` não tem texto para `custom`, já que uma verificação que falhou não traz nada para descrever, então `formatIssue` diz "Invalid value". Dê uma mensagem à verificação onde pessoas leem o que ela reporta.

### Os nomes de tipo em `received`

`received` nomeia os tipos de valor do mesmo jeito em todo lugar: `null`, `array`, `nan`, `infinity`, `date`, `invalid date` para um `Date` que não guarda nenhum instante, `object` para qualquer outro objeto (incluindo um `Map`, um `Set` ou uma instância de classe), ou o `typeof` de qualquer outra coisa. Ele nunca nomeia uma classe, já que isso exigiria ler o protótipo da entrada.

Onde se espera um objeto simples (`object`, `record`, `tagged`), qualquer outro objeto é `non-plain object`. `englishMessages` descreve isso como "Expected a plain object; copy it first, as in { ...value }", já que uma cópia, como `{ ...process.env }`, é o que passa.

## Transformando um problema em texto

`formatIssue(issue, messages?)` transforma um problema em texto a partir de um mapa de mensagens, `englishMessages` a não ser que você passe outro:

```ts
import { formatIssue, number } from "@codenhub/validation";

const result = number({ min: 18 })(15);
if (!result.ok) {
  formatIssue(result.error.issues[0]); // "Must be at least 18"
}
```

O texto vem do primeiro destes que existir:

1. A própria `message` do problema, definida pela [opção `message`](#o-texto-de-um-validador) de um validador ou pela mensagem de uma verificação.
2. Uma entrada para o `code` dele no mapa de mensagens.
3. A entrada `default` desse mapa, que descreve todo código para o qual o mapa não tem entrada.
4. O texto "Invalid value".

`englishMessages` é um valor separado. Um programa o inclui no bundle quando chama `formatIssue` ou `flatten`, mesmo com outro mapa, já que ele é o padrão dessas funções. Um programa que nunca as chama não o inclui. Um programa cujos problemas trazem todos a sua própria `message` pode passar `{}`. Um mapa que não é um objeto, como `null`, é um `TypeError`.

`formatIssue` descreve os problemas que os validadores retornam. Um problema recebido de outro lugar, como JSON de um servidor que você não controla, é uma entrada como qualquer outra, e um problema malformado pode lançar uma exceção: valide-o antes de transformá-lo em texto.

Um validador também tem um texto curto próprio em inglês, para as bibliotecas que o leem como um [Standard Schema](standard-schema.md). Esse texto não é `englishMessages`, e aquela página o descreve.

### Problemas que contêm outros problemas

Três códigos guardam os problemas por trás deles em `params.issues`: `invalid_key`, `invalid_union` vindo de `union`, e `invalid_format` para uma parte de uma URL ou de um endereço de e-mail que falhou. `englishMessages` os descreve junto com o problema por trás, para que a mensagem diga o porquê:

- `invalid_key` com o primeiro problema que o validador de chave encontrou, como em "Invalid key: Must be at least 3 characters". Uma chave informada duas vezes, em uma query string ou depois que um validador de chave transformou duas chaves na mesma, é "Must be given only once".
- Uma parte que falhou, do mesmo jeito, como em "Invalid email address domain: Expected one of "company.com"".
- `invalid_union` com o primeiro problema da opção a que a entrada se destinava, quando a entrada deixa exatamente uma candidata. Uma opção é descartada quando tudo o que ela encontrou é que a entrada não é do seu tipo, ou não é um dos valores que um `literal` ou um `oneOf` aceita. Com mais candidatas ou nenhuma, a mensagem é "Does not match any of the allowed types". Um limite de `lazy`, `maxDepth` ou `maxCalls`, que uma opção tenha atingido vem antes de tudo isso: a mensagem cita o limite, já que ele interrompeu a validação, tenha a entrada o que tiver. Os problemas de cada opção ficam em `params.issues`, para uma mensagem sua. Por exemplo:
  - `union([string({ min: 3 }), number()])` recebendo `"ab"`: `number()` só descobriu que `"ab"` não é um número, então a string era a pretendida, e a mensagem é "Must be at least 3 characters".
  - `union([literal(""), email()])` recebendo `"nope"`: `literal("")` só descobriu que `"nope"` não é o seu valor, então a mensagem é "Invalid email address".
  - `union([string({ min: 3 }), email()])` recebendo `"ab"`: as duas opções aceitam strings e as duas encontraram mais do que um tipo errado, então qualquer uma poderia ser a pretendida, e a mensagem é "Does not match any of the allowed types".

O problema por trás é descrito com o mesmo mapa. Então sobrescrever `too_small` em uma cópia de `englishMessages` também afeta a mensagem de uma chave. Um problema citado que está mais fundo do que o valor em que o problema externo é mostrado começa com o caminho dele, como em "width: Must be at least 1" para o `width` de uma opção que é um objeto.

Uma lista de valores permitidos nomeia os dez primeiros, e quantos mais existem.

### Problemas por trás de um problema

Um problema guardado no `params.issues` de outro só mantém os problemas por trás dele quando nenhum deles tem problemas próprios. Assim, os problemas se aninham em no máximo três níveis, seja o que for que os componha:

- Uma parte ou uma chave cujos problemas são simples, como o `{ options: ["company.com"] }` de um domínio ou o `{ unique: true }` de uma chave repetida, os mantém.
- Os problemas de uma união são as listas das opções dela. Então uma união guardada dentro de outro problema, como a de uma propriedade de uma opção que é objeto dentro de uma união externa, mantém o código e o caminho, sem os problemas das opções.

Sem essa regra, um schema recursivo aninharia problemas uma vez para cada nível. Onde os níveis compartilham um resultado, como fazem as opções de uma união recursiva por meio de um único `lazy`, cada caminho por esse aninhamento escreveria o resultado de novo, e uma entrada pequena poderia gerar um resultado grande demais para serializar.

O texto que chega a um problema guardado sem os seus problemas diz o que pode sem eles, como "Does not match any of the allowed types" para uma união. Um limite de `lazy` que interrompeu a validação por trás de um problema assim nunca é descartado: o problema `too_big`, com seus `maximum` e `type`, fica no lugar dele. `flatten` e `standard` usam o mesmo texto, então nenhum dos dois lista problemas aninhados à parte.

## O texto de um validador

Todo validador que reporta um problema próprio aceita a opção `message`: o texto, ou uma função que descreve um problema a partir do `code` e dos `params` dele.

```ts
import { email, object, startsWith, string } from "@codenhub/validation";

const signupForm = object({
  name: string({ min: 2, message: "Enter your full name" }),
  email: email({ message: (issue) => t(`errors.${issue.code}`) }),
  invite: string(startsWith("INV-", "Invitation codes start with INV-")),
});
```

- Ela descreve todo problema que esse validador reporta por conta própria, e todo problema que uma das verificações dele reporta sem mensagem própria.
- Ela não descreve nenhum problema que um filho reporta. Então `object(shape, { message })` descreve uma entrada que não é um objeto, e deixa os problemas de cada propriedade para essa propriedade.
- Toda verificação nativa aceita uma mensagem como último argumento, para uma verificação que precisa de uma frase própria. `string({ message: "Invalid username" }, pattern(/^\w+$/))` diz "Invalid username" para qualquer uma das falhas, nunca o padrão.
- Uma função recebe o problema como esse validador o reporta. Então o `path` dela é relativo ao próprio valor do validador, `[]` para o próprio valor, mesmo quando o resultado coloca o problema mais fundo dentro de um objeto ou de um array. Escreva o texto a partir do campo a que você deu a opção, não do caminho.

Um problema que traz uma mensagem é descrito por ela primeiro, antes de qualquer mapa de mensagens. É assim que um campo ganha uma frase própria enquanto um mapa descreve o resto.

## Idiomas nativos

Dois mapas vêm com o pacote. Cada um é um valor separado, então um programa inclui no bundle os idiomas que importa e nenhum outro:

| Mapa                 | Idioma                               | `number({ min: 18 })(15)` |
| -------------------- | ------------------------------------ | ------------------------- |
| `englishMessages`    | Inglês                               | "Must be at least 18"     |
| `portugueseMessages` | Português, como se escreve no Brasil | "Deve ser no mínimo 18"   |

Os dois descrevem os mesmos nove códigos. `formatIssue`, `flatten` e `standard` recebem o mapa como argumento, e `assert` o recebe na opção `messages`. Para um programa em vários idiomas, escolha o mapa onde você mostra o problema:

```ts
import { englishMessages, formatIssue, portugueseMessages, type Messages } from "@codenhub/validation";

const maps: Record<string, Messages> = { en: englishMessages, pt: portugueseMessages };
const wordingFor = (locale: string): Messages => maps[locale] ?? englishMessages;

formatIssue(issue, wordingFor("pt"));
```

`portugueseMessages` escreve os números como se escreve no Brasil:

```ts
import { formatIssue, multipleOf, number, portugueseMessages } from "@codenhub/validation";

const below = number({ min: 0.1 })(0);
if (!below.ok) {
  formatIssue(below.error.issues[0], portugueseMessages); // "Deve ser no mínimo 0,1"
}
const step = number(multipleOf(0.01))(0.001);
if (!step.ok) {
  formatIssue(step.error.issues[0], portugueseMessages); // "Deve ser múltiplo de 0,01"
}
```

- Um limite ou um passo usa vírgula decimal.
- Uma lista longa de valores permitidos termina com "e mais N", onde o inglês diz "or N more".
- As mensagens sobre chaves usam o feminino, já que "chave" é feminino: "Chave não reconhecida".

O que um mapa não traduz é o que o problema guarda como dado: os nomes de tipo, como em "Esperado string, recebido number", o nome de um formato que o pacote não conhece, e o nome de uma parte de uma URL ou de um endereço.

Um problema cujo código o mapa não tem, como o de uma verificação personalizada, é descrito pela entrada `default` do mapa, "Valor inválido" em `portugueseMessages`. `englishMessages` não tem `default`, já que o último texto de `formatIssue`, "Invalid value", já está em inglês.

## Reescrevendo e localizando

Um mapa de mensagens é um objeto que vai de código para texto:

- Uma string é usada diretamente.
- Uma função recebe o problema, para poder usar `params`, e o mapa em que foi encontrada, para poder descrever um problema aninhado em `params` com `formatIssue(nested, messages)` e o mesmo mapa.

Para mudar parte do texto em inglês, copie `englishMessages` com um spread e sobrescreva os códigos que quiser. Ele é congelado, então não pode ser alterado no lugar. Para traduzir para um idioma que não tem mapa aqui, escreva um mapa seu:

```ts
import { englishMessages, formatIssue, type Messages } from "@codenhub/validation";

const shorter: Messages = { ...englishMessages, too_small: "Too short" };

const pt: Messages = {
  invalid_type: (issue) => `Esperado ${String(issue.params?.expected)}`,
  too_small: (issue) => `Mínimo de ${String(issue.params?.minimum)}`,
  username_taken: "Este nome de usuário já existe",
  default: "Valor inválido",
};

formatIssue(issue, shorter);
formatIssue(issue, pt);
```

Cubra os códigos que os seus validadores podem reportar, que as tabelas acima listam, e dê ao mapa uma entrada `default`, como texto ou como função do problema. Sem ela, todo código que você deixar de fora diz "Invalid value", em inglês. Os códigos próprios de um validador personalizado também têm lugar no mapa, ou o problema pode trazer uma `message`.

Uma entrada precisa ser texto ou uma função que retorna texto. Qualquer outra coisa, como uma busca de tradução que retornou `undefined` ou uma entrada que é um grupo de traduções, lança um `TypeError` quando um problema desse código é transformado em texto. Isso vale igualmente em `formatIssue`, `flatten`, `assert` e `standard`, então um formulário nunca mostra `undefined`.

### O texto de um código

O texto em inglês de cada código também é uma exportação separada. Um programa que só pode reportar alguns códigos monta um mapa com eles. Um que escreve os problemas só com [`assert`](#lançando-um-erro-para-configuração-inválida) não inclui então nenhum outro texto no bundle, enquanto `formatIssue`, `flatten` e `standard` incluem todo o `englishMessages` mesmo assim, [por ele ser o padrão delas](#transformando-um-problema-em-texto):

| Código                 | Exportação                   |
| ---------------------- | ---------------------------- |
| `invalid_type`         | `invalidTypeMessage`         |
| `invalid_format`       | `invalidFormatMessage`       |
| `invalid_value`        | `invalidValueMessage`        |
| `too_small`            | `tooSmallMessage`            |
| `too_big`              | `tooBigMessage`              |
| `unrecognized_key`     | `unrecognizedKeyMessage`     |
| `invalid_key`          | `invalidKeyMessage`          |
| `invalid_intersection` | `invalidIntersectionMessage` |
| `invalid_union`        | `invalidUnionMessage`        |

```ts
import { formatIssue, invalidTypeMessage, string, tooSmallMessage, type Messages } from "@codenhub/validation";

const messages: Messages = { invalid_type: invalidTypeMessage, too_small: tooSmallMessage };

const result = string({ min: 2 })("a");
if (!result.ok) {
  formatIssue(result.error.issues[0], messages); // "Must be at least 2 characters"
}
```

`englishMessages` é o mapa com os nove. Um texto que cita o problema por trás de outro, como fazem `invalidKeyMessage`, `invalidUnionMessage` e `invalidFormatMessage`, o descreve com o mapa com que foi chamado. Então inclua os códigos que o problema citado pode ter.

## Erros para um formulário

`flatten(failure, messages?)` agrupa as mensagens de um resultado com falha para exibição. Os problemas na raiz vão para `formErrors`, e o resto fica em `fieldErrors`, indexado pelo caminho, escrito por `formatPath`:

```ts
import { flatten } from "@codenhub/validation";

const result = signup(input);
if (!result.ok) {
  const { formErrors, fieldErrors } = flatten(result.error);
  fieldErrors["email"]; // ["Invalid email address"]
  fieldErrors["addresses[0].street"]; // ["Must be at least 3 characters"]
}
```

Ele aceita o mesmo mapa de mensagens que `formatIssue`, `englishMessages` a não ser que outro seja passado. O que ele retorna tem o tipo `FlattenedErrors`.

`fieldErrors` não tem protótipo. Assim, um campo chamado `constructor` ou `toString` não pode ser confundido com um membro herdado, e `fieldErrors["toString"]` é `undefined` quando não existe esse campo. O custo é que ele não tem métodos: pergunte com `"name" in fieldErrors` ou `Object.hasOwn(fieldErrors, "name")`, não com `fieldErrors.hasOwnProperty("name")`.

## Lançando um erro para configuração inválida

Algumas entradas não deveriam ser inválidas. Um objeto de opções que outro desenvolvedor passa para a sua função, ou o ambiente de um servidor, só está errado por engano, e o melhor é lançar um engano onde ele foi cometido, enquanto quem o cometeu ainda está olhando. `assert(validator, input, options?)` retorna o valor que o validador produziu, ou lança um `TypeError`:

```ts
import { array, assert, invalidTypeMessage, object, string, tooSmallMessage } from "@codenhub/validation";

const config = object({ locales: array(string({ trim: true, min: 1 }), { min: 1 }) });
const messages = { invalid_type: invalidTypeMessage, too_small: tooSmallMessage };

export function createI18n(input: unknown) {
  const { locales } = assert(config, input, { subject: "[I18n]", messages });
  return locales;
}

createI18n({ locales: ["en", 1] }); // TypeError: [I18n] locales[1]: Expected string, received number
```

- A mensagem é o `subject`, escrito como você o passou, depois o caminho do primeiro problema, depois o texto dele. Sem `subject`, ela começa pelo caminho. Um problema no próprio valor não tem caminho.
- O texto é a própria `message` do problema, depois o mapa `messages`, incluindo a entrada `default` dele, depois "Invalid value".
- **`assert` não tem mapa padrão.** Sem `messages`, um problema sem mensagem própria diz "Invalid value", como em `TypeError: port: Invalid value`. O caminho ainda diz qual opção está errada. Para mais que isso, passe `englishMessages`, um mapa de alguns códigos como acima, ou uma `message` em cada validador, como abaixo.
- A `cause` do erro é a falha, então `error.cause.issues` lista todos os problemas que o validador reportou, não só o primeiro.
- Ele aceita apenas validadores síncronos, e lança `TypeError: assert() needs a synchronous validator. Call the validator and await its result instead.` para um que retorna uma promise.
- Uma opção que ele não conhece lança uma exceção, como acontece com uma factory: `TypeError: Unknown option subjct`.

```ts
import { assert, englishMessages, number, object } from "@codenhub/validation";

const options = object({ port: number({ int: true, min: 1, max: 65535 }) });

assert(options, { port: 8080 }, { subject: "createServer:" }); // { port: 8080 }
assert(options, { port: 0 }, { subject: "createServer:" }); // TypeError: createServer: port: Invalid value
assert(options, { port: 0 }, { subject: "createServer:", messages: englishMessages }); // TypeError: createServer: port: Must be at least 1
```

### Mantendo o seu próprio texto

Um pacote que já lança exceções para as suas opções tem um texto que os usuários dele conhecem. Dê a cada validador a sua `message`, e `assert` não precisa de mapa, então nenhum texto deste pacote vai para o bundle:

```ts
import { assert, boolean, nonBlank, objectLike, optional, string } from "@codenhub/validation";

const feedback = objectLike(
  {
    message: string({ message: "must be a non-empty string." }, nonBlank()),
    isRetryable: optional(boolean({ message: "must be a boolean when provided." })),
  },
  { message: "must be an object whose fields can be read." },
);

export function register(input: unknown) {
  return assert(feedback, input, { subject: "Registry feedback" });
}

register({ message: " " }); // TypeError: Registry feedback message: must be a non-empty string.
register({ message: "Try again", isRetryable: "yes" }); // TypeError: Registry feedback isRetryable: must be a boolean when provided.
register(null); // TypeError: Registry feedback must be an object whose fields can be read.
```

- A `message` de um validador descreve todo problema que ele reporta por conta própria, e todo problema das verificações dele que não tem mensagem. Então uma frase cobre um tipo errado, um limite e `nonBlank()`. Dê a uma verificação a sua própria mensagem onde as frases forem diferentes.
- `assert` escreve o caminho antes da mensagem, então a mensagem não nomeia o campo: ela é lida depois de `message:` ou de `locales[1]:`.
- `objectLike` aceita uma instância de classe ou um `Error`, e reporta um getter que lança uma exceção com a mensagem do objeto. `object` aceitaria apenas objetos simples, e deixaria a exceção passar.

Use `assert` para configuração e outros argumentos. Para um formulário, uma requisição ou qualquer outra coisa que um programa espera receber inválida, chame o validador e leia o resultado, que lista todos os problemas em vez de lançar uma exceção no primeiro.

## Enviando um resultado para outro lugar

Um resultado com falha é um dado simples, então pode ir para um log, ser enviado a um cliente ou ser armazenado. Nenhum problema que o pacote reporta guarda um valor da entrada, então fazer isso não vaza o que foi enviado. Um problema nomeia, sim, as chaves da entrada, em `path`, e uma verificação que você escreve decide o que o próprio problema dela guarda. Um resultado que passou guarda o próprio valor.

Alguns valores não passam pelo JSON sem mudar:

- Nenhum problema guarda um bigint, que `JSON.stringify` não consegue escrever: um limite ou um valor esperado bigint é escrito como seus dígitos decimais, ao lado de `type: "bigint"`.
- Os limites de um validador `date` são `Date`s, que `JSON.stringify` escreve como texto ISO. `englishMessages` descreve as duas formas do mesmo jeito.
- Um `literal` ou `oneOf` de `undefined`, de um symbol ou de um infinito guarda esse valor, que o JSON escreve como `null` ou omite. Transforme esses problemas em texto antes de enviá-los.

## Próximos passos

Os validadores nativos e as mensagens deles cobrem os casos comuns. Para uma regra sua, como um nome que não pode já estar em uso, veja [Validadores personalizados](custom-validators.md).
