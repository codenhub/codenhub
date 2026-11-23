---
title: Sem bundler
description: Como referenciar as folhas de estilos compiladas a partir de HTML puro, Rails, Laravel, Django ou qualquer aplicação renderizada no servidor, e o build por linha de comando.
order: 6
source: a81f9436c745620557b46e1f2f1a9ad324f27228
---

# Sem bundler

As folhas de estilos compiladas são CSS pronto: cada uma é um único arquivo, sem `@import` e sem referência a outro arquivo, e toda imagem que ela desenha vem embutida como uma URL `data:`: as máscaras do visto e do traço do checkbox e os filtros SVG de lente que o `.glass-liquid` usa. Uma página pode carregar qualquer uma delas com uma tag `<link>` simples, de qualquer servidor, sem etapa de build, e a folha de estilos não faz nenhuma requisição adicional.

O que precisa de uma ferramenta de build é o _nome_ do import. `@import "@codenhub/styles"` nomeia um pacote, e encontrar o arquivo por trás desse nome — `node_modules/@codenhub/styles/dist/index.css` — é trabalho de ferramentas que conhecem o Node, como Vite, webpack ou a CLI do Tailwind, que leem o mapa `exports` do pacote. Um navegador não faz isso: ele resolve a URL de um `@import` em relação à folha de estilos que o contém, e um `<link href>` em relação à página, então um nome de pacote solto vira uma requisição para um caminho que não existe. Sem bundler, referencie o arquivo pelo caminho.

Os entrypoints `/tw` são código-fonte do Tailwind e precisam de um build do Tailwind. O `/aesthetics/tw` é a exceção, CSS puro sem nada para o Tailwind processar, mas sem bundler referencie os arquivos compilados de `dist/aesthetics/`, como abaixo. Esta página é para uma página que não tem um build de CSS com Node.js: HTML puro, Rails, Laravel, Django ou qualquer aplicação renderizada no servidor. Há dois caminhos:

1. **Referencie a folha de estilos compilada.** Não precisa de nada além de arquivos estáticos. Você entrega todas as classes, usadas ou não pelas suas páginas.
2. **Gere uma folha de estilos com o comando `chs build` do pacote.** Ela varre os seus templates e escreve uma folha de estilos com só as classes que eles usam. Veja [Gere só as classes que você usa](#gere-só-as-classes-que-você-usa).

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
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@codenhub/styles@0.11.0/dist/index.css" />
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@codenhub/styles@0.11.0/dist/aesthetics/pixel.css" />
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

Os arquivos que você referencia ficam em `dist/`, que guarda CSS pronto sem `@import` a resolver, mais um `index.d.ts` vazio para o TypeScript e o comando `chs build` com os arquivos que ele lê. O código-fonte do Tailwind fica em `tw/`, fora de `dist/`, então um pipeline estático que serve `dist/` ou aplica fingerprint aos arquivos dele não encontra nenhum `@import` que não consiga resolver.

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

Aponte o prefixo para `dist`, não para a pasta do pacote. `dist/` contém CSS pronto sem `@import` a resolver, mais um `index.d.ts` vazio para o TypeScript e o comando `chs build` com os arquivos que ele lê, que o storage copia como estão, então o `collectstatic` também funciona com `ManifestStaticFilesStorage`, que coloca uma impressão digital (hash) no nome de cada arquivo e reescreve as referências dentro dele. A pasta do pacote também contém o código-fonte do Tailwind em `tw/`, com linhas `@import "tailwindcss/..."` que esse storage não consegue resolver.

### Laravel

Uma aplicação Laravel roda Vite por padrão, então ela tem um bundler: importe o pacote a partir de `resources/css/app.css`, como em [Configuração → Importe a folha de estilos](../setup.md#importe-a-folha-de-estilos), e carregue esse arquivo com a diretiva `@vite`, como de costume.

## Gere só as classes que você usa

O pacote traz um comando, `chs`, que lê os seus templates atrás de nomes de classe e escreve uma única folha de estilos minificada com só as classes do StyleKit que eles usam. Uma página que usa um botão recebe cerca de um sétimo da folha de estilos completa; o tamanho exato depende das classes que você usa, porque cada componente traz as regras compartilhadas de que depende.

O comando também serve com um bundler. Um projeto cujo bundler não roda o Tailwind, como um build simples com Vite ou webpack, pode escrever a folha de estilos entre os seus fontes, `--output src/stylekit.css`, e importar esse arquivo onde importaria `@codenhub/styles`. Um projeto que usa o Tailwind CSS v4 tem a mesma redução pelo [entrypoint de código-fonte](./tailwind.md) e não precisa do comando.

Ele precisa do Node.js 24 ou mais recente na máquina que gera o CSS, seja o seu notebook, um job de CI ou uma etapa do deploy, e de nada mais: o pacote é toda a instalação, sem Tailwind e sem configuração. Instale-o como dependência de desenvolvimento a partir da raiz do projeto; o npm cria um `package.json` se você não tiver um:

```sh
npm install --save-dev @codenhub/styles
```

A folha de estilos que o comando escreve é CSS puro, então os servidores que servem o seu site não precisam nem do Node.js nem do pacote. Acrescente o build aos scripts do seu `package.json`, onde o comando instalado está no path pelo nome dele:

```json
{
  "scripts": {
    "build:css": "chs build --content \"app/views/**/*.erb\" --output public/stylekit.css"
  }
}
```

Depois rode a partir da raiz do projeto:

```sh
npm run build:css
```

Para rodá-lo uma vez sem script, chame-o pelo nome do pacote:

```sh
npx @codenhub/styles build --content "app/views/**/*.erb" --output public/stylekit.css
```

Não digite `npx chs`. `chs` é o nome do comando dentro deste pacote, mas o npm também tem um pacote sem relação chamado `chs`, e `npx chs` roda esse outro em qualquer pasta onde este pacote não esteja instalado.

Quando dá certo, o comando imprime uma linha: o caminho absoluto que escreveu e o tamanho do arquivo em bytes:

```text
/home/you/shop/public/stylekit.css 24497 bytes
```

Referencie esse arquivo no seu layout como qualquer folha de estilos estática. Um build também pode imprimir na saída de erro linhas que começam com `chs: warning:`, como descreve [Como as classes são encontradas](#como-as-classes-são-encontradas); elas não mudam o status de saída.

Cada exemplo abaixo lê também os scripts que acrescentam classes no navegador, como `.active` ou `.indeterminate` numa [barra de progresso](../usage/feedback.md#mostre-o-progresso), porque uma classe que nenhum arquivo lido pelo build nomeia fica de fora. Tire esse `--content` se os seus scripts não acrescentam nenhuma, porque um glob que não corresponde a nada faz o build falhar.

### Views do Rails

```json
"build:css": "chs build --content \"app/views/**/*.erb\" --content \"app/helpers/**/*.rb\" --content \"app/javascript/**/*.js\" --output public/stylekit.css"
```

```erb
<%# app/views/layouts/application.html.erb %>
<link rel="stylesheet" href="/stylekit.css" />
```

### Views Blade do Laravel

```json
"build:css": "chs build --content \"resources/views/**/*.blade.php\" --content \"resources/js/**/*.js\" --output public/css/stylekit.css"
```

```blade
{{-- resources/views/layouts/app.blade.php --}}
<link rel="stylesheet" href="{{ asset('css/stylekit.css') }}" />
```

### Templates do Django

Um projeto Django guarda os templates numa pasta `templates/` do projeto, na pasta `templates/` de cada app, ou nas duas. Passe um `--content` para cada lugar onde ficam os seus, e deixe de fora os que você não usa, porque um glob que não casa com nada faz o build falhar:

```json
"build:css": "chs build --content \"templates/**/*.html\" --content \"shop/templates/**/*.html\" --content \"static/js/**/*.js\" --output static/stylekit.css"
```

```django
{% load static %}
<link rel="stylesheet" href="{% static 'stylekit.css' %}" />
```

Escreva a saída numa pasta listada em `STATICFILES_DIRS`, aqui `static/`, para que o `collectstatic` a recolha. A configuração acima lista só a pasta do pacote, então adicione `BASE_DIR / "static"` a essa lista se o seu projeto ainda não a tiver.

### Opções

- `--content <glob>`, ou `-c <glob>`, indica os arquivos onde procurar nomes de classe. É obrigatório e pode ser repetido: passe uma vez por glob, e o build lê todo arquivo que casar com algum deles. Um glob relativo é resolvido em relação à pasta de onde você roda o comando, então rode a partir da raiz do projeto; um glob absoluto é usado como está. Um caminho que nomeia um arquivo existente é lido como esse arquivo, mesmo quando o nome tem um colchete, como o `app/[id]/page.tsx` do Next.js; só um caminho que não nomeia nenhum arquivo é lido como glob. Num glob, um `[` abre um conjunto de caracteres, então `app/[locale]/**/*.tsx` casa com uma pasta cujo nome é uma das letras `l`, `o`, `c`, `a` ou `e`, não com `[locale]`: escreva o colchete como `[[]`, como em `app/[[]locale]/**/*.tsx`, que funciona em qualquer sistema, enquanto `\[` não funciona no Windows. Uma pasta não é um glob dos arquivos dentro dela: escreva `app/views/**/*`, não `app/views`. `**` casa com qualquer número de pastas, e `{rb,erb}` com qualquer uma das duas extensões. Qualquer arquivo de texto serve, seja qual for a extensão, em UTF-8 ou em UTF-16 com marca de ordem de bytes, como o `>` do Windows PowerShell 5.1 escreve. Cada glob precisa casar com pelo menos um arquivo, senão o build falha e o nomeia, então um erro de digitação não consegue publicar uma folha de estilos vazia. Arquivos que o seu `.gitignore` exclui são lidos mesmo assim quando um glob casa com eles, e nada fora dos seus globs é lido. Um `*` ou `**` também não entra numa pasta `node_modules`, então as páginas de demonstração de uma dependência nunca acrescentam classes: nomeie a pasta para ler uma, como em `node_modules/some-ui/**/*.html`. Um `*` ou `**` não casa com um nome que começa com ponto, então `**/*.html` ignora tanto `.hidden/page.html` quanto `.page.html`; escreva o ponto para alcançá-los, como em `.hidden/**/*.html`. O arquivo de `--output` nunca é lido em busca de classes, mesmo quando um glob casa com ele ou com um link para ele, e nem um arquivo temporário com o nome dele, `<output>.<random>.tmp`, que um build interrompido antes de terminar pode deixar ao lado; um glob que não casa com mais nada falha.
- Coloque cada glob entre aspas, com `\"` dentro de um script do `package.json`. Sem aspas, o seu shell pode expandir o glob numa lista de arquivos antes de o comando vê-lo, e só o primeiro arquivo conta como valor do `--content`. Quando isso deixa nomes de arquivo sobrando, o build os rejeita em vez de ler em silêncio menos do que você queria; quando o glob casou com um único arquivo, o build lê só esse arquivo e nada que os seus templates ganharem depois.
- `--output <file>`, ou `-o <file>`, é a folha de estilos a escrever. É obrigatório, e informado uma vez só. Um caminho relativo é resolvido em relação à pasta de onde você roda o comando, pastas-pai que faltam são criadas, e uma folha de estilos que o comando escreveu antes é substituída. Para você não perder um arquivo por engano, ele lê os primeiros bytes de um arquivo existente e recusa o que não começa com o aviso `/*! @codenhub/styles` do pacote, com que começa tudo o que ele escreve, depois do banner do Tailwind. Um arquivo vazio ou só com espaços em branco é substituído, e são recusados um arquivo que ele não consegue ler, um que uma entrada de `--content` nomeie e `-`, assim como uma pasta, um caminho que termina com um separador de pastas ou com um segmento `.` ou `..`, como `public/` ou `public/.`, um dispositivo como `/dev/null`, ou no Windows um nome que o Windows reserva para um em toda pasta, como `NUL`, `CON`, `COM1` ou `LPT1`, com ou sem extensão, um pipe ou um socket. Quando o `--output` é um link, o arquivo para onde ele leva é escrito e o link continua. No Linux e no macOS, a folha de estilos que ele substitui mantém as permissões, o dono e o grupo; só o root pode manter outro usuário como dono, então para qualquer outro o arquivo passa a ser dele, mantém o grupo se ele faz parte dele, e o comando imprime na saída de erro uma linha que começa com `chs: warning:`, e ainda assim sai com status 0. Um arquivo seu de um grupo do qual você não faz parte continua seu e fica com o seu grupo, e o aviso nomeia só o grupo. Quando o dono muda e as permissões não deixam ninguém além do dono ler o arquivo, como `0600`, o aviso diz também que o dono anterior, como o usuário do seu servidor web, talvez não consiga mais lê-lo; e quando o grupo muda e as permissões só deixam o dono e o grupo lerem o arquivo, como `0640`, ele diz o mesmo dos membros do grupo anterior, como o seu servidor web. Devolva a eles a permissão de leitura, ou rode o build como o dono do arquivo, no grupo dele.
- `--aesthetic <name>` acrescenta uma das [estéticas](../usage/aesthetics.md): `neobrutalism`, `glass`, `pixel`, `chunky-tile`, `cyber` ou `sketch`. Repita para mais de uma; nomear uma duas vezes a inclui uma vez só. As estéticas precisam ser pedidas porque o build não tem como saber pelos seus templates qual você quer: cada uma entra quando você a pede, menos as regras dela para classes que os seus templates não usam, e nenhuma entra quando você não pede. Quando um arquivo lido pelo build nomeia uma classe de uma estética, como `glass` ou `glass-liquid`, e você não pediu essa estética, o build escreve a folha de estilos mesmo assim, sem ela, e imprime uma linha `chs: warning:` que nomeia a classe e o `--aesthetic` a acrescentar. Uma palavra num texto também conta, então uma página que diz "pixel" ou "sketch" pode imprimi-la à toa.
- `--no-minify` escreve CSS legível e indentado no lugar. Útil para ler o que o build gerou; em produção, sirva o arquivo minificado.
- `--help` imprime o uso, com as estéticas que esta versão traz. `--version` imprime a versão do pacote. Nenhum dos dois gera nada, e os dois terminam com status 0.

A saída sempre traz o tema, os design tokens dele como propriedades personalizadas de CSS, o reset, as regras base de que todo componente depende e quatro classes, nomeadas ou não por um arquivo: `.dark`, `.theme-dark` e `.theme-light`, que trocam o tema, e `.disabled`. Por cima vem cada classe do StyleKit que os arquivos lidos pelo build usam. Qualquer outra classe que um script acrescenta no navegador, como `.active` ou `.indeterminate` numa barra de progresso, só é mantida quando um arquivo lido pelo build a nomeia, então passe também os seus scripts com um `--content`. A saída é gerada a partir da folha de estilos completa, não da `/native`, então não inclui os mapeamentos sem classes. Um build cujos templates nomeiam todas as classes escreve a folha de estilos completa, byte por byte.

### Como as classes são encontradas

O build não executa os seus templates. Ele lê como texto puro cada arquivo que casa com os seus globs de `--content`, recolhe cada palavra que poderia ser um nome de classe e escreve as regras das palavras que são classes do StyleKit. É assim que o Tailwind CSS também lê o conteúdo.

Só são lidos os arquivos que correspondem aos seus globs, então uma classe que só um script acrescenta, como em `bar.classList.add("indeterminate")`, só é encontrada quando o script é um deles. Nomeie os seus scripts com o próprio `--content`, como `app/javascript/**/*.js`.

Uma classe precisa aparecer num arquivo como uma palavra inteira. `class="btn primary"`, `class: "btn primary"` e `classes = ["btn", "primary"]` funcionam, assim como uma classe escrita antes ou depois de dois-pontos, como no `class:primary={isPrimary}` do Svelte ou no `btn: true` de um hash Ruby. Uma palavra que só parece uma classe também conta: um comentário que diz "card" adiciona todas as regras do card à folha de estilos, o que aumenta o arquivo e não muda nada na página.

Um nome de classe que o seu código monta na renderização nunca aparece inteiro em nenhum arquivo, então o build não consegue encontrá-lo. Em `class="btn <%= @order.priority %>"`, o `btn` é encontrado, mas a intenção é o que `priority` tiver na hora de renderizar; se for `destructive`, o botão aparece sem o vermelho dele. Há duas saídas:

- **Escreva os nomes de classe inteiros.** Associe cada valor a um nome de classe completo num arquivo que o build leia, como `{ "urgent" => "destructive", "normal" => "neutral" }.fetch(@order.priority)` num helper.
- **Liste-os num arquivo de safelist.** Um arquivo de texto puro com um nome de classe por linha, adicionado com o seu próprio `--content`, como `--content config/stylekit-classes.txt`. Guarde-o perto do código que monta os nomes de classe, para que quem mudar um veja o outro.

Alguns arquivos que correspondem a um glob não são lidos atrás de classes, porque cada um nomeia todas as classes do pacote e manteria a folha de estilos inteira: um arquivo que começa com o aviso `/*! @codenhub/styles` do pacote, com que começa toda folha de estilos que o comando escreve, então dois builds sobre uma mesma pasta nunca leem um ao outro; uma lista de nomes de classe copiada do `dist/purge/classes.json` do pacote; e um arquivo idêntico, byte por byte, a um que a versão instalada traz em `dist/`, como as cópias que o `collectstatic` ou o Propshaft fazem. Uma cópia de outra versão do pacote que não começa com o aviso, como uma estética ou o `theme.css` que um deploy anterior deixou no `STATIC_ROOT`, é lida, então limite os seus globs aos seus templates e scripts em vez da pasta onde os seus arquivos estáticos são reunidos.

Uma pasta em que um glob precisa procurar e que você não tem permissão para listar faz o build falhar, nomeando a pasta, em vez de deixar os arquivos dela de fora.

Quando os arquivos não nomeiam nenhuma classe do StyleKit, o build escreve mesmo assim o tema e o reset, e termina com status 0, mas imprime uma linha `chs: warning:` que nomeia os globs, porque um glob que nomeia os arquivos errados deixaria o site sem estilos sem dizer nada.

### Variantes

Uma classe de intenção, apresentação ou modificador pode receber um de dez prefixos, escritos como no Tailwind: `sm:`, `md:`, `lg:`, `xl:` e `2xl:` a aplicam a partir daquele breakpoint, `hover:`, `focus:`, `focus-visible:` e `active:` enquanto o elemento está naquele estado, e `dark:` onde quer que o tema escuro se aplique, como [Temas → A variante `dark:`](../usage/theming.md#a-variante-dark) descreve. `md:lg` deixa um botão grande a partir do breakpoint `md`, e `hover:primary` dá a ele a intenção primary no hover:

```html
<button class="btn sm md:lg ghost hover:soft">Save</button>
```

Isso cobre intenções como `primary` e `destructive`, as classes de preenchimento e borda como `soft` e `edged`, e modificadores como `sm`, `lg`, `raised`, `pill`, `tight` e `ruled`. `disabled` não recebe nenhum: é um estado em que o elemento está, então escreva-o como atributo ou como classe. Classes de componente como `btn` e `card`, e os helpers de texto e de layout, não recebem prefixo.

Cada prefixo é uma cópia fixa dessas classes, embutida no pacote, então a lista traz os comuns, e não todos os do Tailwind. O comando não empilha prefixos, como em `md:hover:primary`, e não oferece outros, como `print:` ou `group-hover:`. Uma classe assim não recebe estilo, e o elemento aparece sem ela.

### O que ele não faz

- **Não tem utilitários do Tailwind.** `flex`, `mt-4`, `text-red-500` e o resto do Tailwind não são classes do StyleKit, então o build os deixa de fora. Para layout, os [helpers de layout](../usage/content-and-layout.md) do próprio StyleKit entram no build como qualquer outra classe. Um projeto que quer os utilitários do Tailwind, as outras variantes dele ou prefixos empilhados roda o próprio Tailwind e importa o [entrypoint de código-fonte](./tailwind.md), que dá os três.
- **Não tem modo watch.** Ele gera uma vez e termina. Rode de novo depois de mudar um template, a partir de um script ou de um observador de arquivos que o seu framework ou editor já tenha. Uma classe que a folha de estilos ainda não tem deixa o elemento sem estilo até o próximo build.
- **Não tem arquivo de configuração nem CSS próprio.** Você não consegue acrescentar os seus próprios valores de `@theme`, definições de `@utility` nem plugins. Para mudar o visual, sobrescreva as propriedades personalizadas numa folha de estilos sua carregada depois desta, como [Personalização](../usage/customizing.md) descreve.
- **Não tem outros comandos.** `build` é o único; `--help` e `--version` são as únicas flags que funcionam sem ele.

### Num deploy

Gere a folha de estilos antes da etapa que recolhe ou aplica fingerprint aos seus assets, como `rails assets:precompile`, `php artisan optimize` ou `python manage.py collectstatic`. Você pode fazer commit da saída, e aí os servidores não precisam de Node.js nenhum, ao custo de um arquivo gerado que alguém precisa lembrar de regenerar; ou gerá-la no deploy, e aí a máquina de build precisa do Node.js 24 ou mais recente.

Fixe a versão. Abaixo da 1.0 uma versão minor pode renomear ou remover uma classe, então o mesmo comando pode escrever outra folha de estilos com uma versão mais nova. A saída não depende de nada além da versão do pacote e dos seus templates, então faça commit do `package.json` e do lockfile que o npm escreve, e instale com `npm ci` na máquina de build, para que cada build use a versão que você testou.

### Quando o build falha

Toda falha imprime uma linha começando com `chs:` na saída de erro padrão e termina com status 1, sem escrever o arquivo de saída, então um script de deploy para em vez de publicar uma folha de estilos desatualizada ou vazia. A linha diz o que deu errado e o que fazer:

- **`missing --content` ou `missing --output`.** Acrescente a que ela nomeia. Um `--content` ou um `--output` vazio ou só com espaços conta como ausente, como o que uma variável não definida dá em `--content "$TEMPLATES"`.
- **`EACCES` ou `EPERM`, nomeando uma pasta.** Um glob precisa procurar nessa pasta e você não tem permissão para listá-la. Corrija as permissões dela, ou escreva o glob de modo que não entre nela.
- **`--content "<glob>" matches no file in <folder>`.** Em geral é um erro de digitação no caminho, um comando rodado de outra pasta que não a raiz do projeto, ou um glob de um lugar que o seu projeto não usa. Gerar a partir de nada escreveria uma folha de estilos sem classes de componente, e o site perderia o estilo sem aviso. Quando se conhece uma causa mais provável, a linha a nomeia no lugar do caminho: um `*` ou `**` que só casou com arquivos dentro de `node_modules`, onde ele não entra, ou um `[` lido como o início de um conjunto de caracteres, quando escrevê-lo como `[[]`, que lê um colchete, casaria com um arquivo.
- **`--content "<path>" is a folder in <folder>, not a file`.** Nomeie os arquivos dentro dela, como em `app/views/**/*`.
- **`--content "<glob>" matches only --output <file>`.** O glob não casou com nada além da folha de estilos que o build escreve, que nunca é lida em busca de classes, como acontece com `public/*.css` depois que o build escreveu `public/stylekit.css`. Nomeie os templates no lugar.
- **`unexpected argument "<file>"`.** Quase sempre é um glob de `--content` sem aspas, que o seu shell expandiu numa lista de arquivos. Coloque o glob entre aspas.
- **`unknown option "<flag>"`.** Um erro de digitação, ou uma opção de outra ferramenta, como `--watch` ou `--config`. `--help` lista as opções.
- **`option "<flag>" is missing its value or does not take one`.** Uma flag que leva valor foi a última coisa da linha, ou o `--no-minify` recebeu um valor, como em `--no-minify=true`. Um valor que começa com hífen é lido como outra flag, então a linha diz para escrevê-lo depois de `=`, como em `--output=-app.css`, a não ser que o que vem depois seja uma das opções do próprio comando, como em `-c -o public/stylekit.css`, em que o valor ficou de fora.
- **`--output is given more than once`.** Cada build escreve uma única folha de estilos. Deixe um só `--output`, e rode o comando de novo para outro arquivo.
- **`unknown aesthetic "<name>"; choose from ...`.** Escolha um dos nomes listados. Eles são em minúsculas e com hífen, como `chunky-tile`.
- **`missing command` ou `unknown command "<name>"`.** A primeira palavra depois de `chs` precisa ser `build`.
- **`this command needs Node.js 24 or newer`.** Atualize o Node.js na máquina que gera o CSS.
- **`ExperimentalWarning: globSync is an experimental feature`.** O Node.js 24.0.0 a imprime, e o 24.1.0 ou mais recente não. A folha de estilos é gravada mesmo assim; atualize o Node.js para tirar a linha.
- **`cannot write --output <file>: <reason> (<code>); <what to do>`.** `<reason>` e `<code>` são os do Node.js. `EACCES` ou `EPERM` quer dizer que você não pode escrever ali, e no Windows também que o arquivo é somente leitura; `ENOSPC` quer dizer que o disco está cheio.
- **`--output <file> is a folder, not a file`**, ou um dispositivo, inclusive no Windows um nome como `NUL` ou `com1.css` que o Windows reserva para um, um pipe ou um socket, ou **`--output <file> ends with a folder separator`**, ou **`ends with a . or .. segment`**. Nomeie um arquivo de folha de estilos, como um dentro da pasta.
- **`--output <file> holds something this command did not write`.** O arquivo não é uma folha de estilos que este comando escreveu, como uma escrita à mão ou a de um fornecedor, então substituí-lo o perderia. Nomeie outro arquivo ou tire este do caminho. Uma cópia de `@codenhub/styles`, `/components` ou `/native` do pacote começa com o mesmo aviso, então é substituída como uma que o comando escreveu; uma cópia de outro entrypoint, como `/theme` ou uma estética, não, e é recusada.
- **`--output <file> is also a --content file`.** A saída nomeia um template, como em `--content index.html --output index.html`. Nomeie uma folha de estilos para escrever.
- **`cannot read --output <file> to check it is a stylesheet this command wrote`.** O arquivo existe, mas você não consegue lê-lo, então o comando não tem como saber se substituí-lo perderia algo. Corrija as permissões ou nomeie outro arquivo.
- **`--output - would write a file named -`.** O comando só escreve um arquivo, nunca a saída padrão. Nomeie uma folha de estilos.

## Conferindo se funcionou

Renderize um elemento estilizado, como em [Integração → Conferindo se funcionou](./index.md#conferindo-se-funcionou):

```html
<button class="btn primary">Save changes</button>
```

Um botão arredondado preenchido com a cor primária significa que a folha de estilos carregou. Se o botão parecer o padrão do navegador, abra o painel de rede do navegador: um `404` na folha de estilos significa que o caminho ou a configuração de arquivos estáticos está errado.

## A seguir

Volte para o caminho principal: [Montando uma tela](../concepts.md) adiciona o primeiro card e o primeiro formulário à página de configurações. [Configuração → Todos os entrypoints](../setup.md#todos-os-entrypoints) lista todas as outras folhas de estilos que você pode importar.
