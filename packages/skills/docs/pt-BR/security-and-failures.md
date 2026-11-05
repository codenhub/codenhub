---
title: Segurança e falhas
description: Entenda os riscos de sobrescrita e limpeza, diagnostique falhas de instalação e se recupere de gravações parciais.
order: 3
source: 2e1bc5678c893e5bf5327e32407eba66f7f0edca
---

# Instale com segurança e se recupere de falhas

A instalação do [exemplo com Claude e Codex](cli.md#repita-a-seleção-sem-perguntas) grava diretamente em duas pastas de skills. Esta página explica o que pode mudar nelas, o que as verificações de caminho do instalador protegem e como se recuperar se a cópia falhar. O instalador lê e grava de forma síncrona e não tem rollback.

## Proteja as skills existentes

Por padrão, a instalação mescla diretórios e sobrescreve arquivos nos mesmos caminhos. Se você editou `.agents/skills/brainstorming/SKILL.md`, instalar essa skill novamente substitui suas alterações. Faça backup das skills personalizadas antes de atualizar.

Arquivos que existem apenas no destino permanecem. Um arquivo de referência antigo ou uma skill removida em uma versão posterior do pacote continua instalado até você removê-lo por conta própria. Para remover uma skill obsoleta, apague o diretório dela em cada destino em que foi instalada. O instalador não mantém um registro de quais arquivos gerencia.

### Limpeza destrutiva

`--cleanup` remove de forma recursiva e forçada todo o diretório raiz de skills de cada harness selecionado antes de qualquer skill ser copiada. Para a nossa dupla local, isso significa todo o conteúdo de `.claude/skills` e `.agents/skills`, incluindo skills de outros pacotes e arquivos gerenciados manualmente. Destinos compartilhados são removidos uma só vez, mas todos os harnesses que os leem são afetados.

Os diretórios raiz são definidos pelo harness e pelo escopo selecionados. As raízes do workspace são resolvidas a partir do diretório de trabalho atual, e as globais, a partir do seu diretório pessoal. Confira ambos antes de executar a limpeza e faça backup de todos os diretórios raiz selecionados por inteiro. A [tabela de destinos](cli.md#destinos-de-instalação) lista os caminhos.

Falhas de limpeza são exibidas como `Failed cleaning`, mas a instalação continua no destino afetado. Uma falha apenas na limpeza não define um código de saída diferente de zero, então a saída `0` não comprova que o diretório foi limpo. Na automação, confira tanto a saída da limpeza quanto o status de saída. Se a limpeza falhar, resolva o problema de sistema de arquivos informado e inspecione o conteúdo restante antes de tentar novamente.

## Confiança e verificações de caminho

Skills contêm instruções que um agente pode seguir e podem incluir scripts. Revise seu conteúdo e sua origem antes de permitir que um agente as use. Escolha árvores de origem confiáveis ao executar a partir de um checkout, conceda apenas as permissões de sistema de arquivos necessárias e confira se os destinos selecionados são adequados. O instalador não garante que as instruções ou os scripts sejam seguros.

Antes de copiar cada skill, o instalador resolve a origem e a parte já existente do caminho de destino para seus locais reais no sistema de arquivos. Ele rejeita um destino que resolva para a própria origem ou para dentro dela, inclusive por meio de links simbólicos existentes no destino. Isso evita que a cópia se repita recursivamente dentro da própria origem. Se a organização do checkout ou dos links simbólicos causar esse erro, instale em um diretório separado, fora da árvore de origem daquela skill.

Links simbólicos na origem precisam resolver para dentro da árvore de origem daquela skill individual. Um link para uma skill vizinha ou um arquivo em outro lugar é rejeitado com um erro de travessia de diretório. Um link aceito é seguido e seu conteúdo resolvido é copiado, em vez de preservar o link. Diretórios canônicos já visitados são ignorados para evitar ciclos de links simbólicos. Ao criar uma skill, coloque os arquivos necessários dentro do próprio diretório dela em vez de criar links para arquivos externos.

Essas verificações restringem as leituras da origem e evitam a cópia para dentro dela mesma; elas não são uma sandbox do sistema de arquivos. Elas não tornam seguro copiar uma árvore não confiável para um destino sensível. O estado do sistema de arquivos também pode mudar entre as verificações e as operações. Evite instalar a partir de árvores controladas por invasores ou em caminhos que outras pessoas possam alterar durante a instalação.

## Diagnostique uma falha de instalação

O comando exibe as falhas e usa estes códigos de saída:

- **`0`:** as cópias selecionadas foram concluídas ou a ajuda foi exibida. Não selecionar nenhuma skill ou nenhum harness no assistente exibe uma mensagem de saída e também retorna `0`, sem instalar. Ainda assim, podem ter ocorrido falhas na limpeza.
- **`130`:** Ctrl+C cancelou o assistente interativo antes da instalação. Execute o instalador novamente quando estiver pronto para fazer uma seleção.
- **`1`:** argumentos inválidos, IDs de skills desconhecidos, rótulos de harnesses inválidos para o escopo, nenhum harness detectado, skills ausentes, falhas ao carregar as fontes, uma exceção não tratada ou qualquer falha na cópia de uma skill. A saída de erro identifica o que corrigir.

Para erros de argumento, use os IDs do [catálogo](skills.md#catálogo-de-skills-incluídas) e os rótulos que incluem o escopo no [guia da CLI](cli.md#opções). Se nenhum harness for detectado, selecione explicitamente os destinos desejados com `--harnesses` ou use `--all-harnesses` quando quiser todos os destinos do escopo. Não adicione limpeza para resolver um erro de seleção.

Se nenhuma skill for encontrada ou uma fonte incluída não puder ser lida, use uma instalação íntegra do pacote ou restaure os arquivos de skills do checkout. `--include-drafts` também falha quando não há rascunhos ou quando o ID de um rascunho duplica o de uma skill incluída; omita a opção em instalações publicadas.

Uma cópia pode falhar porque sua origem desapareceu, uma restrição de caminho foi violada ou houve falha ao ler, resolver, criar ou gravar uma entrada no sistema de arquivos. A CLI exibe `Failed copying` para cada skill afetada e continua com as skills e os destinos restantes. Ela encerra com `1` depois de tentar todos. Para erros de permissão, torne o destino selecionado gravável; para conflitos entre arquivos e diretórios, faça backup e resolva a entrada conflitante. Confira o caminho informado antes de mudar qualquer coisa.

## Recupere-se de gravações parciais

As cópias não são transacionais: arquivos gravados antes de um erro permanecem, arquivos sobrescritos não são restaurados e nenhuma limpeza bem-sucedida é desfeita. Uma falha posterior no destino do Codex não desfaz uma instalação bem-sucedida para o Claude. Uma cópia de skill que falhou pode, por si só, conter uma mistura de arquivos antigos e novos.

Inspecione a skill e o destino informados, corrija a causa e execute a mesma seleção novamente, sem limpeza, para copiar de novo os arquivos ausentes ou incompletos. Restaure seu backup se precisar da versão anterior ou das suas alterações locais. Executar de novo ainda deixa no lugar os arquivos que existem apenas no destino; inspecione e remova arquivos obsoletos separadamente quando necessário. Usar `--cleanup` para recuperação também removeria skills não relacionadas.

Em seguida, veja [Origem das skills](provenance.md) para conhecer as origens e os avisos de licença que acompanham as skills que você instala e compartilha.
