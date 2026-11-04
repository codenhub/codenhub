---
title: Montando uma tela
description: Organize o layout da página de configurações, defina a tipografia e adicione cards e botões enquanto aprende intenção, preenchimento, borda e estética.
order: 3
source: 8fa5ed2f6fb9a2786f61301f94bbe806649d7e1d
---

# Montando uma tela

Esta página transforma a estrutura vazia da [Configuração](./setup.md) na primeira parte de verdade da tela de configurações: um cabeçalho de página, um card de perfil com os botões de salvar e cancelar, e um resumo do plano ao lado de um card de uso. No caminho, ela apresenta as três escolhas que todo componente faz, intenção, apresentação e estética, no momento em que a tela precisa de cada uma. Todo o resto desta documentação se apoia nesse modelo.

## A menor tela possível

Um cabeçalho de página e um card com um botão:

```html
<main class="section">
  <div class="section-content narrow stack">
    <h1 class="text-title">Account settings</h1>
    <section class="card stack">
      <h2 class="text-title-sm">Profile</h2>
      <p>Your name appears on invoices and shared projects.</p>
      <button class="btn primary" type="button">Save changes</button>
    </section>
  </div>
</main>
```

Cada classe faz uma coisa só:

- `.section` dá espaçamento à página: uma margem lateral responsiva (de 1 a 2rem) e um espaço generoso acima e abaixo (de 4 a 7rem).
- `.section-content` centraliza uma coluna com largura máxima; `.narrow` faz essa largura ser 48rem em vez de 80rem, uma largura confortável para um formulário.
- `.stack` empilha os filhos na vertical com um espaçamento de 1rem.
- `.text-title` e `.text-title-sm` definem tamanhos de título: 1.875rem em negrito e 1.25rem em seminegrito.
- `.card` é um contêiner com borda, cantos arredondados e 1.25rem de padding.
- `.btn` cria um botão, e `.primary` dá a ele a cor primária.

Os títulos não são dimensionados pela tag: o reset dá a um `<h1>` sem classe de tipografia o mesmo tamanho e peso do texto ao redor. Isso mantém a estrutura do documento, ou seja, qual o nível de título de um elemento, separada do tamanho com que você quer que ele apareça. Se quiser títulos estilizados automaticamente, veja [Configuração → HTML sem classes](./setup.md#html-sem-classes).

## Organize o layout da página

Três utilitários de layout cobrem a maioria das telas, e os três usam o mesmo espaçamento, `--layout-gap` (1rem):

- `.stack` para listas verticais de blocos.
- `.cluster` para uma linha que quebra quando acaba o espaço, como um grupo de botões. Adicione `.between` para empurrar o primeiro e o último itens para as extremidades opostas.
- `.auto-grid` para um grid de cards iguais que ganha ou perde colunas conforme o espaço muda. Uma coluna nunca fica mais estreita que `--layout-grid-min` (16rem), a menos que o próprio contêiner seja.

`.tight` (0.5rem) e `.loose` (1.5rem) mudam o espaçamento do layout em que estão. Um layout aninhado mantém o seu próprio espaçamento.

Adicione um cabeçalho e coloque os botões em linha:

```html
<main class="section">
  <div class="section-content narrow stack loose">
    <header class="stack tight">
      <h1 class="text-title">Account settings</h1>
      <p>Manage your profile, plan, and security.</p>
    </header>

    <section class="card stack" aria-labelledby="profile-title">
      <h2 class="text-title-sm" id="profile-title">Profile</h2>
      <p>Your name appears on invoices and shared projects.</p>
      <div class="cluster">
        <button class="btn primary" type="button">Save changes</button>
        <button class="btn ghost" type="button">Cancel</button>
      </div>
    </section>
  </div>
</main>
```

[Conteúdo e layout](./usage/content-and-layout.md) lista todos os utilitários de layout, incluindo `.view`, `.divider` e `.visually-hidden`, e a escala tipográfica completa.

## Intenção: qual cor

O botão de salvar é `.primary` e o de cancelar não tem intenção, o que o deixa neutro. Uma classe de intenção escolhe um papel de cor:

| Classe         | Use para                               | Cor padrão                                   |
| -------------- | -------------------------------------- | -------------------------------------------- |
| _nenhuma_      | Qualquer coisa sem significado próprio | Os cinzas de texto e de borda da página      |
| `.primary`     | A ação principal de uma tela           | Quase preto no claro, quase branco no escuro |
| `.secondary`   | Uma segunda ação, mais discreta        | Cinza médio                                  |
| `.success`     | Confirmações e estados concluídos      | Verde esmeralda                              |
| `.warning`     | Algo que precisa de atenção em breve   | Âmbar, com texto escuro                      |
| `.destructive` | Exclusões, revogações e erros          | Vermelho rosado                              |
| `.info`        | Avisos neutros e ajuda                 | Índigo                                       |

A intenção fica no elemento que a carrega. Colocar `.destructive` numa `<section>` não deixa vermelhos todos os botões dentro dela; você escreve a classe em cada botão. Isso é proposital: um contêiner que recolorisse silenciosamente tudo o que tem dentro deixaria vermelho também o botão de cancelar de uma zona de perigo vermelha.

`.neutral` declara o padrão explicitamente. Você raramente precisa dela, porque não ter classe de intenção já significa neutro; ela importa onde a cor viria de outro lugar, como numa linha de tabela, que herda a intenção da tabela.

## Apresentação: quanta cor

O botão de cancelar é `.ghost`: sem preenchimento, só o texto colorido, então ele parece menos importante que o de salvar. Esse é o eixo de apresentação, com duas escolhas independentes:

- **Preenchimento:** `.solid` preenche o componente com a cor da intenção e troca o texto para a cor de contraste. `.soft` mistura um tom claro de 12% e mantém o texto na cor da intenção. `.ghost` não tem preenchimento em repouso.
- **Borda:** `.edged` desenha uma borda na cor da intenção; `.edgeless` não desenha nenhuma.

```html
<button class="btn primary">Save changes</button>
<button class="btn primary soft">Preview</button>
<button class="btn primary ghost edged">Export data</button>
<button class="btn ghost">Cancel</button>
```

Todo componente tem o seu próprio padrão quando nenhuma classe de apresentação se aplica. Um botão é sólido e sem borda. Um card não tem preenchimento e tem borda. Um campo de formulário não tem preenchimento e tem borda. [Composição](./usage/composing.md#padrões-dos-componentes) lista o padrão de cada componente.

Diferente da intenção, a apresentação é herdada. Um `.soft` num contêiner deixa tudo dentro dele soft, a menos que um elemento diga o contrário, e uma classe no próprio elemento sempre vence uma herdada de um contêiner:

```html
<div class="cluster soft">
  <button class="btn primary">Soft primary</button>
  <button class="btn success">Soft success</button>
  <button class="btn primary solid">Solid: its own class wins</button>
</div>
```

Alguns componentes limitam o que a apresentação pode fazer, para proteger algo de que precisam. Um campo de formulário que herda de um contêiner `.solid` só é preenchido até 6%, para que o texto digitado continue legível. Um checkbox sempre mantém a borda, porque a borda é a única coisa que mostra uma caixa desmarcada. Esses limites aparecem junto com cada componente e estão reunidos em [Composição](./usage/composing.md).

## Termine a primeira tela

Adicione um resumo do plano ao lado de um card de uso num grid, e dê ao resumo um tom primário soft para que ele se destaque como o estado atual da conta:

```html
<main class="section">
  <div class="section-content narrow stack loose">
    <header class="stack tight">
      <h1 class="text-title">Account settings</h1>
      <p>Manage your profile, plan, and security.</p>
    </header>

    <section class="card stack" aria-labelledby="profile-title">
      <h2 class="text-title-sm" id="profile-title">Profile</h2>
      <p>Your name appears on invoices and shared projects.</p>
      <div class="cluster">
        <button class="btn primary" type="button">Save changes</button>
        <button class="btn ghost" type="button">Cancel</button>
      </div>
    </section>

    <div class="auto-grid">
      <section class="card soft primary stack tight" aria-labelledby="plan-title">
        <h2 class="text-label" id="plan-title">Current plan</h2>
        <p class="text-title-sm">Team, billed yearly</p>
        <p class="text-body">Renews on 12 March 2027.</p>
      </section>
      <section class="card stack tight" aria-labelledby="usage-title">
        <h2 class="text-label" id="usage-title">Storage</h2>
        <p class="text-title-sm">48 GB of 100 GB</p>
        <p class="text-body">Shared by 6 members.</p>
      </section>
    </div>
  </div>
</main>
```

Numa janela larga, os dois cards ficam lado a lado; quando a coluna é estreita demais para duas colunas de 16rem mais o espaçamento entre elas, eles se empilham. A página de [Feedback](./usage/feedback.md) transforma o número do card de armazenamento numa barra de uso.

Um `.card` fica em repouso a uma unidade de profundidade, mas no visual base essa profundidade não tem sombra visível; ela aparece quando uma estética desenha uma ou quando você adiciona `.raised` ou `.floating`. [Composição → Elevação](./usage/composing.md#elevação) trata da profundidade.

## Estética: do que é feito

O terceiro eixo muda o material de tudo o que estiver dentro dele: cantos, espessura de borda, sombras e, às vezes, a fonte. Ele precisa de um import próprio (veja [Configuração → Adicione uma estética](./setup.md#adicione-uma-estética-opcional)):

```html
<main class="section neobrutalism">
  <!-- A mesma tela de configurações: cantos retos, linhas escuras grossas, sombras deslocadas e duras -->
</main>
```

Assim como a apresentação, uma estética é herdada, e um componente dentro dela pode ter outra. Você não precisa dela para montar a tela; a página de [Estéticas](./usage/aesthetics.md) compara as seis.

## Palavras que esta documentação usa

Algumas páginas descrevem como um componente é pintado. Cada uma destas palavras tem um único significado:

| Palavra              | Significado                                                                                                                                                                               |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Preenchimento (fill) | Quanto da cor da intenção cobre o componente, de 0% (`.ghost`) a 100% (`.solid`).                                                                                                         |
| Teto (cap)           | O maior preenchimento que um componente permite. Um campo de formulário limita um preenchimento herdado a 6%, por exemplo.                                                                |
| Placa (plate)        | O fundo pintado do componente: o preenchimento, misturado sobre o chão.                                                                                                                   |
| Chão (ground)        | A cor sobre a qual o preenchimento é misturado. Normalmente é a própria página que aparece por trás; alguns componentes definem o seu, como o tom claro da intenção sob `.kbd` e `.code`. |
| Borda (edge)         | O contorno em volta do componente. É diferente das linhas divisórias, as linhas dentro de uma tabela.                                                                                     |
| Tinta (ink)          | Uma cor usada para desenhar linhas: a borda, as linhas divisórias de uma tabela, a marca de um checkbox. "Tinta do texto" é a cor do texto impresso sobre uma placa.                      |
| Material             | O que uma estética muda: raio e formato dos cantos, espessura e estilo da borda, sombra e transparência.                                                                                  |
| Bloco (slab)         | Uma sombra dura, sem desfoque, deslocada para baixo e para um lado, como as que `.neobrutalism` e `.chunky-tile` desenham.                                                                |
| Elevação             | Quanto da sombra em vigor um elemento recebe: nenhuma (`.flat`), uma unidade (`.raised`) ou duas (`.floating`).                                                                           |

## Os tokens por trás das classes

Toda classe lê custom properties de CSS, chamadas de tokens, então você pode mudar o resultado sem reescrever uma classe:

| Tipo         | Controla                                                                                    | Onde estão listados                                                                      |
| ------------ | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Cor          | A paleta: cores de intenção, texto, bordas e fundos, para o claro e o escuro.               | [Temas → Tokens de cor](./usage/theming.md#tokens-de-cor)                                |
| Fundamentais | Larguras e espaçamentos de layout, raios dos cantos, altura dos controles, foco, movimento. | [Temas → Tokens fundamentais](./usage/theming.md#tokens-fundamentais)                    |
| Intenção     | Os slots de cor que um componente lê depois que uma classe de intenção escolhe um papel.    | [Temas → Tokens de intenção](./usage/theming.md#tokens-de-intenção)                      |
| Apresentação | As porcentagens de preenchimento e de borda que as classes de apresentação definem.         | [Personalização → Tokens de apresentação](./usage/customizing.md#tokens-de-apresentação) |
| Material     | Raio, espessura de borda, geometria da sombra e transparência.                              | [Personalização → Tokens de material](./usage/customizing.md#tokens-de-material)         |
| Estética     | Um ajuste por estética, como `--pixel-unit` ou `--tile-lift`.                               | [Personalização → Tokens de estética](./usage/customizing.md#tokens-de-estética)         |

Os tokens de cor e os fundamentais são o que a maioria das aplicações muda primeiro, para combinar com a marca. Os demais são de nível mais baixo: os componentes os leem, e as classes de apresentação e de estética os definem por você.

## Limites para conhecer desde já

- **A intenção não é herdada.** Escreva-a em cada elemento que a mostra. A única exceção são as linhas de tabela.
- **As classes são só estilo.** `<div class="btn">` parece um botão, mas não pode receber foco nem ser acionado pelo teclado. Use `<button>` ou `<a href>` e veja [Acessibilidade](./accessibility.md).
- **Uma combinação que a documentação não descreve não é suportada.** Ela pode até renderizar, mas pode mudar em qualquer versão; veja [Introdução → O que conta como suportado](./index.md#o-que-conta-como-suportado).

## A seguir

A tela tem uma ação primária e uma discreta. [Botões](./usage/buttons.md) acrescenta o resto: uma ação destrutiva para a zona de perigo, botões de ícone, tamanhos e estados desabilitados.
