---
title: Toasts
description: Todos os tipos de toast, ações, toasts de carregamento e de promise, handles e atualizações, posições, fila, timers e os erros que os toasts lançam.
order: 1
source: 389a6700b4ea25524e8094f71861f08c366f23be
---

# Toasts

Esta página cobre tudo o que um toast sabe fazer: os tipos, os botões, os spinners de carregamento, como atualizar um toast depois que ele aparece, onde os toasts surgem e o que acontece quando chegam muitos de uma vez. Os exemplos seguem um app de notas, começando pela funcionalidade mais importante de qualquer app de notas: avisar que salvou.

Todo exemplo parte do princípio de que `@codenhub/toaster/styles` foi carregado uma vez, como mostra a [visão geral](index.md#um-primeiro-toast).

## Seus primeiros toasts

`toast` é um toaster pronto. Chame-o direto para um toast neutro, ou use um dos seus quatro atalhos para um toast com significado:

```ts
import { toast } from "@codenhub/toaster";

toast("Nota salva");
toast.success("Nota publicada");
toast.error("Não foi possível falar com o servidor");
toast.warning("Você está offline. As alterações serão sincronizadas depois.");
toast.info("Tem uma versão nova disponível");
```

`toast()` gera um toast neutro, sem ícone. Os outros quatro ganham cada um o ícone e a cor correspondentes, e mudam na urgência com que os leitores de tela os leem:

| Chamada           | Como os leitores de tela leem         |
| ----------------- | ------------------------------------- |
| `toast()`         | Sem interromper, depois da fala atual |
| `toast.success()` | Sem interromper, depois da fala atual |
| `toast.info()`    | Sem interromper, depois da fala atual |
| `toast.warning()` | Na hora, interrompendo                |
| `toast.error()`   | Na hora, interrompendo                |

Avisos e erros interrompem porque costumam ser justamente o que a pessoa precisa ouvir agora. Dá para mudar isso por toast com `role`; [Acessibilidade](accessibility.md#o-que-os-leitores-de-tela-ouvem) explica como.

Um toast se fecha sozinho depois de 4 segundos. Se você prefere que ele fique, leia [Timers](#timers-e-fechamento-automático) mais abaixo.

### Escolhendo a aparência você mesmo

Os atalhos são o jeito rápido de dar um significado a um toast, mas `toast()` aceita o mesmo significado como opção. `type` define o ícone, a cor e a urgência com que os leitores de tela o leem, exatamente como o atalho correspondente faria:

```ts
toast("Armazenamento quase cheio", { type: "warning" }); // aparece e soa como toast.warning()
toast.success("Nota compartilhada", { icon: null }); // um toast de sucesso sem ícone
toast("Sincronização pausada", { icon: "info" }); // um toast neutro com o ícone de info
```

`icon` escolhe um entre `"success"`, `"error"`, `"warning"`, `"info"` ou `"loader"`, ou `null` para nenhum, seja qual for o tipo. Os atalhos sempre usam o próprio tipo, então `toast.success("Salvo", { type: "error" })` continua sendo um toast de sucesso: se o significado vem dos dados, chame `toast()` com `type`.

### Duas formas de chamar

`toast()`, `success()`, `error()`, `warning()`, `info()` e `loading()` aceitam uma mensagem mais um objeto de opções opcional, ou um único objeto de opções:

```ts
toast.success("Nota salva", { duration: 6000 });

toast.success({ message: "Nota salva", duration: 6000 });
```

As duas fazem a mesma coisa. A primeira fica mais legível para uma mensagem rápida. A segunda é útil quando o toast é montado a partir de dados, ou quando ele tem um `title` e nenhuma `message`.

## Títulos, descrições e um botão de ação

Um toast pode ter mais de uma linha. `title` vai em cima, em negrito, `message` é o texto principal e `description` fica embaixo, em letra menor. `action` adiciona um botão:

```ts
import { toast } from "@codenhub/toaster";

toast.success("Movida para a lixeira", {
  title: "Lista de compras",
  description: "Notas na lixeira são apagadas depois de 30 dias.",
  action: {
    label: "Desfazer",
    onClick: (_event, handle) => {
      restoreNote("groceries");
      handle.dismiss();
    },
  },
});
```

`onClick` recebe o `MouseEvent` do clique e o handle do toast. **Clicar na ação não fecha o toast.** Isso é de propósito: algumas ações devem deixá-lo aberto, como "Ver detalhes". Quando a ação terminar com o toast, chame `handle.dismiss()`, como acima.

Um toast precisa ter algo a dizer. Chamar um sem `message` e sem `title` lança `Toast requires a non-empty message or content.` Uma `description` sozinha não conta: ela é a letra miúda, e letra miúda sem manchete é só um mistério.

## Toasts de carregamento

Tem trabalho que demora. `toast.loading()` mostra um spinner e fica na tela até você mudá-lo:

```ts
const syncing = toast.loading("Sincronizando notas…");
```

Por padrão, um toast de carregamento não tem timer nem botão de fechar, porque "ainda trabalhando" não deveria sumir enquanto o trabalho ainda está rolando. Para encerrá-lo, chame `update()` no handle e transforme-o num toast normal:

```ts
import { toast } from "@codenhub/toaster";

const syncing = toast.loading("Sincronizando notas…");

try {
  const count = await syncNotes();
  syncing.update({
    type: "success",
    message: `${count} notas sincronizadas`,
    autoDismiss: true,
  });
} catch {
  syncing.update({
    type: "error",
    message: "Falha na sincronização. Suas notas estão seguras neste dispositivo.",
    autoDismiss: true,
  });
}
```

Mudar o `type` troca o spinner pelo ícone e pela cor correspondentes. Sair do estado de carregamento também liga o timer que o toast de carregamento nunca teve, com as mesmas configurações que um toast novo daquele tipo receberia: um resultado `"success"` fecha depois da `duration` do grupo `semantic` da instância, ou da `duration` simples dela quando o grupo `semantic` não define uma, e fica aberto se a instância disser `autoDismiss: false`. O `autoDismiss: true` ali em cima faz este resultado fechar de qualquer jeito; passe `autoDismiss: false` se ele tiver que ficar até alguém fechar. [Padrões por tipo](instances.md#padrões-por-tipo) explica o grupo `semantic`.

`toast.loading()` aceita `title`, `message`, `description`, `position`, `dismissible`, `className` e `margin`. Ele não tem as opções `duration` nem `autoDismiss`, já que nunca fecha sozinho; defina-as no `update()` que o encerra.

## Toasts de promise

Esse padrão de tentar e atualizar é tão comum que ganhou um atalho. `toast.promise()` mostra um toast de carregamento enquanto uma promise roda e depois o transforma num toast de sucesso ou de erro:

```ts
import { toast } from "@codenhub/toaster";

const note = await toast.promise(saveNote(draft), {
  loading: "Salvando…",
  success: (saved) => `"${saved.title}" salva`,
  error: (error) => `Falha ao salvar: ${error instanceof Error ? error.message : String(error)}`,
});
```

Ele devolve o resultado da promise original, então `note` é o que quer que `saveNote()` tenha resolvido. Se `saveNote()` rejeitar, `toast.promise()` mostra o toast de erro e depois rejeita com o mesmo erro, então o seu próprio `try`/`catch` continua rodando. O toast é um efeito colateral; o seu fluxo de controle não muda.

A rejeição chega a `error` com o tipo `unknown`, porque o JavaScript deixa uma promise rejeitar com qualquer coisa, não só com um `Error`. Verifique antes de ler `.message`, como acima.

O que cada opção aceita:

- **`loading`**: uma string, ou o mesmo objeto de opções que `toast.loading()` aceita.
- **`success`** e **`error`**: uma string, um objeto de opções de toast, ou uma função que recebe o resultado (ou o erro) e devolve uma das duas coisas. Devolva um objeto quando quiser um título, uma descrição ou uma ação. O resultado é o próprio toast de carregamento alterado no lugar, então ele continua na stack dele e recebe o tipo a partir do desfecho: o objeto aceita todas as opções de toast, menos `position`, `margin`, `role` e `type`.

```ts
await toast.promise(syncNotes(), {
  loading: "Sincronizando notas…",
  success: (result) => ({
    title: "Sincronização concluída",
    description: `${result.updated} notas atualizadas, ${result.added} adicionadas.`,
  }),
  error: () => ({
    message: "Falha na sincronização",
    duration: 10000,
    action: { label: "Tentar de novo", onClick: () => syncAgain() },
  }),
});
```

- **`position`**, **`className`** e **`margin`** valem para o toast do começo ao fim.
- **`duration`** e **`dismissible`** valem para o toast de resultado. Se não forem definidas, vêm dos padrões `semantic` da instância e, depois, da própria instância. [Padrões por tipo](instances.md#padrões-por-tipo) explica essa cadeia.

O toast de resultado fecha sozinho depois da sua `duration`, mesmo que o toast de carregamento antes dele não fechasse, a não ser que a instância defina `autoDismiss: false` no grupo `semantic` ou, se o grupo não definir, para a instância toda. Para decidir por chamada, devolva `autoDismiss` em `success` ou `error`; isso ganha dos dois.

Se a sua função `success` ou `error` lançar um erro, o toast de carregamento é fechado e o erro é reportado ao navegador como erro não capturado, então ele aparece no console e nas ferramentas de monitoramento de erros. `toast.promise()` ainda resolve ou rejeita com o desfecho da promise original, então um erro de digitação numa mensagem não quebra o salvamento.

## Handles: controlando um toast depois que ele aparece

Todo método de toast, menos `toast.promise()` (que devolve o resultado da promise), devolve um `ToastHandle`. Guarde-o quando quiser mudar, fechar ou acompanhar o toast depois:

```ts
import { toast } from "@codenhub/toaster";

const upload = toast("Enviando anexo… 0%", { autoDismiss: false });

onProgress((percent) => {
  upload.update({ message: `Enviando anexo… ${percent}%` });
});

onDone(() => {
  upload.update({ type: "success", message: "Anexo enviado", autoDismiss: true });
});

cancelButton.addEventListener("click", () => upload.dismiss());
```

### `update()`

`update()` altera um toast no lugar. Passe só o que você quer mudar:

- `title`, `message`, `description`: texto novo, ou `null` para remover aquela linha.
- `action`: um botão novo, ou `null` para removê-lo.
- `type`: `"success"`, `"error"`, `"warning"`, `"info"` ou `"default"`. Muda a cor, o ícone e a urgência com que os leitores de tela anunciam o toast.
- `icon`: `"success"`, `"error"`, `"warning"`, `"info"` ou `"loader"` para escolher outro ícone, ou `null` para nenhum. Quando você muda o `type` sem passar `icon`, o ícone acompanha o tipo.
- `content`: substitui tudo por conteúdo personalizado, como descrito em [Conteúdo personalizado](#conteúdo-personalizado). Quando é passado, `message` e `icon` na mesma chamada são ignorados.
- `duration`, `autoDismiss`, `dismissible`: mudam o tempo e o botão de fechar. Uma `duration` nova reinicia a contagem na hora, a partir do valor novo inteiro.
- `className`: substitui as classes passadas na chamada do toast. As classes próprias do toast e o `className` do toaster continuam, então passe todas as classes por toast que você ainda quer, não só a nova.

Alguns detalhes que fazem diferença na prática:

- **Um toast na fila guarda as atualizações.** Se o toast ainda está esperando espaço na stack, a atualização fica guardada e é aplicada quando ele aparece.
- **Um toast já encerrado ignora atualizações.** Depois que o toast fechou por completo, `update()` não faz nada e não lança erro. Chamar atrasado não faz mal.
- **O foco fica onde estava.** Se alguém está com o foco no botão de ação quando uma atualização muda só o texto, o foco continua no botão. Se a atualização substitui a própria ação, o foco vai para o botão novo.
- **Texto alterado é anunciado de novo**, então um leitor de tela ouve tanto "Enviando…" quanto "Anexo enviado".
- **Uma mensagem substitui um título sozinho.** Quando um toast tem só um `title`, uma atualização só com `message` toma o lugar dele: `toast({ title: "Envio" }).update({ message: "50%" })` mostra só "50%". Um toast só com título mostra o título onde vai a mensagem, então uma mensagem nova ocupa esse lugar. Passe `title` na mesma atualização para manter os dois.

`update()` lança um erro se `duration` não for um número de 0 a 2147483647, se `type` não for um dos cinco acima, ou se `content` estiver vazio.

### `dismiss()`

`dismiss()` dispara a animação de saída do toast. Pode chamar mais de uma vez sem problema, e também num toast que ainda está na fila, que então nunca aparece.

### Estado, `settled` e eventos de ciclo de vida

Um toast passa por quatro estados, que você lê em `handle.state`:

```text
queued → visible → hiding → hidden
```

- **`queued`**: esperando espaço numa stack cheia. Um toast que tem espaço pula direto para `visible`.
- **`visible`**: na tela.
- **`hiding`**: tocando a animação de saída.
- **`hidden`**: fora da página.

`handle.settled` é uma promise que resolve quando o toast fica `hidden` e o elemento dele é removido. Use `await` nela quando algo só deve acontecer depois que o toast sumiu de vez.

Para um controle mais fino, inscreva-se em cada etapa. Cada método devolve uma função que cancela a inscrição:

```ts
const handle = toast("Nota arquivada");

handle.onShow(() => console.log("adicionado à página"));
handle.onShown(() => console.log("animação de entrada terminou"));
handle.onHide(() => console.log("animação de saída começando"));
const stop = handle.onHidden(() => console.log("removido da página"));

stop(); // mudamos de ideia sobre esse último
```

Um subscriber adicionado depois que a etapa dele já aconteceu é chamado na hora, então não tem como perder um evento por se inscrever tarde. Se um subscriber lançar um erro, o toast termina de fechar mesmo assim, e o erro é reportado como erro não capturado.

## Posições e margens

Por padrão, os toasts aparecem no canto superior direito. Escolha outro lugar por toast com `position`:

```ts
toast("Copiado para a área de transferência", { position: "bottom-center" });
```

As seis posições são `"top-left"`, `"top-center"`, `"top-right"`, `"bottom-left"`, `"bottom-center"` e `"bottom-right"`. Qualquer outra coisa lança `Invalid toast position: …`. Cada posição tem a própria stack. Para mudar o padrão de todos os toasts, configure o toaster; veja [Instâncias do toaster](instances.md#configuração).

`margin` define a distância da borda da tela. Aceita um único comprimento CSS para as duas direções, ou `x` e `y` separados:

```ts
toast("Salvo", { margin: "24px" });
toast("Salvo", { margin: { x: "16px", y: "4rem" } });
```

A margem pertence à stack, não a um toast. Todos os toasts na mesma posição compartilham uma margem, então o toast mais recente que a definiu move a stack inteira, e um toast que não a define deixa a stack onde está. Sem margem, a stack fica a 1rem da borda, ou mais longe quando o dispositivo tem notch ou cantos arredondados que pedem mais espaço.

Todo toast tem 22.25rem (356px) de largura e encolhe para caber em telas estreitas. [Estilização](styling.md#tamanho) mostra como mudar isso.

## Como a stack enche

Cada posição mostra no máximo 5 toasts ao mesmo tempo. Defina `maxVisible` no toaster para mudar isso. Quando chega um sexto:

1. O toast novo entra numa fila em que o primeiro a chegar é o primeiro a sair.
2. O toast mais antigo que pode sair começa a fechar para abrir espaço.
3. O toast da fila aparece no lugar dele.

Alguns toasts não podem sair antes da hora, porque puxá-los debaixo do nariz de alguém seria falta de educação:

- Um toast com o ponteiro em cima.
- Um toast com o foco do teclado dentro dele, como no botão de ação.
- Um toast mostrando o spinner de carregamento. Ele representa um trabalho que ainda está rodando.

Se todos os toasts visíveis estiverem protegidos, os novos esperam na fila até um deles ser liberado ou fechar. Quando uma stack fica mais alta que a tela, ela rola sozinha, sem mostrar barra de rolagem, então todo toast continua alcançável.

## Timers e fechamento automático

Um toast se fecha sozinho depois de `duration` milissegundos, 4000 por padrão:

```ts
toast("Lembrete criado", { duration: 8000 });
toast("Leia isto com atenção", { autoDismiss: false });
```

`autoDismiss: false` mantém o toast aberto até ele ser fechado. `duration` precisa ser um número de 0 a 2147483647, ou a chamada lança um erro. Esse teto dá uns 24,8 dias, o máximo que um timer do navegador consegue esperar; um valor maior dispararia na hora, então um toast pensado para ficar um mês sumiria no mesmo instante. Para "nunca", `autoDismiss: false` é o jeito honesto de dizer isso.

A contagem pausa enquanto o ponteiro está em cima do toast, enquanto o foco está dentro dele e enquanto a aba do navegador está em segundo plano. Quando volta, ela continua com o tempo que faltava; não recomeça do zero. O relógio também só começa depois que a animação de entrada termina.

Um toast que fica aberto precisa de uma saída. Defina `dismissible: true` para adicionar um botão de fechar:

```ts
toast.error("Sua nota é longa demais para salvar", { autoDismiss: false, dismissible: true });
```

## Limpando os toasts

```ts
toast.clear(); // fecha todos os toasts deste toaster, visíveis e na fila
toast.dismiss(handle); // o mesmo que handle.dismiss()
toast.dismiss(); // o mesmo que toast.clear()
```

Esses métodos só mexem nos toasts do mesmo toaster. Uma [instância separada](instances.md) cuida dos próprios toasts.

## Conteúdo personalizado

Quando o layout embutido não serve, `toast.custom()` aceita o seu próprio conteúdo. Ele vem em três formas:

```ts
import { toast } from "@codenhub/toaster";

// 1. Uma string, mostrada como texto puro.
toast.custom("Notas da semana 12 exportadas");

// 2. Um nó do DOM, inserido do jeito que está.
const message = document.createElement("p");
const link = document.createElement("a");
link.href = "/trash";
link.textContent = "na lixeira";
message.append("Apagada. Você ainda pode encontrá-la ", link, ".");
toast.custom(message);

// 3. Uma função que recebe o handle e devolve uma string ou um nó.
toast.custom((handle) => {
  const button = document.createElement("button");
  button.textContent = "Entendi";
  button.addEventListener("click", () => handle.dismiss());
  return button;
});
```

Uma string nunca é interpretada como HTML: `toast.custom("<b>Oi</b>")` mostra as tags como caracteres. Isso torna strings seguras para texto que você não controla, como o título de uma nota. Um nó entra exatamente como você o montou, então a segurança dele é responsabilidade sua. [Acessibilidade e segurança](accessibility.md#conteúdo-personalizado-e-confiança) explica essa fronteira.

`toast.custom()` aceita `position`, `duration`, `dismissible`, `autoDismiss`, `className`, `role` e `margin`, seja como segundo argumento, seja junto com `content` num único objeto. Um toast personalizado não tem ícone e, por padrão, é anunciado sem interromper.

O que o conteúdo personalizado não pode ser:

- Uma string vazia ou só com espaços. Ela lança `Toast content must not be an empty string.` em vez de mostrar uma caixa vazia.
- Um nó que não seja um elemento, um nó de texto ou um `DocumentFragment`. Comentários e documentos lançam `Toast content Node must be an Element, Text, or DocumentFragment.`
- Uma função que devolva algo que não seja uma string ou um nó. Isso lança `Toast content must resolve to a string or DOM Node.`

## Quando as chamadas de toast lançam erro

Os toasts validam a entrada no momento da chamada, então um erro estoura exatamente onde você o cometeu, e não algum tempo depois no navegador. Todo erro é um `Error` comum:

| A mensagem começa com                            | Causa                                                             | Correção                                                                          |
| ------------------------------------------------ | ----------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `Toast requires a non-empty message or content.` | Nem `message` nem `title`, ou os dois estão vazios.               | Dê algum texto ao toast.                                                          |
| `Toast duration must be a number from 0…`        | `duration` é negativo, `NaN`, `Infinity` ou maior que 2147483647. | Use de 0 a 2147483647. Para "nunca", use `autoDismiss: false`.                    |
| `Invalid toast position: …`                      | Uma posição fora da lista das seis.                               | Use uma das seis [posições](#posições-e-margens).                                 |
| `Invalid toast role: …`                          | `role` não é `"status"` nem `"alert"`.                            | Use um desses dois.                                                               |
| `Invalid semantic toast type: …`                 | `type` não é uma severidade conhecida.                            | Use `"success"`, `"error"`, `"warning"`, `"info"`, `"default"`.                   |
| `Toast content …`                                | Conteúdo personalizado vazio ou não suportado.                    | Veja [Conteúdo personalizado](#conteúdo-personalizado).                           |
| `DOM document is not available…`                 | Mostrar um toast onde não existe `document`.                      | Mostre toasts só no navegador; veja [SSR](instances.md#renderização-no-servidor). |
| `This toaster instance has been destroyed…`      | Chamar um toaster depois de `destroy()`.                          | Crie um novo com `createToaster()`.                                               |

## Próximos passos

Toasts informam; às vezes você precisa perguntar. [Diálogos](dialogs.md) cobre `confirm`, `prompt` e `alert`, que o app de notas usa para perguntar antes de apagar uma nota e para renomear uma.
