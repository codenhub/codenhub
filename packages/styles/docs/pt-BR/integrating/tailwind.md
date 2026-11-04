---
title: Tailwind CSS v4
description: Como usar os entrypoints de código-fonte /tw num projeto com Tailwind CSS v4.
order: 1
source: 7988dc023c91950991a720ea7da7edfe3378d4d7
---

# Tailwind CSS v4

Um projeto que já roda Tailwind CSS v4 pode compilar o código-fonte deste pacote em vez de carregar a saída compilada. Os utilitários da sua aplicação e as classes do pacote saem então de um único build, compartilham um único tema e usam uma única variante `dark:`. Esta página trata do import, das estéticas, dos entrypoints específicos e dos problemas de build que você provavelmente vai encontrar.

## Por que código-fonte em vez de compilado

Os entrypoints `/tw` publicam uma cópia do código-fonte não compilado de `dist/tw`; o seu próprio build do Tailwind o compila junto com a sua aplicação, então as diretivas `@theme`, `@utility` e `@apply` dele são resolvidas junto com as suas. Os entrypoints compilados (`@codenhub/styles`) continuam funcionando num projeto com Tailwind, mas aí dois pipelines de CSS separados rodam lado a lado em vez de um — use `/tw`, a menos que um motivo específico o descarte.

## Importe o entrypoint de código-fonte

```css
@import "@codenhub/styles/tw";

@source "./src";
```

O `/tw` importa o próprio Tailwind, então ele substitui o seu `@import "tailwindcss"` em vez de se somar a ele: com os dois, o Preflight do Tailwind é emitido duas vezes. Todos os outros entrypoints `/tw/*` esperam que o seu import venha antes; veja [Usando um entrypoint específico](#usando-um-entrypoint-específico).

O Tailwind CSS v4 varre o seu projeto automaticamente — a maioria dos projetos não precisa de nada além do import acima. Os caminhos de `@source` são resolvidos a partir do arquivo CSS que os declara, não da raiz do projeto, então `./src` aqui significa "o `src/` ao lado desta folha de estilos"; ajuste para onde a sua folha de estilos global realmente está. Adicione `@source` só para markup que a varredura automática do Tailwind não alcança sozinha: um caminho excluído por padrão (listado no `.gitignore`, ou dentro de `node_modules` — uma biblioteca de componentes externa, por exemplo) ou, num monorepo, um caminho fora da árvore de diretórios deste arquivo. Aponte para o markup da sua aplicação, não para este pacote — o `/tw` já entrega a definição de todas as classes que publica, então varrê-lo também só deixa o build mais lento, sem acrescentar classes.

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

- **O que aconteceu:** `<button class="btn primary">` é estilizado, mas um botão cuja intenção vem de uma variável, como `` `btn ${tone}` ``, não é.
- **Por quê:** o Tailwind só gera uma classe quando encontra o nome completo nos seus arquivos de código. As classes de componente e de eixo do próprio pacote são sempre geradas, mas os seus próprios utilitários não, e um nome montado a partir de strings é invisível para a varredura.
- **Como resolver:** escreva os nomes de classe completos no seu código, por exemplo num objeto de consulta (`{ save: "btn primary", remove: "btn destructive" }`), ou liste os nomes que o seu código pode produzir com `@source inline("...")` na sua folha de estilos.

Todo entrypoint `/tw` exige Tailwind CSS 4.3.2 ou mais recente, abaixo da 5: o código-fonte usa `@source not` e `@source inline()`, que chegaram na 4.1, e é testado com a 4.3.2.

## A variante `dark:`

Os entrypoints `/tw` definem a sua própria variante `dark:`, então os seus utilitários trocam de tema com os mesmos seletores de claro e escuro que os tokens do pacote usam. Ela tem uma diferença conhecida em relação aos tokens quando há temas aninhados; veja [Temas → A variante dark:](../usage/theming.md#a-variante-dark).

## A seguir

Volte para o caminho principal: [Montando uma tela](../concepts.md) adiciona o primeiro card e o primeiro formulário à página de configurações. Tudo o que ela mostra funciona do mesmo jeito com `/tw`.
