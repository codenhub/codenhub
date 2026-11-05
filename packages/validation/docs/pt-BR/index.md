---
title: Visão geral
description: Para que serve o pacote de validação, como instalá-lo e em que ordem ler as páginas.
source: acc3ea5f9cdca5707b9a2df752d212aa10cc5b49
---

# Valide valores e estruturas

`@codenhub/validation` responde a uma pergunta: este valor é o que eu disse que ele deveria ser? Você entrega um valor a um validador. E recebe de volta ou esse valor, tipado, ou uma lista do que há de errado com ele.

Funciona do mesmo jeito para um valor só, como um endereço de e-mail ou um número de porta, e para um objeto inteiro, como um formulário ou o corpo de uma requisição.

## Por que validar

Dados que cruzam uma fronteira que você não controla podem conter qualquer coisa: uma requisição, um formulário, uma query string, uma variável de ambiente, um arquivo, uma mensagem de outro serviço. O TypeScript verifica tipos quando você compila, não quando o programa roda. Então o tipo que você escreveu para esses dados é uma promessa que nada garante, até que um validador garanta.

O pacote foi feito para essa fronteira, onde a entrada pode ser hostil:

- **Um formato devolve o que o parser leu.** `email()` e `url()` produzem o valor que o parser de URL da plataforma lê. O valor que você guarda é o mesmo que uma requisição ou um servidor de e-mail vai usar.
- **O que uma entrada inválida reporta é limitado.** Uma lista longa de itens inválidos para em 1.000 problemas. Uma entrada aninhada fundo demais vira um problema só, não um estouro de pilha, desde que o limite de profundidade caiba na pilha.
- **Um problema nunca guarda um valor da entrada.** Um log de falhas não contém senhas, a menos que um `literal` ou um `oneOf` verifique uma: eles reportam os valores que aceitam, como diz [Primeiros passos](getting-started.md#valores-fixos). Um problema cita, sim, as chaves da entrada, no seu `path`.

O limite de 1.000 problemas restringe o relatório, não o trabalho: uma entrada que passa, ou que falha só perto do fim, ainda é verificada item por item, então uma entrada grande custa o seu tamanho. [Limites](limits.md) explica como limitar o tamanho e a profundidade dela.

## Instalação

```sh
pnpm add @codenhub/validation
```

O pacote é só ESM e não tem dependências. Os tipos precisam do TypeScript 5.0 ou mais recente. Tudo é importado pelo nome a partir de `@codenhub/validation`. O único outro export é `@codenhub/validation/package.json`, para ferramentas que leem a versão.

## Um primeiro validador

```ts
import { email, object, string } from "@codenhub/validation";

const signup = object({
  name: string({ trim: true, min: 2, max: 100 }),
  email: email(),
});

signup({ name: "  Ada ", email: "ada@example.com" }); // { ok: true, value: { name: "Ada", email: "ada@example.com" } }
signup({ name: "A", email: "nope" }); // { ok: false, ... }, code "too_small"
```

Estas páginas seguem um exemplo só: o cadastro de uma aplicação web. Ele começa aqui com dois campos. Cada página acrescenta o que ensina, como um formulário com confirmação de senha, o corpo JSON de uma requisição, a configuração do servidor e as mensagens que um usuário lê.

## Caminho de leitura

Leia as páginas nesta ordem para aprender o pacote do começo ao fim, ou vá direto à que você precisa:

1. [Primeiros passos](getting-started.md): o que é um validador, como ler o resultado dele e os validadores para strings, números, datas, valores fixos e objetos.
2. [Formulários](forms.md): regras entre campos, campos opcionais e valores padrão, erros por campo, arquivos e os tipos de um formulário.
3. [Corpos de requisição](request-bodies.md): texto JSON, listas e dicionários, uma escolha entre estruturas e dados recursivos.
4. [Entrada em texto](text-input.md): números, flags e datas que chegam como texto, de variáveis de ambiente, query strings e campos de formulário.
5. [Problemas e mensagens](errors.md): o que um resultado com falha contém, os códigos nativos e o texto que uma pessoa lê, em inglês, em português ou com as suas próprias palavras.
6. [Validadores personalizados](custom-validators.md): regras, formatos e tipos seus, regras assíncronas e como testá-los.
7. [Formatos](formats.md): cada formato nativo, como `email`, `url`, `ip` e `datetime`, o que cada um aceita e o que produz.
8. [Moldando valores](shaping-values.md): alterar um valor, escrevê-lo de volta, marcar o tipo dele, descrevê-lo e derivar um objeto de outro.
9. [Standard Schema](standard-schema.md): entregue um validador a qualquer biblioteca que aceite um Standard Schema.
10. [JSON Schema](json-schema.md): escreva um validador como JSON Schema e leia do que um validador é feito.
11. [Integrações](integrations.md): use um validador com react-hook-form, TanStack Form, tRPC, Hono, o AI SDK, o Model Context Protocol, OpenAPI, zod e valibot.
12. [Limites](limits.md): quanto custa uma entrada que pode ser hostil, os limites dos dados recursivos e como verificar se um schema tem os limites de que precisa.

Para consultar um export específico, use a [referência da API](../reference/index.md), gerada a partir do código-fonte. O [changelog](../changelog/index.md) lista cada release e as migrações entre elas.
