---
title: Sem bundler
description: Como referenciar as folhas de estilos compiladas a partir de HTML puro, Rails, Laravel, Django ou qualquer aplicação renderizada no servidor, e o build por linha de comando.
order: 6
source: 6289ea781c99dcda5c027a72fede9e2f1cab8414
---

# Sem bundler

As folhas de estilos compiladas são CSS pronto: cada uma é um único arquivo, sem `@import` e sem referência a outro arquivo, e toda imagem que ela desenha vem embutida como uma URL `data:`: as máscaras do visto e do traço do checkbox e os filtros SVG de lente que o `.glass-liquid` usa. Uma página pode carregar qualquer uma delas com uma tag `<link>` simples, de qualquer servidor, sem etapa de build, e a folha de estilos não faz nenhuma requisição adicional.

O que precisa de uma ferramenta de build é o _nome_ do import. `@import "@codenhub/styles"` nomeia um pacote, e encontrar o arquivo por trás desse nome — `node_modules/@codenhub/styles/dist/index.css` — é trabalho de ferramentas que conhecem o Node, como Vite, webpack ou a CLI do Tailwind, que leem o mapa `exports` do pacote. Um navegador não faz isso: ele resolve a URL de um `@import` em relação à folha de estilos que o contém, e um `<link href>` em relação à página, então um nome de pacote solto vira uma requisição para um caminho que não existe. Sem bundler, referencie o arquivo pelo caminho.

Os entrypoints `/tw` são código-fonte do Tailwind e precisam de um build do Tailwind. O `/tw/aesthetics` é a exceção, CSS puro sem nada para o Tailwind processar, mas sem bundler referencie os arquivos compilados de `dist/aesthetics/`, como abaixo. Esta página é para uma página que não tem um build de CSS com Node.js: HTML puro, Rails, Laravel, Django ou qualquer aplicação renderizada no servidor. Há dois caminhos:

1. **Referencie a folha de estilos compilada.** Funciona hoje, só com arquivos estáticos. Você entrega todas as classes, usadas ou não pelas suas páginas.
2. **Gere uma folha de estilos com o comando `build` do pacote.** Ela varre os seus templates e escreve uma folha de estilos com só as classes que eles usam. Veja [Gere só as classes que você usa](#gere-só-as-classes-que-você-usa).

## Qual arquivo referenciar

Cada caminho de import compilado é um arquivo na pasta `dist/` do pacote:

| Caminho de import               | Arquivo                                                        |
| ------------------------------- | -------------------------------------------------------------- |
| `@codenhub/styles`              | `dist/index.css`                                               |
| `@codenhub/styles/theme`        | `dist/theme.css`                                               |
| `@codenhub/styles/components`   | `dist/components.css`                                          |
| `@codenhub/styles/native`       | `dist/native.css`                                              |
| `@codenhub/styles/palette`      | `dist/palette.css`                                             |
| `@codenhub/styles/aesthetics`   | `dist/aesthetics/index.css`                                    |
| `@codenhub/styles/aesthetics/*` | `dist/aesthetics/<name>.css`, como `dist/aesthetics/pixel.css` |

Referencie um arquivo base só, não vários, porque eles se sobrepõem, e as estéticas que você usar. A ordem entre eles não importa, porque todo arquivo declara as [camadas de cascata](../setup.md#camadas-de-cascata) antes de usar qualquer uma. [Configuração → Todos os entrypoints](../setup.md#todos-os-entrypoints) explica o que cada um contém.

## A partir de uma CDN

O jsDelivr e o unpkg servem todos os arquivos de todas as versões publicadas no npm, então uma página pode referenciar um deles sem instalar nada:

```html
<head>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@codenhub/styles@0.8.0/dist/index.css" />
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@codenhub/styles@0.8.0/dist/aesthetics/pixel.css" />
</head>
```

Coloque a versão exata na URL. Sem ela, a CDN serve a versão mais recente, e abaixo da 1.0 uma versão minor pode renomear ou remover uma classe; veja [Versionamento](../index.md#versionamento).

## A partir do seu próprio servidor

Instale o pacote e depois sirva a pasta `dist/` dele como arquivos estáticos:

```sh
npm install @codenhub/styles
```

Cada framework serve uma pasta de `node_modules` de um jeito, então cada um aparece abaixo. Quando o framework lê a pasta no lugar onde ela está, como fazem o Rails e o Django, atualizar o pacote e fazer um novo deploy é tudo o que uma atualização exige.

### HTML puro

Copie `node_modules/@codenhub/styles/dist` para a pasta que o seu servidor publica e depois referencie o arquivo:

```html
<link rel="stylesheet" href="/vendor/codenhub-styles/index.css" />
```

Repita a cópia a cada atualização, por exemplo a partir de um script `postinstall` do npm.

### Ruby on Rails

Uma aplicação Rails criada com `cssbundling-rails` já roda um bundler: importe o pacote a partir de `app/assets/stylesheets/application.css`, como em [Configuração → Importe a folha de estilos](../setup.md#importe-a-folha-de-estilos).

Com Propshaft e sem bundler de CSS, adicione a pasta do pacote aos caminhos de assets:

```ruby
# config/initializers/assets.rb
Rails.application.config.assets.paths << Rails.root.join("node_modules/@codenhub")
```

Depois referencie o arquivo no layout, pelo caminho dele dentro dessa pasta:

```erb
<%# app/views/layouts/application.html.erb %>
<%= stylesheet_link_tag "styles/dist/index" %>
<%= stylesheet_link_tag "styles/dist/aesthetics/pixel" %>
```

Aponte o caminho para `node_modules/@codenhub`, e não para o próprio `dist/`. O Propshaft serve os arquivos pelo caminho dentro de cada pasta de assets, então adicionar `dist/` diretamente publicaria um `index.css` solto, que colide com qualquer `index.css` seu.

Os arquivos que você referencia ficam em `dist/`, que guarda só CSS pronto, mais um `index.d.ts` vazio para o TypeScript. O código-fonte do Tailwind fica em `tw/`, fora de `dist/`, então um pipeline estático que serve `dist/` ou aplica fingerprint aos arquivos dele não encontra nenhum `@import` que não consiga resolver.

### Django

Adicione a pasta a `STATICFILES_DIRS` com um prefixo, o que mantém os nomes dos arquivos dela separados dos seus próprios arquivos estáticos:

```python
# settings.py
STATICFILES_DIRS = [
    ("codenhub-styles", BASE_DIR / "node_modules/@codenhub/styles/dist"),
]
```

```django
{% load static %}
<link rel="stylesheet" href="{% static 'codenhub-styles/index.css' %}" />
```

Aponte o prefixo para `dist`, não para a pasta do pacote. `dist/` contém só CSS pronto, mais um `index.d.ts` vazio para o TypeScript que o storage copia como está, então o `collectstatic` também funciona com `ManifestStaticFilesStorage`, que coloca uma impressão digital (hash) no nome de cada arquivo e reescreve as referências dentro dele. A pasta do pacote também contém o código-fonte do Tailwind em `tw/`, com linhas `@import "tailwindcss/..."` que esse storage não consegue resolver.

### Laravel

Uma aplicação Laravel roda Vite por padrão, então ela tem um bundler: importe o pacote a partir de `resources/css/app.css`, como em [Configuração → Importe a folha de estilos](../setup.md#importe-a-folha-de-estilos), e carregue esse arquivo com a diretiva `@vite`, como de costume.

## Gere só as classes que você usa

O pacote traz um comando, `codenhub-styles`, que o compila para você. Ele lê os seus templates atrás de nomes de classe e escreve uma única folha de estilos minificada com só as classes do StyleKit e os utilitários do Tailwind que eles usam. Uma página que usa um botão recebe uma pequena fração da folha de estilos completa; o tamanho exato depende das classes que você usa, porque cada componente traz as regras compartilhadas de que depende.

O comando também serve com um bundler. Um projeto cujo bundler não roda o Tailwind, como um build simples com Vite ou webpack, pode escrever a folha de estilos entre os seus fontes, `--output src/stylekit.css`, e importar esse arquivo onde importaria `@codenhub/styles`. Um projeto que usa o Tailwind CSS v4 tem a mesma redução pelo [entrypoint de código-fonte](./tailwind.md) e não precisa do comando.

Ele precisa do Node.js 24 ou mais recente na máquina que gera o CSS, seja o seu notebook, um job de CI ou uma etapa do deploy. Ele compila com o Tailwind CSS, que o pacote não instala por você, então um projeto que só linka a folha de estilos compilada nunca o baixa. Instale os três pacotes como dependências de desenvolvimento a partir da raiz do projeto; o npm cria um `package.json` se você não tiver um, e nenhuma configuração do Tailwind é necessária:

```sh
npm install --save-dev @codenhub/styles @tailwindcss/cli tailwindcss
```

A folha de estilos que o comando escreve é CSS puro, então os servidores que servem o seu site não precisam nem do Node.js nem de nenhum desses pacotes. Rode a partir da raiz do projeto:

```sh
npx codenhub-styles build --content "app/views/**/*.erb" --output public/stylekit.css
```

Quando dá certo, o comando imprime uma linha: o caminho absoluto que escreveu e o tamanho do arquivo em bytes:

```text
/home/you/shop/public/stylekit.css 25782 bytes
```

Referencie esse arquivo no seu layout como qualquer folha de estilos estática.

### Views do Rails

```sh
npx codenhub-styles build --content "app/views/**/*.erb" --content "app/helpers/**/*.rb" --output public/stylekit.css
```

```erb
<%# app/views/layouts/application.html.erb %>
<link rel="stylesheet" href="/stylekit.css" />
```

### Views Blade do Laravel

```sh
npx codenhub-styles build --content "resources/views/**/*.blade.php" --output public/css/stylekit.css
```

```blade
{{-- resources/views/layouts/app.blade.php --}}
<link rel="stylesheet" href="{{ asset('css/stylekit.css') }}" />
```

### Templates do Django

Um projeto Django guarda os templates numa pasta `templates/` do projeto, na pasta `templates/` de cada app, ou nas duas. Passe um `--content` para cada lugar onde ficam os seus, e deixe de fora os que você não usa, porque um glob que não casa com nada faz o build falhar:

```sh
npx codenhub-styles build --content "templates/**/*.html" --content "shop/templates/**/*.html" --output static/stylekit.css
```

```django
{% load static %}
<link rel="stylesheet" href="{% static 'stylekit.css' %}" />
```

Escreva a saída numa pasta listada em `STATICFILES_DIRS`, aqui `static/`, para que o `collectstatic` a recolha. A configuração acima lista só a pasta do pacote, então adicione `BASE_DIR / "static"` a essa lista se o seu projeto ainda não a tiver.

### Opções

- `--content <glob>`, ou `-c <glob>`, indica os arquivos onde procurar nomes de classe. É obrigatório e pode ser repetido: passe uma vez por glob, e o build lê todo arquivo que casar com algum deles. Um glob relativo é resolvido em relação à pasta de onde você roda o comando, então rode a partir da raiz do projeto; um glob absoluto é usado como está. `**` casa com qualquer número de pastas, e `{rb,erb}` com qualquer uma das duas extensões. Qualquer arquivo de texto serve, seja qual for a extensão. Cada glob precisa casar com pelo menos um arquivo, senão o build falha e o nomeia, então um erro de digitação não consegue publicar uma folha de estilos vazia. Arquivos que o seu `.gitignore` exclui são lidos mesmo assim quando um glob casa com eles, e nada fora dos seus globs é lido.
- Coloque cada glob entre aspas. Sem aspas, o seu shell pode expandir o glob numa lista de arquivos antes de o comando vê-lo, e só o primeiro arquivo conta como valor do `--content`. Quando isso deixa nomes de arquivo sobrando, o build os rejeita em vez de ler em silêncio menos do que você queria; quando o glob casou com um único arquivo, o build lê só esse arquivo e nada que os seus templates ganharem depois.
- `--output <file>`, ou `-o <file>`, é a folha de estilos a escrever. É obrigatório. Um caminho relativo é resolvido em relação à pasta de onde você roda o comando, pastas-pai que faltam são criadas, e um arquivo existente é substituído.
- `--aesthetic <name>` acrescenta uma das [estéticas](../usage/aesthetics.md): `neobrutalism`, `glass`, `pixel`, `chunky-tile`, `cyber` ou `sketch`. Repita para mais de uma; nomear uma duas vezes a inclui uma vez só. As estéticas precisam ser pedidas porque o build não tem como saber pelos seus templates qual você quer, então cada uma é escrita inteira quando você a pede, e nenhuma entra quando você não pede.
- `--no-minify` escreve CSS legível e indentado no lugar. Útil para ler o que o build gerou; em produção, sirva o arquivo minificado.
- `--help` imprime o uso, com as estéticas que esta versão traz. `--version` imprime a versão do pacote. Nenhum dos dois gera nada, e os dois terminam com status 0.

A saída sempre traz o tema, os design tokens dele como propriedades personalizadas de CSS, o reset e as regras base de que todo componente depende. Por cima vêm cada classe do StyleKit que os seus templates usam, com as variantes com que você a combina, como `primary` ou `soft`, e cada utilitário do Tailwind que eles usam, como `flex` ou `mt-4`. A saída é gerada a partir da folha de estilos completa, não da `/native`, então não inclui os mapeamentos sem classes.

### Como as classes são encontradas

O build não executa os seus templates. Ele lê como texto puro cada arquivo que casa com os seus globs de `--content`, recolhe cada palavra que poderia ser um nome de classe e escreve as regras das palavras que são classes do StyleKit ou utilitários do Tailwind. É assim que o Tailwind CSS também lê o conteúdo.

Uma classe precisa aparecer num arquivo como uma palavra inteira. `class="btn primary"`, `class: "btn primary"` e `classes = ["btn", "primary"]` funcionam. Uma palavra que só parece uma classe também conta: um comentário que diz "card" adiciona todas as regras do card à folha de estilos, o que aumenta o arquivo e não muda nada na página.

Um nome de classe que o seu código monta na renderização nunca aparece inteiro em nenhum arquivo, então o build não consegue encontrá-lo. Em `class="btn <%= @order.priority %>"`, o `btn` é encontrado, mas a intenção é o que `priority` tiver na hora de renderizar; se for `destructive`, o botão aparece sem o vermelho dele. Há duas saídas:

- **Escreva os nomes de classe inteiros.** Associe cada valor a um nome de classe completo num arquivo que o build leia, como `{ "urgent" => "destructive", "normal" => "neutral" }.fetch(@order.priority)` num helper.
- **Liste-os num arquivo de safelist.** Um arquivo de texto puro com um nome de classe por linha, adicionado com o seu próprio `--content`, como `--content config/stylekit-classes.txt`. Guarde-o perto do código que monta os nomes de classe, para que quem mudar um veja o outro.

### O que ele não faz

- **Não tem modo watch.** Ele gera uma vez e termina. Rode de novo depois de mudar um template, a partir de um script ou de um observador de arquivos que o seu framework ou editor já tenha. Uma classe que a folha de estilos ainda não tem deixa o elemento sem estilo até o próximo build.
- **Não tem arquivo de configuração nem CSS próprio.** Você não consegue acrescentar os seus próprios valores de `@theme`, definições de `@utility` nem plugins. Para mudar o visual, sobrescreva as propriedades personalizadas numa folha de estilos sua carregada depois desta, como [Personalização](../usage/customizing.md) descreve. Quando você precisar da configuração do próprio Tailwind, instale o Tailwind CSS e importe o entrypoint de código-fonte a partir da sua própria entrada do Tailwind, como [Tailwind CSS v4](./tailwind.md) mostra.
- **Não tem outros comandos.** `build` é o único; `--help` e `--version` são as únicas flags que funcionam sem ele.
- **Não traz uma versão do Tailwind própria.** Cada build usa os `@tailwindcss/cli` e `tailwindcss` instalados no seu projeto, dentro da faixa `>=4.3.2 <5` que o StyleKit suporta, então o seu lockfile os fixa.

### Num deploy

Gere a folha de estilos antes da etapa que recolhe ou aplica fingerprint aos seus assets, como `rails assets:precompile`, `php artisan optimize` ou `python manage.py collectstatic`. Você pode fazer commit da saída, e aí os servidores não precisam de Node.js nenhum, ao custo de um arquivo gerado que alguém precisa lembrar de regenerar; ou gerá-la no deploy, e aí a máquina de build precisa do Node.js 24 ou mais recente.

Fixe a versão. Abaixo da 1.0 uma versão minor pode renomear ou remover uma classe, então o mesmo comando pode escrever outra folha de estilos com uma versão mais nova. Faça commit do `package.json` e do lockfile que o npm escreve, e instale com `npm ci` na máquina de build, para que cada build use as versões que você testou.

### Quando o build falha

Toda falha imprime uma linha começando com `codenhub-styles:` na saída de erro padrão e termina com status 1, sem escrever o arquivo de saída, então um script de deploy para em vez de publicar uma folha de estilos desatualizada ou vazia. A linha diz o que deu errado e o que fazer:

- **`missing --content` ou `missing --output`.** Acrescente a que ela nomeia. Um `--output` vazio ou só com espaços conta como ausente.
- **`--content "<glob>" matches no file in <folder>`.** Em geral é um erro de digitação no caminho, um comando rodado de outra pasta que não a raiz do projeto, ou um glob de um lugar que o seu projeto não usa. Gerar a partir de nada escreveria uma folha de estilos sem classes de componente, e o site perderia o estilo sem aviso.
- **`unexpected argument "<file>"`.** Quase sempre é um glob de `--content` sem aspas, que o seu shell expandiu numa lista de arquivos. Coloque o glob entre aspas.
- **`unknown option "<flag>"`.** Um erro de digitação, ou uma opção de outra ferramenta, como `--watch` ou `--config`. `--help` lista as opções.
- **`option "<flag>" is missing its value or does not take one`.** Uma flag que leva valor foi a última coisa da linha, ou o `--no-minify` recebeu um valor, como em `--no-minify=true`.
- **`unknown aesthetic "<name>"; choose from ...`.** Escolha um dos nomes listados. Eles são em minúsculas e com hífen, como `chunky-tile`.
- **`missing command` ou `unknown command "<name>"`.** A primeira palavra depois de `codenhub-styles` precisa ser `build`.
- **`this command needs @tailwindcss/cli and tailwindcss, which are not installed`.** A linha nomeia o que estiver faltando dos dois e termina com o comando que o instala. Rode esse comando a partir da raiz do projeto.
- **`this command needs Node.js 24 or newer`.** Atualize o Node.js na máquina que gera o CSS.
- **`Tailwind failed to build the stylesheet: <reason>`.** `<reason>` é a própria mensagem do Tailwind. `EISDIR` quer dizer que o `--output` nomeia uma pasta existente, então nomeie um arquivo dentro dela; `EACCES` ou `EPERM` quer dizer que você não pode escrever ali. Para qualquer outro motivo, rode o mesmo comando com `--no-minify` para descartar o minificador, e informe a mensagem junto com a versão que o `--version` imprime.

## Conferindo se funcionou

Renderize um elemento estilizado, como em [Integração → Conferindo se funcionou](./index.md#conferindo-se-funcionou):

```html
<button class="btn primary">Save changes</button>
```

Um botão arredondado preenchido com a cor primária significa que a folha de estilos carregou. Se o botão parecer o padrão do navegador, abra o painel de rede do navegador: um `404` na folha de estilos significa que o caminho ou a configuração de arquivos estáticos está errado.

## A seguir

Volte para o caminho principal: [Montando uma tela](../concepts.md) adiciona o primeiro card e o primeiro formulário à página de configurações. [Configuração → Todos os entrypoints](../setup.md#todos-os-entrypoints) lista todas as outras folhas de estilos que você pode importar.
