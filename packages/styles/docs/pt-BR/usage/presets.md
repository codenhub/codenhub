---
title: Predefinições
description: Três formas de definir um visual uma única vez em vez de em cada elemento, e quando usar cada uma.
order: 11
source: 308b21076223635a3323bcfecb70abe3a9e6d1c7
---

# Predefinições

A esta altura, a tela de configurações diz `btn primary soft sm` em uma dúzia de lugares, e mudar de ideia significa mudar uma dúzia de lugares. Esta página trata das três formas de definir um visual uma única vez: classes de eixo em um contêiner, tokens de tema e de material, e as suas próprias classes de componente feitas com `@apply`. Cada uma serve para um tipo diferente de "uma única vez".

## Qual usar

| Você quer                                                                                      | Use                                                                         |
| ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Que todos os componentes de uma região compartilhem um preenchimento, uma borda ou um material | [Classes de eixo em um contêiner](#classes-de-eixo-em-um-contêiner)         |
| Outras cores, cantos, bordas ou profundidade para uma página ou uma região                     | [Tokens de tema e de material](#tokens-de-tema-e-de-material)               |
| Um nome para uma receita que você repete, como "o botão de salvar"                             | [Suas próprias classes de componente](#suas-próprias-classes-de-componente) |

Elas se combinam. Uma região pode definir um token de material, ficar sob uma estética e conter a sua própria classe de botão, e cada elemento ainda pode sobrescrever o que herda.

## Classes de eixo em um contêiner

Algumas classes funcionam num contêiner além de num componente, e tudo dentro dele as recebe:

- As classes de apresentação: `.solid`, `.soft`, `.ghost`, `.edged` e `.edgeless`.
- Os padrões de canto: `.cut-diagonal` e `.cut-diagonal-reverse`.
- As [estéticas](./aesthetics.md), como `.glass` ou `.pixel`.

```html
<div class="cluster soft edged">
  <button class="btn primary" type="button">Negrito</button>
  <button class="btn" type="button">Itálico</button>
  <button class="btn destructive solid" type="button">Limpar formatação</button>
</div>
```

Os botões da barra são soft e com borda, e o último pede o próprio preenchimento. Uma classe no elemento sempre vence a de um contêiner.

Os outros eixos não são herdados. A intenção, a elevação (`.flat`, `.raised`, `.floating`) e o tamanho (`.sm`, `.lg`) mudam só o elemento em que estão, então uma barra `.sm` não encolhe os seus botões; [Composição → Combinando classes](./composing.md#combinando-classes) explica por quê. Uma classe de estética também define o próprio padrão de canto na sua região, então um `.cut-diagonal` acima de uma região `.pixel` não chega dentro dela.

Use uma classe de contêiner quando o visual pertence à região, como uma barra lateral discreta, e não aos componentes dentro dela.

## Tokens de tema e de material

Tokens são propriedades personalizadas de CSS. Defina um no `:root` e a página inteira segue; defina num elemento e só o que está dentro segue. Eles vão mais longe que as classes, porque os componentes os leem enquanto são desenhados:

```css
.admin {
  --radius-control: 0.25rem;
  --radius-surface: 0.5rem;
  --border-width: 2px;
}
```

Todo botão, campo, balão de tooltip e superfície dentro de `.admin` recebe os cantos mais fechados e a borda mais grossa, sem classe em nenhum deles. Checkboxes, `.kbd` e `.code` mantêm o próprio canto menor, `--radius-small`.

As tabelas ficam onde os tokens são explicados, então esta página não as repete:

- [Temas → Tokens de cor](./theming.md#tokens-de-cor): cores de marca e de status, nos dois temas.
- [Temas → Tokens fundamentais](./theming.md#tokens-fundamentais): cantos, largura da borda, altura dos controles, anel de foco, profundidade e movimento.
- [Personalização → Tokens de apresentação](./customizing.md#tokens-de-apresentação): quanto um preenchimento, uma borda ou um hover acrescenta.
- [Personalização → Tokens de material](./customizing.md#tokens-de-material): o que uma estética define, e que você mesmo pode definir, como `--ui-radius`.
- [Personalização → Tokens de estética](./customizing.md#tokens-de-estética): os ajustes de cada estética, como `--neo-offset`.

Use tokens quando a mudança é um valor, como uma cor ou um canto, e não uma escolha entre classes.

## Suas próprias classes de componente

Com os entrypoints de código-fonte do Tailwind, todo componente, helper e classe de eixo é um utilitário do Tailwind, então uma classe sua pode carregar a receita inteira:

```css
@import "@codenhub/styles/tw";

@utility btn-save {
  @apply btn primary soft sm;
}
```

```html
<button class="btn-save" type="submit">Salvar alterações</button>
```

`btn-save` se comporta como `btn primary soft sm` escrito por extenso, com estéticas e hover incluídos, e mudar a receita muda todos os botões de salvar. Modificadores que pertencem a um componente, como `.tight` no `.stack` ou `.icon` no `.btn`, também são utilitários, então `@apply btn icon` dá a você um botão de ícone próprio. [Tailwind CSS v4 → Construa seus próprios componentes com `@apply`](../integrating/tailwind.md#construa-seus-próprios-componentes-com-apply) tem as regras, inclusive por que `@utility` é melhor que uma regra simples.

Com o CSS compilado não existe `@apply`. Mantenha a receita num único lugar do outro lado: um partial de template, um componente do seu framework ou uma constante como `const saveButton = "btn primary soft sm"`.

Use a sua própria classe quando a mesma combinação nomeia uma única coisa no seu design, como o botão de salvar ou o card de plano.

## A seguir

A página de [Acessibilidade](../accessibility.md) lista o que o CSS faz pelos seus usuários e o que a sua aplicação ainda deve a eles.
