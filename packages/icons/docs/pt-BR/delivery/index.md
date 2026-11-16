---
title: Comparação
description: As quatro formas como classes de ícone viram regras de máscara CSS, os entrypoints do pacote por trás delas e como escolher.
group: Métodos de entrega
order: 2
source: 69a59c4a23d6377d5c1011d208033585d1cb9427
---

# Como os ícones chegam ao seu CSS

Todo método de entrega produz as mesmas regras de máscara CSS e entende exatamente as mesmas classes de ícone. O que muda entre eles é de onde vêm essas regras por ícone: ou de uma folha de estilos pré-compilada contendo todos os ícones de uma família, ou de um plugin que varre o seu markup e gera apenas os ícones que você escreveu. Esta página compara todas as quatro opções para que você possa escolher a que combina com o seu build.

## Entrypoints

| Entrypoint                 | Para                         | O que entrega                                                                            |
| -------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------- |
| `@codenhub/icons`          | Todo método                  | As regras base `.ic`, cerca de 2 KB. Nunca reescritas por um plugin.                     |
| `@codenhub/icons/tw`       | Tailwind CSS v4              | Regras base mais o plugin. Toda família sem ser de marcas resolvida, só usados emitidos. |
| `@codenhub/icons/tailwind` | Tailwind CSS v4, configurado | O plugin por si só, para que `@plugin` possa receber opções.                             |
| `@codenhub/icons/<family>` | CSS puro, sem etapa de build | Uma família completa, cada ícone escrito por extenso.                                    |
| `@codenhub/icons/vite`     | Vite                         | Varre o seu markup e gera apenas as regras de que ele precisa.                           |
| `@codenhub/icons/postcss`  | PostCSS                      | O mesmo, para um pipeline PostCSS.                                                       |

`@import "@codenhub/icons"` significa uma única coisa em todo lugar: as regras base em que as classes de ícone se apoiam. Nenhum plugin a reescreve, e nenhum plugin a remove. A única peça móvel é qual mecanismo gera as regras de máscara por ícone ao lado dela.

## Escolhendo um

| Se o seu projeto…                                                | Use                             |
| ---------------------------------------------------------------- | ------------------------------- |
| Já usa Tailwind CSS v4                                           | [Tailwind](tailwind.md)         |
| Compila com Vite (ou um framework baseado em Vite)               | [Plugin do Vite](vite.md)       |
| Roda um pipeline PostCSS mas não Vite (Next.js, outros)          | [Plugin do PostCSS](postcss.md) |
| Não tem etapa de build, ou você quer a configuração mais simples | [CSS puro](plain-css.md)        |

Os métodos com plugin mantêm a saída CSS pequena sem poda manual: um projeto usando três ícones entrega cerca de 10 KB de CSS. As folhas de estilos de família em CSS puro fazem a troca oposta — zero configuração de build em troca de entregar todos os ícones da família, onde só o Lucide tem cerca de 1,3 MB e todas as 17 famílias juntas chegam a cerca de 39 MB.

Uma capacidade também depende de uma etapa de build: o modificador de espessura do traço `ic-lucide-heart/1.5` precisa do Tailwind, Vite ou PostCSS, porque folhas de estilos em CSS puro renderizam famílias baseadas em traço na espessura original. Veja [Conceitos](../concepts.md) para o modelo compartilhado.

## A seguir

Leia o guia do método que você escolheu — começando por [CSS puro](plain-css.md) se quiser zero configuração — ou pule direto para [Frameworks](../frameworks/index.md) para a integração com Astro, Next.js e SvelteKit.
