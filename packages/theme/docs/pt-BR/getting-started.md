---
title: Primeiros passos
description: Instale o pacote e monte um toggle de claro e escuro que lembra a escolha do usuário.
order: 1
source: eca118a71bac8067e11fe04becde446f68807303
---

# Primeiros passos

Esta página monta a menor coisa útil possível: uma página com um tema claro e um escuro, e um botão que alterna entre eles. São cinco passos, e no fim o botão já lembra a escolha do usuário e segue o sistema operacional dele. Ela parte de um projeto com um bundler, como o [Vite](https://vite.dev/), que resolve instruções `import` a partir de `node_modules`.

## 1. Instale o pacote

Instale com o gerenciador de pacotes do seu projeto:

```sh
npm install @codenhub/theme
```

```sh
pnpm add @codenhub/theme
```

```sh
yarn add @codenhub/theme
```

```sh
bun add @codenhub/theme
```

## 2. Escreva o CSS de cada tema

O pacote escreve o nome do tema em `<html>`, como `data-theme="light"` ou `data-theme="dark"`, junto com a propriedade `color-scheme` e, por padrão, uma classe `theme-<name>` correspondente. A sua folha de estilos dá a cara de cada nome. CSS custom properties deixam isso curto: defina as cores uma vez por tema e use-as em todo o resto.

```css
/* styles.css */
:root,
[data-theme="light"] {
  --background: #ffffff;
  --text: #171717;
}

[data-theme="dark"] {
  --background: #171717;
  --text: #f5f5f5;
}

body {
  background: var(--background);
  color: var(--text);
}
```

`:root` dá à página as cores claras antes de qualquer tema ser aplicado, então ela nunca é renderizada sem cor nenhuma.

## 3. Adicione um botão

Qualquer elemento serve. Este tem um `id` para o script conseguir encontrá-lo:

```html
<button id="theme-toggle" type="button">Alternar tema</button>
```

O texto dele é o nome acessível. Se mais tarde você trocar o texto por um ícone de sol ou de lua, como todo app acaba fazendo, adicione um `aria-label` para que os leitores de tela continuem ouvindo algo mais útil do que "botão".

## 4. Crie o gerenciador de temas

```ts
// main.ts
import { createTheme } from "@codenhub/theme";

import "./styles.css";

const theme = createTheme().init();

document.querySelector("#theme-toggle")?.addEventListener("click", theme.toggle);
```

Três coisas acontecem aqui:

- `createTheme()` cria um **gerenciador de temas**, o objeto que é dono do tema ativo. Sem opções, ele conhece dois temas, `light` e `dark`. Criá-lo ainda não muda nada na página.
- `.init()` o inicia. Ele escolhe o tema a mostrar, a escolha salva do usuário ou, se não houver, a configuração do sistema operacional, aplica esse tema em `<html>` e começa a escutar mudanças do sistema. Ele devolve o mesmo gerenciador, então as duas chamadas se encadeiam.
- `theme.toggle` muda para o outro tema e salva a escolha. Todo método do gerenciador pode ser passado sozinho como callback, como aqui, sem embrulhá-lo numa arrow function. Nenhum `this` se perdeu no caminho.

O tipo do gerenciador é exportado como `Theme`, para quando você precisar nomeá-lo, como numa função que recebe o gerenciador como parâmetro.

## 5. Teste

Abra a página e clique no botão: as cores trocam. Agora recarregue a página. O tema que você escolheu continua lá, porque `toggle()` o salvou no `localStorage`.

Para ver a parte do sistema operacional, apague a escolha salva rodando isto no console do navegador:

```js
localStorage.removeItem("app-theme-preference");
```

Recarregue e depois mude o seu sistema entre o modo claro e o escuro. Sem escolha salva, a página acompanha, sem precisar recarregar.

## O que você tem e o que vem depois

Agora você tem uma troca de tema funcionando. Ainda faltam duas coisas para um app em produção:

- **Um flash ao carregar.** O seu script roda depois que o navegador já pintou a página uma vez, então um usuário que escolheu o escuro leva um flash rápido de claro antes, em toda visita. [Evitar o flash](preventing-the-flash.md) resolve isso com um pequeno script inline.
- **Limpeza**, se o gerenciador vive dentro de um componente que pode ser desmontado. Chame `theme.destroy()` na limpeza dele para parar os listeners do gerenciador. Um gerenciador criado uma vez para a página inteira, como acima, nunca precisa disso. [Frameworks](frameworks.md#limpeza) mostra onde isso entra no React.

Em seguida, [Definir temas](themes.md) transforma o toggle numa tela de configurações com temas seus.
