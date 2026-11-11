---
title: Tailwind CSS v4
description: Como usar os entrypoints de código-fonte /tw num projeto com Tailwind CSS v4.
order: 1
source: a86fe5fa121db14ab917b10fb69e839111ddbc47
---

# Tailwind CSS v4

Um projeto que já roda Tailwind CSS v4 pode compilar o código-fonte deste pacote em vez de carregar a saída compilada. Os utilitários da sua aplicação e as classes do pacote saem então de um único build, compartilham um único tema e usam uma única variante `dark:`. Esta página trata do import, das estéticas, dos entrypoints específicos, de como construir seus próprios componentes com `@apply`, de como descartar a paleta do Tailwind e dos problemas de build que você provavelmente vai encontrar.

## Por que código-fonte em vez de compilado

Os entrypoints `/tw` publicam uma cópia do código-fonte não compilado da pasta `tw/` do pacote; o seu próprio build do Tailwind o compila junto com a sua aplicação, então as diretivas `@theme`, `@utility` e `@apply` dele são resolvidas junto com as suas. Os entrypoints compilados (`@codenhub/styles`) continuam funcionando num projeto com Tailwind, mas aí dois pipelines de CSS separados rodam lado a lado em vez de um — use `/tw`, a menos que um motivo específico o descarte.

## Importe o entrypoint de código-fonte

```css
@import "@codenhub/styles/tw";

@source "./src";
```

O `/tw` importa o próprio Tailwind, então ele substitui o seu `@import "tailwindcss"` em vez de se somar a ele: com os dois, o Preflight do Tailwind é emitido duas vezes. Todos os outros entrypoints `/tw/*` esperam que o seu import venha antes; veja [Usando um entrypoint específico](#usando-um-entrypoint-específico).

O Tailwind CSS v4 varre o seu projeto automaticamente — a maioria dos projetos não precisa de nada além do import acima. Os caminhos de `@source` são resolvidos a partir do arquivo CSS que os declara, não da raiz do projeto, então `./src` aqui significa "o `src/` ao lado desta folha de estilos"; ajuste para onde a sua folha de estilos global realmente está. Adicione `@source` só para markup que a varredura automática do Tailwind não alcança sozinha: um caminho excluído por padrão (listado no `.gitignore`, ou dentro de `node_modules` — uma biblioteca de componentes externa, por exemplo) ou, num monorepo, um caminho fora da árvore de diretórios deste arquivo. Aponte para o markup da sua aplicação, não para este pacote: o código-fonte do pacote nomeia todas as classes que ele define, então varrê-lo emite todas elas, quer as suas páginas as usem ou não.

## Adicione estéticas

Adicione uma estética a partir do entrypoint de código-fonte do mesmo jeito que no compilado, depois do import base:

```css
@import "@codenhub/styles/tw";
@import "@codenhub/styles/tw/aesthetics";

@source "./src";
```

## Usando um entrypoint específico

Importe um entrypoint `/tw/*` específico em vez do combinado — como `/tw/button` ou `/tw/form` — quando um build só precisa de uma família de componentes; veja a [tabela de entrypoints](../setup.md#todos-os-entrypoints) completa para saber o que cada um reúne.

Diferente do `/tw`, os entrypoints específicos e o `/tw/native` não importam o Tailwind, então mantenha o seu próprio import primeiro:

```css
@import "tailwindcss";
@import "@codenhub/styles/tw/button";
```

## Construa seus próprios componentes com `@apply`

No `/tw`, todo componente, helper e classe de eixo é um utilitário do Tailwind. Isso inclui as intenções (`neutral`, `primary`, `secondary`, `success`, `warning`, `destructive`, `info`), a apresentação (`solid`, `soft`, `ghost`, `edged`, `edgeless`), a elevação (`flat`, `raised`, `floating`), os padrões de canto (`cut-diagonal`, `cut-diagonal-reverse`) e os tamanhos (`sm`, `lg`). Assim, uma classe sua pode carregar uma receita inteira:

```css
@import "@codenhub/styles/tw";

@utility btn-save {
  @apply btn primary soft sm;
}

@utility btn-danger {
  @apply btn destructive md:lg dark:solid;
}
```

```html
<button class="btn-save" type="submit">Salvar</button>
```

- **Um componente aplicado se comporta como a classe.** `btn-save` reage ao hover, é pressionado, recebe foco e segue uma estética do mesmo jeito que `class="btn primary soft sm"`.
- **Variantes funcionam.** `hover:primary`, `md:lg` e `dark:solid` aplicam uma classe de eixo sob essa condição, no seu markup ou dentro do `@apply`.
- **Escreva a sua classe como `@utility`.** Assim ela fica na camada `utilities`, e os seus outros utilitários no mesmo elemento continuam vencendo. Uma regra simples `.btn-save { @apply … }` também funciona, mas fica sem camada, então o que ela aplica vence todos os utilitários do elemento; [Personalização → Helpers de composição](../usage/customizing.md#helpers-de-composição) tem os detalhes.
- **Modificadores também se aplicam.** Os modificadores de um componente, como `.tight` no `.stack`, `.icon` no `.btn` ou `.interactive` no `.card`, também são utilitários, então `@apply stack tight`, `@apply btn icon pill` e `md:tight` funcionam. O estado desabilitado é a exceção: continua sendo um atributo ou a classe `.disabled` no markup.
- **O seu utilitário vence os padrões internos de um componente.** `p-0 text-center` numa célula de `.data-table`, `text-sm` num `.label` e `px-8` num `.btn.sm` são todos aplicados.

A página de [Predefinições](../usage/presets.md) compara isso com as outras formas de definir um visual uma única vez.

## Descarte a paleta do Tailwind

O `/tw` é construído sobre o tema padrão do Tailwind, então os utilitários da paleta do Tailwind, como `bg-red-500`, continuam disponíveis. Se o seu design usa só os tokens do pacote, limpe os tons que você não usa:

```css
@import "@codenhub/styles/tw";

@theme {
  --color-red-*: initial;
  --color-orange-*: initial;
  --color-yellow-*: initial;
  --color-lime-*: initial;
  --color-green-*: initial;
  --color-teal-*: initial;
  --color-cyan-*: initial;
  --color-sky-*: initial;
  --color-blue-*: initial;
  --color-violet-*: initial;
  --color-purple-*: initial;
  --color-fuchsia-*: initial;
  --color-pink-*: initial;
  --color-slate-*: initial;
  --color-gray-*: initial;
  --color-zinc-*: initial;
  --color-stone-*: initial;
  --color-black: initial;
}
```

As cores do próprio pacote não mudam, e você ainda pode acrescentar cores suas no mesmo bloco.

O bloco deixa de fora `neutral`, `emerald`, `amber`, `rose`, `indigo` e `white` de propósito: o tema constrói as cores dele a partir deles.

- **Não limpe o namespace inteiro.** `--color-*: initial` também remove as cores semânticas do pacote, e o build para com um erro como `Cannot apply unknown utility class`.
- **Não limpe uma escala que o tema lê.** Limpar `--color-emerald-*` compila sem erro, mas as cores de sucesso feitas com ela se perdem.

## Solução de problemas

**As classes não resultam em nenhum estilo**

- **O que aconteceu:** os componentes usam classes documentadas como `.btn.primary`, mas nenhum estilo aparece, mesmo com `@import "@codenhub/styles/tw"` na folha de estilos.
- **Por quê:** raramente o problema é o próprio `@source` — o Tailwind já varre o seu projeto automaticamente. A causa mais comum é markup que fica num lugar que a varredura automática exclui por padrão: um caminho listado no `.gitignore` ou um componente vindo de `node_modules`. O Tailwind pode não ver uma classe usada só ali e deixa de gerar a regra dela.
- **Como resolver:** adicione um `@source` explícito apontando para esse diretório, resolvido a partir desta folha de estilos — como no [exemplo acima](#importe-o-entrypoint-de-código-fonte).

**Regras de token e de reset duplicadas**

- **O que aconteceu:** a folha de estilos gerada está maior do que o esperado, e as devtools do navegador mostram as mesmas custom properties ou regras de reset definidas duas vezes.
- **Por quê:** uma de duas coisas. Importar um entrypoint compilado (`@codenhub/styles`) e um entrypoint `/tw` (`@codenhub/styles/tw`) no mesmo build compila os mesmos tokens e o mesmo reset a partir de duas fontes independentes; o build do Tailwind não tem como saber que elas descrevem o mesmo pacote. Ou então a sua folha de estilos importa `tailwindcss` ao lado do `/tw`, que já o importa, e o Preflight é emitido duas vezes.
- **Como resolver:** escolha um caminho por projeto — entrypoints `/tw` para um projeto que roda Tailwind CSS v4, entrypoints compilados em todos os outros — e remova o seu próprio `@import "tailwindcss"` quando importar o `/tw`.

**Uma classe montada em tempo de execução fica sem estilo**

- **O que aconteceu:** `<button class="btn primary">` é estilizado, mas um botão cuja classe vem de uma variável, como `"btn " + variant`, ou de conteúdo de um CMS, não é.
- **Por quê:** o Tailwind emite só as classes que encontra escritas por extenso nos arquivos que varre. Isso vale também para as classes de componente do pacote: um build com `/tw` emite `.alert` só se `alert` aparecer em algum lugar que ele varre, o que mantém a folha de estilos restrita ao que as suas páginas usam. As classes de intenção, de apresentação, de elevação, de canto e de tamanho, como `.primary`, `.soft` e `.sm`, também são utilitários, então o mesmo vale para elas. As classes de estética, como `.glass`, são CSS comum e sempre emitidas. Um nome montado em tempo de execução nunca aparece inteiro num arquivo, então a varredura não o encontra.
- **Como resolver:** escreva cada nome de classe completo em algum lugar que o Tailwind varre, por exemplo num objeto de consulta (`{ save: "btn primary", remove: "btn destructive" }`), ou liste na sua folha de estilos os nomes que o seu código ou o seu conteúdo podem produzir:

```css
@import "@codenhub/styles/tw";

@source inline("btn alert badge primary destructive soft");
```

Todo entrypoint `/tw` exige Tailwind CSS 4.3.2 ou mais recente, abaixo da 5 (`>=4.3.2 <5`).

## A variante `dark:`

Os entrypoints `/tw` definem a sua própria variante `dark:`, então os seus utilitários trocam de tema com os mesmos seletores de claro e escuro que os tokens do pacote usam. Ela tem uma diferença conhecida em relação aos tokens quando há temas aninhados; veja [Temas → A variante dark:](../usage/theming.md#a-variante-dark).

## A seguir

Volte para o caminho principal: [Montando uma tela](../concepts.md) adiciona o primeiro card e o primeiro formulário à página de configurações. Tudo o que ela mostra funciona do mesmo jeito com `/tw`.
