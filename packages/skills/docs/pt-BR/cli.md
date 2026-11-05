---
title: Instalador CLI
description: Instale skills selecionadas local ou globalmente, escolha destinos por harness e automatize atualizações.
order: 2
source: 4761509a7377dab69047fda9d2571b93463e4a3f
---

# Instale skills nas suas ferramentas de agente

Depois de [escolher as skills](skills.md), o instalador copia suas pastas para os locais que suas ferramentas de agente leem. Este guia instala `brainstorming` e `test-driven-development` para Claude e Codex em um projeto e depois disponibiliza a mesma dupla globalmente.

O executável se chama `codenhub-skills`. Use um executor de pacotes para rodá-lo sem adicionar uma dependência ao projeto:

```sh
pnpm dlx @codenhub/skills@latest
```

Use `npx @codenhub/skills@latest` para o equivalente com npm. É necessário ter Node.js 24 ou mais recente.

## Comece em um projeto

Abra um terminal no diretório do repositório em que você quer as skills. Os caminhos locais são relativos ao diretório atual, então executar a partir de um subdiretório instala as skills nele; o instalador não procura a raiz do repositório nos diretórios acima.

Execute o comando acima em um terminal interativo e siga estes passos:

1. Escolha **Locally (project workspace)**, o escopo padrão.
2. Responda **No** à pergunta sobre instalar todas as skills. O padrão é **Yes**; recusar abre a tela de seleção individual, inicialmente com todas as skills marcadas.
3. Deixe apenas `brainstorming` e `test-driven-development` selecionadas.
4. Selecione `Claude Workspace` e `Codex Workspace`, desmarcando os outros harnesses que estiverem selecionados.
5. Deixe a limpeza no padrão, **No**, para manter as outras skills instaladas.

Use as setas para cima e para baixo para navegar, Espaço para marcar ou desmarcar opções e Enter para confirmar uma etapa. Backspace ou a seta para a esquerda volta à etapa anterior quando essa opção está disponível. Ctrl+C cancela o assistente. Assim que você confirma a etapa de limpeza, a instalação começa.

Cada skill fica em um subdiretório de `.claude/skills` e de `.agents/skills`. Por exemplo, o Codex recebe `.agents/skills/brainstorming/SKILL.md`. Os diretórios de destino que não existem são criados. Por padrão, diretórios existentes são mesclados e arquivos nos mesmos caminhos são sobrescritos; arquivos que existem apenas no destino permanecem. Faça backup das alterações locais antes de atualizar.

O instalador copia os arquivos e informa o resultado. Consulte as instruções do seu harness para carregar as skills instaladas; o pacote não valida se um harness consegue interpretar todos os arquivos incluídos.

## Modos

O assistente aparece apenas quando a entrada padrão (stdin) é um TTY (um terminal interativo) e nenhum argumento é fornecido, com uma exceção: `--include-drafts` sozinho mantém o modo interativo. Escopo, seleção de skills, harnesses e limpeza são escolhas feitas no assistente. Os caminhos de harnesses detectados vêm selecionados; altere a seleção antes de confirmar se quiser menos destinos.

Quando stdin não é um TTY ou qualquer outro argumento é fornecido, a CLI não faz perguntas. Até `--local` sozinho inicia uma instalação com os padrões: todas as skills, escopo local, harnesses detectados e nenhuma limpeza. Use seleções explícitas em scripts para que o resultado não dependa das pastas que já existem.

A detecção verifica se a pasta de destino das skills ou sua pasta pai existe; ela não verifica se a aplicação do harness está instalada. Por exemplo, a existência de um diretório `.claude/` detecta `Claude Workspace` mesmo sem `.claude/skills/`. A detecção se limita ao escopo selecionado. Se nada for detectado, o comando falha. Escolha rótulos com `--harnesses` para criar os destinos correspondentes ou use `--all-harnesses` para selecionar todos os destinos daquele escopo.

## Repita a seleção sem perguntas

Este comando instala nossas duas skills para Claude e Codex no repositório atual, mesmo que as pastas ainda não existam:

```sh
pnpm dlx @codenhub/skills@latest --local --skills=brainstorming,test-driven-development --harnesses="Claude Workspace,Codex Workspace"
```

Para instalar a mesma dupla no seu diretório pessoal, mude tanto o escopo quanto os rótulos:

```sh
pnpm dlx @codenhub/skills@latest --global --skills=brainstorming,test-driven-development --harnesses="Claude Global,Codex Global"
```

O escopo global usa locais fixos no seu diretório pessoal, independentemente do projeto atual. Para fazer as duas instalações em uma execução, use `--both` e liste os quatro rótulos:

```sh
pnpm dlx @codenhub/skills@latest --both --skills=brainstorming,test-driven-development --harnesses="Claude Workspace,Codex Workspace,Claude Global,Codex Global"
```

As cópias locais e globais são arquivos separados. Atualizar uma não atualiza a outra. Se ambas estiverem instaladas, seu harness determina como resolvê-las.

## Opções

| Opção                | Comportamento                                                                                                    |
| -------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `--local`            | Usa os destinos do workspace. Este é o escopo padrão.                                                            |
| `--global`           | Usa destinos no diretório pessoal do usuário atual.                                                              |
| `--both`             | Inclui tanto os destinos do workspace quanto os globais.                                                         |
| `--skills=<list>`    | Instala os IDs de skills separados por vírgulas, diferenciando maiúsculas de minúsculas.                         |
| `--all-skills`       | Instala todas as skills disponíveis. Este é o padrão; rascunhos são incluídos quando habilitados.                |
| `--harnesses=<list>` | Instala nos rótulos de harnesses separados por vírgulas, sem diferenciar maiúsculas de minúsculas.               |
| `--all-harnesses`    | Seleciona todos os harnesses válidos para o escopo escolhido.                                                    |
| `--cleanup`          | Remove por inteiro os diretórios raiz de destino das skills selecionados antes de copiar. Desativado por padrão. |
| `--include-drafts`   | Também oferece skills em rascunho. Funciona apenas a partir de um checkout do repositório.                       |
| `--help`, `-h`       | Exibe a ajuda do comando.                                                                                        |

Os rótulos dos harnesses incluem o escopo, por exemplo, `Claude Workspace` e `Claude Global`. Um rótulo fornecido a `--harnesses` precisa ser válido para o escopo selecionado. Coloque a lista inteira entre aspas, como nos exemplos acima, para manter rótulos com espaços em um único argumento.

Use a forma com `=` nas opções de lista: `--skills=brainstorming`, e não `--skills brainstorming`. As listas removem espaços em branco nas extremidades de cada item, ignoram itens vazios separados por vírgulas e eliminam entradas idênticas repetidas, mas precisam conter pelo menos um item. IDs de skills desconhecidos e rótulos de harnesses inválidos causam falha antes da instalação.

Prefira uma opção de escopo e uma forma de seleção por lista. Se houver repetição, a última opção de escopo prevalece, e a última lista `--skills` ou `--harnesses` substitui as anteriores. `--all-skills` e `--all-harnesses` têm precedência sobre suas respectivas listas, embora uma lista sintaticamente vazia ainda cause falha. Argumentos desconhecidos causam falha. A ajuda exibe o uso e encerra sem instalar, após carregar as fontes das skills.

## Destinos de instalação

Os caminhos do workspace são resolvidos a partir do diretório de trabalho atual do processo. Os caminhos globais são resolvidos a partir do diretório pessoal do usuário atual. Os destinos `Agent Skills` são os locais padrão compartilhados entre harnesses (`.agents/skills`) que a maioria deles lê nativamente; instale neles, e não no diretório próprio do harness, quando o harness ler os dois.

| Harness      | Destino no workspace | Destino global               |
| ------------ | -------------------- | ---------------------------- |
| Agent Skills | `.agents/skills`     | `~/.agents/skills`           |
| Antigravity  | `.agents/skills`     | `~/.gemini/config/skills`    |
| Claude       | `.claude/skills`     | `~/.claude/skills`           |
| Cline        | `.cline/skills`      | `~/.cline/skills`            |
| Codex        | `.agents/skills`     | `~/.agents/skills`           |
| Copilot      | `.github/skills`     | `~/.copilot/skills`          |
| Cursor       | `.cursor/skills`     | `~/.cursor/skills`           |
| Gemini CLI   | `.gemini/skills`     | `~/.gemini/skills`           |
| Kiro         | `.kiro/skills`       | `~/.kiro/skills`             |
| OpenCode     | `.opencode/skills`   | `~/.config/opencode/skills`  |
| Trae         | `.trae/skills`       | `~/.trae/skills`             |
| Windsurf     | `.windsurf/skills`   | `~/.codeium/windsurf/skills` |
| ZCode        | `.zcode/skills`      | `~/.zcode/skills`            |

Vários rótulos apontam para o mesmo diretório porque os harnesses também o leem: `Agent Skills Workspace`, `Antigravity Workspace` e `Codex Workspace` compartilham `.agents/skills`; `Agent Skills Global` e `Codex Global` compartilham `~/.agents/skills`. Selecionar rótulos que compartilham um destino instala cada skill uma só vez, em vez de copiá-la repetidamente.

Isso significa que selecionar `Agent Skills Workspace` e `Codex Workspace` juntos não cria duas instalações independentes. Eles apontam para os mesmos arquivos, então atualizações ou limpeza afetam as skills lidas por todos os harnesses que usam aquele caminho.

## Comportamento por harness

Destinos selecionados por um rótulo do Codex recebem o diretório completo da skill incluída, com o diretório `agents` quando a skill tem um. Todos os outros destinos excluem entradas cujo nome base seja exatamente `agents`, em qualquer nível. Quando um rótulo do Codex compartilha um destino com outros rótulos selecionados, a cópia compartilhada mantém o diretório `agents`. Outras referências, exemplos, avisos e arquivos de apoio são copiados sem alterações.

No nosso exemplo, o Codex recebe o `agents/openai.yaml` de cada skill quando ele existe; a cópia do Claude o exclui. Selecionar apenas `Agent Skills Workspace` também exclui entradas `agents`, embora o Codex leia esse destino. Selecione um rótulo do Codex quando quiser incluir seus metadados. A exclusão ignora entradas da origem; ela não apaga uma pasta `agents` deixada por uma instalação anterior.

## Limpeza destrutiva

`--cleanup` remove recursivamente todo o destino de skills de cada harness selecionado antes da instalação. Isso apaga todo o conteúdo daquele diretório, incluindo skills e arquivos que não são gerenciados pelo `@codenhub/skills`. No nosso exemplo local, adicionar essa opção remove `.claude/skills` e `.agents/skills` por inteiro, mesmo com apenas duas skills selecionadas. Rótulos que compartilham um destino, como `Codex Workspace` e `Agent Skills Workspace`, removem aquele diretório uma só vez.

Todos os diretórios raiz selecionados são limpos antes de qualquer skill ser copiada. Faça backup desses diretórios e confira antes o diretório de trabalho atual e o escopo selecionado. Para remover uma única skill obsoleta, apague a pasta dela em vez de limpar toda a raiz.

Uma falha na limpeza é exibida, e o instalador continua copiando para aquele destino, o que pode deixar uma mistura de conteúdo antigo e novo. Uma falha apenas na limpeza não define um código de saída diferente de zero. Ao automatizar a limpeza, confira tanto a saída quanto o status de saída. A cópia não tem rollback; veja como se recuperar em [Segurança e falhas](security-and-failures.md).

## Skills em rascunho

Skills ainda em desenvolvimento ficam no repositório, ao lado das incluídas, em `packages/skills/drafts/`, e não são publicadas. O instalador as ignora, a menos que você forneça `--include-drafts`, que as adiciona às skills oferecidas, cada uma marcada com `(draft)` no assistente. A opção define de onde vêm as skills, e não quais instalar; por isso, sozinha, mantém o assistente. Com outras opções, `--all-skills` e a seleção padrão também incluem os rascunhos.

Execute a partir de um checkout após fazer o build do pacote, usando como diretório atual aquele em que deseja instalar:

```sh
pnpm build skills
node <checkout>/packages/skills/dist/cli.js --include-drafts
```

Substitua `<checkout>` pelo caminho do checkout do repositório. O comando de build é executado a partir desse checkout; execute o comando `node` a partir do projeto em que as skills em rascunho devem ser instaladas.

Se não houver rascunhos, inclusive em uma instalação publicada, a opção falha com código de saída `1`. Um rascunho cujo ID coincide com o de uma skill incluída também causa falha. Use o instalador publicado sem essa opção para instalações normais.

## Exemplo de automação

Para ampliar nosso exemplo para todos os harnesses de workspace com suporte, substitua a lista explícita de harnesses por `--all-harnesses`:

```sh
pnpm dlx @codenhub/skills@latest --local --all-harnesses --skills=brainstorming,test-driven-development
```

Isso cria todos os destinos locais da tabela, mesmo para ferramentas que você não usa. Para um script de configuração controlado, a seleção explícita de Claude e Codex acima restringe os destinos. Fixe uma versão exata do pacote no lugar de `@latest` quando o script precisar instalar o mesmo conteúdo publicado a cada execução.

Em seguida, leia [Segurança e falhas](security-and-failures.md) para interpretar códigos de saída e se recuperar quando apenas parte de uma instalação dá certo.
