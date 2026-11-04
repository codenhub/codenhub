---
title: Sem bundler
description: Como referenciar as folhas de estilos compiladas a partir de HTML puro, Rails, Django ou qualquer aplicação renderizada no servidor.
order: 6
source: c18a6d2488839883d8171685e9916225c4eb98fd
---

# Sem bundler

As folhas de estilos compiladas são CSS pronto: cada uma é um único arquivo, sem `@import` e sem referência a outro arquivo, e toda imagem que ela desenha vem embutida como uma URL `data:`: as máscaras do visto e do traço do checkbox e os filtros SVG de lente que o `.glass-liquid` usa. Uma página pode carregar qualquer uma delas com uma tag `<link>` simples, de qualquer servidor, sem etapa de build, e a folha de estilos não faz nenhuma requisição adicional.

O que precisa de uma ferramenta de build é o _nome_ do import. `@import "@codenhub/styles"` nomeia um pacote, e encontrar o arquivo por trás desse nome — `node_modules/@codenhub/styles/dist/index.css` — é trabalho de ferramentas que conhecem o Node, como Vite, webpack ou a CLI do Tailwind, que leem o mapa `exports` do pacote. Um navegador não faz isso: ele resolve a URL de um `@import` em relação à folha de estilos que o contém, e um `<link href>` em relação à página, então um nome de pacote solto vira uma requisição para um caminho que não existe. Sem bundler, referencie o arquivo pelo caminho.

Os entrypoints `/tw` são código-fonte do Tailwind e precisam de um build do Tailwind. O `/tw/aesthetics` é a exceção, CSS puro sem nada para o Tailwind processar, mas sem bundler referencie os arquivos compilados de `dist/aesthetics/`, como abaixo. Esta página trata só dos entrypoints compilados, para uma página que não tem nenhum build de CSS: HTML puro, Rails, Django ou qualquer aplicação renderizada no servidor.

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

Referencie primeiro o arquivo base e depois uma estética. [Configuração → Todos os entrypoints](../setup.md#todos-os-entrypoints) explica o que cada um contém; referencie um arquivo base só, não vários, porque eles se sobrepõem.

## A partir de uma CDN

O jsDelivr e o unpkg servem todos os arquivos de todas as versões publicadas no npm, então uma página pode referenciar um deles sem instalar nada:

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@codenhub/styles@0.7.0/dist/index.css" /> <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@codenhub/styles@0.7.0/dist/aesthetics/pixel.css" />
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

### Laravel

Uma aplicação Laravel roda Vite por padrão, então ela tem um bundler: importe o pacote a partir de `resources/css/app.css`, como em [Configuração → Importe a folha de estilos](../setup.md#importe-a-folha-de-estilos), e carregue esse arquivo com a diretiva `@vite`, como de costume.

## Conferindo se funcionou

Renderize um elemento estilizado, como em [Integração → Conferindo se funcionou](./index.md#conferindo-se-funcionou):

```html
<button class="btn primary">Save changes</button>
```

Um botão arredondado preenchido com a cor primária significa que a folha de estilos carregou. Se o botão parecer o padrão do navegador, abra o painel de rede do navegador: um `404` na folha de estilos significa que o caminho ou a configuração de arquivos estáticos está errado.

## A seguir

Volte para o caminho principal: [Montando uma tela](../concepts.md) adiciona o primeiro card e o primeiro formulário à página de configurações. [Configuração → Todos os entrypoints](../setup.md#todos-os-entrypoints) lista todas as outras folhas de estilos que você pode importar.
