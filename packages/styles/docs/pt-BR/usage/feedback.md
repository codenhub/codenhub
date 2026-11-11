---
title: Feedback
description: Um botão de salvando, alertas, badges, placeholders de carregamento e barras de progresso, e o que o seu código precisa manter em sincronia com eles.
order: 3
source: ce1defb7385bc009988d903fd895bcb7edb5ab3b
---

# Feedback

O formulário de perfil já pode ser enviado, mas nada diz ao usuário o que aconteceu. Esta página acrescenta o feedback da tela: um botão de salvar que mostra que está trabalhando, um alerta quando o salvamento dá certo, um badge no card do plano, um placeholder enquanto o perfil carrega e barras para o uso do armazenamento e para uma exportação de dados. O pacote desenha cada um deles; o seu código decide quando eles aparecem, atualiza os valores e garante que os leitores de tela fiquem sabendo.

## Mostre que o formulário está salvando

Não existe classe de carregamento. Um botão de salvando é um botão desabilitado com um ícone girando:

```html
<button class="btn primary" type="submit" disabled>
  <i class="ic-lucide-loader-circle ic-anim-spin" aria-hidden="true"></i>
  Saving…
</button>
```

O spinner vem do `@codenhub/icons`, que este pacote não carrega. Carregue-o uma vez, como mostra [Botões → Carregando ícones](./buttons.md#carregando-ícones); com CSS compilado, fica assim:

```css
@import "@codenhub/icons";
@import "@codenhub/icons/lucide";
```

`ic-anim-spin` gira o ícone e para quando o usuário pede ao sistema movimento reduzido. A família animada `svg-spinners` do `@codenhub/icons` é diferente: a arte dela continua se movendo mesmo com essa preferência. Qualquer um dos dois ícones pega a cor do texto do botão.

Desabilitar o botão impede que um segundo clique envie o formulário duas vezes. Manter ou trocar o rótulo fica a seu critério; o pacote não tem como escondê-lo. Uma mudança no rótulo do botão não é anunciada de forma confiável, então informe o resultado a quem usa leitor de tela com uma mensagem de status, como faz a próxima seção.

## Confirme o resultado com um alerta

Quando o salvamento der certo, mostre um alerta acima do formulário:

```html
<div class="alert success" role="status">Profile saved.</div>
```

`role="status"` faz os leitores de tela anunciarem o texto de forma educada, depois do que estiverem lendo. Para um erro em que o usuário precisa agir, use `role="alert"`, que interrompe:

```html
<div class="alert destructive" role="alert">Your changes were not saved. Check your connection and try again.</div>
```

Os leitores de tela anunciam uma live region quando o conteúdo dela muda, então renderize a região vazia quando a página carregar e coloque a mensagem dentro dela, em vez de inserir um elemento de alerta novo já com o texto dentro. O pacote não acrescenta role, tempo de exibição nem botão de dispensar; isso fica com você.

Um alerta é uma linha com espaçamento de 0.75rem, então um ícone colocado antes da mensagem fica espaçado automaticamente. `.alert-icon` dimensiona um ícone em 1.25rem e o alinha com a primeira linha do texto:

```html
<div class="alert warning" role="status">
  <i class="alert-icon ic-lucide-triangle-alert" aria-hidden="true"></i>
  Your card expires next month. Update it to keep your plan.
</div>
```

Qualquer elemento de ícone funciona: uma classe de um conjunto de ícones, um `<svg>` inline ou um `<img>`. O `@codenhub/icons` dimensiona os glifos numa regra que nenhuma classe consegue superar, então o `.alert-icon` também define o `--ic-size` desse conjunto. Para redimensionar o ícone de um alerta, escreva a sua própria regra definindo `width`, `height` e, no caso do `@codenhub/icons`, `--ic-size`.

### Como os alertas aparecem

Sem classe de apresentação, um alerta é soft e com borda: um tom claro da sua intenção, texto na cor da intenção e uma borda. As classes de apresentação mudam isso como em qualquer componente, como `.alert.primary.solid` para um banner preenchido.

Um alerta sem intenção é uma exceção. Ele não tem tom em repouso; usa `--color-foreground`, o tom de fundo discreto um passo distante da página, o mesmo de um `.card.soft` ou `.panel` neutro. Um alerta com `.primary`, `.secondary`, `.success`, `.warning`, `.destructive` ou `.info` mantém o tom. Só essas seis classes contam aqui: um alerta com uma classe de intenção que você mesmo definiu é tratado como sem intenção; veja [Temas → Sua própria intenção](./theming.md#sua-própria-intenção).

## Identifique o plano com um badge

Um badge é uma pílula pequena para um status ou uma contagem:

```html
<section class="card soft primary stack tight" aria-labelledby="plan-title">
  <div class="cluster between">
    <h2 class="text-label" id="plan-title">Current plan</h2>
    <span class="badge success">Active</span>
  </div>
  <p class="text-title-sm">Team, billed yearly</p>
</section>
```

Um badge é soft e sem borda por padrão, e aceita as mesmas classes de intenção e de apresentação de um botão: `.badge.warning` para "Payment due", `.badge.info.solid` para um "New" preenchido. Diferente de um alerta, um badge sem intenção mantém o tom claro, porque ele não tem borda e, sem o tom, sumiria no texto ao redor.

Um badge neutro que não é `.solid`, como um contador dentro de um `.btn.primary`, imprime na cor de texto do componente preenchido em que está, então continua legível sobre esse preenchimento. Um badge com intenção mantém a própria cor.

## Mostre um placeholder durante o carregamento

Enquanto o card de perfil espera os dados, mostre blocos cinza onde o texto vai ficar:

```html
<section class="card stack" aria-busy="true" aria-labelledby="profile-title">
  <h2 class="text-title-sm" id="profile-title">Profile</h2>
  <p class="visually-hidden">Loading your profile…</p>
  <div class="stack tight" aria-hidden="true">
    <div class="skeleton" style="height: 2.5rem"></div>
    <div class="skeleton" style="width: 60%"></div>
  </div>
</section>
```

Um `.skeleton` ocupa a largura do contêiner e tem pelo menos 1rem de altura. Ele não tem tamanho nem formato próprios: use um elemento de bloco, como uma `<div>`, e defina a largura e a altura de acordo com o conteúdo que ele representa. Um elemento inline vazio, como `<span class="skeleton">`, não tem tamanho e não aparece.

Um skeleton aceita intenção, mas ignora a apresentação. Sem intenção, ele é um cinza claro tingido pela cor do texto ao redor. Ele mostra um brilho em movimento que para quando o usuário pede movimento reduzido.

Marque os blocos com `aria-hidden="true"`, porque eles não significam nada para um leitor de tela. Em vez disso, diga em texto que o conteúdo está carregando, como faz o parágrafo visualmente oculto, e remova o `aria-busy` quando o conteúdo estiver no lugar.

## Mostre o progresso

O card de armazenamento mostra quanto espaço está em uso, e o botão "Export data first" da zona de perigo inicia uma exportação que demora um pouco. Os dois são barras `.progress`:

```html
<div class="progress" role="meter" aria-label="Storage used" aria-valuemin="0" aria-valuemax="100" aria-valuenow="48" aria-valuetext="48 GB of 100 GB" style="--progress-value: 48%"></div>

<div class="progress primary" role="progressbar" aria-label="Export progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="20" style="--progress-value: 20%"></div>
```

`--progress-value` é a largura da parte preenchida, como porcentagem do trilho. É 0% quando não está definido.

- **Escreva com `%`.** `--progress-value: 48` sem unidade não é uma largura válida, e a barra aparece vazia.
- **Nada é limitado nem verificado.** Acima de 100%, o preenchimento é cortado no fim do trilho e parece cheio; um valor negativo também não é uma largura válida. Mantenha o valor entre 0% e 100% no seu código.
- **O valor visual e o valor anunciado são separados.** A largura da barra vem de `--progress-value`; o que um leitor de tela anuncia vem de `aria-valuenow`. O pacote não liga um ao outro, então atualize os dois juntos.

```js
function setExportProgress(bar, percent) {
  const value = Math.min(100, Math.max(0, Math.round(percent)));
  bar.classList.remove("indeterminate");
  bar.style.setProperty("--progress-value", `${value}%`);
  bar.setAttribute("aria-valuenow", String(value));
}
```

Quando você não sabe quanto do trabalho já foi feito, como enquanto a exportação está sendo preparada, use `.indeterminate`. Uma barra com cerca de um terço da largura do trilho varre do início ao fim, sem parar, e `--progress-value` é ignorado. Remova o `aria-valuenow`, porque não há valor conhecido para anunciar:

```html
<div class="progress primary indeterminate" role="progressbar" aria-label="Preparing export"></div>
```

`.active` acrescenta um brilho sobre o trilho de uma barra determinada, para mostrar que o trabalho continua acontecendo entre uma atualização e outra. As duas animações param quando o usuário pede movimento reduzido; uma barra indeterminada fica então parada, com o preenchimento no início.

Com a [folha de estilos sem classes](../setup.md#html-sem-classes), um elemento `<progress>` puro é desenhado como `.progress`: preenchido até o seu `value`, ou com a varredura indeterminada quando não tem `value`. Ele anuncia o próprio valor, então não precisa de `aria-valuenow`.

### Como as barras de progresso aparecem

O preenchimento é a cor da intenção com força total, ou `currentColor` sem intenção. O trilho é soft e sem borda por padrão: um tom claro, sem borda.

O trilho padrão é fraco. Em relação à página, ele mede cerca de 1.1:1 a 1.3:1, abaixo dos 3:1 que o WCAG 1.4.11 pede para as partes de um gráfico necessárias para entendê-lo. Quando a extensão do trilho importa, use `.ghost.edged` com uma classe de intenção, que desenha um contorno em volta dele na cor da intenção. Sem intenção, o contorno é um cinza claro que mede menos de 3:1; [Acessibilidade → Contornos de progresso](../accessibility.md#contornos-de-progresso) traz as medições e o que fazer com uma barra neutra. `.solid` não é suportado no trilho, porque o preenchimento e o trilho teriam a mesma cor. `.ghost.edgeless` renderiza, mas deixa o trilho sem moldura visível.

Para mudar as cores do preenchimento, do trilho ou da borda dele sem mudar a intenção, defina `--progress-color`, `--progress-surface` ou `--progress-edge` na barra ou em qualquer elemento em volta dela. Essas variáveis e `--progress-value` estão listadas em [Personalização → Variáveis de componente](./customizing.md#variáveis-de-componente).

## Animação que não para

Skeletons, brilhos de `.active`, barras indeterminadas e spinners ficam animados enquanto estiverem na página. O pacote para as suas próprias animações quando o usuário pede movimento reduzido ao sistema, mas esse não é o único requisito. O WCAG 2.2.2 pede que um movimento que começa automaticamente, dura mais de cinco segundos e aparece junto com outro conteúdo possa ser pausado, parado ou escondido pelo usuário, a menos que o movimento seja essencial.

Um indicador de carregamento mostrado enquanto o usuário não pode fazer mais nada, e cuja ausência o deixaria confuso, conta como essencial. Um brilho ou spinner que continua se movendo ao lado de um conteúdo com que o usuário está trabalhando, como um brilho decorativo de "ao vivo" num card, não conta. Remova esses assim que o trabalho deles terminar, ou dê ao usuário um controle que os pare.

## A seguir

A tela agora informa o que está fazendo. [Tooltips](./tooltips.md) acrescenta um texto curto de ajuda ao lado de um campo de formulário.
