---
title: Visão geral
description: Sistema de ícones zero-runtime para a web — classes de ícone no seu markup viram regras de máscara CSS em tempo de build.
source: 87336853531703f5bd8c0de265204188a574b9f8
---

# Ícones via CSS, sem runtime

Colocar ícones numa página web costuma significar uma de três tarefas chatas: copiar arquivos SVG na mão, encapsular cada glifo num componente de framework só para entregar um ícone ou arrastar uma biblioteca inteira de ícones para dentro do bundle JavaScript — e depois gastar a sexta-feira à tarde caçando avisos de licença MIT, ISC e Apache-2.0. O `@codenhub/icons` existe para pular as três.

Escreva uma classe como `ic-lucide-heart` no seu HTML e o build a transforma em uma regra de máscara CSS. Não há camada de componentes, não há biblioteca de ícones no bundle nem nada para importar por ícone — nada de JavaScript dando sopa só para desenhar um coração. O pacote entrega 15 famílias principais de ícones geradas, somando mais de 36.000 ícones, cada uma levando os avisos de licença que a sua arte exige, além de duas famílias opt-in de marcas: mais de 3.000 logotipos em uma cor e mais de 2.000 coloridos.

## Configuração

### Instalação

```sh
pnpm add @codenhub/icons
```

### Início rápido

Os ícones chegam ao projeto via CSS. O caminho mais curto sem etapa de build são as regras base mais uma folha de estilos de família — zero configuração necessária, desde que você tope carregar a família inteira:

```css
@import "@codenhub/icons";
@import "@codenhub/icons/lucide";
```

```html
<!-- isolado -->
<i class="ic-lucide-heart" aria-hidden="true"></i>

<!-- ao lado de um rótulo -->
<button><i class="ic-lucide-check" aria-hidden="true"></i>Submit</button>
```

Um ícone é um `<i>` carregando uma classe de ícone (ou `.ic` em qualquer elemento, nos métodos baseados em CSS). Tamanho e cor seguem custom properties: defina `--ic-size` e `--ic-color` no ícone ou em qualquer ancestral, ou use as classes de tamanho `ic-xs`–`ic-xl`. Os ícones seguem a cor do texto, exceto os ícones de marca, que chegam na cor da própria marca; veja [Cor](concepts.md#cor).

Cinco métodos de entrega entendem as mesmas classes — CSS puro, Tailwind CSS v4, um plugin do Vite, um plugin do PostCSS e o comando `chi build`. Os plugins e o comando varrem o seu markup e emitem apenas as regras que você usou; as folhas de estilos de família em CSS puro vêm completas e são grandes por construção. Veja [Métodos de entrega](delivery/index.md) para escolher um, e [Frameworks](frameworks/index.md) para a configuração específica de cada framework.

## Requisitos

| Requisito      | Detalhes                                                                                |
| -------------- | --------------------------------------------------------------------------------------- |
| Node.js        | 26 ou mais recente, para os plugins, helpers e `chi build` em tempo de build.           |
| Imports de CSS | O ferramental do projeto precisa resolver imports de CSS de pacotes.                    |
| Navegadores    | Precisa suportar CSS `mask-image`, usado por todos os métodos exceto o modo SVG inline. |
| Tailwind CSS   | Versão 4 ou mais recente, e apenas para os entrypoints `/tw` e `/tailwind`.             |
| Opcional       | `vite` >= 5.0.0 para o plugin do Vite, `postcss` >= 8.0.0 para o plugin do PostCSS.     |

## Ordem de leitura

Leia nesta ordem na primeira vez. Cada página se apoia na anterior e aponta para a próxima:

1. [Conceitos](concepts.md): famílias, como encontrar nomes de ícones, resolução de nomes, cor, espessura do traço, tamanho, movimento e acessibilidade — o modelo compartilhado em que todo método de entrega se apoia.
2. [Métodos de entrega](delivery/index.md): as cinco formas como os ícones chegam ao seu CSS e como escolher a que combina com o seu build.
3. [Frameworks](frameworks/index.md): configuração e particularidades específicas de framework para Astro, Next.js e SvelteKit.
4. [API JavaScript](javascript-api.md): o registro, renderizadores, reprodução em runtime e o adaptador para conjuntos de terceiros, para quando você sai de um build CSS padrão.
5. [Licenciamento](licensing.md): modos de atribuição, níveis de obrigação, notas sobre marcas registradas e o que cada build deve incluir.
6. [Solução de problemas](troubleshooting.md): quando o ícone não renderiza nada, vira um quadrado sólido ou sai na largura errada.

Quando precisar consultar um export ou uma opção específica, a [referência da API](../reference/index.md) (em inglês) lista cada export de `@codenhub/icons`, `/vite`, `/postcss` e `/play`.
