---
title: CSS puro
description: Importe as regras base e uma folha de estilos por família — sem etapa de build, sem varredura de markup.
order: 1
source: b0111dd4833c8706823684268e86feb7ad99a949
---

# CSS puro, sem etapa de build

CSS puro é o caminho sem nenhuma configuração: importe as regras base e depois importe uma folha de estilos pré-compilada para cada família que você quiser. Toda folha de estilos de família já traz o catálogo completo, então nada precisa varrer o seu markup.

```css
@import "@codenhub/icons";
@import "@codenhub/icons/phosphor-fill";
@import "@codenhub/icons/lucide";
```

Cada regra carrega dois seletores compartilhando uma única cópia da arte: o qualificado `ic-lucide-heart` e o curto `ic-heart`. É assim que o CSS puro ganha uma família padrão sem nenhuma configuração de plugin para guardá-la — pela ordem padrão da cascata CSS, a última família que você importar vence todo nome curto que ela define. Acima, `ic-heart` é o do Lucide.

As famílias de marcas são a exceção educada. `@codenhub/icons/simple-icons` e `@codenhub/icons/logos` emitem apenas nomes qualificados como `ic-logos-google`, então importar uma por último nunca sequestra `ic-x` nem `ic-play`.

## Custo

Como nada varre o seu markup para podar ícones não usados, as folhas de estilos de família entregam todos os glifos de saída: Lucide tem cerca de 1,3 MB, Material Symbols Rounded cerca de 3,9 MB, a família colorida `logos` cerca de 6,5 MB, Line MD cerca de 3,0 MB incluindo sua arte estática para movimento reduzido, e todas as 17 famílias juntas chegam a cerca de 39 MB. Você controla o orçamento importando apenas as famílias que realmente usa. Se isso ainda parecer pesado para três botões e uma barra lateral, troque para Tailwind, Vite ou PostCSS para que só os ícones que você escreveu cheguem à saída.

O Line MD traz arte estática para movimento reduzido e para `ic-on-hover` em repouso. Adicione `ic-on-hover` para tocar a arte no hover só com CSS; repetir arte de execução única em todo hover, e não apenas no primeiro, precisa do helper opcional `@codenhub/icons/play`. O SVG Spinners mantém a animação de carregamento. Veja [Famílias animadas](../concepts.md#famílias-animadas) para temporização de execução única e limites nos navegadores.

## Limitações

A espessura do traço não funciona no CSS puro. A espessura é gravada na arte de cada regra, e uma folha de estilos estática sem uma etapa de build por trás não tem como saber quais espessuras de traço os seus templates pediram, então famílias baseadas em traço renderizam na espessura original.

## Veja também

- [Métodos de entrega](index.md) — como os métodos se comparam.
- [Tailwind CSS](tailwind.md) — o próximo método de entrega, se você quiser emissão sob demanda com um único import.
- [Frameworks](../frameworks/index.md) — configuração específica de framework depois que você escolher um método de entrega.
- [Conceitos](../concepts.md) — resolução de nomes e as formas de markup.
