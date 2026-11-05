---
title: Visão geral
description: Escolha skills para agentes e instale-as nas pastas certas para suas ferramentas.
source: e8cf45dade9d688c28c9dc80fe8f106bd39dfbf5
---

# Instale e gerencie skills para agentes

Cada ferramenta de agente espera encontrar skills em pastas específicas. Usar várias ferramentas pode significar copiar os mesmos diretórios de skills para cada projeto e para o seu diretório pessoal, e repetir o trabalho quando eles mudam. O `@codenhub/skills` oferece uma coleção selecionada e um instalador que coloca suas escolhas nessas pastas. Decorar os nomes das pastas pode continuar sendo o passatempo de outra pessoa.

Um harness de agente é a aplicação que executa um agente, como Claude ou Codex. Uma skill fornece instruções ao agente para um tipo específico de trabalho. Esta coleção cobre planejamento, programação, revisão, design, branding, escrita e manutenção de orientações para agentes. Você pode instalar só as skills de que precisa; cada uma vem com seus arquivos de apoio e os avisos exigidos.

Esta documentação acompanha um projeto que usa Claude e Codex. Começamos com `brainstorming` para esclarecer uma mudança antes de implementá-la e com `test-driven-development` para implementá-la com testes. Depois, instalamos a mesma dupla globalmente para usá-la em vários projetos.

## Início rápido

Com Node.js 24 ou mais recente, abra um terminal interativo no diretório do seu projeto e execute:

```sh
pnpm dlx @codenhub/skills@latest
```

O equivalente com npm é `npx @codenhub/skills@latest`. Nenhum dos comandos adiciona uma dependência ao seu projeto.

No assistente, escolha o escopo local, recuse a opção de instalar todas as skills, selecione `brainstorming` e `test-driven-development` e escolha `Claude Workspace` e `Codex Workspace`. Deixe a limpeza desativada para manter as outras skills instaladas. O instalador copia os diretórios selecionados para `.claude/skills` e `.agents/skills` dentro do diretório atual.

Para fazer a mesma seleção sem perguntas:

```sh
pnpm dlx @codenhub/skills@latest --local --skills=brainstorming,test-driven-development --harnesses="Claude Workspace,Codex Workspace"
```

Qualquer argumento, exceto `--include-drafts`, desativa o assistente. Sem argumentos e fora de um terminal interativo, o instalador seleciona todas as skills incluídas e os harnesses locais detectados. O [guia da CLI](cli.md#modos) explica a detecção e como escolher destinos explicitamente.

## Antes de instalar

Você precisa de permissão no sistema de arquivos para ler as skills incluídas e gravar em todos os destinos selecionados. Revise as skills que instalar: elas contêm instruções que um agente pode seguir e podem incluir scripts. O instalador copia arquivos; seu harness determina como carregá-los e usá-los. Não há imports de biblioteca para uso programático com suporte oficial.

Arquivos existentes nos mesmos caminhos são sobrescritos, diretórios são mesclados e arquivos obsoletos permanecem. A instalação não tem rollback. A opção `--cleanup` remove toda a pasta de skills selecionada, incluindo skills de outras fontes. Leia [Segurança e falhas](security-and-failures.md) antes de usar a limpeza ou atualizar instalações personalizadas.

## Ordem de leitura

1. [Skills incluídas](skills.md): escolha fluxos de trabalho, entenda o que uma skill contém e conheça o formato, as regras de qualidade e a política de versionamento.
2. [Instalador CLI](cli.md): instale a dupla para Claude e Codex, repita a instalação globalmente e conheça todas as opções, os destinos e as diferenças entre harnesses.
3. [Segurança e falhas](security-and-failures.md): entenda o que uma atualização pode sobrescrever, diagnostique uma instalação parcial e interprete os códigos de saída.
4. [Origem das skills](provenance.md): confira as origens, as licenças e os avisos que precisam ser preservados ao compartilhar skills instaladas.

O [changelog](../changelog/index.md) registra as mudanças de cada versão. O `SKILL.md` instalado e seus arquivos de apoio descrevem os fluxos de trabalho da versão que você instalou.

Comece por [Skills incluídas](skills.md) para decidir quais fazem sentido no seu projeto.
