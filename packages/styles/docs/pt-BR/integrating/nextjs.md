---
title: Next.js
description: Como carregar a folha de estilos numa aplicação Next.js / React.
order: 2
source: fd8dc12652c64995638c5b902a1ca35787f9a37c
---

# Next.js

O Next.js tem duas arquiteturas de roteamento, e elas tratam o CSS global de formas diferentes:

- **App Router** (um diretório `app/`): o CSS global — incluindo a folha de estilos de um pacote externo como este — pode ser importado de qualquer layout, página ou componente dentro de `app/`. Importar a partir do layout raiz é só uma recomendação, para uma ordem de CSS previsível entre as rotas; o Next.js não impõe isso e nenhum erro acontece se você importar em outro lugar.
- **Pages Router** (um diretório `pages/`, sem `app/`): o CSS global fica restrito a `pages/_app.tsx`. Importar de qualquer outro lugar faz o build falhar — quem impõe isso é o próprio Next.js, não este pacote; veja [Solução de problemas](#solução-de-problemas).
- **Os dois diretórios presentes** (no meio de uma migração): importe a folha de estilos nos dois arquivos raiz. Os dois roteadores servem as suas próprias rotas de forma independente, então uma rota em `pages/` nunca vê uma folha de estilos importada só em `app/layout.tsx`, e vice-versa.

## Importe a folha de estilos

Adicione o import ao arquivo raiz do seu roteador:

**App Router**

```tsx
// app/layout.tsx
import "@codenhub/styles";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

**Pages Router**

```tsx
// pages/_app.tsx
import "@codenhub/styles";
import type { AppProps } from "next/app";

export default function App({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />;
}
```

Usa Tailwind CSS v4? `@import "@codenhub/styles/tw"` é uma diretiva de CSS, então o lugar dele é num arquivo CSS, não num import solto em `layout.tsx`/`_app.tsx` — adicione-o (com `@source`, se precisar; `/tw` já importa o próprio Tailwind, então deixe de fora o seu `@import "tailwindcss"`) ao seu arquivo CSS global e, em vez disso, importe esse arquivo a partir do mesmo arquivo raiz mostrado acima. Veja [Tailwind CSS v4](./tailwind.md).

## Force um tema

Aplique `.dark` ou `.light` no `<html>` para forçar um tema em vez de seguir a preferência do sistema; veja [Temas → Claro e escuro](../usage/theming.md#claro-e-escuro).

```tsx
<html lang="en" className="dark">
```

## Solução de problemas

**O build com Pages Router falha com "Global CSS cannot be imported from files other than your Custom `<App>`"**

- **O que aconteceu:** o Next.js rejeitou uma instrução `import` de CSS global fora de `pages/_app.tsx`. Essa restrição é específica do Pages Router — quem a impõe é o próprio Next.js, não este pacote, e ela vale para qualquer import de CSS global, não especificamente para o `@codenhub/styles`. Ela não vale para o App Router, em que o mesmo import funciona a partir de qualquer layout, página ou componente.
- **Por quê:** o Pages Router não tem uma fronteira de CSS por rota como o App Router tem, então o Next.js exige um único arquivo previsível para as folhas de estilos globais, para evitar conflitos de ordem entre as páginas.
- **Como resolver:** mova a linha `import "@codenhub/styles"` para `pages/_app.tsx` e remova-a de onde ela estiver agora.

## A seguir

Volte para o caminho principal: [Montando uma tela](../concepts.md) adiciona o primeiro card e o primeiro formulário à página de configurações. [Configuração → Todos os entrypoints](../setup.md#todos-os-entrypoints) lista todas as outras folhas de estilos que você pode importar.
