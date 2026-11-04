---
title: Temas
description: Modo claro e escuro, como trocar a paleta pelas cores da marca, como definir uma intenção própria, e cada token de cor, de intenção, fundamental e de fonte com o seu padrão.
order: 5
source: ef2e6095c03e7765cb650f720aca10403a70930c
---

# Temas

A tela de configurações funciona e tem a cara dos padrões do pacote: ações quase pretas numa página quase branca. Esta página a deixa com a sua cara. Ela trata do modo claro e escuro, depois troca a cor primária por uma cor da marca nos dois modos e, por fim, define uma intenção que o pacote não entrega. A segunda metade é a referência de consulta: cada token de cor, de intenção, fundamental e de fonte, com o seu padrão.

## Claro e escuro

De fábrica, a página segue o sistema operacional: clara quando o sistema do usuário está no claro, escura quando está no escuro. Você não precisa fazer nada para isso.

Para deixar o usuário escolher, coloque um seletor de tema no elemento raiz:

```html
<html data-theme="dark">
  …
</html>
```

| Tema   | Seletores equivalentes                           |
| ------ | ------------------------------------------------ |
| Claro  | `.light`, `.theme-light`, `[data-theme="light"]` |
| Escuro | `.dark`, `.theme-dark`, `[data-theme="dark"]`    |

Uma tela de configurações com a escolha "Sistema / Claro / Escuro" remove o atributo para Sistema e o define para as outras duas opções.

Como isso é resolvido:

- Um seletor de tema define a propriedade CSS `color-scheme` e mais nada. Cada token de cor guarda o seu valor claro e o seu valor escuro ao mesmo tempo, por meio de `light-dark()`, e o `color-scheme` do elemento escolhe um deles.
- `color-scheme` é herdado, então um seletor aplica o tema a tudo o que está dentro dele. Um seletor em qualquer elemento aplica o tema àquela parte da página: uma barra lateral escura numa página clara é `<aside class="dark">`.
- O seletor mais próximo vence, em qualquer profundidade. Um card `.light` dentro de uma página `.dark` é claro.
- Sem seletor, a raiz tem `color-scheme: light dark`, que segue o sistema.
- Coloque um único tema por elemento. Se um elemento tiver um seletor claro e um escuro, o escuro vence, mas não conte com isso.
- Definir você mesmo o `color-scheme` num elemento funciona do mesmo jeito, porque ele é a única coisa que a paleta lê. Isso também aplica o tema a partes nativas, como barras de rolagem e o interior de controles de formulário.

Toda cor de componente vem de um token ou de `currentColor`, então os componentes seguem o tema sem regras próprias de modo escuro. As marcas que o pacote desenha, como o visto do checkbox e a seta do select, também usam `currentColor`. Ícones e imagens que você adiciona ficam por sua conta.

`light-dark()` funciona a partir do Chrome 123, Safari 17.5 e Firefox 120. O pacote como um todo exige Firefox 128; veja [Configuração → Requisitos](../setup.md#requisitos).

### A variante `dark:`

Com os entrypoints de código-fonte do Tailwind (`/tw`), o pacote substitui a variante `dark:` do Tailwind para que os seus próprios utilitários sigam o mesmo tema que os tokens. Um utilitário `dark:` se aplica sob um seletor escuro explícito no elemento ou num ancestral, ou sob uma preferência de sistema escura quando nenhum ancestral define um tema:

```html
<html>
  <body>
    <p class="dark:text-white">Follows the system preference</p>
    <div class="light">
      <p class="dark:text-white">Stays light: this part of the page chose a theme</p>
    </div>
  </body>
</html>
```

Ela difere dos tokens em um caso: um tema explícito aninhado dentro do tema oposto. Um elemento `.light` dentro de um `.dark` tem tokens claros, porque o `color-scheme` mais próximo vence. Mas `dark:` casa por seletor, e `.dark *` casa com todo elemento dentro de `.dark`, então um utilitário `dark:` dentro daquele elemento `.light` ainda se aplica. Se uma página usa tanto tokens quanto utilitários `dark:`, não aninhe temas opostos.

Os entrypoints compilados não definem uma variante `dark:`; eles não têm um build do Tailwind em que defini-la.

## Mude a cor da marca

A cor primária é quase preta numa página clara e quase branca numa escura. Para transformá-la numa cor da marca, substitua a família primária inteira: a cor base e as suas quatro companheiras. Cada uma guarda um valor claro e um escuro:

```css
:root {
  --color-primary: light-dark(#0f766e, #2dd4bf);
  --color-primary-contrast: light-dark(#ffffff, #042f2e);
  --color-primary-hover: light-dark(#115e59, #5eead4);
  --color-primary-subtle: light-dark(#ccfbf1, #134e4a);
  --color-primary-strong: light-dark(#115e59, #5eead4);
}
```

Para que serve cada uma:

| Token                      | Papel                                                                                         | Verificação                                         |
| -------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `--color-primary`          | O preenchimento de um botão primário sólido, de um toggle marcado, de uma barra de progresso. | Texto em `-contrast` sobre ela chega a 4.5:1.       |
| `--color-primary-contrast` | Texto e ícones sobre um preenchimento primário total.                                         | Veja acima.                                         |
| `--color-primary-hover`    | O preenchimento sob o ponteiro.                                                               | Texto em `-contrast` sobre ela ainda chega a 4.5:1. |
| `--color-primary-subtle`   | O tom claro por trás dos componentes soft.                                                    | Texto em `-strong` sobre ela chega a 4.5:1.         |
| `--color-primary-strong`   | Texto, ícones e bordas onde o preenchimento não é total: soft e ghost.                        | Chega a 4.5:1 sobre a página e sobre `-subtle`.     |

Os valores em verde-azulado acima medem, no modo claro e no escuro: 5.47:1 e 7.77:1 para o preenchimento e o seu texto, 7.27:1 e 13.38:1 para o tom forte sobre a página, e 6.73:1 e 6.41:1 para o tom forte sobre o tom suave.

Substitua a família inteira. Mudar só `--color-primary` deixa as companheiras no antigo quase preto, então um badge primário soft mantém o texto cinza e um botão com hover pisca em preto. O anel de foco é desenhado a partir de `--color-primary` com 64% de opacidade, então ele acompanha a cor da marca sem precisar de mudança própria.

O mesmo padrão funciona para todas as famílias em [Tokens de cor](#tokens-de-cor): `--color-accent` é o que `.secondary` lê, e as quatro famílias de status são `success`, `warning`, `destructive` e `info`. Defina-as no `:root` para a página inteira, ou em qualquer elemento para mudar o tema só do que está dentro dele.

Os valores precisam ser cores completas: hex, `rgb()`, `oklch()` ou uma variável que você mesmo declarou. Variáveis da paleta do Tailwind, como `--color-teal-700`, existem num build `/tw`, vindas do seu tema do Tailwind, mas o CSS compilado declara só as cores da paleta que o próprio pacote usa. Com CSS compilado, uma referência a qualquer outra variável da paleta fica vazia, e a cor que ela alimenta se perde.

## Sua própria intenção

O pacote entrega seis intenções, `.primary`, `.secondary`, `.success`, `.warning`, `.destructive` e `.info`, mais o padrão, `.neutral`. Para adicionar uma, como uma cor "Beta" para funcionalidades em prévia, escreva uma classe que define os sete slots de intenção. Use cores completas, com `light-dark()` para tudo o que muda entre os temas:

```css
.beta {
  --intent-color: #7c3aed;
  --intent-contrast: #ffffff;
  --intent-hover: #6d28d9;
  --intent-strong: light-dark(#5b21b6, #c4b5fd);
  --intent-subtle: light-dark(#ede9fe, #4c1d95);
  --intent-border: light-dark(#7c3aed, #a78bfa);
  --intent-fill-max: 100%;
}
```

```html
<span class="badge beta">Beta</span> <button class="btn beta" type="button">Try the new editor</button>
```

Esses valores medem 5.7:1 para branco sobre o preenchimento, 7.1:1 para branco sobre a cor de hover, 8.61:1 (claro) e 10.72:1 (escuro) para o tom forte sobre a página, e 7.57:1 e 5.93:1 para o tom forte sobre o tom suave.

**Defina todos os slots**, incluindo `--intent-fill-max`. Cada componente redefine os sete slots para os valores neutros na sua própria raiz, então um slot que você deixa de fora fica com o valor do neutro e, sem `--intent-fill-max: 100%`, a sua intenção só preenche até 20%, como o neutro. O que cada slot faz está em [Tokens de intenção](#tokens-de-intenção).

A classe funciona em tudo o que aceita intenção: botões, badges, campos e toggles, cards sólidos e ghost, barras de progresso, skeletons, balões de tooltip e o resto. Alguns comportamentos foram escritos para os seis nomes embutidos, e uma intenção personalizada não os recebe:

- **Um repouso discreto, sem tom.** Um `.card.soft`, um `.panel` e um `.alert` neutros ficam sobre o tom de fundo discreto, e só reconhecem uma intenção pelas seis classes embutidas. `.card.soft.beta`, `.panel.beta` e `.alert.beta` são desenhados como o neutro: o tom de fundo discreto em vez de um tom violeta. A sua intenção ainda colore o texto e a borda deles.
- **O tom dos chips.** Uma tecla `.kbd` ou um bloco de código `.beta` mostra o seu tom `--intent-subtle`, mas não os 12% extras de `--intent-color` que uma intenção embutida acrescenta por cima.
- **Classes solo.** Uma [classe solo](./solo.md) como `.neobrutalism-solo` só aceita intenção das seis classes embutidas, então `.neobrutalism-solo.beta` é desenhado como neutro.

Se você precisa disso, há dois caminhos:

- **Mude o tema de uma intenção embutida.** Defina a família `--color-info` (ou outra) com as suas cores, como em [Mude a cor da marca](#mude-a-cor-da-marca), e escreva `.info`. Tudo, incluindo os casos acima, passa a funcionar. O custo é que a mudança alcança todo `.info` dentro do elemento em que você a definiu, então defina-a no elemento mais restrito que funcione, e não faça isso com uma intenção que a página já usa com outro significado.
- **Pinte você mesmo.** Escreva o seu próprio CSS para aquele componente, como um `background-color` em `.panel.beta`.

> **A intenção não é herdada.** Cada componente redefine os slots de intenção na sua própria raiz, então um contêiner `.success` não recolore um botão destrutivo dentro dele. Coloque a classe de intenção no elemento que mostra a cor.

## Tokens de cor

Cada token de cor guarda um valor claro e um escuro por meio de `light-dark()`; um único valor significa que os dois temas o usam. Nomes de paleta como `neutral-950` são da paleta padrão do Tailwind, que o CSS compilado do pacote declara para as cores que usa.

Cada linha é um ponto de sobrescrita: defina-a no `:root` para mudar o tema da página, ou em qualquer elemento para mudar o tema do que está dentro dele. As linhas `-hover`, `-subtle`, `-strong` e `-contrast` são companheiras da cor base da sua família e não a acompanham, então mude o tema da família inteira. A família `text` não tem linha `-subtle`: a intenção neutra pega o seu tom suave de `--color-surface`.

| Token                          | Claro, escuro                | Finalidade                                                                                                          |
| ------------------------------ | ---------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `--color-primary`              | `neutral-950`, `neutral-50`  | Preenchimento de `.primary`.                                                                                        |
| `--color-primary-contrast`     | `neutral-50`, `neutral-950`  | Texto e ícones sobre um preenchimento primário total.                                                               |
| `--color-primary-hover`        | `neutral-700`, `neutral-200` | Preenchimento primário sob o ponteiro.                                                                              |
| `--color-primary-subtle`       | `neutral-200`, `neutral-900` | Tom primário por trás dos componentes soft.                                                                         |
| `--color-primary-strong`       | `neutral-900`, `neutral-100` | Texto, ícones e bordas primários onde o preenchimento não é total.                                                  |
| `--color-accent`               | `neutral-600`, `neutral-400` | Preenchimento de `.secondary`.                                                                                      |
| `--color-accent-contrast`      | `neutral-50`, `neutral-950`  | Texto e ícones sobre um preenchimento secundário total.                                                             |
| `--color-accent-hover`         | `neutral-700`, `neutral-300` | Preenchimento secundário sob o ponteiro.                                                                            |
| `--color-accent-subtle`        | `neutral-100`, `neutral-800` | Tom secundário por trás dos componentes soft.                                                                       |
| `--color-accent-strong`        | `neutral-800`, `neutral-200` | Texto, ícones e bordas secundários onde o preenchimento não é total.                                                |
| `--color-border`               | `neutral-400`, `neutral-700` | Borda de superfícies neutras, tabelas, divisores e teclas.                                                          |
| `--color-border-hover`         | `neutral-600`, `neutral-500` | Borda sob o ponteiro.                                                                                               |
| `--color-control-border`       | `neutral-500`                | Borda em repouso de controles de texto e toggles neutros, desenhada com uma fração da força nos controles de texto. |
| `--color-background`           | `neutral-50`, `neutral-950`  | A página.                                                                                                           |
| `--color-foreground`           | `neutral-100`, `neutral-900` | O tom de fundo discreto um passo distante da página: cards soft, painéis e alertas neutros.                         |
| `--color-surface`              | `neutral-200`, `neutral-800` | Mais um passo: superfícies aninhadas e esmaecidas, e o tom da intenção neutra.                                      |
| `--color-text`                 | `neutral-950`, `neutral-50`  | Texto do corpo, e a cor da intenção neutra.                                                                         |
| `--color-text-secondary`       | `neutral-700`, `neutral-400` | Texto secundário, como o `.hint`.                                                                                   |
| `--color-text-contrast`        | `neutral-50`, `neutral-950`  | Texto sobre um preenchimento total de `--color-text`, como a marca de um toggle neutro marcado.                     |
| `--color-text-hover`           | `neutral-700`, `neutral-200` | Cor neutra sob o ponteiro.                                                                                          |
| `--color-text-strong`          | `neutral-900`, `neutral-100` | Texto, ícones e bordas neutros onde o preenchimento não é total.                                                    |
| `--color-tooltip`              | `white`, `neutral-700`       | Fundo de um balão de tooltip sem intenção. Escolhido por tema para parecer elevado nos dois.                        |
| `--color-tooltip-contrast`     | `neutral-900`, `neutral-100` | Texto sobre `--color-tooltip`.                                                                                      |
| `--color-success`              | `emerald-700`                | Preenchimento de `.success`.                                                                                        |
| `--color-success-contrast`     | `neutral-50`                 | Texto sobre um preenchimento de sucesso total: 5.14:1.                                                              |
| `--color-success-hover`        | `#007552`, `#008e66`         | Preenchimento de sucesso sob o ponteiro.                                                                            |
| `--color-success-subtle`       | `emerald-100`, `emerald-900` | Tom de sucesso por trás dos componentes soft.                                                                       |
| `--color-success-strong`       | `emerald-800`, `emerald-300` | Texto, ícones e bordas de sucesso onde o preenchimento não é total.                                                 |
| `--color-warning`              | `amber-600`                  | Preenchimento de `.warning`.                                                                                        |
| `--color-warning-contrast`     | `neutral-950`                | Texto sobre um preenchimento de aviso total: quase preto, não a cor da página. 6.19:1.                              |
| `--color-warning-hover`        | `#d46700`, `#e78300`         | Preenchimento de aviso sob o ponteiro.                                                                              |
| `--color-warning-subtle`       | `amber-100`, `amber-900`     | Tom de aviso por trás dos componentes soft.                                                                         |
| `--color-warning-strong`       | `amber-800`, `amber-300`     | Texto, ícones e bordas de aviso onde o preenchimento não é total.                                                   |
| `--color-destructive`          | `rose-700`                   | Preenchimento de `.destructive`.                                                                                    |
| `--color-destructive-contrast` | `neutral-50`                 | Texto sobre um preenchimento destrutivo total: 5.78:1.                                                              |
| `--color-destructive-hover`    | `#c00036`, `#d1054b`         | Preenchimento destrutivo sob o ponteiro.                                                                            |
| `--color-destructive-subtle`   | `rose-100`, `rose-900`       | Tom destrutivo por trás dos componentes soft.                                                                       |
| `--color-destructive-strong`   | `rose-800`, `rose-300`       | Texto, ícones e bordas destrutivos onde o preenchimento não é total.                                                |
| `--color-info`                 | `indigo-600`                 | Preenchimento de `.info`.                                                                                           |
| `--color-info-contrast`        | `neutral-50`                 | Texto sobre um preenchimento informativo total: 6.19:1.                                                             |
| `--color-info-hover`           | `#4b36e9`, `#5e4ff9`         | Preenchimento informativo sob o ponteiro.                                                                           |
| `--color-info-subtle`          | `indigo-100`, `indigo-900`   | Tom informativo por trás dos componentes soft.                                                                      |
| `--color-info-strong`          | `indigo-800`, `indigo-300`   | Texto, ícones e bordas informativos onde o preenchimento não é total.                                               |

Mudanças de tema pertencem a esses valores, não a regras de componente que verificam o tema.

## Tokens de intenção

Uma classe de intenção define estes sete slots, e os componentes os leem. Como todo componente lê os mesmos sete nomes, uma classe que define os sete funciona como intenção, como mostra [Sua própria intenção](#sua-própria-intenção).

| Token               | Finalidade                                                                                                                                                                                                                                   |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--intent-color`    | A cor base da intenção, aquilo de que um preenchimento é feito.                                                                                                                                                                              |
| `--intent-contrast` | Texto sobre um preenchimento total de `--intent-color`.                                                                                                                                                                                      |
| `--intent-hover`    | A cor base sob o ponteiro.                                                                                                                                                                                                                   |
| `--intent-strong`   | A intenção como texto, ícone ou borda sempre que o preenchimento não é total.                                                                                                                                                                |
| `--intent-subtle`   | O tom claro por trás dos componentes soft e dos trilhos de progresso. O neutro usa `--color-surface`.                                                                                                                                        |
| `--intent-border`   | Cor das linhas. Sem intenção, é o `--ui-ink` da estética e, depois, `--color-border`; controles de texto e toggles leem `--ui-control-ink`, depois `--ui-ink` e depois `--color-control-border`, e as tabelas leem `--ui-rule-ink` primeiro. |
| `--intent-fill-max` | Até onde um preenchimento dessa intenção pode ir. `100%` para toda intenção, exceto a neutra.                                                                                                                                                |

`--intent-color` e `--intent-strong` não são intercambiáveis. A cor base é escolhida para preencher; o tom forte é escolhido para ser lido sobre a página. Um componente soft ou ghost imprime o tom forte, e é por isso que um aviso soft aparece em amber-800 enquanto um sólido é preenchido com amber-600.

O tom forte também precisa continuar reconhecível como o seu próprio matiz. Numa página escura, a tonalidade `-100` de cada família é um tom pálido quase sem cor em tamanhos pequenos: um badge de sucesso soft e um destrutivo soft pareceriam ambos brancos. Por isso, os tons fortes do escuro são `-300`, e os tons por baixo deles são `-900`, que medem 5.0:1 ou mais onde quer que um preenchimento parcial tenha texto, e mais de 9:1 sobre a página.

`--intent-border` existe para que uma borda neutra continue no cinza discreto de borda, e não na cor do texto. Tudo o que desenha uma linha o lê: bordas de controles, linhas divisórias de tabelas, divisores, teclas e barras de citação.

`--intent-fill-max` existe para a intenção neutra, cuja cor é a própria cor do texto da página. Todas as outras intenções são um matiz, legível como um tom pálido a 12% e saturado a 100%; um cinza preenchido a 100% é um bloco preto ou branco, o elemento que mais chama atenção na página justamente para a intenção que não significa nada em particular. O neutro para em `20%`, então `.solid` dá a ele um cinza discreto que ainda fica um passo além do `.soft`. O hover soma o seu passo por cima do teto, então um preenchimento limitado ainda fica mais intenso sob o ponteiro.

A cor do texto acompanha o preenchimento. `--intent-contrast` é a cor do texto para um preenchimento total; impressa sobre um quinto de preenchimento, seria branco sobre cinza-claro. Por isso, o texto de contraste só aparece depois que o preenchimento passa da metade, e chega à força total com o preenchimento total; abaixo disso, o componente imprime `--intent-strong`. Um neutro limitado, portanto, imprime o tom forte. Um estado que levanta o teto de propósito, como um checkbox marcado, chega ao preenchimento total e imprime a cor de contraste.

## Tokens fundamentais

Os tokens fundamentais definem layout, formato, movimento, foco, profundidade e empilhamento. Sobrescreva-os no `:root`, ou num elemento para o que está dentro dele.

As quatro sombras `--elevation-*` são para elementos que você mesmo estiliza. Elas são separadas das classes `.flat`, `.raised` e `.floating`, que escalam a sombra do próprio componente e não desenham nada até que uma estética ou uma dessas classes peça profundidade; veja [Composição → Elevação](./composing.md#elevação). Ambas usam os pesos nenhum, pequeno, médio e grande, mas uma é um valor fixo e a outra escala partes da sombra, então elas nem sempre têm a mesma aparência.

| Token                      | Padrão                                                         | Finalidade                                                                                                                 |
| -------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `--font-default`           | `"Segoe UI", system-ui, sans-serif`                            | Fonte da página. Veja [Fontes](#fontes).                                                                                   |
| `--container-narrow`       | `48rem`                                                        | Largura de `.section-content.narrow`.                                                                                      |
| `--container-max`          | `80rem`                                                        | Largura de `.section-content`.                                                                                             |
| `--container-wide`         | `90rem`                                                        | Largura de `.section-content.wide`.                                                                                        |
| `--layout-gutter`          | `clamp(1rem, 4vw, 2rem)`                                       | Padding lateral de `.section`, que cresce com a janela.                                                                    |
| `--layout-section-block`   | `clamp(4rem, 9vw, 7rem)`                                       | Padding superior e inferior de `.section`, que cresce com a janela.                                                        |
| `--layout-gap`             | `1rem`                                                         | Espaçamento de `.view`, `.stack`, `.cluster` e `.auto-grid`.                                                               |
| `--layout-grid-min`        | `16rem`                                                        | Coluna mais estreita de `.auto-grid`.                                                                                      |
| `--radius-small`           | `0.25rem`                                                      | Canto de chips pequenos: `.kbd` e `.code`.                                                                                 |
| `--radius-control`         | `0.5rem`                                                       | Canto de botões, campos e balões de tooltip.                                                                               |
| `--radius-surface`         | `0.875rem`                                                     | Canto de cards, painéis e alertas.                                                                                         |
| `--control-height`         | `2.5rem`                                                       | Altura mínima de um botão padrão e de um controle de texto.                                                                |
| `--border-width`           | `1px`                                                          | Espessura da borda.                                                                                                        |
| `--elevation-color`        | `rgb(15 23 42 / 0.08)` no claro, `rgb(0 0 0 / 0.55)` no escuro | A cor de sombra que as quatro elevações usam. Mais forte numa página escura, onde uma sombra leve não apareceria.          |
| `--elevation-none`         | `none`                                                         | Sem sombra.                                                                                                                |
| `--elevation-sm`           | `0 1px 2px`, `0 1px 3px`                                       | Uma sombra leve para as suas próprias superfícies, como um card.                                                           |
| `--elevation-md`           | `0 4px 6px -1px`, `0 2px 4px -2px`                             | Uma sombra para os seus próprios elementos elevados, como um menu dropdown.                                                |
| `--elevation-lg`           | `0 20px 25px -5px`, `0 8px 10px -6px`                          | Uma sombra para as suas próprias sobreposições, como um dialog modal.                                                      |
| `--focus-ring`             | `--color-primary` com 64% de opacidade                         | Cor do anel de foco do teclado.                                                                                            |
| `--focus-ring-offset`      | Não definido                                                   | Distância entre o anel e o elemento. Quando não está definido, o anel fica sobre a borda do elemento em qualquer estética. |
| `--focus-ring-width`       | `3px`                                                          | Espessura do anel de foco do teclado.                                                                                      |
| `--motion-duration-fast`   | `120ms`                                                        | O hover de uma linha de tabela.                                                                                            |
| `--motion-duration-normal` | `200ms`                                                        | Transições de cor, borda, sombra e clique, marcas de toggles e o balão de tooltip.                                         |
| `--motion-duration-slow`   | `400ms`                                                        | Mudanças de valor de progresso, e a base do ciclo de brilho do skeleton e do progresso.                                    |
| `--motion-ease`            | `cubic-bezier(0.2, 0, 0, 1)`                                   | Easing de todas as transições.                                                                                             |
| `--z-popover`              | `40`                                                           | Ordem de empilhamento dos balões de tooltip. Use nos seus próprios popovers para que eles empilhem do mesmo jeito.         |
| `--breakpoint-xs`          | `30rem`                                                        | O breakpoint responsivo `xs:`. Só num build `/tw`; os entrypoints compilados não o declaram.                               |

Cada sombra `--elevation-*` é composta das partes listadas, cada uma em `--elevation-color`. O passo de hover que intensifica um preenchimento sob o ponteiro é um token de apresentação, `--hover-step`; veja [Personalização](./customizing.md#tokens-de-apresentação).

## Fontes

O pacote não entrega arquivos de fonte e não faz requisições de rede. Cada token de fonte nomeia fontes já instaladas no dispositivo de quem lê, até você fornecer as suas.

| Token            | Lido por                                                                                      | Sem o seu valor                                                                                                                                   |
| ---------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--font-default` | O reset, em `html` e `body`. Botões e controles de formulário o herdam.                       | `"Segoe UI", system-ui, sans-serif`                                                                                                               |
| `--font-mono`    | Os utilitários de conteúdo `kbd`, `code` e `pre`, e `<kbd>`, `<code>` e `<pre>` com `/native` | `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`. Com `/tw`, o valor do seu tema do Tailwind. |
| `--font-pixel`   | [`.pixel`](./aesthetics.md#pixel) e `.pixel-solo`                                             | Não declarado. Cai numa pilha monoespaçada.                                                                                                       |
| `--font-rounded` | [`.chunky-tile`](./aesthetics.md#chunky-tile) e `.chunky-tile-solo`                           | Não declarado. Cai em `--font-default` e, depois, numa pilha sans-serif.                                                                          |
| `--font-cyber`   | [`.cyber`](./aesthetics.md#cyber) e `.cyber-solo`                                             | Não declarado. Cai numa pilha monoespaçada.                                                                                                       |
| `--font-sketch`  | [`.sketch`](./aesthetics.md#sketch) e `.sketch-solo`                                          | Não declarado. Cai na família `cursive` da plataforma.                                                                                            |

`--font-default` só chega à página pelo reset, que `@codenhub/styles`, `/native`, `/tw`, `/tw/native` e `/tw/reset` incluem. Usando só `/theme` ou `/components`, defina você mesmo o `font-family` no `body`. Os tokens das estéticas são lidos pela classe da própria estética, então funcionam com qualquer entrypoint.

Para usar uma web font, carregue-a como você carrega qualquer fonte e depois nomeie-a no token. Defina o token no `:root` para a página inteira, ou em qualquer elemento para aquela parte dela:

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400..700&display=swap" />
```

```css
:root {
  --font-default: "Inter", system-ui, sans-serif;
}
```

Uma fonte hospedada por você é declarada com `@font-face` e nomeada do mesmo jeito:

```css
@font-face {
  font-family: "Pixelify Sans";
  src: url("/fonts/pixelify-sans.woff2") format("woff2");
  font-weight: 400 700;
  font-display: swap;
}

:root {
  --font-pixel: "Pixelify Sans", monospace;
}
```

Carregue os pesos de 400 a 700, e 800 para `--font-rounded`: os componentes definem `font-weight` de 400 a 700, e `.chunky-tile` usa 800 nos rótulos. Um navegador que não tem um peso o simula engrossando o regular, o que borra uma fonte pixelada ou manuscrita. Sempre termine a pilha com uma família genérica, como `sans-serif` ou `monospace`, para que o texto continue renderizando enquanto a fonte carrega ou se ela falhar.

## A seguir

A tela tem as suas cores nos dois temas. [Estéticas](./aesthetics.md) muda do que ela é feita: contornos pretos grossos, vidro fosco, pixels e muito mais.
