---
title: Estilização
description: A folha de estilos, as cores com e sem @codenhub/styles, classes de apresentação, tamanho, modo escuro, sobrescrita de cores, Content Security Policy e a ordem das folhas de estilo.
order: 4
source: d6079abe49e29d1f3fc1f994a6fdb31384bb4d37
---

# Estilização

Toasts e diálogos devem parecer parte do seu app, e não uma biblioteca que entrou pela porta errada. Esta página cobre a folha de estilos, de onde vêm as cores, as classes de apresentação, o tamanho, o modo escuro, como sobrescrever cores você mesmo e a Content Security Policy. Tudo aqui é CSS puro: sem plugin de build, sem objeto de tema, sem API de estilo em runtime.

## A folha de estilos

Carregue a folha de estilos uma vez, onde o seu app começa:

```ts
import "@codenhub/toaster/styles";
```

Ela guarda tudo o que é visual: as stacks e suas posições, o layout dos toasts e dos diálogos, as animações e as cores. Sem ela, os toasts ainda são adicionados à página, mas sem posicionamento, layout nem cor. Se o seu primeiro toast aparecer com cara de parágrafo esquecido no rodapé da página, a culpa é desse import.

O import funciona com qualquer bundler que lide com imports de CSS, como Vite, webpack ou esbuild. Sem bundler, aponte para o `dist/styles/index.css` do pacote com uma tag `<link rel="stylesheet">`.

### O que ela define fora dos toasts

Quase todas as regras têm escopo nos elementos do próprio pacote, mas algumas valem para a página inteira, e é melhor você saber delas por aqui do que por um colega confuso:

- **`color-scheme` na raiz.** A folha de estilos define `color-scheme: light dark` em `:root`, então o navegador desenha os controles embutidos, como barras de rolagem e campos de formulário, no modo escuro quando o sistema operacional prefere o escuro. As classes `dark`, `light`, `theme-dark` e `theme-light` e o atributo `data-theme` também o definem, em qualquer elemento que os tenha; veja [Modo escuro](#modo-escuro). Se a sua página define o próprio `color-scheme`, o seu vale onde a sua regra for mais específica ou carregar depois.

  A regra existe porque as cores embutidas são pares `light-dark()`, que seguem o `color-scheme`: sem ela, os toasts sem o `@codenhub/styles` continuariam claros num sistema escuro. Se a sua página só tem um design claro, o efeito colateral são barras de rolagem e campos de formulário escuros para quem tem o sistema no modo escuro. Para desligar, use a classe `light` no `<html>`, ou uma regra sua, carregada depois desta folha de estilos e fora de qualquer `@layer`, já que a regra do toaster também não está numa:

  ```css
  :root {
    color-scheme: light;
  }
  ```

  Os toasts acompanham e também ficam claros, então nada na página troca de tema pelas suas costas.

- **Classes de apresentação.** Ela define `.solid`, `.soft`, `.ghost`, `.edged` e `.edgeless` globalmente, na `@layer components` do CSS. Elas só definem as custom properties `--ui-fill`, `--ui-fg-on-fill` e `--ui-border`. Um elemento seu que por acaso tenha uma classe com o mesmo nome não muda sozinho, mas essas propriedades são herdadas, e toasts e componentes do `@codenhub/styles` as leem, então qualquer um deles dentro desse elemento pega os valores. Se `.solid` já significa outra coisa no seu app, renomeie a sua.

## De onde vêm as cores

Toasts e diálogos escolhem as cores de um de dois jeitos, dependendo de o `@codenhub/styles` estar ou não na página.

### Sem o `@codenhub/styles`

Sem o `@codenhub/styles`, a folha de estilos usa cores embutidas: uma superfície neutra para os toasts padrão, verde para sucesso, vermelho para erro, âmbar para aviso e azul para informação, cada uma com uma versão clara e uma escura. Você não precisa configurar nada.

### Com `@codenhub/styles`

[`@codenhub/styles`](https://www.npmjs.com/package/@codenhub/styles) é um design system opcional. Quando a folha de estilos dele, na versão 0.3.0 ou mais recente, está na página, toasts e diálogos montam as cores a partir do tema dele:

- **Cores de intenção**: os toasts leem `--color-success`, `--color-destructive` (para erros), `--color-warning` e `--color-info`, e os botões dos diálogos leem `--color-primary`, `--color-accent` (para `type: "secondary"`), `--color-success` e `--color-destructive`, então mudar as cores do seu tema muda os dois.
- **Apresentação**: o quanto de cor preenche o fundo e a borda segue `--ui-fill` e `--ui-border`.
- **Aparência**: o raio dos cantos, a largura da borda, a sombra, o recorte e a elevação de um tema (`--ui-radius`, `--ui-border-width`, `--ui-surface-shadow`, `--ui-clip`, `--ui-elevation`) também valem para toasts e diálogos, então um tema com efeito de vidro ou neobrutalista chega até eles.

Esses valores são lidos ao vivo. Mude uma variável ou classe do tema em runtime e os toasts que já estão na tela se atualizam junto.

Por padrão, um toast se parece com um alert do `@codenhub/styles`: uma superfície levemente tingida, com borda e sem sombra. Os botões dos diálogos se parecem com os botões dele: cor sólida, sem borda, levemente elevados.

## Classes de apresentação

Passe uma classe de apresentação por `className` para mudar a intensidade da cor de um toast:

| Classe     | Efeito                                      |
| ---------- | ------------------------------------------- |
| `solid`    | Fundo totalmente colorido.                  |
| `soft`     | Fundo levemente tingido. Padrão dos toasts. |
| `ghost`    | Sem preenchimento no fundo.                 |
| `edged`    | Desenha a borda. Padrão dos toasts.         |
| `edgeless` | Remove a borda.                             |

```ts
import { toast } from "@codenhub/toaster";

toast.error("Não foi possível salvar a nota", { className: "solid" });
toast.info("Sincronizando em segundo plano", { className: "ghost edgeless" });
```

Essas classes funcionam sozinhas e com o `@codenhub/styles`. Elas definem `--ui-fill` e `--ui-border`, então uma classe no próprio toast ganha de uma em qualquer ancestral. Para aplicar uma a todos os toasts de um toaster, use a opção `className` do toaster.

## Tamanho

Todo toast tem 22.25rem (356px) de largura. Numa tela estreita, ele encolhe para caber, mantendo a margem da stack dos dois lados. Todos os toasts de uma stack têm a mesma largura, então a stack mantém as bordas retas.

Para mudar a largura, defina `width` numa classe e passe-a por `className`:

```css
.wide-toast {
  width: 28rem;
}
```

```ts
toast.info("Uma mensagem mais longa que precisa de mais espaço", { className: "wide-toast" });
```

## Velocidade das animações

Os toasts deslizam para dentro e para fora em 400ms, e os diálogos fazem fade em 200ms. Os dois leem as mesmas custom properties de movimento que o `@codenhub/styles` usa, então você pode mudá-las com ou sem ele:

| Propriedade                | Padrão                       | Controla                                             |
| -------------------------- | ---------------------------- | ---------------------------------------------------- |
| `--motion-duration-slow`   | `400ms`                      | Entrada, saída e deslizamento dos toasts numa stack. |
| `--motion-ease`            | `cubic-bezier(0.2, 0, 0, 1)` | Easing dessas animações dos toasts.                  |
| `--motion-duration-normal` | `200ms`                      | Fades do diálogo e do backdrop.                      |

```css
:root {
  --motion-duration-slow: 250ms;
}
```

O movimento reduzido desliga todas essas animações de qualquer jeito; veja [Movimento reduzido](accessibility.md#movimento-reduzido).

## Modo escuro

Sem tema definido, toasts e diálogos seguem a preferência de claro ou escuro do sistema operacional. Para escolher explicitamente, coloque uma destas opções num ancestral, normalmente o `<html>`:

- Escuro: a classe `dark` ou `theme-dark`, ou `data-theme="dark"`.
- Claro: a classe `light` ou `theme-light`, ou `data-theme="light"`.

O `@codenhub/theme` define a classe `theme-<nome>` e `data-theme="<nome>"`, então temas chamados `dark` e `light` funcionam de cara. Para temas escuros com outros nomes, ligue a opção `darkClass` dele, que adiciona a classe `dark`.

As cores são resolvidas com o `light-dark()` do CSS, de acordo com o `color-scheme` de cada elemento, então uma seção clara dentro de uma página escura funciona. Os toasts renderizados dentro dela, por um [toaster com escopo nessa seção](instances.md), usam as cores claras:

```html
<html class="dark">
  <body>
    <aside id="preview" class="light" style="color-scheme: light">
      <!-- Um toaster criado com { container: preview } mostra toasts claros aqui. -->
    </aside>
  </body>
</html>
```

## Sobrescrevendo cores

Quando uma cor precisa ser diferente da do tema, defina a custom property `--toast-color-*` correspondente no seu próprio CSS. Ela substitui a cor calculada para aquele valor, sozinho ou com o `@codenhub/styles`. Cada valor é final: ele é usado exatamente como foi passado, sem se misturar com nada.

Custom properties são herdadas, então o lugar onde você define uma decide o que ela afeta:

```css
/* Todos os toasts e diálogos da página. */
:root {
  --toast-color-success-bg: #0f2e1b;
  --toast-color-success-fg: #4ade80;
  --toast-color-success-edge: #166534;
}

/* Só os toasts dentro da barra lateral, de um toaster criado com { container: sidebar }. */
#sidebar {
  --toast-color-error-bg: #450a0a;
  --toast-color-error-fg: #fca5a5;
}

/* Um toast só, via className. */
.quota-alert {
  --toast-color-error-bg: #7f1d1d;
}
```

```ts
toast.error("Armazenamento quase cheio", { className: "quota-alert" });
```

Para os diálogos, coloque a classe no diálogo com o `className` da chamada ou o `className` da instância.

| Propriedade                  | O que ela colore                                                                            |
| ---------------------------- | ------------------------------------------------------------------------------------------- |
| `--toast-color-default-bg`   | Fundo de um toast neutro.                                                                   |
| `--toast-color-default-fg`   | Texto e ícone de um toast neutro.                                                           |
| `--toast-color-default-edge` | Borda de um toast neutro.                                                                   |
| `--toast-color-success-bg`   | Fundo de um toast de sucesso.                                                               |
| `--toast-color-success-fg`   | Texto e ícone de um toast de sucesso.                                                       |
| `--toast-color-success-edge` | Borda de um toast de sucesso.                                                               |
| `--toast-color-error-bg`     | Fundo de um toast de erro.                                                                  |
| `--toast-color-error-fg`     | Texto e ícone de um toast de erro.                                                          |
| `--toast-color-error-edge`   | Borda de um toast de erro.                                                                  |
| `--toast-color-warning-bg`   | Fundo de um toast de aviso.                                                                 |
| `--toast-color-warning-fg`   | Texto e ícone de um toast de aviso.                                                         |
| `--toast-color-warning-edge` | Borda de um toast de aviso.                                                                 |
| `--toast-color-info-bg`      | Fundo de um toast de informação.                                                            |
| `--toast-color-info-fg`      | Texto e ícone de um toast de informação.                                                    |
| `--toast-color-info-edge`    | Borda de um toast de informação.                                                            |
| `--toast-color-surface`      | Fundo de um diálogo e do botão de cancelar dele.                                            |
| `--toast-color-text`         | Texto de um diálogo e do botão de cancelar dele.                                            |
| `--toast-color-border`       | Borda de um diálogo e do botão de cancelar dele com `edged`, e do campo de texto do prompt. |
| `--toast-color-primary-bg`   | Anel de foco e borda com foco do campo de texto do prompt.                                  |

O pacote nunca define essas propriedades por conta própria. Elas são inteiramente suas.

## Content Security Policy

O pacote não injeta nenhum elemento `<style>`. A folha de estilos é uma que você carrega, e os únicos estilos que o pacote escreve são propriedades individuais em elementos, via `element.style.setProperty()`, que uma política `style-src` não bloqueia. Uma política rígida como esta não precisa de nonce nem de exceção para ele:

```http
Content-Security-Policy: style-src 'self';
```

Isso vale para o pacote. Como você carrega a folha de estilos é entre você e a sua política: um `<link>` ou um arquivo CSS gerado pelo bundler passa tranquilo com `style-src 'self'`, mas alguns setups, como servidores de desenvolvimento ou o `style-loader`, injetam o CSS como um elemento `<style>`, que essa política bloqueia. Se os toasts aparecerem sem estilo sob CSP, comece por aí.

O pacote também nunca interpreta HTML, então funciona com Trusted Types também; veja [Acessibilidade e segurança](accessibility.md#trusted-types).

## Ordem das folhas de estilo com `@codenhub/styles/native`

Se você usa a folha de estilos de elementos nativos do `@codenhub/styles` (`@codenhub/styles/native` ou `@codenhub/styles/tw/native`), importe-a **antes** da folha de estilos do toaster:

```ts
import "@codenhub/styles/native";
import "@codenhub/toaster/styles";
```

A folha de estilos nativa estiliza todo `<button>` simples como um botão neutro. Os botões dos diálogos são elementos `<button>` simples, e as duas folhas de estilos os estilizam com seletores igualmente fracos, então quem carrega por último ganha. Carregue a nativa por último e todo botão de diálogo fica neutro, inclusive o "Apagar" vermelho, que é justamente o botão que mais precisa parecer perigoso.

## Próximos passos

O app de notas já está apresentável. A última página, [Acessibilidade e segurança](accessibility.md), cobre o que quem usa leitor de tela ouve, como o foco se move, o movimento reduzido e a fronteira de confiança do conteúdo personalizado.
