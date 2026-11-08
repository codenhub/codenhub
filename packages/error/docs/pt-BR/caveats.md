---
title: Ressalvas e limitações
description: O que o ErrorKit não faz, as surpresas que ele pode causar e como contornar cada uma.
source: 6f024af842dc897b5d6318419a12ba88efc3b6a1
order: 8
---

# Ressalvas e limitações

Tudo nesta página é proposital, e cada item dela já surpreendeu alguém pelo menos uma vez. Cada um diz o que acontece, por quê e o que fazer em vez disso. Passe os olhos pelos títulos agora; quando algo parecer errado mais tarde, a resposta provavelmente está aqui.

## Texto sem correspondência nunca vira a mensagem

**O que acontece:** `createAppError(new Error("Email is required"))` tem a mensagem `"An unexpected error occurred."`, e não `"Email is required"`. O mesmo vale para `err("Email is required")`.

**Por quê:** mensagens de erro cruas são escritas para desenvolvedores e muitas vezes trazem nomes de tabela, caminhos de arquivo, pedaços de query ou dados de outras pessoas. O ErrorKit só mostra texto que alguém registrou de propósito.

**Em vez disso:** lance as suas próprias falhas com um código registrado, `err({ code: "signup.email_missing" })`, ou passe um `fallbackMessage` que faça sentido no lugar em que você está.

## Um código que ninguém registrou se perde

**O que acontece:** `createAppError({ code: "project.name_missing" })` é um erro `"unknown"` com `code: null` até esse código ser registrado. Um erro de digitação no código, ou um mapeamento adicionado em um arquivo que nunca rodou, falha em silêncio.

**Por quê:** `code` nomeia o mapeamento que classificou o erro, então uma decisão baseada nele só enxerga códigos que alguém descreveu. Manter o código cru também mandaria para o cliente, no `toJSON()`, qualquer código que um banco de dados ou serviço produzisse.

**Em vez disso:** lance os seus próprios erros a partir de um único objeto de códigos, para que um erro de digitação vire erro de tipo, ou confira os códigos em um teste; veja [Receitas](recipes.md#lançar-os-seus-próprios-erros).

## O registro global é estado compartilhado

**O que acontece:** `getErrorRegistry()` devolve um registro por cópia do pacote, compartilhado por tudo o que importa essa cópia. No servidor, todas as requisições veem os mesmos mapeamentos.

**Por quê:** isso permite configurar os erros uma vez, na inicialização, e normalizar em qualquer lugar sem ficar passando um registro de mão em mão.

**Em vez disso:** configure o registro global uma vez, antes de tratar qualquer requisição, e nunca o altere por requisição; duas requisições simultâneas veriam as mudanças uma da outra. Para mapeamentos que só valem em um lugar, passe `{ registry }` naquela chamada. Nos testes, reinicie-o com `setErrorRegistry` (veja [Receitas](recipes.md#configurar-erros-nos-testes)).

## Duas cópias do pacote não se conhecem

**O que acontece:** se a sua aplicação acabar com duas cópias do `@codenhub/error`, como duas versões instaladas lado a lado, cada cópia tem o seu próprio registro global, e o `isAppError` de uma cópia devolve `false` para um erro criado pela outra.

**Por quê:** `isAppError` reconhece só erros que esta cópia criou, para que objetos com cara de `AppError`, incluindo os montados a partir de JSON não confiável, nunca sejam confundidos com um.

**Em vez disso:** mantenha uma versão só instalada. `pnpm why @codenhub/error` mostra de onde vem a segunda cópia. Um `AppError` de outra cópia continua sendo normalizado, como um objeto comum.

## O último mapeamento adicionado vence

**O que acontece:** registrar um identificador que já existe o substitui, e `merge` sobrescreve as entradas correspondentes. Fazer o merge do preset do Supabase depois do seu próprio mapeamento de `23505` troca o seu pelo do preset.

**Em vez disso:** faça o merge dos presets primeiro e adicione os seus mapeamentos por último. Quando duas origens usam os mesmos códigos para coisas diferentes, dê a cada uma o seu próprio registro; veja [Registros](registries.md#o-registro-global-ou-um-próprio).

## Nomes correspondem a qualquer erro com aquele nome

**O que acontece:** com o preset de navegador ou do Node.js no merge, qualquer erro cujo `name` seja `TimeoutError` é classificado como o daquele preset, incluindo erros de uma biblioteca que por acaso usa o mesmo nome de classe. O preset de navegador faz o mesmo com `NotFoundError` e os outros nomes dele.

**Em vez disso:** classifique os erros dessa biblioteca contra um registro sem o preset, ou registre um código mais específico para eles.

## Requisições canceladas também são erros

**O que acontece:** cancelar um `fetch` com um `AbortController` faz ele rejeitar com um `AbortError`, que o preset de navegador transforma em "The request was cancelled before it finished." (a requisição foi cancelada antes de terminar). Isso inclui os cancelamentos que o seu próprio código fez de propósito.

**Em vez disso:** confira se foi você que cancelou e, nesse caso, não mostre nada; veja [Receitas](recipes.md#ignorar-requisições-canceladas).

## Códigos de status HTTP não são erros para o `fetch`

**O que acontece:** um `fetch` que recebe um `404` ou um `500` resolve normalmente. Passar a `Response` para `createAppError` produz um erro `"unknown"`, porque uma resposta não tem código, nome nem mensagem para comparar.

**Em vez disso:** confira `response.ok` e classifique o status você mesmo; veja [Receitas](recipes.md#classificar-respostas-http).

## A comparação diferencia maiúsculas de minúsculas, exceto nos patterns

**O que acontece:** uma mensagem registrada como `"Upload failed"` não corresponde a `"upload failed"`. Códigos, nomes, mensagens e prefixos são todos comparados diferenciando maiúsculas de minúsculas.

**Em vez disso:** registre o texto exato que o código que falha produz, ou use um pattern com a flag `i`. Pontuação e espaços no final nunca importam para mensagens e prefixos.

## Erros embrulhados são procurados até uma profundidade limitada

**O que acontece:** `createAppError` procura três níveis abaixo nos campos de wrapper, e oito níveis ao longo de uma cadeia de `cause`. Ele lê só as dez primeiras entradas de uma lista `errors`. Uma falha enterrada mais fundo é tratada como se não estivesse lá.

**Por quê:** cada nível pode multiplicar o número de valores a inspecionar, e a entrada pode vir de qualquer lugar. Os limites mantêm o trabalho pequeno com qualquer entrada.

**Em vez disso:** normalize mais perto de onde a falha acontece, ou embrulhe as falhas com `cause`, que é seguido mais longe.

## Retryable é mais estreito que "pode dar certo da próxima vez"

**O que acontece:** um timeout de resposta, uma conexão resetada ou um `fetch` que falhou no navegador nunca são marcados como retryable, mesmo que tentar de novo muitas vezes funcione.

**Por quê:** cada um deles pode acontecer depois que o servidor já agiu sobre a requisição, e repetir uma requisição que já rodou pode cobrar um cartão duas vezes. `isRetryable` promete segurança, não probabilidade.

**Em vez disso:** repita esses casos por conta própria só onde repetir a requisição é inofensivo, como em um `GET`. Veja [O AppError](app-error.md#isretryable).

## Os presets não cobrem tudo

- O preset de navegador reconhece um `fetch` e um `import()` que falharam pelas mensagens que o Chromium, o Firefox e o Safari produzem hoje. Um navegador que reescrever essas mensagens cai em `"unknown"` até o preset alcançá-lo.
- O preset do Node.js cobre falhas de rede e os erros que um `AbortSignal` lança, e foi observado no Node.js 24. Outros runtimes de servidor podem reportar as mesmas falhas de outro jeito.
- O preset do Supabase cobre os códigos de Auth sobre os quais uma pessoa pode agir, seis códigos do PostgreSQL e os nomes de erro do próprio cliente. Ele mapeia as poucas falhas de desenvolvedor que uma aplicação em produção costuma encontrar, como uma tabela ou coluna inexistente, para uma mensagem compartilhada, então elas são `"known"`: reporte-as pelo `messageKey`, não pelo tipo (veja [Receitas](recipes.md#reportar-para-um-error-tracker)). Outros códigos que só um desenvolvedor consegue resolver, como `bad_jwt`, ficam sem mapeamento de propósito e chegam ao seu error tracker como `"unknown"`.

Registre o seu próprio mapeamento para qualquer coisa que um preset não cubra. [Presets](presets.md) lista exatamente o que cada um cobre.

## O pacote não vem com traduções

Todo mapeamento de preset tem um `messageKey` estável, mas o ErrorKit inclui só as mensagens em inglês. Traduza as chaves no seu próprio catálogo; veja [Receitas](recipes.md#traduzir-mensagens).

## Structured clone perde os campos

**O que acontece:** mandar um `AppError` por `postMessage`, `structuredClone` ou IndexedDB entrega ao outro lado um `Error` simples sem `type`, `code` e os outros campos, e em algumas engines com o `cause` cru anexado.

**Em vez disso:** mande `error.toJSON()` e reconstrua-o com `appErrorFromJSON` do outro lado; veja [O AppError](app-error.md#mandando-um-erro-para-o-outro-lado).

## Patterns que você escreve podem ser lentos

Um pattern roda contra toda mensagem que `createAppError` vê, e uma mensagem pode ser montada por alguém tentando deixar o seu servidor lento. Um pattern com repetição aninhada, como `/(a+)+$/`, pode levar segundos com a entrada errada. Mantenha os patterns personalizados ancorados e simples; veja [Registros](registries.md#escrevendo-patterns). Os patterns nativos são todos ancorados, sem repetição aninhada.

## Próximos passos

Isso é o pacote inteiro. Daqui:

- A [referência da API](../reference/index.md) (em inglês) tem todos os exports com a assinatura exata, para quando você precisar consultar algo.
- [Receitas](recipes.md) tem as soluções completas, para quando você precisar construir algo.
- A [visão geral](index.md) tem o caminho de leitura, para quando você mandar isto para um colega.
