---
title: Visão geral
description: Qual método de entrega escolher por framework e as particularidades específicas de cada um.
group: Frameworks
order: 3
source: 25109196aa74b79a3f0fe5013b94bf5d61e54b5b
---

# Configuração por framework

Todo framework consome o `@codenhub/icons` por meio de um dos [métodos de entrega](../delivery/index.md). A maioria dos frameworks baseados em Vite funciona de saída sem um guia dedicado, enquanto alguns têm pipelines de build ou extensões de template com exigências próprias. Esta seção cobre os três que valem o destaque.

| Framework                           | Método recomendado                                  | Observações                                                                                                        |
| ----------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| [Astro](astro.md)                   | CSS puro ou Tailwind v4; plugin do Vite com cuidado | `.astro` não é varrido automaticamente pelo plugin do Vite — passe `content`.                                      |
| [Next.js](nextjs.md)                | Tailwind v4 ou plugin do PostCSS                    | Sem pipeline Vite, então o plugin do Vite não se aplica.                                                           |
| [SvelteKit](sveltekit.md)           | Plugin do Vite                                      | `.svelte` é varrido automaticamente; é o fluxo mais limpo com plugin.                                              |
| Vue, SolidStart, Nuxt, Remix (Vite) | Plugin do Vite                                      | Siga [SvelteKit](sveltekit.md); `.vue` é varrido automaticamente como `.svelte`.                                   |
| Qualquer framework                  | CSS puro                                            | Imports de família em [CSS puro](../delivery/plain-css.md) funcionam em qualquer lugar que resolva CSS de pacotes. |

Se o seu framework não estiver na tabela e compilar com Vite, siga o guia do [SvelteKit](sveltekit.md). Se compilar com webpack ou outro host PostCSS, siga [Next.js](nextjs.md). E se você só quiser ícones na tela sem nenhuma configuração extra no build, [CSS puro](../delivery/plain-css.md) funciona em qualquer lugar ao custo de folhas de estilos maiores.

## A seguir

Escolha o guia de framework acima que combina com a sua stack — começando pelo [Astro](astro.md) — ou siga para a [API JavaScript](../javascript-api.md) quando precisar de controle programático fora do build de um framework.
