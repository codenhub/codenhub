---
title: Estéticas
description: Os seis visuais opcionais, o que cada um muda num componente, os seus ajustes e os seus limites.
order: 6
source: f5743a0c576ce5cdb4f75073fbac958901ffdbb0
---

# Estéticas

A tela de configurações já tem as suas cores. Uma estética muda do que os componentes são feitos: os cantos, a espessura das bordas, a sombra e o formato. Coloque `.neobrutalism` no `<main>` da tela de configurações e todo card, botão, campo e badge dentro dele ganha cantos retos, um contorno grosso na cor da tinta e uma sombra dura e deslocada, sem perder as cores. Esta página mostra como adicionar uma estética e depois descreve cada uma das seis: o que ela muda, o número que você pode ajustar e onde ela se comporta de forma diferente do visual padrão.

## Adicione uma estética

As estéticas vêm num entrypoint separado, então carregue-o ao lado da folha de estilos:

```css
@import "@codenhub/styles";
@import "@codenhub/styles/aesthetics";
```

A ordem de carregamento não importa: as classes de estética ficam na camada de cascata `components`, e todo entrypoint declara a ordem das camadas antes de usar qualquer uma, então uma estética importada antes da folha de estilos base vence exatamente como uma importada depois. Veja [Configuração → Camadas de cascata](../setup.md#camadas-de-cascata).

Depois coloque a classe em qualquer elemento. Diferente da intenção, uma estética é herdada: tudo dentro do elemento a recebe.

```html
<main class="neobrutalism stack">
  <section class="card stack" aria-labelledby="profile-title">…</section>
  <section class="card soft destructive stack" aria-labelledby="danger-title">
    …
    <button class="btn destructive" type="button">Delete account</button>
  </section>
</main>
```

A zona de perigo continua vermelha: com neobrutalism, o contorno e a sombra dela também ficam vermelhos, porque essa estética os desenha na intenção do próprio componente. Para carregar uma estética em vez das seis, importe-a pelo nome, como `@codenhub/styles/aesthetics/neobrutalism`; [Configuração → Todos os entrypoints](../setup.md#todos-os-entrypoints) lista todas.

| Classe          | Visual                                                                                                                                                    |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.neobrutalism` | Sem arredondamento, um contorno grosso na cor da tinta, uma sombra dura, sem desfoque e deslocada, e um clique que empurra o elemento para dentro dela.   |
| `.glass`        | Superfícies translúcidas sobre um fundo desfocado, com uma borda fina de brilho.                                                                          |
| `.pixel`        | Cantos cortados por uma unidade do grid, um contorno grosso desenhado como anel interno e a `--font-pixel` fornecida por você, com fallback monoespaçado. |
| `.chunky-tile`  | Blocos arredondados apoiados numa barra mais escura da sua própria cor, com um clique que afunda o elemento na própria barra.                             |
| `.cyber`        | Cantos chanfrados, uma borda fina e brilhante e um brilho na cor do próprio componente.                                                                   |
| `.sketch`       | Cantos elípticos variados, uma linha de tinta sólida com detalhes tracejados, uma sombra pequena deslocada e uma fonte manuscrita opcional.               |

As estéticas funcionam com todas as combinações de preenchimento e borda. `.ghost.edgeless` remove o preenchimento e a borda, então, num componente em que a estética só aparece por eles e pela sombra, sobra pouco da estética; isso é intencional.

Uma classe de apresentação no elemento ainda vence os padrões da estética. A estética define a espessura da borda; a apresentação decide se ela é desenhada.

Uma classe de estética num componente vence uma herdada de um contêiner. Isso vale também para os balões de tooltip: `.tooltip-bubble.glass` recebe o balão de vidro completo dentro de um ancestral pixel, e `.tooltip-bubble.pixel` recebe o balão escalonado completo dentro de um ancestral glass.

O seu próprio CSS vence uma estética. As classes de estética ficam na camada de cascata `components`, então uma regra na sua própria folha de estilos sem camada as vence, assim como um utilitário do Tailwind no mesmo elemento, como `font-mono` numa região `.pixel` ou `[--ui-radius:0]` numa região `.cyber`. Veja [Configuração → Camadas de cascata](../setup.md#camadas-de-cascata).

A maioria das estéticas escala a partir de um único número que você pode definir, como o deslocamento da sombra do neobrutalism ou o tamanho de um pixel. Esses são os ajustes da estética, e cada seção abaixo cita os seus. [Personalização → Tokens de estética](./customizing.md#tokens-de-estética) explica onde eles podem ser definidos.

Para aplicar uma estética a um elemento de outra biblioteca, como um toast ou um dialog, use a [classe solo](./solo.md) dela.

## Neobrutalism

A sombra é projetada na intenção do próprio componente, então um botão de sucesso projeta uma sombra verde e um card destrutivo, uma vermelha. Sem intenção, o contorno e a sombra são a tinta: quase preta numa página clara e quase branca numa escura. Campos e toggles são a exceção. Eles desenham a borda de controle do tema, como fazem sem estética, porque um checkbox em repouso contornado de quase preto pareceria tão chamativo quanto um marcado. O mesmo vale para pixel, cyber e sketch.

`--neo-offset` é o ajuste: o deslocamento da sombra e a distância que o clique percorre são o mesmo número, então escalar o visual escala os dois de uma vez.

```html
<section class="neobrutalism" style="--neo-offset: 6px">
  <button class="btn primary">A deeper shadow</button>
</section>
```

**Exceções:**

- Os chips de conteúdo também recebem a estética. A borda de uma tecla `.kbd` muda do cinza discreto de borda para a tinta, e de 1px para 2px, como todas as outras bordas. Um `.code` ou `.pre` não tem borda por padrão, então não ganha nenhuma; adicione `.edged` para dar a ele uma borda na cor da tinta.
- Só o `.btn` e um `.card` que optou por isso respondem a hover e clique. Um card opta com `.interactive`, ou com uma das suas metades — `.hoverable` só para a resposta ao hover, `.pressable` só para o clique; um card simples, um alerta ou um painel é um contêiner e fica parado.
- Um alerta fica sobre a sombra deslocada nesta estética, e em nenhuma outra. Fora daqui, um alerta é plano, mas aqui a sombra é um segundo contorno, e não profundidade, e um alerta sem ela parece inacabado ao lado de todo o resto. Isso inclui um alerta dentro de uma região `.neobrutalism` aninhada, e um alerta que carrega a própria classe, `.alert.neobrutalism`. `.flat` ainda a remove e `.floating` ainda a dobra.
- O gatilho de tooltip recebe o canto zero como todo o resto e fica quadrado; o `.radio` mantém o círculo.
- Com `prefers-reduced-motion: reduce`, o clique ainda acontece, mas de imediato: o elemento pousa na sua sombra sem se deslocar até ela. O clique é o sinal de que ele foi registrado, então só o movimento some.
- Ela não tem fonte própria e define a do tema, `--font-default`, na região, para que uma região neobrutalism aninhada dentro de pixel, cyber, sketch ou chunky tile não herde a fonte delas. Uma fonte que você define só com `font-family`, no `body` ou num contêiner, não chega dentro da região; defina-a também em `--font-default`, como descreve [Temas → Fontes](./theming.md#fontes).

## Glass

O `.glass` precisa de algo por trás para desfocar. Sobre um fundo de página plano, ele aparece como um painel translúcido simples.

`--glass-radius` e `--glass-radius-surface` são os cantos, com `0.75rem` e `1rem`. O glass é mais arredondado que a geometria base porque um painel translúcido com canto justo parece um recorte, e não uma placa de vidro.

```html
<section class="glass" style="--glass-radius-surface: 1.5rem">
  <div class="card">Softer</div>
</section>
```

**Exceções:**

- Toda superfície numa região glass é de vidro, incluindo um `.card.soft`, um `.panel` e um `.alert` neutros.
- O vidro é o chão, não o preenchimento. Uma apresentação mantém o preenchimento inteiro, então um botão `.solid`, um toggle marcado e um card ou tabela `.solid` são opacos; as placas padrão, `.soft` e `.ghost` são as foscas.
- O desfoque se aplica só a `.card`, `.panel`, `.alert`, ao balão de tooltip e a um `.data-table` padrão ou `.soft`. Os controles continuam sólidos e ficam sobre o vidro: um desfoque sob cada controle de um grupo denso custa uma camada de composição para cada um e vira ruído visual. Os controles ainda recebem o raio, a borda e a sombra da estética.
- Com `prefers-reduced-transparency: reduce`, e em cores forçadas, as superfícies de vidro perdem o desfoque e ficam opacas. As cores forçadas substituem as cores mas mantêm a transparência delas, então sem isso um painel mostraria a página através do fundo do sistema.
- Botões e um `.card` que optou por isso usam o clique simples `scale(0.97)`; com movimento reduzido, o clique ainda acontece, de imediato.
- Ela não tem fonte própria e define a do tema, `--font-default`, na região, como o neobrutalism faz.
- Controles de texto e toggles desenham a linha na tinta da página a 55%, e não com a borda fina branca, que apagaria um checkbox desmarcado numa página clara. Ela é o `--ui-control-ink`; defina-o na região para escolher outra.
- A moldura e as linhas divisórias de uma tabela usam a tinta da página a 20%, porque a borda fina desaparece sobre a placa da tabela. Ela é o `--ui-rule-ink`.
- Uma tabela com `<caption>` desfoca o fundo por trás da legenda, além das linhas, no Chromium e no Safari, cuja caixa da tabela inclui a legenda, e com `.glass-liquid` a borda de luz e o reflexo também emolduram a legenda. O Firefox deixa a legenda fora da placa. Onde isso importar, dê nome à tabela a partir de um título fora dela, com `aria-labelledby`.

### Liquid glass

O `.glass-liquid` é um modificador do glass, inspirado no Liquid Glass da Apple: cantos contínuos, uma borda de luz brilhante onde a luz bate na placa, um desfoque mais leve, um chão mais transparente e uma lente que entorta o que está por trás de uma superfície nas bordas. Coloque-o ao lado de `.glass` na região, ou numa única superfície dentro de uma região glass.

```html
<section class="glass glass-liquid">
  <div class="card">A pane that bends the page behind it</div>
</section>
```

A lente é desenhada por um filtro SVG em `backdrop-filter`, que o Chromium renderiza e o Firefox e o Safari ainda não. Nos outros navegadores, a placa mantém tudo menos a lente: a borda de luz, o desfoque, o chão e os cantos, arredondados em vez de contínuos onde `corner-shape` não é desenhado. Nada precisa ir no seu markup: o filtro vem dentro da folha de estilos.

**Exceções:**

- Ele alcança `.card`, `.panel`, `.alert`, `.surface`, o balão de tooltip, um componente seu criado com `@apply surface` e um `.data-table` padrão ou `.soft`. Os controles continuam sólidos, como no glass, exceto um botão que pede: veja [Botões líquidos](#botões-líquidos).
- Ele desenha o desfoque e a lente no `::before` e no `::after` de cada superfície, então uma superfície dentro de uma região liquid não pode ter um `::before` ou `::after` seu. Cada superfície também vira um contexto de empilhamento posicionado; uma superfície que você mesmo posiciona mantém o seu posicionamento.
- Todo o resto que fica fosco no glass mantém o desfoque leve e o chão mais transparente do liquid, sem a lente nem a borda de luz: uma `<table>` sem classe com `/native`.
- A lente é uma erosão de 8px desfocada em 10px em toda superfície, e de 3px desfocada em 3.5px num botão; a intensidade dela é fixa. Um filtro não consegue ler uma custom property, então nenhum desses valores é um ajuste. Os cantos são, por meio de `--glass-radius` e `--glass-radius-surface`, com padrões maiores: um canto contínuo parece menor que um arredondado com o mesmo raio.
- A região mais próxima decide. Uma região de outra estética aninhada dentro de uma região liquid, ou de `.glass` simples, mantém o seu próprio material e não recebe camadas, e uma região liquid aninhada de novo dentro dela volta a recebê-las.
- Sem `.glass` em vigor, ele muda os cantos e mais nada.
- Com `prefers-reduced-transparency: reduce`, e em cores forçadas, o desfoque e a lente somem e a superfície fica opaca, como no glass.
- O texto fica sobre uma placa mais transparente que no glass. Sobre um conteúdo carregado, confira se o texto continua legível: o chão é 30% da cor da página, contra 45% no glass.

#### Botões líquidos

Um botão é uma placa liquid quando ele mesmo tem `.glass-liquid`, dentro de uma região glass. O modificador só na região deixa todos os botões sólidos: um desfoque e uma lente sob cada controle de uma toolbar densa custam duas camadas de composição para cada um e viram ruído visual, então o botão que deve ser de vidro diz isso.

```html
<section class="glass glass-liquid">
  <button class="btn primary">Solid, like every control</button>
  <button class="btn ghost glass-liquid">A clear pane</button>
  <button class="btn soft success glass-liquid">A tinted pane</button>
</section>
```

- O preenchimento continua sendo [da apresentação](./composing.md#apresentação). `.ghost` é a placa transparente e `.soft`, a tingida; um botão `.solid` mantém a sua placa opaca e recebe a borda de luz e o reflexo por cima dela. Intenção, tamanho, `.pill`, `.icon`, hover e clique funcionam como em qualquer botão.
- Também funciona numa região `.glass` simples, e num botão dentro de um card liquid.
- Ele ocupa o `::before` e o `::after` do botão, então um botão liquid não pode ter um seu.
- Um botão liquid desabilitado mantém o chão e a borda de luz e perde o desfoque e a lente: ele é esmaecido com `opacity`, o que desliga as suas camadas da página por trás.
- O rótulo fica sobre o que estiver por trás do botão. Sobre um conteúdo carregado, confira se ele continua legível, ou use `.solid`.
- Ele alcança o `.btn`, e um `<button>` sem classe só pela classe `.btn`: as camadas são uma lista de classes, da qual o mapeamento de elementos da `/native` não faz parte.

## Pixel

`--pixel-unit` é um pixel do grid imaginário de baixa resolução, `4px` por padrão. Uma unidade quadrada é cortada de cada canto e o contorno tem uma unidade de espessura, então o corte e o que o cobre têm o mesmo tamanho.

```html
<section class="pixel" style="--pixel-unit: 6px">
  <button class="btn primary">Chunkier</button>
</section>
```

**Exceções:**

- Os cantos são uma unidade ou nada. Chips pequenos ficam quadrados em vez de escalonados: badges, teclas, código inline, checkboxes e switches. Uma unidade a menos em cada canto de um badge de 24px pareceria uma mordida, não um canto.
- As superfícies também são quadradas: um `.card`, `.panel` ou `.alert` mantém o anel interno, mas não recebe corte nem recorta nada. Um recorte cortaria tudo dentro dele, então um tooltip num card, uma sombra ou um anel de foco ali seriam aparados.
- Tabelas, barras de progresso e skeletons também são quadrados. Uma tabela não recebe corte porque, no Chromium e no WebKit, a caixa dela inclui a legenda, e o corte cairia na legenda em vez de nas linhas. Barras de progresso e skeletons recebem só o canto quadrado.
- Um bloco de código `.pre` é escalonado como um botão. Ele não tem borda por padrão, então o corte aparece sem contorno em volta.
- O contorno é um anel interno, porque um recorte remove uma borda de verdade — e o anel de foco, pelo mesmo motivo, é uma segunda camada interna, e não um outline. Os dois são a própria borda do elemento, e não uma sombra, então a borda responde a `.edged` e `.edgeless` como uma borda responde: um badge `.edgeless` e um botão `.solid` não desenham nenhuma, um card `.edged` desenha uma, e um campo mantém a sua, peça o contêiner o que pedir.
- O anel de foco interno carrega uma linha de 2px na cor da página por dentro. O anel é da cor primária, então num botão `.solid.primary` ele seria desenhado sobre a sua própria cor; é a linha que aparece ali.
- Em cores forçadas, o anel e o corte somem, porque o sistema remove todas as box shadows: os componentes desenham uma borda real de 2px e cantos quadrados, e o `.pixel-solo` um outline para dentro.
- `.radio` e `.tooltip-icon` nunca são escalonados. O círculo é o que diferencia um radio de um checkbox num relance, então um radio continua redondo. Um gatilho de tooltip de 20px escalonado pareceria mordido, então ele é um quadrado simples.
- A `--font-pixel` fica por sua conta. O pacote não entrega nenhum arquivo de fonte, então a estética não tem efeito colateral de rede e cai na pilha monoespaçada.
- A facilidade de ler dígitos depende da fonte que você escolher. Em tamanhos pequenos, como números de página, contadores e badges, algumas fontes pixeladas desenham `2` e `8`, ou `3` e `9`, tão parecidos que eles são confundidos. O CSS não tem como corrigir isso. Onde números pequenos importam, escolha uma fonte com dígitos bem diferentes.

## Chunky tile

Blocos arredondados apoiados numa barra mais escura da sua própria cor, que afundam ao clicar. É o visual de aplicativos de aprendizado e de jogos para celular; o nome vem do que ele é feito, e não de um produto específico.

`--tile-lift` é a profundidade da barra e a distância que o clique percorre, `4px` por padrão. Um único número controla os dois, então a borda superior desce exatamente a profundidade da barra e a borda inferior não se move. `--tile-radius` é o canto, `0.75rem`, e é um valor só, e não um par controle/superfície, de propósito — o canto compartilhado é o que faz um botão e o card em que ele está parecerem o mesmo objeto.

```html
<section class="chunky-tile" style="--tile-lift: 6px; --tile-radius: 0.5rem">
  <button class="btn success">Continue</button>
</section>
```

A barra é um tom mais escuro da própria cor do elemento, e não uma sombra embaixo dele, então ela acompanha todas as intenções: um botão de sucesso fica sobre uma borda verde-escura, um destrutivo sobre uma vermelho-escura, e um card simples sobre uma borda cinza que combina com a linha que ele já desenha. Medido na paleta clara, `.btn.success` é `#007a55` sobre `#004c34`. Numa página escura, uma superfície quase preta não tem como ficar mais escura, então a barra dela fica mais clara e parece uma borda.

**Exceções:**

- Só botões e cards ficam sobre uma barra, porque são os componentes que repousam acima da elevação zero. Um badge, chip, campo ou tooltip é plano até pedir profundidade com `.raised`, e `.flat` tira a barra de qualquer coisa:

  ```html
  <div class="card soft edgeless info flat">Promo panel, deliberately flat</div>
  ```

- A `--font-rounded` fica por sua conta. Uma grotesca arredondada e pesada é boa parte desse visual, e o pacote não entrega nenhum arquivo de fonte, então, se você não fornecer nada, é usada a pilha de fontes da própria página.
- Os rótulos são desenhados mais pesados e com um leve espaçamento entre letras, por meio de `--ui-label-weight` e `--ui-label-tracking`, então os seus utilitários `font-*` ou `tracking-*` ainda vencem. Isso alcança `.btn` e `.badge`, e um `<button>` sem classe só onde a `/native` o estiliza. A caixa das letras fica como está: como um rótulo é escrito é decisão da aplicação, então, se você quiser botões em maiúsculas, escreva essa regra na sua própria folha de estilos.
- `.card.interactive` afunda ao clicar como um `.btn`, então um bloco de resposta chunky desce sobre a barra ao ser clicado; `.card.pressable` recebe o mesmo clique sozinho. Um `.card` simples fica parado.
- O `.primary` padrão é quase preto numa página clara e quase branco numa escura, e a barra é sempre misturada em direção ao preto. Numa página clara, a barra de um botão primário é quase invisível contra a face quase preta (medido: `1.04:1`). Numa página escura, a face quase branca contra a mesma barra se lê bem (`2.48:1`). Dê ao `.primary` um matiz próprio se ele for a chamada para ação e precisar da indicação de profundidade nos dois temas.
- Com `prefers-reduced-motion: reduce`, o clique ainda acontece, mas de imediato, como no neobrutalism.
- A profundidade nesta estética é a barra, nunca uma sombra projetada com desfoque. Tudo o que repousa plano fica rente à página.
- Os controles desenham um cinza mais pesado que os blocos em volta, `neutral-600` no claro e `neutral-400` no escuro, por meio de `--ui-control-ink`, para que um campo pareça um campo dentro de um bloco.

## Cyber

Cantos chanfrados, uma borda de 1px e um brilho na cor do próprio componente: um botão de sucesso brilha em verde, um card destrutivo em vermelho. O chanfro é desenhado com `corner-shape`, então a borda, o brilho e o outline de foco acompanham o corte, em vez de serem recortados por ele.

Controles e superfícies recebem o corte em diagonais opostas, então um botão e o card em volta dele parecem do mesmo material e, ao mesmo tempo, coisas diferentes: botões e campos são cortados em cima à esquerda e embaixo à direita; cards, painéis e alertas, em cima à direita e embaixo à esquerda. Tudo o que é totalmente redondo vira pontas: um radio, o botão de um switch e o ícone de tooltip viram losangos, e um botão pill ou um badge vira um hexágono pontudo. Os chips ficam quadrados, então o checkbox parece um quadrado simples ao lado do radio em losango.

`--cyber-cut` é o corte no tamanho padrão, `0.625rem`. Os controles o escalam conforme o seu passo de tamanho, então um botão de ícone `.p-xs` recebe metade dele e mantém os cantos, e o corte continua sendo de exatos 45 graus. `--cyber-shape` e `--cyber-shape-surface` substituem o posicionamento padrão por qualquer valor de `border-radius`, usado como está escrito. `--cyber-glow` é o desfoque do brilho, `8px`. `--cyber-ink` é a cor da linha e do brilho neutros. Por padrão, ela segue o tema, quase preta numa página clara e quase branca numa escura; defina-a para ter um neutro neon.

```html
<section class="cyber" style="--cyber-ink: rgb(0 229 255); --cyber-cut: 0.75rem">
  <button class="btn">Open terminal</button>
</section>
```

Outros formatos estão a um valor de distância. Defina-os no elemento `.cyber` ou em qualquer ancestral. Um `--ui-radius` definido num elemento alcança esse elemento e todos os componentes dentro dele que não definem o seu próprio. Um formato que você define é usado como está escrito e não escala, então, para um formato escalado num único controle, use `.cut-diagonal-reverse`.

| Formato                        | Valor                 |
| ------------------------------ | --------------------- |
| Os quatro cantos               | `0.625rem`            |
| A outra diagonal               | `0 0.625rem`          |
| Hexágono (pontas nas laterais) | `0.625rem / 50%`      |
| Paralelogramo                  | `0.625rem 0 / 100% 0` |
| Um entalhe, em cima à direita  | `0 0.625rem 0 0`      |

```html
<section class="cyber" style="--cyber-shape: 0.625rem / 50%">
  <button class="btn primary">Hexagonal buttons</button>
</section>
```

Um paralelogramo inclina as laterais para dentro do conteúdo, então dê padding horizontal extra a uma superfície que use esse formato.

**Exceções:**

- Hoje o chanfro só existe no Chromium. O Firefox e o Safari ainda não desenham `corner-shape` e, neles, a estética deixa quadrados os cantos cortados em vez de arredondá-los, e o que é totalmente redondo continua redondo, então o visual degrada para quadrado, com contorno e brilho. Ele ganha o chanfro sem nenhuma mudança assim que um motor de renderização passar a suportá-lo.
- O brilho é um halo, não profundidade, então todo componente o recebe, inclusive campos, badges e alertas, e `.flat` não o remove. `.raised` e `.floating` não acrescentam sombra nesta estética.
- No tema claro, o brilho de um componente neutro ou `.primary` é a tinta quase preta, que parece uma sombra suave, e não luz. O visual fica mais forte numa página escura, ou com um `--cyber-ink` com matiz.
- Um `.btn.icon` simples é um controle quadrado, então recebe a diagonal de controle; um `.btn.icon.pill` é redondo, então vira um losango.
- A `--font-cyber` fica por sua conta. O pacote não entrega nenhum arquivo de fonte, então a estética cai na pilha monoespaçada.
- A caixa das letras fica como está, pelo motivo que [Chunky tile](#chunky-tile) explica.

## Sketch

Contornos desenhados à mão: os controles recebem cantos elípticos longos e irregulares, e cards, painéis, alertas e tabelas recebem cantos mais fechados, que não invadem o padding. Elementos irmãos alternam entre quatro contornos conforme a posição, e o controle de um campo assume a posição do campo, então uma linha de botões ou um formulário empilhado não repete o mesmo formato. A alternância é estável para uma mesma ordem do DOM, e não aleatória a cada renderização. Cada contorno é um `border-radius` completo, usado como está escrito, e não escalado pelo passo de tamanho nem posicionado por `.cut-diagonal`.

A linha de tinta de 1px é sólida; checkboxes, divisores e linhas divisórias de tabela são tracejados. `--ui-line-style: dashed` deixa tracejado qualquer outro componente, e `--ui-rule-style: solid` volta um divisor ou uma tabela para sólido. A sombra dura de 2px é uma indicação de profundidade pequena e neutra.

`--sketch-radius`, `--sketch-radius-surface` e `--sketch-radius-pill` substituem os contornos de controle, de superfície e de botão pill. Defina um deles na região ou em qualquer elemento dentro dela, e todas as posições abaixo recebem aquele contorno. Para dar forma a um único componente, defina `--ui-radius` (`--ui-radius-surface` numa superfície) nele.

```html
<section class="sketch" style='--font-sketch: "Comic Sans MS", cursive'>
  <button class="btn primary">Send note</button>
  <button class="btn ghost edged" style="--ui-line-style: dashed">Draft note</button>
</section>
```

O botão tracejado é `ghost edged` porque um botão preenchido não tem uma linha separada para tracejar.

`.sketch-rounded` troca os cantos longos por cantos curtos e arredondados, limitados para que um elemento largo mantenha as bordas de cima e de baixo retas. Coloque-o ao lado de `.sketch` na região, ou num componente dentro dela. `--sketch-radius-rounded` e `--sketch-radius-surface-rounded` são os ajustes dele.

```html
<section class="sketch sketch-rounded">
  <div class="card">
    <button class="btn primary">Rounded action</button>
  </div>
</section>
```

**Exceções:**

- O sketch identifica os componentes pelo nome para alternar os contornos, então os contornos dele só alcançam os componentes deste pacote; uma região de outra estética aninhada dentro de uma região sketch mantém os cantos daquela estética. A região mais próxima decide, então uma região sketch aninhada de novo dentro dela volta a alternar os contornos.
- Os chips, como checkboxes, teclas, código, badges, switches e barras de progresso, alternam entre contornos pequenos e irregulares definidos em `--ui-radius-tight`. Defina esse token num chip para escolher o formato dele.
- Um `.btn.pill` recebe uma pílula arredondada limitada à sua própria altura, para que um botão largo não vire um oval. Badges, barras de progresso e switches recebem o contorno de chip. Radios e o ícone de tooltip continuam círculos, levemente irregulares, para que um radio nunca seja confundido com um checkbox. Um `--ui-radius-pill` explícito num elemento ainda vence.
- A `--font-sketch` fica por sua conta. O pacote não entrega nenhuma fonte manuscrita e cai na família `cursive` da plataforma.
- Os botões usam o clique simples `scale(0.97)`; com movimento reduzido, o clique ainda acontece, de imediato.
- Com a [`/native`](../setup.md#html-sem-classes), um `<hr>`, uma `<table>` e um checkbox puros recebem os detalhes tracejados de `.divider`, `.data-table` e `.checkbox`.
- O modo de cores forçadas desenha os detalhes tracejados como sólidos, como todas as outras linhas de material.

## Classes solo

Uma classe de estética não muda nada num elemento que este pacote não estiliza, como um toast de outra biblioteca. Cada estética também entrega uma classe solo, como `.glass-solo`, que aplica o seu visual àquele único elemento. A página de [Classes solo](./solo.md) trata delas.

## A seguir

[Classes solo](./solo.md) aplica esses visuais a componentes de outras bibliotecas. Se todos os componentes da sua tela vêm deste pacote, os guias terminam aqui: [Composição](./composing.md), [Personalização](./customizing.md) e [Conteúdo e layout](./content-and-layout.md) são as páginas de consulta, e a página de [Acessibilidade](../accessibility.md) lista o que a sua aplicação ainda deve aos usuários.
