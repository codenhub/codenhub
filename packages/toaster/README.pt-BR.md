<!-- source: ed397dff330de855ba727407630a388ae64ded85 -->

# @codenhub/toaster

Notificações toast e diálogos modais nativos para o navegador. Os toasts se empilham num canto, entram numa fila quando chegam muitos de uma vez e se fecham sozinhos. Os diálogos fazem uma pergunta e devolvem uma resposta que você pode usar com `await`. Os dois são acessíveis de fábrica, os dois funcionam com uma Content Security Policy rígida, e nenhum dos dois precisa de framework.

> [!WARNING]
>
> Este pacote é experimental. A API, a renderização e os nomes das classes CSS podem mudar antes de uma versão estável. O [changelog](docs/changelog/index.md) lista cada mudança.

## Instalação

```sh
pnpm add @codenhub/toaster
```

## Uso

Carregue a folha de estilos uma vez, onde o seu app começa, e chame `toast` de qualquer lugar. Os diálogos vêm de um entry point próprio, então um app que só mostra toasts não os leva para o bundle:

```ts
import "@codenhub/toaster/styles";
import { toast } from "@codenhub/toaster";
import { dialog } from "@codenhub/toaster/dialog";

toast.success("Nota salva");

// Um spinner de carregamento que vira um toast de sucesso ou de erro quando a promise termina.
const note = await toast.promise(saveNote(draft), {
  loading: "Salvando…",
  success: "Salvo",
  error: "Falha ao salvar",
});

// Resolve para true ou false, e não para um objeto que é sempre truthy.
if (await dialog.confirm("Apagar esta nota?", { type: "error", confirmLabel: "Apagar" })) {
  await deleteNote(note.id);
}
```

Sem provider e sem chamada de setup: o primeiro toast cria a própria stack. Para toasts dentro de um elemento específico, ou configurações separadas por área, crie as suas próprias instâncias com `createToaster()` e `createDialogs()`.

As chamadas validam a entrada e lançam um erro na hora quando algo está errado, como uma mensagem vazia ou uma posição desconhecida. Mostrar um toast ou um diálogo fora do navegador também lança um erro.

## Documentação

- [Visão geral da documentação](docs/pt-BR/index.md): o que o pacote faz e em que ordem ler os guias.
- [Toasts](docs/pt-BR/toasts.md): todos os tipos de toast, ações, toasts de promise, atualizações, fila e timers.
- [Diálogos](docs/pt-BR/dialogs.md): `confirm`, `prompt`, `alert`, fila e rótulos traduzidos.
- [Instâncias do toaster](docs/pt-BR/instances.md): cada opção e seu padrão, toasters com escopo, `destroy()` e SSR.
- [Estilização](docs/pt-BR/styling.md): cores, classes de apresentação, modo escuro e CSP.
- [Acessibilidade e segurança](docs/pt-BR/accessibility.md): leitores de tela, foco, movimento reduzido e conteúdo personalizado.
- [Referência da API](docs/reference/index.md) (em inglês): cada símbolo exportado, gerada a partir do código-fonte.
- [Changelog](docs/changelog/index.md) (em inglês): o que mudou em cada release.

## Requisitos

- Um navegador. Importar e criar instâncias é seguro durante a renderização no servidor, mas mostrar um toast ou um diálogo precisa de um `document`.
- `@codenhub/toaster/styles` carregado uma vez. Sem ele, os toasts ficam sem posição, layout e cor.
- Suporte nativo a `<dialog>` para os diálogos, que todo navegador atual tem.
- Opcional: `@codenhub/styles` 0.3.0 ou mais recente. Quando ele está presente, toasts e diálogos pegam as cores e o visual do tema dele; caso contrário, valem as cores embutidas. Se você usa a folha de estilos de elementos nativos dele, importe-a **antes** de `@codenhub/toaster/styles`, ou os botões dos diálogos perdem as cores. Veja [Estilização](docs/pt-BR/styling.md).
- As instâncias que você cria são donas de elementos do DOM, timers e listeners. Chame `destroy()` quando a área a que elas pertencem sair de cena.

## Licença

Este projeto é licenciado sob a licença [Apache-2.0](LICENSE).

Os ícones SVG do Lucide incluídos no pacote usam a ISC License. Veja [NOTICE](NOTICE).
