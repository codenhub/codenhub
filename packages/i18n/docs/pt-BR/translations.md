---
title: Escreva as suas traduções
description: Dicionários, arquivos JSON, placeholders, mensagens ICU, links e negrito, plurais, formatadores, chaves e valores tipados, verificação de chaves não traduzidas e limites de tamanho.
order: 1
source: ca0eb0ec045a8496d4093ca8e0d62be3e848435b
---

# Escreva as suas traduções

Um dicionário é um objeto simples cujos valores são strings ou outros objetos. Esta página mostra como organizar dicionários, carregá-los, colocar valores e quantidades no texto, manter o TypeScript conferindo tudo isso e manter todos os idiomas completos.

Ela parte dos dicionários `en` e `pt` da loja de chá, da [visão geral](index.md#passo-a-passo). No fim, a loja consegue cumprimentar um cliente pelo nome, somar o carrinho dele, dizer quando o pedido sai e pegar uma palavra em português que esteja faltando antes que um cliente pegue.

## Formato do dicionário

Aninhe as chaves para agrupar textos relacionados. Toda folha precisa ser uma string:

```json
{
  "nav": { "home": "Home", "cart": "Cart" },
  "product": {
    "title": "Our teas",
    "shipping": { "label": "Shipping", "hint": "Free on orders over 50 euros" }
  }
}
```

O gerenciador achata o aninhamento em chaves separadas por pontos: `nav.home`, `product.shipping.hint`. Você também pode escrever chaves planas diretamente, como `{ "nav.home": "Home" }`, ou misturar os dois jeitos, desde que duas grafias nunca produzam a mesma chave.

Um dicionário é rejeitado com um `TypeError` quando contém qualquer uma destas coisas:

- Algo que não é texto nem grupo, como um número, um array ou `null`.
- Uma chave que o gerenciador não consegue usar, como `"nav..home"` ou `" home"` com um espaço no começo.

O erro diz o locale e a chave, como em `[I18n] Invalid locale dictionary key "nav. home" in locale "pt".`; [Um dicionário é rejeitado](troubleshooting.md#um-dicionário-é-rejeitado) passa por cada regra e o conserto de cada uma.

Um dicionário vazio não tem problema. Um locale que você adicionou mas ainda não traduziu inicia normalmente e mostra o texto do locale padrão em todo lugar.

## Guarde os dicionários em arquivos JSON

A maioria dos apps guarda um arquivo JSON por locale, muitas vezes porque tradutores ou um serviço de tradução os editam, e um arquivo JSON é mais fácil de entregar do que um TypeScript:

```text
src/locales/
  en.json
  pt.json
```

Carregue-os com um `import()` dinâmico, para que o visitante baixe só os idiomas de que o gerenciador precisa: o dele e mais o seu idioma padrão, como fallback:

```ts
import { createI18n } from "@codenhub/i18n";
import type en from "./locales/en.json";

export const i18n = createI18n({
  locales: ["en", "pt"] as const,
  defaultLocale: "en",
  async loadLocale(locale): Promise<typeof en> {
    const module = await import(`./locales/${locale}.json`);
    return module.default;
  },
});
```

Isso compartilha um gerenciador pelo app inteiro no navegador. No servidor ou num build estático, embrulhe `createI18n()` numa função e chame-a para cada requisição ou página, como [Renderize no servidor](server-rendering.md#um-gerenciador-por-requisição) explica.

O tipo de retorno `Promise<typeof en>` é o que te dá chaves tipadas: um import dinâmico devolve `any`, que de outro jeito deixaria passar qualquer string. O `import type` precisa de `"resolveJsonModule": true` no seu `tsconfig.json` e nunca vai parar no seu bundle.

Para buscar os dicionários num servidor, devolva o JSON já interpretado, lance um erro quando a resposta falhar e desista depois de um tempo:

```ts
async loadLocale(locale): Promise<typeof en> {
  const response = await fetch(`/locales/${locale}.json`, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`Locale request failed: ${response.status}`);
  return response.json();
}
```

O `throw` faz o gerenciador reportar a falha em vez de carregar a sua página 404 como dicionário. O timeout importa mais do que parece; a próxima seção diz por quê.

O seu loader é dono de tudo o que diz respeito ao transporte: URLs, cabeçalhos de cache, novas tentativas, timeouts e credenciais. O gerenciador só o chama e confere o que volta.

### Como o carregamento funciona

- O gerenciador carrega um locale na primeira vez que precisa dele e guarda o resultado, então voltar para um idioma não chama o seu loader de novo.
- Iniciar ou trocar para um locale que não é o padrão carrega esse locale, os locales para os quais ele faz fallback e o locale padrão, todos juntos, como [Variantes regionais](#variantes-regionais) explica.
- Se o seu loader lançar um erro ou for rejeitado, a chamada que precisava dele é rejeitada com um `I18nError`, e o gerenciador mantém o idioma atual. A próxima chamada tenta o loader de novo. [Carregar um locale falha com `I18nError`](troubleshooting.md#carregar-um-locale-falha-com-i18nerror) mostra como mostrar esse erro ao visitante.
- Enquanto um locale está carregando, toda outra chamada que precisa dele espera pelo mesmo carregamento em vez de chamar o seu loader de novo. Então um loader que nunca termina, como um `fetch()` para um servidor que aceita a conexão e depois não diz mais nada, trava aquele locale para sempre. Todo `setLocale()` posterior para ele, botão de "tentar de novo" incluído, espera pela mesma promise empacada. Faça o seu loader ter timeout, como com `AbortSignal.timeout()` acima; um timeout rejeita, e a próxima chamada tenta de novo.
- Devolver o mesmo objeto toda vez, como um import no nível do módulo, deixa todos os gerenciadores compartilharem uma única cópia verificada. Isso importa no servidor, que [cria um gerenciador por requisição](server-rendering.md).
- Trate um dicionário como somente leitura depois de carregado. O gerenciador guarda uma cópia congelada e verificada, compartilhada por todo gerenciador que carrega o mesmo objeto, então mudanças posteriores no objeto não fazem nada.

## Variantes regionais

Um locale regional só precisa das palavras que mudam. A loja quer um "Oi" mais descontraído para os visitantes brasileiros, onde o português geral dela diz "Olá", então ela acrescenta `pt-BR` ao lado de `pt`. Com os dois em `locales`, o dicionário `pt-BR` pode guardar só as palavras brasileiras, e todas as outras chaves vêm de `pt`:

```ts
export const i18n = createI18n({
  locales: ["en", "pt", "pt-BR"] as const,
  defaultLocale: "en",
  loadLocale: (locale) => dictionaries[locale],
});
// pt-BR: { home: { greeting: "Oi, {name}!" } }
// pt:    { home: { title: "Bem-vindo", greeting: "Olá, {name}!" }, ... }
await i18n.init({ locale: "pt-BR" });
t("home.greeting", { name: "Ana" }); // "Oi, Ana!"
t("home.title"); // "Bem-vindo", vindo de pt
```

Uma chave é procurada nesta ordem:

1. O locale ativo.
2. Cada locale configurado que se obtém tirando as últimas subtags, como `zh-Hant` para `zh-Hant-TW`. Um pai escrito em outra escrita é pulado: `zh` é chinês simplificado, então uma página `zh-Hant` faz fallback para o padrão em vez de misturar escritas. Um código de idioma obsoleto conta como o que o substituiu, como o `Intl` o lê, então `he-IL` faz fallback para um `iw` configurado, e `iw-IL` para `he`. `no` e `nb` contam como um idioma só, como na [correspondência](index.md#transforme-entrada-externa-em-um-locale).
3. O locale configurado nomeado pelo seu idioma e escrita, como `zh-Hant` para `zh-HK`, que é escrito em chinês tradicional, ou `sr-Latn` para `sr-ME`. Assim um dicionário `zh-HK` pode conter só o que Hong Kong diz de outro jeito.
4. O locale padrão.

Um grupo de plural usa as regras do locale cujo dicionário o contém.

Todo locale dessa cadeia carrega junto com o ativo, então iniciar em `pt-BR` carrega `pt-BR`, `pt` e `en`. Se um deles falhar, a chamada é rejeitada como para qualquer locale.

Só esses pais contam. `es-MX` não faz fallback para `es-419`, porque `es-419` não é nem uma versão mais curta dele nem o seu idioma e escrita. Dê a ele um dicionário próprio, ou atenda os visitantes mexicanos diretamente com `es-419`, como mostra [Transforme entrada externa em um locale](index.md#transforme-entrada-externa-em-um-locale).

## Coloque valores no texto

Escreva `{name}` onde vai um valor e passe o valor para `t()`:

```json
{ "order": { "confirmed": "Thanks, {name}. Order {orderId} ships tomorrow." } }
```

```ts
t("order.confirmed", { name: "Ana", orderId: "1042" });
// "Thanks, Ana. Order 1042 ships tomorrow."
```

Os valores podem ser strings, números, bigints ou datas. Um bigint vai onde vai um número, e é formatado sem perder dígitos. Os nomes de placeholder usam letras ASCII, dígitos e `_`, como `{firstName}` ou `{first_name}`. Um nome com qualquer outra coisa, como `{first-name}` ou `{nome_ç}`, não é placeholder: a mensagem tem sintaxe inválida, registra um aviso e mostra `{first-name}` como foi escrito.

Use placeholders em vez de juntar pedaços. `t("before") + name + t("after")` prende todos os idiomas à ordem das palavras do inglês, enquanto uma frase inteira com um placeholder deixa cada tradução pôr o valor onde ele cabe. A ordem das palavras é a primeira coisa que todo tradutor quer mudar, e quase sempre ele tem razão. Para um link ou negrito dentro da frase, veja [Links e negrito dentro de uma frase](#links-e-negrito-dentro-de-uma-frase).

Alguns detalhes:

- Um placeholder sem valor correspondente fica como foi escrito, então um valor que falta aparece como `{name}` na tela em vez de sumir.
- Uma chamada de `t()` preenche no máximo 100 argumentos, contando os que ficam dentro de formas de plural e de select, e deixa o resto como foi escrito. Uma frase de interface nunca chega nem perto; o limite impede que uma mensagem enorme vinda da rede custe um passo de formatação por placeholder.
- Um número num `{name}` simples é formatado para o leitor, como `{name, number}` faz: `1234.5` aparece como "1,234.5" em inglês e "1.234,5" em português. Escreva `{name, number, integer}` ou outro estilo, como mostra a próxima seção, para formatá-lo de outro jeito.
- Chaves (`{` e `}`) e apóstrofos são sintaxe de mensagem, então um texto que os mostra literalmente precisa de aspas; veja [Chaves literais e apóstrofos](#chaves-literais-e-apóstrofos).

### Formate números e datas no texto

As mensagens usam a sintaxe [ICU MessageFormat](https://unicode-org.github.io/icu/userguide/format_parse/messages/), então uma tradução pode dizer como cada valor é escrito:

```json
{
  "cart": {
    "total": "Total: {amount, number}",
    "discount": "{rate, number, percent} off"
  },
  "order": {
    "shipped": "Shipped on {date, date, long} at {date, time, short}"
  }
}
```

```ts
t("cart.total", { amount: 1234.5 }); // "Total: 1,234.5", ou "Total: 1.234,5" a partir do texto em português
t("cart.discount", { rate: 0.15 }); // "15% off"
t("order.shipped", { date: new Date() });
```

| Argumento               | Estilos                                                           | Valor                    |
| ----------------------- | ----------------------------------------------------------------- | ------------------------ |
| `{n, number}`           | nenhum, `integer`, `percent`                                      | número ou bigint         |
| `{d, date}`             | `short`, `medium` (o padrão), `long`, `full`                      | `Date` ou um timestamp   |
| `{d, time}`             | `short`, `medium` (o padrão), `long`, `full`                      | `Date` ou um timestamp   |
| `{n, plural, …}`        | veja [Plurais](#plurais)                                          | número ou bigint         |
| `{n, selectordinal, …}` | formas ordinais, como `one {#st} two {#nd} few {#rd} other {#th}` | número ou bigint         |
| `{v, select, …}`        | quaisquer palavras, mais `other`                                  | string, número ou bigint |

A formatação usa o idioma do dicionário de onde o texto veio, então um texto em inglês que cobre uma chave que falta em português é escrito do jeito inglês. Um argumento cujo valor tem o tipo errado, como uma string para `{n, number}`, fica como foi escrito.

Duas coisas que as mensagens não fazem, as duas de propósito:

- **Skeletons e moeda.** `{n, number, ::currency/EUR}` e `{n, number, currency}` são sintaxe inválida: uma tradução não tem como saber em que moeda está o valor. Formate o valor no código, como abaixo, e passe a string.
- **Aninhamento além de 10 níveis.** Um `plural` ou `select` pode ficar dentro das opções de outro, até 10 níveis de profundidade. Um 11º nível é tratado como sintaxe inválida. Se uma mensagem estiver chegando perto disso, ela já cresceu demais para ser uma mensagem só; divida-a.

Um `select` escolhe o texto por um valor, como um pronome, e precisa de uma opção `other`:

```json
{ "review": { "replied": "{gender, select, female {She} male {He} other {They}} replied to your review" } }
```

Para formatar um valor no código, use os formatadores do gerenciador. Eles seguem o locale ativo:

```ts
i18n.formatNumber(9.99, { style: "currency", currency: "EUR" }); // "€9.99"
i18n.formatDate(new Date(), { dateStyle: "long" }); // "November 2, 2026"
i18n.formatRelativeTime(-1, "day", { numeric: "auto" }); // "yesterday"
i18n.formatList(["Ana", "Bia", "Caio"]); // "Ana, Bia, and Caio"
```

Eles aceitam as mesmas opções que `Intl.NumberFormat`, `Intl.DateTimeFormat`, `Intl.RelativeTimeFormat` e `Intl.ListFormat`. Eles leem essas opções do mesmo jeito que o `Intl` lê, inclusive as opções que um objeto herda, como de um objeto de padrões compartilhado passado para `Object.create()`. Eles lançam o mesmo que aqueles lançam para opções inválidas.

### Fusos horários

Datas e horas são escritas no fuso horário do runtime. No navegador, é o do leitor, o que normalmente está certo. No servidor, é o do servidor.

Assim, um pedido enviado à 01:00 UTC de 2 de novembro aparece como "November 2" para um leitor em São Paulo, onde ainda é 1º de novembro, e o texto muda quando o navegador assume. Fusos horários: o motivo de uma data nunca ser só uma data. Defina `timeZone` com o fuso que o texto deve usar:

```ts
createI18n({
  // ...
  timeZone: "America/Sao_Paulo",
});
```

Ele vale para `{d, date}`, `{d, time}` e uma data em `{d}`, e é o padrão de `formatDate`; `formatDate(value, { timeZone: "UTC" })` continua sobrescrevendo-o. Um fuso que o `Intl` não conhece lança um `TypeError` quando o gerenciador é criado. No servidor, defina-o por requisição, como em [Mostre datas no fuso horário do leitor](server-rendering.md#mostre-datas-no-fuso-horário-do-leitor).

### Chaves literais e apóstrofos

Um apóstrofo antes de `{` ou `}` põe entre aspas o texto até o próximo apóstrofo, e dois apóstrofos viram um. Um apóstrofo em qualquer outro lugar é um apóstrofo comum, então "Don't" não precisa de nada:

| Escrito no dicionário     | Mostrado                |
| ------------------------- | ----------------------- |
| `Don't forget {name}`     | `Don't forget Ana`      |
| `Type '{name}' to insert` | `Type {name} to insert` |
| `It''s '{'here'}'`        | `It's {here}`           |
| `Ouvrir l''{app}`         | `Ouvrir l'éditeur`      |
| `Ouvrir l’{app}`          | `Ouvrir l’éditeur`      |

Cuidado com um apóstrofo logo antes de um placeholder, como a elisão do francês, do italiano e do catalão coloca. `Ouvrir l'{app}` põe `{app}` entre aspas, então mostra `Ouvrir l{app}`, e nada avisa, porque o texto é válido. Escreva dois apóstrofos, `l''{app}`, ou o apóstrofo tipográfico `’`, que a tipografia francesa prefere de qualquer jeito e que nunca é sintaxe.

Dentro das formas de um plural, `#` representa o número; escreva `'#'` para um `#` literal. Um `select` aninhado numa forma não é o próprio plural, então um `#` ali aparece como foi escrito, como no ICU; use `{count}` ali.

Texto entre aspas também é texto para os tipos: em `'{it''s {x}'`, que mostra `{it's {x}`, `x` não é um valor que `t()` pede.

Um texto que não é sintaxe válida, como uma `{` sem fechamento ou uma `}` perdida, registra um aviso, a menos que o gerenciador esteja em silêncio, e aparece com apenas os placeholders `{name}` preenchidos. O aviso diz a chave e o locale, e vem uma vez para cada texto em cada locale, entre os 1.000 mais recentes. [Encontre chaves não traduzidas](#encontre-chaves-não-traduzidas) mostra um teste que confere todas as mensagens.

### Links e negrito dentro de uma frase

Uma frase com um link no meio continua sendo uma frase só. Quebrá-la em `t("before")`, um link e `t("after")` prende a ordem das palavras, como juntar pedaços faz. Marque a parte com uma tag e chame `rich()`, que devolve o texto e as tags dele como dados para o seu framework renderizar:

```json
{ "signup": { "terms": "Ao se cadastrar você aceita os <terms>termos de uso</terms>." } }
```

```ts
i18n.rich("signup.terms");
// ["Ao se cadastrar você aceita os ", { tag: "terms", children: ["termos de uso"] }, "."]
```

Uma tag é `<nome>…</nome>`, ou `<nome/>` para uma sem conteúdo, como uma quebra de linha. Os nomes usam letras ASCII, dígitos e `_`. Uma tag diz o que a parte é, e o seu código decide como ela é renderizada, então uma tradução não consegue adicionar um link, um script nem marcação que o seu código não renderize. No React, por exemplo:

```tsx
import { Fragment, type ReactNode } from "react";
import type { RichText } from "@codenhub/i18n";

type Tags = Readonly<Record<string, (children: ReactNode) => ReactNode>>;

// Uma tag que o seu código não renderiza mostra o conteúdo dela sem ela.
const render = (parts: RichText, tags: Tags): ReactNode[] =>
  parts.map((part, index) => {
    if (typeof part === "string") {
      return part;
    }
    // Só uma propriedade própria, para que uma tag como `<constructor>` nunca chegue a uma função herdada.
    const tag = Object.hasOwn(tags, part.tag) ? tags[part.tag]! : (children: ReactNode) => children;
    return <Fragment key={index}>{tag(render(part.children, tags))}</Fragment>;
  });

<p>{render(i18n.rich("signup.terms"), { terms: (children) => <a href="/terms">{children}</a> })}</p>;
```

Alguns detalhes:

- `rich()` aceita as mesmas chaves e valores que `t()`, conferidos do mesmo jeito. Um valor é sempre texto: um `<b>` no nome de um visitante aparece como foi escrito e nunca é lido como tag.
- Uma tag pode envolver placeholders, um plural ou um select, e pode ficar dentro de uma forma de um plural ou select, mas uma tag aberta numa forma precisa fechar nessa forma.
- Um `<` que não forma uma tag, como em `1 < 2`, é texto.
- Uma mensagem cujas tags não fecham, como `<b>negrito` sem `</b>`, ou se aninham mais de 10 níveis, registra um aviso uma vez para cada texto em cada locale, a menos que o gerenciador seja silencioso, e volta como uma parte só: o texto como `t()` mostra, com as tags. Uma chave que falta e a sintaxe inválida também voltam como a única parte que `t()` devolveria.
- As tags não são conferidas nos tipos, já que uma tradução pode usar tags que o texto padrão não tem. Renderize todas as tags que as suas mensagens usam e tenha uma alternativa para o resto, como acima.
- `t()` e o binding de `data-i18n` mostram as tags como foram escritas. Renderize pelo seu código uma mensagem com tags usando `rich()`.

## Plurais

"1 items" está errado em inglês, e outros idiomas têm mais formas do que o inglês. O árabe tem seis. Para deixar cada idioma escolher, escreva a chave como um grupo de formas em vez de uma string só. O carrinho da loja já faz isso:

```json
{
  "cart": {
    "items": {
      "one": "{count} item",
      "other": "{count} items"
    }
  }
}
```

Depois passe um número como `count`:

```ts
t("cart.items", { count: 1 }); // "1 item"
t("cart.items", { count: 5 }); // "5 items"
```

O gerenciador pergunta ao `Intl.PluralRules` embutido qual forma o idioma usa para aquele número, e `count` também preenche o placeholder `{count}`. Os nomes das formas são as [categorias de plural do CLDR](https://cldr.unicode.org/index/cldr-spec/plural-rules) padrão:

| Forma   | Usada para                                                                                        |
| ------- | ------------------------------------------------------------------------------------------------- |
| `zero`  | Idiomas com uma forma para zero, como árabe e letão. O inglês usa `other` para 0.                 |
| `one`   | Singular. O francês e o português do Brasil (`pt`, `pt-BR`) também a usam para 0; o `pt-PT` não.  |
| `two`   | Dual, como em árabe, hebraico e galês.                                                            |
| `few`   | Números pequenos, como 2–4 em polonês e tcheco.                                                   |
| `many`  | Números grandes em alguns idiomas, como polonês e árabe.                                          |
| `other` | Todo o resto. **Sempre inclua essa**; ela é o fallback de qualquer forma que você deixar de fora. |

Cada dicionário só precisa das formas que o próprio idioma usa: o arquivo em inglês tem `one` e `other`, e o arquivo em árabe tem as seis. Consulte as formas de um idioma na [tabela de regras de plural do CLDR](https://www.unicode.org/cldr/charts/latest/supplemental/language_plural_rules.html).

Quando um grupo de plural falta no locale atual, é usado o grupo do locale padrão, com as regras do idioma padrão, já que aquele texto está no idioma padrão.

Três coisas a observar:

- **`count` precisa ser um número ou um bigint.** Uma string como `"5"` não escolhe forma nenhuma; o grupo então é tratado como chave que falta. Converta o valor onde ele entra, como `Number(params.get("count"))`. O gerenciador não adivinha, já que `"1,5"` é um e meio em português e não é número nenhum para o JavaScript.
- **Uma string simples na mesma chave ganha das formas.** Se `cart.items` for uma string, `count` só preenche `{count}`.
- **Sem `other`, não é um grupo de plural.** `{ "one": "…", "two": "…" }` só funciona para as quantidades cuja forma por acaso esteja ali; qualquer outra quantidade mostra a chave. `has()` diz que um grupo assim não é uma chave, e as chaves tipadas não o oferecem. Acrescente `other`.

### Plurais no meio da frase

Um grupo de plural escolhe o texto inteiro. Para escolher só uma parte da frase, ou para dar ao `0` um texto próprio, escreva um plural ICU numa única string. `#` é o número, formatado para o idioma, e `=N` corresponde a um número exato antes de as formas serem consultadas:

```json
{
  "cart": {
    "summary": "Hi {name}, {count, plural, =0 {your cart is empty} one {you have # item in your cart} other {you have # items in your cart}}."
  }
}
```

```ts
t("cart.summary", { name: "Ana", count: 0 }); // "Hi Ana, your cart is empty."
t("cart.summary", { name: "Ana", count: 1200 }); // "Hi Ana, you have 1,200 items in your cart."
```

`=N` compara números, e não texto, então `=1`, `=1.0` e `=01` correspondem todos a 1. Isso também faz com que dois deles numa mesma mensagem sejam a mesma opção duas vezes: `{n, plural, =1 {…} =1.0 {…} other {…}}` é sintaxe inválida. Escreva cada número uma vez só.

`offset:N` subtrai do número antes de escolher a forma e preencher o `#`, mas não antes de comparar com `=N`. Uma página de produto pode usar isso para dizer quem mais comprou um chá:

```json
{
  "product": {
    "buyers": "{count, plural, offset:1 =0 {Nobody} =1 {{name}} one {{name} and # other} other {{name} and # others}}"
  }
}
```

Com `count` igual a 2, `t("product.buyers", { name: "Ana", count: 2 })` mostra `Ana and 1 other`.

Os dois jeitos de escrever plurais são suportados. Os grupos de plural mantêm cada forma como uma chave comum, o que algumas ferramentas de tradução lidam melhor.

## Chaves tipadas

Quando o TypeScript consegue ver o tipo do seu dicionário, `t()` só aceita chaves que existem:

```ts
t("cart.items", { count: 2 }); // ok: um grupo de plural
t("cart.items.one"); // ok: uma forma isolada também é uma chave
t("cart"); // erro de compilação: um grupo de textos não é uma chave
t("cart.itmes", { count: 2 }); // erro de compilação: grafia errada
```

O tipo vem do que o seu loader devolve. Se ele devolve vários dicionários `as const`, uma chave de qualquer um deles é aceita. Se ele devolve `any` ou `unknown`, como fazem `response.json()` e os imports dinâmicos, qualquer string é aceita; dê um tipo de retorno ao loader, como no exemplo com JSON acima, para ter a verificação de volta.

Uma chave que você monta em tempo de execução, como ``t(`errors.${code}`)`` para um código de erro vindo do checkout, falha na compilação mesmo quando existe, porque o TypeScript não tem como saber o valor de `code`. Confira-a com `has()`, que a estreita para uma chave que `t()` aceita, e escolha um fallback quando ela não estiver lá:

```ts
const key = `errors.${code}`;
const message = i18n.has(key) ? i18n.t(key) : i18n.t("errors.unknown");
```

`has()` procura nos mesmos dicionários que `t()`:

- Um grupo de plural conta como chave quando tem uma forma `other`, seja qual for o idioma ativo. `t()` só lê um grupo com um `count` numérico, então, quando a chave pode ser um grupo, passe-o, como em `i18n.t(key, { count })`; sem ele, `t()` não encontra a chave e chama `onMissingKey`.
- Uma falta não chama `onMissingKey` nem avisa, já que uma chave que você espera que às vezes falte não é uma lacuna nas traduções.
- Uma string que nenhum dicionário consegue guardar, como uma com quebra de linha ou com mais de 1.000 caracteres sem contar os espaços das pontas, também é uma falta, então `code` pode vir de uma resposta ou de uma query string.

Quando você sabe que as chaves estão lá, faça um cast:

```ts
import type { TranslationKey } from "@codenhub/i18n";
import type en from "./locales/en.json";

type Key = TranslationKey<typeof en>;

t(`errors.${code}` as Key);
```

`TranslationKey` também é útil para tipar uma prop de componente ou um helper que recebe uma chave.

### Valores tipados

Quando o dicionário padrão é um objeto `as const` num arquivo `.ts`, o TypeScript vê o texto de cada mensagem, e `t()` também confere os valores dela:

```ts
// locales/en.ts
export default {
  home: { greeting: "Hello, {name}!" },
  cart: {
    total: "Total: {amount, number}",
    items: { one: "{count} item", other: "{count} items" },
  },
} as const;
```

```ts
t("home.greeting", { name: "Ana" }); // ok
t("home.greeting"); // erro de compilação: name é obrigatório
t("cart.total", { amount: "3" }); // erro de compilação: {amount, number} precisa de um número
t("cart.items", { count: 2 }); // ok: um grupo de plural exige um count numérico
```

Quais valores cada argumento aceita:

- Argumentos `number`, `plural` e `selectordinal` aceitam um número ou um bigint.
- `date` e `time` aceitam um `Date` ou um timestamp.
- `select` aceita uma string, um número ou um bigint.
- Um `{name}` simples aceita qualquer um desses.

Valores a mais são permitidos. Quando vários dicionários são tipados, uma chave precisa dos valores de todos os que a têm.

Um import de JSON tipa todo texto como `string`, já que o TypeScript não guarda os valores das strings de um JSON, então um dicionário JSON confere as chaves mas aceita quaisquer valores, exceto que um grupo de plural ainda pede um `count` numérico. Para conferir os valores, escreva o idioma padrão em TypeScript com `as const` e mantenha os outros idiomas em JSON, tipados como o padrão:

```ts
import en from "./locales/en";

const loadLocale = async (locale: Locale): Promise<typeof en> => (locale === "en" ? en : (await import(`./locales/${locale}.json`)).default);
```

O tipo de retorno do loader é o que tipa `t()`, então uma tradução precisa usar os mesmos argumentos que o texto padrão; o compilador não consegue conferir os arquivos JSON.

### Quando os valores não são verificados

Ler os argumentos de uma mensagem acontece inteiramente no sistema de tipos, o que é muito esperto até o momento em que ele não consegue ver a mensagem. Nestes casos, `t()` aceita quaisquer valores, ou nenhum, para aquela chave. Nada deixa de compilar; a verificação simplesmente fica desligada:

- **A chave é uma entre várias.** Em `t(hasFailed ? "checkout.failed" : "checkout.done")`, o TypeScript vê uma união de duas chaves e não tem como saber de qual mensagem vêm os valores. Chame `t()` com cada chave no seu próprio ramo, `hasFailed ? t("checkout.failed", { orderId }) : t("checkout.done")`, e cada chamada é conferida.
- **A mensagem é uma `string` simples**, como todo texto de um dicionário JSON. Um grupo de plural ainda pede um `count` numérico, já que o formato dele diz isso. Escreva o idioma padrão em TypeScript com `as const`, como acima.
- **A mensagem tem sintaxe inválida**, como uma `{` sem fechamento, um nome de placeholder que não é feito de letras ASCII, dígitos e `_` (`{first-name}`), `{n, number, currency}`, ou um `select` ou `plural` sem `other`. Algumas sintaxes inválidas, como uma opção escrita duas vezes, uma forma de plural desconhecida ou aninhamento além de 10 níveis, ainda podem pedir valores. De um jeito ou de outro, o runtime também não consegue lê-la: ele registra um aviso e mostra o texto com apenas os placeholders `{name}` válidos preenchidos. Conserte a mensagem; a [verificação de mensagens](#encontre-chaves-não-traduzidas) encontra esses casos.
- **A mensagem é longa demais para os tipos lerem**: uns 900 apóstrofos, 450 argumentos ou 900 espaços dentro das chaves de um argumento, num só texto. O TypeScript tem um limite de profundidade para os tipos, e a leitura para antes de chegar nele em vez de quebrar o seu build. Em tempo de execução, a mensagem funciona normalmente. Se você tem uma dessas, ela provavelmente são três mensagens disfarçadas de uma; dividi-la traz as verificações de volta.
- **O tipo do gerenciador foi escrito à mão, sem o dicionário.** `I18n<"en" | "pt", Key>` confere as chaves, mas não os valores. Passe o tipo do dicionário como terceiro argumento de tipo, `I18n<"en" | "pt", Key, typeof en>`, para mantê-los conferidos.

### Escreva os tipos você mesmo

Se você mesmo escrever o tipo do gerenciador, como em `let i18n: I18n<"en" | "pt">`, passe também o tipo das chaves: `I18n<"en" | "pt", Key>`. O segundo argumento de tipo tem `string` como padrão, que aceita qualquer chave. `createI18n()` preenche isso para você.

Deixe o TypeScript inferir os tipos do gerenciador a partir da configuração. Passar alguns argumentos de tipo você mesmo, como `createI18n<"en" | "pt">(...)`, desliga a inferência para o resto, e as chaves voltam a ser `string` simples.

Se você guardar a configuração numa variável separada, marque o locale padrão com `as const`:

```ts
const config = {
  locales: ["en", "pt"] as const,
  defaultLocale: "en" as const,
  loadLocale: (locale: "en" | "pt") => dictionaries[locale],
};
```

Sem `as const`, o TypeScript vê `defaultLocale` como qualquer `string`, e `createI18n(config)` reclama que `string` não é `"en" | "pt"`.

## Encontre chaves não traduzidas

Uma chave que falta num idioma mostra, sem alarde, o texto do idioma padrão, o que é fácil de deixar passar. Os visitantes portugueses da loja vão perceber muito antes do seu dashboard. Pegue isso num teste, comparando cada dicionário com o padrão. `loadLocale()` devolve um dicionário sem mudar o idioma do gerenciador:

```ts
import { expect, test } from "vitest";
import { i18n } from "./i18n";

// As formas de plural além de `other` mudam de idioma para idioma, então não são comparadas.
// Uma chave como `settings.one` ainda é comparada, a menos que o grupo dela também tenha `other`.
const isLanguageSpecificForm = (key: string, dictionary: Readonly<Record<string, string>>) => {
  const form = /^(.+)\.(zero|one|two|few|many)$/.exec(key);
  return form !== null && `${form[1]}.other` in dictionary;
};

test("every locale has every key", async () => {
  const defaults = await i18n.loadLocale(i18n.defaultLocale);
  const reference = Object.keys(defaults).filter((key) => !isLanguageSpecificForm(key, defaults));

  for (const locale of i18n.locales) {
    const dictionary = await i18n.loadLocale(locale);
    const missing = reference.filter((key) => !(key in dictionary));
    expect(missing, `missing in ${locale}`).toEqual([]);
  }
});
```

Para pegar uma mensagem com sintaxe quebrada, como uma `{` sem fechamento que um tradutor deixou, consulte todas as chaves em todos os locales e falhe ao ver o aviso. O gerenciador não pode estar em silêncio para isso:

```ts
import { expect, test, vi } from "vitest";
import { i18n } from "./i18n";

test("every message is valid", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  await i18n.init();

  for (const locale of i18n.locales) {
    await i18n.setLocale(locale);
    for (const key of Object.keys(await i18n.loadLocale(locale))) {
      i18n.t(key as Parameters<typeof i18n.t>[0]);
    }
  }

  expect(warn.mock.calls.filter(([text]) => String(text).startsWith("[I18n] Invalid message"))).toEqual([]);
  warn.mockRestore();
});
```

Para fazer um teste falhar com chaves que faltam em todos os dicionários, como um erro de digitação numa chave montada em tempo de execução, lance um erro a partir de `onMissingKey`:

```ts
createI18n({
  // ...
  onMissingKey(key, locale) {
    throw new Error(`Missing translation "${key}" in ${locale}`);
  },
});
```

## Limites de tamanho

Os dicionários vêm de arquivos e servidores, e de vez em quando um arquivo ou servidor manda algo que nem é dicionário: um download cortado no meio, um proxy mal configurado ou algo feito de propósito para ser enorme. Por isso o gerenciador limita o tamanho que um dicionário pode ter, o que impede um arquivo corrompido ou malicioso de travar a página. Os padrões servem para qualquer app real, inclusive uma loja de chá com um cardápio bem comprido:

| Limite                         | Padrão    | Opção             |
| ------------------------------ | --------- | ----------------- |
| Profundidade de aninhamento    | 100       | `maxDepth`        |
| Traduções                      | 10.000    | `maxTranslations` |
| Chaves e grupos, somados       | 20.000    | `maxProperties`   |
| Caracteres num texto           | 100.000   | `maxValueLength`  |
| Caracteres em todos os textos  | 5.000.000 | `maxTotalLength`  |
| Caracteres numa chave completa | 1.000     | fixo              |

Aumente um deles com `dictionaryLimits`, que mantém o padrão de qualquer limite que você deixar de fora:

```ts
createI18n({
  // ...
  dictionaryLimits: { maxTranslations: 50_000, maxProperties: 100_000 },
});
```

Algumas regras para os valores:

- Cada limite precisa ser um número inteiro positivo, e um nome que não seja um dos cinco lança um `TypeError` quando o gerenciador é criado.
- Um dicionário aninhado conta cada grupo como uma propriedade, então aumentar `maxTranslations` muitas vezes significa aumentar `maxProperties` também.
- Aumentar `maxDepth` além de 499 não faz nada. Cada nível acrescenta pelo menos uma letra e um ponto à chave completa, então um texto tão fundo quebraria antes o limite fixo de 1.000 caracteres por chave.

## Próximos passos

Com os dicionários escritos, é hora de colocá-los na frente de alguém. No navegador, continue em [Traduza um app no navegador](browser.md), onde a loja ganha o seletor de idioma. No servidor ou num build estático, pule para [Renderize no servidor ou no build](server-rendering.md).
