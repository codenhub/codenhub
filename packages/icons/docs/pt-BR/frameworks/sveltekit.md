---
title: SvelteKit
description: O SvelteKit compila sobre o Vite e arquivos .svelte são varridos automaticamente, então o plugin do Vite quase não precisa de configuração.
order: 3
source: 3de12bc69592d9d50c4fa15a6d9c70281001b947
---

# SvelteKit

O SvelteKit compila sobre o Vite, e o plugin do Vite varre todo módulo `.svelte` que o Vite transforma. O único passo extra é o mesmo de que o Astro precisa: o SvelteKit renderiza páginas por conta própria em vez de usá-las como entradas HTML do Vite, então a folha de estilos gerada precisa ser importada manualmente.

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

Depois importe as duas folhas de estilos no layout raiz, para que toda página as carregue:

```svelte
<!-- src/routes/+layout.svelte -->
<script>
  import "../app.css";
  import "virtual:icons.css";

  let { children } = $props();
</script>

{@render children()}
```

O plugin injeta a folha de estilos pelo hook `transformIndexHtml` do Vite, que o SvelteKit nunca roda nas suas páginas, então o import `virtual:icons.css` é o que coloca as regras de máscara na página. Sem ele, as regras base continuam valendo e todo ícone renderiza como um quadrado sólido na sua cor.

Mantenha a entrada `content`. A folha de estilos é gerada quando o layout a importa, e um build pode chegar a esse import antes que o Vite tenha transformado todos os componentes, então `content` é o que garante que cada classe esteja nela. Ela também garante a primeira pintura correta em dev. `mode: "svg"` também funciona diretamente em arquivos `.svelte`.

## Outros métodos

[Tailwind CSS v4](../delivery/tailwind.md) e [CSS puro](../delivery/plain-css.md) funcionam no SvelteKit do mesmo jeito que em qualquer outro lugar. Uma single-page app no Vite com um `index.html`, como uma feita com Vue ou Solid, recebe a folha de estilos injetada e não precisa de import no layout; um framework que renderiza o próprio HTML, como Nuxt ou SolidStart, precisa do import assim como o SvelteKit.

## Veja também

- [Plugin do Vite](../delivery/vite.md) — referência completa de opções e o modelo de varredura.
- [Métodos de entrega](../delivery/index.md) — como os métodos se comparam.
- [API JavaScript](../javascript-api.md) — próximo passo na ordem de leitura, para geração programática de CSS ou SVG.
