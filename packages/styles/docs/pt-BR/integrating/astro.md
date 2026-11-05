---
title: Astro
description: Como carregar a folha de estilos numa aplicação Astro.
order: 5
source: 4f93b3a6e0d1cd24a0b7d0eb6050cc98690cd598
---

# Astro

O Astro renderiza componentes de forma estática por padrão, mas o import de uma folha de estilos global ainda só precisa acontecer uma vez — a partir de um layout compartilhado, não de páginas ou islands individuais.

## Importe a folha de estilos

```astro
---
// src/layouts/Layout.astro
import "@codenhub/styles";
---

<html lang="en">
  <body>
    <slot />
  </body>
</html>
```

Toda página que usa esse layout carrega a folha de estilos uma vez. Usa Tailwind CSS v4? Em vez disso, importe `@codenhub/styles/tw` pela integração de Tailwind do Astro — veja [Tailwind CSS v4](./tailwind.md), incluindo quando um `@source` explícito é realmente necessário.

## Force um tema

Aplique `.dark` ou `.light` no `<html>` para forçar um tema em vez de seguir a preferência do sistema; veja [Temas → Claro e escuro](../usage/theming.md#claro-e-escuro).

## A seguir

Volte para o caminho principal: [Montando uma tela](../concepts.md) adiciona o primeiro card e o primeiro formulário à página de configurações. [Configuração → Todos os entrypoints](../setup.md#todos-os-entrypoints) lista todas as outras folhas de estilos que você pode importar.
