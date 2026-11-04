---
title: Composição
description: Consulta sobre como intenção, apresentação, estética e elevação se combinam, o visual padrão de cada componente e quais classes cada componente lê.
order: 8
source: 8aa84776103ce27781f924220cc7c621231e5734
---

# Composição

Esta é uma página de consulta. [Montando uma tela](../concepts.md) apresenta intenção, apresentação e estética; esta página tem as regras completas para combiná-las, o visual padrão de cada componente, quais classes cada componente lê e a elevação.

## Combinando classes

```html
<div class="soft">
  <button class="btn primary">Soft primary button</button>
  <span class="badge success">Soft success badge</span>
  <button class="btn primary ghost edged">Outlined: the class on the element wins</button>
</div>
```

- **A apresentação é herdada.** `.solid`, `.soft`, `.ghost`, `.edged` e `.edgeless` funcionam no componente ou em qualquer contêiner, e uma classe no elemento vence uma herdada de um contêiner. Um contêiner define o visual de tudo dentro dele, e qualquer elemento pode escolher o seu.
- **Estéticas e [tokens de material](./customizing.md#tokens-de-material) são herdados** da mesma forma.
- **A intenção não é herdada.** `.primary` e as outras classes de intenção colorem só o elemento em que estão. Um contêiner que recolorisse silenciosamente tudo dentro dele deixaria vermelho o botão neutro de cancelar de um card vermelho de zona de perigo. `.neutral` dá nome ao padrão; use-o onde um elemento receberia uma intenção, como uma linha de tabela dentro de uma tabela `.success`. Veja [Temas → Tokens de intenção](./theming.md#tokens-de-intenção).
- **A elevação não é herdada.** `.raised` eleva só o elemento em que está; veja [Elevação](#elevação).

## Padrões dos componentes

Sem nenhuma classe de apresentação nele ou em volta dele, cada componente tem o seu próprio visual. "Elevação em repouso" é quanta profundidade ele recebe quando uma [estética](./aesthetics.md) desenha profundidade; sem estética, nada tem sombra.

| Componente                       | Preenchimento | Borda     | Elevação em repouso |
| -------------------------------- | ------------- | --------- | ------------------- |
| `.btn`                           | `.solid`      | sem borda | 1                   |
| `.card`                          | `.ghost`      | com borda | 1                   |
| `.panel`                         | `.soft`       | sem borda | 0                   |
| `.alert`                         | `.soft`       | com borda | 0                   |
| `.badge`                         | `.soft`       | sem borda | 0                   |
| `.ipt`, `.textarea`, `.select`   | `.ghost`      | com borda | 0                   |
| `.input-group`                   | `.ghost`      | com borda | 0                   |
| `.checkbox`, `.radio`, `.switch` | `.soft`       | com borda | 0                   |
| `.kbd`                           | `.soft`       | com borda | 0                   |
| `.code`, `.pre`                  | `.soft`       | sem borda | 0                   |
| `.data-table`                    | `.soft`       | sem borda | 0                   |
| `.progress` (o trilho)           | `.soft`       | sem borda | 0                   |
| `.tooltip-bubble`                | `.solid`      | com borda | 0                   |
| `.quote`                         | `.ghost`      | com borda | 0                   |
| `.skeleton`, `.divider`          | Só a intenção | Nenhuma   | 0                   |

Um `.solid` neutro preenche só até 20%; veja [Temas → Tokens de intenção](./theming.md#tokens-de-intenção). As exceções neutras a esses preenchimentos estão em [Apresentação](#apresentação).

## Apresentação

A apresentação são duas escolhas separadas. `.solid`, `.soft` e `.ghost` definem quanto da cor da intenção preenche um componente. `.edged` e `.edgeless` definem se ele desenha uma borda. Elas definem [tokens de apresentação](./customizing.md#tokens-de-apresentação) e nada mais.

| Classe      | Visual                                                             | `--ui-fill` | `--ui-fg-on-fill` | `--ui-border` |
| ----------- | ------------------------------------------------------------------ | ----------- | ----------------- | ------------- |
| `.solid`    | Preenchido com a cor da intenção, com texto em contraste.          | `100%`      | `100%`            |               |
| `.soft`     | Um tom claro, com texto na cor da intenção.                        | `12%`       | `0%`              |               |
| `.ghost`    | Sem preenchimento em repouso, com texto na cor da intenção.        | `0%`        | `0%`              |               |
| `.edged`    | Uma borda na cor da intenção, tão grossa quanto a estética define. |             |                   | `100%`        |
| `.edgeless` | Sem borda.                                                         |             |                   | `0%`          |

```html
<button class="btn primary">Solid, the button default</button>
<button class="btn soft edged">Tinted, with a border</button>
<button class="btn primary ghost edged">Outline</button>
<button class="btn ghost">Ghost: picks up a tint on hover</button>
<input class="ipt soft edgeless" aria-label="Search" />
```

Uma classe de preenchimento nunca define a borda, e uma classe de borda nunca define o preenchimento. `.solid.edged` tem o mesmo visual que `.solid.edgeless`, porque a borda some à medida que o preenchimento aumenta.

A borda é o contorno do componente e nada mais. Linhas dentro de um componente, como as linhas divisórias entre as linhas de uma tabela, são um controle separado; veja [Conteúdo e layout → Linhas divisórias de tabela](./content-and-layout.md#linhas-divisórias-de-tabela).

### Superfícies neutras ficam sem tom em repouso

Um `.card.soft`, um `.panel` e um `.alert` neutros não mostram tom em repouso. Em vez disso, eles usam o tom de fundo discreto um passo distante da página (`--color-foreground`), porque um tom cinza em toda caixa neutra parece sujo, e não discreto.

- Um `.card.soft` com `.interactive` ou `.hoverable` mostra o tom no hover. Um `.card.soft` simples e um `.panel` não têm estado de hover.
- Com uma das seis intenções embutidas, os três mantêm o tom comum de 12%, e um card o aprofunda no hover. Uma intenção definida por você é tratada como neutra aqui; veja [Temas → Sua própria intenção](./theming.md#sua-própria-intenção).
- Um `.badge` mantém o seu tom de 12% mesmo quando neutro. Ele não tem borda, então, sem o tom, sumiria no texto em volta.

`.kbd`, `.code` e `.pre` funcionam de outro jeito. Eles ficam sobre o tom suave da sua intenção, `--intent-subtle`, que é `--color-surface` no neutro, e uma intenção embutida adiciona 12% da sua cor por cima. Uma intenção definida por você mostra o seu próprio tom `--intent-subtle`, sem esses 12% a mais.

### Controles de texto e toggles

- **Controles de texto** limitam o seu preenchimento para que o texto digitado continue legível: no máximo 6% vindo de um contêiner, 12% com o seu próprio `.soft` e 20% com o seu próprio `.solid`. Eles ignoram um `.edgeless` vindo de um contêiner e respeitam o seu próprio. Veja [Formulários → Preenchimento e borda em controles de texto](./forms.md#preenchimento-e-borda-em-controles-de-texto).
- **Toggles** limitam o preenchimento desmarcado a 40% e preenchem até 100% quando marcados. `.checkbox` e `.radio` sempre desenham a sua borda, assim como `.switch.ghost`. Veja [Formulários → Cores de marcado e desmarcado](./forms.md#cores-de-marcado-e-desmarcado).

### Balões de tooltip

Um balão de tooltip é sempre preenchido e opaco, e desenha uma borda fina que só o seu próprio `.edgeless` remove. Sem intenção, ele usa `--color-tooltip`; uma intenção o preenche com a cor dela. [Tooltips → Como o balão aparece](./tooltips.md#como-o-balão-aparece) traz as cores.

### Trilhos de progresso

`.progress` lê as duas escolhas no seu trilho. A parte preenchida é sempre a cor da intenção com força total. `.solid` não é suportado no trilho, porque o trilho e a parte preenchida ficariam da mesma cor. `.ghost.edgeless` renderiza, mas deixa o trilho sem moldura visível; `.ghost.edged` desenha um contorno em volta dele.

### Combinações não suportadas

| Componente              | Classe      | O que acontece                                                                      |
| ----------------------- | ----------- | ----------------------------------------------------------------------------------- |
| `.kbd`, `.code`, `.pre` | `.ghost`    | O chip ainda desenha o seu fundo tingido, porque é esse fundo que faz dele um chip. |
| `.progress`             | `.solid`    | O trilho e a parte preenchida ficam da mesma cor, então não dá para ver o valor.    |
| `.checkbox`, `.radio`   | `.edgeless` | Ignorado: a borda é sempre desenhada.                                               |

## Referência de eixos por componente

Quais classes mudam cada componente. "Material" é o que uma [estética](./aesthetics.md) pode mudar nele: "Formato" significa canto, espessura da borda, sombra, hover e contorno; as entradas mais restritas listam o que se aplica.

| Componentes                                                   | Intenção | Preenchimento | Borda | Material           |
| ------------------------------------------------------------- | -------- | ------------- | ----- | ------------------ |
| `.btn`, `.alert`, `.badge`, `.card`, `.panel`                 | Sim      | Sim           | Sim   | Formato            |
| `.kbd`, `.data-table`                                         | Sim      | Sim           | Sim   | Canto e borda      |
| `.quote`                                                      | Sim      | Sim           | Sim   | Espessura da borda |
| `.divider`, `.skeleton`                                       | Sim      | Não           | Não   | Não                |
| `.ipt`, `.textarea`, `.select`, `.text-control`               | Sim      | Sim           | Sim   | Formato            |
| `.input-group`                                                | Sim      | Sim           | Sim   | Formato            |
| `.surface`                                                    | Sim      | Sim           | Sim   | Formato            |
| `.checkbox`, `.radio`                                         | Sim      | Sim           | Não   | Canto e borda      |
| `.switch`                                                     | Sim      | Sim           | Sim   | Canto e borda      |
| `.progress`                                                   | Sim      | Sim           | Sim   | Canto e borda      |
| `.code`, `.pre`                                               | Sim      | Sim           | Sim   | Canto e contorno   |
| `.tooltip-bubble`                                             | Sim      | Sim           | Sim   | Formato e desfoque |
| `.table-wrap`, `.quote-inline`, utilitários de layout e texto | Não      | Não           | Não   | Não                |

"Sim" significa que a classe muda o componente, e "Não" que não muda; os testes do pacote conferem os dois. O que cada componente faz com uma classe:

| Componente                                      | Lê                                                                                                        |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `.btn`, `.alert`, `.badge`, `.card`, `.panel`   | Preenchimento, cor do texto, borda e espessura da borda.                                                  |
| `.kbd`                                          | Preenchimento, cor do texto, borda e espessura da borda.                                                  |
| `.data-table`                                   | Preenchimento e cor do texto do cabeçalho, borda e espessura da borda.                                    |
| `.ipt`, `.textarea`, `.select`, `.text-control` | Borda, espessura da borda e um preenchimento limitado.                                                    |
| `.input-group`                                  | Borda, espessura da borda e um preenchimento limitado.                                                    |
| `.checkbox`, `.radio`                           | Um preenchimento limitado, marcado e desmarcado.                                                          |
| `.switch`                                       | Borda, espessura da borda e um preenchimento limitado.                                                    |
| `.quote`                                        | Preenchimento, cor do texto, borda e espessura da borda.                                                  |
| `.code`, `.pre`, `.tooltip-bubble`              | Preenchimento, cor do texto, borda e material.                                                            |
| `.progress`                                     | Preenchimento do trilho, borda e espessura da borda. A parte preenchida é sempre a cor cheia da intenção. |
| `.skeleton`, `.divider`                         | Só a intenção.                                                                                            |

Classes de estado e modificadoras, como `.interactive`, `.hoverable`, `.pressable`, `.p-sm` e `.vertical`, são documentadas junto com o seu componente. Um controle inválido é marcado com `aria-invalid="true"`, e não com uma classe; veja [Formulários](./forms.md#mostre-um-erro-de-validação).

## Elevação

Elevação é quanta profundidade um componente recebe. Nada tem sombra até que uma [estética](./aesthetics.md) desenhe profundidade ou uma destas classes a peça.

| Classe      | Profundidade                                                                                     |
| ----------- | ------------------------------------------------------------------------------------------------ |
| `.flat`     | Nenhuma. As superfícies de vidro mantêm a sua sombra, porque ela faz parte do material do glass. |
| `.raised`   | Um passo da profundidade em vigor: cards e blocos que ficam perto da página.                     |
| `.floating` | Dois passos: menus e popovers.                                                                   |

```html
<article class="card raised">Lifted</article>
<div class="floating panel">A menu</div>
<article class="card flat">Flat, whatever the aesthetic says</article>
```

Cada classe multiplica a sombra da estética em vigor. O mesmo `.raised` é um desfoque suave numa página simples e uma sombra dura deslocada sob `.neobrutalism`: a estética decide como a profundidade parece, e a classe decide quanto dela esse elemento recebe.

A classe não é herdada. Ela eleva ou achata só o elemento em que está, e um elemento dentro dele não recebe profundidade dela. Dê a cada elemento que precisa de profundidade a sua própria classe. O espalhamento (spread) de uma sombra não é multiplicado, porque uma estética que desenha a borda como sombra interna usa o espalhamento para essa borda.

Essas classes são separadas dos tokens de sombra `--elevation-*` em [Temas → Tokens fundamentais](./theming.md#tokens-fundamentais), que são sombras fixas para elementos que você mesmo estiliza.
