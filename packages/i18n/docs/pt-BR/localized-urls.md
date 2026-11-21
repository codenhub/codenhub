---
title: URLs localizadas
description: Coloque o locale no caminho, traduza o próprio caminho, leia os dois de volta, crie links para outros idiomas, gere todas as páginas localizadas e mande os visitantes para o idioma deles num site estático.
order: 4
source: d1982bce342d923a8dd150fcca2cdedb69755fc8
---

# URLs localizadas

Dar a cada idioma a sua própria URL, como `/about` e `/pt/about`, deixa as pessoas compartilharem um link no idioma que leem e deixa os buscadores indexarem todos os idiomas. O `@codenhub/i18n/routing` cuida da parte que é igual em qualquer framework: ler o locale de um caminho e montar o caminho para outro locale. Ele também pode traduzir o próprio caminho, para que a página "sobre" em português seja `/pt/sobre`, ou até só `/sobre`.

Os exemplos continuam o app `en` e `pt` da loja de chá das páginas anteriores. O espanhol entra quando os caminhos ganham tradução, e a página "sobre", o carrinho, as páginas de produto e as páginas de ajuda da loja ganham cada uma as suas próprias palavras.

## Configure o roteamento

```ts
// src/routing.ts
import { createLocaleRouting } from "@codenhub/i18n/routing";

export const routing = createLocaleRouting({
  locales: ["en", "pt"] as const,
  defaultLocale: "en",
  localePrefix: "except-default",
});
```

`localePrefix` decide quais caminhos começam com o locale. Ele é obrigatório e não tem padrão, porque cada escolha dá ao seu site URLs diferentes, e URLs são difíceis de mudar depois que as pessoas as salvaram nos favoritos. Deixá-lo de fora lança `TypeError: [I18n] Invalid locale routing configuration: localePrefix: Expected "always", "except-default", or "when-ambiguous", received undefined`.

| `localePrefix`     | Página "sobre" em inglês | Página "sobre" em português                                                                  |
| ------------------ | ------------------------ | -------------------------------------------------------------------------------------------- |
| `"except-default"` | `/about`                 | `/pt/about`                                                                                  |
| `"always"`         | `/en/about`              | `/pt/about`                                                                                  |
| `"when-ambiguous"` | `/about`                 | `/pt/about`, ou `/sobre` depois de traduzida; veja [Dispense o prefixo](#dispense-o-prefixo) |

Como escolher:

- `"except-default"` mantém as URLs que você já tem quando você acrescenta um idioma.
- `"always"` faz toda URL dizer o idioma dela, então `/about` não é uma página, o que combina com um site que redireciona `/` para o idioma do visitante.
- `"when-ambiguous"` tira o prefixo dos caminhos traduzidos que só podem pertencer a um idioma, e vale a leitura antes de você escolhê-lo.

Use os mesmos `locales` e `defaultLocale` do seu gerenciador. O roteamento é separado do gerenciador, então funciona também onde não há tradução nenhuma, como na lógica de redirecionamento de um servidor.

Se você guardar a configuração numa variável antes de passá-la, ponha `as const` depois do objeto inteiro: `const config = { … } as const`. Sem isso, o TypeScript alarga `localePrefix` para `string`, e `createLocaleRouting` o rejeita em tempo de compilação. `as const` só em `localePrefix` compila, mas tipa todo locale como `string`, então `localize("/about", "fr")` também compila.

### Barras finais

Por padrão, `localize()` mantém a barra do caminho que você passa: `/about/` dá `/pt/about/`, e `/about` dá `/pt/about`. A página inicial de um locale não tem barra para manter, já que `/` não diz nada sobre isso, então ela é sempre `/pt`.

Muitos hosts estáticos servem `pt/index.html` em `/pt/` e redirecionam `/pt` para lá; num site assim, defina `trailingSlash`:

```ts
export const routing = createLocaleRouting({
  locales: ["en", "pt"] as const,
  defaultLocale: "en",
  localePrefix: "except-default",
  trailingSlash: "always",
});

routing.localize("/", "pt"); // "/pt/"
routing.localize("/about", "pt"); // "/pt/about/"
routing.localize("/", "en"); // "/"
```

| `trailingSlash`          | Monta                                                             |
| ------------------------ | ----------------------------------------------------------------- |
| `"preserve"`, por padrão | A barra do caminho recebido: `/pt/about/` ou `/pt/about`, e `/pt` |
| `"always"`               | Uma barra em todo caminho: `/pt/about/` e `/pt/`                  |
| `"never"`                | Nenhuma barra em caminho nenhum além de `/`: `/pt/about` e `/pt`  |

`parse()` aceita as duas grafias, seja qual for a sua escolha, e o `pathname` que ele devolve mantém a barra da requisição: `/about` para `/pt/about` e `/about/` para `/pt/about/`. Roteie os dois valores para a mesma página, ou tire a barra antes de rotear. Com `"always"` ou `"never"`, [Redirecione para a URL canônica](#redirecione-para-a-url-canônica) então manda a outra grafia para a que `localize()` monta, para que cada página tenha um endereço só.

## Leia o locale de um caminho

`parse()` separa um caminho em locale e resto:

```ts
routing.parse("/pt/about"); // { locale: "pt", pathname: "/about", alternates: […] }
routing.parse("/about"); // { locale: "en", pathname: "/about", alternates: […] }
routing.parse("/PT/about"); // { locale: "pt", pathname: "/about", alternates: […] }
```

O `pathname` que ele devolve é o **caminho canônico**: o caminho em que a sua aplicação roteia, igual em todos os idiomas. Guarde essa ideia; ela importa quando os caminhos ganham tradução. `alternates` é a URL da página em cada idioma, para [links para outros idiomas](#crie-links-para-outro-idioma).

`parse()` devolve `undefined` para um caminho que não é página em locale nenhum, como `/pt/en/about`. Depois de tirado o prefixo, ele começa com outro locale, então nenhum link jamais leva até lá. Responda com um 404.

Com `localePrefix: "always"`, um caminho sem locale também devolve `undefined`, para que você possa redirecioná-lo. Acrescente o prefixo do locale escolhido e faça o parse disso. Um caminho com as palavras desse locale, como `/sobre`, passa então a ser lido como um caminho dele, e um caminho que também não é página nesse locale recebe o seu 404:

```ts
// Um arquivo, como `/favicon.ico`, não é uma página; veja Redirecione para a URL canônica abaixo.
const isFile = /\.[a-z0-9]+$/i.test(url.pathname);
const route = isFile ? undefined : routing.parse(url.pathname);
if (route === undefined && !isFile) {
  const locale = pickLocale(i18n, request);
  const guess = routing.parse(`/${locale}${url.pathname === "/" ? "" : url.pathname}`);
  if (guess === undefined) {
    return new Response("Not found", { status: 404 });
  }
  const target = new URL(url);
  target.pathname = routing.localize(guess.pathname, guess.locale);
  return Response.redirect(target, 302);
}
```

`pickLocale` é o helper de `Accept-Language` de [Renderize no servidor](server-rendering.md#escolha-um-locale-a-partir-do-accept-language).

### Leia o locale no cliente

No navegador, pegue o locale da URL e passe-o para o binding do navegador. A URL então vence os idiomas salvos e detectados do visitante, então a página sempre combina com o endereço dela:

```ts
import { initializeBrowserI18n } from "@codenhub/i18n/browser";
import { i18n } from "./i18n";
import { routing } from "./routing";

const route = routing.parse(window.location.pathname);
await initializeBrowserI18n({ i18n, locale: route?.locale });
```

### Redirecione para a URL canônica

`parse()` é tolerante: `/PT/about` e `/en/about` são lidos tão bem quanto `/pt/about` e `/about`, e o mesmo vale para as duas grafias de uma [barra final](#barras-finais). Isso é gentil com quem digita uma URL. Um buscador que encontra uma página em vários endereços, porém, divide o ranking entre eles, e quatro endereços para uma página "sobre" são três a mais. Mande todas as outras grafias para a que `localize()` monta. Todo caminho que `parse()` devolve tem uma, então isso nunca lança erro.

Rode este redirecionamento, e o do prefixo que falta acima, só para rotas de página, depois que o seu servidor já respondeu às requisições de arquivos estáticos. `parse()` lê qualquer caminho como página:

- Com `trailingSlash: "always"`, este redirecionamento manda `/favicon.ico` para `/favicon.ico/`.
- Com `localePrefix: "always"`, o de cima o manda para `/en/favicon.ico`.

Nenhum dos dois tem arquivo. Se os redirecionamentos precisarem rodar antes, pule os caminhos que terminam numa extensão de arquivo, como os dois exemplos fazem:

```ts
const isFile = /\.[a-z0-9]+$/i.test(url.pathname);
const route = isFile ? undefined : routing.parse(url.pathname);
if (route !== undefined) {
  const canonical = routing.localize(route.pathname, route.locale);
  if (canonical !== url.pathname) {
    const target = new URL(url);
    target.pathname = canonical;
    return Response.redirect(target, 301);
  }
}
```

## Crie links para outro idioma

`localize()` monta o caminho de uma página num locale. Passe para ele o caminho canônico:

```ts
routing.localize("/about", "pt"); // "/pt/about"
routing.localize("/about", "en"); // "/about"
```

Um caminho canônico nunca começa com um locale, então `localize()` lança um `RangeError` para um que comece, como `/pt/about`. Isso é uma URL; passe `parse("/pt/about").pathname` em vez dele. Ele também lança para uma página sua cujo caminho começa com o código de um locale: com birmanês, `my`, configurado, uma página em inglês em `/my/orders` não tem URL, já que `/my/orders` é o `/orders` em birmanês. Dê outro caminho a essa página.

Num site localizado, trocar de idioma é uma navegação, e não só um `setLocale()`: `setLocale()` muda o texto, mas nunca a URL. Então o seletor de idioma da loja lê a página atual com `parse()`, pega o caminho dela no novo idioma em `alternates`, mantém a query string e o fragmento e deixa o seu router ir até lá:

```ts
const route = routing.parse(window.location.pathname);
const target = route?.alternates.find((alternate) => alternate.locale === "pt");
if (target !== undefined) {
  await navigate(target.pathname + window.location.search + window.location.hash);
}
```

Passar pelo `parse()` importa quando os caminhos ganham tradução: `/sobre` é uma URL em português, e não um caminho canônico, e só o `parse()` sabe lê-la como `/about`.

`alternates` lista a página em cada idioma que tem uma URL para ela, na ordem de `locales`, incluindo o atual. Pode faltar um idioma: com `/products/:id` e `/products/new` traduzidos, um produto em inglês chamado `novo` não tem URL em português, porque `/pt/produtos/novo` é a página de produto novo. Monte o seletor a partir de `alternates`, para que ele ofereça só os idiomas para onde consegue ir, ou mande um idioma que falta para a página inicial desse idioma. Já `localize()` lança um erro para uma página assim, como explica [O risco que você assume](#o-risco-que-você-assume), então não o chame com um caminho lido de uma requisição.

Use a mesma lista para as tags `<link rel="alternate" hreflang>` que contam aos buscadores sobre cada idioma. Acrescente uma tag `x-default` para os leitores cujo idioma você não oferece, apontando para a página do locale padrão, quando ela existir:

```ts
const defaultLocale = "en"; // o defaultLocale que você configurou
const link = (hreflang: string, pathname: string) => `<link rel="alternate" hreflang="${escapeHtml(hreflang)}" href="${escapeHtml(new URL(pathname, "https://example.com").href)}">`;

const tags = route.alternates.map((page) => link(page.locale, page.pathname));
const fallback = route.alternates.find((page) => page.locale === defaultLocale);
if (fallback !== undefined) {
  tags.push(link("x-default", fallback.pathname));
}
```

Escape os dois valores como faria com qualquer texto no HTML, ou deixe o seu framework criar as tags. Um caminho pode conter caracteres, como `&` ou `'`, que são permitidos numa URL mas não crus dentro de um atributo.

## Traduza caminhos

`/pt/about` é uma página em português com endereço em inglês. Para dar palavras em português a ela, liste os caminhos traduzidos em `pathnames`, indexados pelo caminho canônico. É aqui que a loja acrescenta o espanhol:

```ts
export const routing = createLocaleRouting({
  locales: ["en", "pt", "es"] as const,
  defaultLocale: "en",
  localePrefix: "except-default",
  pathnames: {
    "/about": { pt: "/sobre", es: "/acerca" },
    "/cart": { pt: "/carrinho", es: "/carrito" },
    "/products/:id": { pt: "/produtos/:id" },
    "/products/:id/reviews/:reviewId": { pt: "/avaliacoes/:reviewId/produto/:id" },
  },
});
```

```ts
routing.localize("/about", "pt"); // "/pt/sobre"
routing.localize("/cart", "es"); // "/es/carrito"
routing.localize("/products/42", "pt"); // "/pt/produtos/42"
routing.parse("/pt/produtos/42"); // { locale: "pt", pathname: "/products/42", alternates: […] }
```

A sua aplicação continua roteando em `/products/42`, seja qual for o idioma. Só a URL muda.

Como ler a tabela:

- **Parâmetros** são segmentos que começam com `:`, como `:id`. Eles correspondem a qualquer segmento único, e o valor é copiado sem alteração. Toda forma precisa usar os mesmos parâmetros do caminho canônico, mas em qualquer ordem, porque os idiomas não concordam sobre a ordem das palavras: `/products/42/reviews/7` é `/pt/avaliacoes/7/produto/42`.
- **Um catch-all** é um último segmento escrito `:name*`, como `"/help/:path*": { pt: "/ajuda/:path*" }`. Ele corresponde a um ou mais segmentos e os copia, então `/help/shipping/returns` é `/pt/ajuda/shipping/returns`. Ele não corresponde a zero segmentos: liste o próprio `/help` como uma entrada separada.
- **O que a tabela não lista mantém as suas palavras.** `/blog` é `/pt/blog`, e `/products/42` em espanhol é `/es/products/42`, já que só o português o traduz.
- **Segmentos fixos diferenciam maiúsculas de minúsculas**, como as URLs, então `/pt/Sobre` não é a página "sobre". Só o prefixo do locale ignora essa diferença.
- **Prefira letras simples nos caminhos.** O roteamento não muda as suas palavras, então você só recebe `/servicos` se escrever `/servicos`. A maioria dos sites tira os acentos das URLs, porque um caminho acentuado aparece com percent-encoding em todo lugar em que é copiado como texto, como `/servi%C3%A7os`. Acentos também funcionam: `"/serviços"` corresponde ao `/servi%C3%A7os` que os navegadores mandam, e `localize()` devolve a forma codificada, como faz com todo segmento, como o slug de um produto, e como `parse()` devolve o seu `pathname`. Então um build estático que escreve uma pasta para esse caminho precisa decodificá-lo antes, como em [Gere um site estático](server-rendering.md#gere-um-site-estático).
- **Uma página volta numa grafia só.** `parse()` escreve cada segmento, listado ou não, como a RFC 3986 normaliza uma URL: um escape de letra, dígito ou `-._~` é decodificado, qualquer outro escape é escrito em maiúsculas, e um caractere que uma URL codifica, como `é`, é codificado. Então `/%61bout` e `/pt/%73obre`, grafias estranhas de `/about` e `/pt/sobre`, dão as duas `pathname: "/about"`, e `/products/caf%c3%a9` dá `/products/caf%C3%A9`. Um caractere reservado escapado continua escapado, então `/products/c%2B%2B` e `/products/c++` são duas páginas, já que um servidor pode ler `%2B` de outro jeito que `+`. Então passe o pathname do jeito que a URL o escreve, como `new URL(request.url).pathname`, e não um que o seu framework decodificou: decodificado, `/100%25` vira `/100%`, que `parse()` recusa.
- **Um segmento fixo ganha de um parâmetro, e um parâmetro ganha de um catch-all.** Com `/products/new` e `/products/:id` listados, `/products/new` é a página de novo produto, seja qual for a ordem em que a tabela os lista. Com `/help/contact` e `/help/:path*`, `/help/contact` é a página de contato, e todo outro caminho `/help/…` vai para o catch-all.
- **O locale padrão também pode ser traduzido.** Um site que é primeiro em português, com código em inglês, pode usar `defaultLocale: "pt"` e `{ "/about": { pt: "/sobre" } }`, de modo que `/sobre` é a página em português e `/en/about`, a em inglês.

### Erros que ele pega

`createLocaleRouting` confere a tabela quando você a cria, então um erro falha na inicialização em vez de num clique azarado qualquer. Cada um destes lança um `TypeError` que nomeia a entrada:

- **Duas páginas com o mesmo caminho num locale.** `{ "/about": { pt: "/sobre" }, "/company": { pt: "/sobre" } }` dá ao português duas páginas em `/pt/sobre`. Dê outras palavras a uma delas. O mesmo vale para uma forma que pega as palavras que outra página listada mantém: com `{ "/about": { pt: "/sobre" }, "/contact": { es: "/about" } }`, a página "sobre" mantém as palavras em inglês em espanhol, então `/es/about` seria as duas páginas, e a criação lança erro.
- **Dois caminhos canônicos com o mesmo formato.** `/products/:id` e `/products/:slug` correspondem aos mesmos caminhos. Fique com um.
- **Parâmetros diferentes dos do caminho canônico.** `{ "/products/:id": { pt: "/produtos/:slug" } }` perde o `:id`. Renomeie, ou mude de lugar, mas mantenha. Um catch-all precisa continuar catch-all em todas as formas.
- **Um catch-all que não é o último**, como `/help/:path*/edit`.
- **Um caminho que começa com um locale**, como `/pt/about` como caminho canônico. O prefixo seria lido como o locale. Liste `/about`.
- **Um locale que não está configurado**, ou um listado duas vezes com maiúsculas e minúsculas diferentes.
- **Um caminho que `parse()` rejeitaria**, como listado em [Caminhos que ele aceita](#caminhos-que-ele-aceita).

A verificação só vê as páginas que a tabela lista. Sem a entrada `/about`, `{ "/contact": { es: "/about" } }` é aceito, porque o roteamento não sabe que você tem uma página "sobre". O conflito então aparece mais tarde, quando você monta o link dessa página: `localize("/about", "es")` lança `RangeError: [I18n] "/about" in "es" would be read as "/contact" in "es"; …`. [O risco que você assume](#o-risco-que-você-assume) explica essa rede de proteção e como garantir que ela pegue os conflitos no build, e não em produção.

### Registre as rotas traduzidas

O roteamento lê e monta caminhos; o seu framework ainda precisa mandar `/pt/sobre` para a página "sobre". Há dois jeitos de fazer isso, e os dois funcionam com qualquer framework.

**Reescreva para o caminho canônico.** Se o seu framework ou servidor consegue mudar o caminho em que roteia, como middlewares de servidor e hooks de requisição normalmente conseguem, registre só as rotas canônicas e roteie no resultado de `parse()`:

```ts
const route = routing.parse(url.pathname);
// Roteie em `route.pathname`, como "/about" para "/pt/sobre", e renderize em `route.locale`.
```

**Registre uma rota por locale.** Um padrão de rota é um caminho, então `localizeAll()` o traduz:

```ts
routing.localizeAll("/products/:id");
// [{ locale: "en", pathname: "/products/:id" }, { locale: "pt", pathname: "/pt/produtos/:id" }, { locale: "es", pathname: "/es/products/:id" }]
```

Registre cada uma com o seu locale. Com o `@codenhub/router`, fica assim:

```ts
for (const { locale, pathname } of routing.localizeAll("/products/:id")) {
  router.on(pathname, ({ params }) => renderProduct(params["id"], locale));
}
```

O `@codenhub/router` pega a primeira rota que corresponder, na ordem em que você as registra. Quando dois caminhos de um locale podem corresponder à mesma URL, como `/pt/produtos/novo` e `/pt/produtos/:id`, registre primeiro o que tem palavras fixas.

Um padrão que termina em `:name*` é traduzido pelo catch-all da tabela, nunca por um parâmetro: com `/help/:id` e `/help/:path*` na tabela, `localizeAll("/help/:path*")` dá o português `/pt/ajuda/:path*`, e não o `/pt/ajuda/artigo/:path*` de um segmento. `localizeAll()` escreve um catch-all como `:name*`. Traduza isso para a sintaxe do seu framework quando registrá-lo, como `[...path]` num router baseado em arquivos. O `@codenhub/router` não tem catch-all, então, com ele, roteie esses caminhos reescrevendo para o caminho canônico.

## Dispense o prefixo

`/pt/sobre` já diz "português" duas vezes. Com `localePrefix: "when-ambiguous"`, um caminho traduzido dispensa o prefixo quando as palavras dele só podem ser português:

```ts
export const routing = createLocaleRouting({
  locales: ["en", "pt"] as const,
  defaultLocale: "en",
  localePrefix: "when-ambiguous",
  pathnames: { "/about": { pt: "/sobre" } },
});

routing.localize("/about", "pt"); // "/sobre"
routing.parse("/sobre"); // { locale: "pt", pathname: "/about", alternates: […] }
routing.localize("/", "pt"); // "/pt"
routing.localize("/blog", "pt"); // "/pt/blog"
```

O prefixo fica onde o caminho sozinho não consegue dizer em que idioma está:

- **Caminhos com as mesmas palavras em dois idiomas.** `/` e `/blog` também existem em inglês, então o português mantém `/pt` e `/pt/blog`. Dois idiomas que traduzem para as mesmas palavras, como `/contato` em português e em espanhol, também mantêm o prefixo.
- **Caminhos que um parâmetro do idioma padrão poderia pegar.** Se o inglês lista `/:slug`, todo caminho de um segmento poderia ser uma página em inglês, então `/sobre` mantém o prefixo.
- **Caminhos feitos só de parâmetros**, como `/:tag`, que poderiam ser qualquer coisa.

Só contam os caminhos lidos sem prefixo. Um `/:tag` em espanhol mantém o prefixo, então só pega caminhos que começam com `/es`, e o `/sobre` em português continua sem o seu.

Nesse modo, o locale padrão nunca tem prefixo. `parse()` continua aceitando `/pt/sobre`, então redirecione-o como em [Redirecione para a URL canônica](#redirecione-para-a-url-canônica).

### O risco que você assume

O roteamento só conhece os caminhos da sua tabela. Um caminho que ele não lista é tomado como do locale padrão, então ele não enxerga um conflito com uma página de que nunca ouviu falar.

Digamos que o blog em inglês da loja tenha um post em `/sobre`, um slug que veio do seu CMS. Agora `/sobre` abre a página "sobre" em português, e o post fica inalcançável.

`localize()` pega isso quando monta um caminho, e lança um `RangeError` em vez de criar um link para a página errada:

```ts
routing.localize("/sobre", "en");
// RangeError: [I18n] "/sobre" in "en" would be read as "/about" in "pt"; …
```

Um build estático que localiza todas as páginas que renderiza, com `localizeAll()` como em [Gere todas as páginas localizadas](#gere-todas-as-páginas-localizadas), encontra todos os conflitos no build. Um servidor só encontra um quando monta um link para aquela página com `localize()`. Os links que ele monta a partir do `parse().alternates` de uma requisição deixam de fora um idioma em conflito em vez de falhar, então nada avisa você ali. Então, se as suas URLs vêm de algum lugar fora da tabela, como um CMS, passe os slugs novos por `localizeAll()` quando publicá-los, ou mantenha o prefixo com `"except-default"`.

O mesmo erro avisa quando você passou uma URL onde `localize()` quer um caminho canônico, como `localize("/sobre", "en")` quando você queria a página em `/sobre`. Passe `parse("/sobre").pathname`.

## Gere todas as páginas localizadas

`localizeAll()` devolve um caminho para cada locale, na ordem de `locales`. Com a tabela de [Traduza caminhos](#traduza-caminhos):

```ts
routing.localizeAll("/about");
// [{ locale: "en", pathname: "/about" }, { locale: "pt", pathname: "/pt/sobre" }, { locale: "es", pathname: "/es/acerca" }]
```

Passe para ele a sua lista de páginas para obter todas as páginas de que um build estático precisa, e renderize cada uma com o próprio gerenciador, como em [Gere um site estático](server-rendering.md#gere-um-site-estático).

## Detecte o idioma em um site estático

Um servidor manda o visitante que chega em `/` para o idioma dele a partir do `Accept-Language`, como em [Leia o locale de um caminho](#leia-o-locale-de-um-caminho). Um site estático com `localePrefix: "except-default"` não tem servidor para ver esse cabeçalho: as páginas do locale padrão são as sem prefixo, e quem faz o redirecionamento é o navegador.

É um script curto com uma lista longa de jeitos de errar um pouquinho, então aqui estão eles primeiro:

- **Ele roda antes da primeira pintura.** Um script com defer redireciona depois que a página já apareceu no idioma padrão, então o visitante a vê piscar. Coloque o redirecionamento num script inline no `<head>`. Um script inline não pode usar `import`, então nem `matchLocale()` nem `routing` estão ali: calcule o que ele precisa no build e passe para ele.
- **A escolha do visitante vence.** Confira o idioma salvo antes de `navigator.languages`. Senão, um navegador em português que escolhe inglês é mandado direto de volta para o português. O binding do navegador, configurado como em [Leia o locale no cliente](#leia-o-locale-no-cliente), já salva esse idioma: ele guarda `{"locale":"en"}` na chave `"i18n"`, ou no seu `storageKey`, em toda página em que inicia. Como trocar de idioma é uma navegação, esse é o idioma da última página que o visitante leu, inclusive aquela para onde a troca o levou.
- **Um link do seu próprio site nunca redireciona.** Onde o armazenamento está bloqueado, a escolha não pode ser salva, então quem chega a partir do seu próprio site, com um `document.referrer` da mesma origem, fica na página que pediu. Isso depende de o navegador mandar o referrer. Um link com `rel="noreferrer"`, ou uma página servida com `Referrer-Policy: no-referrer`, não manda nenhum, e a visita é redirecionada como uma vinda de fora, então uma troca para o idioma padrão pode ser mandada direto de volta. Deixe os dois fora dos seus próprios links, inclusive do seletor de idioma.
- **Uma URL com prefixo nunca redireciona.** Renderize o script só nas páginas do locale padrão, para que um link compartilhado de `/pt/about` sempre abra em português. Mantenha `search` e `hash` ao redirecionar.

No build, enquanto você [renderiza cada página](#gere-todas-as-páginas-localizadas), calcule duas coisas para o script: o caminho desta página em cada um dos outros locales, com `localize()`, e uma tabela que leva cada idioma e a sua escrita provável, como `zh-Hant` para `zh-TW`, ao locale correspondente:

```ts
// No build, para a página em `pathname` no locale padrão.
const locales = ["en", "pt", "es"] as const;
const defaultLocale = "en";

const config = {
  storageKey: "i18n", // o storageKey do binding do navegador
  locales,
  // `zh-TW` é `zh-Hant`: um idioma e a sua escrita provável, como `matchLocale()` os compara, com o norueguês `no` como `nb`.
  languages: Object.fromEntries(
    locales.map((locale) => {
      const { language, script } = new Intl.Locale(locale).maximize();
      return [`${language === "no" ? "nb" : language}-${script}`, locale];
    }),
  ),
  targets: Object.fromEntries(locales.filter((locale) => locale !== defaultLocale).map((locale) => [locale, routing.localize(pathname, locale)])),
};
// Escreve `<` como `\u003c`, para que nenhum caminho consiga fechar o elemento script antes da hora.
const json = JSON.stringify(config).replaceAll("<", "\\u003c");
```

Depois renderize, só nas páginas do locale padrão:

```html
<script>
  ((config) => {
    try {
      if (document.referrer !== "" && new URL(document.referrer).origin === location.origin) return;
    } catch {
      // Um referrer ilegível conta como chegada de fora.
    }

    let saved;
    try {
      // O binding salva `{"locale":"pt"}`.
      saved = JSON.parse(localStorage.getItem(config.storageKey) ?? "null")?.locale;
    } catch {
      // Armazenamento bloqueado ou ilegível: cai nos idiomas do navegador.
    }

    // Um locale salvo que o seu site não lista mais, como `pt-PT`, é comparado como o primeiro idioma do navegador.
    let target = config.locales.includes(saved) ? saved : undefined;
    if (target === undefined) {
      const browser = navigator.languages.length > 0 ? navigator.languages : [navigator.language];
      const preferences = typeof saved === "string" ? [saved, ...browser] : browser;
      for (const preference of preferences) {
        let language;
        try {
          const tag = new Intl.Locale(preference);
          if (tag.language === "und") continue; // Nenhum idioma, embora o maximize o transformasse em inglês.
          // Lê códigos antigos como `matchLocale()` lê, como `iw-IL` como hebraico, `he`, e acrescenta a escrita provável.
          const likely = tag.maximize();
          language = `${likely.language === "no" ? "nb" : likely.language}-${likely.script}`;
        } catch {
          continue; // Não é uma tag de idioma.
        }
        if (Object.hasOwn(config.languages, language)) {
          target = config.languages[language];
          break;
        }
      }
    }

    if (target !== undefined && Object.hasOwn(config.targets, target)) {
      location.replace(config.targets[target] + location.search + location.hash);
    }
  })(/* o `json` do build */);
</script>
```

Um locale padrão salvo não encontra destino, então o visitante fica. `location.replace()` mantém a página do locale padrão fora do histórico, para que o Voltar não caia numa página que redireciona de novo.

### O quanto ele chega perto de `matchLocale()`

Comparar por idioma e escrita escolhe o mesmo que `matchLocale()` escolheria quando o seu site tem um locale por idioma e escrita, como `en`, `pt-BR`, `es`, `zh-Hans` e `zh-Hant`: `pt-PT` recebe `pt-BR`, `es-MX` recebe `es` e `zh-TW` recebe `zh-Hant`. Um idioma em outra escrita nunca corresponde, então, só com `zh`, que é simplificado, um visitante `zh-TW` passa para o próximo idioma dele.

Mantenha os dois alinhados com um teste que roda a mesma comparação contra `matchLocale()` para algumas listas de preferências.

Com mais de um locale por idioma e escrita, como `es-419` e `es-ES`, ou `no` e `nb`, que contam como um idioma só, a tabela não consegue escolher entre eles. Você tem duas opções:

- Calcular uma tabela no build a partir das tags de navegador que você espera ver, passando cada uma por `matchLocale()`.
- Rodar o redirecionamento num script com defer que importa o seu gerenciador e chama `matchLocale(navigator.languages)`, e aceitar a piscada.

## Caminhos que ele aceita

O roteamento trabalha só com o caminho de uma URL. Passe `url.pathname`, e não a URL inteira, e cuide você mesmo da query string e do fragmento.

Esta é a parte chata da página. Também é a parte que decide se uma URL forjada consegue chegar a uma página diferente da que o seu código conferiu, então o roteamento é rigoroso com ela. Ele recusa cada um destes caminhos:

- **Barras duplicadas**, como em `//wp-login.php` ou `/help//returns`. Um caminho que começa com `//` é lido pelos navegadores como outro host, e um segmento vazio é uma página a que nenhum link seu leva. Escreva barras simples.
- **Barras invertidas**, como em `/help\returns`. Alguns servidores tratam `\` como `/`, então a mesma requisição chegaria a duas páginas diferentes. Use `/`.
- **Caracteres de controle**, como uma quebra de linha ou um tab, escritos crus. Nenhum link de verdade os contém.
- **Segmentos de ponto**, `.` e `..`, como em `/help/../admin`, e as formas codificadas deles, como `/help/%2e%2e/admin`. O navegador os resolve antes de mandar a requisição, então uma requisição que ainda tem um foi escrita à mão para escapar da página que nomeia. Resolva o caminho antes; `new URL(path, "https://example.com").pathname` faz isso.
- **Uma barra, barra invertida, `%` ou caractere de controle codificado**: `%2F`, `%5C`, `%25`, ou de `%00` a `%1F` e `%7F`, como em `/files/a%2Fb`. Uma barra ou barra invertida codificada faz os servidores discordarem sobre onde os segmentos começam e terminam, um vendo um segmento onde outro vê dois. Um `%` codificado convida a uma segunda rodada de decodificação, então `%252F` vira `%2F` e depois `/`. Um caractere de controle codificado passa pela verificação dos crus. Mantenha uma barra dentro de um valor fora do caminho, como na query string.
- **Um escape malformado**, um `%` que não é seguido por dois dígitos hexadecimais, como em `/50%off`. Escreva `%25` para um `%` literal… que também é recusado, pela regra anterior, então tire o `%` do caminho.
- **Mais de 8.192 caracteres ou 100 segmentos**, ou um caminho cujo caminho canônico teria mais do que isso, como pode acontecer com um caminho traduzido curto quando a entrada dele na tabela é longa. Servidores e proxies cortam as URLs por volta desse tamanho de qualquer jeito, e nenhuma página fica 100 pastas abaixo; um pedido com milhares de segmentos de uma letra custaria trabalho em cada locale.

Uma requisição pode trazer qualquer um desses, como um scanner pedindo `//wp-login.php`, então `parse()` devolve `undefined` para eles, e o mesmo 404 os responde como a qualquer outro caminho que não é página. `localize()` e `localizeAll()` montam links a partir dos seus próprios caminhos, em vez de ler requisições, então, para os mesmos caminhos, eles lançam um `TypeError` que cita o caminho e diz a regra, como `TypeError: [I18n] pathname "/help/../admin" must not contain a dot segment, . or ..`, e você corrige o caminho no seu código.

Todo método, `parse()` incluído, lança um `TypeError` para um valor que nem é o pathname de uma URL:

- Um que não começa com `/`, como uma URL inteira: `TypeError: [I18n] pathname must start with /; pass url.pathname`.
- Um que contém `?` ou `#`, como o `request.url` do Node com a query string: `TypeError: [I18n] pathname "/search?…" must not contain ?, which starts a query; pass url.pathname`. Nenhum dos dois erros cita as informações de usuário, a query ou o fragmento da URL, que podem conter uma credencial.
- Um que não é string: `TypeError: [I18n] pathname must be a string, received undefined`.

Isso é um erro no código que chama, e não uma requisição a responder, então ele falha alto em vez de responder 404 a toda URL com query.

Escapes comuns, como `%20` e `%C3%A7`, não têm problema, e uma barra final é mantida: `/pt/sobre/` vira `/about/` no parse.

`localize()` lança um `RangeError` quando o caminho que ele monta passaria de 8.192 caracteres ou 100 segmentos, como pode acontecer com um caminho logo abaixo do limite depois que o prefixo ou as palavras traduzidas são acrescentados.

## O que o roteamento deixa para o seu framework

O roteamento lê e monta caminhos. O seu framework ou servidor continua registrando as rotas, redirecionando, navegando e renderizando. Ele também não sabe nada de base path: se a sua loja mora em `/shop` dentro de um site maior, tire isso antes de chamar `parse()` e ponha de volta depois de `localize()`.

A tabela cobre as rotas da sua própria aplicação. Slugs de conteúdo, como o título de um post de blog na URL dele, pertencem a onde quer que o conteúdo more, como o seu CMS, que sabe o slug de cada post em cada idioma.

## Próximos passos

Esse é o pacote inteiro: dicionários, o navegador, o servidor e as URLs. A loja de chá está aberta em todos os idiomas que planejou. Quando algo der errado pelo caminho, [Solução de problemas](troubleshooting.md) parte do erro ou aviso que você vê e volta até o conserto.
