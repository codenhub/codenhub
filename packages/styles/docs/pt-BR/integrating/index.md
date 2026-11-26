---
title: Visão geral
description: Como a folha de estilos é carregada no build de um framework e qual guia seguir.
group: Integração
order: 2
source: 595d7b9e1f77dfe104b39742e634652412467886
---

# Integração

Esta seção é um desvio do caminho principal de leitura, para projetos em que o framework decide onde o CSS global pode ficar. O pacote não tem JavaScript nem bindings para frameworks (veja a [Introdução](../index.md#o-que-ele-não-faz)), então integrá-lo se resume a duas coisas: onde o seu framework deixa você carregar uma folha de estilos global e se o projeto roda Tailwind CSS v4. Siga o guia que corresponde à sua stack e depois volte para [Montando uma tela](../concepts.md).

## O modelo comum

Toda stack faz os mesmos dois imports, a partir do mesmo tipo de lugar — um layout raiz, o arquivo de entrada da aplicação ou um arquivo CSS global, nunca uma página ou um componente mais abaixo na árvore:

1. Um [entrypoint](../setup.md#todos-os-entrypoints) — o `@codenhub/styles` compilado para qualquer build, ou `@codenhub/styles/tw` quando o projeto já roda Tailwind CSS v4.
2. `@codenhub/styles/aesthetics` (ou `/aesthetics/tw`), só se o projeto usar uma [estética](../usage/aesthetics.md). Ele pode vir antes ou depois do entrypoint, porque todo entrypoint declara as [camadas de cascata](../setup.md#camadas-de-cascata) antes de usar uma.

Importar de um único lugar importa por dois motivos. Alguns frameworks só _permitem_ os seus próprios arquivos CSS globais a partir de um arquivo raiz designado e falham no build caso contrário — o Pages Router do Next.js é um deles, e o arquivo CSS que contém o `/tw` é um dos seus; veja [Next.js → Solução de problemas](./nextjs.md#solução-de-problemas). Onde o framework permite de forma mais ampla, importar a partir da raiz continua sendo a escolha recomendada, porque assim a ordem em que as folhas de estilos carregam não depende de qual página ou componente o leitor abriu primeiro.

## Qual guia seguir

| Stack                                                                                         | Guia                                  |
| --------------------------------------------------------------------------------------------- | ------------------------------------- |
| Um projeto com Tailwind CSS v4 em qualquer bundler                                            | [Tailwind CSS v4](./tailwind.md)      |
| Next.js / React                                                                               | [Next.js](./nextjs.md)                |
| Vue                                                                                           | [Vue](./vue.md)                       |
| Svelte / SvelteKit                                                                            | [Svelte](./svelte.md)                 |
| Astro                                                                                         | [Astro](./astro.md)                   |
| Vite, sem Tailwind, entregando só as classes que as suas páginas usam                         | [Vite](./vite.md)                     |
| HTML puro, Rails, Laravel, Django ou qualquer aplicação sem etapa de build de CSS com Node.js | [Sem bundler](./without-a-bundler.md) |

Um projeto sem framework — um build simples com Vite, webpack ou Parcel — importa a folha de estilos compilada a partir do arquivo CSS global que o projeto já tem, como mostra [Configuração → Importe a folha de estilos](../setup.md#importe-a-folha-de-estilos). Vite e webpack resolvem o nome do pacote como ele é; Parcel e PostCSS com `postcss-import` precisam da mudança abaixo. A folha de estilos compilada traz todas as classes. Para entregar só as que as suas páginas usam sem adotar o Tailwind, adicione o [plugin de Vite](./vite.md) do pacote a um build do Vite, que reduz a folha de estilos que você já importa; com outro bundler, escreva uma folha de estilos reduzida com o [comando `build`](./without-a-bundler.md#gere-só-as-classes-que-você-usa) do pacote e importe-a no lugar.

### Bundlers que precisam de um empurrão

As duas ferramentas encontram a folha de estilos assim que alguém diz como; nenhuma precisa de outro entrypoint.

**Parcel.** Ative o suporte ao mapa `exports` de um pacote no seu `package.json`:

```json
{
  "@parcel/resolver-default": {
    "packageExports": true
  }
}
```

Depois importe o pacote com o prefixo `npm:` do Parcel, que diz a ele que o nome é um pacote, e não um arquivo ao lado da folha de estilos:

```css
@import "npm:@codenhub/styles";
```

**PostCSS com `postcss-import`.** O plugin não lê o mapa `exports` de um pacote, então o nome do pacote sozinho não é resolvido. Importe em vez disso o arquivo compilado pelo caminho em disco, relativo à sua própria folha de estilos, o mesmo arquivo que um `<link>` apontaria:

```css
@import "../node_modules/@codenhub/styles/dist/index.css";
```

Os outros entrypoints compilados funcionam do mesmo jeito, como `@codenhub/styles/dist/aesthetics/neobrutalism.css`.

### Executores de testes

Um teste de componente que importa um arquivo que importa `@codenhub/styles` carrega a folha de estilos também. O Vitest não precisa de nada: ele resolve o mapa de `exports` do pacote para o arquivo `.css` e, por padrão, não processa CSS nos testes. O Jest não processa CSS nenhum, e a linha de `moduleNameMapper` de costume para arquivos `.css` não pega esse import, já que `@codenhub/styles` e `@codenhub/styles/aesthetics/pixel` não têm extensão; aí o Jest lê a folha de estilos como JavaScript e falha com `SyntaxError: Invalid or unexpected token`. Mapeie os especificadores do pacote para o mesmo módulo vazio:

```js
// jest.config.js
module.exports = {
  moduleNameMapper: {
    "^@codenhub/styles(/.*)?$": "<rootDir>/styleMock.js",
    "\\.css$": "<rootDir>/styleMock.js",
  },
};
```

```js
// styleMock.js
module.exports = {};
```

## Conferindo se funcionou

Depois do import, renderize um elemento estilizado e confirme que ele pegou os tokens do pacote, e não o padrão do navegador:

```html
<button class="btn primary">Save changes</button>
```

Um botão arredondado preenchido com a cor primária (quase preto numa página clara, quase branco numa escura) significa que a folha de estilos carregou. Texto com o padrão do navegador, sem estilo, na maioria das vezes significa que o especificador do import não foi resolvido — confira na [tabela de entrypoints](../setup.md#todos-os-entrypoints) o especificador exato a importar, e confirme que o ferramental do seu build resolve imports de CSS de pacotes; veja [Configuração → Requisitos](../setup.md#requisitos). Sem ferramenta de build, referencie o arquivo pelo caminho; veja [Sem bundler](./without-a-bundler.md). [Configuração → Quando nada é estilizado](../setup.md#quando-nada-é-estilizado) lista as outras causas comuns.

## A seguir

Quando o botão renderizar, volte para o caminho principal: [Montando uma tela](../concepts.md) adiciona o primeiro card e o primeiro formulário à página de configurações.
