---
title: Astro
description: CSS puro e Tailwind v4 funcionam sem configuração; o plugin do Vite funciona, mas precisa ser avisado sobre arquivos .astro.
order: 1
source: d04a2e4bd9641f9f013c6145c2e4cd5b26a75da7
---

# Astro

O Astro roda sobre o Vite, então todos os quatro [métodos de entrega](../delivery/index.md) estão na mesa. Dois deles funcionam sem nenhuma configuração específica para o Astro; o plugin do Vite pede duas linhas extras porque o Astro renderiza o HTML de produção fora do pipeline HTML próprio do Vite.

## CSS puro (sem configuração)

Importe as regras base e uma folha de estilos de família a partir de um layout ou folha de estilos global:

```css
/* src/styles/icons.css */
@import "@codenhub/icons";
@import "@codenhub/icons/lucide";
```

```astro
---
import "../styles/icons.css";
---
<i class="ic-lucide-heart" aria-hidden="true"></i>
```

O Astro resolve os exports CSS do pacote diretamente. Esse é o caminho de menor esforço — um import CSS e zero configuração — ao custo do tamanho da folha de estilos e sem modificador de espessura do traço. Veja [CSS puro](../delivery/plain-css.md).

## Tailwind CSS v4 (sem configuração)

Com o `@tailwindcss/vite` configurado, adicione um import à sua entrada do Tailwind:

```css
@import "tailwindcss";
@import "@codenhub/icons/tw";
```

Apenas os ícones que o seu markup usa são emitidos. Veja [Tailwind CSS](../delivery/tailwind.md).

## Plugin do Vite

Adicione o plugin em `astro.config.mjs`:

```js
import lucide from "@codenhub/icons/data/lucide";
import icons from "@codenhub/icons/vite";
import { defineConfig } from "astro/config";

export default defineConfig({
  vite: {
    plugins: [
      icons({
        families: [lucide],
        defaultPrefix: "lucide",
        content: ["./src/**/*.{astro,md,mdx,html}"],
      }),
    ],
  },
});
```

Depois importe a folha de estilos gerada uma única vez, a partir de um layout que toda página usa:

```astro
---
import "../styles/global.css";
import "virtual:icons.css";
---
```

As duas linhas são obrigatórias, e essa segunda é específica do Astro. Em qualquer outro lugar, o plugin do Vite injeta a folha de estilos gerada no HTML pelo hook `transformIndexHtml` do Vite. Um `astro build` de produção renderiza páginas pelo próprio pipeline do Astro em vez de usá-las como entradas HTML do Vite, então `transformIndexHtml` nunca roda nelas e esse import explícito é o que coloca as regras de máscara na página. Sem ele, o build passa, `@import "@codenhub/icons"` continua fornecendo as regras base e todo ícone renderiza como um quadrado sólido na sua cor.

A entrada `content` é obrigatória, não opcional. O plugin varre automaticamente os arquivos que o Vite transforma em busca de `.html`, `.js(x)`, `.ts(x)`, `.vue`, `.svelte` e folhas de estilos — `.astro` não está nesse conjunto, então classes escritas em templates `.astro`, `.md` ou `.mdx` só são descobertas via `content`. Liste esses globs e mantenha `@import "@codenhub/icons";` numa folha de estilos para as regras base.

Confira se toda classe que você escreve resolve em uma família que você registrou. Um nome de ícone que o registro não encontra fica sem regra e renderiza como um quadrado sólido. O modo CSS não relata nada quando isso acontece — em qualquer host, não só no Astro — então o build continua verde e a falha só aparece na página. O modo SVG inline avisa, nomeando a classe e o arquivo.

## Modo SVG inline

`mode: "svg"` funciona no Astro e reescreve tags `<i class="ic-...">` dentro de arquivos `.astro` — no template, no frontmatter e em blocos `<script>`, cada um escapado para o seu contexto. Uma tag de ícone escrita dentro de uma _string_ numa expressão de template é o único ponto em que ela é pulada, porque `{cond && <i class="ic-x" />}` contém markup e não uma string, e diferenciar os dois exigiria um parser; mova essa tag para o frontmatter ou para um componente. Tudo acima sobre entregar a folha de estilos de máscaras deixa de valer aqui: o modo `svg` não emite regras por ícone, então nem `virtual:icons.css` nem `content` fazem nada, e uma classe em qualquer elemento que não seja uma tag `<i>` não renderiza nada porque não há folha de estilos por trás.

Mantenha `@import "@codenhub/icons"` mesmo assim. Um `<svg>` inline renderiza com `1em` por conta própria, mas essa folha de estilos base é o que permite que `--ic-size` e as classes de tamanho `ic-xs`–`ic-xl` o alcancem. Veja [Plugin do Vite § Modo SVG inline](../delivery/vite.md#modo-svg-inline).

`.md` e `.mdx` não são reescritos. Uma classe de ícone escrita num desses chega à página como um elemento `<i>` vazio sem regra de máscara por trás, então renderiza como um quadrado sólido com as regras base carregadas, ou como nada sem elas. Nada avisa disso, tampouco: o alerta de classe não resolvida cobre apenas os arquivos que esse modo reescreve, então uma página assim passa no build verde e entrega ícones quebrados.

Há duas saídas para isso:

- **Em `.mdx`**, envolva o ícone num componente e renderize esse componente a partir do seu markdown: o componente mora num arquivo `.astro`, `.jsx` ou `.tsx`, todos reescritos.
- **Em `.md` puro**, que não pode importar componentes, use o modo CSS para que os globs de `content` cubram arquivos `.md` e `.mdx` como qualquer outro template.

## Veja também

- [Plugin do Vite](../delivery/vite.md) — referência completa de opções e o modelo de varredura.
- [Métodos de entrega](../delivery/index.md) — como os métodos se comparam.
- [Next.js](nextjs.md) e [SvelteKit](sveltekit.md) — os outros guias de frameworks.
- [API JavaScript](../javascript-api.md) — próximo passo na ordem de leitura, para geração programática de CSS ou SVG.
