---
title: Vite
description: Entregar só as classes que as suas páginas usam a partir de um projeto Vite que não usa Tailwind, com o plugin de Vite do pacote.
order: 6
source: 895677e0c9ad4f4eda8d7587d82a34d5dbb031d3
---

# Vite

A folha de estilos compilada traz todas as classes do pacote, então uma página de configurações que usa alguns botões, um card e um formulário também leva as tabelas, os tooltips e os alertas, caso ela mude de ideia. Num projeto Vite que não usa Tailwind CSS, o plugin de Vite do pacote resolve isso sem mexer nos seus imports. Quando o Vite inicia, ele lê os arquivos do seu projeto em busca de nomes de classe e troca a folha de estilos que você importa por uma com só as classes do StyleKit que esses arquivos usam. Não há comando para rodar nem arquivo de saída para nomear: você adiciona uma linha ao `vite.config.ts` e o resto do projeto fica como estava.

Um projeto que já usa Tailwind CSS v4 não precisa do plugin. O próprio build dele reduz o [entrypoint de código-fonte](./tailwind.md) do mesmo jeito. Um projeto sem Vite, com outro bundler ou sem nenhum, escreve a folha de estilos reduzida com o [comando `chs build`](./without-a-bundler.md#gere-só-as-classes-que-você-usa) do pacote.

## Adicione o plugin

Com o pacote instalado como em [Configuração](../setup.md#instalação), adicione o plugin à sua configuração do Vite:

```ts
// vite.config.ts
import viteStyles from "@codenhub/styles/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [viteStyles()],
});
```

`viteStyles` também é exportado com esse nome, como em `import { viteStyles } from "@codenhub/styles/vite"`.

Mantenha o import que você já tem, a partir da sua entrada de JavaScript ou da sua folha de estilos global:

```ts
// main.ts
import "@codenhub/styles";
```

```css
/* app.css */
@import "@codenhub/styles";
@import "@codenhub/styles/aesthetics/neobrutalism";
```

Essa é a configuração inteira. `vite` e `vite build` agora servem e entregam uma folha de estilos reduzida às classes que a página de configurações nomeia: `section`, `stack`, `text-title`, `btn` e as demais, e nenhum dos componentes que ela nunca usa.

Medido com o Vite 8.3.6 numa página com um botão `btn primary`, o build entrega cerca de 38 KB de CSS (8 KB com gzip), enquanto a mesma página sem o plugin entrega cerca de 255 KB (21 KB). Os dois números incluem o que o próprio minificador de CSS do Vite 8 adiciona: para os navegadores-alvo padrão dele, ele escreve uma alternativa ao lado de cada cor `light-dark()`, com o plugin ou sem ele. O arquivo que o plugin entrega ao Vite é o que o `chs build` escreve para a mesma página, byte a byte.

## Quais imports são reduzidos

A folha de estilos completa e as estéticas são reduzidas. As outras folhas de estilos carregam inteiras, exatamente como sem o plugin:

| Import                                          | Com o plugin                                   |
| ----------------------------------------------- | ---------------------------------------------- |
| `@codenhub/styles`                              | Reduzida às classes que os seus arquivos usam. |
| `@codenhub/styles/aesthetics`                   | Reduzida, cada estética às classes usadas.     |
| `@codenhub/styles/aesthetics/<name>`            | Reduzida às classes usadas.                    |
| `/components`, `/native`, `/theme` e `/palette` | Inteira.                                       |
| Os caminhos `/tw`                               | Intocados; são código-fonte do Tailwind.       |

Então, para entregar menos, importe a folha de estilos completa em vez da `/components`. Para a página de um botão acima, a folha de estilos reduzida tem cerca de um quinto dos 186 KB que a `/components` carrega inteira. A folha de estilos reduzida é gerada a partir da completa, não da `/native`, então não inclui os mapeamentos sem classes; uma página que depende deles importa a `/native`, que carrega inteira.

O import é reduzido onde quer que o Vite o resolva: um `import` de JavaScript, um `@import` de CSS, um arquivo CSS que outro arquivo CSS importa, um `@use` ou um `@import` de Sass, o Lightning CSS como transformador de CSS do Vite, e as consultas `?inline`, `?url` e `?raw` do Vite.

A folha de estilos reduzida traz o que o [`chs build`](./without-a-bundler.md#opções) escreve: o tema e os tokens dele, o reset, as regras base de que todo componente depende, as quatro classes mantidas quer um arquivo as nomeie ou não (`.dark`, `.theme-dark`, `.theme-light` e `.disabled`), e cada classe do StyleKit que os seus arquivos usam. Ela sempre vem minificada. Uma estética que você importa é reduzida do mesmo jeito, às regras dela para as classes que os seus arquivos usam; o import já diz quais estéticas você quer, então não há nada para configurar.

## Quais arquivos são lidos

Tudo o que está sob a raiz do Vite é lido, a pasta que contém o `index.html`, a menos que a sua configuração defina [`root`](https://vite.dev/config/shared-options.html#root). A detecção automática de fontes do Tailwind lê um projeto do mesmo jeito. Algumas coisas ficam de fora, cada uma porque lê-la manteria classes que as suas páginas não usam:

- **O que o seu `.gitignore` exclui.** O `.gitignore` da raiz, o de cada pasta abaixo dela e o de cada pasta acima dela até a que contém o `.git`, com as regras do git: vale a última linha que casa, e um arquivo mais fundo prevalece sobre um mais alto. A raiz nunca fica de fora, mesmo quando o repositório a ignora com uma linha como `playground/`. Uma linha que nomeia os arquivos sob a raiz, e não a pasta, como `playground/**`, deixa esses arquivos de fora; nomeie-os em [`content`](#arquivos-fora-da-raiz), como em `content: ["index.html", "src/**/*"]`, ou mude a linha para o nome da própria pasta. O `.git/info/exclude` e um arquivo global de exclusões não são lidos, e a comparação diferencia maiúsculas em todos os sistemas, então todas as máquinas geram a mesma folha de estilos.
- **`node_modules` e `.git`**, em qualquer profundidade. Os arquivos de uma dependência nomeiam classes que nenhuma página sua usa.
- **A saída do build do Vite.** O `build.outDir` e, no Vite 6 e mais recentes, a pasta de saída de cada ambiente, além da pasta de cache do Vite. A saída de um build nomeia as classes que o último build manteve, então relê-la manteria uma classe que as suas fontes não usam mais. Uma pasta de saída que só outra configuração nomeia, como a `dist/server` de um comando `vite build --ssr` separado, é lida a menos que o `.gitignore` a exclua; o `.gitignore` de todo template do create-vite exclui `dist` e `dist-ssr`.
- **Folhas de estilos**: `.css`, `.scss`, `.sass`, `.less`, `.styl`, `.stylus`, `.pcss`, `.postcss` e `.sss`. O valor de uma propriedade também é uma palavra, e `border: 1px solid` manteria a `.solid`. O CSS dentro de um arquivo `.vue` ou `.svelte` é lido com o resto do arquivo.
- **Arquivos binários**, pela regra do git: um arquivo com um byte NUL nos primeiros 8.000 bytes, a menos que comece com uma marca de ordem de bytes UTF-16. Só esses bytes são lidos, então um vídeo em `public/` não custa nada.
- **Cópias dos próprios arquivos do pacote**, como uma folha de estilos que o `chs build` escreveu ou uma cópia da lista de classes do pacote, pelas regras de [Como as classes são encontradas](./without-a-bundler.md#como-as-classes-são-encontradas). Cada uma nomeia todas as classes do pacote e manteria a folha de estilos inteira.

Um link para um arquivo é lido; um link para uma pasta não é seguido, então um link que volta para si mesmo não consegue travar a varredura.

Os nomes de classe são encontrados como palavras, do jeito que o comando `chs build` os encontra: uma classe escrita por extenso em qualquer arquivo conta, e uma classe que o seu código monta ao renderizar, como em `` `btn ${tone}` ``, nunca é encontrada. [Como as classes são encontradas](./without-a-bundler.md#como-as-classes-são-encontradas) explica as regras e as duas saídas. Uma delas fica mais fácil aqui: uma lista de classes permitidas é qualquer arquivo de texto sob a raiz, como um `stylekit-classes.txt` com um nome de classe por linha, e o plugin o lê como o resto, sem opção para configurar. Os dez prefixos de variante, como `md:lg` e `hover:primary`, funcionam como [Variantes](./without-a-bundler.md#variantes) descreve.

## Arquivos fora da raiz

A opção `content` adiciona arquivos fora da raiz, como uma pasta de componentes compartilhada num monorepo. É a única opção do plugin:

```ts
// apps/web/vite.config.ts
export default defineConfig({
  plugins: [viteStyles({ content: ["../../packages/ui/src/**/*.{vue,ts}"] })],
});
```

Cada entrada é um caminho ou um glob, lido a partir da raiz do Vite, com as regras de glob do comando descritas em [Opções](./without-a-bundler.md#opções). Os arquivos que uma entrada nomeia são lidos mesmo onde um `.gitignore` os exclui, e um `*` ou um `**` não entra numa pasta `node_modules`, então uma biblioteca de componentes que você instala só adiciona as classes dela quando você a nomeia, como em `node_modules/some-ui/dist/**/*.js`. Cada entrada precisa casar com pelo menos um arquivo, ou o Vite não inicia e a nomeia, então um erro de digitação não consegue perder em silêncio as classes de uma pasta.

## Enquanto você trabalha

O servidor de desenvolvimento acompanha os seus arquivos conforme eles mudam, sem recarregar à mão:

- **Salvar um arquivo que nomeia uma classe nova** atualiza a folha de estilos no lugar. Remover o último uso de uma classe tira a regra dela.
- **Criar ou apagar um arquivo** conta como uma mudança nas classes dele.
- **Salvar um arquivo HTML** recarrega a página, como o Vite faz com HTML, e a página que ele recarrega recebe a folha de estilos nova.
- **Mudar um `.gitignore`** lê a raiz inteira de novo, já que isso muda o que é lido.
- **Um arquivo que uma entrada de `content` nomeia** também é acompanhado, e também um arquivo criado numa pasta em que uma entrada lê.

A folha de estilos que uma renderização no servidor carrega acompanha as mesmas mudanças, e um build de renderização no servidor embute a folha de estilos reduzida onde embute CSS.

`vite build --watch` acompanha os arquivos que leu ao iniciar. Salvar um deles refaz o build com as classes dele, mesmo quando nenhum módulo o importa, como um template HTML que o seu servidor renderiza, e apagá-lo as tira. Um arquivo criado enquanto ele roda é lido quando você inicia o `vite build --watch` de novo. No Vite 8, uma mudança que muda a folha de estilos refaz o build duas vezes seguidas, e o segundo build escreve os mesmos arquivos que o primeiro.

## Onde ficam os arquivos reduzidos

O plugin escreve as folhas de estilos reduzidas na pasta de cache do Vite, `node_modules/.vite/codenhub-styles/`, a menos que a sua configuração defina [`cacheDir`](https://vite.dev/config/shared-options.html#cachedir). É onde o Vite guarda os próprios arquivos gerados, então o seu projeto já a deixa fora do controle de versão. Apagá-la é seguro: o plugin a escreve de novo quando o Vite inicia e, se você a apagar enquanto o servidor de desenvolvimento roda, quando você reinicia o servidor ou salva uma mudança que adiciona ou remove uma classe. As ferramentas de desenvolvimento do navegador mostram a folha de estilos no caminho dela dentro dessa pasta, e não no pacote.

## O seu próprio alias vence

Se a sua configuração ou outro plugin já mapeia `@codenhub/styles` em `resolve.alias`, para um fork ou uma cópia própria, por exemplo, esse import mantém o seu alias e não é reduzido. O Vite imprime um aviso ao iniciar:

```text
@codenhub/styles/vite: resolve.alias already maps "@codenhub/styles", so that import keeps your alias and is not trimmed; remove the alias to trim it.
```

Remova o alias para reduzir o import. Os imports que o seu alias não mapeia, como uma estética, continuam sendo reduzidos.

## Requisitos

- **Vite:** 5.0.0 ou mais recente. O pacote declara o Vite como dependência peer opcional, então instalar o pacote nunca instala o Vite. Um projeto no Vite 4 ou anterior não consegue fazer `npm install @codenhub/styles`, mesmo quando nunca carrega o plugin: o npm para com `ERESOLVE`, nomeando `peerOptional vite@">=5.0.0"`. Atualize o Vite, ou instale com `npm install --legacy-peer-deps`, que desliga a checagem de peers do npm para essa instalação inteira. O pnpm só avisa.
- **Node.js:** 24 ou mais recente na máquina que roda o Vite. O Vite 5 roda no Node.js 18, então o plugin confere a versão e falha com uma mensagem em vez de funcionar pela metade.
- **Tailwind:** nenhum. Um projeto que usa Tailwind CSS v4 reduz pelo [entrypoint de código-fonte](./tailwind.md) e não precisa do plugin.

## Quando o Vite não inicia

Toda mensagem que o plugin imprime começa com `@codenhub/styles/vite:`, e uma falha enquanto o Vite inicia para o servidor ou o build, então um erro de digitação não consegue entregar uma folha de estilos sem as suas classes. A mensagem diz o que deu errado e o que fazer:

- **`this plugin needs Node.js 24 or newer; this is Node.js <version>`.** Atualize o Node.js na máquina que roda o Vite.
- **`content must be an array of paths or globs`.** A opção recebeu algo que não é uma lista de strings, como `content: "../shared/**/*.html"`. Ponha o glob numa lista, como em `content: ["../shared/**/*.html"]`.
- **`content holds an empty entry`.** Uma entrada está vazia ou só tem espaços, como a que uma variável de ambiente não definida dá. Remova-a, ou nomeie um caminho ou um glob.
- **`content "<entry>" matches no file in <root>`.** A entrada é lida a partir da raiz do Vite, não da pasta que contém o arquivo de configuração nem daquela em que você rodou o Vite, então confira o caminho a partir da raiz. Quando uma causa mais provável é conhecida, a mensagem a nomeia no lugar: um `*` ou um `**` que só casou com arquivos dentro de `node_modules`, onde não entra, ou um `[` lido como o início de um conjunto de caracteres, onde `[[]` casaria com o colchete.
- **`content "<entry>" is a folder in <root>, not a file`.** Nomeie os arquivos dentro dela, como em `../shared/**/*`.
- **`cannot read "<path>" (<code>)`.** O plugin não conseguiu ler um arquivo ou listar uma pasta, normalmente pelas permissões dele, com o código do Node.js, como `EACCES`. Gerar sem ele tiraria as classes dele, então o plugin para. Corrija as permissões dele ou, como a mensagem diz, adicione-o ao `.gitignore` quando ele está sob a raiz, ou mude o `content` quando uma entrada o nomeia.
- **`cannot write to "<path>": <reason> (<code>); fix that, or set cacheDir to a folder you can write to`.** O plugin não conseguiu escrever a folha de estilos reduzida na pasta de cache do Vite. `<reason>` e `<code>` são os do Node.js; `EACCES` ou `EPERM` significa que você não pode escrever ali, e `ENOSPC` que o disco está cheio.
- **`a file changed before the plugin read the project; restart Vite`.** Reinicie o Vite.

Enquanto o servidor de desenvolvimento roda, um erro de uma mudança, como uma folha de estilos que ele não consegue escrever, aparece na página como o Vite mostra os próprios erros. A página mantém a última folha de estilos escrita, e a próxima mudança que você salvar tenta a escrita de novo.

## Conferindo se funcionou

Renderize um elemento estilizado, como em [Integração → Conferindo se funcionou](./index.md#conferindo-se-funcionou):

```html
<button class="btn primary">Save changes</button>
```

Um botão arredondado preenchido com a cor primária significa que a folha de estilos carregou. Para ver a redução, rode `vite build` e compare o tamanho que ele imprime para o arquivo CSS em `dist/assets/` com o que ele imprime sem o plugin.

## A seguir

Volte ao caminho principal: [Montando uma tela](../concepts.md) adiciona o primeiro card e o primeiro formulário à página de configurações. Cada classe que você adicionar ali chega à folha de estilos assim que você salvar.
