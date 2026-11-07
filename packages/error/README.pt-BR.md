<!-- source: 736e4ede3d33716e688ebb49dae4a39535510100 -->

# @codenhub/error

Transforma qualquer coisa que o seu código TypeScript capture em um único `AppError` previsível. Cada um vem com uma mensagem segura para mostrar, uma chave de tradução, um código para decidir o que fazer, uma flag que diz se dá para tentar de novo com segurança e o valor original guardado para os seus logs. Você descreve as falhas que conhece uma vez só, em um registro, e presets opcionais cobrem falhas comuns de navegador, Node.js, HTTP e Supabase. Para quem prefere devolver falhas em vez de lançar exceção, o pacote também traz helpers de resultado.

Resumindo: o `catch` te entrega um `unknown`, e isto te entrega algo que dá para mostrar para uma pessoa de verdade.

## Instalação

```sh
pnpm add @codenhub/error
```

## Uso

Descreva as suas falhas uma vez, quando a aplicação inicia, e depois normalize tudo o que capturar:

```ts
import { createAppError, getErrorRegistry } from "@codenhub/error";
import { browserErrorRegistry } from "@codenhub/error/registries/browser";

const registry = getErrorRegistry();

registry.merge(browserErrorRegistry);
registry.codes.add("project.limit_reached", {
  message: "Você atingiu o limite de projetos do seu plano. Arquive um projeto e tente de novo.",
  messageKey: "error.project.limitReached",
});

try {
  await createProject(draft);
} catch (caught) {
  const error = createAppError(caught);

  showToast(error.message);
}
```

Uma falha que ninguém registrou vira `type: "unknown"` com a mensagem `"An unexpected error occurred."`, nunca com o texto cru dela. O seu cliente não precisa decorar o nome das suas tabelas.

## Documentação

- [Visão geral](docs/pt-BR/index.md): para que o pacote serve, um tour de cinco minutos e o caminho de leitura.
- [Primeiros passos](docs/pt-BR/getting-started.md): configure uma aplicação real, passo a passo.
- [O AppError](docs/pt-BR/app-error.md): cada campo, e como mandar um erro do servidor para o cliente.
- [Registros](docs/pt-BR/registries.md) e [Presets](docs/pt-BR/presets.md): como as falhas são reconhecidas, e todas as falhas que os presets conhecem.
- [Resultados](docs/pt-BR/results.md): `Result`, `attempt` e os helpers que os encadeiam.
- [Error boundaries](docs/pt-BR/frameworks.md): fallbacks em React e Svelte que mostram um erro normalizado.
- [Receitas](docs/pt-BR/recipes.md): status HTTP, Supabase, novas tentativas, traduções, envio de erros para monitoramento e testes.
- [Ressalvas e limitações](docs/pt-BR/caveats.md): o que o pacote não faz, e como contornar.
- [Referência da API](docs/reference/index.md) (em inglês): todos os exports, gerados a partir do código-fonte.
- [Changelog](docs/changelog/index.md) (em inglês): o que mudou em cada versão.

## Requisitos

- Node.js 24 ou mais recente, ou um navegador, worker ou runtime de edge compatível com ES2022 e com suporte nativo a `cause` em `Error`.
- ESM. Código CommonJS pode carregá-lo com `require()` nos runtimes que permitem fazer `require` de módulos ES.
- Nenhuma dependência em runtime, e nenhum acesso a globais do navegador ou do Node.js.
- O adaptador de React precisa do React 18 ou mais recente, e o de Svelte precisa do Svelte 5.3 ou mais recente. Os dois são peer dependencies opcionais.

## Observações

- Presets não mudam nada até você fazer o merge deles, e o último mapeamento adicionado para um identificador é o que vale.
- O registro global é estado compartilhado do módulo: configure-o uma vez na inicialização, não a cada requisição.
- `isRetryable` quer dizer que repetir a chamada que falhou não tem como fazê-la rodar duas vezes, não que uma nova tentativa provavelmente vai dar certo. Tente de novo só em volta da chamada que falhou.
- Os valores de `messageKey` nativos são estáveis; o pacote vem só com mensagens em inglês.

## Licença

Este projeto é licenciado sob a licença [Apache-2.0](LICENSE).
