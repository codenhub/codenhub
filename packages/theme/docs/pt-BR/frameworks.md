---
title: Frameworks
description: Use o gerenciador no React com useSyncExternalStore, com renderização no servidor e com a variante dark: do Tailwind CSS.
order: 6
source: 9bfbf195365453139048b73bf34c9c4c61bd7687
---

# Frameworks

O pacote não tem adaptador para framework porque não precisa de um: um gerenciador é um objeto comum, e os métodos dele podem ser passados para qualquer lugar como callbacks. É um pacote a menos para correr atrás da próxima major do seu framework. Esta página mostra os padrões para React e para Tailwind CSS. As mesmas ideias valem para outros frameworks: crie um gerenciador para a página, inicie-o uma vez no navegador e faça subscribe nele onde quer que a UI mostre o tema.

## React

### Um gerenciador para o app inteiro

Crie o gerenciador uma vez, num módulo próprio, e importe-o onde precisar. Não o crie dentro de um componente: cada render criaria um novo, cada um com os próprios listeners, e você descobriria isso pelo profiler de memória.

```ts
// src/theme.ts
import { createTheme } from "@codenhub/theme";

import { themeOptions } from "./theme-options";

export const theme = createTheme(themeOptions).init();
```

Num app que só roda no navegador, como um feito com Vite, chamar `init()` ali mesmo não tem problema. Apps renderizados no servidor o iniciam de outro jeito; veja [Com renderização no servidor](#com-renderização-no-servidor) abaixo.

### Mostre o tema ativo num componente

O React só renderiza um componente de novo quando os dados dele mudam se ele souber da mudança. `useSyncExternalStore` conecta o React a uma fonte externa como o gerenciador: `theme.subscribe` diz ao React quando ler de novo, e `theme.get` é o que ele lê. `get()` devolve o mesmo objeto `ActiveTheme` até o tema mudar, que é exatamente o que o React espera. Um getter que devolvesse um objeto novo a cada vez mandaria o React para um loop de re-render, e o React avisaria você disso em vermelho.

```tsx
import { useSyncExternalStore } from "react";

import { theme } from "./theme";

export function useActiveTheme() {
  return useSyncExternalStore(theme.subscribe, theme.get);
}

export function ThemeToggle() {
  const active = useActiveTheme();
  return (
    <button type="button" onClick={theme.toggle}>
      {active.colorScheme === "dark" ? "Mudar para o claro" : "Mudar para o escuro"}
    </button>
  );
}
```

### Com renderização no servidor

Num app renderizado no servidor, como Next.js ou Remix, o mesmo módulo também roda no servidor, onde não há nada para iniciar, e o React renderiza a página pela primeira vez no navegador fazendo a **hidratação** do HTML do servidor: ele espera que o primeiro render no navegador bata com o que o servidor renderizou.

Duas mudanças resolvem isso. Inicie o gerenciador a partir de um effect, que só roda no navegador, e dê ao `useSyncExternalStore` um terceiro argumento, `getServerSnapshot`, que devolve o tema com que o servidor renderizou:

```tsx
// src/theme.ts
import { createTheme } from "@codenhub/theme";
import { useSyncExternalStore } from "react";

import { themeOptions } from "./theme-options";

export const theme = createTheme(themeOptions);

// Tirado antes de init(), então é o tema padrão, aquele com que o servidor renderiza.
const serverSnapshot = theme.get();

export function useActiveTheme() {
  return useSyncExternalStore(theme.subscribe, theme.get, () => serverSnapshot);
}
```

```tsx
// No seu componente cliente raiz:
useEffect(() => {
  theme.init();
}, []);
```

A hidratação então renderiza o tema padrão, batendo com o servidor, e o componente passa para o tema do usuário logo depois que `init()` roda. A página em si nunca mostra as cores erradas: o [script de pré-pintura](preventing-the-flash.md) já aplicou o tema certo em `<html>`, e só os componentes que leem `useActiveTheme()` veem o padrão por um instante. Chamar `init()` mais de uma vez não faz nada depois da primeira chamada, então a execução dupla de effects que o React faz em desenvolvimento é inofensiva.

Se, em vez disso, o seu servidor resolve o tema por requisição, como a partir de um cookie, ele renderiza com esse tema, então `getServerSnapshot` precisa devolver esse mesmo tema, passado ao navegador junto com a página.

### Limpeza

Um gerenciador criado uma vez para a página inteira vive tanto quanto a página e não precisa de limpeza: o navegador limpa tudo quando a aba fecha. Um gerenciador que pertence a algo de vida mais curta, como um componente que monta e desmonta ou um teste, precisa ser parado com `destroy()`:

```tsx
useEffect(() => {
  const preview = createTheme(previewOptions).init();
  return () => preview.destroy();
}, []);
```

`destroy()` para de escutar o sistema operacional e as outras abas, remove todos os subscribers e descarta os overrides de tokens. Ele deixa `<html>` e a escolha salva como estão, então a página não muda quando o componente desmonta. Passe `{ revertDom: true }` para também remover o atributo, as classes, `color-scheme` e as propriedades de tokens que o gerenciador escreveu, sem deixar rastro. Um gerenciador destruído pode ser iniciado de novo com `init()`.

## Tailwind CSS

A variante `dark:` do Tailwind, como em `class="bg-white dark:bg-black"`, aplica os estilos dela quando decide que a página está escura. Defina `darkClass: true`, e o pacote adiciona uma classe `dark` em `<html>` sempre que o `colorScheme` do tema ativo é `"dark"`:

```ts
const theme = createTheme({ darkClass: true }).init();
```

Depois diga ao Tailwind para procurar essa classe em vez da configuração do sistema operacional, que ele usa por padrão. No Tailwind CSS v4, adicione isto ao seu arquivo CSS principal:

```css
@import "tailwindcss";

@custom-variant dark (&:where(.dark, .dark *));
```

No Tailwind CSS v3, configure em `tailwind.config.js`:

```js
export default {
  darkMode: "class",
  // …o resto da sua configuração
};
```

Como a classe `dark` segue o `colorScheme`, e não o nome de um tema, todo tema escuro que você define, como um tema `dim`, também ganha os estilos `dark:`. Uma variante `dark:` cobre todos os temas escuros, então um tema escuro novo não significa mais uma passada por todos os componentes. `darkClass` funciona junto com `className`, então `<html>` pode ter tanto `dark` quanto `theme-dim`, para o CSS específico de que só o tema `dim` precisa.

Em seguida, [Solução de problemas](troubleshooting.md) reúne os problemas mais comuns.
