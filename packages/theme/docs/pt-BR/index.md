---
title: Visão geral
description: Para que serve o pacote, como ele escolhe um tema e em que ordem ler as páginas.
source: 05f3b784bd7ac9ef656c70f8de0859aa17ccb13b
---

# Gerenciar temas no navegador

Quase todo app que oferece modo escuro acaba escrevendo o mesmo código: procurar no `localStorage` uma escolha salva, cair na configuração de claro ou escuro do sistema operacional quando não houver, colocar uma classe ou atributo em `<html>` para o CSS reagir, salvar a escolha quando o usuário clica num toggle e manter todas as abas abertas de acordo. Aí a página pisca em branco ao carregar para todo mundo que escolheu o escuro, e o código ganha uma segunda cópia de si mesmo dentro de um script inline para resolver isso. Duas cópias da mesma lógica, sincronizadas na base da fé.

O `@codenhub/theme` é esse código, escrito uma vez só. Você descreve os seus temas, e ele decide qual está ativo, lembra a escolha do usuário, segue o sistema operacional até o usuário escolher e avisa a página.

## O que ele faz e o que fica com você

O pacote decide **qual** tema está ativo. O seu CSS decide **a cara** de cada tema.

A cada mudança, ele escreve o tema ativo no elemento `<html>` (`document.documentElement`):

```html
<html data-theme="dark" class="theme-dark" style="color-scheme: dark"></html>
```

- `data-theme="dark"`: o nome do tema, para seletores CSS como `[data-theme="dark"]`.
- `class="theme-dark"`: o mesmo nome como uma classe `theme-<name>`, adicionada por padrão para o código que prefere classes (a opção `className` muda ou remove essa classe). Com `darkClass: true`, uma classe `dark` para o Tailwind CSS também é adicionada.
- `color-scheme: dark`: diz ao navegador para desenhar os próprios controles, como barras de rolagem e campos de formulário, em cores escuras.
- CSS custom properties, como `--color-primary`, para os tokens que você lista em `tokenSchema` e aos quais dá valores em JavaScript.

Ele não traz CSS, nem cores, nem botão de toggle. Isso fica na sua aplicação, do jeito que você já escreve. E alguns trabalhos ficam com você também:

- **Acessibilidade.** O toggle é um elemento seu, então o nome acessível dele também é: um botão que só mostra um ícone de sol precisa de um `aria-label`, como "Mudar para o tema escuro". As cores de texto e de fundo de cada tema precisam de contraste suficiente, e nenhum pacote consegue verificar isso por você.
- **Segurança.** Os valores dos tokens são escritos na página como CSS inline sem serem validados como CSS. Quando um valor vem de entrada do usuário, valide-o antes; [Design tokens](tokens.md#mude-tokens-em-tempo-de-execução) diz o que acontece caso contrário.
- **Performance.** Aplicar um tema escreve um punhado de atributos e propriedades, o que é barato. `readTokens()` é a única chamada que pode fazer o navegador recalcular o layout; [Design tokens](tokens.md#leia-os-valores-dos-tokens) explica quando usá-la.

## Como o tema é escolhido

Quando a página começa, o pacote escolhe um tema nesta ordem:

1. **A escolha salva do usuário.** Depois que o usuário escolhe um tema, ele fica salvo no `localStorage` do navegador e ganha em toda visita seguinte.
2. **A configuração do sistema operacional.** Até o usuário escolher, o tema segue o modo claro ou escuro do sistema, e muda junto com ele.
3. **O tema padrão.** Se nenhum dos dois estiver disponível, como num servidor, vale o tema padrão: `light`, a menos que você configure outro.

## O passo a passo

As páginas constroem do zero o suporte a temas de um app: primeiro um toggle, depois uma tela de configurações com um menu de temas, uma cor de destaque personalizada e, por fim, o setup de produção. Lidas em ordem, elas levam você de uma página vazia até a produção:

1. [Primeiros passos](getting-started.md): instale o pacote e monte um toggle de claro e escuro funcionando.
2. [Definir temas](themes.md): adicione os seus próprios temas, decida como o toggle e a configuração do sistema escolhem entre eles, e leia o estado atual.
3. [Design tokens](tokens.md): mantenha as cores dos temas em JavaScript e mude-as em tempo de execução.
4. [Salvar e sincronizar](persistence-and-sync.md): como a escolha é salva, como as abas ficam de acordo e como reagir quando o tema muda.
5. [Evitar o flash](preventing-the-flash.md): aplique o tema antes da primeira pintura, num site estático ou num renderizado no servidor.
6. [Frameworks](frameworks.md): use o pacote com React e com a variante `dark:` do Tailwind CSS.
7. [Solução de problemas](troubleshooting.md): o que verificar quando algo não funciona.

A [referência da API](../reference/index.md) (em inglês) lista cada export com a assinatura completa. Consulte as coisas lá; leia o passo a passo para entender como elas se encaixam.

## Requisitos

- **Um navegador, para o tema aparecer.** O pacote usa `document.documentElement`, `localStorage`, `matchMedia`, eventos `storage` e `CustomEvent`, e trata qualquer um deles que esteja faltando como ausente, em vez de quebrar a sua página. Uma chamada a `localStorage` ou `matchMedia` que lança um erro, como numa janela anônima, é tratada do mesmo jeito. Num servidor, ele não faz nada que precise de navegador; veja [Evitar o flash](preventing-the-flash.md#o-que-o-servidor-sabe).
- **Chrome 93, Firefox 92, Safari 15.4 ou mais recente**, no pacote como é publicado, sem transpilar. O pacote é distribuído como JavaScript moderno: ele chama `Object.hasOwn`, então `createTheme()` lança um `TypeError` num navegador que não o tem, e usa o operador `??=`, então um navegador anterior ao Chrome 85, ao Firefox 79 ou ao Safari 14 nem consegue carregá-lo e informa um `SyntaxError`. Para dar suporte a um navegador mais antigo, faça o seu build transpilar as dependências e adicionar polyfills para ele. O script de pré-pintura de [Evitar o flash](preventing-the-flash.md) é ES5 puro e ainda aplica o atributo e as classes do tema em navegadores bem abaixo desse mínimo, até o Chrome 24, o Firefox 24 e o Safari 7. Os tokens e o `color-scheme` só têm efeito onde o navegador suporta propriedades personalizadas de CSS e `color-scheme`.
- **TypeScript 5.4 ou mais recente**, se você usa TypeScript. Os tipos usam `NoInfer`, que compiladores mais antigos acusam como `Cannot find name 'NoInfer'`. Projetos em JavaScript puro não precisam de nada a mais.
- **Mais nada.** Sem dependências e sem framework.

Pronto? [Primeiros passos](getting-started.md) põe um toggle para funcionar em cinco passos.
