---
title: Conceitos
description: Famílias, resolução de nomes, nomes reservados, espessura do traço e as formas de markup — o modelo compartilhado por todo método de entrega.
order: 1
source: e89ab300cc19996a2c828af9f29320e61c887f28
---

# Como o sistema de ícones se encaixa

Todo método de entrega lê as mesmas classes e segue as mesmas regras. Esta página ensina esse modelo compartilhado uma única vez — dos nomes das famílias e herança de cor até espessura do traço, tamanho e movimento — para que você possa trocar entre CSS puro, Tailwind, Vite ou PostCSS sem reaprender como os ícones se comportam.

## Famílias

Uma família de ícones é um namespace de ícones com seu próprio prefixo, geometria e licença, como `lucide` ou `material-symbols-rounded-fill`. As famílias são módulos de dados puros gerados a partir dos projetos de origem, o que mantém a arte desacoplada de qualquer framework de renderização:

```ts
import lucide from "@codenhub/icons/data/lucide";
import phosphorFill from "@codenhub/icons/data/phosphor-fill";
```

Famílias disponíveis:

| Prefixo                                                          | Ícones    | Estilo                                 | Licença    |
| ---------------------------------------------------------------- | --------- | -------------------------------------- | ---------- |
| `line-md`                                                        | 1222      | animado, baseado em traço              | MIT        |
| `svg-spinners`                                                   | 46        | indicadores de carregamento animados   | MIT        |
| `lucide`                                                         | 2171      | contorno, baseado em traço             | ISC        |
| `phosphor`                                                       | 1512      | contorno                               | MIT        |
| `phosphor-thin`, `phosphor-light`, `phosphor-bold`               | 1512 cada | contorno, outros pesos                 | MIT        |
| `phosphor-fill`                                                  | 1512      | preenchido                             | MIT        |
| `phosphor-duotone`                                               | 1512      | duotone                                | MIT        |
| `material-symbols-outlined`, `-rounded`, `-sharp`                | 3932 cada | contorno                               | Apache-2.0 |
| `material-symbols-outlined-fill`, `-rounded-fill`, `-sharp-fill` | 3932 cada | preenchido                             | Apache-2.0 |
| `simple-icons` (marca)                                           | 3254      | logotipos preenchidos, na cor da marca | CC0-1.0    |
| `logos` (marca)                                                  | 2016      | logotipos coloridos                    | CC0-1.0    |

Variantes como preenchido ou duotone vivem em famílias separadas em vez de funcionarem como seletores dentro de uma mesma família. Um nome de classe continua sendo só um prefixo e um nome de ícone, sem sintaxe extra de variante para adivinhar.

`simple-icons` e `logos` são famílias de marcas, e elas dividem o trabalho: `simple-icons` desenha cada logotipo em uma única cor da marca, como em `ic-simple-icons-github` e `ic-simple-icons-npm`, enquanto `logos` os desenha coloridos, como em `ic-logos-google-icon` e `ic-logos-slack-icon`, para marcas que uma só cor não dá conta de mostrar, como o G de quatro cores do Google. A maioria das marcas aparece em apenas uma das duas, então elas se complementam em vez de se duplicar.

Logotipos coloridos naturalmente pesam mais do que ícones de uma cor só. Com os plugins de build, um projeto paga apenas pelos logotipos que realmente usa: cerca de 2 KB de CSS para um logotipo típico, e menos de 8 KB para 95% deles. Um punhado de logotipos vetorizados e muito detalhados fica na ponta mais pesada da escala, de cerca de 60 KB a 150 KB cada: `lerna` (149 KB), `effector` (120 KB), `composer` (88 KB), `hugo` (85 KB), `tastejs` (69 KB), `matplotlib` (66 KB), `matplotlib-icon` (65 KB) e `chalk` (60 KB). Gzip ou Brotli reduz esses números várias vezes no tráfego de rede e, quando o peso ainda importar, prefira uma variante `-icon` mais leve ou a entrada da marca em `simple-icons`, se existir. Famílias de marcas são opt-in em todo lugar — `@codenhub/icons/tw` nunca as resolve, e um `@plugin` declarado manualmente só as resolve quando sua opção `families` as nomeia — e suas marcas continuam sendo marcas registradas de seus proprietários. Veja [Licenciamento](licensing.md#famílias-de-marcas).

### Famílias animadas

`line-md` oferece 1.222 ícones animados do Line MD 3.0.5 de Vjacheslav Trushkin, e `svg-spinners` oferece 46 indicadores de carregamento de Utkarsh Verma, gerados a partir da arte SMIL original no commit `abfa05c49acf005b8b1e0ef8eb25a67a7057eb20`. Ambas são famílias principais sob licença MIT, disponíveis por padrão via `@import "@codenhub/icons/tw"`, pelas folhas de estilos de família `@codenhub/icons/line-md` e `@codenhub/icons/svg-spinners`, ou como `@codenhub/icons/data/line-md` e `@codenhub/icons/data/svg-spinners` para um plugin ou registro configurado.

```html
<i class="ic-line-md-heart/1.5" aria-hidden="true"></i>
<i class="ic-line-md-loading-loop" aria-hidden="true"></i>
<i class="ic-svg-spinners-90-ring" aria-hidden="true"></i>
```

As animações vivem dentro da arte SVG e rodam via SMIL. Os ícones `-loop` do Line MD animam continuamente, e os outros ícones se desenham uma vez. Sem um [gatilho de movimento](#movimento), um ícone toca na primeira vez em que a página o exibe. O Chrome é verificado; Firefox e Safari não foram testados, então não presuma suporte a máscaras animadas a partir do suporte a máscaras estáticas.

Adicione `ic-on-hover` para mostrar a arte estática em repouso e reproduzir a animação enquanto o gatilho estiver com hover ou foco, conforme descrito em [Movimento](#movimento):

```html
<button>
  <i class="ic-line-md-loading-loop ic-on-hover" aria-hidden="true"></i>
  Refresh
</button>
```

Ícones em loop tocam em todo hover só com CSS. Um ícone de execução única como `ic-line-md-heart` toca apenas no primeiro hover só com CSS, porque os navegadores não reiniciam uma imagem animada que já pintaram uma vez. Para repetir um ícone de execução única em todo hover, chame [`bindIconPlayback`](javascript-api.md#reproduzindo-ícones-via-código) de `@codenhub/icons/play` uma única vez. Ícones que não têm arte estática mantêm sua máscara normal em repouso.

O modo CSS e o modo SVG inline tratam movimento reduzido e repouso de hover de maneiras diferentes:

- **Modo máscara CSS** (folhas de estilos completas de família, Tailwind, modo CSS do Vite e PostCSS, incluindo modificadores de traço como `/1.5`): sob `prefers-reduced-motion: reduce`, as máscaras do Line MD sempre pintam a arte estática original, mesmo durante o hover. Cada ícone carrega sua arte estática opcional em `--ic-static-mask`, e as regras base a escolhem para movimento reduzido e repouso de hover. O SVG Spinners não tem fallback estático, então forneça um rótulo acessível de carregamento independentemente do movimento.
- **Modo SVG inline** (`mode: "svg"` do Vite, módulos virtuais e `renderSvg`): mantém o `body` animado. Como o CSS não consegue parar uma linha do tempo SMIL, `ic-on-hover` não consegue segurar a arte SVG inline em repouso, e esses caminhos não trocam a arte para movimento reduzido. `playIcon` reinicia um SVG inline, mas pula o reinício sob movimento reduzido; ele não para uma linha do tempo que já esteja rodando. Escolha o modo CSS para a troca automática, ou leia `staticBody` do ícone resolvido antes de chamar `renderSvg` quando precisar de arte inline estática; `staticBody` compartilha o `viewBox` do corpo animado. `getIconMaskUrl` retorna a arte animada, enquanto `getIconCssProps` também inclui a propriedade da máscara estática quando disponível.

## Nomes

Um ícone é identificado por `prefix:name`. Como nomes de classe CSS não podem conter dois-pontos, a classe troca os dois-pontos por um hífen:

```html
<!-- lucide:heart -->
<i class="ic-lucide-heart"></i>

<!-- material-symbols-rounded:home -->
<i class="ic-material-symbols-rounded-home"></i>
```

Quando dois prefixos de família carregados compartilham o mesmo começo, vence o prefixo mais longo que casa, então `material-symbols-outlined` vence `material` quando ambos estão carregados.

Um nome sem qualificação como `ic-heart` é resolvido contra uma família padrão configurada, e contra nada quando nenhum padrão foi definido. O pacote não escolhe nenhuma família padrão por conta própria nem entrega um mapa de aliases semânticos, porque ninguém chega a um acordo se `close` deveria ser `x` ou `times`. Portanto, `ic-close` significa o que a família escolhida por você chama de `close`, e não renderiza nenhum ícone se essa família usar outro nome. O Lucide chama esse ícone de `x`, então com o Lucide você escreve `ic-x`. No CSS puro, onde várias folhas de estilos de família podem ser importadas em sequência, uma folha de estilos de família reivindica apenas os nomes curtos que realmente define, então uma família importada antes continua respondendo pelos nomes curtos que a família posterior não tem.

De onde vem a família padrão depende do método de entrega:

| Método        | Família padrão                                                                                                                                                                 |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Vite, PostCSS | A opção `defaultPrefix`.                                                                                                                                                       |
| Tailwind      | A opção `default:` do plugin.                                                                                                                                                  |
| CSS puro      | A última folha de estilos de família principal importada. Uma folha de família de marcas não reivindica nomes curtos, então importá-la por último mantém o padrão como estava. |

```ts
import { IconRegistry } from "@codenhub/icons";
import lucide from "@codenhub/icons/data/lucide";

const registry = new IconRegistry({ defaultPrefix: "lucide" });
registry.registerFamily(lucide);

registry.resolve("heart"); // lucide:heart
registry.resolve("close"); // undefined -- lucide chama de "x"
```

### Encontrando o nome de um ícone

Os nomes dos ícones são sempre os do projeto de origem, então navegue pelo site da família e use exatamente o nome mostrado lá:

| Família                | Consulte em                                                                      | Exemplo de classe                               |
| ---------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------- |
| `line-md`              | [github.com/cyberalien/line-md](https://github.com/cyberalien/line-md)           | `ic-line-md-heart`, `ic-line-md-loading-loop`   |
| `svg-spinners`         | [github.com/n3r4zzurr0/svg-spinners](https://github.com/n3r4zzurr0/svg-spinners) | `ic-svg-spinners-90-ring`                       |
| `lucide`               | [lucide.dev/icons](https://lucide.dev/icons)                                     | `ic-lucide-circle-check`                        |
| `phosphor`, variantes  | [phosphoricons.com](https://phosphoricons.com)                                   | `ic-phosphor-fill-check-circle`                 |
| `material-symbols-*`   | [fonts.google.com/icons](https://fonts.google.com/icons)                         | `ic-material-symbols-rounded-check_circle`      |
| `simple-icons` (marca) | [simpleicons.org](https://simpleicons.org)                                       | `ic-simple-icons-github`, `ic-simple-icons-npm` |
| `logos` (marca)        | [svgporn.com](https://svgporn.com)                                               | `ic-logos-google`, `ic-logos-google-icon`       |

Peculiaridades de nomenclatura da origem são mantidas como estão em vez de serem normalizadas:

- **Material Symbols** mantém os sublinhados do Google: `check_circle`, não `check-circle`.
- **Simple Icons** usa o slug do ícone, com qualquer `_` escrito como `-`.
- **`logos`** usa o nome do arquivo na origem, em minúsculas, com qualquer `_` ou `.` escrito como `-`: `socket.io` vira `ic-logos-socket-io`. Algumas marcas incluem tanto o logotipo completo com palavra quanto um símbolo com `-icon` no final, e algumas adicionam variantes `-dark` ou `-alt`.

Um nome escrito errado não lança erro: a classe não resolve para nada, então o elemento renderiza como um quadrado sólido quando as regras base estão carregadas, ou como nada quando estão faltando. Confira o nome na família quando um ícone sumir — ou leia diretamente as chaves do objeto `icons` do módulo da família.

## Nomes reservados

Como as classes utilitárias vivem no mesmo namespace `ic-*` que as classes de ícone, alguns nomes ficam fora de alcance para que seus ícones nunca colidam com os helpers:

- **`xs`, `sm`, `md`, `lg` e `xl`** pertencem à [escala de tamanho](#tamanho) (`ic-xs` até `ic-xl`). Nenhuma família pode usar um deles como prefixo ou entregar um ícone com esse nome; a geração recusa uma família que tente.
- **`anim`, `on-hover` e `trigger`** pertencem aos [utilitários de movimento](#movimento). Uma família não pode usar `anim` como prefixo nem entregar um ícone chamado `anim` ou que comece com `anim-`. Os nomes exatos de ícone `on-hover` e `trigger` são reservados da mesma forma, enquanto nomes que apenas começam com eles — junto com `animation` — continuam disponíveis.
- **Espessura do traço** mora depois de uma `/` na própria classe do ícone, então não ocupa nenhum prefixo.

## Markup

Um ícone é um elemento HTML carregando uma classe de ícone. Escreva um `<i>` — curto, semanticamente neutro e o único elemento que o [modo SVG inline](delivery/vite.md#modo-svg-inline) reescreve:

```html
<i class="ic-lucide-search" aria-hidden="true"></i>

<!-- espessura do traço, apenas para famílias baseadas em traço -->
<i class="ic-lucide-heart/1.5"></i>

<!-- um tamanho da escala -->
<i class="ic-lucide-search ic-lg"></i>
```

Nos métodos baseados em CSS, a mesma classe também funciona em qualquer elemento se você adicionar `.ic`, o que ajuda quando um componente de framework insiste em renderizar a própria tag:

```html
<span class="ic ic-lucide-search" aria-hidden="true"></span>
```

Não há `::before`, `::after` nem forma para controle de formulário. Um ícone ao lado de um rótulo é um `<i>` real dentro do botão ou link, então ele alinha com `gap` de flex ou grid e se comporta igual em todo método de entrega. Quando você realmente precisar de um ícone em `background-image` — como num controle customizado ou num afixo de input — resolva a `url()` dele com [`getIconMaskUrl` ou `getIconCssProps`](javascript-api.md) e posicione-o você mesmo.

Tamanho e cor seguem custom properties de CSS definidas no ícone ou em qualquer ancestral:

```css
.toolbar {
  --ic-size: 1.25rem;
  --ic-color: var(--color-accent);
}
```

Veja [Tamanho](#tamanho) e [Cor](#cor).

## Cor

Um ícone é pintado com a primeira fonte que se aplicar, nesta ordem:

1. `--ic-color`, definida no próprio ícone ou herdada de qualquer ancestral.
2. A arte própria do ícone, para um ícone colorido de `logos`: `ic-logos-google-icon` mantém todas as quatro cores do Google e seus gradientes.
3. A cor própria do ícone, para `simple-icons`: `ic-simple-icons-github` usa o `#181717` do GitHub, e `ic-simple-icons-npm` usa o `#cb3837` do npm.
4. `currentColor`, acompanhando a cor do texto ao redor.

Em resumo, ícones principais acompanham a cor do seu texto automaticamente, enquanto ícones de marca aparecem nas cores da própria marca até você mandar o contrário. Definir `--ic-color` sobrescreve cores de marca em qualquer escopo em que você a definir; note que em um logotipo colorido, `--ic-color` transforma o ícone em uma silhueta monocromática do seu contorno, então detalhes contrastantes dentro da marca — como o `31` no ícone do Google Calendar — ficam preenchidos de forma sólida:

```css
/* todo ícone da página, ícones de marca incluídos, na cor do texto */
:root {
  --ic-color: currentColor;
}

/* todo ícone na barra de ferramentas */
.toolbar {
  --ic-color: var(--color-accent);
}

/* apenas ícones de marca, de volta para monocromático */
[class*="ic-simple-icons-"],
[class*="ic-logos-"] {
  --ic-color: currentColor;
}
```

```html
<!-- um ícone -->
<i class="ic-simple-icons-npm" style="--ic-color: white" aria-hidden="true"></i>
```

Para restaurar as cores da marca dentro de uma subárvore que define `--ic-color`, redefina a propriedade nesses ícones com `--ic-color: initial`.

Algumas cores de marca são quase pretas — GitHub, X e Vercel estão entre elas — e somem sem fazer barulho num fundo escuro. Sobrescreva essas no seu tema escuro:

```css
@media (prefers-color-scheme: dark) {
  .ic-simple-icons-github,
  .ic-simple-icons-x {
    --ic-color: white;
  }
}
```

Com um `prefix` de classe personalizado, todo nome de custom property acompanha: `--ux-color` sob `prefix: "ux"`. O `color` comum do CSS sozinho não recolore um ícone de marca, porque a própria cor da marca fica na frente de `currentColor`; defina `--ic-color` no lugar. Tudo isso funciona igual em todos os métodos de entrega CSS e no [modo SVG inline](delivery/vite.md#modo-svg-inline), onde as cores da marca viajam dentro do próprio `<svg>`. Há uma exceção lá: sob uma Content Security Policy que bloqueia atributos `style`, um ícone de marca inline mantém suas cores de marca, mas `--ic-color` não consegue mais sobrescrevê-las.

## Acessibilidade

Um elemento de ícone não tem conteúdo de texto, então tecnologias assistivas não anunciam nada para ele, ou dão um palpite que não ajuda. Marque cada ícone de acordo com o papel dele:

```html
<!-- decorativo, ao lado de um rótulo visível: esconda-o -->
<button><i class="ic-lucide-trash" aria-hidden="true"></i>Delete</button>

<!-- único conteúdo de um controle: rotule o controle, esconda o ícone -->
<button aria-label="Delete"><i class="ic-lucide-trash" aria-hidden="true"></i></button>

<!-- significativo por si só, fora de um controle: dê um role e um nome -->
<i class="ic-lucide-triangle-alert" role="img" aria-label="Warning"></i>
```

No [modo SVG inline](delivery/vite.md#modo-svg-inline), os atributos que você coloca no `<i>` passam para o `<svg>` que o substitui.

## Espessura do traço

A espessura do traço é um modificador escrito direto na classe do ícone, e apenas famílias desenhadas com traços respondem a ela. Das famílias empacotadas, Lucide e Line MD têm suporte; as outras famílias a ignoram:

```html
<!-- um traço mais fino -->
<i class="ic-lucide-heart/1.5"></i>

<!-- um traço mais grosso -->
<i class="ic-lucide-heart/3"></i>
```

A espessura é gravada diretamente na arte SVG que a regra carrega, então não pode ser aplicada por cima como uma classe separada. `ic-heart` e `ic-heart/1.5` são dois ícones distintos para o CSS, e não um ícone com um seletor. Como uma classe produz uma regra, sua folha de estilos paga apenas pelas espessuras de traço que você realmente escreveu.

É também por isso que o modificador exige uma etapa de build: Vite, PostCSS e Tailwind varrem o seu markup e geram as espessuras pedidas sob demanda, enquanto as folhas de estilos de família sem plugin renderizam cada ícone na espessura original.

## Tamanho

O tamanho padrão de um ícone é `1em`, acompanhando o tamanho da fonte ao redor. Defina `--ic-size` no ícone ou em qualquer ancestral para redimensioná-lo, ou adicione uma classe da escala de tamanho:

| Classe  | `--ic-size` |
| ------- | ----------- |
| `ic-xs` | `0.75rem`   |
| `ic-sm` | `0.875rem`  |
| `ic-md` | `1rem`      |
| `ic-lg` | `1.25rem`   |
| `ic-xl` | `1.5rem`    |

```html
<i class="ic-lucide-search ic-lg"></i>
```

Cada classe de tamanho faz uma coisa só — define `--ic-size` para um valor em rem — então ela combina sem atrito com modificadores de traço e funciona independentemente do elemento em que cair. Diferente da espessura do traço, o tamanho não é gravado na arte, então a escala vem junto com as regras base e funciona em todo método de entrega, incluindo o [modo SVG inline](delivery/vite.md#modo-svg-inline), desde que `@import "@codenhub/icons"` esteja presente. Usar `.ic` em um elemento que não seja `<i>` continua valendo apenas nos métodos baseados em CSS, como observado em [Markup](#markup).

Como essas cinco classes são sempre emitidas, `xs`, `sm`, `md`, `lg` e `xl` são [reservados](#nomes-reservados): nenhuma família pode entregar um ícone ou usar um prefixo com esses nomes.

## Movimento

Os ícones se movem de duas maneiras: classes de movimento animam o glifo inteiro para qualquer ícone de qualquer família, enquanto [famílias animadas](#famílias-animadas) animam a própria arte sem precisar de classe de movimento. Três controles governam ambos:

| Pergunta      | Controle                                                                                | Padrão                                           |
| ------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------ |
| O que se move | uma classe `ic-anim-*`, ou um ícone de família animada                                  | nada                                             |
| Quando toca   | sempre, `ic-on-hover` ou [`playIcon`](javascript-api.md#reproduzindo-ícones-via-código) | sempre                                           |
| Quantas vezes | `--ic-anim-iterations`                                                                  | para sempre; uma vez por hover com `ic-on-hover` |

Cinco classes de movimento do glifo inteiro vêm com os estilos base:

| Classe           | Movimento                                         | Duração padrão |
| ---------------- | ------------------------------------------------- | -------------- |
| `ic-anim-spin`   | Uma volta completa em velocidade constante        | `1s`           |
| `ic-anim-pulse`  | Opacidade oscila entre 1 e 0.55                   | `2s`           |
| `ic-anim-beat`   | Dois batimentos curtos, até 1.1 vez o seu tamanho | `1s`           |
| `ic-anim-bounce` | Um salto vertical de 15% da altura do ícone       | `1s`           |
| `ic-anim-wiggle` | Rotação para frente e para trás em 6 graus        | `1s`           |

`ic-anim-spin` usa temporização linear; as outras quatro usam ease-in-out. Defina `--ic-anim-duration` no ícone ou em um ancestral para alterar a duração do ciclo. Use no máximo uma classe de movimento por elemento: ela substitui o `animation` CSS do elemento, e os movimentos baseados em `transform` também substituem o `transform` dele enquanto estão rodando.

**Sempre.** Sem classe de gatilho, o movimento roda enquanto a classe estiver no elemento. Alterne `ic-anim-spin` num ícone de recarregar enquanto uma requisição está em andamento e remova quando ela terminar:

```html
<i class="ic-lucide-loader-circle ic-anim-spin" aria-hidden="true"></i>
```

**No hover.** `ic-on-hover` reproduz o movimento enquanto o seu gatilho está com hover ou `:focus-visible`, e fica em repouso nos outros momentos. O gatilho pode ser o próprio ícone, seu elemento pai ou qualquer ancestral que carregue `ic-trigger` — prático para cards ou botões onde o ícone fica dentro de um contêiner. Cada hover reinicia do começo e toca uma vez por padrão:

```html
<button>
  <i class="ic-lucide-refresh-cw ic-anim-spin ic-on-hover" aria-hidden="true"></i>
  Reload
</button>

<a class="card ic-trigger" href="/inbox">
  <span class="card-icon"><i class="ic-lucide-bell ic-anim-wiggle ic-on-hover" aria-hidden="true"></i></span>
  Notifications
</a>
```

**Quantas vezes.** `--ic-anim-iterations` define a contagem de repetições: qualquer número ou `infinite`. Defina `--ic-anim-iterations: infinite` quando um ícone precisar continuar se movendo durante todo o hover, como um ventilador. Como é herdada, uma única regra numa barra de ferramentas define a contagem para todos os ícones dentro dela. A arte animada segue sua própria linha do tempo original e ignora `--ic-anim-iterations`: ícones `-loop` do Line MD repetem, e o restante toca uma vez.

**Via código.** Para feedback ligado a um evento — um ícone de copiar piscando ao dar certo, ou um ícone de curtir pulando no clique — chame `playIcon(element)` do entrypoint opt-in [`@codenhub/icons/play`](javascript-api.md#reproduzindo-ícones-via-código). Ele reinicia tanto o movimento do glifo quanto a arte animada.

O import base, `@import "@codenhub/icons"`, inclui os keyframes e as classes de movimento, então eles funcionam com folhas de estilos de família em CSS puro, Vite, PostCSS e modo SVG inline. O Tailwind também os registra como utilitários, mantendo variantes como `group-hover:ic-anim-spin` disponíveis. Com um `prefix` de classe personalizado, cada nome de classe, custom property e keyframe muda junto: `ux-anim-spin`, `ux-on-hover`, `ux-trigger`, `--ux-anim-duration` e `--ux-anim-iterations` sob `prefix: "ux"`.

Quando o dispositivo do usuário pede movimento reduzido, as classes de movimento param, o Line MD mostra sua arte estática mesmo durante o hover e `playIcon` não faz nada. Os ícones do SVG Spinners continuam se movendo, porque não têm arte estática. Mantenha informações de carregamento ou status disponíveis em texto; movimento nunca deve ser a única forma de entender um estado.

As classes de movimento movem o elemento inteiro do ícone. No modo máscara CSS, a arte é uma imagem, então o CSS não consegue entrar nela para mirar ou animar caminhos individuais. `ic-on-hover` depende de seletores `:not()` complexos e `:focus-visible`, que funcionam juntos no Chrome 88+, Firefox 85+ e Safari 15.4+. O movimento foi verificado no Chrome; Firefox e Safari não foram testados.

## A seguir

Leia [Métodos de entrega](delivery/index.md) para escolher como as classes de ícone viram CSS no seu build — CSS puro, Tailwind CSS v4, Vite ou PostCSS.
