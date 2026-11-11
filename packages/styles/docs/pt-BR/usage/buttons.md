---
title: Botões
description: Ações destrutivas e secundárias, botões de ícone, tamanhos, links com cara de botão, estados desabilitados e como carregar ícones.
order: 1
source: 54f7c8a1eee5a0f696dc60b9f60f42026d49c5d5
---

# Botões

A tela de configurações tem um botão de salvar e um de cancelar. Esta página acrescenta o resto das ações: uma zona de perigo com um botão destrutivo de excluir, um botão de ícone que copia uma chave de API e botões menores para uma linha mais densa. Ela também trata de botões desabilitados e de como carregar os ícones usados aqui e nas próximas páginas.

## Adicione uma zona de perigo

Uma ação destrutiva fica num card próprio, no fim da tela. O card é soft e destrutivo, para ser lido como um aviso; o botão é sólido, para ser o elemento que mais chama atenção naquele card:

```html
<section class="card soft destructive stack" aria-labelledby="danger-title">
  <h2 class="text-title-sm" id="danger-title">Delete account</h2>
  <p>This removes your projects, invoices, and API keys. It cannot be undone.</p>
  <div class="cluster">
    <button class="btn destructive" type="button">Delete account</button>
    <button class="btn ghost" type="button">Export data first</button>
  </div>
</section>
```

O card e o botão declaram `.destructive` cada um, porque [a intenção não é herdada](../concepts.md#intenção-qual-cor). Pelo mesmo motivo, o botão de exportar mantém a cor neutra dentro do card vermelho.

## Escolha um preenchimento e uma borda

Um botão aceita uma intenção, uma classe de preenchimento e uma classe de borda, todas opcionais. Sem nenhuma, o botão é sólido e sem borda:

```html
<button class="btn primary">Save changes</button>
<button class="btn secondary">Preview</button>
<button class="btn primary soft">Invite member</button>
<button class="btn destructive ghost edged">Revoke key</button>
<button class="btn ghost">Cancel</button>
```

Um botão **neutro** nunca é preenchido por completo. A cor dele é a própria cor do texto da página, então um preenchimento total seria um bloco preto ou branco, o elemento que mais chama atenção na página justamente para a intenção que não significa nada em particular. Em vez disso, um botão neutro `.solid` para em 20% de preenchimento, um cinza discreto um tom mais escuro que o `.soft`. Toda intenção com nome preenche até 100%.

No hover, o preenchimento de um botão aumenta em `--hover-step` (14%), então um botão `.ghost` ganha um tom e um `.solid` muda para a cor de hover da sua intenção. Ao ser pressionado, ele encolhe um pouco (`scale(0.97)`); uma [estética](./aesthetics.md) pode trocar isso pelo seu próprio efeito de clique, e, com a preferência do usuário por movimento reduzido, ele ainda acontece, de imediato.

Um botão neutro `.soft` ou `.ghost` dentro de uma superfície preenchida, como um botão Cancelar num `.card.solid.primary` ou num `.alert.solid.destructive`, imprime o rótulo e a linha na cor de texto dessa superfície, então continua legível sobre o preenchimento. Um campo de texto faz o mesmo. Um botão com intenção mantém a própria cor, e um neutro `.solid` também, porque fica sobre um preenchimento próprio.

Quando um botão preenchido tem o foco do teclado, uma linha de 2px da cor da página corre por dentro do anel de foco, então o anel continua visível sobre um botão preenchido da mesma cor, como `.solid.primary`.

## Tamanhos e formatos

| Classe    | Efeito                                                                                                                                                                     |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| _nenhuma_ | Pelo menos 2.5rem de altura (`--control-height`), 1rem de padding lateral e o mesmo tamanho de fonte do texto ao redor.                                                    |
| `.sm`     | Pelo menos 2rem de altura, 0.75rem de padding lateral, texto de 0.875rem.                                                                                                  |
| `.lg`     | Pelo menos 3rem de altura, 1.25rem de padding lateral, texto de 1.0625rem.                                                                                                 |
| `.pill`   | Extremidades totalmente arredondadas.                                                                                                                                      |
| `.icon`   | Quadrado. Pelo menos 2.5rem de cada lado, 2rem com `.sm`, 3rem com `.lg`.                                                                                                  |
| `.p-xs`   | O padding mais justo (0.5rem nas laterais, 0.125rem em cima e embaixo). Também remove a altura mínima, para que o botão caiba numa célula de tabela ou numa toolbar densa. |
| `.p-sm`   | Padding compacto (0.625rem nas laterais, 0.25rem em cima e embaixo).                                                                                                       |
| `.p-lg`   | Padding espaçoso (1.5rem nas laterais, 0.75rem em cima e embaixo).                                                                                                         |

Uma classe de tamanho e uma de padding podem ser combinadas. Só o `.p-xs` remove a altura mínima de um botão com rótulo; todas as outras combinações a mantêm. Num botão de ícone, qualquer classe `.p-*` remove o tamanho mínimo, e o botão passa a ter o tamanho do ícone mais esse padding: 0.125rem, 0.25rem ou 0.75rem ao redor.

O visual base desenha cantos que acompanham o tamanho: um botão `.sm` ou `.p-sm` tem cantos um pouco menores que o padrão, e um `.lg`, um pouco maiores.

## Botões de ícone

A lista de chaves de API da tela de configurações tem um botão de copiar ao lado de cada chave. Um botão só com ícone precisa de um nome acessível, porque o ícone não tem texto que um leitor de tela consiga ler:

```html
<button class="btn icon ghost" type="button" aria-label="Copy API key">
  <i class="ic-lucide-copy" aria-hidden="true"></i>
</button>
<button class="btn ghost sm" type="button">
  <i class="ic-lucide-download" aria-hidden="true"></i>
  Download invoice
</button>
```

Um botão é uma linha flex com espaçamento de 0.5rem, então um ícone ao lado de um rótulo fica espaçado sem markup extra.

### Carregando ícones

Este pacote não entrega ícones. Os exemplos desta documentação usam o `@codenhub/icons` com a família Lucide, e os nomes de classe dele sempre incluem a família, como `ic-lucide-copy`. Instale e carregue uma vez, ao lado deste pacote:

```sh
pnpm add @codenhub/icons
```

Com CSS compilado, importe as regras base e cada família que você usa:

```css
@import "@codenhub/styles";
@import "@codenhub/icons";
@import "@codenhub/icons/lucide";
```

Com o código-fonte do Tailwind, importe o entrypoint de Tailwind dele depois do deste pacote:

```css
@import "@codenhub/styles/tw";
@import "@codenhub/icons/tw";
```

Qualquer outro ícone também funciona: um `<svg>` inline com `stroke="currentColor"` ou `fill="currentColor"` pega a cor do texto do botão da mesma forma.

## Links com cara de botão

Um link que navega, como "View billing history", continua sendo um link. Escreva-o como `<a href>` com `.btn`, e ele ganha o mesmo visual:

```html
<a class="btn secondary ghost edged" href="/settings/billing">View billing history</a>
```

Não use `<div class="btn">` nem `<span class="btn">`: eles parecem botões, mas não podem receber foco nem ser acionados pelo teclado. Use `<button>` para ações e `<a href>` para navegação.

## Botões desabilitados

Qualquer um destes deixa um botão com aparência de desabilitado: o atributo `disabled`, `.disabled`, `aria-disabled="true"` ou `data-disabled`. Um botão desabilitado é desenhado com 58% de opacidade e cursor de não permitido, e não muda no hover nem ao ser pressionado.

```html
<button class="btn primary" type="submit" disabled>Save changes</button>

<a class="btn ghost" aria-disabled="true">Download invoice</a>
```

Só o atributo `disabled` impede o botão de funcionar. `.disabled`, `aria-disabled` e `data-disabled` mudam apenas a aparência: um clique ou a tecla Enter ainda o acionam, então o seu código precisa ignorá-lo. `aria-disabled` é a escolha certa quando o botão deve continuar focável, por exemplo para que um tooltip explique por que ele está desabilitado. Um link não tem atributo `disabled`, então remova também o `href` dele quando ele não deve navegar.

## Estado de carregamento

Não existe classe de carregamento. Um botão carregando é um botão desabilitado com um ícone de spinner que você fornece, e a página de [Feedback](./feedback.md#mostre-que-o-formulário-está-salvando) monta isso para o botão de salvar. Desabilite o botão para que um segundo clique não envie o formulário duas vezes.

## A seguir

Os botões estão prontos; o card que eles salvam ainda não tem nada para salvar. [Formulários](./forms.md) acrescenta os campos do perfil.
