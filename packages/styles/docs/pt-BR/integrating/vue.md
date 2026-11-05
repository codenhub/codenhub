---
title: Vue
description: Como carregar a folha de estilos numa aplicação Vue / Vite.
order: 3
source: 9cc23f66518b0aa3ce886602f39d05820b2b8bcf
---

# Vue

O Vue não impõe restrição sobre de onde o CSS é importado, mas importá-lo uma vez, a partir do arquivo de entrada da aplicação, evita que o reset e os tokens carreguem mais de uma vez e garante que eles estejam no lugar antes de qualquer componente renderizar.

## Importe a folha de estilos

```ts
// main.ts
import "@codenhub/styles";
import { createApp } from "vue";
import App from "./App.vue";

createApp(App).mount("#app");
```

Usa Tailwind CSS v4? Importe `@codenhub/styles/tw` a partir de um arquivo CSS de entrada em vez do `main.ts`, usando o plugin `@tailwindcss/vite` — veja [Tailwind CSS v4](./tailwind.md).

## Force um tema

Aplique `.dark` ou `.light` no elemento raiz para forçar um tema em vez de seguir a preferência do sistema; veja [Temas → Claro e escuro](../usage/theming.md#claro-e-escuro).

## A seguir

Volte para o caminho principal: [Montando uma tela](../concepts.md) adiciona o primeiro card e o primeiro formulário à página de configurações. [Configuração → Todos os entrypoints](../setup.md#todos-os-entrypoints) lista todas as outras folhas de estilos que você pode importar.
