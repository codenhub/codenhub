---
title: Diálogos
description: Diálogos confirm, prompt e alert, para o que resolvem, handles, fila, rótulos dos botões, instâncias de diálogos e toasts enquanto um diálogo está aberto.
order: 2
source: 21eac1aee9d60f85b98243d9fd198235b5e1cb5b
---

# Diálogos

O toast avisa; o diálogo pergunta. Os diálogos travam a página até alguém responder, então são para os momentos que pedem uma decisão: "Apagar esta nota?", "Que nome vamos dar a ela?", "Sua sessão expirou." Esta página cobre os três tipos de diálogo, para o que cada um resolve, como eles fazem fila quando vários são abertos, como traduzir os botões e como eles convivem com os toasts.

Os diálogos vêm de um entry point próprio, então um app que só mostra toasts não paga por eles:

```ts
import { dialog } from "@codenhub/toaster/dialog";
```

Eles usam a mesma folha de estilos dos toasts, `@codenhub/toaster/styles`.

## Confirm

`dialog.confirm()` faz uma pergunta de sim ou não e resolve para um boolean:

```ts
import { dialog } from "@codenhub/toaster/dialog";

if (await dialog.confirm("Apagar esta nota? Não dá para desfazer.")) {
  await deleteNote(note.id);
}
```

Ele resolve para `true` quando o botão de confirmar é apertado e para `false` em qualquer saída: o botão de cancelar, <kbd>Escape</kbd>, um clique no backdrop ou `dismiss()`.

Deixe claro o que está em jogo com um título, rótulos de botão específicos e `type: "error"`, que pinta o botão de confirmar como destrutivo:

```ts
const confirmed = await dialog.confirm('Apagar "Lista de compras"? Não dá para desfazer.', {
  title: "Apagar nota",
  type: "error",
  confirmLabel: "Apagar nota",
  cancelLabel: "Manter",
});
```

"Apagar nota" e "Manter" ganham de "OK" e "Cancelar": ninguém nunca precisou reler um botão que diz exatamente o que faz.

## Prompt

`dialog.prompt()` pede uma linha de texto. Ele resolve para o texto quando enviado, ou para `null` quando cancelado:

```ts
import { dialog } from "@codenhub/toaster/dialog";

const name = await dialog.prompt("Novo nome para esta nota", {
  title: "Renomear nota",
  defaultValue: note.title,
  placeholder: "Sem título",
  submitLabel: "Renomear",
});

if (name !== null && name.trim() !== "") {
  await renameNote(note.id, name.trim());
}
```

O texto volta exatamente como foi digitado, espaços inclusive, e pode vir vazio, então verifique antes de usar. <kbd>Enter</kbd> no campo de texto envia, a não ser que a pessoa esteja no meio da composição de um caractere com um editor de método de entrada (IME), como ao digitar japonês ou chinês. <kbd>Escape</kbd> cancela. A mensagem é o rótulo do campo de texto, então os leitores de tela a anunciam junto com o campo.

## Alert

`dialog.alert()` entrega uma mensagem que precisa ser reconhecida antes de qualquer outra coisa acontecer. É um substituto acessível para `window.alert()`, e resolve para `undefined` depois de fechado:

```ts
import { dialog } from "@codenhub/toaster/dialog";

await dialog.alert("Sua sessão expirou. Entre de novo para continuar editando.", {
  title: "Sessão expirada",
  okLabel: "Entrar",
});

goToSignIn();
```

Um alert tem um botão só, mas <kbd>Escape</kbd> e o backdrop também o fecham. Os três resolvem do mesmo jeito, porque um alert não tem nada a decidir.

## Opções dos diálogos

Os três métodos recebem a mensagem primeiro e um objeto de opções depois:

| Opção             | Diálogos            | Padrão      | O que faz                                                                     |
| ----------------- | ------------------- | ----------- | ----------------------------------------------------------------------------- |
| `title`           | Todos               | Nenhum      | Um título acima da mensagem.                                                  |
| `type`            | Todos               | `"primary"` | Cor do botão principal: `"primary"`, `"secondary"`, `"success"` ou `"error"`. |
| `backdropDismiss` | Todos               | `true`      | Se um clique no backdrop fecha o diálogo como um cancelamento.                |
| `className`       | Todos               | Nenhum      | Classes CSS extras no elemento `<dialog>`.                                    |
| `confirmLabel`    | `confirm`           | `"Confirm"` | Texto do botão de confirmar.                                                  |
| `cancelLabel`     | `confirm`, `prompt` | `"Cancel"`  | Texto do botão de cancelar.                                                   |
| `submitLabel`     | `prompt`            | `"Submit"`  | Texto do botão de enviar.                                                     |
| `okLabel`         | `alert`             | `"OK"`      | Texto do único botão.                                                         |
| `defaultValue`    | `prompt`            | `""`        | Texto que já está no campo quando o diálogo abre.                             |
| `placeholder`     | `prompt`            | Nenhum      | Dica mostrada enquanto o campo está vazio.                                    |

Use `backdropDismiss: false` quando um clique perdido não deve contar como resposta, como num formulário que alguém levou um tempo para preencher. <kbd>Escape</kbd> continua cancelando; é assim que o `<dialog>` do navegador funciona, e quem usa teclado depende disso.

A mensagem não pode ser vazia. Uma mensagem vazia ou só com espaços lança `Interactive dialog message must not be empty.`

## Handles

Cada método devolve um `DialogHandle`. Você pode usar `await` direto nele, como todos os exemplos até aqui fazem. Também pode guardá-lo e controlar o diálogo enquanto ele está aberto:

```ts
import { dialog } from "@codenhub/toaster/dialog";

const question = dialog.confirm("Descartar as alterações não salvas?");

// Fecha o diálogo se a nota for salva de outro jeito nesse meio-tempo.
onAutosave(() => question.dismiss());

const discard = await question;
```

| Membro      | O que é                                                                                                                                        |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `await`     | A resposta: `boolean` para confirm, `string \| null` para prompt, `undefined` para alert.                                                      |
| `result`    | A mesma resposta como uma `Promise` de verdade, para código que quer uma em vez de um valor parecido com promise.                              |
| `dismiss()` | Fecha o diálogo como um cancelamento. Funciona também em diálogos na fila. Pode chamar mais de uma vez sem problema.                           |
| `state`     | `"queued"`, `"visible"`, `"hiding"` ou `"hidden"`, os mesmos estados que [os toasts têm](toasts.md#estado-settled-e-eventos-de-ciclo-de-vida). |
| `settled`   | Uma promise que resolve quando a animação de fechamento termina e o diálogo é limpo.                                                           |

O handle aceitar `await` é a questão toda. Muitas bibliotecas de diálogo devolvem um objeto em `confirm()`, e aí `if (await confirm(...))` é sempre verdadeiro, porque um objeto é sempre truthy. É esse bug que coloca em produção o botão "Cancelar" que apaga mesmo assim. Aqui, `await` te dá a resposta de verdade.

Fechar com dismiss dá a cada tipo o seu valor de cancelamento: `false` para confirm, `null` para prompt, `undefined` para alert.

## Um de cada vez

Uma instância de diálogos mostra um diálogo de cada vez. Chamar `confirm()` enquanto outro diálogo está aberto não empilha um segundo diálogo por cima: o novo espera numa fila, com o estado `"queued"`, e abre quando o atual fecha. Fechar um diálogo que está na fila o tira da fila com o seu valor de cancelamento; ele nunca aparece.

Quando o último diálogo de uma sequência fecha, o foco volta para o elemento que o tinha antes de o primeiro abrir.

Se o navegador se recusar a abrir um diálogo, ou seja, quando `showModal()` lança um erro, o handle desse diálogo rejeita com o erro do navegador, e o próximo diálogo da fila ainda tem a sua vez. Envolva o `await` em `try`/`catch` se a sua página pode chegar a um estado em que isso acontece.

## Rótulos dos botões e tradução

Em vez de passar os rótulos em cada chamada, defina-os uma vez numa instância de diálogos com `createDialogs()`:

```ts
import { createDialogs } from "@codenhub/toaster/dialog";

const dialogs = createDialogs({
  labels: {
    confirm: "Confirmar",
    cancel: "Cancelar",
    submit: "Enviar",
    ok: "Entendi",
  },
});

if (await dialogs.confirm("Apagar esta nota?")) {
  await deleteNote(note.id);
}
```

Um rótulo passado numa chamada específica continua ganhando do rótulo da instância. Os rótulos dos toasts, para o botão de fechar e o nome da stack, são definidos no toaster; veja [Instâncias do toaster](instances.md#configuração).

## Instâncias de diálogos

`createDialogs()` cria uma instância independente com os mesmos métodos `confirm`, `prompt` e `alert` de `dialog`, que nada mais é do que uma instância criada sem opções. Cada instância tem a própria fila.

| Opção       | Padrão          | O que faz                                                                           |
| ----------- | --------------- | ----------------------------------------------------------------------------------- |
| `container` | `document.body` | O elemento ao qual o `<dialog>` é adicionado. Não pode ser mudado depois de criado. |
| `labels`    | Inglês          | Rótulos padrão dos botões: `confirm`, `cancel`, `submit`, `ok`.                     |
| `className` | Nenhum          | Classes CSS extras em todo diálogo desta instância.                                 |

`configure()` muda `labels` e `className` depois. Vale para os diálogos que abrirem a partir daí. Passar `container` para ele lança `Dialogs container cannot be changed after construction.`

`destroy()` fecha o diálogo aberto e descarta os da fila, resolvendo cada um com o seu valor de cancelamento, e remove o elemento `<dialog>` da instância. Chamá-lo duas vezes não faz nada. Qualquer outra chamada depois dele lança `This dialogs instance has been destroyed. Create a new one with createDialogs().`

Abrir um diálogo fora do navegador lança `DOM document is not available. Dialogs require a browser environment.` Assim como os toasts, os diálogos podem ser importados com segurança durante a renderização no servidor; só não podem ser abertos.

## Toasts enquanto um diálogo está aberto

Um diálogo modal deixa o resto da página inerte: nada atrás dele pode ser clicado, receber foco ou ser ouvido por um leitor de tela. Um toast preso atrás do backdrop não serviria para nada, então, enquanto um diálogo deste pacote está aberto, os toasts se mudam para dentro dele.

Mais precisamente: todo toaster que renderiza no mesmo elemento que o diálogo move as suas stacks e os seus anúncios para leitores de tela para dentro do diálogo aberto. Os toasts continuam no canto de sempre, acima do backdrop, e continuam clicáveis e anunciados. Eles voltam assim que o diálogo começa a fechar. Com diálogos abertos dentro de diálogos, os toasts seguem o mais recente.

```ts
const deleting = dialog.confirm("Apagar esta nota?");
toast.info("Salvamento automático pausado"); // aparece acima do backdrop, ainda clicável
```

Toasters com outro container, como um com escopo numa barra lateral, não se mudam. Os toasts deles ficam atrás do backdrop, inertes e sem ser anunciados, até o diálogo fechar, e também não são anunciados depois.

### Os seus próprios diálogos modais

Isso só funciona com os diálogos deste pacote. Um `<dialog>` que o seu app abre com `showModal()` também deixa a página inerte, e o pacote não vai mover os toasts para dentro dele. Os toasts mostrados enquanto ele está aberto ficam atrás do backdrop dele, onde ninguém consegue clicar neles e os leitores de tela os pulam.

A solução é um toaster que mora dentro do seu diálogo. Crie-o quando o diálogo abrir e destrua-o quando ele fechar:

```ts
import { createToaster } from "@codenhub/toaster";

const settings = document.querySelector<HTMLDialogElement>("#settings")!;
const settingsToaster = createToaster({ container: settings });

settings.showModal();
settingsToaster.success("Preferências salvas");

settings.addEventListener("close", () => settingsToaster.destroy(), { once: true });
```

## Próximos passos

O app de notas agora tem toasts e diálogos vindos das instâncias prontas. [Instâncias do toaster](instances.md) cobre cada opção de configuração, os padrões por tipo de toast e toasters separados como o do exemplo acima.
