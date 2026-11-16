---
title: API JavaScript
description: O registro, os renderizadores, carregamento de famílias sob demanda e o adaptador para conjuntos de ícones de terceiros.
order: 4
source: c89d2972553157d08e4acb07d7edb7118f920a12
---

# API JavaScript

Os plugins do Tailwind, Vite e PostCSS são camadas finas em cima de um conjunto pequeno de helpers exportados. Recorra a essas funções diretamente quando você gerar CSS ou SVG fora de um bundler, carregar famílias de ícones sob demanda em runtime, animar ícones a partir de eventos da aplicação ou montar um `IconRegistry` pré-configurado para um plugin reutilizar.

```ts
import { generateIconSetCss, getIconCssProps, IconRegistry, renderSvg } from "@codenhub/icons";
import lucide from "@codenhub/icons/data/lucide";

const registry = new IconRegistry({ defaultPrefix: "lucide" });
registry.registerFamily(lucide);

const heart = registry.resolve("lucide:heart");
renderSvg(heart!, { strokeWidth: 1.5 });

const { css, families } = generateIconSetCss(["ic-lucide-heart", "ic-lucide-heart/1.5"], registry);

getIconCssProps("lucide:x", registry);
// { "--ic-uri": 'url("data:image/svg+xml;…")', "--ic-mask": "var(--ic-uri)" }
```

`generateIconSetCss` retorna tanto o CSS gerado quanto a lista de `families` de onde ele veio, para que quem chama saiba quais avisos de licença pertencem ao banner. Cada export e opção está documentado na [referência da API](../reference/index.md) (em inglês).

## Gerando CSS fora de um bundler

No fundo, todo plugin só executa uma varredura seguida de uma emissão de CSS. Você pode rodar exatamente o mesmo pipeline em duas etapas num script de build ou gerador estático:

```ts
import { generateIconSetCss, IconRegistry, renderAttributionBanner, scanFiles } from "@codenhub/icons";
import lucide from "@codenhub/icons/data/lucide";

const registry = new IconRegistry({ defaultPrefix: "lucide" });
registry.registerFamily(lucide);

const classes = scanFiles(["./src/**/*.html"]);
const { css, families } = generateIconSetCss(classes, registry);
const banner = renderAttributionBanner(families); // undefined quando nenhuma família usada tem linha de aviso para imprimir
const stylesheet = banner ? `${banner}\n${css}` : css;
```

`scanFiles` aceita caminhos de arquivo literais e padrões glob, e pula em silêncio qualquer arquivo que não consiga ler em vez de derrubar o seu script por causa de um erro de permissão perdido.

Se você quiser uma folha de estilos completa de uma família — o mesmo formato que `@codenhub/icons/<family>` entrega — chame `generateFamilyCss`. Para uma família de marcas, passe `bareNames: false`, como faz a folha de estilos publicada dela, para que uma marca com o mesmo nome de um ícone principal nunca reivindique a classe curta desse ícone. Ambos os geradores de CSS emitem uma propriedade `--ic-static-mask` para que a folha de estilos base a troque no repouso de hover e sob movimento reduzido sempre que um ícone fornecer `staticBody`; o registro preserva esse markup SVG interno opcional em `ResolvedIcon`. Ele compartilha a geometria do corpo animado e aceita a mesma espessura de traço. `renderSvg`, em contraste, mantém o `body` animado. Veja [Famílias animadas](concepts.md#famílias-animadas).

## Um ícone em `background-image`

A folha de estilos base estiliza ícones em um elemento (`<i>` ou `.ic`) ou um `<svg>` inline. Quando o CSS coloca o ícone num lugar sem elemento interno — um controle de formulário customizado, um afixo de input ou um pseudo-elemento `::before` seu — resolva a `url()` em JavaScript e passe-a para o seu CSS por conta própria:

```ts
getIconMaskUrl("lucide:search", registry); // 'url("data:image/svg+xml;…")'
getIconCssProps("lucide:search", registry); // { "--ic-uri": …, "--ic-mask": "var(--ic-uri)" }
```

`getIconMaskUrl` também aceita uma string bruta começando com `<svg` e a codifica diretamente sem consultar um registro — passe o markup do elemento em si, sem espaços em branco no início nem declaração XML. `getIconCssProps` inclui `--ic-static-mask` quando o ícone resolvido fornece arte estática, que a folha de estilos base usa para movimento reduzido e repouso de hover. Ela retorna exatamente o objeto de custom properties que um atributo `style` inline ou objeto CSS-in-JS espera; combine essas propriedades com `background-image: var(--ic-uri)` ou `mask-image: var(--ic-mask)` e o seu próprio dimensionamento.

## Reproduzindo ícones via código

`@codenhub/icons/play` é um entrypoint opt-in para comportamento de reprodução que o CSS não consegue resolver sozinho. Ele não carrega dados de ícones, e apenas importá-lo não faz nada até você chamar uma de suas duas funções:

```ts
import { bindIconPlayback, playIcon } from "@codenhub/icons/play";

// Repete arte de execução única em todo hover, não só no primeiro:
const unbind = bindIconPlayback();

// Reproduz um ícone num evento, como uma cópia bem-sucedida:
copyButton.addEventListener("click", async () => {
  await navigator.clipboard.writeText(value);
  playIcon(copyButton.querySelector(".ic-anim-beat")!);
});

// Quando a página ou componente for desmontado:
unbind();
```

`playIcon(element, { prefix: "ic" })` reinicia um ícone a partir do quadro zero, quer ele use uma classe `ic-anim-*` (rodando ou terminada) ou arte SVG animada. Para movimento do glifo, ele limpa brevemente `animation-name` durante um recálculo de estilo e o restaura. Para um ícone em máscara CSS, ele escreve uma data URL SVG nova na propriedade inline `--ic-mask`, porque os navegadores se recusam a reiniciar uma imagem de máscara animada que já pintaram uma vez. Uma chamada direta deixa essa sobrescrita inline no elemento, então limpe-a com `element.style.removeProperty("--ic-mask")` antes de trocar a classe do ícone depois. Ícones `<svg>` inline reiniciam via `setCurrentTime(0)`. Um elemento sem nenhum dos dois tipos de movimento fica intacto.

`bindIconPlayback(root = document, { prefix: "ic" })` chama `playIcon` para todo ícone `ic-on-hover` quando seu gatilho é ativado, seguindo exatamente a mesma regra de gatilho do CSS: o próprio ícone, seu pai ou qualquer ancestral `ic-trigger` no hover ou `:focus-visible`. O CSS sozinho já reinicia movimento de glifo e arte em loop em todo hover; esse binder é o que permite que arte de execução única, como um desenho de entrada do Line MD, toque novamente em todo hover em vez de apenas no primeiro. Ele anexa listeners delegados, então ícones montados depois funcionam automaticamente. Passe uma subárvore contendo tanto os gatilhos quanto os ícones para limitar o escopo. Mover o ponteiro entre filhos dentro do mesmo gatilho preserva a reprodução ativa e, quando o gatilho termina, o binder limpa sua sobrescrita inline de `--ic-mask` para que mudanças futuras na classe do ícone funcionem normalmente. Chamar a função de limpeza retornada remove os listeners e limpa sobrescritas ativas.

Passar um `prefix` personalizado altera juntos as classes, a custom property e os nomes de animação que ambas as funções miram. Ambas as funções não fazem nada quando o dispositivo pede movimento reduzido: ícones em máscara CSS mantêm o fallback estático, enquanto SVG inline mantém a própria arte animada, então substitua pela arte estática por conta própria quando precisar. Chamar `bindIconPlayback` sem `root` fora de um navegador retorna uma função de limpeza vazia. A reprodução no Chrome é verificada; Firefox e Safari não foram testados. Veja [Movimento](concepts.md#movimento) para os controles CSS.

## Carregando uma família sob demanda

Numa interface de navegador como um seletor de ícones, empacotar todas as famílias de saída pesaria megabytes. Em vez disso, registre loaders assíncronos para que as famílias só carreguem quando alguém pedir por elas:

```ts
registry.registerLoader("phosphor", () => import("@codenhub/icons/data/phosphor"));

await registry.resolveAsync("phosphor:heart");
```

`resolve` continua síncrono e verifica apenas famílias já em memória, enquanto `resolveAsync` carrega a família pedida primeiro. Plugins em tempo de build ficam no caminho síncrono porque um build conhece suas famílias configuradas antes de começar a varrer.

## Conjuntos de ícones de terceiros

`adoptIconifySet` converte um documento IconifyJSON para o formato de família que este pacote espera. Ele lê os ícones, os aliases e suas dimensões, além do nome, autor e licença do conjunto; outros campos do IconifyJSON, como categorias, não são transferidos:

```ts
import { adoptIconifySet } from "@codenhub/icons";

registry.registerFamily(adoptIconifySet(someIconifySet, { attribution: "notice" }));
```

Passe `attribution: "credit"` no lugar quando a licença do conjunto adotado exigir crédito visível de autoria, como CC-BY.

Conjuntos adotados pertencem ao nível `extended`: a promessa de licenciamento que este pacote faz cobre as famílias que ele gera, não dados que quem consome fornece. Veja [Licenciamento](licensing.md).

## A seguir

Leia [Licenciamento](licensing.md) para ver qual atribuição o seu build emite em cada método de entrega e quais obrigações valem para conjuntos principais, de marca e adotados.
