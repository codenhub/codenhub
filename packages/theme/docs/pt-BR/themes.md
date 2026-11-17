---
title: Definir temas
description: Adicione os seus próprios temas, escolha o que a configuração do sistema e o toggle selecionam, leia o estado atual e veja cada opção com o seu padrão.
order: 2
source: 7c3dd6f6d63d11be081eb7298e1beaa4d366674a
---

# Definir temas

[Primeiros passos](getting-started.md) usou os dois temas embutidos. Apps de verdade costumam querer mais: um escuro mais suave para quem vara a madrugada, um de alto contraste, um tema da marca que muda de nome duas vezes antes do lançamento. Esta página adiciona esses temas e monta um menu de temas para uma tela de configurações, com uma opção "Automático" que segue o sistema operacional. No caminho, ela explica como o toggle e a configuração do sistema escolhem entre os temas, e como ler o que está ativo.

## Descreva seus temas

Passe `themes` para `createTheme()`, com os nomes dos temas como chaves:

```ts
import { createTheme } from "@codenhub/theme";

const theme = createTheme({
  themes: {
    light: { colorScheme: "light" },
    dark: { colorScheme: "dark" },
    dim: { colorScheme: "dark" },
  },
}).init();
```

Cada nome é o que vai parar em `data-theme`, então o CSS de Primeiros passos ganha mais um bloco:

```css
[data-theme="dim"] {
  --background: #2b2b33;
  --text: #e4e4e7;
}
```

Cada entrada é uma `ThemeDefinition`, o tipo exportado para um tema. `colorScheme` diz se um tema é claro ou escuro. Ele é obrigatório e faz três trabalhos: o pacote o escreve em `color-scheme` para os controles do navegador combinarem, o toggle o usa para achar o tema oposto, e a classe `dark` do Tailwind o segue.

`themes` substitui a lista embutida em vez de somar a ela. Mantenha temas chamados `light` e `dark`, como acima, ou diga ao pacote quais temas usar no lugar deles, como as próximas seções mostram.

## Mude para um tema específico

`set()` aplica um tema e o salva como a escolha do usuário, do mesmo jeito que o toggle. É o que um menu de temas chama:

```ts
const menu = document.querySelector<HTMLSelectElement>("#theme-menu");

menu?.addEventListener("change", () => {
  if (menu.value === "auto") {
    theme.clearPreference();
  } else {
    theme.set(menu.value as "light" | "dark" | "dim");
  }
});
```

Os nomes vêm do seu objeto `themes`, então no TypeScript um nome escrito errado, como `theme.set("dimm")`, é um erro de compilação. Em JavaScript, ele lança `Theme is not configured: dimm.`

`clearPreference()`, usado acima para a opção "Automático", esquece a escolha do usuário e volta a seguir o sistema operacional.

## Escolha os temas que o sistema usa

Quando o usuário não escolheu um tema, o pacote segue o sistema operacional: `light` quando ele está no modo claro, `dark` quando está no modo escuro. `systemTheme` muda quais dos seus temas são esses. O tipo dele é exportado como `SystemThemeMap`:

```ts
const theme = createTheme({
  themes: {
    paper: { colorScheme: "light" },
    ink: { colorScheme: "dark" },
  },
  systemTheme: { light: "paper", dark: "ink" },
  defaultTheme: "paper",
});
```

`defaultTheme` é o tema usado quando não há configuração do sistema para ler, como num servidor ou num navegador sem `matchMedia`, e antes de `init()` rodar. Como esses temas não se chamam `light` e `dark`, as duas opções são necessárias aqui; sem elas, `createTheme()` lança um erro que nomeia o tema que falta.

## Decida o que o toggle faz

Um toggle alterna entre duas coisas, mas um app pode ter mais de dois temas, e o toggle precisa ir para algum lugar. `toggle()` decide a partir do tema ativo:

1. Se o tema ativo tem um `pairedTheme`, ele vai para lá.
2. Caso contrário, ele vai para o tema do sistema do color scheme oposto: de um tema escuro para `systemTheme.light`, de um tema claro para `systemTheme.dark`.

Com os três temas do começo desta página, o toggle a partir de `light` vai para `dark` e volta, e `dim` iria para `light`, o tema claro do sistema. Para mandar `dim` para outro lugar, forme um par:

```ts
const theme = createTheme({
  themes: {
    light: { colorScheme: "light" },
    dark: { colorScheme: "dark" },
    dim: { colorScheme: "dark", pairedTheme: "light" },
    sepia: { colorScheme: "light", pairedTheme: "dim" },
  },
});
```

Agora `sepia` alterna para `dim`, e `dim` alterna de volta para `light`. Um par é de mão única: dê a cada tema o próprio `pairedTheme` quando o toggle tiver que voltar para onde estava.

## Leia o estado atual

O menu de temas precisa mostrar qual opção está selecionada. O gerenciador responde a quatro perguntas:

| Membro             | Responde                                                                                                                                      |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `theme.name`       | Qual tema está ativo, como `"dim"`.                                                                                                           |
| `theme.get()`      | Tudo sobre o tema ativo: `name`, `colorScheme`, `tokens` e `pairedTheme`.                                                                     |
| `theme.preference` | Qual tema o usuário salvou, ou `null` quando nada está salvo, o armazenamento não pode ser lido ou o nome salvo não é mais um dos seus temas. |
| `theme.system`     | Para qual tema a configuração do sistema operacional aponta agora, esteja ele à mostra ou não.                                                |

`preference` é o que torna possível a opção "Automático": o menu mostra "Automático" como selecionado enquanto ele for `null`.

```ts
if (menu) {
  menu.value = theme.preference ?? "auto";
}
```

`preference` lê o que está de fato salvo. Enquanto o navegador bloqueia o `localStorage`, ele continua `null` mesmo depois que o usuário escolhe um tema, embora a escolha continue aplicada enquanto a página estiver rodando; [Salvar e sincronizar](persistence-and-sync.md#quando-o-armazenamento-falha) cobre esse caso.

`get()` devolve um `ActiveTheme`: um objeto congelado, e o mesmo objeto até a próxima mudança de tema. Isso o torna seguro para entregar a um framework de UI como snapshot de uma store, e é nisso que [Frameworks](frameworks.md#react) se apoia.

## Cada opção e seu padrão

Todas as opções são opcionais, e o tipo delas é exportado como `ThemeOptions`. Uma opção definida como `undefined` recebe o seu padrão, exatamente como uma omitida, então um wrapper pode repassar as próprias configurações opcionais sem verificá-las.

| Opção          | Padrão                                                               | O que ela controla                                                                                                       |
| -------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `themes`       | `{ light: { colorScheme: "light" }, dark: { colorScheme: "dark" } }` | Os temas disponíveis, com os nomes como chaves.                                                                          |
| `defaultTheme` | `"light"`                                                            | O tema usado quando não dá para ler nenhuma configuração do sistema, e antes de `init()`.                                |
| `systemTheme`  | `{ light: "light", dark: "dark" }`                                   | Os temas usados para os modos claro e escuro do sistema operacional.                                                     |
| `storageKey`   | `"app-theme-preference"`                                             | A chave do `localStorage` sob a qual a escolha do usuário é salva.                                                       |
| `attribute`    | `"data-theme"`                                                       | O atributo em `<html>` que guarda o nome do tema.                                                                        |
| `className`    | `true`                                                               | A classe em `<html>`: `true` adiciona `theme-<name>`, `false` não adiciona nenhuma, e uma função devolve uma própria.    |
| `darkClass`    | `false`                                                              | Se uma classe `dark` é adicionada enquanto um tema escuro está ativo, para o [Tailwind CSS](frameworks.md#tailwind-css). |
| `tokenSchema`  | nenhum                                                               | As CSS custom properties em que os valores dos tokens são escritos; veja [Design tokens](tokens.md).                     |

Algumas delas merecem um comentário:

- **`storageKey`**: Todos os apps do mesmo domínio compartilham um único `localStorage`. Se dois apps num mesmo domínio usam este pacote, dê a cada um a própria chave, como `"my-app-theme"`, ou eles vão se revezar sobrescrevendo a escolha um do outro.
- **`attribute`**: Qualquer nome de atributo HTML válido serve, um sem espaços, aspas, `/`, `>` ou `=`, exceto `class` e `style`, porque escrever o nome do tema ali apagaria as classes e os estilos inline que a sua página colocou em `<html>`. Use `className` para ter uma classe.
- **`className`**: Uma função, do tipo `ThemeClassResolver`, recebe o tema, incluindo os tokens estáticos dele, e devolve um nome de classe sem espaços. `className: (theme) => theme.name` gera classes como `dark` e `dim` em vez de `theme-dark`. Uma função que devolve um nome vazio ou com espaço faz a operação que a aplicou lançar um erro.

## Quando a configuração está errada

`createTheme()` verifica cada opção na hora e lança um `Error` que descreve o primeiro problema encontrado, como um `defaultTheme` ou `pairedTheme` que não nomeia nenhum tema configurado, um `colorScheme` que não é nem `"light"` nem `"dark"` ou, enquanto `className` é `true`, um nome de tema que não pode fazer parte de uma classe. Nada chega à página a partir de opções inválidas, então um erro aparece na primeira vez que o código roda, e não como um tema que em silêncio nunca é aplicado. A [referência de `createTheme`](../reference/index.md#createtheme) (em inglês) lista todas as regras, e [Solução de problemas](troubleshooting.md#createtheme-lança-um-erro) cobre as mais comuns com as correções.

Em seguida, [Design tokens](tokens.md) adiciona um seletor de cor de destaque à tela de configurações, o que significa levar algumas cores do CSS para o JavaScript.
