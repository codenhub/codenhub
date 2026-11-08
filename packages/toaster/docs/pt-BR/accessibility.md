---
title: Acessibilidade e segurança
description: O que os leitores de tela ouvem, como funcionam o foco e o teclado, movimento reduzido, o que fica por sua conta e a fronteira de confiança do conteúdo personalizado.
order: 5
source: 47be97a3841114ce9a3e4cc52471cde4fc7514f0
---

# Acessibilidade e segurança

Um toast que só algumas pessoas conseguem perceber só chega a algumas pessoas. Esta página cobre o que o pacote faz por quem usa leitor de tela e teclado sem ninguém pedir, as poucas coisas que ele deixa por sua conta e a linha de segurança entre texto e nós do DOM no conteúdo personalizado.

## O que os leitores de tela ouvem

Todo toast é anunciado. Cada toaster adiciona duas "live regions" ocultas ao seu container: elementos cujo texto, quando muda, os leitores de tela leem automaticamente. Uma é polite, a outra é assertive. O `role` de um toast escolhe qual delas o lê:

- **`"status"`** é polite: lido depois do que quer que o leitor de tela esteja falando no momento. É o padrão de `toast()`, `success()`, `info()`, `loading()` e `custom()`.
- **`"alert"`** é assertive: lido na hora, interrompendo. É o padrão de `error()` e `warning()`.

Mude por toast quando o padrão não servir:

```ts
import { toast } from "@codenhub/toaster";

// Um aviso de rotina que não precisa interromper ninguém.
toast.warning("A nota está ficando longa", { role: "status" });
```

Qualquer outro valor de `role` lança `Invalid toast role: …`.

O que é lido:

- O título, a mensagem e a descrição do toast, ou o texto dentro do conteúdo personalizado.
- O rótulo do botão de ação, depois do texto, como em "Movida para a lixeira. Desfazer", para quem está ouvindo saber que tem algo a fazer.
- Não o botão de fechar, nem os botões dentro do conteúdo personalizado.

Um toast é anunciado de novo sempre que uma atualização muda o texto ou o role dele. É assim que um toast de promise anuncia tanto "Salvando…" quanto "Salvo".

Dois detalhes de tempo explicam comportamentos que você pode notar ao testar:

- **O primeiro anúncio tem um pequeno atraso.** Os leitores de tela muitas vezes perdem uma live region que aparece já com texto dentro, porque eles só anunciam mudanças em regiões que já estão observando. Então cada região é adicionada vazia, e o primeiro texto dela chega 100ms depois, seguindo a [técnica ARIA22 do W3C](https://www.w3.org/WAI/WCAG21/Techniques/aria/ARIA22.html).
- **O texto anunciado é apagado depois de 7 segundos**, para que as regiões ocultas não acumulem mensagens velhas.

O toast visível em si não é uma live region e não tem atributo `role`. Testes que procuram toasts por `role="status"` ou `aria-live` precisam de outro seletor. Encontre-os do jeito que quem usa leitor de tela encontra, pelo landmark da stack, descrito a seguir:

```ts
// Playwright; o getByRole da Testing Library funciona do mesmo jeito.
const notifications = page.getByRole("region", { name: "Notifications" }); // ou o seu labels.notifications
await expect(notifications.getByText("Nota salva")).toBeVisible();
```

### Encontrando os toasts

Cada stack é uma região landmark chamada "Notifications". Quem usa leitor de tela pode pular para ela pela lista de landmarks para chegar aos botões de um toast. Uma stack sem toasts sai da lista, para que ninguém caia numa região vazia. Traduza o nome com os `labels` do toaster:

```ts
import { createToaster } from "@codenhub/toaster";

const toaster = createToaster({
  labels: {
    notifications: "Notificações",
    dismiss: "Fechar notificação",
  },
});
```

`dismiss` é o nome acessível do botão de fechar nos toasts com [`dismissible`](toasts.md#timers-e-fechamento-automático). O padrão é "Dismiss toast".

### Toasts debaixo de um diálogo

Enquanto um diálogo deste pacote está aberto, os toasts dos toasters que compartilham o container dele são anunciados de dentro do diálogo. Os toasts de outros toasters, e os mostrados debaixo de um diálogo modal que o seu próprio app abriu, não são anunciados de jeito nenhum, nem depois. [Toasts enquanto um diálogo está aberto](dialogs.md#toasts-enquanto-um-diálogo-está-aberto) explica por quê e como evitar isso.

## Teclado e foco

Os toasts nunca roubam o foco. Mostrar um não leva o teclado para lugar nenhum, que é o que você quer de algo que deveria ficar fora do caminho.

Quando alguém de fato move o foco para dentro de um toast, como ao chegar no botão de ação com <kbd>Tab</kbd>:

- O timer dele pausa, e ele fica [protegido contra ser empurrado para fora](toasts.md#como-a-stack-enche) de uma stack cheia.
- Se uma atualização muda só o texto dele, o foco fica no botão. Se a atualização substitui a ação, o foco vai para o botão novo.
- Quando ele fecha, o foco volta para o que estava com o foco quando o toast apareceu, desde que esse elemento ainda esteja na página. Se o foco já foi para outro lugar nesse meio-tempo, ele fica lá.

Os diálogos usam o elemento nativo `<dialog>` do navegador com `showModal()`, então o próprio navegador cuida de:

- **Esconder o resto da página.** Tudo atrás do diálogo fica inerte: sem cliques, sem foco, e os leitores de tela pulam.
- **Manter o foco dentro.** <kbd>Tab</kbd> circula pelos controles do próprio diálogo.
- **<kbd>Escape</kbd>**, que cancela.
- **Devolver o foco.** Quando o último diálogo de uma [fila](dialogs.md#um-de-cada-vez) fecha, o foco volta para o elemento que o tinha antes de o primeiro abrir.

O título e a mensagem são ligados ao diálogo como o nome e a descrição acessíveis dele, e a mensagem de um prompt serve de rótulo para o campo de texto.

## Movimento reduzido

Algumas pessoas ligam o movimento reduzido no sistema operacional, porque deslizamentos e fades podem causar tontura ou enjoo. Quando `prefers-reduced-motion: reduce` está ativo:

- Os toasts aparecem e somem sem animação.
- Os toasts numa stack pulam para a nova posição em vez de deslizar.
- Os backdrops dos diálogos aparecem e somem sem fade.

Não tem nada para configurar. A preferência é lida ao vivo, então mudá-la com a página aberta vale a partir da próxima animação.

## O que fica por sua conta

O pacote cuida da mecânica, mas algumas escolhas só você pode fazer:

- **Tempo de leitura.** Um toast que fecha depois de 4 segundos serve para "Salvo" e é rápido demais para qualquer coisa que peça uma ação ou uma segunda leitura. Dê uma `duration` maior aos toasts importantes, ou `autoDismiss: false` com `dismissible: true`. Melhor ainda: não coloque só num toast nada que uma pessoa não possa perder.
- **Rótulos em outros idiomas.** Os rótulos embutidos estão em inglês. Defina os `labels` do toaster e os `labels` dos diálogos, como [Diálogos](dialogs.md#rótulos-dos-botões-e-tradução) mostra.
- **Conteúdo personalizado.** Os nós que você passa para `toast.custom()` são seus: dê nomes acessíveis a botões e links, mantenha uma ordem de leitura que faça sentido e deixe os elementos interativos alcançáveis pelo teclado.
- **Sobrescrita de cores.** As cores que você define com `--toast-color-*` precisam de contraste suficiente entre si. As cores embutidas foram pensadas para isso; as suas sobrescritas são responsabilidade sua.

## Conteúdo personalizado e confiança

`toast.custom()` e a opção `content` de `update()` aceitam uma string ou um nó do DOM, e os dois são tratados de formas bem diferentes:

| Você passa | O que acontece                                           | Seguro para entrada não confiável? |
| ---------- | -------------------------------------------------------- | ---------------------------------- |
| Uma string | Mostrada como texto puro. Nunca interpretada como HTML.  | Sim.                               |
| Um nó      | Inserido exatamente como foi montado.                    | Só se você o montou com segurança. |
| Uma função | Chamada com o handle; o resultado segue as linhas acima. | Depende do que ela devolve.        |

### Strings são texto

Uma string vira um único nó de texto. As tags dentro dela aparecem como caracteres e não criam elementos:

```ts
import { toast } from "@codenhub/toaster";

// Mostra os caracteres <b>Lista de compras</b>, e não texto em negrito.
toast.custom("<b>Lista de compras</b>");
```

Isso torna as strings seguras para qualquer coisa que usuários ou servidores controlam, como títulos de notas, nomes de usuário e mensagens de erro vindas de uma API. O mesmo vale para todas as outras opções de texto: `message`, `title`, `description`, rótulos de ação e o texto dos diálogos são todos inseridos como texto.

### Nós são confiáveis

Um nó é inserido do jeito que está. O pacote não o inspeciona nem o limpa, então quem o monta é responsável pela segurança dele. Monte-o com métodos do DOM e coloque texto não confiável via `textContent`, nunca via `innerHTML`:

```ts
import { toast } from "@codenhub/toaster";

toast.custom((handle) => {
  const wrapper = document.createElement("div");

  const text = document.createElement("span");
  text.textContent = `"${note.title}" compartilhada com ${recipient.name}`;

  const button = document.createElement("button");
  button.textContent = "Copiar link";
  button.addEventListener("click", () => {
    copyShareLink(note.id);
    handle.dismiss();
  });

  wrapper.append(text, button);
  return wrapper;
});
```

Os event listeners que você anexa aos seus próprios nós são seus para gerenciar. Eles são liberados junto com o nó quando nada mais o referencia, mas qualquer coisa que eles segurem em outro lugar, como uma inscrição ou um timer, precisa da sua própria limpeza, por exemplo em `handle.onHidden()`.

### Trusted Types

O pacote nunca atribui nada a `innerHTML` nem a qualquer outra propriedade que interpreta HTML. Os próprios toasts, ícones e diálogos dele são montados com métodos do DOM. Uma página que exige Trusted Types com `require-trusted-types-for 'script'` não precisa de nenhuma política de Trusted Types para ele. A estilização dele também se dá bem com CSP; veja [Content Security Policy](styling.md#content-security-policy).

## Próximos passos

Fim do tour. Para as assinaturas e os tipos exatos, veja a [referência da API](../reference/index.md) (em inglês). Para ver o que mudou entre as versões, veja o [changelog](../changelog/index.md). Para recomeçar do topo, volte para a [visão geral](index.md).
