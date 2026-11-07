---
title: Presets
description: Todas as falhas que os presets de navegador, Node.js, HTTP e Supabase reconhecem, com a chave de tradução de cada uma, e o que cada preset deixa de fora.
source: f0ccf3a11cfa15fc079750d8ea0e0fb24e8244cf
order: 4
---

# Presets

Um preset é um registro pronto e somente leitura para falhas que vêm de uma plataforma ou de um serviço, e não do seu próprio código. Alguém já leu as listas de erros do navegador, do Node.js, do HTTP e do Supabase para que você não precise; esta página é o que essa pessoa encontrou.

Há quatro presets. Cada um é um import separado, então uma aplicação só carrega os que usa, e importar um não muda nada até você fazer o merge dele:

```ts
import { getErrorRegistry } from "@codenhub/error";
import { browserErrorRegistry } from "@codenhub/error/registries/browser";

getErrorRegistry().merge(browserErrorRegistry);
```

Cada preset também exporta os seus mapeamentos crus, congelados, para quando você quiser montar algo seu a partir de parte de um preset. Os mapeamentos de código e de nome são objetos simples indexados pelo identificador; os mapeamentos de pattern são listas de pares `[pattern, feedback]`:

| Caminho de import                     | Registro                | Mapeamentos crus                                        |
| ------------------------------------- | ----------------------- | ------------------------------------------------------- |
| `@codenhub/error/registries/browser`  | `browserErrorRegistry`  | `browserErrorNames`, `browserErrorPatterns`             |
| `@codenhub/error/registries/node`     | `nodeErrorRegistry`     | `nodeErrorCodes`, `nodeErrorNames`, `nodeErrorPatterns` |
| `@codenhub/error/registries/http`     | `httpErrorRegistry`     | `httpErrorCodes`                                        |
| `@codenhub/error/registries/supabase` | `supabaseErrorRegistry` | `supabaseErrorCodes`, `supabaseErrorNames`              |
| `@codenhub/error/registries`          | Os quatro               | Os oito                                                 |

## Como as mensagens são escritas

Toda mensagem de preset diz o que aconteceu e o que a pessoa pode fazer em seguida, em palavras simples, e afirma só o que o identificador reconhecido prova. Nenhuma delas supõe que a sua aplicação tenha uma página de redefinição de senha, um chat de suporte ou qualquer outro recurso. Onde a pessoa não pode fazer mais nada, a mensagem diz para entrar em contato com o suporte sem dizer como, porque o preset não faz ideia se o seu suporte é um widget de chat ou uma única pessoa muito paciente.

Falhas que só um desenvolvedor consegue resolver, como uma tabela ou coluna que não existe, compartilham uma mensagem que diz que o problema não é culpa da pessoa e não cita nenhum detalhe interno:

> Something went wrong on our side, and it isn't caused by anything you did. Contact support if it keeps happening.

Ou seja: algo deu errado do nosso lado, não foi nada que você fez, e se continuar acontecendo, fale com o suporte. As mensagens dos presets vêm só em inglês; por isso a citação acima está no original. Os detalhes ficam em `originalError`, para os seus logs.

Quando a sua aplicação tiver algo mais útil a dizer, registre o seu próprio mapeamento para o mesmo identificador depois de fazer o merge do preset. O último vence, como [Primeiros passos](getting-started.md#2-crie-um-módulo-que-configura-os-erros) faz com o `23505`.

Todo mapeamento tem um `messageKey`. As chaves são estáveis, e cada chave carrega sempre a mesma mensagem, então um catálogo de traduções pode confiar nelas. Vários identificadores compartilham uma chave quando significam a mesma coisa para quem lê: o Supabase tem quatro códigos diferentes para "a sua sessão terminou", e a pessoa só precisa ouvir isso uma vez. O ErrorKit não vem com traduções; veja [Receitas](recipes.md#traduzir-mensagens).

As tabelas abaixo listam todos os mapeamentos, então dá para montar um catálogo direto desta página.

## Navegador

Para código que roda no navegador. Ele reconhece os nomes de `DOMException` que as Web APIs levantam, um `fetch` que falhou e um chunk de code splitting que não carregou.

| Nome                 | `messageKey`                         | Pode repetir |
| -------------------- | ------------------------------------ | ------------ |
| `AbortError`         | `error.browser.abort`                | Não          |
| `QuotaExceededError` | `error.browser.storageQuotaExceeded` | Não          |
| `NotAllowedError`    | `error.browser.permissionDenied`     | Não          |
| `NotFoundError`      | `error.browser.notFound`             | Não          |
| `SecurityError`      | `error.browser.security`             | Não          |
| `TimeoutError`       | `error.browser.timeout`              | Não          |
| `NotSupportedError`  | `error.browser.notSupported`         | Não          |
| `InvalidStateError`  | `error.browser.invalidState`         | Não          |
| `NetworkError`       | `error.browser.network`              | Não          |
| `NotReadableError`   | `error.browser.notReadable`          | Não          |
| `EncodingError`      | `error.browser.encoding`             | Não          |
| `ChunkLoadError`     | `error.browser.moduleLoadFailed`     | Não          |

Os patterns dele só correspondem a mensagens inteiras, então um texto que apenas contém as mesmas palavras não é classificado:

| Mensagem                                                                                                                                                                                      | `messageKey`                     | Pode repetir |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | ------------ |
| Um `fetch` que falhou: `Failed to fetch` (Chromium), `NetworkError when attempting to fetch resource.` (Firefox), `Load failed` (Safari)                                                      | `error.browser.requestFailed`    | Não          |
| Um `import()` que falhou: `Failed to fetch dynamically imported module: …` (Chromium), `error loading dynamically imported module: …` (Firefox), `Importing a module script failed.` (Safari) | `error.browser.moduleLoadFailed` | Não          |

Observações:

- **Nada pode ser repetido.** Um `fetch` que falhou parece igual tanto quando a conexão nunca abriu quanto quando a resposta se perdeu depois que o servidor já agiu sobre a requisição, como acontece num bloqueio de CORS ou numa conexão que caiu. Um `TimeoutError` de `AbortSignal.timeout()` pode disparar depois que o servidor recebeu a requisição. As mensagens pedem que a pessoa confira se a ação foi feita antes de tentar de novo.
- **Um chunk que falhou geralmente é uma aba que ficou aberta durante um deploy**: a página pede um arquivo que o deploy novo removeu. A mensagem diz para a pessoa recarregar a página. Sempre tem alguém com aquela aba aberta desde o deploy de sexta-feira passada. `ChunkLoadError` é o que o webpack lança; o Vite e outros bundlers que usam o `import()` nativo produzem a mensagem do navegador.
- **`AbortError` muitas vezes é proposital.** Ele também dispara quando o seu próprio código cancela uma requisição, como no cleanup de um effect ou quando uma busca mais nova substitui uma mais antiga. Veja [Ressalvas](caveats.md#requisições-canceladas-também-são-erros).

## Node.js

Para código de servidor. Ele reconhece falhas de rede de sockets, de consultas DNS e do `fetch` nativo, que coloca a falha de verdade no `cause` do seu `TypeError: fetch failed`, e os erros que um `AbortSignal` levanta.

| Código                    | `messageKey`                             | Pode repetir |
| ------------------------- | ---------------------------------------- | ------------ |
| `ECONNREFUSED`            | `error.node.network.connectionRefused`   | Sim          |
| `ENOTFOUND`               | `error.node.network.addressNotFound`     | Sim          |
| `UND_ERR_CONNECT_TIMEOUT` | `error.node.network.connectionTimeout`   | Sim          |
| `EAI_AGAIN`               | `error.node.network.addressLookupFailed` | Sim          |
| `EHOSTUNREACH`            | `error.node.network.unreachable`         | Sim          |
| `ENETUNREACH`             | `error.node.network.unreachable`         | Sim          |
| `ECONNRESET`              | `error.node.network.connectionReset`     | Não          |
| `UND_ERR_SOCKET`          | `error.node.network.connectionClosed`    | Não          |
| `EPIPE`                   | `error.node.network.connectionClosed`    | Não          |
| `ETIMEDOUT`               | `error.node.network.responseTimeout`     | Não          |
| `UND_ERR_HEADERS_TIMEOUT` | `error.node.network.responseTimeout`     | Não          |
| `UND_ERR_BODY_TIMEOUT`    | `error.node.network.responseTimeout`     | Não          |

| Nome           | `messageKey`                         | Pode repetir |
| -------------- | ------------------------------------ | ------------ |
| `TimeoutError` | `error.node.network.responseTimeout` | Não          |
| `AbortError`   | `error.node.abort`                   | Não          |

| Mensagem                                   | `messageKey`                       | Pode repetir |
| ------------------------------------------ | ---------------------------------- | ------------ |
| `fetch failed`, sem nenhum cause conhecido | `error.node.network.requestFailed` | Não          |

Observações:

- **As mensagens falam de "um serviço do qual isto depende".** No servidor, a chamada que falha é o seu servidor chamando outra coisa, então quem lê a mensagem não é quem teve a conexão com problema, e as mensagens não pedem que essa pessoa confira a conexão dela.
- **Só falhas antes de a conexão ser feita podem ser repetidas**: conexão recusada, um endereço que não foi resolvido, um host inalcançável, um timeout de conexão. Um reset, um socket fechado ou um timeout de resposta podem vir depois de uma requisição sobre a qual o outro lado já agiu. `ETIMEDOUT` também não pode ser repetido, porque o Node.js o levanta tanto em uma tentativa de conexão quanto em um socket que já levou a requisição.
- **Fora da cobertura:** códigos de sistema de arquivos como `ENOENT`, porque a mensagem certa depende do que a aplicação estava fazendo, e códigos de certificado TLS, que só quem opera o sistema consegue resolver.
- **`TimeoutError` e `AbortError` também são nomes do preset de navegador.** Eles são os nomes de `DOMException` que um `AbortSignal` levanta, como em `fetch(url, { signal: AbortSignal.timeout(5000) })`. Código de servidor deve usar este preset para eles: a mensagem de `TimeoutError` do preset de navegador pede para a pessoa conferir a conexão com a internet. Quando você faz o merge dos dois, vence o último.
- Os códigos foram observados no Node.js 24. Outros runtimes de servidor, como Deno ou Bun, podem reportar falhas de rede de outro jeito.

## HTTP

Para o status de uma resposta que falhou. O `fetch` resolve normalmente com um `404` ou um `500`, porque, até onde o `fetch` sabe, a requisição correu bem, então um status não é algo que `createAppError` encontre sozinho. Passe o status como `code`, e passe este preset como `registry` daquela chamada em vez de fazer o merge dele no global. Status são números curtos que só significam algo para uma resposta, e poderiam colidir com os códigos de outro serviço.

```ts
import { err } from "@codenhub/error";
import { httpErrorRegistry } from "@codenhub/error/registries/http";

if (!response.ok) {
  return err({ code: response.status }, { registry: httpErrorRegistry });
}
```

| Código | `messageKey`                 | Pode repetir |
| ------ | ---------------------------- | ------------ |
| `400`  | `error.http.badRequest`      | Não          |
| `401`  | `error.http.unauthorized`    | Não          |
| `403`  | `error.http.forbidden`       | Não          |
| `404`  | `error.http.notFound`        | Não          |
| `409`  | `error.http.conflict`        | Não          |
| `413`  | `error.http.payloadTooLarge` | Não          |
| `422`  | `error.http.unprocessable`   | Não          |
| `429`  | `error.http.rateLimited`     | Não          |
| `500`  | `error.http.serverError`     | Não          |
| `502`  | `error.http.badGateway`      | Não          |
| `503`  | `error.http.unavailable`     | Não          |
| `504`  | `error.http.gatewayTimeout`  | Não          |

Observações:

- **Nada pode ser repetido.** Um status é a resposta do servidor, então a requisição chegou até ele; até um `503` ou um `504` pode vir depois de uma requisição sobre a qual o servidor, ou um serviço por trás dele, já agiu. Um `429` precisa de uma espera que a flag não consegue expressar.
- **As mensagens são genéricas.** Um `401` em um formulário de login quer dizer senha errada, e um `404` em uma busca quer dizer nenhum resultado. Onde um status significar algo específico, registre o seu próprio mapeamento para aquela chamada, em um registro só dela.
- **`500` usa a mensagem compartilhada de falha de desenvolvedor**, e deveria chegar ao seu error tracker; veja [Receitas](recipes.md#reportar-para-um-error-tracker).
- **Fora da cobertura:** status `1xx`, `2xx` e `3xx`, que não são falhas, e os status `4xx` e `5xx` mais raros. Eles resultam em `"unknown"`.
- **Quando o seu servidor manda `error.toJSON()`**, reconstrua esse erro com `appErrorFromJSON`; ele diz mais que o status.

## Supabase

Para código que chama o Supabase. Ele reconhece os códigos de erro do Supabase Auth com que uma pessoa usando a sua aplicação pode esbarrar e sobre os quais pode fazer algo, alguns códigos de erro do PostgreSQL e os nomes de erro que o cliente do Supabase levanta.

Códigos do Supabase Auth:

| Código                              | `messageKey`                                         | Pode repetir |
| ----------------------------------- | ---------------------------------------------------- | ------------ |
| `invalid_credentials`               | `error.supabase.auth.invalidCredentials`             | Não          |
| `email_not_confirmed`               | `error.supabase.auth.emailNotConfirmed`              | Não          |
| `phone_not_confirmed`               | `error.supabase.auth.phoneNotConfirmed`              | Não          |
| `user_already_exists`               | `error.supabase.auth.userAlreadyExists`              | Não          |
| `email_exists`                      | `error.supabase.auth.emailExists`                    | Não          |
| `phone_exists`                      | `error.supabase.auth.phoneExists`                    | Não          |
| `signup_disabled`                   | `error.supabase.auth.signupDisabled`                 | Não          |
| `provider_disabled`                 | `error.supabase.auth.methodUnavailable`              | Não          |
| `email_provider_disabled`           | `error.supabase.auth.methodUnavailable`              | Não          |
| `phone_provider_disabled`           | `error.supabase.auth.methodUnavailable`              | Não          |
| `otp_disabled`                      | `error.supabase.auth.methodUnavailable`              | Não          |
| `provider_email_needs_verification` | `error.supabase.auth.providerEmailNeedsVerification` | Não          |
| `otp_expired`                       | `error.supabase.auth.otpExpired`                     | Não          |
| `invite_not_found`                  | `error.supabase.auth.inviteNotFound`                 | Não          |
| `weak_password`                     | `error.supabase.auth.weakPassword`                   | Não          |
| `same_password`                     | `error.supabase.auth.samePassword`                   | Não          |
| `email_address_invalid`             | `error.supabase.auth.emailAddressInvalid`            | Não          |
| `validation_failed`                 | `error.supabase.auth.validationFailed`               | Não          |
| `captcha_failed`                    | `error.supabase.auth.captchaFailed`                  | Não          |
| `user_banned`                       | `error.supabase.auth.userBanned`                     | Não          |
| `user_not_found`                    | `error.supabase.auth.userNotFound`                   | Não          |
| `session_expired`                   | `error.supabase.auth.sessionEnded`                   | Não          |
| `session_not_found`                 | `error.supabase.auth.sessionEnded`                   | Não          |
| `refresh_token_not_found`           | `error.supabase.auth.sessionEnded`                   | Não          |
| `refresh_token_already_used`        | `error.supabase.auth.sessionEnded`                   | Não          |
| `reauthentication_needed`           | `error.supabase.auth.reauthenticationNeeded`         | Não          |
| `reauthentication_not_valid`        | `error.supabase.auth.reauthenticationNotValid`       | Não          |
| `mfa_verification_failed`           | `error.supabase.auth.mfaVerificationFailed`          | Não          |
| `mfa_challenge_expired`             | `error.supabase.auth.mfaChallengeExpired`            | Não          |
| `insufficient_aal`                  | `error.supabase.auth.insufficientAal`                | Não          |
| `flow_state_expired`                | `error.supabase.auth.signInInterrupted`              | Não          |
| `flow_state_not_found`              | `error.supabase.auth.signInInterrupted`              | Não          |
| `bad_oauth_callback`                | `error.supabase.auth.signInInterrupted`              | Não          |
| `pkce_code_verifier_not_found`      | `error.supabase.auth.signInInterrupted`              | Não          |
| `bad_oauth_state`                   | `error.supabase.auth.badOAuthState`                  | Não          |
| `sms_send_failed`                   | `error.supabase.auth.smsSendFailed`                  | Não          |
| `over_sms_send_rate_limit`          | `error.supabase.auth.overSmsSendRateLimit`           | Não          |
| `over_email_send_rate_limit`        | `error.supabase.auth.overEmailSendRateLimit`         | Não          |
| `over_request_rate_limit`           | `error.supabase.auth.overRequestRateLimit`           | Não          |
| `request_timeout`                   | `error.supabase.auth.requestTimeout`                 | Não          |
| `unexpected_failure`                | `error.supabase.auth.unexpectedFailure`              | Não          |

Códigos do PostgreSQL, como a API de banco de dados do Supabase os devolve:

| Código  | Significado                                  | `messageKey`                                  | Pode repetir |
| ------- | -------------------------------------------- | --------------------------------------------- | ------------ |
| `23502` | Falta um valor obrigatório                   | `error.supabase.database.notNullViolation`    | Não          |
| `23503` | Dados vinculados não existem ou estão em uso | `error.supabase.database.foreignKeyViolation` | Não          |
| `23505` | Um valor único já está em uso                | `error.supabase.database.uniqueViolation`     | Não          |
| `42P01` | Uma tabela não existe                        | `error.supabase.database.undefinedTable`      | Não          |
| `42703` | Uma coluna não existe                        | `error.supabase.database.undefinedColumn`     | Não          |
| `57014` | Uma consulta demorou demais                  | `error.supabase.database.timeout`             | Não          |

Nomes de erro levantados pelo cliente do Supabase:

| Nome                      | `messageKey`                       | Pode repetir |
| ------------------------- | ---------------------------------- | ------------ |
| `AuthSessionMissingError` | `error.supabase.auth.sessionEnded` | Não          |
| `FunctionsHttpError`      | `error.supabase.functions.http`    | Não          |
| `FunctionsRelayError`     | `error.supabase.functions.relay`   | Não          |
| `FunctionsFetchError`     | `error.supabase.functions.fetch`   | Não          |

Observações:

- **Nada pode ser repetido.** Erros de rate limit precisam de uma espera que a flag não consegue expressar, então tentar de novo na hora só conta contra o limite outra vez; as mensagens deles dizem quanto tempo esperar. Erros de Edge Functions chegam depois que a função pode já ter rodado.
- **`AuthSessionMissingError` não tem código.** É o que a maioria das chamadas de Auth devolve quando ninguém está logado, e ele é classificado como sessão encerrada. `pkce_code_verifier_not_found` é levantado pelo próprio cliente, quando um link de login é aberto em um navegador diferente do que o pediu.
- **Fora da cobertura:** códigos de Auth que só um desenvolvedor consegue resolver, como `bad_jwt` e as famílias `hook_*` e `saml_*`. Eles resultam em `"unknown"`, que é exatamente o que você quer ver reportado.
- **`23505` é genérico de propósito.** "Um valor único já está em uso" não tem como dizer qual valor. Registre o seu próprio mapeamento de `23505` onde você souber, como o gerenciador de projetos faz em [Primeiros passos](getting-started.md#2-crie-um-módulo-que-configura-os-erros), ou classifique os erros de uma tabela específica contra um registro só dela.

## Próximos passos

Presets e os seus próprios mapeamentos cobrem o que uma falha significa. [Resultados](results.md) cobre outra questão: como uma falha viaja pelo seu código, como um valor no tipo de retorno em vez de uma exceção que alguém precisa lembrar de capturar.
