---
title: Solução de problemas
description: O que cada erro e aviso quer dizer, e como resolver.
order: 5
source: 18b05ed5ec3b2b03bb2a6e3c174bfdd4a2ce31ed
---

# Solução de problemas

Algo saiu do trilho. Cada seção parte do que você vê na tela ou no console e depois dá a causa e o conserto, para você pular direto para o seu sintoma. Os exemplos usam as chaves e os locales da loja de chá das páginas anteriores.

Toda mensagem que o pacote escreve começa com `[I18n]`, o que a torna fácil de achar num console cheio de avisos dos outros.

## Uma chave aparece na tela em vez do texto

Você vê `home.subtitle` onde devia haver texto, e o console diz `[I18n] Missing key "home.subtitle" in locale "pt".`

Nem o idioma atual nem o idioma padrão têm essa chave. Confira:

- Se há um erro de digitação na chave ou no dicionário.
- Se o arquivo de dicionário que você editou é o que o seu loader devolve.
- Num grupo de plural, se `count` está lá e é um número. Um grupo de plural mostra a chave quando `count` falta ou não é um número: `t("cart.items")` ou `t("cart.items", { count: "2" })`. Passe um número.

O aviso aparece uma vez por locale e chave, para que uma chave que falta em toda renderização não afogue o console, e nunca aparece quando `isSilent` é `true`. Um callback `onMissingKey` o substitui e roda em toda falta.

Se o TypeScript não pegou o erro de digitação, o tipo de retorno do seu loader é `any` ou `unknown`. Veja [Chaves tipadas](translations.md#chaves-tipadas).

## O texto aparece no idioma padrão

O idioma atual não tem a chave, então aparece o texto do idioma padrão. Esse é o fallback previsto e não registra nada. [Encontre chaves não traduzidas](translations.md#encontre-chaves-não-traduzidas) lista todas as lacunas.

## `t()` lança "requires successful initialization"

`t()`, `has()` e `setLocale()` lançam um `Error` como `[I18n] setLocale() requires successful initialization.` até o gerenciador iniciar, porque ainda não há dicionário para usar. Espere `i18n.init()`, ou `initializeBrowserI18n()` no navegador, antes de renderizar. Num framework, renderize um estado de carregamento até a promise ser resolvida, ou comece a renderizar depois dela.

## Um locale é rejeitado com `RangeError`

`init()`, `setLocale()` e `loadLocale()` lançam um `RangeError` para um locale que não está em `locales`. A comparação ignora maiúsculas e minúsculas e espaços nas pontas, então `"PT"` encontra `pt`, mas `pt-BR` não encontra `pt`. Para achar o locale suportado mais próximo do idioma de um visitante, use [`matchLocale()`](index.md#transforme-entrada-externa-em-um-locale), que leva `pt-BR` a `pt`, sim.

## Carregar um locale falha com `I18nError`

O seu loader lançou um erro ou foi rejeitado, e o gerenciador embrulhou a falha num `I18nError` com a mensagem `Failed to load translations for locale "pt".`:

- `error.code` é `"i18n.locale_load_failed"`.
- `error.locale` é o locale que falhou.
- `error.cause` é o que o seu loader lançou, como um erro de rede ou um timeout.

O gerenciador mantém o idioma atual, e a próxima chamada tenta o loader de novo, então um botão de "tentar de novo" pode simplesmente chamar `setLocale()` outra vez. No navegador, um locale salvo que falha cai no locale detectado, e um detectado cai no padrão; veja [Quando um loader falha na inicialização](browser.md#quando-um-loader-falha-na-inicialização).

### Mostre o erro ao visitante

`I18nError.message` é para os seus logs, não para pessoas. O pacote exporta `i18nErrors`, uma mensagem segura para o código, no formato que o `@codenhub/error` lê. O `@codenhub/error` é um pacote separado; instale-o com `pnpm add @codenhub/error`. Registre as mensagens uma vez, quando o app começa, e depois transforme o que você capturar em algo que dá para mostrar:

```ts
import { createAppError, getErrorRegistry } from "@codenhub/error";
import { i18nErrors } from "@codenhub/i18n";

getErrorRegistry().codes.addList(Object.entries(i18nErrors));

try {
  await i18n.setLocale("pt");
} catch (caught) {
  const error = createAppError(caught);

  showToast(error.message); // "We couldn't load the text for this language. Try again."
}
```

`error.messageKey` é `"error.i18n.loader.localeLoadFailed"`, se você preferir mostrar a mensagem no idioma do visitante a partir do seu próprio dicionário. Só mantenha esse texto num locale que já está carregado: o que falhou, por definição, não está disponível.

### Ele nunca falha, só trava

Um loader que nunca termina, como um `fetch()` para um servidor que parou de responder, deixa a troca esperando para sempre. O gerenciador chama o loader uma vez, e toda chamada posterior para aquele locale espera pela mesma promise, então tentar de novo também não ajuda. Dê um prazo à requisição, como em [Guarde os dicionários em arquivos JSON](translations.md#guarde-os-dicionários-em-arquivos-json): com `AbortSignal.timeout()`, o timeout rejeita, o gerenciador reporta um `I18nError` e a próxima chamada tenta de novo.

## Um dicionário é rejeitado

`init()`, `setLocale()` ou `loadLocale()` lança um `TypeError` que nomeia o problema, a chave e o locale quando um dicionário não segue as regras. Essas falhas não são embrulhadas em `I18nError`, porque vêm do conteúdo do dicionário, e não do carregamento, e tentar de novo não muda o conteúdo.

Um dicionário precisa ser um objeto simples, como um objeto literal ou um JSON interpretado. Qualquer outra coisa, inclusive `null`, um array ou uma instância de classe, dá `[I18n] A locale dictionary must be a non-null object in locale "pt".`. Um loader que devolve o próprio `import("./pt.json")`, em vez do `.default` dele, entrega o módulo em vez do dicionário e dá `[I18n] A locale dictionary must be a module's default export, …`. Devolva `(await import("./pt.json")).default`. Dentro dele:

- **Todo valor é uma string ou um grupo.** `{ count: 3 }` dá `[I18n] Locale dictionary value at "count" must be a string in locale "pt".`. Números, booleanos, `null`, arrays, funções e objetos como `Date` ou `Map` são todos rejeitados. Escreva números como texto, `"3"`, e coloque listas sob chaves numeradas ou nomeadas.
- **Nenhum segmento de chave é vazio.** `"nav..home"`, `"nav."` e `".nav"` são rejeitados, como em `[I18n] Invalid locale dictionary key "nav..home" in locale "pt".`. Tire o ponto a mais.
- **Nenhum segmento começa ou termina com espaço.** `{ " title": "Título" }` dá `[I18n] Invalid locale dictionary key " title" in locale "pt".`, e o mesmo vale para `"nav. home"`. Um espaço perdido quase sempre é um erro de digitação que tornaria a chave impossível de achar. Espaços dentro de um segmento, como em `"sign in"`, não têm problema.
- **Nada de caracteres de controle.** Uma chave como `"a\nb"` é rejeitada. Caracteres de controle normalmente vêm de um copiar e colar; digite a chave de novo.
- **Nada de segmento `__proto__`.** `"nav.__proto__"` é rejeitado, já que poderia ser usado para adulterar objetos. Escolha outro nome.
- **Uma chave completa cabe em 1.000 caracteres.** As mais longas dão `[I18n] Locale dictionary flattened keys must not exceed 1000 characters in locale "pt".`. Encurte a chave.
- **Duas grafias nunca se encontram.** `{ "nav.home": "A", nav: { home: "B" } }` dá `[I18n] Locale dictionary key collision at "nav.home" in locale "pt".`, porque as duas são `nav.home`. Fique com uma.
- **Cada grupo aparece uma vez.** O mesmo objeto usado em duas chaves, ou contendo a si mesmo, dá `[I18n] A locale dictionary must not contain repeated objects in locale "pt".`. Copie o objeto.
- **Nada de getters nem de chaves symbol.** Dados vindos de JSON nunca têm isso; monte o dicionário a partir de valores simples.
- **Ele cabe nos limites de tamanho.** A mensagem nomeia o limite que foi ultrapassado, como `must not exceed 100 levels of nesting`. Veja [Limites de tamanho](translations.md#limites-de-tamanho) para aumentá-los.

Um dicionário vazio é aceito.

## `createI18n()` lança `TypeError`

A configuração é inválida. A maioria das mensagens tem o formato `[I18n] Invalid configuration: <option>: <problem>`, então a opção a corrigir é a primeira coisa depois dos dois-pontos. Confira se:

- `locales` é uma lista não vazia, sem duplicatas (ignorando maiúsculas e minúsculas), e cada locale é feito de letras e dígitos ASCII separados por hífens, como `pt-BR`.
- `defaultLocale` é um dos `locales`.
- `loadLocale` é uma função.
- `timeZone`, quando definido, é um que o `Intl` conhece. Um erro de digitação dá `timeZone: Must be a time zone Intl supports, such as "America/Sao_Paulo" or "UTC"`.
- `dictionaryLimits` nomeia só limites conhecidos, cada um um número inteiro positivo. `maxKeys` dá `dictionaryLimits.maxKeys: Is not a recognized limit`, e `maxDepth: 0` dá `dictionaryLimits.maxDepth: Must be a positive whole number`. [Limites de tamanho](translations.md#limites-de-tamanho) lista os nomes.
- `isSilent`, quando definido, é um booleano. `isSilent: "true"` dá `isSilent: Expected boolean, received string`.
- `getLocaleDirection` e `onMissingKey`, quando definidos, são funções; senão a mensagem diz `getLocaleDirection: Must be a function` ou `onMissingKey: Must be a function`.
- A configuração é um objeto simples. Uma instância de classe, ou um objeto que herda as opções, é rejeitado para que valores herdados não passem escondidos.

`createI18n()` também pergunta a `getLocaleDirection` a direção do locale padrão. Se ela devolver qualquer coisa diferente de `"ltr"` ou `"rtl"`, você recebe `TypeError: [I18n] Invalid direction for locale "en".`; `init()` e `setLocale()` lançam o mesmo para o locale para o qual trocam, e mantêm o atual. Uma exceção que a sua função lança passa sem alteração. Veja [Defina a direção você mesmo](index.md#defina-a-direção-você-mesmo).

### `createLocaleRouting()` lança `TypeError`

O roteamento segue as mesmas regras para `locales` e `defaultLocale`, com mensagens que começam com `[I18n] Invalid locale routing configuration:`. `localePrefix` é obrigatório e precisa ser `"always"`, `"except-default"` ou `"when-ambiguous"`; deixá-lo de fora dá `localePrefix: Expected "always", "except-default", or "when-ambiguous", received undefined`. Um problema em `pathnames` nomeia a entrada, como `pathnames["/about"].pt`; [Erros que ele pega](localized-urls.md#erros-que-ele-pega) explica cada um e o conserto.

## O TypeScript diz que `string` não pode ser atribuído ao tipo do locale

```text
Type 'string' is not assignable to type '"en" | "pt"'.
```

O locale padrão perdeu o tipo exato, normalmente porque a configuração mora numa variável separada. Marque-o com `as const`, como em [Chaves tipadas](translations.md#chaves-tipadas). Os locales vêm só de `locales`, então um padrão `string` simples não consegue alargá-los.

O mesmo vale para `localePrefix` numa configuração de roteamento guardada numa variável, onde a mensagem cita `"always" | "except-default" | "when-ambiguous"`: escreva `localePrefix: "except-default" as const`.

## Uma mensagem aparece com o texto cru

Você vê `{count, plural, one {# item} other {# items}` ou `{first-name}` na tela, e o console avisa sobre uma mensagem inválida. O texto não é sintaxe de mensagem válida, então aparece como foi escrito, com só os placeholders `{name}` simples preenchidos, em vez de meio formatado. O aviso aparece uma vez por texto e locale.

Causas comuns:

- **Falta uma chave, ou sobra uma.** Conte; toda `{` precisa da sua `}`.
- **Um nome de placeholder tem outros caracteres.** Os nomes são letras ASCII, dígitos e sublinhados, então `{first-name}` e `{nome_ç}` aparecem como foram escritos. Use `{firstName}` ou `{nome}`.
- **Um formato que este pacote não suporta**, como `{n, number, currency}` ou um skeleton `::`. Formate o valor com `formatNumber()` e passe o resultado como um placeholder simples.
- **Aninhamento com mais de 10 níveis**, ou a mesma opção `=1` duas vezes. Simplifique a mensagem.

[Coloque valores no texto](translations.md#coloque-valores-no-texto) tem a sintaxe.

## Um método de roteamento lança `TypeError`

Vindo de `parse()`, o valor não é o pathname de uma URL: ele não começa com `/`, ou contém `?` ou `#`. Passe `url.pathname` em vez da URL inteira ou de um caminho com a query string, como o `request.url` do Node. Um caminho que é um pathname mas contém algo que o roteamento recusa, como `//` ou um segmento de ponto, faz `parse()` devolver `undefined`, então a URL estranha de um visitante vira um 404 em vez de um crash.

Vindo de `localize()` ou `localizeAll()`, o caminho é um desses, ou contém algo que o roteamento recusa. [Caminhos que ele aceita](localized-urls.md#caminhos-que-ele-aceita) tem a lista completa, com o conserto de cada um.

## `localize()` lança `RangeError`: "would be read as"

O caminho que `localize()` montaria abre uma página diferente, ou a mesma página em outro idioma. Há duas causas comuns:

- **Você passou uma URL, e não um caminho canônico.** `localize("/sobre", "en")` toma `/sobre` como o caminho canônico de uma página em inglês. Se `/sobre` é a URL da página "sobre" em português, leia-a antes: `localize(routing.parse("/sobre").pathname, "en")`.
- **Uma página que a tabela não lista tem o caminho traduzido de outra.** Com `"/contact": { es: "/about" }` e nenhuma entrada `/about`, `localize("/about", "es")` lança `RangeError: [I18n] "/about" in "es" would be read as "/contact" in "es"; …`. Com `localePrefix: "when-ambiguous"`, uma página em inglês em `/sobre` entra em conflito com uma `/sobre` em português do mesmo jeito. Renomeie uma delas, liste a página em `pathnames` ou mantenha o prefixo com `"except-default"`. [O risco que você assume](localized-urls.md#o-risco-que-você-assume) explica por que o roteamento não consegue pegar isso antes.

## `localize()` lança `RangeError`: "would be longer than 8,192 characters"

O caminho que você passou é válido, mas o prefixo do locale ou as palavras traduzidas deixam o resultado mais longo do que o `parse()` aceita. Encurte o caminho; um link desse tamanho também tende a ser cortado por servidores e proxies muito antes de alguém lê-lo.

## Um placeholder aparece como foi escrito e nada avisa

Você vê `Ouvrir l{app}` onde esperava `Ouvrir l'éditeur`, e o console está quieto. O apóstrofo antes de `{` põe o placeholder entre aspas, o que é sintaxe de mensagem válida, então não há nada para avisar. Escreva `l''{app}`, ou use o apóstrofo tipográfico, `l’{app}`. Veja [Chaves literais e apóstrofos](translations.md#chaves-literais-e-apóstrofos).

## O binding do navegador avisa ou rejeita

- **"Document synchronization requires a page document"**: `initializeBrowserI18n()` rodou sem `document`, como num Web Worker, e lançou `TypeError: [I18n] Document synchronization requires a page document; pass syncDocument: false without one.` antes de iniciar o gerenciador. Passe `syncDocument: false` e nenhum `root`; veja [Em um Web Worker](browser.md#em-um-web-worker).
- **"The manager already has a browser binding"**: você chamou `initializeBrowserI18n()` duas vezes para o mesmo gerenciador. Chame `disconnect()` no primeiro binding, ou fique com um só.
- **"Browser initialization was superseded before its locale became active"**: o seu código chamou `i18n.init()` enquanto o binding iniciava o gerenciador, ou `i18n.setLocale()` num gerenciador que já estava inicializado, mesmo que para o locale que já está na tela. O gerenciador fica com o resultado da sua chamada, e o binding não é conectado. Deixe o binding iniciar o gerenciador e troque de idioma depois que a promise dele for resolvida.
- **"Browser observation requires a root"**: `observe: true` precisa de um `root` para observar.
- **"root must be an element, a document, or a shadow root, such as document.body."**: `root` era outra coisa, normalmente o `null` que `document.querySelector("#app")` devolve numa página sem `#app`. O binding lança o erro antes de iniciar o gerenciador. Confira se o elemento existe em toda página que roda o script, ou passe `document`.
- **`onMissingKey` lançou um erro**: o binding ainda traduz todos os outros elementos, e depois rejeita com o primeiro erro na primeira inicialização, ou o reporta como erro não capturado depois de uma troca de idioma posterior. Só o texto ou atributo cuja chave faltava fica com o valor que tinha. Uma primeira inicialização que rejeita desse jeito deixa o gerenciador iniciado, mas o binding desconectado, então as trocas de idioma seguintes não traduzem a página; corrija o callback e chame `initializeBrowserI18n()` de novo.
- **"Could not read persisted locale", "Could not persist locale" ou "Could not forget persisted locale"**: o `localStorage` não está disponível, como em alguns modos de navegação privada ou num Web Worker. A escolha do visitante não é salva ou, depois de `followSystem()`, não é esquecida; todo o resto funciona. Passe `persistLocale: false` onde não houver armazenamento, para iniciar em silêncio.
- **"Could not switch to the detected locale"**: o idioma do navegador mudou enquanto o binding [seguia o sistema](browser.md#ofereça-uma-opção-sistema), e o loader falhou para o locale detectado. A página mantém o idioma atual. Corrija o loader.
- **"followSystem() requires a connected browser binding"**: você chamou `followSystem()` depois de `disconnect()`. Chame-o no binding que está conectado.
- **`Could not load locale "pt"; using "es".`** ou **`Could not load locale "pt"; using the default locale.`**: o loader falhou para um locale salvo ou detectado que não é o padrão, então o visitante recebeu o seguinte: o locale detectado pelo navegador depois de um salvo, e depois o padrão. Corrija o loader; a escolha salva é mantida para a próxima vez. Se o próprio locale padrão falhar ao carregar, não sobra nada para onde cair, e a inicialização é rejeitada com `Failed to load translations for locale "en".`
- **"Skipping translation on <p> because translated elements must be leaves"**: o elemento com `data-i18n` tem elementos filhos. Coloque a chave num elemento que contenha só texto, ou traduza com `t()`.
- **"Skipping translation on <style> because the element can activate or hide translated content"**: uma chave `data-i18n` está num elemento `<script>`, `<style>`, `<noscript>` ou `<template>`, cujo texto roda como código ou decide o que aparece. Mude a chave para um elemento comum.
- **"Skipping translation because data-i18n contains an invalid key"**, ou o mesmo para um `data-i18n-<attribute>`: a chave está em branco, tem mais de 1.000 caracteres ou contém um caractere de controle ASCII, então nenhum dicionário consegue guardá-la. O elemento fica com o texto atual. Corrija a chave no HTML.
- **O texto de `data-i18n` mostra `{name}`**: a tradução de HTML não consegue preencher placeholders. Renderize esse texto com `t()` e passe os valores.
- **Um atributo `data-i18n-href` não faz nada**: só atributos de texto podem ser traduzidos. Veja [Traduza HTML sem framework](browser.md#traduza-html-sem-framework).

Os avisos do navegador são silenciados junto com o resto quando o gerenciador tem `isSilent: true`.

## Ainda travado

A [referência](../reference/index.md) (em inglês) documenta cada export, cada opção e os erros que cada um lança. Se o comportamento mudou depois de uma atualização, o [changelog](../changelog/index.md) (em inglês) diz o que mudou e como migrar.
