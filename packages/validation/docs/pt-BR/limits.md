---
title: Limites
description: Quanto custa uma entrada inválida, os limites dos schemas recursivos, os tamanhos que uma entrada não confiável exige e como audit encontra os limites que um schema deixa em aberto.
source: e0d538a88e38b7688c5582656ba6fe10474f3eb6
order: 12
---

# Limites

Um endpoint de cadastro recebe o que qualquer pessoa enviar, inclusive entradas escritas para deixá-lo lento, esgotar a memória dele ou derrubá-lo. Esta página diz o que o pacote limita por você, o que deixa para você e como verificar se um schema define os limites de que precisa. Leia-a antes de validar entradas vindas de uma rede pública.

Em resumo:

- Uma entrada inválida reporta um número limitado de problemas: eles param em 1.000, e um schema recursivo para numa profundidade e num número de chamadas.
- Uma entrada que passa é validada por inteiro. Então limitar o tamanho dela é com você, com um `max` no texto e em toda coleção.
- `audit` lista todo lugar em que um schema deixa um tamanho em aberto, para que um teste o mantenha fechado.

## O que uma entrada hostil consegue

Cada linha abaixo é executada contra o pacote compilado pela suíte de testes, com o resultado que o comentário dela informa:

```ts
import { array, lazy, number, object, record, string, unknown, url, type Validator } from "@codenhub/validation";

// Um milhão de itens inválidos dão 1.001 problemas: mil deles, e um dizendo que a lista parou ali.
const flood = array(number())(Array.from({ length: 1_000_000 }, () => "x"));
String(flood.ok || flood.error.issues.length); // "1001"

// Uma entrada aninhada 100.000 níveis dá um problema, onde uma recursão sem limite estoura a pilha.
interface Tree {
  children: Tree[];
}
const tree: Validator<Tree> = object({ children: array(lazy(() => tree)) });
let deep: Tree = { children: [] };
for (let level = 0; level < 100_000; level += 1) {
  deep = { children: [deep] };
}
tree(deep); // { ok: false, ... }, code "too_big"

// Uma URL cujo host é escrito como um endereço que um servidor não deve buscar falha. O host não é resolvido,
// então um nome público que resolve para um endereço desses passa: verifique também o endereço ao qual você se conecta.
url()("http://169.254.169.254/latest/meta-data"); // { ok: false, ... }
url()("http://localhost:3000"); // { ok: false, ... }
url()("javascript:alert(1)"); // { ok: false, ... }

// Uma senha que falhou não aparece no que você registra em log.
const login = object({ password: string({ min: 12 }) })({ password: "hunter2" });
String(JSON.stringify(login).includes("hunter2")); // "false"

// Uma chave que viraria o protótipo de uma cópia da saída é recusada.
record(string(), unknown())(JSON.parse('{"__proto__":{"admin":true}}')); // { ok: false, ... }, code "invalid_key"
```

## Uma entrada inválida tem custo limitado

Uma coleção para assim que os itens dela reportam 1.000 problemas. Os itens depois disso não são validados. Mais um problema, `too_big` com `{ maximum: 1000, type: "issues" }` no caminho da coleção, diz que ela parou.

- Um problema que guarda outros em `params.issues` conta junto com eles. Então um item que falha numa `union` conta uma vez, e mais uma para cada problema de cada opção. Uma chave que falha conta junto com o problema por trás dela.
- As chaves desconhecidas de um `object` strict, as repetições que `unique` e `set` encontram, as chaves que uma query string repete e os conflitos de uma `intersection` são listados até o mesmo limite.
- Só os problemas são contados. Então uma entrada que passa nunca é afetada, e uma entrada que falha continua falhando. O que muda é que uma lista longa de itens inválidos não é reportada por inteiro, e não custa a memória e o tempo de reportá-la.
- Para reportar todas as linhas inválidas de uma lista longa, como uma importação, chame você mesmo o validador do item em cada linha.
- Itens validados de forma assíncrona já começaram todos antes de qualquer um ser contado. Então o limite corta o que eles reportam, e não o trabalho deles: dê um `max` a uma coleção assim.

Um tamanho errado é reportado na hora, sem validar os itens. Assim, uma entrada enorme que excede um `max` nunca é processada inteira só para ser rejeitada.

## Dados recursivos

Um schema recursivo usa `lazy`, como mostra [Corpos de requisição](request-bodies.md#dados-recursivos). A recursão é onde uma entrada pequena pode custar mais, então `lazy` tem dois limites:

| Opção      | Padrão | Conta                                                          | Ao ultrapassar                             |
| ---------- | ------ | -------------------------------------------------------------- | ------------------------------------------ |
| `maxDepth` | 128    | Os níveis de `lazy` abertos ao mesmo tempo, de qualquer `lazy` | `too_big` com `{ maximum, type: "depth" }` |
| `maxCalls` | 10.000 | As chamadas que um `lazy` faz numa validação                   | `too_big` com `{ maximum, type: "calls" }` |

Cada um precisa ser um inteiro positivo, ou `lazy` lança um erro ao ser criado.

### `maxDepth`

Cada nível de aninhamento é um nível de recursão, e a pilha do JavaScript só comporta um certo número deles. Por isso `lazy` os conta, e um valor encontrado mais fundo que `maxDepth` falha no próprio caminho:

- Um corpo de requisição com milhares de arrays aninhados, e um objeto cíclico, que um validador recursivo seguiria para sempre, voltam os dois como essa falha, e nunca lançam erro.
- A contagem é compartilhada por todos os `lazy`, não mantida para cada um. É isso que limita a pilha quando dois validadores recursivos chamam um ao outro. Significa que um limite é verificado contra todos os níveis já abertos: `lazy(getter, { maxDepth: 1 })` usado dentro de qualquer outro `lazy` falha na hora, porque o de fora já está um nível abaixo. Defina `maxDepth` para o aninhamento inteiro, não para a parte de um validador.
- Um nível aberto antes de um `await` continua aberto depois dele. Então um schema recursivo assíncrono também está sujeito a `maxDepth`, inclusive diante de um objeto cíclico.

Aumente `maxDepth` só para dados que você sabe que são mais profundos. Para um schema que não espera em todo nível, aumente-o só até onde a pilha do seu runtime aguenta para os validadores que você escreveu. Quanto uma pilha aguenta depende do runtime. Um worker tem cerca de metade da pilha de uma página no Chromium e no Firefox. Um schema com muitos validadores em cada nível precisa de mais pilha, então reduza `maxDepth` para um schema assim onde ele roda num worker.

### `maxCalls`

O trabalho pode crescer mais rápido que a entrada. Uma `union` tenta todas as opções, e um `object` verifica todas as propriedades mesmo depois que uma falhou. Então, numa `union` recursiva de objetos, as opções que não casam também chegam aos filhos, em todo nível.

Um `lazy` guarda o que encontrou para cada objeto em cada caminho numa validação, e devolve isso de novo quando o mesmo objeto é alcançado no mesmo caminho. Assim, essas opções compartilham o resultado dos filhos, e o trabalho cresce junto com a entrada. Uma verificação assíncrona abaixo dele roda uma vez para cada objeto e caminho desses, não importa quantas opções cheguem a ela. Um primitivo não é guardado, já que não tem filhos para multiplicar o trabalho.

Um trabalho que cria um objeto novo em todo nível, como um `transform` que copia o valor antes de um `lazy`, não pode ser compartilhado. O trabalho dele dobra a cada nível, então uma entrada válida pequena pode levar muito tempo. `maxCalls` impede isso: depois dele, toda nova chamada daquele `lazy` falha.

```ts
import { array, lazy, literal, object, union, type Validator } from "@codenhub/validation";

const kids = array(lazy(() => node, { maxCalls: 5_000 })); // um limite para todos os nós do corpo da requisição
const node: Validator<unknown> = union([object({ type: literal("a"), kids }), object({ type: literal("b"), kids })]);
const body = array(node, { max: 100 });
```

O que conta como uma validação:

- Uma chamada como `body(input)`, e tudo o que ela alcança até o resultado dela se resolver, seja qual for o validador na raiz. Então os itens de um `array` de valores recursivos compartilham a contagem de cada `lazy`, e validações feitas uma depois da outra, como uma por requisição, têm contagens próprias.
- Cada `lazy` conta as próprias chamadas contra o próprio limite. Então um limite definido em um nunca é sobrescrito por outro que a validação alcança.
- Uma validação feita a partir de um callback que você escreveu é contada separadamente da validação que executou o callback: o teste de um `check`, a função de um `transform`, um `guard`, o teste de um `format`, o valor padrão de `optional` ou `fallback`, ou o getter de um `lazy`. Um validador passado como filho, mesmo um escrito à mão, faz parte da validação que chega até ele.
- Como `maxDepth`, ele se mantém através dos awaits deste pacote, como os de um `check` assíncrono. Um `await` dentro de um validador que você mesmo escreve não é visto: o que esse validador chama depois dele inicia uma validação própria, com contagens e níveis novos, então nenhum dos dois limites restringe a recursão que passa por ele. Coloque o trabalho assíncrono num `check`, ou limite você mesmo um validador assim.

O que conta como uma chamada:

- Todo objeto, array ou outro valor com partes que chega ao `lazy`, não só todo nível. Então um schema para qualquer valor JSON, cujos arrays e records guardam itens `lazy`, para em 10.000 deles, por mais rasos que sejam.
- Não um primitivo que chega ao `lazy` e encerra a recursão ali, como um número numa lista. Então uma lista de um milhão de números não tem outro limite além do `max` dela.
- Um primitivo pelo qual a recursão continua, como um texto de que um `json` ou um `transform` lê o próximo nível, e um cujo resultado está pendente, como sob um `check` assíncrono.

Uma validação interrompida pelo limite mantém os problemas encontrados no caminho, cada um com um caminho não mais fundo do que `maxDepth` permite. Defina o limite em todo `lazy` do schema, mais baixo para entradas não confiáveis pequenas, e aumente-o para dados recursivos com mais nós do que isso numa validação.

Um `lazy` sob uma `union` falha como aquela opção. Então o código que quem chama vê é o `invalid_union` da união, com o problema `too_big` dentro de `params.issues`. `englishMessages` escreve a união com ele, "Too complex to check within 10000 recursive steps", seja o que for que as outras opções encontraram, já que a entrada pode ser válida e só grande demais. Para objetos que se distinguem por uma propriedade, use [`tagged`](request-bodies.md#tagged), que lê a propriedade primeiro e valida só a variante correspondente.

### Crie um schema recursivo uma vez só

Um `lazy` criado enquanto o getter de outro `lazy` roda compartilha a contagem desse outro, e cada um limita a contagem ao próprio `maxCalls`. É isso que limita um schema criado de novo a cada nível, por um getter que chama a função que o cria, como em `const node = () => union([object({ kids: array(lazy(node)) }), …])`. Cada nível cria novos validadores `lazy`, que de outra forma ganhariam cada um uma contagem própria, e o trabalho dele não teria limite.

Um schema assim também não compartilha resultados, já que cada nível é um validador novo. Então o trabalho dele dobra a cada nível até o limite pará-lo, e ele rejeita entradas válidas profundas que um schema criado uma vez aceita. `audit` e `toJsonSchema` lançam um `TypeError` para ele. Crie um schema recursivo uma vez só e faça referência a ele, inclusive dentro de uma função que o cria para você:

```ts
import { array, lazy, object, string, type Validator } from "@codenhub/validation";

interface Comment {
  text: string;
  replies: Comment[];
}

const thread = (maxCalls: number): Validator<Comment> => {
  const comment: Validator<Comment> = object({ text: string(), replies: array(lazy(() => comment, { maxCalls })) });
  return comment;
};
```

## Limitar o tamanho é com você

Os limites acima tratam da pilha e do trabalho para cada nó. Eles não tratam de tamanho, então não barram uma entrada grande e rasa. Os problemas de um valor que falha não crescem com ele, já que cada coleção para em 1.000 deles, e os de um valor recursivo são limitados por `maxDepth` e `maxCalls`. Mas o trabalho sobre um valor que passa, ou que só falha perto do fim, continua crescendo com o tamanho dele. Então:

- Limite o tamanho de um texto não confiável antes de fazer o parse dele, como em `pipe(string({ max: 100_000 }), json(category))`.
- Dê um `max` a todo `array`, `set`, `map` e `record`.
- Dê um `maxSize` a todo `file`, e limite o tamanho do corpo de uma requisição onde a requisição é lida.

Um valor recebido por structured clone, como `event.data` de `postMessage`, precisa do `max` seja qual for o tamanho dele em bytes. Ele pode conter um array esparso, ou um mesmo array em muitos lugares, então uma mensagem de poucos bytes pode conter milhões de itens.

## Verificando os limites que um schema precisa ter

Uma entrada que passa num validador é validada por inteiro. Então um corpo de um milhão de itens, ou um texto de um gigabyte, custa o que o tamanho dele custa, e é o que você guarda. `audit(validator)` lê um schema, sem chamá-lo, e lista todo lugar em que o tamanho do que ele aceita fica em aberto:

```ts
import { array, audit, email, object, string } from "@codenhub/validation";

const signupBody = object({ name: string({ max: 100 }), email: email(), interests: array(string({ max: 50 })) });

audit(signupBody); // [{ rule: "unbounded_size", path: "interests", kind: "array" }]
```

Dê um `max` a `interests`, e a lista fica vazia, o que um teste verifica:

```ts
import { array, audit, email, object, string } from "@codenhub/validation";

const signupBody = object({ name: string({ max: 100 }), email: email(), interests: array(string({ max: 50 }), { max: 10 }) });

audit(signupBody); // []
```

Cada achado é um `AuditFinding`, com uma `rule`, o `path` da parte no schema e o `kind` dela:

| `rule`             | Reportado para                                                                                                                                                                                     |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `"unbounded_size"` | Um `array`, `set`, `map` ou `record` sem `max` ou `length`, uma `tuple` com `rest` e sem `max`, e um `file` sem `maxSize`                                                                          |
| `"unbounded_text"` | Uma `string` ou `coerceString` sem `max` ou `length`, um formato que não limita o próprio texto, `json` ou `searchParams` com texto em aberto, e um `coerceBigint` sem limite em cada um dos lados |
| `"raised_limit"`   | Um `lazy` cujo `maxDepth` ou `maxCalls` está acima do padrão                                                                                                                                       |
| `"unreadable"`     | Um validador que ele não consegue ler, como um escrito à mão, cujo limite ele não consegue saber                                                                                                   |

Como ele lê um schema:

- **Formatos cuja entrada é limitada pelo que aceitam** não precisam de `max`: `email`, `uuid`, `ulid`, `cuid2`, `nanoid`, `ip`, `cidr`, `mac`, `port`, `phone`, `creditCard`, `isoDate`, `hostname` e `domain`. Qualquer outro, como `url`, `hex`, `jwt` ou um feito com `format`, é um texto como qualquer outro. Limite-o com um `pipe`, como abaixo.
- **Um limite antes conta.** Uma etapa de `pipe` lê o que as etapas anteriores produziram. Então, depois de uma etapa que limita o valor, nada precisa de limite próprio. Em `pipe(string({ max: 10_000 }), json(object({ tags: array(string()) })))`, o texto tem no máximo 10.000 caracteres, e tudo o que se obtém do parse dele também. `pipe(string({ max: 2048 }), url())` limita uma URL do mesmo jeito. O `max` de uma coleção limita quantos itens ela tem, não o que cada um guarda, então os itens depois dele ainda precisam de limites próprios, a menos que os itens antes também tenham sido limitados ou sejam números, booleanos, datas ou literais, que não guardam nada além disso.
- **Texto lido como bigint** leva mais que tempo linear para ser convertido. Por isso `coerceBigint` precisa de `min` ou `gt`, e de `max` ou `lt`. Eles limitam os dígitos que ele converte, e um texto com mais dígitos é recusado sem ser convertido.
- **Um caminho** junta nomes de propriedades com `.`. Ele escreve `[]` para os itens de um array ou de um set, `[0]` para um item de uma tuple, `{}` para as chaves e os valores de um record ou de um map, e `""` para o próprio validador.
- **Um schema recursivo** é lido uma vez em cada lugar em que é usado, e não de novo onde faz referência a si mesmo. Um criado de novo a cada nível, como `lazy(() => build())` o cria, nunca se repete, então `audit` lança um `TypeError` para ele, como `toJsonSchema` faz.
- **`formData`** é lido por dentro, até o que ele contém.

O que ele não avalia:

- Se um `max` é pequeno o bastante. Qualquer número indica que alguém decidiu.
- Verificações, já que rodam sobre um valor que já passou, e qualquer coisa que um `guard` ou um validador escrito à mão faça por dentro.
- O que nenhuma opção limita. As chaves que um `object` com `unknownKeys: "passthrough"` mantém, e o que `unknown()` aceita, não são reportados. Use `"strip"` ou `"strict"` para as chaves que o schema não nomeia, e um validador do tipo que você espera no lugar de `unknown()`.

## Próximos passos

Esse é o fim do caminho de leitura. Para a assinatura exata de cada export, veja a [referência da API](../reference/index.md). Para o que mudou entre versões, e como atualizar, veja o [changelog](../changelog/index.md).
