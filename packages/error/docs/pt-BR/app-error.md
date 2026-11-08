---
title: O AppError
description: Cada campo de um AppError, o que cada um promete, o que acontece quando um erro é normalizado duas vezes e como mandar um do servidor para o cliente.
source: 83b4d999bed4707094de09d64ba758717d21775c
order: 2
---

# O AppError

Tudo neste pacote termina em um `AppError`. Esta página passa pelos campos dele, pelas regras que o mantêm estável enquanto ele atravessa as camadas do seu código e por como mandá-lo por uma rede ou para um worker. Se for ler só uma página com atenção, que seja esta, e vá com calma no `isRetryable`.

## Os campos

Este é o erro que o gerenciador de projetos recebe quando alguém tenta entrar com a senha errada:

```ts
const error = createAppError({ code: "invalid_credentials" }, { registry: supabaseErrorRegistry });

error.name; // "AppError"
error.message; // "We couldn't sign you in. The email or password is incorrect. Check them and try again."
error.type; // "known"
error.code; // "invalid_credentials"
error.messageKey; // "error.supabase.auth.invalidCredentials"
error.source; // "supabase.auth"
error.isRetryable; // false
error.details; // null
error.originalError; // { code: "invalid_credentials" }
```

A mensagem acima está em inglês porque é a que o preset traz: o pacote vem só com mensagens em inglês.

`AppError` é exportado como tipo. Você nunca constrói um por conta própria; as próximas seções dizem de onde eles vêm.

### `message`

Texto seguro para mostrar à pessoa que está usando a aplicação. É a mensagem do mapeamento que correspondeu, ou a mensagem de fallback quando nada correspondeu. Nunca é a mensagem crua do valor que você passou.

### `type`

Como o erro foi reconhecido, tipado como `AppErrorType`:

- `"known"`: um código, nome, mensagem exata ou prefixo correspondeu.
- `"heuristic"`: só uma expressão regular correspondeu.
- `"unknown"`: nada correspondeu.

Ele não diz nada sobre gravidade. Uma tabela inexistente é `"known"` assim que o código dela é registrado, e um usuário offline é `"heuristic"` porque os navegadores só informam isso na mensagem.

### `code`

O identificador que classificou o erro, para decidir o que fazer com uma falha específica:

```ts
if (error.code === "email_not_confirmed") {
  redirectTo("/confirm-email");
}
```

Ele guarda o código registrado que correspondeu, ou o nome registrado quando foi um nome que correspondeu. Uma correspondência por mensagem, prefixo ou pattern não tem código, então `code` é `null` nesses casos, e também em erros desconhecidos.

Quando a mesma falha pode chegar por mais de um caminho, decida pelo `messageKey`. O caso clássico é um chunk de code splitting desatualizado. O webpack o reporta por nome, então `code` é `"ChunkLoadError"`. Um navegador reporta um `import()` que falhou só na mensagem, então `code` é `null`. Os dois resultam em `messageKey: "error.browser.moduleLoadFailed"`.

### `messageKey`

Uma chave de tradução do mapeamento que correspondeu, ou `null`. Os presets nativos dão uma a todo mapeamento, e as chaves são estáveis: uma chave mantém o significado entre versões mesmo quando a mensagem em inglês é reescrita. O ErrorKit não vem com traduções; [Receitas](recipes.md#traduzir-mensagens) mostra como plugar as suas.

### `source`

Um rótulo para a origem da falha, tipado como `AppErrorSource`: `"supabase.auth"`, `"browser.network"` ou o que você registrar nos seus próprios mapeamentos. É `null` quando o mapeamento não tem um ou quando nada correspondeu. Ajuda a agrupar em logs e dashboards, para que o gráfico das três da manhã diga "supabase.auth" em vez de "erros, de modo geral".

### `isRetryable`

Se a chamada que falhou pode ser repetida do jeito que está, sem pedir nada à pessoa e sem o risco de rodar duas vezes. É `false`, a não ser que o mapeamento que correspondeu diga o contrário.

A flag é rígida de propósito. Uma falha que pode ter acontecido depois que o servidor recebeu a requisição não é retryable, por mais provável que seja a segunda tentativa dar certo, porque repeti-la poderia cobrar um cartão duas vezes ou mandar um e-mail duas vezes. Nos presets nativos, só são retryable as falhas que acontecem antes de uma conexão ser feita, como `ECONNREFUSED` no preset do Node.js.

Duas consequências passam batido com facilidade:

- **A flag descreve a chamada que falhou, que pode estar vários wrappers abaixo.** Digamos que uma função `publish()` faz upload de um arquivo e depois falha ao salvar um registro com `ECONNREFUSED`. O erro é retryable, mas isso vale para o salvamento, não para `publish()`: repetir `publish()` faz o upload do arquivo de novo. Use a flag para tentar de novo só onde o seu código fez a chamada que falhou.
- **A flag é sobre um erro que o seu próprio runtime lançou.** Um servidor que repassa a falha de um serviço do qual depende como `{ "code": "ECONNREFUSED" }` no corpo da resposta corresponde ao mesmo mapeamento, mas aquela requisição chegou, sim, ao servidor. Classifique corpos de resposta contra um registro que tenha os códigos daquele serviço e nenhum preset de rede, como faz o registro de cobrança em [Registros](registries.md#o-registro-global-ou-um-próprio).

### `details`

Dados que o seu código anexou de propósito, como o campo do formulário que falhou, ou `null`. Passe-os com a opção `details` de `createAppError`, `err`, `attempt` ou `attemptAsync`:

```ts
getErrorRegistry().codes.add("project.name_missing", { message: "Dê um nome ao projeto e salve de novo." });

const result = err({ code: "project.name_missing" }, { details: { field: "name" } });

result.error.details; // { field: "name" }
```

A opção precisa ser um objeto simples, e as regras do que ela pode guardar são:

- **Só valores JSON:** strings, números finitos, booleanos, `null`, listas e objetos simples, aninhados em até oito níveis.
- **Chaves `undefined` são descartadas,** como o `JSON.stringify` faz, então você não precisa checar antes um campo opcional.
- **Qualquer outra coisa lança `TypeError`,** como um `Date` ou uma entrada `undefined` em uma lista.
- **Ele é copiado e congelado,** então mudar depois o objeto que você passou não muda nada.

Diferente do erro cru, `details` faz parte do `toJSON()`, então chega ao cliente. Ele nunca é lido do valor cru que está sendo normalizado, só da opção e de um `AppError` que o seu código já criou, então nada entra ali que o seu código não tenha colocado. Mantenha qualquer segredo fora dele.

Quando um erro passa por várias camadas, cada uma pode acrescentar chaves, e um `AppError` embrulhado dentro do valor traz os próprios `details` junto. Uma chave que o erro já tem mantém o valor, então uma camada de fora nunca sobrescreve o que uma de dentro registrou.

### `originalError` e `cause`

O valor que você passou para `createAppError`, intacto, para logs e depuração. Ele também é o `cause` padrão do erro, então error trackers e o `console.error` do Node.js o mostram sem trabalho extra. Ele não é enumerável e fica de fora do `JSON.stringify`, para que detalhes crus não vazem em uma resposta por acidente.

## Um AppError não pode ser alterado

Nenhum dos campos próprios de um `AppError` pode ser alterado ou removido, e tentar lança exceção em strict mode. A `stack` é a única exceção: ela descreve onde o erro foi criado, não o que ele significa, e bibliotecas que relançam um erro que capturaram chamam `Error.captureStackTrace` nele, o que lançaria exceção em uma stack travada.

O erro continua aberto a propriedades novas, porém, porque alguns frameworks acrescentam as suas a todo erro que capturam: o Koa define `status`, e o `Boom.boomify` do hapi define `isBoom`. Um erro totalmente congelado faria esses frameworks lançarem exceção dentro do próprio error handler, o que é um tratador de erros com erro, e ninguém quer depurar isso.

`createAppError` e `appErrorFromJSON` são as únicas formas de criar um. Use `isAppError(value)` para checar se algo é um. Ele reconhece só erros criados por esta cópia do pacote, não objetos que só se parecem com um, então um `{ name: "AppError", … }` escrito à mão não passa.

## Normalizando duas vezes

Muitas vezes o código passa um erro por várias camadas, e cada camada pode chamar `createAppError` de novo. A regra é que a primeira camada a classificar uma falha mantém o texto dela:

```ts
const first = createAppError(caught, { registry: billingRegistry });
const again = createAppError(first, { fallbackMessage: "O checkout falhou." });

again === first; // true, quando billingRegistry reconheceu `caught`
```

O que você recebe de volta depende das opções que passa junto com o `AppError`:

- **Sem opções:** o mesmo objeto.
- **`maxDepth`:** o mesmo objeto. A profundidade só importa quando há algo para vasculhar, e nada é vasculhado de novo sem um `registry`.
- **`fallbackMessage`:** o mesmo objeto, com uma exceção. Um erro `"unknown"` que ainda tem a mensagem padrão vira um novo `AppError` com o texto do seu fallback, porque nenhuma camada antes da sua escolheu texto nenhum. Depois que uma camada escolheu, a mensagem fica.
- **`details`:** um novo `AppError` com a mesma classificação, quando os seus details acrescentam chaves que ele não tem. Chaves que ele já tem mantêm os valores.
- **`registry`:** o único jeito de mudar a classificação, explicado mais abaixo.

A exceção do `fallbackMessage` é o que permite a uma camada de fora dar texto a uma falha que a de dentro deixou genérica:

```ts
const inner = await attemptAsync(() => db.loadProject(id)); // sem fallback aqui
const outer = await attemptAsync(() => unwrap(inner), { fallbackMessage: "Não foi possível carregar o projeto." });

outer.ok || outer.error.message; // "Não foi possível carregar o projeto."
```

Passar um `registry` é o único jeito de mudar a classificação. Aí o valor cru que está dentro é classificado de novo, e o resultado só pode melhorar:

- Uma correspondência por pattern substitui um erro `"unknown"`.
- Uma correspondência conhecida substitui qualquer coisa da qual ela seja diferente.
- Todo o resto mantém a classificação que já tem.

Um `AppError` embrulhado dentro de outro erro, como em `new Error("checkout failed", { cause: appError })`, é um candidato entre os valores que o `createAppError` encontra. A classificação dele é usada como está, a não ser que você passe um `registry`, mas uma correspondência conhecida em um embrulho de fora ainda pode vencer, porque vence a correspondência conhecida mais de fora.

## Mandando um erro para o outro lado

Um `AppError` é serializado em exatamente oito campos, em qualquer engine JavaScript:

```ts
JSON.stringify(error);
// {"name":"AppError","message":"…","type":"known","code":"23505","messageKey":"…","source":"…","isRetryable":false,"details":null}
```

`originalError` e `cause` ficam de fora de propósito: eles podem guardar segredos, dados pessoais ou objetos cíclicos.

Do lado que recebe, `appErrorFromJSON` reconstrói um `AppError` a partir desse formato:

```ts
// Servidor
return Response.json({ error: error.toJSON() }, { status: 409 });

// Cliente
const body = await response.json();
const error = appErrorFromJSON(body.error);
```

Valem três regras:

- **Ele não consulta nenhum registro.** O erro reconstruído traz a mensagem que quem enviou escolheu, então use-o só com dados de uma origem em que você confia para escrever os seus erros, como o seu próprio servidor.
- **`isRetryable` sempre volta `false` para dados serializados.** A flag de quem enviou descrevia a chamada de quem enviou, não a requisição que trouxe o erro de volta. Um `AppError` passado direto é devolvido como está.
- **Qualquer coisa que não seja exatamente o formato serializado** é normalizada como entrada crua, como `createAppError` faria.

Para passar um erro para um worker, por `postMessage`, `structuredClone` ou IndexedDB, mande `error.toJSON()` também. Um structured clone copia um `AppError` como um `Error` simples sem os campos dele, e em algumas engines leva junto o `cause` cru.

## Opções

`createAppError(error, options)` aceita um objeto `AppErrorOptions`:

| Opção             | Padrão                            | Efeito                                                                   |
| ----------------- | --------------------------------- | ------------------------------------------------------------------------ |
| `fallbackMessage` | `"An unexpected error occurred."` | A mensagem quando nada corresponde. Precisa ser uma string não vazia.    |
| `registry`        | O registro global                 | Onde procurar correspondências. Veja [Registros](registries.md).         |
| `maxDepth`        | `3`                               | Até que profundidade procurar dentro de erros embrulhados, de `0` a `3`. |
| `details`         | Nenhum                            | Dados para anexar como `details`. Veja [`details`](#details).            |

Na profundidade padrão, uma cadeia de `cause` sozinha é seguida mais longe, até a profundidade `8`, porque uma falha embrulhada uma vez por camada da aplicação muitas vezes fica mais funda que três. Um `maxDepth` menor interrompe todos os campos, incluindo `cause`, nessa profundidade.

A mensagem padrão é exportada como `DEFAULT_APP_ERROR_MESSAGE`, para testes e para comparar.

Uma opção inválida é um erro de programação, então lança `TypeError` antes de qualquer trabalho começar. Entrada comum nunca lança: `createAppError` aceita qualquer valor, incluindo `null`, números e objetos cujas propriedades lançam exceção quando lidas. Normalizar um erro não deveria ser um jeito novo de falhar. A única exceção é um registro que você escreveu à mão e que devolve feedback sem mensagem; veja [Registros](registries.md#combinando-e-congelando).

## Próximos passos

Você sabe o que um `AppError` carrega. [Registros](registries.md) explica de onde vêm a mensagem, a chave e a flag dele: como um registro é preenchido, como `createAppError` o vasculha e qual correspondência vence quando várias poderiam.
