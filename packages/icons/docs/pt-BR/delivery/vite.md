---
title: Plugin do Vite
description: Varre o markup que o Vite transforma, mais quaisquer globs que você listar, e serve apenas as regras de máscara de que precisa.
order: 3
source: 5b2824dab3c360911a7c471f1d7277e32fffda81
---

# Plugin do Vite

Quando o seu build roda no Vite sem Tailwind, o plugin do Vite varre os seus arquivos e serve apenas as regras de máscara CSS que o seu markup usa — ou reescreve tags `<i class="ic-...">` direto para SVGs inline se você preferir não ter nenhuma folha de estilos por ícone.

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

| Opção           | Finalidade                                                                               |
| --------------- | ---------------------------------------------------------------------------------------- |
| `families`      | Famílias para resolver. Nada é empacotado por padrão.                                    |
| `defaultPrefix` | Família contra a qual um nome sem qualificação é resolvido. Não há padrão.               |
| `content`       | Arquivos e globs para varrer, além do que o build transforma.                            |
| `prefix`        | Prefixo de classe. Padrão é `ic`.                                                        |
| `strokeWidth`   | Padrão para famílias baseadas em traço cujas classes não carregam modificador.           |
| `mode`          | `css` serve regras de máscara; `svg` troca `<i class="ic-...">` por SVG inline no build. |
| `attribution`   | `auto`, `file` ou `off`. Veja [Licenciamento](../licensing.md).                          |
| `registry`      | Um `IconRegistry` preparado, substituindo `families`.                                    |

A folha de estilos gerada é servida como `virtual:icons.css` e injetada em todo entrypoint HTML. `@import "@codenhub/icons";` fica intacto — ele resolve pela condição de export `style` do pacote para as regras base `.ic` e significa a mesma coisa havendo ou não um plugin no pipeline. Mantenha-o na sua folha de estilos; o plugin adiciona as regras por ícone ao redor dele, e não no lugar dele.

## Varredura

`content` aceita caminhos literais e padrões glob como `src/**/*.{html,tsx}`, expandidos quando a varredura roda. Caminhos relativos são resolvidos a partir do [`root`](https://vite.dev/config/shared-options.html#root) do Vite, combinando com a forma como o Vite resolve seus próprios caminhos, então a mesma configuração funciona independentemente do diretório de onde você lançar o build. `content` é aditivo: o plugin também varre todo arquivo-fonte que o Vite transforma, então você só precisa de `content` para arquivos que o bundler nunca vê — e para primeiras renderizações limpas em dev.

A varredura em tempo de transformação lê todo módulo que o Vite transforma, seja qual for a extensão. Um arquivo que o Vite nunca transforma só é visto por meio de `content`, assim como uma classe em um módulo transformado depois que a folha de estilos foi gerada, o que pode acontecer quando um framework importa a folha de estilos por conta própria, como fazem Astro e SvelteKit. Veja [Frameworks](../frameworks/index.md). Note que isso se aplica apenas à geração da folha de estilos; o [modo SVG inline](#modo-svg-inline) reescreve um conjunto separado de tipos de arquivo.

Em dev, o Vite serve o shell HTML antes de transformar um único módulo JavaScript, então uma classe de ícone escrita apenas dentro de um módulo de componente ainda é um mistério quando a página carrega pela primeira vez. Para não deixá-la em branco, o modo dev serve a folha de estilos como um módulo em vez de colocá-la inline, e o plugin invalida esse módulo sempre que uma transformação revela uma classe nova — o ícone chega sem recarregar a página. Listar seus arquivos-fonte em `content` pula essa viagem extra de atualização desde o início, porque os arquivos são lidos do disco logo de cara.

No modo `css`, um build de produção com entradas HTML grava a folha de estilos como um asset CSS nomeado pelo hash do conteúdo, `assets/codenhub-icons-[hash].css` por padrão, e a vincula a partir de toda entrada HTML. Como um build transforma todos os módulos antes de emitir o HTML, esse arquivo já contém toda classe que o build viu. Um build sem entradas HTML, como um build de biblioteca, não emite folha de estilos, e o [modo SVG inline](#modo-svg-inline) também não. Um asset de folha de estilos vinculado não precisa de nonce nem hash em uma Content Security Policy: `style-src 'self'` o permite quando servido da origem da página. Com um `base` em outra origem, como uma CDN, a política precisa permitir essa origem, como já precisa para o próprio CSS do Vite. Duas alternativas foram rejeitadas:

- **Um `<style>` inline**. Uma política sem `'unsafe-inline'`, nonce ou hash o recusa, então todo ícone renderizaria em branco em produção enquanto em dev, que usa um script de módulo de mesma origem, continua funcionando.
- **Uma opção `nonce` no plugin.** O próprio [`html.cspNonce`](https://vite.dev/config/shared-options#html-cspnonce) do Vite já carimba um nonce nas tags do HTML compilado, e um nonce exige um servidor que envie um novo a cada resposta, algo que um host estático não consegue fazer.

## Modo SVG inline

`mode: "svg"` pula completamente a geração de folha de estilos e reescreve tags `<i class="ic-...">` em elementos `<svg>` inline em tempo de build. Ele reescreve tags `<i>` e nada mais: uma classe de ícone em outro elemento — ou `.ic` num `<span>` — não renderiza nada nesse modo porque não existe folha de estilos para fornecer a máscara. O plugin avisa em tempo de build quando encontra uma classe de ícone num elemento que ele não vai reescrever, nomeando a classe e o arquivo.

A arte SVG animada mantém sua animação SMIL nesse modo, inclusive quando há preferência por movimento reduzido: o CSS não consegue parar o SMIL. O fallback estático do Line MD, e `ic-on-hover` segurando a arte em repouso, valem apenas no modo CSS; classes de movimento do glifo funcionam em ambos. O helper opcional `@codenhub/icons/play` reinicia um SVG inline com `setCurrentTime(0)`; ele pula reinícios sob movimento reduzido, mas não para uma animação SMIL já em andamento. Veja [Famílias animadas](../concepts.md#famílias-animadas) para temporização e limites nos navegadores.

Migrar um projeto existente a partir do modo CSS exige mais do que virar uma flag de configuração, porque o elemento que chega ao navegador muda de `<i>` para `<svg>`. Confira dois detalhes que o seu antigo `<i>` resolvia em silêncio:

- **Tamanho.** O `<svg>` renderizado traz uma caixa de `1em` como atributo de apresentação, então um ícone renderiza no tamanho do texto mesmo sem nenhuma folha de estilos. O CSS ainda vence isso: mantenha `@import "@codenhub/icons"` numa folha de estilos e as regras base dimensionam o `<svg>` inline a partir de `--ic-size` exatamente como dimensionam um `<i>`, então definir `--ic-size` num ancestral e as classes `ic-xs`–`ic-xl` funcionam. Sem esse import, o ícone fica fixo em `1em`.
- **`hidden`.** `[hidden] { display: none }` é uma regra do navegador para elementos HTML, e um ícone inline está no namespace SVG, então o atributo deixa de escondê-lo. Um script que alterna um ícone precisa de uma regra explícita `[hidden] { display: none }`, e uma checagem escrita como `instanceof HTMLElement` para de casar — um elemento SVG não é um `HTMLElement`.

Uma limitação é nova para logotipos. Cerca de 400 ícones de `logos` desenham com gradientes, máscaras ou clip paths, referenciados por `id`. Os ids de cada logotipo levam o nome dele como prefixo, então dois logotipos diferentes nunca colidem, mas duas cópias do mesmo logotipo compartilham os mesmos ids, e o navegador desenha ambas as cópias a partir da primeira. Se essa primeira cópia estiver dentro de um elemento oculto com `display: none`, como num menu mobile recolhido, toda cópia posterior renderiza em branco (observado no Chromium). Mantenha uma cópia visível antes da oculta, esconda com `visibility: hidden` no lugar ou use o modo CSS para um logotipo que aparece mais de uma vez, já que lá cada imagem de máscara é um documento próprio. O mesmo vale para `renderSvg` e [um módulo por ícone](#um-módulo-por-ícone).

A reescrita cobre `.html`, `.js`, `.jsx`, `.ts`, `.tsx`, `.vue`, `.svelte` e `.astro`. Um arquivo `.astro` é reescrito nas duas metades, com seu frontmatter escapado como JavaScript e seu template mantido como markup; arquivos `.vue` e `.svelte` se dividem da mesma forma, com o template lido como markup e `<script>` como JavaScript. Um ícone escrito como elemento JSX recebe os nomes de atributo do React, como `strokeWidth`, e um objeto `style` quando o projeto usa `@vitejs/plugin-react` ou `@vitejs/plugin-react-swc`; Solid, Preact e Vue JSX recebem os nomes do HTML, que passam direto para o DOM. `content` não participa no modo `svg` porque alimenta a geração de folha de estilos, que esse modo pula.

Escreva cada classe de ícone por extenso como string literal para que o plugin possa enxergá-la: uma classe montada em tempo de execução, como `` `ic-${name}` ``, é invisível em tempo de build. No modo CSS esse elemento simplesmente fica sem regra; no modo `svg` não há folha de estilos nenhuma para recorrer, então o elemento não renderiza nada. Sempre que o nome do ícone vier de estado ou dados em tempo de execução, use [um módulo por ícone](#um-módulo-por-ícone) — é o padrão suportado e funciona nos dois modos.

## Um módulo por ícone

Quando um ícone é escolhido dinamicamente em tempo de execução, importe um módulo virtual para aquele ícone em vez de empacotar uma família inteira:

```ts
const { svg } = await import("virtual:@codenhub/icons/lucide/heart");
element.innerHTML = svg;
```

O módulo exporta o markup renderizado tanto como `svg` quanto como export padrão (`default`), além do objeto do ícone resolvido como `icon`. O `<svg>` traz a classe qualificada do ícone (como `ic-lucide-heart` sob o `prefix` configurado), igual ao modo SVG inline, então as regras base o dimensionam e colorem via `--ic-size`, `--ic-color` e as classes `ic-xs`–`ic-xl`. Ele não traz o atributo `aria-hidden`: adicione-o você mesmo para um ícone decorativo, ou dê `role="img"` e um rótulo a um ícone significativo. Cada import vira seu próprio módulo, permitindo que o bundler faça code splitting e tree-shaking até chegar a ícones individuais. Um caminho sem qualificação como `virtual:@codenhub/icons/close` resolve pelo seu prefixo padrão configurado como qualquer outro nome curto, e um ícone desconhecido faz o build falhar ruidosamente em vez de entregar um elemento em branco.

## Veja também

- [Métodos de entrega](index.md) — como os métodos se comparam.
- [Plugin do PostCSS](postcss.md) — o próximo método de entrega, para builds PostCSS sem Vite.
- [Frameworks](../frameworks/index.md) — Astro e SvelteKit se apoiam neste plugin.
- [API JavaScript](../javascript-api.md) — preparando um `registry` manualmente.
