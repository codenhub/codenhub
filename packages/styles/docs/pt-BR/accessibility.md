---
title: Acessibilidade
description: O que o CSS faz por foco, estados, movimento, contraste, cores forçadas e texto da direita para a esquerda, e o que a sua aplicação ainda deve aos seus usuários.
order: 5
source: 88ce6c4707ee04ac76cdb5e6b31dcca399a5327e
---

# Acessibilidade

A tela de configurações está pronta, e o CSS fez a sua parte no caminho: todo campo mostra onde está o foco, um email inválido fica vermelho e o spinner para para usuários que pedem menos movimento. O resto depende do seu HTML e JavaScript. Este pacote estiliza estados; ele não fornece elementos semânticos, atributos ARIA, comportamento de teclado, gerenciamento de foco, validação nem o momento dos anúncios.

Esta página lista as duas metades: o que o CSS fornece e o que a sua aplicação precisa adicionar.

## Fornecido pelo CSS

### Foco e estado

| Recurso                         | Comportamento                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `:focus-visible`                | Um outline de foco em todo elemento, desenhado com `--focus-ring`, `--focus-ring-width` e `--focus-ring-offset`. Num componente com preenchimento acima da metade da intensidade, como um botão `.solid.primary`, uma linha de 2px da cor da página corre por dentro do anel, então o anel continua visível sobre um preenchimento da mesma cor.                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Foco em controles de formulário | `.ipt`, `.textarea` e `.select` desenham o outline de foco e mudam a borda para a cor da intenção. O texto digitado num campo com classe de intenção fica no tom legível da intenção, `--intent-strong`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Controles inválidos             | `aria-invalid="true"` num controle de formulário deixa a borda, a cor de foco e o texto digitado na cor destrutiva, com o texto no tom legível destrutivo. Um checkbox, radio ou switch é desenhado exatamente como a sua versão `.destructive`, marca de seleção incluída.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Controles desabilitados         | `disabled`, `aria-disabled="true"`, `data-disabled` e `.disabled` mostram o cursor e a opacidade de desabilitado, e um controle desabilitado não reage ao hover, inclusive dentro de um `.input-group`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Estado aberto                   | `data-state="open"` num `.tooltip` mostra o balão sem hover nem foco, e `data-state="closed"` o esconde durante o hover ou o foco. Nenhum outro componente lê nenhum dos dois.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `<dialog>` nativo               | Um `<dialog>` com `.card`, `.panel`, `.surface` ou uma classe sua que faz `@apply surface` fica escondido até ser aberto, e abre centralizado. Uma margem que você define no dialog, como utilitário ou no seu próprio CSS, ainda substitui a centralização, exceto que um utilitário de margem não substitui quando a sua classe aplica `surface` em CSS simples; veja [Personalização → Helpers de composição](./usage/customizing.md#helpers-de-composição). Com a [folha de estilos sem classes](./setup.md#html-sem-classes), um `<dialog>` puro é um `.card.floating` e se comporta do mesmo jeito; com os outros entrypoints, um dialog sem nenhuma dessas classes não é afetado. Prender o foco, fechar com Escape e tornar inerte a página por trás ficam por conta da sua aplicação. |

### Conteúdo visualmente oculto

`.visually-hidden` esconde o conteúdo na tela e o mantém para leitores de tela, como faz a `<caption>` da tabela de chaves de API em [Conteúdo e layout → Tabelas](./usage/content-and-layout.md#tabelas). Ela vem com os utilitários de layout: em `.`, `./native`, `./tw`, `./tw/native` e `./tw/utilities`. Ela não está em `./components` nem nos entrypoints de componentes `./tw/components` e `./tw/*`.

### Limites dos controles

O WCAG 1.4.11 pede que o limite de um controle que você precisa ver para usá-lo tenha um contraste de pelo menos 3:1 em relação ao que está ao lado dele.

| Recurso                           | Comportamento                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Controles de texto em repouso     | A borda de um controle de texto fica, em repouso, mais clara que a borda cheia da sua intenção, abaixo de 3:1 por escolha, para que o hover e o foco tenham um tom mais forte para onde mudar. [Contraste aumentado](#contraste-aumentado) a desenha cheia.                                                                                                                                                                                                                                           |
| Toggles                           | `.checkbox`, `.radio` e `.switch` desenham a borda cheia, porque a borda é a única coisa que mostra uma caixa desmarcada. Um `.switch` com o seu próprio `.edgeless` é a exceção, abaixo.                                                                                                                                                                                                                                                                                                             |
| `.edgeless` vindo de um contêiner | Ignorado por todo controle de texto e toggle: um contêiner não pode remover a borda de um campo ou toggle dentro dele.                                                                                                                                                                                                                                                                                                                                                                                |
| `.edgeless` no próprio controle   | `.ipt`, `.textarea`, `.select` e `.switch` perdem a borda e deixam de atender ao 1.4.11 em repouso. `.switch.ghost` mantém a borda mesmo assim, porque, sem preenchimento e sem borda, nada mostraria o trilho.                                                                                                                                                                                                                                                                                       |
| `.checkbox`, `.radio`             | Sempre desenham a borda, venha o `.edgeless` de um contêiner ou deles mesmos. `.edgeless` neles não é suportado.                                                                                                                                                                                                                                                                                                                                                                                      |
| Trilho de progresso               | Por escolha, a parte preenchida carrega o valor e o trilho é um fundo discreto. O trilho padrão, `.soft.edgeless`, mede cerca de 1.1:1 a 1.3:1 em relação à página. A parte preenchida mede pelo menos 3:1 em relação a esse trilho em todas as intenções, exceto warning no claro (cerca de 2.7:1) e info no escuro (cerca de 2.9:1). Onde o próprio trilho precisa atender ao 1.4.11, use `.ghost.edged` com uma classe de intenção; veja [Contornos de progresso](#contornos-de-progresso) abaixo. |

### Contornos de progresso

Num `.progress.ghost.edged`, o trilho é a página, e o seu contorno e a parte preenchida são desenhados na cor da intenção. Medido em relação à página, sem estética:

| Intenção       | Página clara | Página escura | Atende a 3:1                                                             |
| -------------- | ------------ | ------------- | ------------------------------------------------------------------------ |
| `.primary`     | 18.96:1      | 18.96:1       | Sim                                                                      |
| `.secondary`   | 7.47:1       | 7.63:1        | Sim                                                                      |
| `.success`     | 5.14:1       | 3.69:1        | Sim                                                                      |
| `.warning`     | 3.06:1       | 6.20:1        | Sim                                                                      |
| `.destructive` | 5.80:1       | 3.27:1        | Sim                                                                      |
| `.info`        | 6.17:1       | 3.07:1        | Sim                                                                      |
| Sem intenção   | 2.48:1       | 1.91:1        | Não: o contorno falha, embora a parte preenchida, na cor do texto, passe |

Sem classe de intenção, o contorno é o cinza de borda discreto, `--color-border`. Para que um trilho neutro atenda ao 1.4.11, dê uma classe de intenção à barra, ou defina `--progress-edge` com uma cor mais forte, como `var(--color-accent)`, que mede 7.47:1 numa página clara e 7.63:1 numa escura. Warning numa página clara e info numa escura passam de 3:1 por pouco, então meça de novo se você mudar essas cores.

### Movimento e transparência

| Recurso                            | Comportamento                                                                                                                                                                                                                                                                                                                                                         |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Movimento reduzido, componentes    | Com `prefers-reduced-motion: reduce`, todo componente para as suas próprias transições e animações: o brilho do skeleton e do progresso, a barra indeterminada, o tooltip, as marcas dos toggles e o movimento do clique. O clique em si ainda acontece, de imediato, no visual padrão e sob toda estética e classe solo, porque é o sinal de que ele foi registrado. |
| Movimento reduzido, página inteira | O reset também encurta todas as outras animações e transições da página.                                                                                                                                                                                                                                                                                              |
| Transparência reduzida             | Com `prefers-reduced-transparency: reduce`, e em cores forçadas, `.glass`, `.glass-liquid` e `.glass-solo` perdem o desfoque e a lente e ficam opacos.                                                                                                                                                                                                                |

A regra de movimento reduzido de cada componente vem com o componente, então todo entrypoint que o inclui respeita o movimento reduzido sem o reset, incluindo `@codenhub/styles/components`, `@codenhub/styles/tw/components` e cada entrypoint de componente `/tw/*`. Os entrypoints completos e nativos adicionam a regra do reset para a página inteira.

A regra do reset é `!important` dentro da camada `base`, e um `!important` com camada vence um sem camada, então o seu próprio `!important` não consegue religar uma animação. Para manter uma rodando para usuários que pedem movimento reduzido, como um spinner de upload que você considera essencial, declare-a `!important` numa camada ordenada antes de `base`. A primeira declaração `@layer` que o navegador lê define a ordem, então a sua vem antes do pacote:

```css
@layer essential-motion, theme, base, components, utilities;
@import "@codenhub/styles";

@layer essential-motion {
  @media (prefers-reduced-motion: reduce) {
    .upload-spinner {
      animation-duration: 1s !important;
      animation-iteration-count: infinite !important;
    }
  }
}
```

Respeitar o movimento reduzido não é o requisito inteiro. Um movimento que continua ao lado do conteúdo, como um brilho deixado num card depois que ele carregou, precisa de uma forma de ser parado por qualquer usuário; veja [Feedback → Animação que não para](./usage/feedback.md#animação-que-não-para).

### Contraste aumentado

Com `prefers-contrast: more`, as bordas que o pacote desenha abaixo de 3:1 por escolha são desenhadas a 3:1 ou mais em relação ao que está ao lado, nos dois temas. O texto, os preenchimentos sólidos e os anéis de foco já atendem às suas proporções e não mudam. `prefers-contrast: less` não é lido.

| Recurso             | Comportamento                                                                                                                                                                                                                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Controles de texto  | `.ipt`, `.textarea`, `.select` e `.input-group` ficam em repouso com a borda cheia, então o hover e o foco não mudam mais o tom dela. O anel de foco é o mesmo.                                                                                                                       |
| Bordas neutras      | `--color-border` assume um cinza mais forte, `neutral-600` no claro e `neutral-400` no escuro, então a borda de um card, um divisor, as linhas de uma tabela e a borda de um botão ou badge neutro atendem a 3:1. Se você mesmo define `--color-border`, a sua cor é mantida; meça-a. |
| Bordas de intenção  | A borda de uma intenção assume o tom forte dela, `--color-<intent>-strong`, então `.edged` num `.alert`, `.panel`, `.badge`, `.kbd`, `.code` ou `.pre` `.soft` atende a 3:1 tanto em relação ao preenchimento quanto à página, em todas as intenções.                                 |
| Trilho de progresso | O trilho desenha um contorno na sua cor de borda, que atende a 3:1 com ou sem classe de intenção. `.edgeless` na barra ou em um contêiner continua removendo o contorno.                                                                                                              |
| Glass               | `.glass`, `.glass-liquid` e `.glass-solo` perdem o desfoque e a lente e ficam opacos, como na transparência reduzida, e a linha branca deles vira uma borda cinza.                                                                                                                    |
| Chunky tile         | `.chunky-tile` desenha as peças e as superfícies com o cinza mais forte que os seus controles usam.                                                                                                                                                                                   |

O que você remove continua removido: `.edgeless` num controle continua tirando a borda dele, e um `.panel` continua sem borda a menos que você adicione `.edged`.

### Cor e contraste

As medições abaixo são das cores entregues. Assim que você mudar um token de cor, meça de novo os seus próprios pares; [Temas → Mude a cor da marca](./usage/theming.md#mude-a-cor-da-marca) mostra quais pares conferir.

| Recurso                       | Comportamento                                                                                                                                                                                                                                                                                                                                      |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rótulos preenchidos           | O rótulo `.solid` de toda intenção atende a 4.5:1 (WCAG 1.4.3) como texto normal, nos dois temas. O menor é success, com 5.14:1.                                                                                                                                                                                                                   |
| Texto em warning              | `--color-warning-contrast` é quase preto, e não a cor da página, porque um âmbar escuro o bastante para carregar texto branco deixa de parecer âmbar.                                                                                                                                                                                              |
| Preenchimentos parciais       | A cor de texto de contraste só aparece em preenchimentos acima da metade da força, então o preenchimento limitado de um controle de texto mantém a cor de texto da própria intenção.                                                                                                                                                               |
| Cor da intenção no escuro     | No modo escuro, um rótulo `.soft` ou `.ghost` usa o tom `-300` da sua intenção, para manter o matiz em vez de ficar branco.                                                                                                                                                                                                                        |
| Texto sobre um pai preenchido | Um componente neutro que não é `.solid`, como um badge num `.btn.primary` ou um botão ghost num `.card.solid.primary`, imprime na cor de texto do pai em vez da cor da página, então mantém o contraste do pai.                                                                                                                                    |
| Impressão                     | Uma página é impressa no tema claro, e componentes preenchidos imprimem o fundo (`print-color-adjust: exact`), então o texto de contraste nunca cai sobre o papel em branco. Um utilitário `dark:` continua valendo na impressão; veja [Temas → Impressão](./usage/theming.md#impressão).                                                          |
| Marcas dos toggles            | Uma marca de marcado mede pelo menos 3:1 em relação a todo preenchimento que a sua apresentação pode dar a ela, nos dois temas.                                                                                                                                                                                                                    |
| Preenchimentos soft com borda | `.edged` num `.alert`, `.panel`, `.badge`, `.kbd`, `.code` ou `.pre` `.soft` desenha uma borda que mede menos de 3:1 em relação ao preenchimento de 12% em algumas intenções, que variam conforme o tema. Meça o par antes de contar com essa borda como limite de um controle. [Contraste aumentado](#contraste-aumentado) leva todas elas a 3:1. |

### Cores forçadas e direção

| Recurso          | Comportamento                                                                                                                                                                                                                                                                                                                                                                               |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cores forçadas   | Com `forced-colors: active`, as bordas, os estados marcados, a seta de um `.select` e o valor de uma barra de progresso continuam visíveis, desenhados nas cores do sistema, sob todas as estéticas. Uma estética que desenha a borda como sombra interna, como `.pixel`, desenha uma borda real no lugar. O glass fica opaco, porque as cores forçadas mantêm a transparência de um fundo. |
| Direção do texto | Sob `dir="rtl"`, a barra da citação, o ícone do alerta, o preenchimento do progresso, o divisor vertical, o botão do switch, o alinhamento das tabelas e a seta de um select trocam de lado. Nenhuma classe é necessária.                                                                                                                                                                   |

Em cores forçadas, `.text-control`, `.ipt`, `.textarea`, `.select`, os toggles e uma classe sua que faz `@apply text-control` mostram um outline de foco `Highlight` de 2px. Dentro de um `.input-group`, o grupo desenha o anel do campo e o controle dentro dele não desenha nenhum, então um campo focado mostra um único anel. O entrypoint nativo dá o mesmo outline a campos de texto, selects, textareas, checkboxes e radios sem classe.

Checkboxes, radios e switches usam as cores do sistema `Canvas`, `CanvasText`, `Highlight` e `HighlightText`, para que marcado e desmarcado continuem distintos: um toggle marcado é preenchido com `Highlight` e a sua marca é `HighlightText`, tanto nas classes quanto no entrypoint nativo. Formato, tamanho e espaçamento não mudam.

Uma barra `.progress` faz o mesmo: a parte preenchida é `CanvasText` sobre um trilho `Canvas` com contorno `CanvasText`, qualquer que seja a intenção ou a apresentação, para que uma barra pela metade não pareça vazia. O brilho de `.active` não é desenhado.

## O que fica fora do CSS

Use o elemento HTML que corresponde ao que o componente faz e adicione o comportamento que o CSS não consegue.

| Interface          | O que a sua aplicação adiciona                                                                                                                                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Botões             | `<button>` para ações e `<a href>` para navegação. Um nome acessível, como `aria-label`, em todo `.btn.icon`.                                                                                                                              |
| Formulários        | Um `<label>` para cada controle, o `type` certo, validação e `aria-describedby` ligando dicas e erros. Mantenha dicas e erros fora do `<label>` e dê `role="switch"` a um `.switch`.                                                       |
| Alertas            | `role="status"` para uma confirmação como "Profile saved", ou `role="alert"` para um erro que precisa de atenção imediata.                                                                                                                 |
| Toasts             | Uma live region, uma forma de dispensá-lo, regras de foco e uma pausa em qualquer tempo limite.                                                                                                                                            |
| Tooltips           | Um `id` real e `role="tooltip"` no balão, referenciado pelo `aria-describedby` do gatilho. Dispensa com Escape escrevendo `data-state="closed"`; veja [Tooltips](./usage/tooltips.md#hover-permanência-e-escape). O balão já aceita hover. |
| Progresso          | Um elemento `<progress>`, ou `role="progressbar"` ou `role="meter"` com valores ARIA, quando o valor precisa ser anunciado.                                                                                                                |
| Skeletons          | `aria-hidden="true"` nos visuais de carregamento, incluindo um spinner que você traga, e o estado de carregamento anunciado de outra forma quando necessário.                                                                              |
| Movimento contínuo | Uma forma de pausar, parar ou esconder o movimento que não é essencial; veja [Feedback → Animação que não para](./usage/feedback.md#animação-que-não-para).                                                                                |
| Popovers, modais   | Prender o foco, fechar com Escape, um fundo inerte, rótulos e roles.                                                                                                                                                                       |

## Atributos de estado

Prefira os atributos nativos:

```html
<button class="btn primary" disabled>Saving…</button> <input class="ipt" type="email" aria-invalid="true" aria-describedby="email-error" />
```

Use atributos ARIA ou data onde o elemento ou a sua biblioteca de componentes não tem um nativo:

```html
<a class="btn secondary" aria-disabled="true">Export data</a>
<span class="tooltip" data-state="open">
  <button type="button" class="tooltip-icon" aria-label="About public profiles" aria-describedby="public-profile-help">?</button>
  <span class="tooltip-bubble" role="tooltip" id="public-profile-help">Anyone with the link can see your name and photo.</span>
</span>
```

`aria-disabled="true"` informa às tecnologias assistivas que o controle está desabilitado, mas não impede um clique nem o pressionar de uma tecla. Use o atributo `disabled`, ou interrompa a ação no JavaScript.

## A seguir

Isso completa a ordem de leitura. A [Introdução](./index.md) tem links para todas as páginas, e [Composição](./usage/composing.md), [Personalização](./usage/customizing.md) e [Conteúdo e layout](./usage/content-and-layout.md) são as páginas de consulta para depois.
