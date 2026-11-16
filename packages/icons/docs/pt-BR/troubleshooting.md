---
title: Solução de problemas
description: Por que um ícone não renderiza nada, vira um quadrado sólido, sai na largura errada ou perde seu aviso de licença, e como resolver cada caso.
order: 6
source: 37b8d01350b52510a4e034aa5a9fed3daffdb633
---

# Solução de problemas

A maioria das falhas com ícones é silenciosa: o build passa e o ícone ausente ou quebrado só aparece no navegador. Vá direto para o sintoma que bate com o que você está vendo.

## O ícone não renderiza nada

Nenhuma regra base casou com o elemento, então ele fica sem tamanho — ou, no modo SVG inline, nenhum SVG o substituiu ou uma colisão de ID o escondeu.

- **Sem regras base.** CSS puro e um `@plugin` declarado manualmente no Tailwind precisam de `@import "@codenhub/icons";` em uma folha de estilos. `@codenhub/icons/tw`, a folha de estilos do plugin do Vite e o plugin do PostCSS já incluem as regras base (no PostCSS, a menos que `injectBase` seja `false`). O modo SVG inline renderiza sem regras base, embora adicionar `@import "@codenhub/icons"` forneça `--ic-size`, as classes de tamanho e `--ic-color` para ícones sem cor própria.
- **O elemento não é um `<i>` e não tem `.ic`.** As regras base casam com `<i class="ic-…">`, ou com qualquer elemento que também carregue `.ic`. Um `<span class="ic-lucide-heart">` sem `.ic` não casa com nenhuma delas.
- **Um logotipo inline cuja primeira cópia está oculta.** No modo SVG inline, duas cópias do mesmo ícone de `logos` compartilham ids de gradiente, máscara e clip-path. Se a primeira cópia estiver dentro de um elemento com `display: none`, toda cópia posterior renderiza em branco (observado no Chromium). Coloque uma cópia visível antes da oculta, esconda com `visibility: hidden` ou use o modo CSS; veja [Vite § Modo SVG inline](delivery/vite.md#modo-svg-inline).

## O ícone renderiza como um quadrado sólido

As regras base definiram o tamanho e a cor do elemento, então ele aparece como uma caixa — mas nenhuma regra de máscara casou com ele, deixando a caixa inteira pintada na cor do ícone.

- **O nome não existe na família.** Os nomes são os da origem: Material Symbols escreve `check_circle`, Lucide escreve `circle-check`, e Lucide não tem `close` (é `x`). Confira o nome exato na família; veja [Encontrando o nome de um ícone](concepts.md#encontrando-o-nome-de-um-ícone).
- **Um nome sem qualificação sem família padrão.** `ic-heart` só resolve onde você definiu um padrão: `defaultPrefix` nos plugins do Vite e do PostCSS, `default:` no plugin do Tailwind ou a última folha de estilos de família principal importada em CSS puro. Escreva o nome qualificado `ic-lucide-heart` ou configure um padrão. Veja [Nomes](concepts.md#nomes).
- **A família não está carregada.** Os plugins do Vite e do PostCSS resolvem apenas as famílias listadas em `families`.
- **Um ícone de marca via `@codenhub/icons/tw`.** `/tw` nunca resolve `simple-icons` nem `logos`. Declare o plugin com `families` nomeando a família de marcas; veja [Tailwind CSS](delivery/tailwind.md#configurando-o-plugin).
- **A classe é montada em tempo de execução.** Os plugins de build só encontram uma classe quando ela está escrita por extenso: `` `ic-${name}` `` é invisível em tempo de build. Escreva cada classe literalmente ou carregue o ícone como um [módulo](delivery/vite.md#um-módulo-por-ícone).
- **A classe está num arquivo que o plugin não varre.** O plugin do Vite varre automaticamente apenas os tipos de módulo que o Vite transforma; `.astro`, `.md` e `.mdx` exigem globs em `content`. O plugin do PostCSS varre apenas a própria folha de estilos e `content`. Veja [Vite § Varredura](delivery/vite.md#varredura) e [PostCSS § Varredura](delivery/postcss.md#varredura).
- **Astro, apenas no build de produção.** O `astro build` de produção pula o hook de HTML do Vite, então importe `virtual:icons.css` explicitamente a partir de um layout compartilhado. Veja [Astro § Plugin do Vite](frameworks/astro.md#plugin-do-vite).
- **Apenas em produção, com Content Security Policy.** Versões até a 0.2.1 colocavam a folha de estilos gerada inline numa tag `<style>`, que uma política sem `'unsafe-inline'` bloqueia. Atualize para depois da 0.2.1 para que os builds vinculem um asset de folha de estilos em vez disso; veja [Vite § Varredura](delivery/vite.md#varredura).
- **Modo SVG inline, num elemento que ele não reescreve.** `mode: "svg"` substitui tags `<i class="ic-…">` e não emite regras de máscara, então `.ic` em qualquer outro elemento não tem regra por trás. O build emite um aviso nomeando a classe e o arquivo. No Astro, `.md` e `.mdx` não são reescritos e nada avisa; envolva o ícone num componente para `.mdx`, ou use o modo CSS para `.md`. Veja [Vite § Modo SVG inline](delivery/vite.md#modo-svg-inline) e [Astro § Modo SVG inline](frameworks/astro.md#modo-svg-inline).

## A espessura do traço não muda

- **CSS puro.** Folhas de estilos de família trazem cada ícone na sua espessura original; `ic-lucide-heart/1.5` precisa de Tailwind, Vite ou PostCSS. Veja [Espessura do traço](concepts.md#espessura-do-traço).
- **Uma família desenhada com preenchimentos.** Apenas `lucide` e `line-md` são baseadas em traço. Todas as outras famílias empacotadas ignoram o modificador.

## A cor não muda

Defina `--ic-color` no ícone ou em um ancestral, ou `--<prefix>-color` com um prefixo de classe personalizado. O `color` comum alcança apenas ícones sem cor própria: um ícone de marca mantém a cor da marca até que `--ic-color` a sobrescreva. Definir `background-color` no próprio elemento do ícone substitui a pintura dele, porque ícones de máscara CSS pintam através do seu `background`. No modo SVG inline sob uma Content Security Policy que bloqueia atributos `style`, um ícone de marca mantém sua cor de marca e ignora `--ic-color`. Veja [Cor](concepts.md#cor).

## Um ícone de marca fica invisível no modo escuro

A cor da marca é quase preta, como acontece com GitHub, X e Vercel. Defina `--ic-color` com uma cor clara nessas classes dentro do seu tema escuro. Veja [Cor](concepts.md#cor).

## O aviso de licença está faltando na saída

Um minificador configurado com `legalComments: "none"` remove comentários `/*! … */`. Use `attribution: "file"` com o Vite para emitir `icons-attribution.txt`, ou configure o seu minificador para manter comentários legais. Veja [Licenciamento](licensing.md).

## A seguir

Volte para a [Visão geral](index.md) para a ordem de leitura completa, ou consulte exports e opções individuais na [referência da API](../reference/index.md) (em inglês).
