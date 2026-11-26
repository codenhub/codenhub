---
title: Vue
description: Como carregar a folha de estilos numa aplicação Vue / Vite.
order: 3
source: 7d4ebf5802e552d16b046796756c807ee9baa159
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

Não usa Tailwind? O import acima entrega todas as classes. Adicione o [plugin de Vite](./vite.md) do pacote ao `vite.config.ts` e o mesmo import entrega só as classes que os seus arquivos `.vue` e o resto do projeto usam.

## Force um tema

Aplique `data-theme="light"` ou `data-theme="dark"` no `<html>` do `index.html` para forçar um tema em vez de seguir a preferência do sistema; veja [Temas → Claro e escuro](../usage/theming.md#claro-e-escuro).

## A seguir

Volte para o caminho principal: [Montando uma tela](../concepts.md) adiciona o primeiro card e o primeiro formulário à página de configurações. [Configuração → Todos os entrypoints](../setup.md#todos-os-entrypoints) lista todas as outras folhas de estilos que você pode importar.
