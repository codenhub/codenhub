---
title: Tailwind CSS
description: Um único import torna resolvíveis todas as famílias que não são de marcas; o Tailwind emite apenas os ícones que o seu markup usou.
order: 2
source: f7226d9ae2440d203551516046aa203b9f501d41
---

# Tailwind CSS v4

Se o seu projeto já roda Tailwind CSS v4, adicionar ícones leva um único import — zero configuração de plugin necessária, e o Tailwind emite apenas os ícones que os seus templates realmente escreveram:

```css
@import "tailwindcss";
@import "@codenhub/icons/tw";
```

Todas as famílias que o pacote entrega são resolvíveis de fábrica, exceto as famílias de marcas `simple-icons` e `logos`, que exigem declarar `@plugin` por conta própria com `families` (abaixo). Carregar as famílias custa cerca de 150–190 ms e 112 MB uma vez por build, com as duas famílias de marcas incluídas, contra cerca de 35 ms e 53 MB para uma única família; um projeto usando três ícones termina com cerca de 10 KB de CSS.

## Configurando o plugin

Quando quiser restringir famílias, definir um prefixo padrão, mudar o prefixo de classe ou habilitar ícones de marca, declare `@plugin "@codenhub/icons/tailwind"` diretamente em vez de importar `/tw` (que já o declara sem opções):

```css
@import "tailwindcss";
@import "@codenhub/icons";
@plugin "@codenhub/icons/tailwind" {
  families: lucide, phosphor-fill;
  default: lucide;
  stroke-width: 1.5;
}
```

| Opção          | Finalidade                                                                   |
| -------------- | ---------------------------------------------------------------------------- |
| `families`     | Prefixos de família para resolver. Padrão inclui todas, exceto as de marcas. |
| `default`      | Família contra a qual nomes sem qualificação são resolvidos. Não há padrão.  |
| `prefix`       | Prefixo de classe. Padrão é `ic`.                                            |
| `stroke-width` | Aplicada a famílias baseadas em traço que não carregam modificador próprio.  |
| `attribution`  | `auto` ou `off`. Veja [Licenciamento](../licensing.md).                      |

Um detalhe sincero: restringir `families` não deixa o build mais rápido nem mais leve em memória. Como um handler de plugin do Tailwind precisa rodar de forma síncrona — utilitários registrados após um `await` são descartados silenciosamente — todas as famílias já estão carregadas antes que suas opções sejam lidas. O que `families` controla é quais nomes podem resolver e quais avisos de licença o seu CSS compilado carrega.

## Movimento

Classes de movimento e `ic-on-hover` funcionam como utilitários do Tailwind, acompanhando [Movimento](../concepts.md#movimento): `ic-on-hover` reproduz o movimento enquanto o ícone, seu pai ou um ancestral `ic-trigger` está com hover ou foco, uma vez por hover a menos que `--ic-anim-iterations` diga o contrário, e também controla arte animada:

```html
<button>
  <i class="ic-lucide-refresh-cw ic-anim-spin ic-on-hover" aria-hidden="true"></i>
  Reload
</button>
```

Como as classes de movimento são utilitários reais do Tailwind, as variantes do Tailwind continuam disponíveis para outros gatilhos. Uma variante substitui `ic-on-hover` para movimento do glifo e repete até o estado terminar:

```html
<button class="group">
  <i class="ic-lucide-loader-circle group-hover:ic-anim-spin" aria-hidden="true"></i>
  Refresh
</button>
<i class="ic-lucide-bell hover:ic-anim-wiggle" aria-hidden="true"></i>
```

Ao usar variantes, combine `group-focus-visible:ic-anim-spin` com `group-hover:ic-anim-spin` para que quem navega por teclado receba o mesmo sinal visual; `ic-on-hover` já cuida do foco automaticamente. Preferências de movimento reduzido desativam animações mesmo quando uma variante casa. Arte animada não tem forma com variante, então mantenha `ic-on-hover` ao lado da classe do ícone nesses casos. Veja [Movimento](../concepts.md#movimento) para todas as cinco classes, padrões, prefixos personalizados e limites da animação em máscara CSS.

## Atribuição

`@import "@codenhub/icons/tw"` incorpora uma folha de estilos estática, então carrega um banner `/*! … */` comum nomeando toda família que resolve — um aviso abrangente (superset) que é sempre seguro. Declarar `@plugin` manualmente restringe a resolução, e aí o aviso viaja como uma custom property `--ic-attribution-<family>` em `:root`, emitida uma vez por família que o build realmente usou. Veja [Licenciamento](../licensing.md).

## Veja também

- [Métodos de entrega](index.md) — como os métodos se comparam.
- [Plugin do Vite](vite.md) — o próximo método de entrega, para builds com Vite sem Tailwind.
- [Frameworks](../frameworks/index.md) — configuração específica de framework depois que você escolher um método de entrega.
- [Conceitos](../concepts.md) — resolução de nomes e espessura do traço.
