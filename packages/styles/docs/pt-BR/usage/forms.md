---
title: Formulários
description: Campos com rótulo, dicas e erros, ícones e prefixos fixos, selects e toggles de checkbox, radio e switch.
order: 2
source: 6f92be07a240da16dfa5dc835b36a6981985bea9
---

# Formulários

O card de perfil tem um botão de salvar, mas nada para salvar. Esta página o preenche: um nome de exibição com uma dica, um endereço de e-mail que mostra um erro de validação, um endereço de perfil com prefixo fixo, um select de idioma e os toggles de notificações, cobrança e visibilidade do perfil. O pacote estiliza cada controle; o seu HTML fornece os rótulos, a validação e as mensagens de erro, e esta página mostra como ligar uma coisa à outra.

## Um campo com rótulo

Um campo é um rótulo, um controle e uma dica opcional, empilhados:

```html
<div class="field">
  <label class="label" for="display-name">Display name</label>
  <input class="ipt" id="display-name" name="display-name" aria-describedby="display-name-hint" />
  <span class="hint" id="display-name-hint">Shown on invoices and shared projects.</span>
</div>
```

- `.field` empilha os filhos com um espaçamento pequeno (0.35rem) e ocupa a largura toda.
- `.label` define o texto do rótulo: 1rem, peso médio.
- `.hint` é um texto de ajuda menor, na cor secundária. Mantenha-o fora do `<label>` e aponte o `aria-describedby` para ele, para que um leitor de tela o anuncie como descrição em vez de lê-lo como parte do nome do campo.
- `.ipt` estiliza um `<input>`. Use `.textarea` para um `<textarea>` e `.select` para um `<select>`.

Um controle de texto tem pelo menos 2.5rem de altura (`--control-height`), a mesma altura de um botão padrão, então um campo e um botão ficam alinhados numa linha. O visual padrão dele é sem preenchimento e com borda. Um `.textarea` tem pelo menos 7rem de altura e pode ser redimensionado na vertical.

### Tamanhos

`.ipt`, `.select`, `.textarea` e `.input-group` aceitam as classes de tamanho do botão, então um campo pequeno e um botão pequeno ficam alinhados numa linha:

| Classe | Altura | Padding lateral | Texto     |
| ------ | ------ | --------------- | --------- |
| `.sm`  | 2rem   | 0.625rem        | 0.875rem  |
| padrão | 2.5rem | 0.75rem         | herdado   |
| `.lg`  | 3rem   | 1rem            | 1.0625rem |

Os cantos acompanham o tamanho, como num botão. Um `.textarea` mantém a altura mínima de 7rem em todos os tamanhos; a classe muda o texto, o padding e os cantos dele. Defina o tamanho de um `.input-group` no grupo, não no controle dentro dele: o controle e os adornos recebem o tamanho de texto do grupo.

```html
<div class="cluster tight">
  <input class="ipt sm" aria-label="Coupon code" />
  <button class="btn sm" type="button">Apply</button>
</div>
```

## Mostre um erro de validação

Marque o controle como inválido com `aria-invalid="true"` e dê à mensagem de erro `.hint.destructive`:

```html
<div class="field">
  <label class="label" for="email">Email</label>
  <input class="ipt" type="email" id="email" name="email" value="ada@" aria-invalid="true" aria-describedby="email-error" />
  <span class="hint destructive" id="email-error">Enter a full email address, such as ada@example.com.</span>
</div>
```

Um controle inválido desenha a borda, o anel de foco e o texto digitado na cor destrutiva, seja qual for a classe de intenção dele. O texto usa o tom legível dessa cor, `--intent-strong`, para continuar legível na página. O pacote só pinta o estado: decidir que o valor é inválido, definir e remover o `aria-invalid` e escrever a mensagem ficam por conta do seu código. Remova o `aria-invalid` assim que o valor voltar a ser válido; se ele continuar definido, o campo continua vermelho. Num checkbox, radio ou switch, `aria-invalid="true"` desenha o toggle exatamente como `.destructive` desenha, marca de seleção incluída.

Um hint aceita qualquer uma das seis intenções embutidas, não só `.destructive`: `.hint.success` confirma que um valor foi aceito, e `.hint.warning` sinaliza um valor permitido, mas incomum. Cada um aparece no tom legível da sua intenção, `--intent-strong`, que mantém 4.5:1 em relação à página nos dois temas. Um hint sem intenção, com `.neutral` ou com uma [intenção que você mesmo definiu](./theming.md#sua-própria-intenção) continua na cor secundária. Só uma classe no próprio hint o colore; uma intenção no campo ou num contêiner em volta dele não.

```html
<input class="ipt success" id="username" value="ada" aria-describedby="username-hint" /> <span class="hint success" id="username-hint">That username is available.</span>
```

## Monte o formulário de perfil

```html
<form class="card stack" aria-labelledby="profile-title">
  <h2 class="text-title-sm" id="profile-title">Profile</h2>

  <div class="field">
    <label class="label" for="display-name">Display name</label>
    <input class="ipt" id="display-name" name="display-name" value="Ada Lovelace" aria-describedby="display-name-hint" />
    <span class="hint" id="display-name-hint">Shown on invoices and shared projects.</span>
  </div>

  <div class="field">
    <label class="label" for="email">Email</label>
    <input class="ipt" type="email" id="email" name="email" value="ada@example.com" />
  </div>

  <div class="field">
    <label class="label" for="bio">Bio</label>
    <textarea class="textarea" id="bio" name="bio" rows="3"></textarea>
  </div>

  <div class="field">
    <label class="label" for="language">Language</label>
    <select class="select" id="language" name="language">
      <option>English</option>
      <option>Português</option>
      <option>Español</option>
    </select>
  </div>

  <div class="cluster">
    <button class="btn primary" type="submit">Save changes</button>
    <button class="btn ghost" type="reset">Cancel</button>
  </div>
</form>
```

Um `.select` desenha a sua própria seta. Com `multiple` ou com `size` maior que 1, ele vira uma caixa de listagem: sem seta, com a altura das linhas que mostra. A lista aberta de opções é desenhada pelo navegador e pelo sistema operacional, então ela não pega o visual do pacote.

## Adicione um ícone ou um prefixo fixo

`.input-group` coloca um ícone ou um trecho de texto dentro da borda de um campo. O grupo desenha a borda, o fundo, o anel de foco e os estados inválido e desabilitado; o controle dentro dele abre mão dos seus, para que a borda seja desenhada uma vez só. Coloque o adorno antes do controle para que ele fique no início, ou depois para que fique no fim. Um grupo tem a altura de um campo sozinho, então fica alinhado com os campos e botões ao lado dele.

O endereço do perfil sempre começa com o mesmo host, então ele é um prefixo fixo:

```html
<div class="field">
  <label class="label" for="profile-url">Profile address</label>
  <div class="input-group" style="--input-group-gap: 0">
    <span>app.example.com/u/</span>
    <input class="ipt" id="profile-url" name="profile-url" value="ada" />
  </div>
</div>
```

O espaçamento entre o controle e o adorno é `--input-group-gap`, 0.5rem por padrão. Isso funciona bem para um ícone, mas um texto que deve parecer parte do valor fica estranho com um espaço depois dele, então o exemplo define o valor como `0`. Defina-o no grupo, ou uma única vez num formulário para todos os grupos dentro dele. Ela é uma das [variáveis públicas de componente](./customizing.md#variáveis-de-componente).

Uma busca de membros, com um ícone no início (as classes `ic-lucide-*` precisam do `@codenhub/icons` carregado; veja [Botões → Carregando ícones](./buttons.md#carregando-ícones)):

```html
<div class="field">
  <label class="label" for="member-search">Find a member</label>
  <div class="input-group">
    <i class="ic-lucide-search" aria-hidden="true"></i>
    <input class="ipt" type="search" id="member-search" name="q" />
  </div>
</div>
```

Um `.select` também funciona num grupo. O grupo remove o padding lateral do controle, exceto no fim de um select de uma linha, que mantém 1.75rem para que o texto da opção escolhida não passe por baixo da seta.

Qualquer elemento serve de adorno: uma classe de ícone, um `<svg>` inline, um `<img>` ou texto. O pacote não entrega ícones para campos, porque uma imagem embutida não conseguiria acompanhar a cor do seu texto, o seu tema ou a sua estética.

O grupo lê intenção e apresentação do mesmo jeito que um `.ipt` sozinho: `.input-group.primary` colore a borda e o texto digitado, e `.input-group.soft.edgeless` é um campo afundado na página. Coloque a intenção no grupo, não no controle de dentro: o grupo desenha o campo, então o texto do controle recebe a intenção do grupo, e uma classe de intenção no controle não tem efeito. `aria-invalid="true"` ou `disabled` no controle de dentro se aplica ao grupo inteiro, e o mesmo vale para qualquer um dos dois no próprio grupo. O anel de foco do grupo aparece quando o campo dele tem foco, então, diferente de um campo sozinho, ele também aparece depois de um clique do mouse. Um botão dentro do grupo, como um botão de limpar, desenha o seu próprio anel quando tem foco, e o grupo não desenha nenhum: um único anel sempre marca o único controle que tem foco.

## Decorações do navegador

Alguns tipos de input vêm com botões embutidos: o botão de seletor de um campo de data ou hora, as setas para cima e para baixo de um campo numérico e o botão de limpar de um campo de busca. O pacote os mantém, porque cada um também faz alguma coisa: o botão de seletor é o único jeito de abrir o seletor com o mouse, e o botão de limpar esvazia o campo.

`.unadorned` os remove, para um campo em que você desenha os seus próprios. Coloque a classe no controle ou no `.input-group` dele. Remover uma decoração remove o que ela fazia, então ligue o seu substituto você mesmo: `input.showPicker()` abre um seletor, `stepUp()` e `stepDown()` substituem as setas, e definir `value` como `""` e disparar um evento `input` substitui um botão de limpar. Digitar continua funcionando em qualquer caso. O Firefox não oferece um jeito de remover o botão do seletor de data, então ele continua lá.

```html
<div class="field">
  <label class="label" for="member-filter">Find a member</label>
  <div class="input-group unadorned">
    <i class="ic-lucide-search" aria-hidden="true"></i>
    <input class="ipt" type="search" id="member-filter" name="q" />
    <button class="btn icon ghost p-xs" type="button" aria-label="Clear search">
      <i class="ic-lucide-x" aria-hidden="true"></i>
    </button>
  </div>
</div>
```

O botão de limpar acima é um `<button>` de verdade, com nome acessível. Um botão dentro de um grupo mantém as suas próprias classes: um `.btn.ghost` não tem preenchimento e, como todo botão por padrão, não tem borda, então ele fica dentro da borda do campo sem desenhar uma própria.

## Toggles

A tela de configurações tem três tipos de toggle: um checkbox para optar por receber e-mails de fatura, radio buttons para escolher o período de cobrança e um switch para deixar o perfil público. Cada classe vai num `<input>` nativo do tipo correspondente:

```html
<fieldset class="stack tight">
  <legend class="label">Notifications</legend>
  <label class="cluster tight">
    <input class="checkbox" type="checkbox" name="invoice-email" checked />
    Email me when an invoice is ready
  </label>
</fieldset>

<fieldset class="stack tight">
  <legend class="label">Billing period</legend>
  <label class="cluster tight">
    <input class="radio" type="radio" name="period" value="monthly" />
    Monthly
  </label>
  <label class="cluster tight">
    <input class="radio" type="radio" name="period" value="yearly" checked />
    Yearly, two months free
  </label>
</fieldset>

<label class="cluster tight">
  <input class="switch primary" type="checkbox" role="switch" name="public-profile" />
  Public profile
</label>
```

- `.checkbox` vai em `type="checkbox"`, `.radio` em `type="radio"` e `.switch` em `type="checkbox"`. Dê você mesmo `role="switch"` a um switch, para que ele seja anunciado como ligado ou desligado, e não como marcado.
- `.cluster.tight` no `<label>` alinha o controle com o texto e deixa um espaçamento de 0.5rem.
- Um checkbox com a propriedade `indeterminate` definida, para um grupo em que só alguns itens estão marcados, mostra um traço, e mantém o traço mesmo quando também está `checked`, como faz o checkbox nativo do navegador. Defina-a por script (`input.indeterminate = true`); não existe atributo para isso.

### Cores de marcado e desmarcado

Uma classe de intenção define a cor de marcado. Sem intenção, um toggle marcado é preenchido com a cor do texto, e a marca é desenhada na cor da página: uma caixa preta com um visto branco numa página clara. Diferente de um botão neutro, um toggle neutro é preenchido por completo quando marcado.

A apresentação muda só o visual desmarcado. Todo toggle fica em `.soft` por padrão; depois de marcado, cada um tem um único visual, seja qual for a apresentação:

| Toggle          | Preenchimento desmarcado | Marcado                                                |
| --------------- | ------------------------ | ------------------------------------------------------ |
| `.ghost`        | 0%                       | 100% de preenchimento, com a marca na cor de contraste |
| `.soft`, padrão | 12%                      | 100% de preenchimento, com a marca na cor de contraste |
| `.solid`        | 40%                      | 100% de preenchimento, com a marca na cor de contraste |

Um checkbox marcado e um switch marcado recortam a marca da placa preenchida. Um radio marcado engrossa o anel para o dobro da espessura de linha em repouso, até 3px, ganha a cor cheia da intenção nele e mostra um ponto. O limite de 3px impede que o anel engula o ponto numa estética de linha grossa.

`.checkbox` e `.radio` sempre desenham a borda, mesmo com `.edgeless`, porque a borda é a única coisa que mostra uma caixa desmarcada. `.switch.ghost` também mantém a borda, já que, sem preenchimento e sem borda, nada marcaria o trilho. Esses casos estão listados em [Composição](./composing.md#referência-de-eixos-por-componente).

Uma estética que desenha a borda como uma sombra interna, como a `.pixel`, não consegue deixar essa sombra mais larga que a espessura da borda do toggle. Um checkbox de 16px ou um switch de 20px não tem espaço para um anel interno mais grosso sem cobrir a marca. Isso só importa se você mesmo definir `--ui-shadow-spread`; veja [Personalização → Tokens de material](./customizing.md#tokens-de-material).

## Preenchimento e borda em controles de texto

Controles de texto aceitam intenção, que colore a borda, o anel de foco e o texto digitado, este no tom legível da intenção (`--intent-strong`). Eles também aceitam os dois eixos de apresentação. O preenchimento deles tem um teto baixo, para que o texto digitado continue legível:

| Num controle de texto                                              | Preenchimento |
| ------------------------------------------------------------------ | ------------- |
| `.ghost`, padrão                                                   | 0%            |
| Qualquer preenchimento vindo de um contêiner (`.soft` ou `.solid`) | 6%            |
| `.soft` no controle                                                | 12%           |
| `.solid` no controle                                               | 20%           |

O preenchimento de um contêiner é pensado para as superfícies dentro dele, então um campo sem classe pega só um leve 6% dele. Para mais, coloque a classe no próprio campo.

A borda funciona do mesmo jeito. Um `.edgeless` herdado de um contêiner é ignorado, para que uma toolbar não deixe um campo sem contorno visível. Um `.edgeless` escrito no próprio controle é respeitado: é assim que você pede um campo sem borda. Um campo sem borda não atende ao requisito de contraste do WCAG 1.4.11 para o limite de um controle, então ele nunca é o padrão; o anel de foco dele continua aparecendo.

```html
<input class="ipt success" placeholder="Matches your current password" />
<input class="ipt soft edged" placeholder="Tinted, with a border" />
<input class="ipt soft edgeless" placeholder="Sunk into the page" />
<div class="soft">
  <input class="ipt" placeholder="A container's .soft gives a 6% tint" />
</div>
```

Em repouso, a borda de um campo é propositalmente mais clara que 3:1 em relação à página, para que o hover e o foco tenham uma mudança visível a fazer. [Acessibilidade → Limites dos controles](../accessibility.md#limites-dos-controles) explica esse trade-off e como conseguir uma borda mais forte.

## Controles desabilitados

`disabled`, `aria-disabled="true"`, `data-disabled` ou `.disabled` num controle o desenham com opacidade reduzida e cursor de não permitido. Assim como nos botões, só o atributo `disabled` impede a digitação; os outros mudam apenas a aparência.

## Criando o seu próprio controle

Para um controle parecido com texto que o pacote não entrega, `.text-control` dá a um elemento os mesmos estilos de borda, placeholder, hover, foco, inválido e desabilitado do `.ipt`, sem a altura nem o padding dele. [Personalização → Helpers de composição](./customizing.md#helpers-de-composição) explica essa classe junto com os outros blocos de construção.

## A seguir

O formulário já pode ser preenchido e enviado. [Feedback](./feedback.md) mostra o que a tela faz em seguida: um botão de salvar que avisa que está salvando, uma mensagem de sucesso, um badge de plano e uma barra de uso do armazenamento.
