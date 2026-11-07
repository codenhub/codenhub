---
title: Instâncias do toaster
description: Cada opção do toaster e seu padrão, padrões por tipo, mudar as configurações depois, toasters com escopo, limpeza com destroy() e renderização no servidor.
order: 3
source: b05de81b814ec6c33eb246f3e2fd489e0f1f273c
---

# Instâncias do toaster

Até aqui, tudo passou por `toast`, o toaster pronto. Esta página é sobre criar os seus próprios com `createToaster()`, e sobre as opções que os dois compartilham: onde os toasts aparecem, quanto tempo ficam, quantos cabem e o que dizem os rótulos embutidos. Ela também cobre a limpeza, que passa a importar no momento em que um toaster mora dentro de algo que pode sumir, e a renderização no servidor.

## Quando você precisa de um próprio

A maioria dos apps nunca precisa de mais do que `toast`, configurado uma vez. Crie um toaster separado quando:

- Os toasts pertencem a um elemento específico, como um painel lateral, um widget embutido ou [o seu próprio diálogo modal](dialogs.md#os-seus-próprios-diálogos-modais), e não à página inteira.
- Você está fazendo um widget que vai ser embutido em páginas que você não controla, e os toasts dele não devem se misturar com os da página hospedeira.
- Você quer um toaster novo por teste, para que os toasts que sobraram de um teste não derrubem o próximo.

Para configurações diferentes em partes diferentes de uma mesma página, as opções por chamada em `toast` costumam bastar. Mais toasters significam mais stacks, e [dois toasters no mesmo canto](#instâncias-são-independentes) acabam um em cima do outro.

## Configuração

`createToaster()` aceita um objeto de configuração opcional. Todos os campos são opcionais:

```ts
import { createToaster } from "@codenhub/toaster";

const sidebarToaster = createToaster({
  container: document.querySelector<HTMLElement>("#sidebar")!,
  position: "bottom-left",
  maxVisible: 3,
  duration: 6000,
  dismissible: true,
  labels: { dismiss: "Fechar notificação" },
});

sidebarToaster.success("Pasta criada");
```

| Opção         | Padrão                                | O que faz                                                                                                                                                   |
| ------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `container`   | `document.body`                       | O elemento ao qual as stacks de toasts são adicionadas. Não pode ser mudado depois.                                                                         |
| `position`    | `"top-right"`                         | Onde os toasts aparecem quando a chamada não diz. Uma das seis [posições](toasts.md#posições-e-margens).                                                    |
| `maxVisible`  | `5`                                   | Quantos toasts cada posição mostra ao mesmo tempo antes de o resto [entrar na fila](toasts.md#como-a-stack-enche). Um número inteiro maior ou igual a 1.    |
| `duration`    | `4000`                                | Milissegundos até um toast se fechar sozinho. 0 ou mais.                                                                                                    |
| `autoDismiss` | `true`                                | Se os toasts se fecham sozinhos depois de `duration`.                                                                                                       |
| `dismissible` | `false`                               | Se os toasts ganham um botão de fechar.                                                                                                                     |
| `margin`      | 1rem, ou a área segura do dispositivo | Distância da borda, como um comprimento CSS ou `{ x, y }`. Veja [margens](toasts.md#posições-e-margens).                                                    |
| `className`   | Nenhum                                | Classes CSS extras em todo toast deste toaster.                                                                                                             |
| `labels`      | Inglês                                | `dismiss`, o nome acessível do botão de fechar (`"Dismiss toast"`), e `notifications`, o nome que os leitores de tela dão a cada stack (`"Notifications"`). |
| `semantic`    | Nenhum                                | Padrões para `success`, `error`, `warning`, `info` e os resultados de `promise`. Veja [Padrões por tipo](#padrões-por-tipo).                                |
| `loading`     | Nenhum                                | Padrões para toasts `loading` e a parte de carregamento de `promise`.                                                                                       |
| `custom`      | Nenhum                                | Padrões para toasts `custom`.                                                                                                                               |

O `toast` que você importa é um toaster criado sem opções, então esses padrões são exatamente como ele se comporta até você chamar `configure()` nele.

`createToaster()` copia a configuração. Mudar depois o objeto que você passou não faz nada; use `configure()` para isso.

Valores inválidos lançam um erro na hora, quando o toaster é criado:

- `Toaster duration must be a finite number greater than or equal to 0.`
- `Toaster maxVisible must be a positive integer.` Um `maxVisible` de 0, 2.5 ou -1 lança, em todos os casos.
- `Toaster nested duration must be a finite number greater than or equal to 0.` A mesma regra para `semantic.duration` e `custom.duration`.
- `Invalid toast position: …` Para `position` ou qualquer `position` por tipo.

## Padrões por tipo

Às vezes um tipo de toast precisa de padrões diferentes. Erros, por exemplo, costumam merecer mais tempo de leitura e um botão de fechar, porque ninguém lê uma mensagem de erro em menos de 4 segundos, muito menos aquela que diz que o trabalho foi perdido:

```ts
import { createToaster } from "@codenhub/toaster";

const notesToaster = createToaster({
  duration: 4000,
  semantic: { duration: 8000, dismissible: true },
  loading: { position: "bottom-right" },
  custom: { autoDismiss: false },
});
```

| Grupo      | Vale para                                                        | Campos                                                                    |
| ---------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `semantic` | `success`, `error`, `warning`, `info` e o resultado de `promise` | `position` (não para `promise`), `duration`, `dismissible`, `autoDismiss` |
| `loading`  | `loading` e a parte de carregamento de `promise`                 | `position`, `dismissible`                                                 |
| `custom`   | `custom`                                                         | `position`, `duration`, `dismissible`, `autoDismiss`                      |

Uma chamada simples a `toast()` usa só as configurações da instância. Para todos os outros tipos, cada configuração é procurada nesta ordem, e a primeira que estiver definida ganha:

1. A opção passada na própria chamada.
2. O grupo por tipo correspondente.
3. A configuração da instância.
4. O padrão embutido.

Com a configuração acima, `notesToaster.error("Falha na sincronização")` fica 8 segundos com um botão de fechar, `notesToaster("Salvo")` fica 4, e `notesToaster.error("Falha na sincronização", { duration: 2000 })` fica 2. Uma opção definida como `undefined` numa chamada conta como não definida, então ela não apaga o padrão por tipo.

O resultado de `promise` dribla essas regras em dois pontos, porque ele é o próprio toast de carregamento atualizado no lugar, e não um toast novo:

- **Posição** nunca muda, então vem do grupo `loading` ou da instância, não de `semantic`.
- **`autoDismiss`** vem das opções do próprio resultado, depois de `semantic.autoDismiss`, depois `true`. O `autoDismiss` da instância é pulado, então `createToaster({ autoDismiss: false })` sozinho não mantém os resultados de promise abertos; para isso, defina `semantic: { autoDismiss: false }`.

## Mudando as configurações depois

`configure()` muda qualquer opção, menos `container`. Passe só o que muda:

```ts
import { toast } from "@codenhub/toaster";

toast.configure({
  position: "bottom-center",
  labels: { dismiss: "Fechar", notifications: "Notificações" },
});
```

A maioria das mudanças vale para os toasts mostrados depois. Três valem na hora para os toasts que já estão na tela:

- **`maxVisible`**: diminuir o valor fecha na hora os toasts mais antigos que passarem do novo limite, menos os [protegidos](toasts.md#como-a-stack-enche), que saem quando forem liberados.
- **`margin`**: as stacks existentes se movem.
- **`labels.notifications`**: as stacks existentes são renomeadas.

`configure()` valida do mesmo jeito que `createToaster()` e lança os mesmos erros. Passar `container` lança `Toaster container cannot be changed after construction.` Para mover os toasts para outro lugar, crie um toaster novo lá e destrua o antigo.

## Limpando com `destroy()`

Um toaster adiciona elementos, timers e event listeners à página. Quando aquilo a que ele pertence sai de cena, como uma barra lateral fechando ou um widget sendo desmontado, chame `destroy()`:

```ts
import { createToaster } from "@codenhub/toaster";

function mountSidebar(sidebar: HTMLElement) {
  const sidebarToaster = createToaster({ container: sidebar });

  // … use o sidebarToaster enquanto a barra lateral estiver aberta …

  return function unmountSidebar() {
    sidebarToaster.destroy();
  };
}
```

`destroy()` age na hora, sem animações:

1. Todos os toasts, visíveis ou na fila, fecham de uma vez. O estado deles vira `"hidden"` e as promises `settled` resolvem.
2. As stacks e as regiões de leitor de tela do toaster são removidas da página.
3. Os timers e listeners dele são removidos.
4. Toda chamada posterior a ele lança `This toaster instance has been destroyed. Create a new one with createToaster().`

Chamar `destroy()` de novo não faz nada, então ele é seguro em código de limpeza que pode rodar duas vezes. Destruir um toaster não afeta nenhuma instância de diálogos, e destruir uma instância de diálogos não afeta os toasters.

Dá para destruir o `toast` pronto também, mas não tem como recuperá-lo depois. Deixe-o quieto, a não ser que o app inteiro esteja sendo desligado.

## Instâncias são independentes

Dois toasters nunca se coordenam. Cada um tem as próprias stacks, a própria fila e o próprio `maxVisible`, mesmo na mesma posição:

```ts
const first = createToaster({ position: "top-right" });
const second = createToaster({ position: "top-right" });

first.success("Do primeiro toaster");
second.success("Do segundo toaster"); // desenhado por cima do primeiro
```

As duas stacks ficam no mesmo canto e se sobrepõem. Dê posições ou containers diferentes para toasters diferentes, ou use um toaster só com opções por chamada.

## Renderização no servidor

O Toaster pode ser importado em qualquer lugar. Criar um toaster, inclusive o `toast` pronto, não mexe na página, então é seguro durante a renderização no servidor. Mostrar alguma coisa precisa de uma página, então uma chamada de toast ou de diálogo feita onde não existe `document` lança:

- `DOM document is not available. Toaster operations require a browser environment.`
- `DOM document is not available. Dialogs require a browser environment.`

Em Next.js, Remix, SvelteKit, Astro e frameworks parecidos, mostre os toasts a partir de código que só roda no navegador: event handlers, effects (`useEffect`, `onMount`) ou módulos só de cliente:

```tsx
"use client";

import { toast } from "@codenhub/toaster";

export function SaveButton({ onSave }: { onSave: () => Promise<void> }) {
  return <button onClick={() => toast.promise(onSave(), { loading: "Salvando…", success: "Salvo", error: "Falha ao salvar" })}>Salvar</button>;
}
```

## Próximos passos

O app de notas tem todos os toasts e diálogos de que precisa. Hora de fazer com que eles pareçam parte da casa: [Estilização](styling.md) cobre cores, apresentação, tamanho, modo escuro e Content Security Policy.
