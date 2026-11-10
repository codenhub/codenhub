---
title: Personalização
description: Consulta sobre tokens de apresentação e de material, ajustes das estéticas, as seis variáveis públicas de componente, a paleta gerada e os helpers para criar os seus próprios componentes.
order: 9
source: d2e88766839dce9b892543088ac5026f32c4620a
---

# Personalização

Esta é uma página de consulta para mudar o pacote além das suas classes. [Temas](./theming.md) trata das cores e dos tokens fundamentais; esta página trata do resto:

- [Tokens de apresentação](#tokens-de-apresentação): quanto de uma intenção um componente mostra.
- [Tokens de material](#tokens-de-material): do que um componente é feito.
- [Tokens de estética](#tokens-de-estética): os ajustes que cada estética expõe.
- [Variáveis de componente](#variáveis-de-componente): as seis variáveis que um único componente lê.
- [Paleta gerada](#paleta-gerada): valores de cor fixos para código que não pode carregar o pacote.
- [Helpers de composição](#helpers-de-composição): as classes a partir das quais você monta um componente seu.

## Tokens de apresentação

Os tokens de apresentação descrevem _quanto_ de uma intenção um componente mostra, nunca _qual_ intenção ele mostra. São números sem unidade e porcentagens, então não carregam cor e são herdados com segurança: um contêiner os define uma vez e cada componente abaixo os resolve contra a sua própria intenção.

| Token             | Finalidade                                                                                                           | Padrão                               |
| ----------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `--ui-fill`       | Porcentagem da cor da intenção misturada ao fundo.                                                                   | O padrão do componente; veja abaixo. |
| `--ui-fg-on-fill` | Porcentagem da mistura do tom forte da intenção em direção à sua cor de contraste.                                   | O padrão do componente.              |
| `--ui-border`     | Porcentagem da cor de borda da intenção na borda.                                                                    | O padrão do componente.              |
| `--hover-step`    | Somado ao preenchimento em repouso sob o ponteiro, em `--intent-hover`. Defina-o em `:root` ou em qualquer elemento. | `14%`                                |

Sem valor definido, cada componente usa o seu próprio padrão, listado em [Composição → Padrões dos componentes](./composing.md#padrões-dos-componentes). As classes de apresentação definem os três primeiros com os valores de [Composição → Apresentação](./composing.md#apresentação). Não há tokens de hover por apresentação: o hover é sempre o preenchimento em repouso mais `--hover-step`, até 100%.

Nenhuma classe de preenchimento escreve `--ui-border` e nenhuma classe de borda escreve `--ui-fill`. Uma caixa preenchida sem linha é `.solid.edgeless`, e `.solid.edged` renderiza a mesma caixa: a linha some à medida que o preenchimento aumenta, então até um preenchimento neutro, limitado e translúcido, aparece através da sua própria borda como uma demão só.

```css
background: color-mix(in oklab, var(--color-primary) var(--ui-fill, 100%), transparent);
```

Ali há duas escolhas deliberadas. Misturar em direção a `transparent`, e não a um token de fundo, deixa uma superfície tingida se adaptar a onde quer que ela seja colocada. Misturar em `oklab` mantém intacta a paleta de tokens de gama ampla e mistura de forma perceptual, onde `srgb` a cortaria.

Por isso, uma cor computada chega à página como um resultado resolvido de `color-mix`, e não na sintaxe `oklch` do próprio token. É a mesma cor; código que compara strings de cores computadas deve comparar as cores.

> **Contrato dos tokens de apresentação**: só as classes de apresentação e as substituições de quem usa o pacote definem esses tokens; os componentes só os leem. Definir um valor que nenhuma classe de apresentação produz é suportado, mas não validado. Veja [Composição](./composing.md) para as classes que entregam esses valores.

## Tokens de material

Os tokens de material descrevem do que um componente é _feito_, e não qual intenção ele mostra ou com que força. Eles controlam formato, bordas, sombras, translucidez, filtros e transformações.

Os componentes leem cada um com um fallback, então deixá-los sem valor dá o visual padrão. Definidos num contêiner, eles mudam o estilo de tudo dentro dele. A única exceção é `--ui-elevation`, que não é herdado, então só alcança o elemento em que é definido; veja [Composição → Elevação](./composing.md#elevação).

A geometria da sombra é dividida em partes sem cor, então elas são herdadas com segurança. Tokens que recebem uma cor, como `--ui-ink` e `--ui-surface-shadow`, podem incluir a sua própria.

| Token                     | Finalidade                                                                                                                                                                  | Fallback                                                |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `--ui-corner`             | Canto de controle no tamanho padrão; escalado pelo passo de tamanho.                                                                                                        | `--radius-control`                                      |
| `--ui-corner-surface`     | Canto de superfície no padding padrão; escalado pelo passo de tamanho.                                                                                                      | `--radius-surface`                                      |
| `--ui-corner-tl`          | `0` ou `1`: se o canto superior esquerdo recebe o canto. `-tr`, `-br` e `-bl` para os outros.                                                                               | `1`                                                     |
| `--ui-radius`             | Um raio de controle completo, usado como está escrito: substitui o canto, o passo e o padrão.                                                                               | Calculado a partir do canto                             |
| `--ui-radius-surface`     | Um raio de superfície completo, usado como está escrito.                                                                                                                    | Calculado a partir do canto                             |
| `--ui-scale`              | Substitui o passo de tamanho que as classes de tamanho e de padding definem.                                                                                                | O passo                                                 |
| `--ui-corner-shape`       | O que todo canto desenha: `round`, `bevel` para um corte reto ou `squircle` para uma curva contínua. Hoje só no Chromium.                                                   | `round`                                                 |
| `--ui-radius-pill`        | Canto do que é totalmente redondo por padrão: badges, switches, progresso, o ícone de tooltip; `.btn.pill` e `.radio` o leem sem outro fallback além de totalmente redondo. | `--ui-radius`, `--ui-corner`, depois totalmente redondo |
| `--ui-radius-tight`       | Raio completo para chips, como um checkbox, `.kbd` ou `.code`, quando definido. Sem valor, um padrão pequeno calculado.                                                     | `min(--ui-radius ou --ui-corner, pequeno)`              |
| `--ui-line-style`         | Estilo de toda linha que um componente desenha: `solid`, `dashed`, `dotted` ou `double` (com 3px de espessura ou mais).                                                     | `solid`                                                 |
| `--ui-border-width`       | Espessura da borda.                                                                                                                                                         | `--border-width`                                        |
| `--ui-border-max`         | Teto da espessura de borda calculada.                                                                                                                                       | `100px`                                                 |
| `--ui-ink`                | Cor de linha neutra quando nenhuma intenção está definida.                                                                                                                  | `--color-border`                                        |
| `--ui-control-ink`        | Cor de linha neutra de campos, selects, checkboxes, radios e switches quando nenhuma intenção está definida.                                                                | `--ui-ink`, depois `--color-control-border`             |
| `--ui-rule-ink`           | Cor de linha neutra da moldura e das linhas divisórias de uma tabela quando nenhuma intenção está definida.                                                                 | `--ui-ink`, depois `--color-border`                     |
| `--ui-rule`               | Linhas dentro de uma tabela. Sem valor, desenha só os limites do cabeçalho e do rodapé; `0%` não desenha nenhuma; `100%` separa todas as linhas.                            | sem valor                                               |
| `--ui-shadow-x`           | Deslocamento horizontal da sombra.                                                                                                                                          | `0px`                                                   |
| `--ui-shadow-y`           | Deslocamento vertical da sombra.                                                                                                                                            | `0px`                                                   |
| `--ui-shadow-blur`        | Raio de desfoque da sombra.                                                                                                                                                 | `0px`                                                   |
| `--ui-shadow-spread`      | Raio de espalhamento da sombra.                                                                                                                                             | `0px`                                                   |
| `--ui-shadow-inset`       | A palavra-chave `inset` para um anel interno.                                                                                                                               | Vazio                                                   |
| `--ui-hover-shadow-x`     | Deslocamento horizontal da sombra durante o hover.                                                                                                                          | `--ui-shadow-x`                                         |
| `--ui-hover-shadow-y`     | Deslocamento vertical da sombra durante o hover.                                                                                                                            | `--ui-shadow-y`                                         |
| `--ui-active-shadow-x`    | Deslocamento horizontal da sombra durante o clique.                                                                                                                         | `--ui-shadow-x`                                         |
| `--ui-active-shadow-y`    | Deslocamento vertical da sombra durante o clique.                                                                                                                           | `--ui-shadow-y`                                         |
| `--ui-active-transform`   | Transformação durante o clique. Mantida sob `prefers-reduced-motion`, que tira só a transição dela.                                                                         | `scale(0.97)`                                           |
| `--ui-active-translate-x` | Distância que um clique percorre na profundidade do elemento; `-y` ao lado. Escalado como a sombra.                                                                         | `0px`                                                   |
| `--ui-shadow-ink`         | Porcentagem da cor da sombra tirada da tinta da intenção.                                                                                                                   | `0%`                                                    |
| `--ui-halo-blur`          | Desfoque de um halo em volta do elemento; `--ui-halo-spread` ao lado. A elevação não o escala.                                                                              | `0px`                                                   |
| `--ui-halo-ink`           | A parte da cor da intenção no halo, sobre nada. Sem valor, não há halo.                                                                                                     | Sem valor                                               |
| `--ui-shadow-edge`        | Declarado, mesmo vazio, quando a sombra é a borda do elemento, e não a sua profundidade. Lido pela presença.                                                                | Sem valor                                               |
| `--ui-elevation`          | Multiplicador sem unidade sobre a geometria da sombra. Não é herdado.                                                                                                       | `1`                                                     |
| `--ui-surface-shadow`     | Sombra completa de várias camadas, aceita só por superfícies.                                                                                                               | Sem valor                                               |
| `--ui-surface-ground`     | Chão sobre o qual fica uma superfície, ou uma tabela padrão ou `.soft`.                                                                                                     | `--color-background`                                    |
| `--ui-bg-alpha`           | Multiplicador sobre todo preenchimento, `.solid` incluído. Nenhuma estética entregue o define.                                                                              | `1`                                                     |
| `--ui-backdrop`           | Filtro de fundo aceito só por superfícies e por uma tabela padrão ou `.soft`.                                                                                               | `none`                                                  |
| `--ui-surface-image`      | Uma camada pintada sobre a placa de uma superfície: qualquer valor de `background-image`. Só superfícies.                                                                   | `none`                                                  |
| `--ui-hover-transform`    | Transformação durante o hover de um elemento interativo.                                                                                                                    | `none`                                                  |
| `--ui-clip`               | Silhueta estrutural do componente.                                                                                                                                          | `none`                                                  |
| `--ui-clip-tight`         | Silhueta compacta do componente.                                                                                                                                            | `--ui-clip`                                             |
| `--ui-focus-inset`        | Espessura da camada interna de foco.                                                                                                                                        | Sem valor                                               |
| `--ui-label-weight`       | Peso do rótulo de `.btn` (e, com `/native`, de um `<button>` sem classe) e de `.badge`.                                                                                     | Seminegrito num botão, negrito num badge                |
| `--ui-label-tracking`     | Espaçamento entre as letras do rótulo. Sem valor, é `normal`, então nem o espaçamento da página nem o de um contêiner chega ao rótulo.                                      | `normal`                                                |
| `--ui-label-case`         | `text-transform` do rótulo.                                                                                                                                                 | `none` num botão; herdado num badge                     |
| `--ui-label-shadow`       | `text-shadow` do rótulo, escrito sem cor para receber a do próprio rótulo.                                                                                                  | `none` num botão; herdado num badge                     |

```html
<section style="--ui-corner: 0; --ui-border-width: 3px">
  <button class="btn primary">Square and heavy</button>
  <input class="ipt" placeholder="Matches" />
</section>
```

> **Contrato dos tokens de material**: os componentes os leem; as classes de estética e as substituições de quem usa o pacote os definem.

### Tamanho e padrão dos cantos

O canto escala com o elemento. `.p-xs` define um passo de tamanho de `0.5`, `.sm` e `.p-sm` `0.75`, e `.lg` e `.p-lg` `1.25`. Quando uma classe de tamanho e uma de padding estão no mesmo elemento, o menor passo vence, então `.lg.p-xs` é pequeno. `box` multiplica `--ui-corner` pelo passo, então um botão pequeno recebe um canto pequeno e um chanfro continua sendo de exatos 45 graus. A profundidade acompanha o passo para baixo, mas não para cima: um botão `.p-xs` fica sobre metade da sombra da sua estética, e um `.lg` sobre a sombra inteira. Um clique que percorre essa profundidade, dado por `--ui-active-translate-x` e `-y`, percorre a mesma distância escalada, então sempre termina rente.

Quais cantos recebem o canto é uma escolha à parte. `.cut-diagonal` mantém o superior esquerdo e o inferior direito e deixa os outros dois retos; `.cut-diagonal-reverse` mantém o outro par. As duas definem `--ui-corner-tl`, `-tr`, `-br` e `-bl`, que você também pode definir: uma folha de dois cantos no visual padrão, dois cortes num controle sob `.cyber`. Uma superfície sob `.cyber` mantém o formato de superfície da própria estética, que o padrão não alcança, e um `--ui-radius` ou `--ui-radius-surface` explícito ignora o passo e o padrão.

### Linhas, camadas e rótulos

`--ui-line-style` alcança toda linha que um componente desenha: a borda da caixa, o trilho de progresso, e divisores e linhas divisórias de tabela. `--ui-rule-style` pode substituir só os divisores e as linhas divisórias de tabela, sem mudar a borda da caixa; o sketch o usa para os detalhes tracejados. Uma linha tracejada ou pontilhada mantém a sua cor, então mantém o seu contraste. Uma linha `double` precisa de 3px de espessura ou mais para desenhar duas linhas.

`--ui-halo-*` é luz, e não profundidade: um brilho na cor da intenção do próprio elemento. A elevação não o escala, e `.flat` o mantém. Ele só aparece quando a sua tinta está definida.

`--ui-surface-image` coloca qualquer `background-image` sobre a placa de uma superfície: cards, painéis, alertas e tooltips, não controles. Quem o define é responsável pelo contraste do texto sobre ele, e o seu próprio `background-image` numa superfície ainda vence.

`--ui-label-*` trata o rótulo de um botão ou de um badge: peso, espaçamento entre letras, caixa e uma sombra de texto. Escreva a sombra sem cor, como `0 0 6px`, para que ela receba a cor do próprio rótulo e não possa reduzir o seu contraste. Os seus próprios utilitários `font-*`, `tracking-*` e de caixa ainda vencem. Um rótulo não herda o espaçamento entre letras, então um utilitário `tracking-*` em um contêiner deixa os seus botões e badges em `normal`; para espaçar todos os rótulos de uma região, defina `--ui-label-tracking` nela, que eles herdam.

Em cores forçadas, cada um deles desenha a sua versão simples: uma linha sólida, sem halo, sem camada pintada e sem sombra no rótulo. A silhueta e o anel abaixo também somem. As cores forçadas removem todas as box shadows, então `--ui-clip`, `--ui-clip-tight`, `--ui-border-max` e `--ui-shadow-edge` são limpos e um componente desenha a sua borda real com `--ui-border-width`.

### Composição de formato e anel

O recorte remove bordas, outlines e sombras externas. Uma estética que usa um recorte pode substituir a borda por uma sombra interna definindo `--ui-shadow-inset` e as quatro partes da geometria da sombra. Defina `--ui-border-max: 0px` quando esse anel substitui a borda do componente. Os componentes focáveis restauram o outline de foco recortado por meio de `--ui-focus-inset`: uma camada interna dessa espessura em `--focus-ring`, com uma linha de 2px de `--color-background` por dentro, para que o foco continue visível num componente preenchido com a própria cor do anel.

Um recorte não é a única forma de cortar um canto. `--ui-corner-shape: bevel` desenha o canto que o raio define como um corte reto em vez de um arco, e a borda, a sombra externa, o outline de foco e o fundo desfocado o acompanham. Um elemento chanfrado, portanto, mantém o seu brilho e a sua linha, enquanto um recortado perde os dois. O `.cyber` o usa. Motores sem `corner-shape` o ignoram e desenham o raio arredondado, então uma estética que chanfra deve deixar o raio reto sob `@supports not (corner-shape: bevel)`. Um chanfro num raio total vira pontas: um radio, um `.btn.pill` e tudo o que lê `--ui-radius-pill` viram losangos ou hexágonos pontudos.

`--ui-radius` aceita qualquer valor de `border-radius` e é usado como está escrito, então pode posicionar o canto por lado: `10px 0` corta só o superior esquerdo e o inferior direito. Os cantos de pill e de chip são tokens separados. Um canto de chip sem valor calcula um padrão pequeno a partir de `--ui-radius`, depois `--ui-corner`, limitado a `--radius-small`; um `--ui-radius-tight` explícito é usado como está escrito, mesmo para um valor por canto ou elíptico. Substituições de estética e de quem usa o pacote podem, portanto, dar a um chip um formato maior ou mais irregular. `.btn.pill` recebe `--ui-radius-pill` antes dos outros raios; sob o sketch, ele recebe um contorno de pílula irregular, desenhado à mão, cujas pontas têm o mesmo tamanho. Um `--ui-radius-pill` explícito nesse botão ainda vence.

Declare `--ui-shadow-edge` quando esse anel _é_ a borda. O anel então recebe a cor da borda do elemento, que carrega o eixo de borda como o seu alfa, então `.edged` o desenha e `.edgeless` não — a mesma resposta que uma borda real dá. Sem ele, o anel é desenhado em todo componente que a estética alcança e as classes de borda não têm efeito. Use `--ui-shadow-ink` quando a sombra for profundidade projetada na própria tinta da intenção, como um bloco duro deslocado, que um elemento `.edgeless` ainda recebe.

O token é lido pela presença, e não pelo valor: declare-o vazio para ligar o anel, e `initial` para desligá-lo de novo numa estética aninhada dentro de uma que o declara.

```css
.stepped {
  --ui-clip: polygon(/* structural silhouette */);
  --ui-clip-tight: none;
  --ui-border-max: 0px;
  --ui-shadow-inset: inset;
  --ui-shadow-edge: ;
  --ui-shadow-x: 0px;
  --ui-shadow-y: 0px;
  --ui-shadow-blur: 0px;
  --ui-shadow-spread: 4px;
  --ui-focus-inset: var(--focus-ring-width);
}
```

Variáveis com o prefixo `--_` são saídas internas de composição — `--_bg`, `--_fg`, `--_edge`, `--_fill`, `--_shadow` e os slots de repouso `--_d-*` que um componente declara para o `box` ler. Não as defina nem as leia; só as entradas `--ui-*` acima são públicas.

## Tokens de estética

As [classes de estética](./aesthetics.md) entregues definem tokens de material por você. Só as estéticas com um token listado abaixo expõem um token específico de estética. Ajuste todo o resto do comportamento pelos tokens de material compartilhados acima. Os tokens listados só estão disponíveis onde a folha de estilos daquela estética é importada.

| Token                             | Estética                     | Finalidade                                                                                                           | Padrão                                                                |
| --------------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `--neo-offset`                    | `.neobrutalism`              | Deslocamento da sombra dura e distância que o clique percorre.                                                       | `4px`                                                                 |
| `--glass-radius`                  | `.glass`, `.glass-liquid`    | Raio do canto de controle. `1rem` sob `.glass-liquid`.                                                               | `0.75rem`                                                             |
| `--glass-radius-surface`          | `.glass`, `.glass-liquid`    | Raio do canto de superfície. `1.5rem` sob `.glass-liquid`.                                                           | `1rem`                                                                |
| `--pixel-unit`                    | `.pixel`                     | Um pixel do grid. O corte do canto e o anel têm uma unidade.                                                         | `4px`                                                                 |
| `--font-pixel`                    | `.pixel`                     | Pilha de fontes pixeladas fornecida por quem usa o pacote.                                                           | Cai na pilha monoespaçada                                             |
| `--tile-radius`                   | `.chunky-tile`               | Raio do canto, igual em controles e superfícies.                                                                     | `0.75rem`                                                             |
| `--tile-lift`                     | `.chunky-tile`               | Profundidade da barra de apoio e distância que um clique percorre.                                                   | `4px`                                                                 |
| `--font-rounded`                  | `.chunky-tile`               | Pilha de fontes arredondadas fornecida por quem usa o pacote.                                                        | Cai na pilha da página                                                |
| `--cyber-cut`                     | `.cyber`                     | O corte no tamanho padrão, igual em controles e superfícies; os controles o escalam com o passo.                     | `0.625rem`                                                            |
| `--cyber-shape`                   | `.cyber`                     | Onde os controles recebem o corte: qualquer valor de `border-radius`.                                                | `<cut> 0` (superior esquerdo, inferior direito)                       |
| `--cyber-shape-surface`           | `.cyber`                     | Onde as superfícies recebem o corte: qualquer valor de `border-radius`.                                              | `0 <cut>` (superior direito, inferior esquerdo)                       |
| `--cyber-glow`                    | `.cyber`                     | Desfoque do brilho.                                                                                                  | `8px`                                                                 |
| `--cyber-ink`                     | `.cyber`                     | Cor neutra da linha e do brilho, onde nenhuma intenção define uma.                                                   | Tinta do tema (quase preta, quase branca)                             |
| `--font-cyber`                    | `.cyber`                     | Pilha de fontes técnicas fornecida por quem usa o pacote.                                                            | Cai na pilha monoespaçada                                             |
| `--sketch-radius`                 | `.sketch`                    | Raio do contorno de controle: qualquer valor de `border-radius`.                                                     | Contorno de caixa irregular, com variação entre irmãos                |
| `--sketch-radius-surface`         | `.sketch`                    | Raio do contorno de contêiner de superfície: qualquer valor de `border-radius`.                                      | Contorno quadrado, fechado e irregular, com variação entre irmãos     |
| `--sketch-radius-rounded`         | `.sketch`, `.sketch-rounded` | Raio do contorno arredondado de controle: um contorno elíptico expressivo, com variação entre irmãos.                | `26px 10px 24px 11px / 12px 23px 11px 20px` com variação entre irmãos |
| `--sketch-radius-surface-rounded` | `.sketch`, `.sketch-rounded` | Raio do contorno arredondado de contêiner de superfície: um contorno elíptico expressivo, com variação entre irmãos. | `38px 16px 36px 17px / 16px 34px 17px 32px` com variação entre irmãos |
| `--sketch-radius-pill`            | `.sketch`                    | Raio do contorno de um botão pill: uma pílula irregular, desenhada à mão, cujas pontas têm o mesmo tamanho.          | `24px 16px 23px 17px / 17px 21px 16px 20px` com variação entre irmãos |
| `--font-sketch`                   | `.sketch`                    | Pilha de fontes manuscritas fornecida por quem usa o pacote.                                                         | Cai em `cursive`                                                      |

Os ajustes de todas as estéticas alcançam os elementos da mesma forma: cada ajuste é _lido_ com o seu padrão como fallback de `var()`, e não declarado, então ele é resolvido uma vez numa variável privada na própria classe da estética (`--_pixel-unit`, `--_neo-offset`, `--_tile-radius`, `--_tile-lift` e assim por diante). Defina um ajuste no elemento que tem a classe de estética, ou em qualquer ancestral, incluindo `:root`:

```html
<section class="pixel" style="--pixel-unit: 6px">
  <button class="btn primary">Chunkier</button>
</section>
```

```html
<html class="pixel" style="--pixel-unit: 6px">
  <body>
    <button class="btn primary">Also chunkier, set from the root</button>
  </body>
</html>
```

Ajustes e tokens de material alcançam os elementos em direções opostas. Um ajuste é lido uma vez, no elemento com a classe de estética, e o resultado é herdado. Então defina um ajuste nesse elemento ou num acima dele; definido num elemento dentro da estética, ele não muda nada, porque o valor já foi lido.

`--ui-radius` e os outros tokens de material são lidos por cada componente no momento em que ele é desenhado. Eles funcionam no elemento em que são definidos e em tudo dentro dele, e é assim que você arredonda um card de forma diferente dos vizinhos sem mexer no ajuste.

As estéticas entregues definem os tokens de material compartilhados acima. Toda estética entregue define `--ui-ink` para a sua linha neutra. Toda estética entregue também define `--ui-control-ink`: `.glass` e `.chunky-tile` com uma linha própria, mais pesada que a das suas superfícies, e as outras com `--color-control-border`, já que a tinta delas é quase preta ou quase branca e um checkbox em repouso contornado com ela pareceria marcado. `.glass` também define `--ui-rule-ink`, para que as linhas de uma tabela apareçam sobre a sua placa; as outras o limpam. As classes de intenção ainda substituem os slots de intenção de cada componente.

Os mesmos ajustes controlam a [classe solo](./solo.md) de cada estética, que os lê no seu próprio elemento.

## Paleta gerada

`@codenhub/styles/palette` é uma folha de estilos gerada com cores fixas: para cada intenção e apresentação, a cor de fundo, de texto e de borda que um componente desenharia, como custom properties `--palette-*` planas. Ela é para código que não pode carregar a folha de estilos deste pacote, como uma biblioteca que lista `@codenhub/styles` como peer opcional, mas quer combinar com ele. Onde você puder carregar a folha de estilos, use os componentes.

**Os valores são um retrato das cores entregues.** Eles foram calculados a partir do tema padrão do pacote no build e não mudam quando você substitui um token. Se você definir `--color-primary` com a cor da sua marca, `--palette-primary-solid-bg` continua sendo o quase preto entregue. Código que precisa seguir o seu tema tem que ler os tokens `--color-*`, o que significa carregar `@codenhub/styles/theme`.

```css
@import "@codenhub/styles/palette";
```

```css
.my-badge {
  background: var(--palette-success-soft-page-bg);
  color: var(--palette-success-soft-fg);
  border-color: var(--palette-success-soft-page-edge);
}
```

Todo valor é uma cor final, nunca uma referência a outra variável, então o arquivo não precisa de mais nada carregado.

Nomenclatura: `--palette-<intent>-<presentation>-<slot>`, em que `<intent>` é uma das sete intenções publicadas (`neutral`, `primary`, `secondary`, `success`, `warning`, `destructive`, `info`) e `<presentation>` é `solid`, `soft` ou `ghost`. `<slot>` é `bg`, `fg` ou `edge`. Dois qualificadores se somam só onde se aplicam:

- Um qualificador de chão, `page` ou `subtle`, antes do slot. Ele só aparece no `bg` e no `edge` de `.soft` e `.ghost`, porque um preenchimento `.solid` cobre o seu chão e a cor do texto nunca depende dele.
  - Sem qualificador é o que `.badge` e `.btn` desenham, sobre um chão transparente: `--palette-success-soft-bg`.
  - `page` é o que `.alert` desenha, sobre a página: `--palette-success-soft-page-bg`.
  - `subtle` é o que `.kbd`, `.code` e `.pre` desenham, sobre o tom subtle da própria intenção: `--palette-success-soft-subtle-bg`.

  Cada valor é lido do próprio componente, então inclui o que o componente faz por conta própria. Um `.alert`, `.kbd`, `.code` ou `.pre` neutro mantém um preenchimento mais discreto que um `.badge` neutro, e os seus valores `neutral-soft-page` e `neutral-soft-subtle` refletem isso. `.tooltip-bubble` não corresponde a nenhum dos três: sem intenção, ele é preenchido com o seu próprio tom de tooltip, e a sua borda é sólida em vez de esmaecida.

- Um sufixo `-hover`, só em `bg` e `edge`, porque a cor do texto não muda no hover: `--palette-success-soft-page-bg-hover`. `.alert`, `.kbd`, `.code` e `.pre` não têm hover próprio, então os seus valores de hover são o que o componente desenha quando você adiciona `box-hover` a ele.

Os valores claros são definidos em `:root`. Os valores escuros se aplicam sob `.dark`, `.theme-dark` ou `[data-theme="dark"]` no elemento ou num elemento acima dele, os mesmos seletores que o tema do pacote usa. Os valores claros também se aplicam sob `.light`, `.theme-light` e `[data-theme="light"]`, então o tema explícito mais próximo vence: uma área clara dentro de uma escura lê os valores claros.

O arquivo não segue `prefers-color-scheme`. Código que usa a paleta sozinha já troca de tema por conta própria, então ele define uma dessas classes ou atributos.

Mais três tokens não têm intenção, apresentação, chão nem hover: `--palette-border`, `--palette-surface` e `--palette-text`, valores fixos de `--color-border`, `--color-surface` e `--color-text`. Eles servem para o que não é colorido por intenção, como a borda de um contêiner, o fundo de um dialog e o seu texto.

## Variáveis de componente

Seis variáveis são lidas por um único componente e são entradas suportadas. Todas as outras variáveis que um componente declara, como `--surface-padding`, `--field-gap`, `--switch-*`, `--table-*` ou `--quote-*`, são internas e podem mudar em qualquer versão.

| Variável             | Elemento       | Valor                             | Padrão                                                                  | Efeito                                                                                          | Onde definir                                                                                     |
| -------------------- | -------------- | --------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `--progress-value`   | `.progress`    | Uma porcentagem, de `0%` a `100%` | `0%`                                                                    | Largura da parte preenchida. Não é limitada; um valor sem `%` é inválido e aparece vazio.       | Na barra ou em qualquer elemento em volta dela.                                                  |
| `--progress-color`   | `.progress`    | Uma cor                           | A cor da intenção                                                       | Cor da parte preenchida e do brilho de `.active`.                                               | Na barra ou em qualquer elemento em volta dela.                                                  |
| `--progress-surface` | `.progress`    | Uma cor                           | A cor da intenção no preenchimento da apresentação: 12% por padrão      | Cor do trilho.                                                                                  | Na barra ou em qualquer elemento em volta dela.                                                  |
| `--progress-edge`    | `.progress`    | Uma cor                           | A cor de borda da intenção na borda da apresentação: nenhuma por padrão | Cor da borda do trilho. Ela só aparece onde o trilho tem espessura de borda, como com `.edged`. | Na barra ou em qualquer elemento em volta dela.                                                  |
| `--input-group-gap`  | `.input-group` | Um comprimento                    | `0.5rem`                                                                | Espaço entre o controle e o seu ícone ou texto.                                                 | No próprio `.input-group`. O grupo declara o padrão, então um valor num elemento pai é ignorado. |
| `--tooltip-linger`   | `.tooltip`     | Um tempo                          | `300ms`                                                                 | Quanto tempo o balão fica depois que o ponteiro sai do gatilho.                                 | No próprio `.tooltip`. O wrapper declara o padrão, então um valor num elemento pai é ignorado.   |

```html
<div class="progress" role="meter" aria-label="Storage used" aria-valuemin="0" aria-valuemax="100" aria-valuenow="92" style="--progress-value: 92%; --progress-color: var(--color-warning)"></div>

<div class="input-group" style="--input-group-gap: 0">
  <span>app.example.com/u/</span>
  <input class="ipt" id="profile-url" aria-label="Profile address" />
</div>
```

Os exemplos em contexto estão em [Feedback → Mostre o progresso](./feedback.md#mostre-o-progresso), [Formulários → Adicione um ícone ou um prefixo fixo](./forms.md#adicione-um-ícone-ou-um-prefixo-fixo) e [Tooltips → Hover, permanência e Escape](./tooltips.md#hover-permanência-e-escape).

## Helpers de composição

Para criar um componente que o pacote não entrega, como um controle segmentado ou um chip de filtro, monte-o com as mesmas classes a partir das quais os componentes do pacote são construídos. Com o CSS compilado, escreva-as como classes; com o código-fonte do Tailwind, você também pode aplicá-las com `@apply`.

| Classe         | O que dá a um elemento                                                                                                                                                                                      |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `box`          | A caixa pintada: fundo, cor do texto, borda, canto, sombra, o material da estética, o anel de foco e o visual desabilitado. Lê intenção, apresentação, estética e elevação.                                 |
| `box-hover`    | A cor de hover, para algo que é clicado, e não digitado. Adicione-a junto com `box`.                                                                                                                        |
| `box-active`   | O clique: um leve encolhimento, ou o clique da própria estética. Adicione-a junto com `box`.                                                                                                                |
| `surface`      | `box` com os padrões de uma superfície: sem preenchimento e com borda, o canto de superfície e o fundo, o desfoque e a sombra de superfície da estética, como num card.                                     |
| `text-control` | `box` com os padrões de um campo de texto: sem preenchimento e com borda, as regras de preenchimento limitado e de borda, a cor do placeholder, uma borda que muda no hover e no foco, e o estado inválido. |

Chips de filtro para a lista de membros, um pressionado e outro não:

```html
<button class="box box-hover box-active neutral soft edgeless" type="button" aria-pressed="true" style="padding: 0.25rem 0.75rem; border-radius: 999px">Admins</button>

<button class="box box-hover box-active neutral ghost edgeless" type="button" aria-pressed="false" style="padding: 0.25rem 0.75rem; border-radius: 999px">Owners</button>
```

`box` não lê `aria-pressed`, então o chip pressionado só parece pressionado porque tem `.soft`. Quando o seu código mudar `aria-pressed`, mude a classe de apresentação junto: `.soft` quando pressionado, `.ghost` quando não.

O que dar a cada um:

- **`box` precisa de uma classe de preenchimento e de uma de borda.** Ele não tem padrões próprios, então, sem `.solid`, `.soft` ou `.ghost` e sem `.edged` ou `.edgeless`, no elemento ou num contêiner, ele não desenha nada. `surface` e `text-control` têm padrões e funcionam sozinhos.
- **Dê nome à intenção no `box`.** Um elemento `box` recebe a intenção do elemento mais próximo em volta dele que tenha uma, diferente dos componentes do pacote. Coloque `.neutral` ou uma classe de intenção nele. `surface` e `text-control` são neutros, a menos que o elemento tenha uma classe de intenção, como os componentes.
- **`@apply` leva o helper inteiro.** `@utility my-field { @apply text-control; }` recebe o mesmo que `class="text-control"`: a intenção neutra e a borda de campo, `.soft`, `.solid` e `.edgeless` no elemento, e o visual inválido com `aria-invalid="true"`. `@apply surface` é neutro da mesma forma. Para colorir um elemento assim, uma classe de intenção que você mesmo definiu precisa ser CSS simples ou um utilitário, e não uma regra em `@layer components`.
- **Escreva como utilitário a classe que aplica um helper.** O que `@apply` copia cai na [camada de cascata](../setup.md#camadas-de-cascata) da regra em que está escrito. Os helpers são utilitários, e `@utility my-field` mantém a sua classe em `utilities` ao lado deles, então os seus outros utilitários continuam a alcançá-la. Escrita como CSS simples, `.my-field { @apply text-control; }` fica sem camada, e tudo o que o helper declara vence qualquer utilitário no elemento: uma classe de intenção que você escreveu como utilitário deixa o campo neutro, e `mt-8` não move um dialog. O seu próprio CSS sem camada ainda disputa com ele, por especificidade e depois por ordem no código, como quaisquer duas regras sem camada.
- **Um dialog funciona com `@apply surface`.** Um `<dialog>` fechado com uma classe sua que faz `@apply surface` fica escondido, e um aberto fica centralizado, como com `.card`. Esconder um fechado vence um utilitário de display como `flex`; uma margem que você define ainda posiciona um aberto, e um utilitário de margem também posiciona quando a sua classe é um utilitário.
- **Tamanho e espaçamento ficam por sua conta.** Nenhum dos helpers define padding, largura ou altura; `text-control` não define a altura de 2.5rem que `.ipt` adiciona.
- **Comportamento e semântica também.** Use um `<button>`, `<input>` ou `<a href>` de verdade, ou adicione você mesmo o role e o tratamento de teclado, e defina estados como `aria-pressed` ou `aria-invalid`. `box` desenha o visual desabilitado para `disabled`, `.disabled`, `aria-disabled="true"` e `data-disabled`, mas só o atributo `disabled` bloqueia a interação.

Não defina nem leia as variáveis com prefixo `--_` que esses helpers usam internamente; elas mudam entre versões.

## A seguir

[Conteúdo e layout](./content-and-layout.md) lista os helpers de layout, a escala tipográfica, as superfícies, as tabelas e os chips de conteúdo.
