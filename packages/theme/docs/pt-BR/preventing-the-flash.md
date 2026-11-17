---
title: Evitar o flash
description: Aplique o tema antes da primeira pintura com getPrePaintScript(), em apps estáticos e renderizados no servidor, inclusive sob uma Content Security Policy.
order: 5
source: 2f612948b70990d4b0dee1b718bb9d57ec09d484
---

# Evitar o flash

Recarregue a página de [Primeiros passos](getting-started.md) com o tema escuro escolhido e preste atenção: por um instante, ela fica clara. Um usuário que escolheu o escuro à meia-noite leva um clarão branco em toda visita, que é exatamente o que ele escolheu o escuro para evitar. O navegador desenha a página assim que tem o HTML e o CSS, e o seu script, que chama `init()`, roda depois disso. Até lá, `<html>` não tem `data-theme`, então a página mostra as cores padrão.

A solução é um script minúsculo que roda **antes** da primeira pintura. Ele precisa ser escrito direto no `<head>` da página, e não carregado de um arquivo, para que o navegador o rode antes de desenhar qualquer coisa. `getPrePaintScript()` devolve esse script como string. Ele repete exatamente o que `init()` decide, a escolha salva ou, se não houver, a configuração do sistema operacional, e aplica o atributo, as classes, `color-scheme` e os tokens do tema. Quando `init()` roda depois, o tema certo já está lá e nada muda visivelmente. O script é ES5 puro e captura os próprios erros, então um navegador antigo demais para o próprio pacote ainda recebe o tema certo, e uma falha nele nunca impede a página de carregar.

## Compartilhe as opções

O script de pré-pintura e o gerenciador do seu app precisam concordar em todas as opções: se um usa outro `storageKey`, os dois discordam sobre a escolha salva e o flash volta, agora com direito a segunda opinião. Mantenha as opções num único módulo que os dois importam:

```ts
// src/theme-options.ts
import type { ThemeOptions } from "@codenhub/theme";

export const themeOptions = {
  themes: {
    light: { colorScheme: "light" },
    dark: { colorScheme: "dark" },
  },
  storageKey: "my-app-theme",
} satisfies ThemeOptions;
```

```ts
// src/main.ts
import { createTheme } from "@codenhub/theme";

import { themeOptions } from "./theme-options";

export const theme = createTheme(themeOptions).init();
```

`satisfies ThemeOptions` confere o objeto com os tipos das opções e mantém os nomes exatos dos temas, então `theme.set()` continua aceitando só `"light"` e `"dark"`. Anotá-lo como `const themeOptions: ThemeOptions` alargaria os nomes para qualquer string, e o compilador pararia de pegar erros de digitação.

Onde o script é gerado depende de como o seu HTML é produzido.

## Num site estático

Uma single-page app feita com Vite tem um único `index.html`, escrito em tempo de build. `createTheme()` é seguro de chamar fora de um navegador, então um pequeno plugin em `vite.config.ts` pode gerar o script durante o build e colocá-lo no topo do `<head>`:

```ts
// vite.config.ts
import { createTheme } from "@codenhub/theme";
import { defineConfig } from "vite";

import { themeOptions } from "./src/theme-options";

export default defineConfig({
  plugins: [
    {
      name: "theme-pre-paint",
      transformIndexHtml() {
        return [
          {
            tag: "script",
            children: createTheme(themeOptions).getPrePaintScript(),
            injectTo: "head-prepend",
          },
        ];
      },
    },
  ],
});
```

Rode o servidor de desenvolvimento, veja o código-fonte da página, e o script é a primeira coisa no `<head>`: uma linha comprida que ninguém deveria ter que ler, e é por isso que uma função a escreve. Outras ferramentas de build têm um passo equivalente para editar o HTML; o que importa é que a string acabe dentro de um elemento `<script>` no `<head>`, antes das suas folhas de estilo.

## Num app renderizado no servidor

Quando um servidor monta cada página, gere o script lá e escreva-o no HTML que ele envia. Com qualquer servidor Node.js que escreve HTML como string:

```ts
import { createTheme } from "@codenhub/theme";

import { themeOptions } from "./theme-options";

// O script depende só das opções, então monte-o uma vez.
const prePaintScript = createTheme(themeOptions).getPrePaintScript();

function renderPage(body: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <script>${prePaintScript}</script>
    <link rel="stylesheet" href="/styles.css" />
  </head>
  <body>${body}</body>
</html>`;
}
```

O script pode ser colocado dentro de `<script>` como está, com segurança: nomes de temas e valores de tokens não conseguem fechar o elemento nem escapar dele.

Num framework React que renderiza o próprio `<html>`, como o Next.js, coloque-o no layout raiz:

```tsx
// src/app/layout.tsx
import { createTheme } from "@codenhub/theme";

import { themeOptions } from "../theme-options";

const prePaintScript = createTheme(themeOptions).getPrePaintScript();

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: prePaintScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
```

`suppressHydrationWarning` é necessário porque o script altera `<html>` antes de o React carregar: o React encontra um `data-theme`, uma classe e um `style` que o servidor não renderizou, e avisaria que eles não batem. A diferença é intencional. A flag silencia esse aviso só em `<html>`, e não nos filhos dele.

## O que o servidor sabe

Num servidor não existe `localStorage` nem configuração do sistema operacional, então lá o gerenciador não faz nada que precise de navegador: não aplica nada, não salva nada, não escuta nada, e `theme.system` informa `defaultTheme`. Todo método continua seguro de chamar; nenhum lança erro por falta de `window` ou `document`.

Isso significa que o servidor não tem como saber qual tema o usuário escolheu, e o HTML que ele envia não traz nenhum. O script de pré-pintura preenche isso antes da primeira pintura, o que basta para a maioria dos apps. Se o seu servidor precisa renderizar ele mesmo o tema certo, por exemplo porque renderiza markup específico de cada tema, ele tem que descobrir a escolha pela requisição, normalmente por um cookie que o seu app define quando o tema muda. Essa lógica é sua; mantenha os nomes de temas, o atributo e as classes dela alinhados com as mesmas opções.

## Content Security Policy

Se o seu site envia uma Content Security Policy cujo `script-src` não inclui `'unsafe-inline'`, o navegador bloqueia o script inline, o flash volta, e o único sinal é um erro no console. Libere o script de um destes dois jeitos:

- **Nonce:** renderize o elemento como `<script nonce="…">`, usando o nonce por requisição que a sua política já nomeia.
- **Hash:** adicione o `'sha256-…'` do texto do script ao `script-src`. O script é o mesmo para as mesmas opções, então calcule o hash uma vez em tempo de build, por exemplo com `createHash("sha256").update(script).digest("base64")` de `node:crypto`. Insira a string exatamente como ela foi devolvida: qualquer mudança, até espaço em branco em volta dela dentro do elemento, muda o hash.

## O que o script não inclui

Os overrides de tokens de `setTokens()` só existem na página em execução, então o script não tem como conhecê-los; ele aplica os `tokens` dos próprios temas. Os overrides que o seu app salva por conta própria aparecem quando o seu código chama `setTokens()` de novo.

Em seguida, [Frameworks](frameworks.md) mostra como usar o gerenciador dentro de componentes React e com o Tailwind CSS.
