---
title: Skills incluídas
description: Escolha fluxos de trabalho no catálogo e entenda o formato, a qualidade e o versionamento das skills.
order: 1
source: 733e3fceb49400a41d91ce438ba8ebfd1ef9ba1f
---

# Escolha suas skills

Uma skill é uma pasta com um arquivo `SKILL.md`: instruções que dizem a um agente quando e como executar um tipo específico de trabalho. Ela também pode incluir referências, scripts, assets e metadados de harness. Instalar uma skill coloca essa pasta onde sua ferramenta de agente pode encontrá-la; o harness decide quando carregá-la, e o agente segue suas instruções durante a tarefa. Uma skill fornece um fluxo de trabalho, sem garantir o resultado.

Para o nosso projeto com Claude e Codex, comece com `brainstorming` quando for preciso esclarecer os requisitos de uma funcionalidade e depois use `test-driven-development` quando a implementação começar. Você não precisa da coleção inteira para usar essa dupla. Cada skill funciona por conta própria.

## Catálogo de skills incluídas

Os IDs na primeira coluna são os nomes de diretório aceitos por `--skills`. Escolha conforme o trabalho que você quer que o agente faça:

| ID da skill               | Quando o agente a usa                                                                                                                                                 |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `brainstorming`           | Antes da implementação, quando é preciso definir requisitos ou comportamento em conjunto.                                                                             |
| `test-driven-development` | Ao mudar o comportamento do código: escrever um teste que falha, implementar e depois refatorar.                                                                      |
| `ponytail`                | Ao programar, para escolher a solução mais simples que funciona e evitar código especulativo.                                                                         |
| `audit`                   | Ao revisar código, pacotes ou pull requests em busca de defeitos, vulnerabilidades, problemas de contrato ou para avaliar se estão prontos para entrega.              |
| `ponytail-review`         | Ao revisar a complexidade, encontrar código para simplificar ou apagar, ou listar trabalho adiado e atalhos.                                                          |
| `babysit-pr`              | Quando recebe o pedido de acompanhar um pull request do GitHub pelo CI e pela revisão, corrigindo verificações e respondendo a revisores até que possa ser integrado. |
| `subagent-specialist`     | Quando o trabalho pode ser delegado: escolher tarefas, orientar quem vai executá-las, revisar os resultados e integrá-los.                                            |
| `agents-md-improver`      | Ao escrever, auditar ou enxugar instruções de repositório para agentes, incluindo `AGENTS.md` e arquivos que o carregam.                                              |
| `project-template`        | Ao criar, adotar, sincronizar ou auditar um projeto baseado no template de projeto compartilhado, ou alterar um arquivo mantido pelo template.                        |
| `writing-skills`          | Ao criar, revisar ou corrigir skills para agentes e avaliar se suas instruções funcionam.                                                                             |
| `branding`                | Ao definir estratégia, voz e mensagens de marca, ou um sistema de identidade visual e suas diretrizes.                                                                |
| `naming`                  | Ao gerar, pesquisar, comparar ou escolher nomes, incluindo nomes no código.                                                                                           |
| `design`                  | Ao criar ou revisar interfaces visuais, tipografia, layout, cor, acessibilidade ou movimento de interface em qualquer meio.                                           |
| `logo-design`             | Ao criar ou refinar um logo, símbolo, favicon ou ícone de aplicativo, com arquivos SVG e regras de uso.                                                               |
| `motion-graphics`         | Ao criar o storyboard, animar ou renderizar um vídeo feito com tecnologia web.                                                                                        |
| `caveman`                 | Quando o usuário pede respostas mais curtas ou um modo de comunicação condensado.                                                                                     |
| `caveman-commit`          | Ao escrever uma mensagem de commit ou preparar alterações em stage para um commit, seguindo a convenção do projeto.                                                   |
| `playful-tone`            | Quando o usuário pede ou aceita um tom mais leve e bem-humorado na documentação ou em outros textos públicos.                                                         |

As skills de planejamento e programação cobrem o caminho de uma mudança proposta até a implementação. As de revisão e entrega ajudam a inspecionar esse trabalho e conduzi-lo por um pull request. As criativas cobrem o nome, a identidade, a interface e o vídeo em torno de um produto. As de orientação e escrita ajudam a manter as instruções e os textos que acompanham o trabalho. Escolha as partes que você usa; instalar a coleção completa é opcional.

## Formato de uma skill

Você só precisa desta seção ao inspecionar um conjunto de arquivos ou criar uma skill. A árvore `skills/` é conteúdo do produto distribuído: suas instruções e seus arquivos de apoio são lidos por harnesses de agente, em vez de publicados como páginas da documentação do pacote.

Cada skill ocupa um subdiretório imediato de um diretório de skills de origem e precisa conter `SKILL.md`, com exatamente essas maiúsculas e minúsculas:

```text
skills/
  example-skill/
    SKILL.md
    NOTICE
    agents/
    references/
    scripts/
    assets/
```

O instalador olha apenas os subdiretórios imediatos e reconhece uma skill pela presença de `SKILL.md`. Ele não procura outras skills em pastas aninhadas. Ele copia todo o diretório da skill, respeitando a [exclusão de `agents` específica por harness](cli.md#comportamento-por-harness).

Os metadados aceitos ficam em um bloco de frontmatter sem aninhamento no início de `SKILL.md`:

```markdown
---
name: example-skill
description: Use when an agent needs the example workflow.
---
```

O instalador lê `name` e `description` para a tela de seleção. O nome do diretório é o ID da skill usado nos comandos e caminhos de destino. Se `name` estiver ausente ou vazio, esse ID é usado no lugar; se `description` estiver ausente ou vazia, nenhuma descrição é exibida. As skills incluídas precisam fornecer os dois campos, conforme as regras de qualidade abaixo.

Mantenha esses campos em linhas `key: value`, sem aninhamento. O instalador lê um bloco de frontmatter no início do arquivo, permitindo uma marca de ordem de bytes (BOM) inicial, com delimitadores `---` que começam em linhas próprias. Ele divide cada linha de metadados no primeiro sinal de dois-pontos e remove os espaços em branco nas extremidades. Os valores continuam sendo strings; linhas sem dois-pontos são ignoradas e, quando uma chave se repete, vale o último valor. Sem um bloco correspondente, o instalador não lê metadados e usa os valores alternativos descritos acima.

Para um valor que começa com aspas simples ou duplas, o instalador pega o texto até as próximas aspas do mesmo tipo e remove as aspas; o texto após as aspas de fechamento é ignorado. Para um valor sem aspas, espaços em branco seguidos de `#` iniciam um comentário ao fim da linha. Coloque entre aspas uma descrição que contenha um ` #` literal para preservá-lo. Esse leitor é limitado, não é um parser YAML completo: ele não interpreta estruturas aninhadas, arrays, valores com várias linhas, conversões de tipo ou sequências de escape. Em particular, `description: >` ou `description: |` exibe o indicador em vez do parágrafo seguinte. Coloque a descrição completa em uma linha só.

Arquivos de apoio em Markdown e YAML, avisos, exemplos e referências podem acompanhar `SKILL.md`. Seu significado depende do harness ou da skill e não é interpretado pelo pacote.

## Regras de qualidade

As skills incluídas seguem a [especificação Agent Skills](https://agentskills.io/specification) e as orientações de criação da skill `writing-skills`, também incluída. A suíte de testes do pacote aplica as regras que podem ser verificadas mecanicamente; por isso, `pnpm test skills` falha quando uma skill incluída viola uma delas:

- `name` corresponde ao diretório, usa letras minúsculas, dígitos e hífens isolados, tem no máximo 64 caracteres e não contém `anthropic` nem `claude`.
- `description` tem uma única linha de 1 a 1024 caracteres, sem tags XML ou indicadores de bloco multilinha dobrado ou literal. `name` também não pode conter tags XML.
- O frontmatter usa apenas as chaves da especificação: `name`, `description`, `license`, `compatibility`, `metadata` e `allowed-tools`.
- O corpo de `SKILL.md` tem menos de 500 linhas.
- Uma skill contém apenas `SKILL.md`, `NOTICE`, `LICENSE`, `agents/`, `references/`, `scripts/` e `assets/`.
- Os arquivos referenciados por `SKILL.md` existem dentro da skill e usam barras normais nos caminhos, e todo arquivo em `references/` é referenciado por `SKILL.md`.
- Arquivos de referência não fazem referência a outros arquivos da skill, e os que têm mais de 100 linhas começam com uma seção `## Contents`.
- Os arquivos Markdown de uma skill não mencionam outra skill incluída, pois o usuário pode não tê-la instalada.
- `agents/openai.yaml` define `display_name`, `short_description` e `default_prompt`.

O restante das orientações de criação, como a redação de uma descrição ou a avaliação de uma mudança, exige julgamento e é tratado na revisão. Para rascunhos, apenas a validade dos metadados é verificada.

## Versionamento

A partir da 1.0, a versão de uma release indica o que muda para quem tem as skills instaladas:

- **Major:** uma skill é removida ou renomeada. O ID de uma skill é o diretório em que o instalador grava, e ele deixa um diretório antigo no lugar; por isso, uma skill removida ou renomeada continua instalada até alguém apagá-la.
- **Minor:** uma skill é adicionada, ou os gatilhos, as regras ou o fluxo de trabalho de uma skill existente mudam.
- **Patch:** mudanças editoriais em uma skill, como redação, formatação ou links, sem intenção de mudar o comportamento.

A CLI segue SemVer normalmente. Opção rejeitada: tratar toda mudança de comportamento de uma skill como quebra de compatibilidade. Quase toda mudança em uma skill altera o que um agente faz, então essa regra tornaria quase toda release uma versão major, e a versão deixaria de indicar quais atualizações precisam da atenção de quem usa o pacote.

Use o `SKILL.md` instalado e os assets que o acompanham como conteúdo oficial da skill para a versão instalada do pacote.

## Rascunhos

Skills ainda em desenvolvimento ficam em `drafts/` no repositório, no mesmo formato. Elas não são publicadas, não aparecem aqui e só são instaladas quando a CLI é executada a partir de um checkout com `--include-drafts` (veja o [guia da CLI](cli.md#skills-em-rascunho)). Promover um rascunho significa mover seu diretório para `skills/` e adicioná-lo a este inventário e à página [Origem das skills](provenance.md).

## Material de terceiros

A maioria das skills incluídas adapta material de terceiros. Os avisos do pacote e de cada skill acompanham os assets pertinentes. Veja [Origem das skills](provenance.md) e o [NOTICE](../../NOTICE) do pacote antes de redistribuir ou modificar esse material.

Em seguida, use o [Instalador CLI](cli.md) para colocar as skills escolhidas nas pastas de projeto que Claude e Codex leem.
