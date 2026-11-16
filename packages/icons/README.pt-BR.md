<!-- source: 965df1f1344b6de7db801484a24588f1c85f98c0 -->

# @codenhub/icons

Sistema de ícones zero-runtime para a web. Escreva `ic-lucide-heart` no seu markup e o ícone chega como uma máscara CSS — sem imports, sem componentes, sem biblioteca de ícones no seu bundle. Uma classe só, sem JavaScript parado no bundle só para desenhar um coração.

O `@codenhub/icons` entrega 15 famílias principais de ícones geradas, somando mais de 36.000 ícones, cada uma com os avisos de licença que a sua arte exige, para que um projeto possa adotar ícones sem gastar uma tarde inteira conferindo licenças na mão. Duas famílias opt-in de marcas acrescentam logotipos: `simple-icons`, com mais de 3.000 em uma única cor da marca cada, como GitHub e npm, e `logos`, com mais de 2.000 coloridos, como Google e Slack. Marcas registradas continuam sujeitas às diretrizes de uso de seus respectivos proprietários.

## Instalação

```sh
pnpm add @codenhub/icons
```

## Uso

Os ícones chegam ao projeto via CSS. Escolha o entrypoint que combina com o seu pipeline; todos eles entendem as mesmas classes.

### Tailwind CSS v4

Uma linha. Toda família, exceto as famílias de marcas `simple-icons` e `logos`, pode ser resolvida, e o Tailwind emite apenas os ícones que o seu markup usou. Para usar uma família de marcas, declare o plugin manualmente com `families`, como em [Tailwind](docs/pt-BR/delivery/tailwind.md).

```css
@import "tailwindcss";
@import "@codenhub/icons/tw";
```

### CSS puro, sem etapa de build

Importe as regras base e depois uma folha de estilos por família. Cada família vem completa, então nada precisa varrer o seu markup — você troca tamanho de arquivo por zero configuração de build.

```css
@import "@codenhub/icons";
@import "@codenhub/icons/lucide";
```

### Vite ou PostCSS

Os plugins varrem o seu markup e geram apenas as regras de que ele precisa, mantendo a saída enxuta sem Tailwind.

```ts
// vite.config.ts
import lucide from "@codenhub/icons/data/lucide";
import viteIcons from "@codenhub/icons/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [viteIcons({ content: ["./src/**/*.{html,ts,tsx}"], defaultPrefix: "lucide", families: [lucide] })],
});
```

```css
@import "@codenhub/icons";
```

### Sem ferramenta de build

O comando `chi build` lê os seus arquivos e escreve uma folha de estilos com as regras base e só os ícones que eles usam, para um projeto que não roda Tailwind CSS, Vite nem PostCSS. Rode-o a partir de um script do `package.json`, ou como `npx @codenhub/icons build`, como em [Comando de build](docs/pt-BR/delivery/cli.md).

```sh
chi build --content "app/views/**/*.erb" --output public/icons.css
```

### O markup

Um ícone é um elemento com uma classe de ícone — um `<i>`, ou `.ic` em qualquer elemento seu.

```html
<!-- isolado -->
<i class="ic-lucide-heart" aria-hidden="true"></i>

<!-- ícone ao lado de um rótulo: um elemento real dentro do controle -->
<button class="btn"><i class="ic-lucide-check" aria-hidden="true"></i>Submit</button>

<!-- .ic, para um componente que renderiza sua própria tag (métodos baseados em CSS) -->
<span class="ic ic-lucide-search" aria-hidden="true"></span>

<!-- espessura do traço, para famílias desenhadas com traço -->
<i class="ic-lucide-heart/1.5" aria-hidden="true"></i>

<!-- um tamanho da escala -->
<i class="ic-lucide-search ic-lg" aria-hidden="true"></i>

<i class="ic-lucide-loader-circle ic-anim-spin" aria-hidden="true"></i>
```

Tamanho e cor seguem custom properties: defina `--ic-size` e `--ic-color` no ícone ou em qualquer ancestral. As classes `ic-xs`–`ic-xl` são atalhos que definem `--ic-size` com um valor em rem; o padrão é `1em`. Os ícones são pintados na cor do texto, exceto os ícones de marca, que chegam na cor da própria marca até que `--ic-color` diga o contrário: `:root { --ic-color: currentColor; }` deixa todos os ícones monocromáticos. Não há `::before`, `::after` nem forma para controle de formulário — para um ícone em `background-image`, resolva a `url()` com `getIconMaskUrl` / `getIconCssProps`.

## Documentação

- [Visão geral da documentação](docs/pt-BR/index.md): o que é o pacote, instalação e a configuração mínima que funciona.
- [Conceitos](docs/pt-BR/concepts.md): famílias, como encontrar nomes de ícones, resolução de nomes, cor, espessura do traço, tamanho e acessibilidade.
- [Métodos de entrega](docs/pt-BR/delivery/index.md): CSS puro, Tailwind CSS v4, o plugin do Vite e o plugin do PostCSS.
- [Frameworks](docs/pt-BR/frameworks/index.md): configuração para Astro, Next.js e SvelteKit.
- [API JavaScript](docs/pt-BR/javascript-api.md): o registro, renderizadores e adaptador para conjuntos de terceiros.
- [Licenciamento](docs/pt-BR/licensing.md): modos de atribuição e o que cada build deve incluir.
- [Solução de problemas](docs/pt-BR/troubleshooting.md): quando o ícone não renderiza nada, vira um quadrado sólido ou sai na largura errada.
- [Referência da API](docs/reference/index.md) (em inglês): cada export dos entrypoints raiz, `/vite`, `/postcss` e `/play`, gerado a partir do código-fonte.

## Requisitos

| Requisito      | Detalhes                                                                                                                                                             |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Node.js        | 26 ou mais recente, para os plugins, helpers e `chi build` em tempo de build.                                                                                        |
| Imports de CSS | O ferramental do projeto precisa resolver imports de CSS de pacotes.                                                                                                 |
| Navegadores    | Precisa suportar CSS `mask-image`, usado por todos os métodos exceto o modo SVG inline. Máscaras animadas foram testadas no Chromium; Firefox e Safari não testados. |
| Tailwind CSS   | Versão 4 ou mais recente, e apenas para os entrypoints `/tw` e `/tailwind`.                                                                                          |
| Opcional       | `vite` >= 5.0.0 para o plugin do Vite, `postcss` >= 8.0.0 para o plugin do PostCSS.                                                                                  |

## Observações

- Um ícone é identificado por `prefix:name`, escrito como `ic-prefix-name` em uma classe, como em `ic-material-symbols-rounded-home`.
- O pacote não define nenhuma família padrão, porque ninguém chega a um acordo se o ícone de fechar se chama `x` ou `times`. Um `ic-heart` sem qualificação só é resolvido onde você disser o que ele significa: por `defaultPrefix` nos plugins do Vite e do PostCSS, por `default:` no plugin do Tailwind ou, no caminho sem plugin, pela última folha de estilos de família importada que o define. Uma família que não tem um ícone com esse nome não reivindica o seletor curto, então uma família anterior continua respondendo por ele, e as folhas de estilos das famílias de marcas não reivindicam nenhum nome curto.
- A espessura do traço é um modificador na classe do ícone, `ic-lucide-heart/1.5`, e se aplica apenas a famílias desenhadas com traço. Ela precisa de um dos plugins: uma folha de estilos sem plugin não tem como saber quais espessuras você quer, então nela as famílias são renderizadas na espessura original.
- Um ícone é um `<i>` (ou `.ic` em qualquer elemento, nos métodos baseados em CSS). Não há `::before`, `::after` nem forma para controle de formulário: um ícone ao lado de um rótulo é um `<i>` real dentro do controle, e um ícone em `background-image` vem de `getIconMaskUrl` / `getIconCssProps`.
- `anim` é reservado para os [utilitários de movimento](docs/pt-BR/concepts.md#movimento); nomes de ícones não podem ser `anim` nem começar com `anim-`, e os nomes exatos `on-hover` e `trigger` também são reservados.
- `xs`, `sm`, `md`, `lg` e `xl` são reservados (`ic-xs`–`ic-xl` formam a escala de tamanho): nenhuma família pode usar um deles como prefixo nem entregar um ícone com esse nome.
- O tamanho segue `--ic-size`, com padrão `1em`. As classes `ic-xs`–`ic-xl` definem cada uma um valor em rem (`0.75`, `0.875`, `1`, `1.25`, `1.5`) e nada mais, então combinam com um modificador de traço. Um `<svg>` inline vindo do renderizador ou de `mode: "svg"` traz uma caixa própria de `1em` e respeita `--ic-size` por meio das regras base.
- A folha `/lucide` e as outras folhas de estilos de família são grandes por construção — uma família inteira, porque nada a está filtrando, e `dist/css` soma cerca de 39 MB considerando todas as 17. Importe só as famílias que você usa, ou use Tailwind ou um plugin, que emitem apenas o que o seu markup pediu.
- `mode: "svg"` no plugin do Vite reescreve tags `<i class="ic-...">` em SVG inline e nada mais. Uma classe em outro elemento não ganha ícone nesse modo; o plugin avisa quando encontra uma.
- A arte animada vem de `line-md` (1.222 ícones) e `svg-spinners` (46 indicadores de carregamento). `ic-on-hover` mostra a arte estática em repouso e a reproduz no hover só com CSS. Ícones de execução única voltam a tocar em todo hover, e não só no primeiro, com o helper opcional `@codenhub/icons/play`. As máscaras do Line MD ficam estáticas quando há preferência por movimento reduzido; o SVG inline mantém a animação. Veja [Famílias animadas](docs/pt-BR/concepts.md#famílias-animadas) para configuração e limites nos navegadores.
- Os nomes dos ícones seguem os da família original: os nomes do Material Symbols mantêm seus sublinhados, como em `ic-material-symbols-rounded-check_circle`.

## Licença

Este pacote é licenciado sob a licença [Apache-2.0](LICENSE).

A arte de ícones gerada e empacotada junto vem de terceiros, sob os termos das licenças ISC, MIT, Apache-2.0 e CC0. Veja [NOTICE](NOTICE) para a lista completa. Cada folha de estilos de família abre com o seu próprio aviso, e os plugins emitem os avisos das famílias que um build realmente usou, então quem consome o pacote não carrega nenhuma obrigação separada por elas; veja na documentação as opções de `attribution` que controlam isso. As famílias de marcas `simple-icons` e `logos` não exigem aviso de licença, mas suas marcas são marcas registradas de seus proprietários: usar uma delas está sujeito às diretrizes da marca do proprietário, o que nenhuma configuração de build satisfaz. Um conjunto de terceiros adotado com `adoptIconifySet` não está coberto — quem consome continua responsável pelos termos de licença e pelo material de atribuição dele.
