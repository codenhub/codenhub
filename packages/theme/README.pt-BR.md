<!-- source: 0f9e1f73bd89fb68ad8c92108dab49c6b4ce001f -->

# @codenhub/theme

Modo claro e escuro para apps no navegador, sem o código repetitivo de sempre. O `@codenhub/theme` decide qual tema está ativo, lembra a escolha do usuário no `localStorage`, segue a configuração de claro ou escuro do sistema operacional até o usuário escolher um, mantém as abas abertas de acordo e escreve o resultado em `<html>` para o seu CSS estilizar. Ele não tem dependências, funciona com qualquer framework ou sem nenhum, e não traz CSS: as suas folhas de estilo decidem a cara de cada tema.

## Instalação

```sh
npm install @codenhub/theme
pnpm add @codenhub/theme
yarn add @codenhub/theme
bun add @codenhub/theme
```

## Uso

Estilize cada tema pelo nome, que o pacote escreve em `<html>` como `data-theme`:

```css
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

Depois crie o gerenciador uma vez, inicie-o e ligue um botão a ele:

```ts
import { createTheme } from "@codenhub/theme";

const theme = createTheme().init();

document.querySelector("#theme-toggle")?.addEventListener("click", theme.toggle);
```

Sem opções, existem dois temas, `light` e `dark`. `init()` aplica a escolha salva do usuário ou, se não houver, a configuração do sistema operacional, e `toggle()` troca de tema e salva a escolha.

Como esse script roda depois que o navegador pinta a página pela primeira vez, um usuário que escolheu o escuro vê o tema claro por um instante ao carregar, justamente a única coisa que ele pediu para não ver. Apps em produção também colocam inline, no `<head>`, o script de `getPrePaintScript()` para aplicar o tema antes da primeira pintura; [Evitar o flash](docs/pt-BR/preventing-the-flash.md) mostra como.

## Documentação

- [Visão geral da documentação](docs/pt-BR/index.md): como o pacote funciona, e um passo a passo do primeiro tema até o setup de produção.
- [Primeiros passos](docs/pt-BR/getting-started.md): um toggle de claro e escuro funcionando, passo a passo.
- [Evitar o flash](docs/pt-BR/preventing-the-flash.md): aplicar o tema antes da primeira pintura, em apps estáticos e renderizados no servidor.
- [Frameworks](docs/pt-BR/frameworks.md): React e Tailwind CSS.
- [Referência da API](docs/reference/index.md) (em inglês): cada export com a assinatura completa.
- [Changelog](docs/changelog/index.md) (em inglês): as mudanças de cada release.

## Requisitos

- Um navegador para aplicar o tema: Chrome 93, Firefox 92, Safari 15.4 ou mais recente, já que o pacote chama `Object.hasOwn`. Para navegadores mais antigos, transpile as dependências e adicione polyfills no seu build. Num servidor, o gerenciador pula sem erro tudo o que precisa de navegador e informa o tema padrão.
- O seu próprio CSS para cada tema. O pacote escreve em `<html>` o nome do tema, uma classe opcional, `color-scheme` e, opcionalmente, CSS custom properties; ele não traz estilos.
- TypeScript 5.4 ou mais recente, se você usa TypeScript, por causa do `NoInfer` de que os tipos dependem.

## Observações

- `createTheme()` valida as opções na hora e lança um `Error` que nomeia o problema, como um `defaultTheme` que não é um dos seus temas.
- Quando o navegador bloqueia o `localStorage`, o pacote registra cada tipo de falha (leitura, escrita, remoção) uma única vez com `console.error` e continua funcionando; uma escolha que ele não conseguiu salvar dura até a página ser fechada.

## Licença

Este projeto é licenciado sob a licença [Apache-2.0](LICENSE).
