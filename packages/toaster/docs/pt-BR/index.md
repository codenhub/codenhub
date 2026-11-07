---
title: Visão geral
description: Para que serve o Toaster, como instalá-lo e em que ordem ler as páginas.
source: f546b2174525474ecf742bd9c7daf8622b50071e
---

# Toaster

Todo app, cedo ou tarde, precisa dizer dois tipos de coisa para quem está usando. Algumas notícias podem esperar num canto: "Salvo", "Copiado", "Falha na sincronização, tentando de novo". Algumas perguntas não podem: "Apagar esta nota para sempre?" O `@codenhub/toaster` cuida das duas. Toasts são notificações pequenas que se empilham num canto da tela e vão embora sozinhas. Diálogos são perguntas modais que travam a página até alguém responder.

O que ele te poupa de escrever na mão:

- **A stack.** Os toasts se alinham em uma de seis posições da tela. Os que sobram esperam numa fila, e o mais antigo que não estiver ocupado sai para abrir espaço. Um toast fica parado enquanto alguém está com o ponteiro em cima dele, enquanto tem foco dentro dele ou enquanto está esperando um spinner de carregamento.
- **Os timers.** Por padrão, cada toast fecha depois de um tempo definido. A contagem pausa enquanto o ponteiro está em cima dele, enquanto ele tem foco e enquanto a aba do navegador está em segundo plano, então o tempo em que ninguém conseguiria ler não conta.
- **O malabarismo assíncrono.** `toast.promise()` mostra um spinner enquanto o seu trabalho roda e vira um toast de sucesso ou de erro quando ele termina. Os diálogos devolvem algo que você pode usar com `await`, então `if (await dialog.confirm("Apagar?"))` é mesmo `true` ou `false`.
- **O encanamento da acessibilidade.** Leitores de tela ouvem cada toast, com [uma pegadinha enquanto um diálogo modal está aberto](dialogs.md#toasts-enquanto-um-diálogo-está-aberto). Os diálogos usam o próprio elemento `<dialog>` do navegador, então prender o foco, a tecla <kbd>Escape</kbd> e devolver o foco depois vêm todos da plataforma.
- **O dever de casa de segurança.** Strings são sempre mostradas como texto puro e nunca interpretadas como HTML. O pacote não injeta nenhum elemento `<style>`, então uma Content Security Policy rígida não precisa de exceção nenhuma para ele, desde que a própria folha de estilos [carregue como arquivo](styling.md#content-security-policy).

É TypeScript puro trabalhando direto com o DOM. Não tem framework para adotar nem dependência de runtime para instalar.

## Instalação

```sh
pnpm add @codenhub/toaster
```

`npm install`, `yarn add` e `bun add` também funcionam. O pacote é só ESM e tem dois entry points e uma folha de estilos:

| Import                     | O que você recebe                                                     |
| -------------------------- | --------------------------------------------------------------------- |
| `@codenhub/toaster`        | `toast`, um toaster pronto, e `createToaster()` para criar outros.    |
| `@codenhub/toaster/dialog` | `dialog`, uma instância de diálogos pronta, e `createDialogs()`.      |
| `@codenhub/toaster/styles` | A folha de estilos. Obrigatória; sem ela, nada fica com a cara certa. |

Os diálogos ficam num entry point próprio para que um app que só mostra toasts não os leve para o bundle. Um bundle só com toasts custa uns 9 KB com gzip.

## Um primeiro toast

Carregue a folha de estilos uma vez, no arquivo onde o seu app começa, e chame `toast` de qualquer lugar:

```ts
import "@codenhub/toaster/styles";
import { toast } from "@codenhub/toaster";

toast.success("Nota salva");
```

Esse é o setup inteiro. Não tem provider para montar nem container para criar. O primeiro toast cria a própria stack em `document.body`.

O Toaster precisa de um navegador. Importá-lo durante a renderização no servidor é seguro, mas mostrar um toast lá lança um erro, porque não existe página onde colocá-lo. [Instâncias do toaster](instances.md#renderização-no-servidor) explica como lidar com isso.

## Caminho de leitura

As páginas se apoiam umas nas outras e, juntas, seguem um exemplo pequeno: um app de notas que salva, sincroniza, renomeia e apaga notas. Na primeira vez, leia na ordem.

1. [Toasts](toasts.md): todos os tipos de toast, ações, toasts de carregamento e de promise, como atualizar um toast depois que ele aparece, e como a stack, a fila e os timers se comportam.
2. [Diálogos](dialogs.md): `confirm`, `prompt` e `alert`, para o que cada um resolve, como entram na fila, como traduzir os botões e o que acontece com os toasts enquanto um diálogo está aberto.
3. [Instâncias do toaster](instances.md): cada opção de configuração e seu padrão, padrões por tipo de toast, toasters com escopo para painéis e widgets, limpeza com `destroy()` e renderização no servidor.
4. [Estilização](styling.md): a folha de estilos, cores, classes de apresentação, modo escuro e Content Security Policy.
5. [Acessibilidade e segurança](accessibility.md): o que os leitores de tela ouvem, o comportamento de teclado e foco, movimento reduzido e a fronteira de confiança do conteúdo personalizado.

A [referência da API](../reference/index.md) lista cada símbolo exportado e sua assinatura, gerada a partir do código-fonte. O [changelog](../changelog/index.md) diz o que mudou em cada release.

## Requisitos

- Um navegador com suporte nativo a `<dialog>` (`HTMLDialogElement.showModal()`), se você usar diálogos. Todo navegador atual tem.
- `@codenhub/toaster/styles` carregado uma vez na página.
- Opcional: `@codenhub/styles` 0.3.0 ou mais recente. Quando ele está na página, toasts e diálogos pegam as cores e o visual do tema dele. Sem ele, o pacote usa as próprias cores embutidas. [Estilização](styling.md) explica os dois casos.

O pacote é experimental. A API, a renderização e os nomes das classes CSS ainda podem mudar antes de uma versão estável, e o [changelog](../changelog/index.md) diz o que mudou a cada vez.
