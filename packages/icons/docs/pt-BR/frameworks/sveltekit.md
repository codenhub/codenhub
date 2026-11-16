---
title: SvelteKit
description: O SvelteKit compila sobre o Vite e arquivos .svelte são varridos automaticamente, então o plugin do Vite quase não precisa de configuração.
order: 3
source: 3421f6a4370a257e3ecb9cceabf28f2e1b7b2126
---

# SvelteKit

O SvelteKit compila sobre o Vite, e `.svelte` já está na lista de varredura automática em tempo de transformação do plugin do Vite. Depois da ginástica de bundler no Next.js e das dicas extras de template no Astro, o SvelteKit é a configuração em que quase não sobra nada para explicar.

## Plugin do Vite

Adicione o plugin em `vite.config.ts` ao lado de `sveltekit()`:

```ts
import { sveltekit } from "@sveltejs/kit/vite";
import lucide from "@codenhub/icons/data/lucide";
import icons from "@codenhub/icons/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    sveltekit(),
    icons({
      families: [lucide],
      defaultPrefix: "lucide",
      content: ["./src/**/*.{svelte,html}"],
    }),
  ],
});
```

```css
/* src/app.css */
@import "@codenhub/icons";
```

Classes em componentes `.svelte` são capturadas pela varredura em tempo de transformação mesmo sem uma entrada em `content`. Listar `src/**/*.{svelte,html}` mesmo assim garante a primeira pintura correta em dev antes que o Vite transforme esses módulos de componente. `mode: "svg"` também funciona diretamente em arquivos `.svelte`.

## Outros métodos

[Tailwind CSS v4](../delivery/tailwind.md) e [CSS puro](../delivery/plain-css.md) funcionam no SvelteKit do mesmo jeito que em qualquer outro lugar. Vue, SolidStart e outros frameworks baseados em Vite seguem exatamente essa mesma configuração — `.vue` é varrido automaticamente igual a `.svelte`.

## Veja também

- [Plugin do Vite](../delivery/vite.md) — referência completa de opções e o modelo de varredura.
- [Métodos de entrega](../delivery/index.md) — como os métodos se comparam.
- [API JavaScript](../javascript-api.md) — próximo passo na ordem de leitura, para geração programática de CSS ou SVG.
