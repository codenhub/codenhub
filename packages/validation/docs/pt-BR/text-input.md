---
title: Entrada em texto
description: Leia números, flags, bigints e datas a partir de texto, como variáveis de ambiente, query strings e campos de formulário.
source: 064666ac4b45c870f700349d434130cdf4d09098
order: 4
---

# Entrada em texto

Boa parte dos dados que um programa recebe é texto se passando por outra coisa. Toda variável de ambiente, todo parâmetro de query string e todo campo de texto de um formulário é uma string, seja ele um número de porta, uma flag de sim ou não ou uma data. Um campo de arquivo é um `File`, que [Arquivos](forms.md#arquivos) cobre. Esta página cobre os validadores que leem um valor a partir desse texto, e dois lugares de onde ele vem: uma query string e o ambiente. O servidor do cadastro lê a configuração do ambiente, e a página de cadastro lê um convite da query string.

Um validador estrito como `number()` rejeita `"8080"`, porque é uma string. Isso está certo, e não ajuda em nada aqui. Um validador de conversão converte o texto primeiro e depois valida o resultado, então uma única chamada dá a você um valor tipado ou os motivos pelos quais ele não pôde ser um:

```ts
import { coerceNumber } from "@codenhub/validation";

const port = coerceNumber({ int: true, min: 1, max: 65535 });

port("8080"); // { ok: true, value: 8080 }
port("0"); // { ok: false, ... }, code "too_small"
port("eighty"); // { ok: false, ... }, code "invalid_type"
```

## Os validadores de conversão

Há um para cada tipo que costuma chegar como texto:

| Validador                | Produz  | Aceita                                                                                                                            | Versão estrita |
| ------------------------ | ------- | --------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| `coerceString(options?)` | string  | Strings, números finitos, bigints e booleanos, convertidos para a forma em string.                                                | `string`       |
| `coerceNumber(options?)` | number  | Números, e strings que contêm um número decimal, como `"42"`, `" 3.5 "`, `"-1"`, `".5"` ou `"5."`.                                | `number`       |
| `coerceBoolean()`        | boolean | Booleanos, os números `1` e `0`, e as palavras `true`, `false`, `yes`, `no`, `on`, `off`, `1` e `0`, em maiúsculas ou minúsculas. | `boolean`      |
| `coerceBigint(options?)` | bigint  | Bigints, inteiros seguros e strings que contêm um inteiro decimal.                                                                | `bigint`       |
| `coerceDate(options?)`   | `Date`  | `Date`s, timestamps inteiros em milissegundos e strings ISO 8601 como `2026-09-28` ou `2026-09-28T14:30:00Z`.                     | `date`         |

Cada um recebe as opções da sua versão estrita e as aplica ao valor convertido. `coerceDate` também recebe uma opção própria, `zoneless`, descrita em [Datas](#datas). Uma opção inválida lança um erro quando o validador é criado, então `coerceNumber({ min: Number.NaN })` falha na hora, como `number({ min: Number.NaN })`. Eles também recebem verificações e uma opção `message`, e a mensagem vale também para entrada que não pode ser convertida.

`coerceNumber` aceita um número escrito sem dígitos de um dos lados do ponto, como `".5"` ou `"5."`, já que é assim que as pessoas digitam.

Espaços em branco nas pontas são ignorados no texto que `coerceNumber`, `coerceBigint`, `coerceBoolean` e `coerceDate` leem. São espaços em branco como o `trim` do JavaScript os entende, o que inclui o espaço sem quebra (no-break space) e o byte order mark, então um texto colado com qualquer um deles também é lido. `coerceString` repassa uma string sem alteração; remova os espaços das pontas com `coerceString({ trim: true })`.

## O que não é convertido

A conversão é estreita de propósito, porque uma conversão que tenta adivinhar transforma um bug em um valor que parece certo. Estes falham, com o motivo no problema:

- **Strings:** `NaN` e `Infinity`, que uma conversão numérica que falhou antes no programa deixa para trás, e `null`, `undefined`, objetos, arrays, funções e symbols.
- **Números:** strings vazias, `"1e3"`, `"0x10"`, `"1,5"`, `"Infinity"` e `"NaN"`; texto com um número inteiro além de `Number.MAX_SAFE_INTEGER`, que perderia dígitos em silêncio (use `coerceBigint` para esses); um decimal diferente de zero pequeno demais para um double, que viraria `0` em silêncio; e booleanos, `null`, objetos e arrays. `Number(true)` é `1` e `Number("")` é `0`, e ler uma flag ou um valor ausente como uma contagem é como os bugs se escondem.
- **Booleanos:** qualquer outra palavra. Um erro de digitação como `"ture"` é um erro, não `false`.
- **Bigints:** frações, números além de `Number.MAX_SAFE_INTEGER`, que já perderam precisão, e qualquer outro texto.
- **Datas:** texto livre como `"yesterday"` ou `"03/04/2026"`, cuja leitura depende do runtime, e cujo mês depende do continente, e dias que não existem, como `2026-02-30`.

Um valor que não pode ser convertido falha com `invalid_type`, e os `params` dele são `{ expected, received, coerced: true }`. A mensagem em inglês cita os dois tipos, como em "Cannot convert string to a number". O valor em si nunca aparece no problema.

Um valor que é convertido mas depois viola uma opção falha com o código daquela opção, como no validador estrito.

Um valor que já tem o tipo é passado ao validador estrito sem alteração. Então `NaN` ou um infinito passado a `coerceNumber`, ou uma `Date` inválida passada a `coerceDate`, falha como `number()` ou `date()` falha: com `invalid_type`, e sem `coerced`.

Alguns detalhes das conversões:

- O texto `"-0"` é lido como `0`. O número `-0` passa sem alteração, como em `number`.
- Um decimal é lido como o double mais próximo, então `"0.30000000000000004999"` é `0.30000000000000004`.
- `coerceBigint` leva mais que tempo linear para converter um texto longo. [`audit`](limits.md#verificando-os-limites-que-um-schema-precisa-ter) pede um limite de cada lado dele, o que também limita os dígitos que ele converte.

## Datas

`coerceDate` lê texto de data nestas formas ISO 8601:

- Uma data, `YYYY-MM-DD`, sozinha. Ela é lida como meia-noite UTC.
- Uma data seguida de `T` ou de um espaço, e depois uma hora, `HH:MM` ou `HH:MM:SS`, com uma fração de segundo opcional depois dos segundos.
- Depois, um fuso, que é `Z` ou um offset escrito `+HH`, `+HHMM` ou `+HH:MM`, ou com `-`.

Isso é mais amplo que `datetime()`, que só aceita o separador `T`, e `Z` ou, com `offset`, `+HH:MM`. Um conversor lê o que programas e pessoas costumam escrever, enquanto um [formato](formats.md#datetime-e-time) verifica uma grafia exata.

Uma data e hora sem fuso falha. `2026-09-28T14:30` indica uma hora em algum relógio, não um instante, e o pacote não vai chutar de quem é o relógio. Lida em um fuso qualquer, ela daria a todo mundo em outro lugar um instante horas fora, sem aviso nenhum. Quando você sabe que esse texto está em UTC, passe `zoneless: "utc"`, o único valor que essa opção aceita:

```ts
import { coerceDate } from "@codenhub/validation";

coerceDate()("2026-09-28T14:30"); // { ok: false, ... }, code "invalid_type"
coerceDate({ zoneless: "utc" })("2026-09-28T14:30"); // ok
```

Um input HTML `datetime-local` envia texto sem fuso, e sem os segundos quando eles são zero. Acrescente o offset do usuário ao valor antes de convertê-lo.

De um jeito ou de outro, o resultado não depende do fuso horário da máquina. Mais algumas regras:

- Uma fração de segundo além dos milissegundos é truncada, não arredondada, do mesmo jeito em todo runtime.
- Um timestamp com fração de milissegundo é rejeitado, não truncado.
- Segundos bissextos (`23:59:60`) são rejeitados, já que uma `Date` não consegue guardar um e prefere acreditar que eles não existem.

## Uma query string

`searchParams(validator, options?, ...checks)` lê uma query string, com ou sem o `?`, ou um `URLSearchParams`, deste realm ou de outro, para um objeto com os parâmetros decodificados. Depois, produz o que `validator` fizer desse objeto. Cada valor é texto, então o validador de dentro usa conversão para qualquer outra coisa:

```ts
import { array, coerceNumber, object, optional, searchParams, string } from "@codenhub/validation";

const invitation = searchParams(object({ invite: optional(string({ max: 64 })), step: coerceNumber({ int: true, min: 1 }) }));
invitation("?invite=AB12&step=2"); // { ok: true, value: { invite: "AB12", step: 2 } }

const tags = searchParams(object({ tag: array(string()) }), { repeated: true });
tags("tag=a&tag=b"); // { ok: true, value: { tag: ["a", "b"] } }
```

- Ele lê `+` como espaço e decodifica os escapes.
- Uma chave enviada mais de uma vez, como em `?id=1&id=2`, falha com `invalid_key` em `[key]`, a menos que `repeated` esteja ativo. Uma verificação que visse um dos dois valores enquanto um servidor lesse o outro deixaria passar um valor que ninguém verificou.
- Com `repeated: true`, todo valor de toda chave é uma lista, então valide-o com `array`, como em `array(coerceNumber())`.
- Qualquer outra coisa falha com `invalid_type` e `{ expected: "query string", received }`.

A parte `query` de [`url`](formats.md#partes-de-um-e-mail-ou-de-uma-url) lê os parâmetros do mesmo jeito, mas só para verificá-los: o valor que ela produz continua sendo a URL inteira.

## O ambiente

Combine a conversão com `object` e com `optional` e um valor padrão para transformar um ambiente em configuração tipada, e para reportar todos os problemas dele de uma vez:

```ts
import { coerceBoolean, coerceNumber, object, optional, string, transform } from "@codenhub/validation";

const env = object({
  PORT: coerceNumber({ int: true, min: 1, max: 65535 }),
  DEBUG: optional(coerceBoolean(), false),
  RETRIES: optional(coerceNumber({ int: true, min: 0 }), 3),
  ORIGINS: transform(string(), (text) => text.split(",")),
});

const result = env({ PORT: "8080", ORIGINS: "https://a.example,https://b.example" });
// { ok: true, value: { PORT: 8080, DEBUG: false, RETRIES: 3, ORIGINS: [...] } }
```

No Node.js, passe uma cópia do ambiente: `env({ ...process.env })`. O próprio `process.env` não é um objeto simples, já que o protótipo dele não é `Object.prototype`, então `object` o rejeita como rejeita uma instância de classe, com uma mensagem que diz para copiá-lo. Uma variável ausente é `undefined`, que um valor padrão substitui e qualquer outro validador rejeita.

O ambiente é configuração, então um ambiente inválido é um erro em que vale parar: um servidor que se recusa a subir é mais fácil de depurar que um que sobe e se comporta mal às 3 da manhã. [`assert`](errors.md#lançando-um-erro-para-configuração-inválida) retorna o valor ou lança um erro que cita a variável.

## Limpando o texto antes

Para limpar o texto antes de convertê-lo, coloque um validador estrito na frente com `pipe`: `pipe(string({ trim: true }), coerceNumber())`. [Moldando valores](shaping-values.md#pipe) cobre `pipe`.

Para texto que contém JSON, use [`json`](request-bodies.md#texto-json), que faz o parse do texto e valida o resultado.

## Próximos passos

Todas as páginas até aqui mostraram `{ ok: false, ... }` e educadamente pularam o `...`. [Problemas e mensagens](errors.md) abre esse `...`: o que um resultado com falha contém, e como transformar os problemas dele em texto que uma pessoa lê.
