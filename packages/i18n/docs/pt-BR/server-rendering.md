---
title: Renderize no servidor ou no build
description: Um gerenciador por requisição, escolha de locale a partir do Accept-Language, builds de sites estáticos e logs de produção sob controle.
order: 3
source: 2d0be183a0b05f1d87a27140aa07d59add2d8d41
---

# Renderize no servidor ou no build

Um navegador tem um visitante, então um gerenciador está certo. Um servidor tem muitos visitantes ao mesmo tempo, em idiomas diferentes, e um gerenciador fala um idioma por vez. Então: **um gerenciador por página que você renderiza**. O build de um site estático renderiza todos os idiomas numa execução só e segue a mesma regra.

Esta página mostra esse formato com os dicionários `en` e `pt` da loja de chá, da [visão geral](index.md#passo-a-passo). Depois ela escolhe o idioma de cada visitante, acerta as datas dos pedidos, mantém os logs legíveis e gera a loja inteira como páginas estáticas.

## Um gerenciador por requisição

Um gerenciador tem um idioma atual. Se duas requisições compartilhassem um, uma requisição em português chamando `setLocale("pt")` mudaria o idioma de uma página em inglês que ainda está sendo renderizada, e o visitante inglês receberia uma página que troca de idioma no meio. Em desenvolvimento funciona direitinho, porque você é o único visitante, e é exatamente por isso que o problema chega à produção. Então crie o gerenciador dentro da requisição:

```ts
// src/i18n.ts
import { createI18n } from "@codenhub/i18n";
import { dictionaries } from "./locales";

export const createAppI18n = () =>
  createI18n({
    locales: ["en", "pt"] as const,
    defaultLocale: "en",
    loadLocale: (locale) => dictionaries[locale],
  });
```

```ts
// src/render.ts
import { createAppI18n } from "./i18n";

export async function renderPage(request: Request) {
  const i18n = createAppI18n();
  await i18n.init({ locale: pickLocale(i18n, request) });
  const { t } = i18n;

  return `<!doctype html>
<html lang="${i18n.locale}" dir="${i18n.direction}">
  <title>${escapeHtml(t("home.title"))}</title>
</html>`;
}
```

Criar um gerenciador é barato, e o trabalho que não é barato é compartilhado. Quando o seu loader devolve o mesmo objeto em toda chamada, como faz um módulo importado, todo gerenciador reaproveita a única cópia verificada daquele dicionário em vez de verificá-lo de novo. Um loader que lê e interpreta um arquivo a cada chamada perde isso, então leia cada arquivo uma vez e guarde o resultado.

`i18n.direction` é `"rtl"` para um locale da direita para a esquerda, como o árabe, e `"ltr"` nos outros casos; [Idiomas da direita para a esquerda](index.md#idiomas-da-direita-para-a-esquerda) explica como isso é decidido e como sobrescrever. Coloque-o em `<html dir>`, como acima, e o navegador monta a página do lado certo desde o primeiro byte.

Passe o gerenciador, ou `t`, para o que quer que renderize a página, em vez de importar um compartilhado.

`t()` devolve texto puro. Escape-o antes de colocá-lo no HTML, como faria com qualquer outro texto, ou deixe o seu template engine fazer isso.

## Escolha um locale a partir do `Accept-Language`

Os navegadores mandam os idiomas do visitante no cabeçalho `Accept-Language`, como `pt-BR,pt;q=0.9,en;q=0.8`. Transforme isso numa lista, do mais preferido para o menos, e deixe `matchLocale()` escolher o melhor locale que você suporta:

```ts
import type { I18n } from "@codenhub/i18n";

// Navegadores de verdade mandam um punhado de idiomas, e um cabeçalho pode listar milhares.
const MAX_PREFERENCES = 10;

function pickLocale<TLocale extends string>(i18n: I18n<TLocale>, request: Request): TLocale {
  const preferences = (request.headers.get("accept-language") ?? "")
    .split(",")
    .map((entry) => {
      const [tag = "", ...parameters] = entry.split(";");
      const weight = parameters.map((parameter) => parameter.trim()).find((parameter) => /^q=/i.test(parameter));
      // Um peso vai de 0 a 1, com até três casas decimais; qualquer outra coisa, como `q=0x1`, é malformada.
      const quality = weight === undefined ? 1 : /^q=(0(\.\d{0,3})?|1(\.0{0,3})?)$/i.test(weight) ? Number(weight.slice(2)) : 0;
      return { tag: tag.trim(), quality };
    })
    // Descarta os idiomas recusados (q=0) e os pesos malformados.
    .filter(({ quality }) => quality > 0)
    .sort((left, right) => right.quality - left.quality)
    .slice(0, MAX_PREFERENCES)
    .map(({ tag }) => tag);

  return i18n.matchLocale(preferences) ?? i18n.defaultLocale;
}
```

Um visitante cujos idiomas não correspondem a nada, inclusive um que recusa o seu padrão com `en;q=0`, ainda recebe o locale padrão, já que a página precisa estar em algum idioma. Esse helper não implementa o resto do `Accept-Language`, como o `*`; use o parser do seu framework de servidor se precisar disso e passe o resultado para `matchLocale()`.

`matchLocale()` recebe uma lista em vez do cabeçalho porque interpretar o cabeçalho, e limitar o tamanho dele, é trabalho do seu servidor. Mantenha o limite: `matchLocale()` testa as preferências em ordem até uma corresponder, então uma requisição cujo cabeçalho de 16 KB lista milhares de idiomas que você não suporta seguraria o event loop do seu servidor por dezenas de milissegundos. Uma única entrada com mais de 255 caracteres é pulada sem ser lida, então uma tag longa não consegue fazer o mesmo.

Ele compara do mesmo jeito que o binding do navegador, então um visitante recebe o mesmo idioma do servidor e do navegador: `pt-BR` recebe o seu `pt`, e `zh-TW` recebe o seu `zh-Hant`. Tags malformadas são puladas, e `undefined` significa que nada correspondeu. [Transforme entrada externa em um locale](index.md#transforme-entrada-externa-em-um-locale) tem a ordem completa de correspondência, inclusive qual de dois locales regionais vence, e o `resolveLocale()` para um locale vindo de um cookie ou de uma query string.

Quando a URL carrega o idioma, como num [site localizado](localized-urls.md), leia-o da URL e use o `Accept-Language` só para escolher para onde redirecionar um visitante que chega em `/`. Um site estático não tem servidor para ver o cabeçalho; veja [Detecte o idioma em um site estático](localized-urls.md#detecte-o-idioma-em-um-site-estático).

## Mostre datas no fuso horário do leitor

Um servidor formata datas no próprio fuso horário, que raramente é o do leitor. O "Shipped on {date, date, long}" da loja pode então mostrar um dia diferente do calendário do leitor, e mudar quando o navegador assume. Um cliente que vê a data de envio mudar enquanto a página carrega costuma escrever para o suporte sobre isso.

Dê ao gerenciador de cada requisição o fuso do leitor, como um que o seu app guarda por conta ou que o navegador informa num cookie:

```ts
export const createAppI18n = (timeZone?: string) =>
  createI18n({
    locales: ["en", "pt"] as const,
    defaultLocale: "en",
    loadLocale: (locale) => dictionaries[locale],
    timeZone,
  });
```

`Intl.DateTimeFormat().resolvedOptions().timeZone` lê o fuso no navegador. Um fuso que o `Intl` não conhece lança um `TypeError`, então confira um valor vindo de um cookie antes de usá-lo, ou caia num fuso fixo, como `"UTC"`.

## Mantenha os logs de produção úteis

Uma chave que falta registra um aviso uma vez para cada locale e chave, compartilhado por todos os gerenciadores do processo, então um gerenciador por requisição não o registra de novo para cada visitante. Mas um aviso só diz que falta uma palavra, não quantos visitantes a viram, e some no meio de tudo o mais que o servidor registra.

Em produção, mande as faltas para o seu logger, onde você pode contá-las em vez de passar por elas rolando a tela, ou desligue os avisos:

```ts
createI18n({
  // ...
  onMissingKey(key, locale) {
    logger.warn({ key, locale }, "missing translation");
  },
});
```

`onMissingKey` substitui o aviso e roda em toda falta. `isSilent: true` desliga só os avisos, inclusive o de uma mensagem com sintaxe inválida. Erros, como um carregamento que falhou, continuam sendo lançados.

No Node.js, uma exceção lançada de uma função passada para `subscribe()`, ou de um listener de `ready` ou `locale-change`, derruba o processo, como em qualquer `EventTarget`. Servidores raramente precisam deles, mas, se você os usar, envolva o corpo deles em `try`/`catch` para que não possam lançar nada.

## Gere um site estático

Um build estático renderiza todas as páginas em todos os idiomas com antecedência. Ele segue a mesma regra: um gerenciador por página. Liste as suas páginas localizadas com o [roteamento por locale](localized-urls.md#gere-todas-as-páginas-localizadas) e renderize cada uma:

```ts
import { createLocaleRouting } from "@codenhub/i18n/routing";
import { createAppI18n } from "./i18n";

const routing = createLocaleRouting({
  locales: ["en", "pt"] as const,
  defaultLocale: "en",
  localePrefix: "except-default",
});

// As suas páginas, indexadas pelo caminho canônico: o caminho sem locale, com as palavras em que o seu código roteia.
const pages = { "/": renderHome, "/about": renderAbout };

const builds = Object.entries(pages).flatMap(([page, render]) => routing.localizeAll(page).map(({ locale, pathname }) => ({ locale, pathname, render })));
// [{ locale: "en", pathname: "/", render: renderHome }, { locale: "pt", pathname: "/pt", render: renderHome }, ...]

await Promise.all(
  builds.map(async ({ locale, pathname, render }) => {
    const i18n = createAppI18n();
    await i18n.init({ locale });
    await writePage(pathname, render(i18n.t));
  }),
);
```

`pathname` é um caminho de URL, codificado com percent-encoding onde quer que tenha caracteres como `ç`, venham eles das palavras da tabela, como `/serviços`, ou dos seus próprios caminhos. Os hosts decodificam a requisição antes de procurar o arquivo, então dê ao arquivo o nome de `decodeURIComponent(pathname)`: `serviços` para `/servi%C3%A7os`, e não a forma codificada, que nenhuma requisição encontra. `decodeURI()` não basta, porque deixa codificado um escape reservado como `%2B`; `decodeURIComponent()` é seguro aqui porque o roteamento recusa `%2F` e `%5C`. Onde esse arquivo vai parar, como `serviços.html` ou `serviços/index.html`, depende do seu host e da sua configuração de `trailingSlash`.

Um dicionário que falha ao carregar ou na verificação faz `init()` ser rejeitado, então o build falha em vez de publicar páginas sem texto.

Uma chave que só o seu idioma padrão tem não faz o build falhar; ela é renderizada no idioma padrão. Para pegar esses casos:

- Acrescente [o teste de chaves não traduzidas](translations.md#encontre-chaves-não-traduzidas).
- Faça `onMissingKey` lançar um erro durante o build, para falhar com chaves que faltam em todos os idiomas.

## Passe o locale para o navegador

Quando o navegador assume uma página renderizada no servidor, ele precisa começar no idioma que o servidor usou, ou o texto muda enquanto a página carrega. Num site localizado, a URL diz qual: leia-o com `routing.parse()`, como mostra [URLs localizadas](localized-urls.md#leia-o-locale-no-cliente).

Sem um locale na URL, a correspondência do servidor com `Accept-Language` é um palpite, não uma escolha. Não a passe para o binding como `locale`: o binding salva um locale explícito como escolha do visitante, como explica [Como o locale é escolhido](browser.md#como-o-locale-é-escolhido), então um visitante que escolheu português teria inglês salvo por cima a cada carregamento de página. Guarde a escolha do visitante num cookie, que o servidor também consegue ler:

```ts
// src/render.ts
export async function renderPage(request: Request) {
  const i18n = createAppI18n();
  const chosen = /(?:^|;\s*)locale=([^;]*)/.exec(request.headers.get("cookie") ?? "")?.[1];
  await i18n.init({ locale: i18n.resolveLocale(chosen ?? "") ?? pickLocale(i18n, request) });
  // ...
}
```

```ts
// No navegador
const chosen = /(?:^|;\s*)locale=([^;]*)/.exec(document.cookie)?.[1];
const binding = await initializeBrowserI18n({
  i18n,
  // O cookie guarda a escolha, então o binding não salva nem lê a sua.
  persistLocale: false,
  locale: i18n.resolveLocale(chosen ?? ""),
});
binding.subscribe(() => {
  document.cookie = binding.isUsingSystemLocale ? "locale=; path=/; max-age=0" : `locale=${i18n.locale}; path=/; max-age=31536000; samesite=lax`;
});
```

- **Um visitante que escolheu um idioma** o recebe do servidor, e o navegador começa nele.
- **Um visitante que nunca escolheu um, ou que escolheu "Sistema"**, não tem cookie. O servidor faz a correspondência com `Accept-Language`, e o binding detecta a partir de `navigator.languages` com as mesmas regras, sem salvar nada, então `isUsingSystemLocale` continua `true` e a página segue o idioma do navegador. Os navegadores montam as duas listas a partir das mesmas configurações. Um que manda no cabeçalho menos idiomas do que `navigator.languages` lista pode discordar quando o primeiro idioma do visitante é um que você não suporta, e aí o texto muda enquanto a página carrega.
- **Um seletor** chama `i18n.setLocale()` ou `binding.switchToSystemLocale()`, como em [Ofereça uma opção "Sistema"](browser.md#ofereça-uma-opção-sistema), e `subscribe()` grava ou apaga o cookie.

## Próximos passos

Se o idioma de cada página mora na URL dela, como na maioria dos sites renderizados no servidor e dos estáticos, continue em [URLs localizadas](localized-urls.md). Ela lê o locale do caminho, monta links para outros idiomas, traduz a página "sobre" da loja para `/sobre` e lista todas as páginas de que um build estático precisa.
