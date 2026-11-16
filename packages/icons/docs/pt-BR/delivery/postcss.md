---
title: Plugin do PostCSS
description: Varre a folha de estilos e os arquivos que você listar, depois adiciona as regras base e as regras de máscara de que essas classes precisam.
order: 4
source: ccc1cace12ab5568a0c49b3dfcdfc770bddd0136
---

# Plugin do PostCSS

Para builds que rodam PostCSS sem Vite nem Tailwind — na maioria das vezes Next.js — o plugin do PostCSS varre suas folhas de estilos e globs de `content`, depois adiciona as regras base e apenas as regras de máscara que o seu markup usa.

```ts
import lucide from "@codenhub/icons/data/lucide";
import postcssIcons from "@codenhub/icons/postcss";

postcssIcons({
  content: ["./src/**/*.html"],
  families: [lucide],
  defaultPrefix: "lucide",
  injectBase: true,
  attribution: "auto",
});
```

Ele compartilha as mesmas opções `families`, `defaultPrefix`, `prefix` e `strokeWidth` do [plugin do Vite](vite.md). Como o PostCSS não tem um pipeline próprio de assets, `attribution` aceita apenas `auto` e `off`, e não existe `mode: "svg"`.

| Opção           | Finalidade                                                                   |
| --------------- | ---------------------------------------------------------------------------- |
| `content`       | Arquivos e globs para varrer em busca de classes de ícone.                   |
| `families`      | Famílias para resolver. Nada é empacotado por padrão.                        |
| `defaultPrefix` | Família contra a qual um nome sem qualificação é resolvido.                  |
| `injectBase`    | Se deve adicionar as regras base `.ic`. Padrão é `true`.                     |
| `prefix`        | Prefixo de classe. Padrão é `ic`.                                            |
| `strokeWidth`   | Padrão para famílias baseadas em traço cujas classes não trazem modificador. |
| `attribution`   | `auto` ou `off`. Veja [Licenciamento](../licensing.md).                      |
| `registry`      | Um `IconRegistry` preparado, substituindo `families`.                        |

## Varredura

Diferente do plugin do Vite, este plugin não enxerga o grafo de módulos do bundler. Quando ele roda sobre uma folha de estilos, ele vê apenas o próprio texto daquela folha de estilos e os arquivos casados por `content` — nada mais. Liste globs cobrindo todos os lugares onde suas classes de ícone moram (componentes, templates, HTML), ou apenas classes escritas literalmente dentro do seu CSS serão resolvidas:

```ts
postcssIcons({
  content: ["./app/**/*.{tsx,jsx,mdx}", "./components/**/*.{tsx,jsx}"],
  families: [lucide],
  defaultPrefix: "lucide",
});
```

O plugin roda uma vez para cada folha de estilos que processa, então associe-o a uma única folha de estilos global em vez de rodá-lo em todo CSS module.

## Veja também

- [Métodos de entrega](index.md) — como os métodos se comparam.
- [Frameworks](../frameworks/index.md) — próximo passo na ordem de leitura, cobrindo Astro, Next.js e SvelteKit.
- [Frameworks: Next.js](../frameworks/nextjs.md) — o principal motivo para recorrer ao PostCSS em vez do Vite.
