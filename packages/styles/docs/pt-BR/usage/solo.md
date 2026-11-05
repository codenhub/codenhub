---
title: Classes solo
description: Como aplicar uma estética a um único elemento de outra biblioteca, como um toast ou um dialog, e o que uma classe solo lê e ignora.
order: 7
source: 245473b119daf480163d69d38527a11b536fb5a0
---

# Classes solo

Suponha que a tela de configurações mostre "Profile saved" num toast de uma biblioteca de notificações, e não no alerta deste pacote. Sob `.neobrutalism`, todo card e botão tem o contorno grosso e a sombra dura, e o toast não: uma classe de estética só define valores que os componentes deste pacote leem, então não muda nada num elemento que o pacote não estiliza. Uma classe solo aplica a estética diretamente no único elemento que a carrega:

```html
<div class="toast neobrutalism-solo success" role="status">Profile saved.</div>
```

## As seis classes solo

Cada estética entrega a sua classe solo no mesmo entrypoint, e uma classe solo não precisa de mais nada carregado:

```css
/* The only stylesheet from this package on the page. */
@import "@codenhub/styles/aesthetics/glass";
```

```html
<div class="toast glass-solo">A pane over whatever is behind it.</div>
```

| Estética        | Classe solo          | Desenha                                                                                                                                                                                                                                        |
| --------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.glass`        | `.glass-solo`        | Um fundo translúcido, uma borda fina de brilho, o desfoque, uma sombra suave em duas camadas e o canto de superfície. Com `.glass-liquid`, a placa liquid, desenhada no seu `::before` e `::after`.                                            |
| `.neobrutalism` | `.neobrutalism-solo` | Uma borda de 2px na cor da tinta, cantos retos e a sombra dura deslocada.                                                                                                                                                                      |
| `.pixel`        | `.pixel-solo`        | O contorno escalonado, o anel interno no lugar de uma borda e a fonte pixelada.                                                                                                                                                                |
| `.chunky-tile`  | `.chunky-tile-solo`  | O canto do bloco, uma borda de 2px, a barra embaixo dele e a fonte arredondada.                                                                                                                                                                |
| `.cyber`        | `.cyber-solo`        | A diagonal de superfície (a diagonal de controle num botão ou link), uma borda de 1px, o brilho e a fonte.                                                                                                                                     |
| `.sketch`       | `.sketch-solo`       | Cantos elípticos irregulares (um contorno mais fechado numa placa, um mais solto num botão ou link, e cantos pequenos e arredondados com `.sketch-rounded`), uma linha de tinta sólida de 1px, a sombra deslocada de 2px e a fonte manuscrita. |

Não coloque uma classe solo nos componentes deste pacote. Um `.card` já desenha o seu preenchimento, a sua borda e a sua intenção, e uma classe solo desenharia uma segunda borda e um segundo preenchimento por cima deles. Use a classe de estética ali; ela também funciona num único elemento: `<button class="btn pixel">`.

## O que uma classe solo lê

Um elemento solo aceita as mesmas classes de apresentação, intenção e elevação que um `.card` aceitaria:

```html
<div class="toast pixel-solo edgeless">No ring</div>
<div class="toast glass-solo solid success">An opaque green pane</div>
<div class="toast neobrutalism-solo flat">No offset shadow</div>

<section class="soft edged">
  <div class="toast chunky-tile-solo info">Soft and edged from the container, info from itself</div>
</section>
```

| O quê                                         | Lido de                                                                                                 |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Preenchimento e borda (`.solid`, `.edged`, …) | O elemento ou qualquer contêiner: a apresentação é herdada, como acontece com os componentes.           |
| Intenção (`.success`, …)                      | Só o elemento, como nos componentes. Um contêiner `.success` deixa neutro um elemento solo dentro dele. |
| Elevação (`.flat`, `.raised`, …)              | Só o elemento, como nos componentes. Ela escala a sombra deslocada, a barra e a sombra do sketch.       |
| A estética em volta (`.pixel`, …)             | Nunca. Veja [O que uma classe solo ignora](#o-que-uma-classe-solo-ignora).                              |

Sem nenhuma dessas classes, uma classe solo desenha só o material (borda, canto, profundidade, contorno, desfoque, fonte e clique) e deixa o fundo e a cor do texto do próprio elemento como estavam.

- **Só as seis intenções embutidas.** Uma classe solo só lê a intenção de `.primary`, `.secondary`, `.success`, `.warning`, `.destructive` e `.info`. Uma classe de intenção definida por você, como em [Temas → Sua própria intenção](./theming.md#sua-própria-intenção), não é lida, e o elemento é desenhado neutro. Para dar uma cor personalizada a um elemento solo, mude o tema de uma das intenções embutidas nele ou num contêiner, como aquela seção descreve.
- **O preenchimento é uma camada sobre o fundo do próprio elemento.** Cinco das seis desenham o preenchimento como uma sombra interna e não definem `background`, então um toast solo `.soft` é um tom sobre o que o toast já era, e um `.solid` com uma intenção colorida é opaco. O glass define o seu próprio fundo, porque o fundo translúcido é o seu material, e mistura o preenchimento sobre ele. Um `.solid` neutro é um tom de 20%, e não o cinza opaco que um componente desenha.
- **A cor do texto pressupõe o tema.** Ela só é definida onde um preenchimento ou uma intenção é pedido, e é a cor que o tema usa na página ou no preenchimento. Num elemento cujo próprio fundo não segue o tema, como um toast branco numa página escura, uma intenção `.soft` ou `.ghost` pode pôr texto claro sobre fundo claro; use `.solid` ou deixe a intenção de fora.
- **Não há tom de hover.** Não se sabe se um elemento solo é clicável, então ele não recebe a cor de hover que um `.btn` recebe.
- **Ela lê os ajustes da sua estética e os tokens do tema, com os valores entregues como fallback.** `--glass-radius-surface`, `--neo-offset`, `--pixel-unit`, `--tile-lift`, `--tile-radius`, `--cyber-cut`, `--cyber-shape`, `--cyber-shape-surface`, `--cyber-glow`, `--cyber-ink`, `--sketch-radius`, `--sketch-radius-surface`, `--sketch-radius-rounded`, `--sketch-radius-surface-rounded` e os tokens de fonte, como `--font-sketch`, funcionam todos, definidos no elemento ou em qualquer ancestral. Com o tema carregado, ela segue o tema; sem ele, renderiza o visual entregue.
- **Os valores escuros precisam de um esquema de cores.** Os pares claro e escuro usam `light-dark()`, que segue o `color-scheme` do elemento. O tema do pacote o define; uma página sem o tema recebe os valores claros.
- **As classes que ela lê vêm do tema.** `.solid`, `.edgeless`, `.success`, `.flat` e as demais vêm na folha de estilos base e em `@codenhub/styles/theme`. Com só um entrypoint de estética na página, essas classes não fazem nada, e a classe solo desenha o seu visual sem classes.

## O que uma classe solo ignora

- **A estética em volta.** Ela não lê nenhum dos valores que uma classe de estética define, nem `--elevation-color`. Um `.glass-solo` dentro de uma região `.pixel` mantém os seus próprios cantos, e `--ui-radius` ou `--ui-border-width` definidos nele ou acima dele não fazem nada. Ajuste-o pelos seus ajustes.
- **Os seus próprios filhos.** Um elemento solo não é uma região de estética. Um componente dentro dele mantém o visual da página em volta, mesmo com `.glass-liquid` ou `.sketch-rounded` ao lado da classe solo. Ele só passa adiante o que qualquer contêiner passa: a fonte da classe solo e o preenchimento ou a borda de uma classe de apresentação nele, então um `.card` dentro de uma placa `.glass-solo.solid` é sólido, como dentro de qualquer contêiner `.solid`.
- **A sombra do glass e `.flat`.** `.flat` não remove a sombra de `.glass-solo`, assim como não remove sob `.glass`.

## Como ela vence e quando ela se move

- **Ela vence os estilos da outra biblioteca.** As regras são sem camada e têm uma classe de profundidade, então vencem as regras com camada de um componente, e as de especificidade zero, onde quer que as duas carreguem. Uma regra externa sem camada que seja mais específica, ou igualmente específica e posterior na página, ainda vence. O outro lado disso é que um utilitário do Tailwind no mesmo elemento, como `rounded-none`, perde para a classe solo: use os ajustes dela em vez disso.
- **Ela só faz clicar uma ação.** Neobrutalism, chunky tile e cyber afundam ao clicar um `button`, um `a[href]`, um `[role="button"]`, um `summary` ou um `input` do tipo botão que não esteja desabilitado. Todo o resto fica parado, então um toast não afunda ao ser clicado. O movimento reduzido remove o deslocamento. O rótulo mais pesado do chunky tile segue a mesma regra.

## A seguir

Os guias terminam aqui. [Composição](./composing.md), [Personalização](./customizing.md) e [Conteúdo e layout](./content-and-layout.md) são as páginas de consulta, e a página de [Acessibilidade](../accessibility.md) lista o que o CSS faz pelos seus usuários e o que a sua aplicação ainda deve a eles.
