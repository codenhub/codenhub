---
title: Configuração
description: Instale o pacote, escolha entre CSS compilado ou código-fonte do Tailwind e renderize a estrutura da página de configurações.
order: 1
source: 464e22d4b8d6615cd68e3f9368f203b9a4fe2860
---

# Configuração

Esta página coloca a folha de estilos no seu projeto e põe a estrutura vazia da tela de configurações na página. São uma instalação, um import e uma escolha: CSS compilado ou código-fonte do Tailwind. O resto da página é referência para consultar depois: todos os entrypoints, a opção sem classes, as camadas de cascata e o que dá errado quando falta um import.

## Instalação

```sh
pnpm add @codenhub/styles
```

`npm install @codenhub/styles` e `yarn add @codenhub/styles` funcionam do mesmo jeito.

## Importe a folha de estilos

Importe a folha de estilos compilada completa uma única vez, no arquivo CSS que a sua aplicação já carrega globalmente:

```css
@import "@codenhub/styles";
```

Depois escreva a estrutura da tela de configurações. É uma seção de página com uma coluna estreita e centralizada:

```html
<main class="section">
  <div class="section-content narrow stack">
    <h1 class="text-title">Account settings</h1>
    <p>Manage your profile, plan, and security.</p>
  </div>
</main>
```

Se o título aparecer numa fonte de título em negrito e compacta, com o parágrafo espaçado abaixo dele, e a coluna ficar no meio de uma janela larga, a folha de estilos está funcionando. Se parecer o padrão do navegador sem estilo, veja [Quando nada é estilizado](#quando-nada-é-estilizado).

A folha de estilos completa inclui o reset, os tokens, os utilitários de layout e tipografia e todas as classes de componente. Ela aplica regras globais à sua página: o reset, o tema da raiz e os anéis de foco. Ela não inclui as estéticas nem os mapeamentos sem classes de elementos; os dois são imports separados, descritos abaixo.

## Escolha seu caminho

Escolha um:

- **CSS compilado** (`@codenhub/styles`, mostrado acima). Use este, a menos que tenha um motivo para não usar. Qualquer bundler que resolva imports de CSS de pacotes funciona, como Vite, webpack ou a CLI do Tailwind. Ele traz todas as classes, sejam usadas pelas suas páginas ou não.
- **Código-fonte do Tailwind CSS v4** (`@codenhub/styles/tw`). Use quando o seu projeto já roda Tailwind v4. O seu build compila o pacote junto com os seus próprios utilitários, então você fica com uma única folha de estilos e a variante `dark:` do Tailwind acompanha o tema do pacote. Exige Tailwind 4.3.2 ou mais recente, abaixo da 5.
- **Sem bundler.** Referencie o arquivo compilado a partir do `node_modules` ou de uma CDN com uma tag `<link>`; veja [Sem bundler](./integrating/without-a-bundler.md).

Para entregar só as classes que as suas páginas usam num projeto que não usa Tailwind, com bundler ou sem, o comando `chs build` do pacote lê os seus arquivos e escreve uma folha de estilos com só essas classes, que você importa ou referencia no lugar da compilada; veja [Gere só as classes que você usa](./integrating/without-a-bundler.md#gere-só-as-classes-que-você-usa).

O seu framework pode precisar de uma configuração própria, como onde fica a folha de estilos global no Next.js ou no Astro. Cada um destes guias cobre uma configuração e depois traz você de volta para cá:

- [Tailwind CSS v4](./integrating/tailwind.md)
- [Next.js](./integrating/nextjs.md)
- [Vue](./integrating/vue.md)
- [Svelte](./integrating/svelte.md)
- [Astro](./integrating/astro.md)
- [Sem bundler](./integrating/without-a-bundler.md)

## Adicione uma estética (opcional)

As estéticas são folhas de estilos separadas porque a maioria das páginas usa uma ou nenhuma. Importe as seis de uma vez, ou só a que você usa:

```css
@import "@codenhub/styles";
@import "@codenhub/styles/aesthetics/neobrutalism";
```

A ordem dos dois imports não importa, porque todo entrypoint declara as [camadas de cascata](#camadas-de-cascata) antes de usar qualquer uma. A página de [Estéticas](./usage/aesthetics.md) mostra o que cada uma faz; até lá, você pode ignorá-las.

## Requisitos

- **Navegadores:** Chrome 123, Safari 17.5 ou Firefox 128 e mais recentes. As cores usam `light-dark()` e `color-scheme` (Firefox 120). O `.input-group` lê o estado inválido e desabilitado de um controle aninhado com `:has()` (Firefox 121). As classes de elevação registram uma propriedade sem herança com `@property` (Firefox 128); sem isso, uma classe de elevação também atingiria os elementos sem classe dentro dela.
- **Ferramental:** um `@import` com nome de pacote precisa de uma ferramenta que resolva imports de CSS de pacotes pelo mapa `exports` deles. Sem ela, referencie o arquivo compilado pelo caminho ou a partir de uma CDN; veja [Sem bundler](./integrating/without-a-bundler.md). Duas ferramentas comuns precisam de um ajuste, descrito em [Integração → Bundlers que precisam de um empurrão](./integrating/index.md#bundlers-que-precisam-de-um-empurrão): o Parcel e o PostCSS com `postcss-import`.
- **Tailwind:** 4.3.2 ou mais recente, abaixo da 5, só para os entrypoints de código-fonte `/tw`. É uma peer dependency opcional, então os entrypoints compilados e o comando `chs build` não o instalam.
- **Node.js:** 24 ou mais recente, só na máquina que roda o comando `chs build`. As folhas de estilos não precisam dele.
- **Sua aplicação:** o pacote não tem JavaScript. HTML semântico, ARIA, comportamento de teclado, gerenciamento de foco, validação e anúncios ficam com você; veja [Acessibilidade](./accessibility.md).

## Quando nada é estilizado

- **O import está faltando ou não é carregado globalmente.** As classes não fazem nada até a folha de estilos estar na página. Importe-a uma vez numa folha de estilos que toda página carrega, não num componente que pode não ser renderizado.
- **O nome do pacote não é resolvido.** Um `<link>` simples ou uma ferramenta sem resolução de pacotes CSS não consegue ler `@import "@codenhub/styles"`. Referencie `node_modules/@codenhub/styles/dist/index.css` ou siga [Sem bundler](./integrating/without-a-bundler.md). O Parcel e o `postcss-import` resolvem o nome com uma pequena mudança; veja [Integração → Bundlers que precisam de um empurrão](./integrating/index.md#bundlers-que-precisam-de-um-empurrão).
- **Um caminho `/tw` é carregado sem Tailwind.** Os arquivos `/tw` são código-fonte do Tailwind: eles contêm `@theme`, `@utility` e `@apply`, que os navegadores não entendem. O seu build do Tailwind precisa compilá-los; veja [Tailwind CSS v4](./integrating/tailwind.md).
- **Um entrypoint `/tw` específico é importado sem o Tailwind antes.** `@codenhub/styles/tw/button` e os outros arquivos de um componente específico não importam o Tailwind. Importados sozinhos, eles compilam sem erro, mas não produzem nenhuma regra de componente. Coloque `@import "tailwindcss";` antes; veja [Tailwind CSS v4 → Usando um entrypoint específico](./integrating/tailwind.md#usando-um-entrypoint-específico).
- **Falta uma classe montada em tempo de execução (só com código-fonte do Tailwind).** O Tailwind só gera uma classe utilitária, incluindo os componentes do pacote como `.btn`, quando encontra o nome nos seus arquivos de código. Um nome montado a partir de strings, como `` `btn ${tone}` ``, é invisível para essa varredura. Escreva os nomes de classe completos, ou liste-os como descrito em [Tailwind CSS v4](./integrating/tailwind.md).

### CSS crítico inline

Você pode colar uma folha de estilos **compilada**, de `dist/` ou da saída do seu próprio build, num elemento HTML `<style>`, por exemplo para deixar o CSS crítico inline num head renderizado no servidor. Nenhum dos arquivos compilados contém a sequência `</style`, que encerraria o elemento antes da hora.

Isso não vale para os arquivos `/tw`. Eles são código-fonte do Tailwind, não CSS pronto, então colar um deles num `<style>` entrega ao navegador diretivas que ele ignora, e as classes nunca são geradas. Compile-os com o Tailwind primeiro e depois deixe a saída inline.

## Todos os entrypoints

Os entrypoints compilados são CSS pronto. Os entrypoints `/tw` publicam o código-fonte não compilado de `tw/`, ao lado de `dist/`, que um build do Tailwind v4 precisa processar. Um entrypoint `/tw` de um componente específico inclui os tokens do tema, então as classes dele não precisam de mais nada do pacote, mas ele precisa de `@import "tailwindcss";` antes; veja [Tailwind CSS v4 → Usando um entrypoint específico](./integrating/tailwind.md#usando-um-entrypoint-específico).

Cada caminho de import resolve para o mesmo arquivo nas condições de export `style`, `import` e `default`. Uma condição `types` vem primeiro e aponta para uma declaração vazia, para que o TypeScript aceite um import de efeito colateral como `import "@codenhub/styles";` com `noUncheckedSideEffectImports`, que o TypeScript 6 ativa por padrão. Um import de CSS é um efeito colateral, então garanta que o seu bundler não o descarte como não usado.

| Caminho de import                | O que contém e o que altera                                                                                                                                                                                                                                                                                                        |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@codenhub/styles`               | Folha de estilos completa compilada: a saída de base e de tema do Tailwind, tokens, tipografia, utilitários de layout e de conteúdo, componentes e o reset. Aplica o reset global, o tema da raiz e as regras de foco.                                                                                                             |
| `@codenhub/styles/theme`         | Tokens compilados e as classes de intenção, apresentação, elevação e padrão de cantos. Define as propriedades do tema na raiz e os seletores de claro e escuro. Sem reset e sem componentes.                                                                                                                                       |
| `@codenhub/styles/palette`       | Custom properties `--palette-*` geradas: a cor de preenchimento, de texto e de borda de cada combinação de intenção e apresentação como valor plano, mais as cores planas `border`, `surface` e `text`. Para código que não pode usar o pacote em si; veja [Personalização → Paleta gerada](./usage/customizing.md#paleta-gerada). |
| `@codenhub/styles/components`    | Tokens compilados, utilitários de tipografia e todas as classes de componente. Cada componente traz a sua própria regra de movimento reduzido, e a correção do `<dialog>` fechado vem com o `.card`. Sem reset, sem utilitários de layout ou de conteúdo, sem mapeamentos sem classes.                                             |
| `@codenhub/styles/native`        | Tokens, tipografia, utilitários de layout e de conteúdo, componentes e o reset do pacote, compilados, mais os [mapeamentos sem classes](#html-sem-classes) para elementos HTML puros. Sem o Preflight do Tailwind. Aplica o reset e seletores amplos de elementos.                                                                 |
| `@codenhub/styles/aesthetics`    | As seis estéticas compiladas, `.neobrutalism`, `.glass`, `.pixel`, `.chunky-tile`, `.cyber` e `.sketch`, cada uma com a sua classe `-solo`. Sem tokens nem componentes próprios; importe em qualquer ordem.                                                                                                                        |
| `@codenhub/styles/aesthetics/*`  | Uma estética compilada e a sua classe solo: `/neobrutalism`, `/glass`, `/pixel`, `/chunky-tile`, `/cyber` ou `/sketch`.                                                                                                                                                                                                            |
| `@codenhub/styles/tw`            | Versão em código-fonte da folha de estilos completa. Importa o próprio Tailwind e depois o tema, a tipografia, os utilitários, os componentes e o reset. Mesmas regras globais.                                                                                                                                                    |
| `@codenhub/styles/tw/theme`      | Tema, tokens e classes de eixo em código-fonte. Importa a camada de tema do Tailwind, emite os seletores de tema e define a variante `dark:` do pacote.                                                                                                                                                                            |
| `@codenhub/styles/tw/components` | Tema, tipografia, botões, feedback, formulários, superfícies e tooltips em código-fonte. Sem reset, sem utilitários de layout ou de conteúdo, sem mapeamentos sem classes.                                                                                                                                                         |
| `@codenhub/styles/tw/surface`    | Tema em código-fonte mais `.surface`, `.card` e `.panel`.                                                                                                                                                                                                                                                                          |
| `@codenhub/styles/tw/button`     | Tema em código-fonte mais `.btn`.                                                                                                                                                                                                                                                                                                  |
| `@codenhub/styles/tw/form`       | Tema em código-fonte mais `.field`, `.text-control`, `.ipt`, `.textarea`, `.select`, `.input-group`, `.checkbox`, `.radio` e `.switch`.                                                                                                                                                                                            |
| `@codenhub/styles/tw/feedback`   | Tema em código-fonte mais `.alert`, `.badge`, `.skeleton` e `.progress`, com as suas animações.                                                                                                                                                                                                                                    |
| `@codenhub/styles/tw/tooltip`    | Tema em código-fonte mais as classes de tooltip.                                                                                                                                                                                                                                                                                   |
| `@codenhub/styles/tw/reset`      | Tema, utilitários de tipografia e o reset global em código-fonte. Altera a raiz, o body e os elementos, e define regras de seleção, movimento, foco, barra de rolagem e cores forçadas.                                                                                                                                            |
| `@codenhub/styles/tw/native`     | Versão em código-fonte da `/native`: tudo menos o Preflight do Tailwind, mais o reset do pacote e os mapeamentos sem classes. O efeito global mais amplo.                                                                                                                                                                          |
| `@codenhub/styles/tw/typography` | Tema em código-fonte mais os utilitários de tipografia. Define os seletores de tema; sem reset, sem mapeamentos sem classes.                                                                                                                                                                                                       |
| `@codenhub/styles/tw/utilities`  | Tema e tipografia em código-fonte mais os utilitários de layout e de conteúdo.                                                                                                                                                                                                                                                     |
| `@codenhub/styles/tw/aesthetics` | As seis estéticas em código-fonte. `/tw/aesthetics/neobrutalism`, `/glass`, `/pixel`, `/chunky-tile`, `/cyber` e `/sketch` publicam uma cada. CSS puro, sem efeitos colaterais de tema ou de reset.                                                                                                                                |
| `@codenhub/styles/package.json`  | O manifesto do pacote, em JSON. Para ferramentas que leem a versão instalada ou o mapa de exports; não é uma folha de estilos.                                                                                                                                                                                                     |

Não importe dois entrypoints que se sobrepõem, como `@codenhub/styles` e `@codenhub/styles/components`, no mesmo build, a menos que CSS duplicado seja aceitável. Escolha o entrypoint mais restrito que cubra o que a página precisa.

## HTML sem classes

`@codenhub/styles/native` estiliza elementos HTML puros sem nenhuma classe, para conteúdo em que você não consegue colocar classes, como a saída de um Markdown ou o corpo de um CMS. Ela traz tudo o que a folha de estilos completa traz, menos o Preflight do Tailwind, o reset dos padrões do navegador que o `@codenhub/styles` traz junto com o Tailwind. O reset do próprio pacote está nela: o box sizing, o fundo, a cor do texto e a fonte da raiz, o reset de margens de títulos, parágrafos e listas, as cores de seleção, os anéis de foco e a regra de movimento reduzido. Depois ela acrescenta estes mapeamentos:

| Elemento                                                                                                                                       | Estilizado como                                                                     |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `h1`, `h2`, `h3`, `h4`, `h5` e `h6`                                                                                                            | `.text-title-lg`, `.text-title`, `.text-title-sm`, `.text-label-lg`, `.text-label`  |
| `body`                                                                                                                                         | `.text-body`, herdado por parágrafos, itens de lista e outros textos                |
| `table`                                                                                                                                        | `.data-table`                                                                       |
| `kbd`, `blockquote`, `q`, `code`, `pre`                                                                                                        | `.kbd`, `.quote`, `.quote-inline`, `.code`, `.pre`                                  |
| `hr`                                                                                                                                           | `.divider`                                                                          |
| `input` sem type, ou com type `text`, `number`, `email`, `password`, `url`, `tel`, `search`, `month`, `week`, `time`, `date`, `datetime-local` | `.ipt`                                                                              |
| `textarea`, `select`                                                                                                                           | `.textarea`, `.select`                                                              |
| `input type="checkbox"`, `input type="radio"`                                                                                                  | `.checkbox`, `.radio`                                                               |
| `button`, `input type="button"`, `type="submit"`, `type="reset"`                                                                               | `.btn`                                                                              |
| `dialog`                                                                                                                                       | `.card.floating`: escondido até ser aberto, e então um card flutuante centralizado  |
| `progress`                                                                                                                                     | `.progress`, preenchido até o seu `value`; sem `value`, é a varredura indeterminada |

```html
<article>
  <h2>Two-factor authentication</h2>
  <p>Press <kbd>Ctrl</kbd> + <kbd>K</kbd> to open the command menu.</p>
  <label for="code">Verification code</label>
  <input id="code" type="text" inputmode="numeric" />
  <label><input type="checkbox" /> Remember this device</label>
  <button type="submit">Verify</button>
</article>
```

O que ele não faz:

- **Alguns tipos de input ficam de fora:** `file`, `range`, `color` e `hidden` mantêm a aparência do próprio navegador.
- **Nada de switch.** Um checkbox com `role="switch"` continua pintado como checkbox; o mapeamento não lê roles. Uma página que precisa de switches fica mais bem servida pela folha de estilos baseada em classes.
- **Links acompanham o texto ao redor.** Um link dentro de um título mantém o tamanho do título; um link nunca é estilizado como botão.
- **O texto do corpo é definido uma vez.** `p` e `li` herdam a tipografia do elemento em que estão, então um contêiner que define o seu próprio tamanho, peso ou espaçamento entre letras o aplica ao Markdown dentro dele. Os controles mantêm o próprio espaçamento entre letras: um botão, um badge e um campo de texto ficam em `normal`, seja o que for que a página ou o contêiner definam.
- **O comportamento nativo continua nativo.** Um `<dialog>` abre com `show()` ou `showModal()` como sempre; o mapeamento só o pinta. A varredura de um `<progress>` para com a preferência de movimento reduzido, e em cores forçadas a barra usa as cores do sistema.
- **`pre code` não recebe estilo duplicado.** O código dentro de um `pre` perde o chip que desenharia sozinho: fundo, padding, borda, sombra, brilho e recorte.

Os mapeamentos são globais: todo elemento correspondente na página é estilizado, inclusive elementos dentro de widgets de terceiros. Eles ficam na [camada de cascata](#camadas-de-cascata) `base`, então qualquer classe vence. Adicione uma classe de intenção ou de apresentação a um elemento mapeado, como `<button class="destructive">`, e ela funciona como funcionaria num `.btn`.

## Camadas de cascata

Todo entrypoint coloca o seu CSS nas quatro camadas de cascata (cascade layers) do Tailwind e declara a ordem delas antes de usar qualquer uma, então o resultado não depende de qual arquivo carrega primeiro:

| Camada       | Contém                                                                                                                                                                                                                                                                                        |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `theme`      | O tema do Tailwind, os tokens fundamentais, os seletores de tema e a `/palette`.                                                                                                                                                                                                              |
| `base`       | O reset e os estilos de elemento sem classes.                                                                                                                                                                                                                                                 |
| `components` | As classes de estética e os valores de intenção neutros de que todo componente parte.                                                                                                                                                                                                         |
| `utilities`  | Todos os componentes (`.btn`, `.card`, `.ipt` e assim por diante), ao lado dos seus próprios utilitários do Tailwind. As classes de intenção, apresentação, borda, elevação, canto e tamanho ficam em `utilities.families`, uma subcamada que perde para qualquer outra regra de `utilities`. |
| _sem camada_ | As sobrescritas de cores forçadas e de movimento reduzido, a correção do `<dialog>` fechado e as classes `-solo`.                                                                                                                                                                             |

O que isso significa quando você escreve o seu próprio CSS:

- **O seu utilitário ou CSS sem camada vence uma classe de intenção, apresentação, elevação ou estética** no mesmo elemento. `[--ui-fill:50%]` num botão `.solid`, `font-serif` numa região `.pixel` ou `.my-card { --ui-radius-surface: 0 }` na sua própria folha de estilos, todos se aplicam.
- **Um componente e o seu utilitário dividem a camada `utilities`.** A especificidade decide entre eles e depois a ordem no código, como entre dois utilitários quaisquer. O seu CSS sem camada sempre vence um componente.
- **O seu utilitário vence os padrões internos de um componente.** `p-0 text-center` numa célula de tabela, `text-sm` numa `.label` ou `px-8` num `.btn.sm` se aplicam, porque o componente escreve esses padrões de modo que uma classe no elemento vença.
- **O estado vence a sua intenção.** Um campo com `aria-invalid="true"` continua destrutivo mesmo com um utilitário de intenção aplicado.
- **As classes `-solo` ficam fora das camadas de propósito**, para vencer os estilos em camadas ou de especificidade zero de um componente de terceiros. Uma regra sem camada mais específica, ou uma igualmente específica que carrega depois, ainda vence essas classes; veja [Classes solo](./usage/solo.md).

## A seguir

Com a estrutura na página, siga para [Montando uma tela](./concepts.md) para adicionar um card, um título de formulário e um botão de salvar. Se você usa um dos frameworks acima e ainda não fez a integração, faça isso primeiro.
