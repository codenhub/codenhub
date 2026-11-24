---
title: Svelte
description: Como carregar a folha de estilos numa aplicação Svelte / SvelteKit.
order: 4
source: 4b0559abded7cb44bf7bb891935ee14a4c5a7535
---

# Svelte

O Svelte e o SvelteKit deixam você importar CSS de qualquer componente, mas o reset e os tokens do pacote devem carregar uma vez, antes de qualquer componente renderizar. Esta página mostra onde fica esse único import no SvelteKit e numa aplicação Svelte simples.

## Importe a folha de estilos

**SvelteKit** — importe a partir do layout raiz, para carregar uma vez em todas as rotas:

```svelte
<!-- src/routes/+layout.svelte -->
<script>
  import "@codenhub/styles";
  let { children } = $props();
</script>

{@render children()}
```

**Svelte simples + Vite** — importe a partir do arquivo de entrada:

```ts
// main.ts
import "@codenhub/styles";
import { mount } from "svelte";
import App from "./App.svelte";

mount(App, { target: document.getElementById("app")! });
```

Usa Tailwind CSS v4? Em vez disso, importe `@codenhub/styles/tw` a partir do arquivo CSS de entrada da aplicação — veja [Tailwind CSS v4](./tailwind.md).

## Force um tema

Aplique `data-theme="light"` ou `data-theme="dark"` no `<html>` (edite `src/app.html` no SvelteKit) para forçar um tema em vez de seguir a preferência do sistema; veja [Temas → Claro e escuro](../usage/theming.md#claro-e-escuro).

## A seguir

Volte para o caminho principal: [Montando uma tela](../concepts.md) adiciona o primeiro card e o primeiro formulário à página de configurações. [Configuração → Todos os entrypoints](../setup.md#todos-os-entrypoints) lista todas as outras folhas de estilos que você pode importar.
