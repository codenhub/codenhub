---
title: Tooltips
description: Ajuda de campo que abre no hover e no foco, como ligá-la a leitores de tela e à tecla Escape, e onde um tooltip é cortado.
order: 4
source: ac236b423d466ebd014b7738dd076ace2cfc50a3
---

# Tooltips

O switch "Public profile" da tela de configurações merece uma explicação curta: o que fica visível quando ele está ligado. Esta página acrescenta um botão de ajuda ao lado dele que mostra um tooltip no hover e no foco pelo teclado. O CSS mostra, esconde e desenha a mensagem; você a liga ao gatilho para os leitores de tela, adiciona a tecla Escape e confere se nada em volta a corta.

## Um tooltip de ajuda

```html
<div class="cluster tight">
  <label class="cluster tight">
    <input class="switch primary" type="checkbox" role="switch" name="public-profile" />
    Public profile
  </label>
  <span class="tooltip">
    <button class="tooltip-icon" type="button" aria-label="About public profiles" aria-describedby="public-profile-help">?</button>
    <span class="tooltip-bubble" role="tooltip" id="public-profile-help">Anyone with the link can see your name, photo, and public projects.</span>
  </span>
</div>
```

As três partes:

- `.tooltip` envolve o gatilho e a mensagem. Ele posiciona a mensagem e não pinta nada.
- `.tooltip-bubble` é a mensagem. É um elemento de verdade, então pode ter um `id` para o qual o gatilho aponta.
- `.tooltip-icon` é um gatilho pequeno e redondo, para uma mensagem sem mais nada a que se prender. Qualquer elemento focável pode ser o gatilho no lugar dele: envolva um `.btn` existente em `.tooltip` e ele mantém o próprio visual.

Faça a ligação você mesmo: um `id` no balão, `aria-describedby` no gatilho apontando para esse `id` e `role="tooltip"` no balão. Assim, um leitor de tela lê a mensagem como a descrição do gatilho. O CSS não consegue fazer essa ligação e, sem ela, a mensagem é só visual.

O gatilho precisa ser focável, como um `<button>`, para que quem usa teclado alcance a mensagem. O balão abre quando qualquer coisa dentro de `.tooltip` tem foco, então ele também abre depois de um clique do mouse no gatilho.

## Posicionamento

O balão abre acima do gatilho, centralizado na horizontal, com um espaçamento de 0.5rem. Defina `data-tooltip-position` no `.tooltip` para escolher outro lado:

```html
<span class="tooltip" data-tooltip-position="bottom">
  <button class="btn ghost sm" type="button" aria-describedby="renewal-help">Renews 12 March 2027</button>
  <span class="tooltip-bubble" role="tooltip" id="renewal-help">Your card is charged on this date.</span>
</span>
```

| `data-tooltip-position` | Balão                                            |
| ----------------------- | ------------------------------------------------ |
| _nenhum_ ou `"top"`     | Acima do gatilho, centralizado.                  |
| `"bottom"`              | Abaixo do gatilho, centralizado.                 |
| `"left"`                | À esquerda do gatilho, centralizado na vertical. |
| `"right"`               | À direita do gatilho, centralizado na vertical.  |

Um balão tem a largura do texto, até 18rem, e a partir daí quebra a linha.

### Onde um tooltip é cortado

O balão é posicionado só com CSS, no lado que você escolheu. Nada mede a página: ele não se move para ficar dentro da janela, não vira para o outro lado quando falta espaço e não vai para a camada superior (top layer) da página. Isso tem três consequências:

- **Um contêiner com rolagem ou recorte o corta.** Um ancestral com `overflow: hidden`, `auto` ou `scroll` recorta o balão na borda dele. A tabela de chaves de API da tela de configurações fica num `.table-wrap`, que tem rolagem, então um tooltip acima da primeira linha é cortado no topo do wrapper. Aumentar o `z-index` não ajuda: ele muda sobre o que o balão é pintado, não se o contêiner o recorta.
- **A borda da janela o corta.** Um tooltip acima da primeira linha de uma página, ou um tooltip à direita perto da borda direita, sai da tela.
- **Esquerda e direita são lados físicos.** Numa página da direita para a esquerda, `"left"` continua significando o lado esquerdo da tela.

O que fazer:

- Escolha um lado com espaço: na primeira linha de uma tabela, use `data-tooltip-position="bottom"`.
- Tire o gatilho do tooltip de dentro do contêiner que recorta, ou remova o `overflow` de um contêiner que não precisa dele.
- Se a posição do gatilho não puder ser conhecida de antemão, como numa lista com rolagem ou num painel redimensionável, use uma biblioteca de posicionamento ou o componente de popover do seu framework, que consegue medir e virar. Você ainda pode dar ao elemento da mensagem as classes de `.tooltip-bubble` para o visual, mas mostrar, esconder e posicionar, como descrito nesta página, passam a ser trabalho dessa biblioteca, e não do `.tooltip`.

## Hover, permanência e Escape

O WCAG 1.4.13 pede três coisas de um conteúdo que aparece no hover ou no foco. O pacote resolve duas:

- **Sobrevoável (hoverable).** Quando o ponteiro sai do gatilho, o balão continua visível por `--tooltip-linger` (300ms) e depois desaparece aos poucos, para que o ponteiro consiga atravessar o espaço até ele. Ele continua aberto enquanto o ponteiro estiver em cima dele. Um balão fechado fica com `visibility: hidden`, então ele nunca captura o ponteiro.
- **Persistente.** Ele continua aberto até o ponteiro e o foco saírem.
- **Dispensável.** O usuário precisa conseguir fechá-lo sem mover o ponteiro nem o foco, normalmente com Escape. O CSS não consegue escutar uma tecla, então essa parte é sua.

Para mudar o tempo de permanência, defina `--tooltip-linger` no elemento `.tooltip` ou em qualquer elemento em volta dele, por exemplo `style="--tooltip-linger: 500ms"`. Deixe o tempo longo o bastante para o ponteiro alcançar o balão. `--tooltip-gap` define o espaço entre o gatilho e o balão da mesma forma. As duas são [variáveis públicas de componente](./customizing.md#variáveis-de-componente).

Para o Escape, escreva `data-state="closed"` no `.tooltip`: isso esconde o balão mesmo enquanto ele está com hover ou com foco. Remova o atributo só quando o ponteiro e o foco tiverem saído do tooltip, para que o próximo hover ou foco o abra de novo. Removê-lo antes, enquanto o gatilho ainda tem foco, faz a mensagem reaparecer sem que o usuário faça nada.

```js
for (const tooltip of document.querySelectorAll(".tooltip")) {
  let pointerInside = tooltip.matches(":hover");

  tooltip.addEventListener("pointerenter", () => {
    pointerInside = true;
  });

  tooltip.addEventListener("pointerleave", () => {
    pointerInside = false;
    if (!tooltip.contains(document.activeElement)) tooltip.removeAttribute("data-state");
  });

  tooltip.addEventListener("focusout", (event) => {
    const focusStaysInside = tooltip.contains(event.relatedTarget);
    if (!focusStaysInside && !pointerInside) tooltip.removeAttribute("data-state");
  });
}

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  for (const tooltip of document.querySelectorAll(".tooltip:hover, .tooltip:focus-within")) {
    tooltip.dataset.state = "closed";
  }
});
```

`data-state="open"` faz o contrário: mostra o balão sem hover nem foco, para uma mensagem que deve ficar visível, ou para um teste ou uma captura de tela.

## Como o balão aparece

Sem classe de intenção, o balão usa `--color-tooltip`, um fundo escolhido por tema: quase branco numa página clara, cinza médio numa escura, com `--color-tooltip-contrast` como cor do texto. Quase branco mede só 1.04:1 em relação a uma página clara, então o balão também desenha uma borda fina, e um `.edgeless` de um contêiner não consegue removê-la. Um `.edgeless` no próprio balão ainda consegue. O fundo continua opaco com qualquer apresentação, para que o balão continue legível sobre o que quer que ele cubra.

Uma classe de intenção preenche o balão com a cor dessa intenção e troca o texto para a cor de contraste correspondente:

- `.tooltip-bubble.primary` tem fundo quase preto com texto quase branco numa página clara, e fundo quase branco com texto quase preto numa escura.
- `.tooltip-bubble.destructive` tem fundo vermelho com texto claro nos dois temas.

Coloque as classes de intenção, apresentação, estética e elevação no `.tooltip-bubble`, o elemento que é pintado, e não no `.tooltip`. O balão é plano por padrão, mesmo numa estética que desenha profundidade; adicione `.raised` ou `.floating` ao balão para elevá-lo. Uma estética em vigor dá forma ao balão como a qualquer outro componente; com `.glass`, ele fica fosco como um card. O `.tooltip-icon` assume o canto da estética: quadrado com `.neobrutalism` e `.pixel`, um losango com `.cyber`.

O balão aparece sem o efeito de crescer quando o usuário pede movimento reduzido.

## A seguir

A tela de configurações está completa no visual padrão. [Temas](./theming.md) dá a ela um modo escuro e as cores da sua marca.
