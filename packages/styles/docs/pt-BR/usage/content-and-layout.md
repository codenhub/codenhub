---
title: Conteúdo e layout
description: Consulta de todos os helpers de layout com os seus espaçamentos, a escala tipográfica com os seus tamanhos, cards e painéis com o seu padding, tabelas, citações, código e teclas.
order: 10
source: 58852762a8338e331fe4706cf30826b8a719aa2d
---

# Conteúdo e layout

Esta é uma página de consulta para as classes que organizam uma página e definem o seu conteúdo: helpers de layout, a escala tipográfica, cards e painéis, tabelas e os pequenos chips de conteúdo. [Montando uma tela](../concepts.md#organize-o-layout-da-página) mostra essas classes em uso.

## Layout

O espaçamento de todo helper de layout é `--layout-gap`, `1rem` por padrão. Definir `--layout-gap` num elemento muda o espaçamento de todos os layouts dentro dele. `.tight` e `.loose` mudam só o layout em que estão; um layout aninhado dentro dele mantém o seu próprio espaçamento.

| Classe             | Layout                                                                                                                                  | Espaçamento                                      |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `.stack`           | Uma coluna vertical.                                                                                                                    | `--layout-gap`, `.tight` 0.5rem, `.loose` 1.5rem |
| `.cluster`         | Uma linha que quebra, com os itens centralizados na vertical. `.between` espalha os itens até as duas pontas.                           | Igual                                            |
| `.view`            | Um contêiner flex. `.vertical` o transforma numa coluna; `.horizontal`, numa linha que quebra, com itens centralizados.                 | Igual                                            |
| `.auto-grid`       | Um grid de colunas iguais, cada uma com pelo menos `--layout-grid-min` (16rem) de largura, quantas couberem.                            | Igual                                            |
| `.section`         | Padding em volta de uma seção da página: `--layout-gutter` nas laterais, `--layout-section-block` em cima e embaixo.                    | Nenhum                                           |
| `.section-content` | Centraliza o seu conteúdo numa largura de `--container-max` (80rem). `.narrow` usa 48rem, `.wide` 90rem.                                | Nenhum                                           |
| `.divider`         | Uma linha horizontal, tão larga quanto o seu contêiner. `.vertical` a transforma numa linha vertical tão alta quanto a linha do layout. | Nenhum                                           |
| `.visually-hidden` | Esconde o conteúdo na tela e o mantém para leitores de tela.                                                                            | Nenhum                                           |

`.auto-grid` acomoda duas colunas de 16rem quando o seu contêiner tem 32rem mais o espaçamento de largura, três com 48rem mais dois espaçamentos, e assim por diante. Abaixo da largura de uma coluna, a coluna encolhe para caber. Defina `--layout-grid-min` no grid para mudar a largura das colunas.

`--layout-gutter` é `clamp(1rem, 4vw, 2rem)` e `--layout-section-block` é `clamp(4rem, 9vw, 7rem)`: os dois crescem com a janela entre esses limites. A lista completa dos tokens fundamentais está em [Temas → Tokens fundamentais](./theming.md#tokens-fundamentais).

Um `.divider` aceita uma intenção, que o colore, e ignora as classes de apresentação, então um contêiner `.ghost.edgeless` não esconde os divisores dentro dele. A espessura dele é a espessura de borda da estética.

`.visually-hidden` não se chama `.sr-only` porque o Tailwind entrega um `.sr-only` próprio, e duas classes com o mesmo nome entrariam em conflito.

## Tipografia

| Classe           | Tamanho                                    | Peso        | Espaçamento entre letras |
| ---------------- | ------------------------------------------ | ----------- | ------------------------ |
| `.text-display`  | 3.75rem, 6rem a partir de 48rem de largura | Negrito     | Justo                    |
| `.text-title-lg` | 3rem, 3.75rem a partir de 48rem de largura | Negrito     | Justo                    |
| `.text-title`    | 1.875rem                                   | Negrito     | Justo                    |
| `.text-title-sm` | 1.25rem                                    | Seminegrito | Justo                    |
| `.text-label-lg` | 1.125rem                                   | Médio       | Largo                    |
| `.text-label`    | 1rem                                       | Médio       | Largo                    |
| `.text-body`     | 0.875rem                                   | Normal      | Mais largo               |

Os dois maiores tamanhos crescem no breakpoint `md` do Tailwind, 48rem por padrão. Com os entrypoints de código-fonte do Tailwind, vale o seu próprio breakpoint `md`. O pacote não define tamanho para texto sem classe: o texto do corpo e os títulos sem classe recebem o tamanho do navegador, ou o tamanho do texto em volta sob o reset; veja [Configuração → HTML sem classes](../setup.md#html-sem-classes) para o mapeamento sem classes.

`.text-body` tem 0.875rem, menor que o texto de 1rem da página; use-o para texto secundário ou denso, não para o texto principal da página. O `/native` é a exceção: ele aplica `.text-body` ao `body`, então lá ele é o texto da página, e parágrafos e itens de lista o herdam do elemento em que estiverem. Veja [HTML sem classes](../setup.md#html-sem-classes).

`.selection-contrast` num elemento troca as cores do texto selecionado dentro dele para `--color-primary` sobre `--color-primary-contrast`. Use-o numa área `.solid.primary`, onde a cor de seleção padrão seria igual ao fundo.

## Superfícies

`.card` e `.panel` são os dois contêineres. Os dois aceitam intenção, [apresentação](./composing.md#apresentação) e [tokens de material](./customizing.md#tokens-de-material).

| Classe   | Visual padrão                                                                       | Padding padrão |
| -------- | ----------------------------------------------------------------------------------- | -------------- |
| `.card`  | Sem preenchimento, com borda, o canto de superfície e uma elevação em repouso de 1. | 1.25rem        |
| `.panel` | O tom de fundo discreto, sem borda, o canto de superfície e sem elevação.           | 1rem           |

Uma elevação em repouso de 1 não mostra sombra sozinha. Um card só tem sombra sob uma [estética](./aesthetics.md) que desenha profundidade, ou com `.raised` ou `.floating`; veja [Composição → Elevação](./composing.md#elevação).

Classes de padding:

| Classe    | Num `.card` | Num `.panel` |
| --------- | ----------- | ------------ |
| `.p-xs`   | 0.5rem      | 0.25rem      |
| `.p-sm`   | 0.75rem     | 0.5rem       |
| _nenhuma_ | 1.25rem     | 1rem         |
| `.p-lg`   | 2rem        | 1.5rem       |
| `.flush`  | 0           | 0            |

`.flush` é para conteúdo que vai de ponta a ponta, como uma imagem ou uma tabela dentro de um card.

Uma classe de padding só se aplica ao card ou painel em que está. Um card ou painel aninhado dentro dele mantém o seu próprio padding, então um `.card.flush` que contém um `.panel` ainda aplica 1rem de padding ao painel.

Um painel é para barras laterais, barras de ferramentas e áreas rebaixadas: áreas que fazem parte da página, e não objetos sobre ela. Um card é um objeto autocontido, como o card de perfil ou o card do plano na tela de configurações.

### Cards e painéis neutros

Um `.card.soft` neutro e um `.panel` neutro não mostram tom: eles ficam sobre o tom de fundo discreto um passo distante da página, então aparecem como uma área separada sem chamar atenção. Com uma intenção embutida, eles recebem o tom comum. [Composição → Superfícies neutras ficam sem tom em repouso](./composing.md#superfícies-neutras-ficam-sem-tom-em-repouso) traz os detalhes, incluindo o hover.

### Cards clicáveis

| Classe         | Efeito                                                                                                      |
| -------------- | ----------------------------------------------------------------------------------------------------------- |
| `.interactive` | Cursor de ponteiro, cor de hover, clique e um anel de foco. O mesmo que `.hoverable` e `.pressable` juntos. |
| `.hoverable`   | Só a cor de hover, sem cursor de ponteiro.                                                                  |
| `.pressable`   | Só o clique e o cursor de ponteiro.                                                                         |

No visual padrão, um clique reduz levemente o card (`scale(0.97)`); uma estética pode substituir isso pelo seu próprio clique, e, com a preferência por movimento reduzido, ele ainda acontece, de imediato.

Use uma das metades num card que responde a um só gesto. Um card que contém o seu próprio botão recebe `.hoverable`, para que clicar no botão não clique o card inteiro.

```html
<article class="card">Neutral card</article>
<article class="card success solid">Filled success card</article>
<article class="card primary ghost edged">Intent border, no fill</article>
<a class="card success soft interactive" href="/settings/billing">Billing: tinted at rest, deeper on hover</a>
<article class="card hoverable">Tinted on hover; the action is a nested button</article>
<aside class="panel">A sidebar</aside>
```

Essas classes só estilizam. Coloque-as num link ou botão de verdade e dê a ele um nome acessível; um `<div class="card interactive">` não pode receber foco nem ser usado pelo teclado.

Um card `.interactive` ou `.pressable` desabilitado mostra o cursor de não permitido em vez do ponteiro, seja um `<button>` com `disabled`, seja um elemento com `.disabled`, `aria-disabled="true"` ou `data-disabled`.

## Tabelas

A tela de configurações lista as chaves de API numa tabela:

```html
<div class="table-wrap">
  <table class="data-table">
    <caption class="visually-hidden">
      API keys
    </caption>
    <thead>
      <tr>
        <th scope="col">Name</th>
        <th scope="col">Created</th>
        <th scope="col">Status</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>Deploy bot</td>
        <td>3 March 2026</td>
        <td>Active</td>
      </tr>
      <tr class="destructive">
        <td>Old laptop</td>
        <td>12 June 2024</td>
        <td>Revoked</td>
      </tr>
    </tbody>
  </table>
</div>
```

| Classe        | Efeito                                                                                                                                                               |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.data-table` | Estiliza uma `<table>`: largura total, texto `.text-body`, um fundo no cabeçalho, o canto de superfície, padding nas células e uma cor de hover nas linhas do corpo. |
| `.table-wrap` | Rola a tabela para os lados quando ela é mais larga que o seu contêiner.                                                                                             |
| `.ruled`      | Num `.data-table`. Desenha uma linha entre as linhas do corpo.                                                                                                       |
| `.ruleless`   | Num `.data-table`. Não desenha nenhuma linha dentro da tabela.                                                                                                       |

### Intenção das linhas

As linhas de uma tabela recebem a intenção da tabela, então `.data-table.success` deixa o cabeçalho e as linhas divisórias verdes. Uma linha com a sua própria classe de intenção usa essa, como faz o `<tr class="destructive">` da chave revogada. `<tr class="neutral">` volta uma linha para neutro dentro de uma tabela colorida. Numa tabela `.solid`, uma linha com a sua própria intenção mantém a cor de texto da tabela, para continuar legível sobre o preenchimento da tabela, e mostra a sua intenção pela linha divisória e pelo hover. Este é o único lugar em que uma intenção é herdada, porque as linhas são partes da tabela, e não componentes separados.

Só as seis intenções embutidas e `.neutral` mudam a cor de uma linha do corpo. Uma linha com uma intenção que você mesmo definiu, como `<tr class="beta">`, fica igual ao resto da tabela: o texto, a linha divisória e o hover vêm da intenção da tabela. Para marcar essa linha, escreva nela uma classe de intenção embutida e troque, na própria linha, a família de cores dessa intenção, como descreve [Temas → Sua própria intenção](./theming.md#sua-própria-intenção), ou pinte a linha com os seus próprios utilitários.

### Linhas divisórias de tabela

Uma tabela desenha linhas embaixo do cabeçalho e em cima do rodapé. `.ruled` e `.ruleless` as mudam junto com as linhas entre as linhas do corpo:

| Classe      | Embaixo do cabeçalho e em cima do rodapé | Entre as linhas do corpo |
| ----------- | ---------------------------------------- | ------------------------ |
| `.ruleless` | Não                                      | Não                      |
| _nenhuma_   | Sim                                      | Não                      |
| `.ruled`    | Sim                                      | Sim                      |

`--ui-rule` é o token por trás das duas classes, então um contêiner pode adicionar linhas divisórias a todas as tabelas dentro dele: `style="--ui-rule: 100%"` funciona como `.ruled`, e `0%` como `.ruleless`.

A moldura em volta da tabela é separada: uma tabela não tem borda por padrão, e `.edged` adiciona uma. As três escolhas não afetam umas às outras, então `.data-table.ruleless.edged` é uma tabela com moldura e sem linhas dentro, e `.data-table.ruled` tem todas as linhas separadas e nenhuma moldura.

### Apresentação em tabelas

Uma tabela lê a [apresentação](./composing.md#apresentação) no seu cabeçalho, nas suas linhas divisórias e na sua borda:

```html
<table class="data-table success soft edged">
  …
</table>
<table class="data-table ghost">
  <!-- No header background: only lines and text -->
</table>
```

- `.soft`, o padrão, dá ao cabeçalho o tom de fundo discreto, `--color-foreground`, em todas as intenções. Uma tabela não tem estado de hover para um tom, então um `.data-table.success.soft` não fica verde; as linhas divisórias e a borda dele ficam.
- `.ghost` remove o fundo do cabeçalho, deixando as linhas divisórias e o texto.
- `.solid` preenche o cabeçalho com a cor da intenção.

### Cantos e rolagem

Uma tabela recebe o canto de superfície, como um card ao lado dela. As células dos cantos carregam os cantos, então uma `<caption>` acima da tabela não é cortada em nenhum navegador. Uma célula que ocupa várias linhas até um canto inferior deixa esse canto reto.

`.table-wrap` rola, e um elemento com rolagem corta o que é desenhado fora dele, incluindo um tooltip numa célula; veja [Tooltips → Onde um tooltip é cortado](./tooltips.md#onde-um-tooltip-é-cortado).

- Sob uma estética que desenha um brilho em volta dos componentes, como `.cyber`, o wrapper abre espaço para o brilho, para que ele não seja cortado. O wrapper então se estende até essa distância além do seu pai, o que só aparece quando o pai encosta na borda da janela.
- O wrapper só consegue abrir espaço para o brilho de uma estética em volta dele. Coloque a classe de estética no `.table-wrap` ou num elemento acima dele, e não só na tabela.
- Sombras, como a de uma tabela `.raised`, não ganham espaço e são cortadas.

Mantenha o wrapper em qualquer tabela que possa ficar mais larga que o seu contêiner; sem ele, uma tabela larga alarga a página inteira.

## Citações, código e teclas

| Classe          | Uso                                                                                    | Visual padrão                          | Cores da intenção   |
| --------------- | -------------------------------------------------------------------------------------- | -------------------------------------- | ------------------- |
| `.quote`        | Um `<blockquote>`. Um `<cite>` dentro dele fica sem itálico e recebe a cor da citação. | Uma barra no início, sem preenchimento | Barra, fundo, texto |
| `.quote-inline` | Uma citação `<q>` inline.                                                              | Só o estilo de citação                 | Nada                |
| `.kbd`          | Uma tecla que o usuário pressiona, como <kbd>Ctrl</kbd>.                               | Um chip tingido com borda              | Fundo, borda, texto |
| `.code`         | Código inline.                                                                         | Um chip tingido sem borda              | Fundo, texto        |
| `.pre`          | Um bloco de código. Ele rola para os lados quando uma linha é longa demais.            | Um bloco tingido sem borda             | Fundo, texto        |

```html
<p>Press <kbd class="kbd">Ctrl</kbd> + <kbd class="kbd">K</kbd> to search members.</p>
<p>Use the <code class="code">Authorization</code> header with your API key.</p>
<kbd class="kbd primary solid">Ctrl</kbd>
<kbd class="kbd primary soft edged">Shift</kbd>
```

Um `.kbd`, `.code` ou `.pre` fica sobre o tom suave da sua intenção, `--color-surface` no neutro, e uma classe de intenção embutida adiciona 12% da sua cor por cima. `.ghost` não é suportado nesses três: o fundo tingido é o que faz deles chips, então eles o mantêm e `.ghost` não muda nada. A fonte deles é `--font-mono`; veja [Temas → Fontes](./theming.md#fontes).

## A seguir

A página de [Predefinições](./presets.md) mostra como definir um visual uma única vez, em vez de em cada elemento. [Acessibilidade](../accessibility.md) lista o que o CSS faz pelos seus usuários e o que a sua aplicação ainda deve a eles.
