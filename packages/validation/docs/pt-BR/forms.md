---
title: Formulários
description: Regras entre campos, campos opcionais e valores padrão, erros mostrados ao lado de cada campo, arquivos e os tipos que um formulário guarda.
source: 1ff0836cb731bb25d0500b44a4838571dc4d9066
order: 2
---

# Formulários

O formulário é onde entrada inválida mais aparece, já que uma pessoa a digita no celular, com pressa, com o preenchimento automático ajudando do jeito dele. É também onde essa pessoa precisa saber o que corrigir. Esta página transforma o cadastro em um formulário: uma senha digitada duas vezes, campos opcionais com valores padrão, um arquivo de avatar e erros mostrados ao lado de cada campo. No fim, vêm os tipos de que uma biblioteca de formulários precisa.

## Campos que precisam coincidir

Uma verificação passada a um `object` roda depois que todas as propriedades passaram, e recebe o objeto inteiro, já tipado. Por isso ela pode comparar campos. Aponte o problema dela para o campo a corrigir com `path`:

```ts
import { check, object, string } from "@codenhub/validation";

const passwords = object(
  { password: string({ min: 12, max: 200 }), confirm: string({ max: 200 }) },
  check((data) => data.password === data.confirm, { path: ["confirm"], message: "Passwords must match" }),
);

passwords({ password: "correct horse battery", confirm: "nope" }); // { ok: false, ... }, code "custom"
```

`data` não precisa de anotação: o tipo vem do objeto. [Validadores personalizados](custom-validators.md#adicionando-uma-regra-com-check) explica o que mais uma verificação pode reportar.

### Uma regra que não espera os outros campos

Essa verificação não diz nada enquanto alguma propriedade falha, já que não há um objeto inteiro para entregar a ela. Num formulário, isso muitas vezes é tarde demais: com o nome ainda vazio, o usuário só descobre que as senhas não batem depois de corrigir todo o resto.

`checkFields(keys, test, issue?)` é uma verificação que diz de quais propriedades precisa. Ela roda assim que essas propriedades passam, tenham as outras passado ou não, e o teste recebe um objeto só com essas propriedades:

```ts
import { checkFields, email, object, string } from "@codenhub/validation";

const signupForm = object(
  {
    name: string({ trim: true, min: 2, max: 100 }),
    email: email(),
    password: string({ min: 12, max: 200 }),
    confirm: string({ max: 200 }),
  },
  checkFields(["password", "confirm"], (data) => data.password === data.confirm, {
    path: ["confirm"],
    message: "Passwords must match",
  }),
);

signupForm({ name: "", email: "ada@example.com", password: "correct horse battery", confirm: "nope" });
// { ok: false, ... }, code "too_small"
```

Essa chamada reporta dois problemas: o de `name` e "Passwords must match" em `confirm`. Alguns detalhes:

- Ela ainda espera as propriedades que nomeia. Enquanto `password` for curta demais, nada é dito sobre `confirm`, já que o teste compararia um valor que não é válido.
- Os problemas dela vêm depois dos das propriedades, na ordem em que as verificações foram passadas.
- `data` tem as propriedades nomeadas e nenhuma outra, então o teste não tem como passar a depender de uma que pode ter falhado. Uma propriedade nomeada que está ausente, como pode estar uma opcional, também fica ausente de `data`.
- Ela recebe o problema como `check` recebe, e um teste que retorna uma promise torna o objeto assíncrono.
- Uma validação continua dando um único resultado. Quando outra propriedade está esperando, como uma que consulta um servidor, o teste de `checkFields` roda assim que pode, e o problema dele chega junto com o resto quando todas as propriedades tiverem respondido.
- Um nome que o objeto não tem lança um `TypeError` quando o objeto é criado, já que é um erro de digitação. Uma lista sem nenhum nome também lança, quando a verificação é criada.

Ela funciona com `object` e `objectLike`. Deixe `check` para uma regra que precisa do objeto inteiro, e use as duas no mesmo objeto quando tiver os dois tipos de regra.

## Campos opcionais e valores padrão

Três wrappers aceitam um valor ausente, além do que o validador de dentro aceita:

- `optional(validator)` aceita `undefined`.
- `nullable(validator)` aceita `null`.
- `nullish(validator)` aceita os dois.

O valor aceito passa direto, e qualquer outro valor vai para o validador de dentro. Então `optional` não trata `null` nem a string vazia como ausentes. Os wrappers não reportam nenhum problema próprio, por isso não recebem opções nem verificações: passe essas ao validador que eles envolvem.

Dentro de um `object`, uma propriedade cujo validador pode produzir `undefined` é opcional no tipo, e fica de fora da saída quando a entrada não a tem.

### Valores padrão

`optional(validator, value)` substitui `undefined` por um valor padrão e passa qualquer outro valor ao validador. Assim, um valor inválido continua sendo rejeitado, e só um valor ausente é substituído:

```ts
import { array, oneOf, optional, string } from "@codenhub/validation";

const plan = optional(oneOf(["free", "pro"]), "free");
const interests = optional(array(string({ max: 50 }), { max: 10 }), () => []);

plan(undefined); // { ok: true, value: "free" }
plan("gold"); // { ok: false, ... }, code "invalid_value"
```

Dentro de um `object`, uma propriedade com valor padrão está sempre presente no tipo da saída. Algumas regras:

- O valor padrão é confiável e não é validado.
- Um primitivo é usado diretamente. Uma função é chamada a cada vez, sem argumentos, para gerar o valor padrão.
- Um array ou um objeto precisa vir de uma função, como `() => []`. Um valor único seria compartilhado por todos os resultados, e uma alteração em um apareceria no próximo: um bug que leva uma semana para achar e uma linha para corrigir. Os tipos rejeitam isso, e `optional` lança um `TypeError` quando recebe um desses a partir de JavaScript.
- Pelo mesmo motivo, um valor padrão que é ele mesmo uma função, como um callback para `func()`, é retornado por uma função: `optional(func(), () => noop)`. Recebendo `noop` diretamente, `optional` o chamaria e usaria o que ele retorna, então os tipos rejeitam isso sempre que o validador de dentro pode produzir uma função.
- O tipo supõe que o validador nunca produz `undefined` para um valor presente, o que todo validador nativo respeita. Um `transform` que retorna `undefined` passa, e o valor padrão substitui só um valor ausente.

## Erros ao lado de cada campo

`flatten` agrupa as mensagens de um resultado com falha por campo, que é o que um formulário mostra:

```ts
import { checkFields, flatten, object, string } from "@codenhub/validation";

const signupForm = object(
  { name: string({ min: 2 }), password: string({ min: 12 }), confirm: string() },
  checkFields(["password", "confirm"], (data) => data.password === data.confirm, {
    path: ["confirm"],
    message: "Passwords must match",
  }),
);

const result = signupForm({ name: "A", password: "correct horse battery", confirm: "nope" });
if (!result.ok) {
  flatten(result.error).fieldErrors; // { name: ["Must be at least 2 characters"], confirm: ["Passwords must match"] }
}
```

Os problemas na raiz do valor vão para `formErrors`, e o resto fica em `fieldErrors`, indexado pelo caminho. [Problemas e mensagens](errors.md#erros-para-um-formulário) cobre `flatten` por completo, e como escrever as mensagens em outro idioma.

## Arquivos

Um formulário que envia um arquivo chega como `FormData`, de `request.formData()` no servidor ou de `new FormData(form)` no navegador. `formData` o lê, e `file` verifica cada arquivo dentro dele:

```ts
import { contentType, file, formData, object, optional, string } from "@codenhub/validation";

const signupUpload = formData(
  object({
    name: string({ trim: true, min: 2, max: 100 }),
    avatar: optional(file({ maxSize: 1_000_000 }, contentType(["image/png", "image/jpeg"]))),
  }),
);

export const readSignup = async (request: Request) => {
  const form = await request.formData();
  const [avatar, ...others] = form.getAll("avatar");
  if (others.length === 0 && avatar instanceof File && avatar.name === "" && avatar.size === 0) {
    form.delete("avatar");
  }
  return signupUpload(form);
};
```

Um campo de arquivo sem arquivo escolhido ainda envia uma parte, porque o jeito de um navegador não enviar arquivo é enviar um vazio: um `File` sem nome e sem conteúdo. `optional` vê um valor, então `file` o aceita e `contentType` o rejeita, já que ele não contém uma imagem. `readSignup` remove essa parte antes, então um cadastro sem avatar passa.

### `formData`

`formData(validator, options?, ...checks)` lê um `FormData`, deste realm ou de outro, para um objeto com os campos dele, cada um uma string ou um `File`. Depois, produz o que `validator` fizer desse objeto.

- Uma chave enviada mais de uma vez falha no caminho dela com `invalid_key`, a menos que a opção `repeated` esteja ativa. Uma verificação que visse um dos dois valores enquanto o servidor lesse o outro deixaria passar um valor que ninguém verificou.
- Com `repeated: true`, toda chave vira uma lista, como precisa um campo de vários arquivos ou várias caixas marcadas com o mesmo nome: `formData(object({ photos: array(file({ maxSize: 5_000_000 }), { max: 10 }) }), { repeated: true })`.
- Qualquer outra coisa, inclusive um `URLSearchParams` ou um objeto simples, falha com `invalid_type` e `{ expected: "form data", received }`.

O formulário é lido antes de chegar ao validador, e lê-lo significa ler o corpo inteiro. Então limite o tamanho do corpo onde a requisição é lida, e dê a cada `file` um `maxSize`.

`audit` enxerga através de `formData` o que ele contém. `toJsonSchema` e `encode` recusam `formData`, como recusam qualquer validador que não conseguem escrever.

### `file`

`file(options?, ...checks)` aceita um `File`, deste realm ou de outro, e o produz. Um `Blob` não é um arquivo, já que um formulário envia o arquivo com o nome dele, e um objeto que só se diz arquivo também não é. As opções nunca leem o conteúdo do arquivo, e nenhum problema guarda o nome, o tipo ou um byte sequer dele.

| Opção     | Falha com                                                       |
| --------- | --------------------------------------------------------------- |
| `minSize` | `too_small`, `{ minimum, type: "file" }`, em bytes              |
| `maxSize` | `too_big`, `{ maximum, type: "file" }`, em bytes                |
| `types`   | `invalid_value`, `{ options, type: "file" }`, os tipos listados |

`types` compara o media type que o arquivo declara, sem diferenciar maiúsculas e minúsculas e sem parâmetros como `;charset=utf-8`. O cliente declara o que quiser, então `types` sozinho deixa passar um script chamado `photo.png` com o tipo `image/png`. Para verificar o que o arquivo contém, use `contentType`.

[`audit`](limits.md#verificando-os-limites-que-um-schema-precisa-ter) reporta um `file` sem `maxSize`, já que o programa guarda o tamanho que aceitar.

### `contentType`

`contentType(types, message?)` é uma verificação para `file`. Ela lê os primeiros bytes do arquivo e passa quando eles são os de um dos tipos informados, seja qual for o tipo que o arquivo declara.

- Ela conhece `image/png`, `image/jpeg`, `image/gif`, `image/webp` e `application/pdf`, e lança um erro para qualquer outro tipo quando a verificação é criada.
- Os primeiros bytes são a assinatura de um formato, não a prova de que o resto está bem formado. Um programa que decodifica o arquivo ainda precisa lidar com um que não consegue decodificar.
- A leitura é assíncrona, então um `file` com essa verificação é um `AsyncValidator`.
- Ela roda depois que todas as opções do `file` passaram, então `maxSize` recusa um arquivo grande antes que um byte dele seja lido.
- Conteúdo que não corresponde falha com `invalid_value` e `{ options, content: true }`. Um arquivo que não pode ser lido falha com `{ unreadable: true }`.

## Os tipos de um formulário

Um formulário guarda o que o usuário digitou, antes de ser validado. Esse é o tipo de entrada do validador, que difere do tipo que ele produz sempre que o validador altera o valor. `InferInput<typeof validator>` lê o tipo de entrada, e `Infer`, o de saída:

```ts
import { coerceNumber, object, oneOf, optional, type Infer, type InferInput } from "@codenhub/validation";

const preferences = object({ age: coerceNumber(), plan: optional(oneOf(["free", "pro"]), "free") });

type Preferences = Infer<typeof preferences>; // { age: number; plan: "free" | "pro" }
type PreferencesInput = InferInput<typeof preferences>; // { age: string | number; plan?: "free" | "pro" | undefined }
```

Os dois tipos diferem para:

- `optional` com valor padrão, cuja entrada pode estar ausente.
- Os validadores `coerce`, que aceitam texto, como explica [Entrada em texto](text-input.md).
- `transform`, e `pipe`, que aceita o que o primeiro validador dele aceita.
- `json`, que aceita texto, e `searchParams`, que aceita texto ou um `URLSearchParams`. O tipo de `searchParams` é `string | Iterable<[string, string]>`, para não citar nenhum global de um runtime específico.
- `fallback`, que aceita qualquer coisa.

Limpeza não gera diferença: `string({ trim: true })` aceita e produz uma `string`.

Um validador continua podendo ser chamado com qualquer valor. O tipo de entrada diz o que pode passar, para os tipos de um formulário ou de quem chama, e nunca restringe o argumento. Um validador escrito à mão tem o tipo de entrada `unknown`, a menos que o tipo dele diga outra coisa, como `Validator<number, string>` diz para um que lê um número a partir de texto.

Uma biblioteca de formulários que aceita um [Standard Schema](standard-schema.md) lê os dois tipos do validador. [Integrações](integrations.md#formulários) mostra react-hook-form e TanStack Form.

## Próximos passos

O formulário de cadastro está pronto para o navegador. O servidor é mais desconfiado: ele recebe os mesmos dados como um corpo JSON, de qualquer cliente que aparecer, e muitas vezes mais do que um formulário envia: listas, dicionários e estruturas que variam. [Corpos de requisição](request-bodies.md) trata disso.
