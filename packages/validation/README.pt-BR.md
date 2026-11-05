<!-- source: 6f1f110570551d88793fa3ba58cb3ed297da4fba -->

# @codenhub/validation

Validação para dados que você não controla: o corpo de uma requisição, uma query string, um formulário, uma mensagem vinda de outra origem. Um validador devolve o valor já tipado ou os motivos pelos quais ele não é válido, e foi feito para entradas que podem ser hostis:

- **Formatos devolvem o que um parser leu.** `email()` e `url()` produzem o que o parser de URL da plataforma enxerga, então o valor que você guarda é o mesmo que uma requisição ou um servidor de e-mail vai usar.
- **O que uma entrada inválida reporta é limitado.** Cada coleção para de reportar em 1.000 problemas, como explica [Limites](docs/pt-BR/limits.md#uma-entrada-inválida-tem-custo-limitado), e uma entrada aninhada fundo demais vira um problema só, não um estouro de pilha, desde que o limite de profundidade caiba na pilha.
- **Problemas nunca guardam um valor da entrada**, então registrar em log uma validação que falhou não tem como registrar uma senha que foi enviada. Eles guardam, sim, aquilo com que o schema foi configurado, como os valores que um `oneOf` aceita ou o prefixo de um `startsWith`, e as chaves da entrada, em `path`, como explica [O problema](docs/pt-BR/errors.md#o-problema).

Cada validador é uma função que você importa separadamente, então um programa leva para o bundle só os validadores que usa. Sem dependências.

> **Experimental:** anterior à 1.0. A API deve se manter estável em todas as versões de patch de uma versão minor, como em cada 0.4.x. Uma mudança que quebre quem chama, se for mesmo necessária, sai na próxima versão minor, e o [changelog](docs/changelog/index.md) a lista, junto com as migrações a partir das versões anteriores.

## Instalação

```sh
pnpm add @codenhub/validation
```

## Uso

Um validador é uma função. Crie um para a estrutura que você espera, chame-o com qualquer valor e leia o resultado:

```ts
import { email, flatten, object, string, type Infer } from "@codenhub/validation";

const signup = object({
  name: string({ trim: true, min: 2, max: 100 }),
  email: email(),
});

type Signup = Infer<typeof signup>; // { name: string; email: string }

const result = signup(requestBody);

if (result.ok) {
  result.value.name; // uma string, sem espaços nas pontas
} else {
  flatten(result.error).fieldErrors; // por exemplo { email: ["Invalid email address"] }
}
```

Uma entrada inválida não lança exceção: o resultado diz por que ela falhou. `signup` também é um [Standard Schema](docs/pt-BR/standard-schema.md), então uma biblioteca de formulários ou um router que aceite um aceita `signup` diretamente.

## Documentação

- [Visão geral da documentação](docs/pt-BR/index.md), com o caminho de leitura do primeiro validador até os limites da entrada não confiável
- [Primeiros passos](docs/pt-BR/getting-started.md)
- [Formulários](docs/pt-BR/forms.md) e [Corpos de requisição](docs/pt-BR/request-bodies.md)
- [Problemas e mensagens](docs/pt-BR/errors.md)
- [Referência da API](docs/reference/index.md) (em inglês)
- [Changelog](docs/changelog/index.md) (em inglês)

## Requisitos

- Node.js 24 ou mais recente, ou um navegador, worker ou runtime de edge atual. `url()`, `email()`, `domain()` e `hostname()` precisam de `URL.canParse`, que o Safari anterior à versão 17 não tem, então lançam exceção nele. `ip()` e `cidr()` também usam o parser de `URL`.
- Resolução de pacotes que entenda ESM. O pacote é só ESM e marcado com `sideEffects: false`. Código CommonJS pode carregá-lo com `require()` em todas as versões do Node.js suportadas.
- TypeScript 5.0 ou mais recente, para os tipos, que usam parâmetros de tipo `const`.

## Observações

- **Uma entrada inválida nunca lança exceção.** Uma opção inválida, como `string({ min: -1 })`, lança quando o validador é criado. Exceções dos seus próprios callbacks se propagam, assim como as de um getter ou de um trap de `Proxy` na entrada, exceto com `objectLike`. [Lendo o resultado](docs/pt-BR/getting-started.md#lendo-o-resultado) tem os detalhes.
- **Valores só mudam quando você pede**, com `trim`, `case` ou `clamp`, ou quando um formato tem várias grafias para um mesmo valor. `email()` e `url()` produzem o que o parser de URL leu, e `ip()`, `uuid()`, `phone()` e os demais produzem uma única grafia canônica. Veja [Formatos](docs/pt-BR/formats.md).
- **`email()` e `url()` aceitam só nomes de host públicos**, e não `localhost`, endereços IP ou nomes como `db.internal`. `url({ host: hostname() })` aceita qualquer host. Nenhum dos dois resolve o nome. Veja [`url`](docs/pt-BR/formats.md#url).
- **A validação é síncrona até que uma regra devolva uma promise**, e aí os tipos indicam que o resultado precisa de `await`. Veja [Síncrono e assíncrono](docs/pt-BR/getting-started.md#síncrono-e-assíncrono).
- **Uma entrada que passa é verificada por inteiro.** Limite o tamanho da entrada não confiável, dê um `max` a toda coleção e use `audit(validator)` em um teste para listar o que um schema deixa em aberto. Uma mensagem recebida por structured clone, como a de um `postMessage`, pode conter milhões de itens em poucos bytes, e só `max` limita isso. [Limites](docs/pt-BR/limits.md) tem os detalhes, além de [o que uma entrada hostil consegue](docs/pt-BR/limits.md#o-que-uma-entrada-hostil-consegue).

## Licença

Licenciado sob Apache-2.0.
