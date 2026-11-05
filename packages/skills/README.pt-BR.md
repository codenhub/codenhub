<!-- source: e163eb0eaf899b9ba2a67737a0661d11c6d1ba0b -->

# @codenhub/skills

Uma coleção selecionada de skills para agentes e uma CLI que as instala nas pastas certas para suas ferramentas de agente. Escolha os fluxos de trabalho que você quer e instale-os em um projeto, no seu diretório pessoal ou nos dois.

## Instalação

Execute o instalador sem adicioná-lo a um projeto:

```sh
pnpm dlx @codenhub/skills@latest
```

Ou use npm:

```sh
npx @codenhub/skills@latest
```

## Uso

Execute o comando a partir do diretório do seu projeto. Em um terminal interativo, o assistente pergunta onde instalar, se você quer incluir todas as skills ou escolher algumas, quais harnesses de agente usar como destino e se deseja limpar as pastas de skills antes. A limpeza vem desativada por padrão.

Para repetir uma instalação sem perguntas, selecione as skills e os destinos explicitamente:

```sh
pnpm dlx @codenhub/skills@latest --local --skills=brainstorming,test-driven-development --harnesses="Claude Workspace,Codex Workspace"
```

A coleção cobre planejamento e implementação (`brainstorming`, `test-driven-development`, `ponytail`), revisão e entrega (`audit`, `babysit-pr`), trabalho criativo (`branding`, `design`, `logo-design`, `motion-graphics`, `naming`), além de orientação para agentes e escrita. Veja todas as skills e quando cada uma se aplica no [catálogo de skills](docs/pt-BR/skills.md).

## Documentação

- [Visão geral da documentação](docs/pt-BR/index.md): documentação completa do pacote.
- [Skills incluídas](docs/pt-BR/skills.md): escolha skills e entenda seu formato e versionamento.
- [Instalador CLI](docs/pt-BR/cli.md): opções, destinos e comportamento por harness.
- [Segurança e falhas](docs/pt-BR/security-and-failures.md): riscos da limpeza, instalações parciais e recuperação.
- [Changelog](docs/changelog/index.md): histórico de versões.

## Requisitos

- Node.js 24 ou mais recente.
- Permissão no sistema de arquivos para ler as skills de origem e modificar os destinos selecionados.
- Um terminal interativo (TTY) para o assistente; opções explícitas da CLI permitem automatizar a instalação.

## Observações

- Por padrão, o conteúdo é mesclado ao existente e os arquivos nos mesmos caminhos são sobrescritos; arquivos obsoletos só são removidos com `--cleanup`.
- `--cleanup` remove recursivamente todo o diretório de skills de cada harness selecionado antes da instalação.
- A instalação grava diretamente no disco, sem rollback. Faça backup das skills personalizadas antes de atualizar; veja o [comportamento em caso de falha](docs/pt-BR/security-and-failures.md).
- O pacote fornece um instalador CLI, sem imports de biblioteca para uso programático com suporte oficial.

## Licença

Licenciado sob Apache-2.0. As skills incluídas contêm material adaptado de terceiros; veja [NOTICE](NOTICE) e a [origem das skills](docs/pt-BR/provenance.md).
