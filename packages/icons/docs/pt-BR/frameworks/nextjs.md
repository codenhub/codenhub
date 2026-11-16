---
title: Next.js
description: O Next.js não tem pipeline Vite, então use Tailwind v4, o plugin do PostCSS ou imports de família em CSS puro.
order: 2
source: f91845ade64b6316bedb5943f428c1bfb8c42893
---

# Next.js

O Next.js compila com webpack ou Turbopack em vez de Vite, então o `@codenhub/icons/vite` fica no banco dessa vez. Os outros três métodos de entrega funcionam como esperado — e como todos os três produzem CSS puro, o App Router, React Server Components e streaming não são afetados em nada.

## Tailwind CSS v4

Se a sua aplicação Next.js já roda Tailwind v4 via `@tailwindcss/postcss`, um único import na sua folha de estilos global resolve tudo:

```css
/* app/globals.css */
@import "tailwindcss";
@import "@codenhub/icons/tw";
```

Apenas os ícones que o seu markup usa são emitidos. Veja [Tailwind CSS](../delivery/tailwind.md).

## Plugin do PostCSS

Sem Tailwind, registre o plugin do PostCSS em `postcss.config.mjs` e passe globs de `content` cobrindo cada diretório onde moram classes de ícone — o PostCSS inspeciona apenas o texto da folha de estilos e `content`, sem enxergar o grafo de módulos:

```js
import lucide from "@codenhub/icons/data/lucide";
import icons from "@codenhub/icons/postcss";

export default {
  plugins: [
    icons({
      families: [lucide],
      defaultPrefix: "lucide",
      content: ["./app/**/*.{tsx,jsx,mdx}", "./components/**/*.{tsx,jsx}"],
    }),
  ],
};
```

Mantenha `@import "@codenhub/icons";` no topo de `app/globals.css` para as regras base. Veja [Plugin do PostCSS](../delivery/postcss.md).

## CSS puro

Zero configuração e nenhum plugin do PostCSS, trocando tamanho de folha de estilos por simplicidade:

```css
/* app/globals.css */
@import "@codenhub/icons";
@import "@codenhub/icons/lucide";
```

Veja [CSS puro](../delivery/plain-css.md).

## Veja também

- [Métodos de entrega](../delivery/index.md) — como os métodos se comparam.
- [Conceitos](../concepts.md) — resolução de nomes e as formas de markup.
- [SvelteKit](sveltekit.md) — o equivalente baseado em Vite, se quiser comparar as configurações.
- [API JavaScript](../javascript-api.md) — próximo passo na ordem de leitura, para geração programática de CSS ou SVG.
