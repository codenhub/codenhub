---
title: Visão geral
description: O que o @codenhub/i18n faz, as quatro ideias por trás dele, um passo a passo de cinco minutos, idiomas da direita para a esquerda e como o gerenciador se comporta quando as chamadas se sobrepõem.
source: 0a23a1af8f426a75d05669e5f4203ee8f3dc4d44
---

# Traduza o seu app

O `@codenhub/i18n` transforma chaves como `"home.title"` em texto no idioma de quem está lendo. Você escreve as traduções como objetos simples ou arquivos JSON, um por idioma, e o pacote faz o resto:

- Carrega o certo.
- Volta para o seu idioma principal quando falta uma tradução.
- Preenche valores como nomes e quantidades.
- Escreve números e datas do jeito que o leitor espera.
- Diz ao TypeScript quais chaves existem, para que um erro de digitação falhe na compilação em vez de chegar à produção.

O núcleo funciona igual no navegador, num servidor Node.js, no build de um site estático ou num Web Worker. Dois extras opcionais cuidam do que muda de um ambiente para outro:

- **`@codenhub/i18n/browser`** escolhe o idioma do visitante, lembra a escolha dele, mantém os atributos `lang` e `dir` da página em sincronia e pode traduzir HTML marcado com `data-i18n`. Quase tudo isso precisa de uma página, então num Web Worker, que não tem nenhuma, ele pede duas opções a mais; veja [Em um Web Worker](browser.md#em-um-web-worker).
- **`@codenhub/i18n/routing`** coloca o idioma na URL, como em `/pt/about`, e pode traduzir o próprio caminho, como em `/pt/sobre` ou `/sobre`. Ele só lê e monta strings, então funciona em qualquer lugar, Worker incluído.

Estas páginas constroem um app pequeno do começo ao fim: uma loja de chá online com página inicial, um carrinho que conta os itens, uma página "sobre" e um seletor de idioma. Ela começa em inglês e português. Outros idiomas aparecem quando uma página precisa deles: português do Brasil para as variantes regionais, árabe para o texto da direita para a esquerda e espanhol quando as URLs ganham tradução. Uma loja junta idiomas do mesmo jeito que um carrinho junta itens: um de cada vez, e mais do que o planejado.

## Quatro ideias

O pacote inteiro cabe em quatro ideias. Não tem uma quinta escondida numa nota de rodapé.

**Um locale** dá nome a um idioma e, às vezes, a uma região: `en`, `pt`, `pt-BR`, `ar`. Você lista os locales que o seu app suporta e escolhe um como **locale padrão**: o idioma em que o app é escrito primeiro, para o qual todos os outros locales fazem fallback. A loja de chá é escrita primeiro em inglês, então o locale padrão dela é `en`.

**Um dicionário** guarda todas as traduções de um locale. As chaves podem ser aninhadas para manter juntos os textos relacionados:

```json
{
  "home": {
    "title": "Welcome",
    "greeting": "Hello, {name}!"
  }
}
```

As chaves aninhadas são unidas com pontos, então esse dicionário tem as chaves `home.title` e `home.greeting`.

**Um loader** é uma função que você escreve e que devolve o dicionário de um locale. Ela pode devolver um objeto que você importou, ler um arquivo ou buscar JSON no seu servidor. O pacote nunca decide onde as traduções moram. Ele chama o seu loader quando precisa de um locale e guarda o resultado.

**Um gerenciador** junta tudo isso. Você cria um com `createI18n()`, diz qual locale usar e pede texto a ele com `t()`.

## Passo a passo

### 1. Instale

```sh
pnpm add @codenhub/i18n
```

O pacote é um módulo ES e precisa de Node.js 26 ou mais recente, ou de um navegador atual. Ele não tem dependências de runtime.

### 2. Escreva dois dicionários

Comece pelo seu idioma padrão e mais um. Aqui eles são objetos num arquivo TypeScript; [Escreva as suas traduções](translations.md) mostra como mantê-los em arquivos JSON.

```ts
// src/locales.ts
export const dictionaries = {
  en: {
    home: { title: "Welcome", greeting: "Hello, {name}!" },
    cart: { items: { one: "{count} item", other: "{count} items" } },
  },
  pt: {
    home: { title: "Bem-vindo", greeting: "Olá, {name}!" },
    cart: { items: { one: "{count} item", other: "{count} itens" } },
  },
} as const;
```

O `as const` deixa o TypeScript enxergar as chaves exatas, para que ele possa conferir cada chamada de `t()` contra elas.

### 3. Crie o gerenciador

Num app de navegador, crie o gerenciador uma vez, num módulo próprio, e importe-o onde precisar de texto:

```ts
// src/i18n.ts
import { createI18n } from "@codenhub/i18n";
import { dictionaries } from "./locales";

export const i18n = createI18n({
  locales: ["en", "pt"] as const,
  defaultLocale: "en",
  loadLocale: (locale) => dictionaries[locale],
});

export const { t } = i18n;
```

`t` é um nome curto para `i18n.translate`. Todo método do gerenciador funciona sozinho depois que você o tira do objeto, como `t` aqui, então dá para importar `t` diretamente.

No servidor, um gerenciador compartilhado é o formato errado; [Renderize no servidor](server-rendering.md#um-gerenciador-por-requisição) explica por quê e o que fazer no lugar.

### 4. Inicie e traduza

O gerenciador precisa carregar um dicionário antes de traduzir, então inicie-o uma vez quando o app começar e espere por ele:

```ts
// src/main.ts
import { i18n, t } from "./i18n";

await i18n.init({ locale: "pt" });

t("home.title"); // "Bem-vindo"
t("home.greeting", { name: "Ana" }); // "Olá, Ana!"
t("cart.items", { count: 3 }); // "3 itens"
t("home.titel"); // erro de compilação: essa chave não existe
```

`init()` sem locale começa no locale padrão.

Chamar `t()` antes de `init()` terminar lança um erro, porque ainda não há nada com que traduzir.

### 5. Troque de idioma

```ts
await i18n.setLocale("en");
t("home.title"); // "Welcome"
```

`setLocale()` carrega o novo dicionário primeiro e só troca depois que ele carregou, então o texto nunca aparece metade num idioma e metade em outro.

Para redesenhar a interface quando o idioma muda, passe uma função para `i18n.subscribe()`. Ela roda depois de cada `init()` e de cada troca de idioma que de fato acontece; [Acompanhe o gerenciador](#acompanhe-o-gerenciador) diz exatamente quando isso é.

## O que acontece quando falta uma tradução

Traduções raramente ficam completas. A loja de chá passa a oferecer embrulho para presente, o texto em inglês sai na terça-feira e o texto em português chega quando a tradução chegar. O pacote cobre a lacuna em dois passos:

1. **A chave falta no locale atual, mas existe no padrão**, ou num locale pai, como `pt` para `pt-BR` (veja [Variantes regionais](translations.md#variantes-regionais)). Você recebe esse texto. No exemplo acima, uma chave que só existe em `en` mostra inglês para quem lê em português. Nada é registrado no log, porque isso é normal enquanto os tradutores correm atrás; [uma verificação de chaves nos seus testes](translations.md#encontre-chaves-não-traduzidas) encontra esses casos.
2. **A chave falta em todo lugar.** `t()` devolve a própria chave, sem espaços nas pontas, como `"home.subtitle"`, para que a lacuna fique visível na tela e seja fácil de procurar.

No segundo caso, o gerenciador também registra um aviso, como `[I18n] Missing key "home.subtitle" in locale "pt".`. Com que frequência, e para onde ele vai:

- Ele avisa uma vez para cada par de locale e chave, então uma chave usada em toda renderização não inunda o console.
- Ele lembra os 1.000 pares mais recentes, então um par que sai dessa lista pode avisar de novo.
- Um gerenciador criado com `isSilent: true` nunca registra esse aviso.
- Para mandar as faltas para o seu próprio logger, passe `onMissingKey(key, locale)`. Ele substitui o aviso e roda em toda falta, e não uma vez por par.

`t()` sempre devolve uma string, então você nunca precisa de `?? ""` depois dele.

## Idiomas da direita para a esquerda

Árabe, hebraico, persa e urdu são escritos da direita para a esquerda. Uma página num desses idiomas precisa dizer isso com `<html dir="rtl">`, ou o navegador alinha o texto do lado errado e põe a pontuação na ponta errada da frase.

O gerenciador sabe a direção do locale ativo em `i18n.direction`, que vale `"ltr"` ou `"rtl"`. Digamos que a loja de chá acrescente árabe aos seus `locales`:

```ts
await i18n.init({ locale: "ar" });
i18n.direction; // "rtl"
```

O binding do navegador escreve isso em `<html dir>` para você. No servidor, escreva você mesmo na página, como em [Renderize no servidor](server-rendering.md#um-gerenciador-por-requisição).

### Como o padrão decide

Um locale é `rtl` quando a escrita em que ele é escrito corre da direita para a esquerda. A escrita é a subtag de escrita do locale, quando ele tem uma, como `Arab` em `uz-Arab`. Caso contrário, é a escrita em que o idioma provavelmente é escrito, que o `maximize()` do `Intl.Locale` deduz a partir do idioma e da região:

| Locale                 | Direção | Por quê                                                           |
| ---------------------- | ------- | ----------------------------------------------------------------- |
| `ar`, `he`, `fa`, `ur` | `rtl`   | Escritas árabe e hebraica.                                        |
| `uz-Arab`              | `rtl`   | A subtag de escrita diz árabe.                                    |
| `pa`                   | `ltr`   | O punjabi provavelmente é escrito em gurmukhi.                    |
| `pa-PK`                | `rtl`   | No Paquistão, o punjabi provavelmente é escrito na escrita árabe. |
| `sd-IN`                | `ltr`   | Na Índia, o sindi provavelmente é escrito em devanágari.          |
| `en`, `pt-BR`          | `ltr`   | Escrita latina.                                                   |

A região é o motivo de uma simples lista de idiomas errar aqui: `pa` e `pa-PK` são o mesmo idioma em duas escritas. Para uma tag que o `Intl.Locale` não consegue ler, quem decide é uma lista fixa de idiomas da direita para a esquerda, como `ar` e `he`.

Os dados de escrita provável vêm com o motor de JavaScript e, para tags raras, podem mudar entre versões do motor. Quando uma tag é ambígua, normalmente o melhor conserto é a própria tag: `sd-Arab-IN` diz escrita árabe com todas as letras, e o padrão a lê como `rtl`.

### Defina a direção você mesmo

Passe `getLocaleDirection` para decidir em todos os locales. Ela substitui o padrão por inteiro, então precisa responder por todos eles:

```ts
export const i18n = createI18n({
  locales: ["en", "ar"] as const,
  defaultLocale: "en",
  loadLocale: (locale) => dictionaries[locale],
  getLocaleDirection: (locale) => (locale === "ar" ? "rtl" : "ltr"),
});
```

O gerenciador a chama para o locale padrão quando é criado, e para cada locale em que inicia ou para o qual troca. Ela pode falhar de dois jeitos:

- **Ela devolve algo diferente de `"ltr"` ou `"rtl"`.** Isso lança `TypeError: [I18n] Invalid direction for locale "ar".`: a partir de `createI18n()`, quando a resposta para o locale padrão está errada, ou a partir do `init()` ou `setLocale()` que perguntou, o que deixa o gerenciador no idioma atual. Devolva exatamente uma das duas strings.
- **Ela lança um erro.** O seu erro não é embrulhado nem engolido: ele sai de `createI18n()`, `init()` ou `setLocale()` sem alterações, e uma troca que falhou, de novo, mantém o idioma atual.

## Acompanhe o gerenciador

O gerenciador tem algumas propriedades que você pode ler a qualquer momento:

- `i18n.locale` é o locale ativo. Antes de `init()` terminar, ele é o locale padrão.
- `i18n.isReady` é `false` até o primeiro `init()` dar certo, e `true` depois. Enquanto ele for `false`, `t()` lança um erro.
- `i18n.direction` é a direção do locale ativo, como acima.
- `i18n.locales`, `i18n.defaultLocale` e `i18n.isSilent` são o que você configurou. `locales` é uma cópia congelada.

### Reaja às mudanças

`subscribe(listener)` chama `listener`, sem argumentos, depois de cada `init()` aplicado e de cada troca de locale aplicada. Ele devolve uma função que interrompe isso.

"Aplicado" está trabalhando pesado nessa frase:

- Um `setLocale()` para o locale que já está ativo não muda nada, então não chama o listener.
- Uma chamada que foi ultrapassada por uma posterior (próxima seção) também não muda nada, então não chama o listener.
- Chamar `init()` de novo com o mesmo locale é aplicado, sim, e chama o listener.

Para o código que precisa saber o que mudou, o gerenciador também é um `EventTarget` com dois eventos:

- `ready`, depois de cada `init()` aplicado. `event.detail.locale` é o locale com que ele começou.
- `locale-change`, depois de cada troca de locale aplicada. `event.detail.locale` é o novo locale e `event.detail.previousLocale`, o anterior.

```ts
i18n.addEventListener("locale-change", (event) => {
  console.info(`Language changed from ${event.detail.previousLocale} to ${event.detail.locale}`);
});
```

Os listeners rodam na ordem em que foram adicionados. Uma exceção num listener ou numa função de `subscribe()` é reportada como em qualquer `EventTarget`:

- No navegador, ela é um erro não capturado, que não interrompe os outros listeners nem desfaz a troca.
- No Node.js, ela derruba o processo, assunto ao qual [Renderize no servidor](server-rendering.md#mantenha-os-logs-de-produção-úteis) volta.

### A última chamada vence

Carregar leva tempo, e as pessoas clicam mais rápido do que as redes respondem. Quando chamadas de `init()` ou `setLocale()` se sobrepõem, a que começou por último decide o idioma. Uma chamada anterior que termina de carregar depois que uma posterior começou é resolvida sem aplicar nada: sem troca de locale, sem evento, sem chamada de `subscribe()`.

Digamos que um visitante lendo a loja em inglês clique em "Português" no seu seletor de idioma, se arrependa e clique em "English" antes de o português carregar:

```ts
const portuguese = i18n.setLocale("pt"); // primeiro clique
const english = i18n.setLocale("en"); // segundo clique
await Promise.all([portuguese, english]);
i18n.locale; // "en": a chamada do português foi resolvida, mas não mudou nada
```

Então, depois de `await i18n.setLocale("pt")`, não assuma que o locale é `pt`; leia `i18n.locale` quando o resultado importar.

O segundo clique desse exemplo pede o idioma que já está na tela, e mesmo assim conta. Um `setLocale()` posterior para o locale já ativo também é uma chamada posterior: ele cancela uma troca pendente, e o visitante fica onde está.

As falhas seguem a mesma regra. Uma chamada que falha é rejeitada e deixa o idioma atual como estava. Se uma chamada posterior já a ultrapassou, ela é resolvida em silêncio, já que a falha dela não diz nada sobre o idioma que está na tela agora. Só a falha da última chamada é rejeitada.

### Transforme entrada externa em um locale

`init()` e `setLocale()` lançam um `RangeError` para um locale que não está em `locales`. Um locale vindo de um cookie, de uma query string ou de um cabeçalho da requisição é texto não confiável, então transforme-o num locale configurado antes. Dois métodos fazem isso, para dois tipos de entrada.

**`resolveLocale(value)`** é para um valor que já deveria ser um dos seus locales, como um parâmetro `?lang=` ou um cookie que o seu app escreveu. Ele só aceita correspondências exatas, ignorando maiúsculas e minúsculas e espaços nas pontas, e devolve o locale do jeito que você o escreveu, ou `undefined`:

```ts
const lang = new URL(location.href).searchParams.get("lang") ?? "";
await i18n.init({ locale: i18n.resolveLocale(lang) ?? i18n.defaultLocale });
// ?lang=PT começa em "pt"; ?lang=fr, ou sem lang, começa no padrão.
```

Com `pt-BR` entre os seus locales, `?lang=PT-br` começaria em `"pt-BR"` do mesmo jeito.

**`matchLocale(preferences)`** é para as preferências de idioma de um visitante, como `navigator.languages` ou os idiomas de um cabeçalho `Accept-Language`, do mais preferido para o menos. Ele encontra o locale suportado mais próximo. Cada preferência é testada em ordem, e a primeira que corresponder a qualquer coisa vence:

1. Uma correspondência exata, ignorando maiúsculas e minúsculas: `pt-BR` recebe `pt-BR`.
2. O locale configurado mais longo com que a preferência começa, em subtags inteiras e escrito na mesma escrita: `pt-BR` recebe `pt`.
3. Uma correspondência por subtags prováveis: `zh-TW`, chinês tradicional, recebe `zh-Hant`.
4. O mesmo idioma na mesma escrita: `pt-PT` recebe `pt-BR` quando esse é o seu único português.

O norueguês tem dois códigos para o bokmål, `no` e `nb`, e os navegadores mandam qualquer um dos dois, então eles contam como um idioma só: um site configurado com `no` atende um visitante que manda `nb`, e vice-versa. O nynorsk, `nn`, é um padrão escrito à parte e nunca corresponde a eles.

`und`, o código de idioma indeterminado, é ignorado, com qualquer subtag, como `und-US`. Ele não nomeia idioma nenhum, embora as subtags prováveis o lessem como inglês.

Um locale em outra escrita nunca corresponde, porque uma página numa escrita que o visitante não lê o atende pior do que o próximo idioma dele. Com `zh`, que é chinês simplificado, um visitante `zh-TW` que também lista inglês recebe inglês, e um que não lista mais nada recebe `undefined`.

Um locale configurado que o `Intl.Locale` rejeita, como um com uma subtag de uso privado de mais de oito caracteres, não tem escrita provável. Ele corresponde pelo idioma, e pela escrita que ele nomeia, quando nomeia uma.

O resto do comportamento é curto:

- Ele devolve `undefined` quando nada corresponde.
- Ele pula entradas em branco e malformadas.
- Ele lança um `TypeError` quando `preferences` não é um array.

Quando vários dos seus locales têm o mesmo idioma e a mesma escrita, e nenhum corresponde a uma preferência exatamente ou pela região provável, vence o primeiro em `locales`. Então ordene `locales` por qual deles deve atender todos os outros.

Digamos que a loja de chá comece a entregar para quem fala espanhol, com um dicionário para a América Latina e outro para a Espanha. Para atender um visitante do México, `es-MX`, com o seu espanhol latino-americano, liste `es-419` antes de `es-ES`:

```ts
const i18n = createI18n({
  locales: ["en", "es-419", "es-ES"] as const,
  defaultLocale: "en",
  loadLocale: (locale) => dictionaries[locale],
});

i18n.matchLocale(["es-MX"]); // "es-419", porque está listado primeiro
i18n.matchLocale(["es"]); // "es-ES", já que espanhol sem região provavelmente quer dizer Espanha
```

## O que este pacote não faz

Ele traduz, formata e escolhe locales. Algumas coisas ficaram de fora de propósito:

- **HTML nas traduções.** `t()` devolve texto puro, e `data-i18n` define texto puro, então `"<strong>Hi</strong>"` mostra as tags em vez de texto em negrito. Deixe a marcação nos seus templates ou componentes e coloque só palavras no dicionário, com [placeholders](translations.md#coloque-valores-no-texto) para os valores.
- **Skeletons de número e moeda nas mensagens.** Skeletons ICU como `{price, number, ::currency/EUR}`, e o estilo `currency`, `{price, number, currency}`, não são suportados: uma mensagem não tem como saber em que moeda está um preço. Formate o valor no código com `i18n.formatNumber(9.99, { style: "currency", currency: "EUR" })` e passe a string. Uma mensagem que use um deles tem sintaxe inválida e aparece como foi escrita; veja [Formate números e datas no texto](translations.md#formate-números-e-datas-no-texto) para o que é suportado.
- **Carregar as traduções.** O pacote chama o seu loader; onde os arquivos ficam e como são buscados, guardados em cache ou tentados de novo é com você.
- **Rotas, redirecionamentos e navegação.** O roteamento por locale lê e monta caminhos, mas quem registra as rotas, redireciona e navega continua sendo o seu framework ou servidor.

## Para onde ir agora

Leia estas páginas em ordem para aprender o pacote de ponta a ponta, ou pule direto para a que você precisa. A loja de chá vai junto em todas:

1. [Escreva as suas traduções](translations.md): dicionários, arquivos JSON, placeholders, mensagens ICU, plurais, formatadores, chaves e valores tipados, verificação de chaves não traduzidas e limites de tamanho.
2. [Traduza um app no navegador](browser.md): detecte e lembre o idioma do visitante, mantenha `lang` e `dir` em sincronia, renderize de novo um framework e traduza HTML com `data-i18n`.
3. [Renderize no servidor ou no build](server-rendering.md): um gerenciador por requisição, escolha de locale a partir do `Accept-Language`, fusos horários, logs sob controle e builds de sites estáticos.
4. [URLs localizadas](localized-urls.md): coloque o locale no caminho, traduza o próprio caminho, crie links para outros idiomas, gere todas as páginas localizadas e detecte o idioma num site estático.
5. [Solução de problemas](troubleshooting.md): o que cada erro e aviso quer dizer, e como resolver.

Mais duas páginas são para consultar, e não para ler de cabo a rabo: a [referência da API](../reference/index.md) (em inglês) lista cada export, opção e tipo, e o [changelog](../changelog/index.md) (em inglês) diz o que mudou em cada versão e como atualizar.
