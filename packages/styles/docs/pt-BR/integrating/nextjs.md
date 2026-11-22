---
title: Next.js
description: Como carregar a folha de estilos numa aplicação Next.js / React.
order: 2
source: b229c0204095ccf30396f20e8b7f8033f7004285
---

# Next.js

O Next.js tem duas arquiteturas de roteamento, e elas tratam o CSS global de formas diferentes:

- **App Router** (um diretório `app/`): o CSS global — incluindo a folha de estilos de um pacote externo como este — pode ser importado de qualquer layout, página ou componente dentro de `app/`. Importar a partir do layout raiz é só uma recomendação, para uma ordem de CSS previsível entre as rotas; o Next.js não impõe isso e nenhum erro acontece se você importar em outro lugar.
- **Pages Router** (um diretório `pages/`, sem `app/`): a folha de estilos de um pacote, como esta, também pode ser importada de qualquer página ou componente. Os restritos são os seus próprios arquivos `.css` globais: eles só podem ser importados de `pages/_app.tsx`, e importar um em qualquer outro lugar faz o build falhar. Isso importa para o `/tw`, que fica num arquivo CSS seu. Quem impõe isso é o próprio Next.js, não este pacote; veja [Solução de problemas](#solução-de-problemas). Importe a folha de estilos em `pages/_app.tsx` mesmo assim, pela mesma ordem previsível.
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

Aplique `.theme-dark` ou `.theme-light` (ou `data-theme="dark"` ou `"light"`) no `<html>` para forçar um tema em vez de seguir a preferência do sistema; veja [Temas → Claro e escuro](../usage/theming.md#claro-e-escuro).

```tsx
<html lang="en" className="dark">
```

No Pages Router, quem renderiza o `<html>` é o `pages/_document.tsx`, então coloque a classe no componente `<Html>` dele:

```tsx
<Html lang="en" className="dark">
```

## Solução de problemas

**O build com Pages Router falha com "Global CSS cannot be imported from files other than your Custom `<App>`"**

- **O que aconteceu:** o Next.js rejeitou um `import` de um dos seus próprios arquivos `.css` globais fora de `pages/_app.tsx`, como o arquivo que contém `@import "@codenhub/styles/tw"`. Essa restrição é específica do Pages Router, e quem a impõe é o próprio Next.js, não este pacote. Ela não cobre uma folha de estilos importada direto de um pacote, então `import "@codenhub/styles"` compila a partir de qualquer página ou componente, e ela não vale para o App Router. Verificado com o Next.js 16.4, com Turbopack e com webpack.
- **Por quê:** o Pages Router não tem uma fronteira de CSS por rota como o App Router tem, então o Next.js exige um único arquivo previsível para as suas folhas de estilos globais, para evitar conflitos de ordem entre as páginas.
- **Como resolver:** mova o import do seu arquivo CSS para `pages/_app.tsx` e remova-o de onde ele estiver agora.

## A seguir

Volte para o caminho principal: [Montando uma tela](../concepts.md) adiciona o primeiro card e o primeiro formulário à página de configurações. [Configuração → Todos os entrypoints](../setup.md#todos-os-entrypoints) lista todas as outras folhas de estilos que você pode importar.
