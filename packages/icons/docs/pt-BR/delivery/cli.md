---
title: Comando de build
description: Escreve uma folha de estilos só com os ícones que os seus arquivos usam, para um projeto que não roda Tailwind CSS, Vite nem PostCSS.
order: 5
source: 4219722f8a2301c3ea8f4675843852c3f21f9ab7
---

# Comando de build

Para um projeto sem Tailwind CSS, Vite nem PostCSS, como uma app Rails, Laravel ou Django, ou um site estático, o comando `build` lê os seus arquivos, encontra as classes de ícone que eles usam e escreve uma folha de estilos só com esses ícones. Uma página com três ícones recebe cerca de 10 KB de CSS em vez de uma folha de estilos de família completa, onde só o Lucide tem cerca de 1,3 MB, e o modificador de espessura do traço `ic-lucide-heart/1.5` funciona como nos plugins.

Rode-o a partir de um script do `package.json`, onde o comando do pacote se chama `chi`:

```json
{
  "scripts": {
    "build:icons": "chi build --content \"app/views/**/*.erb\" --output public/icons.css"
  }
}
```

Ou rode-o uma vez, sem script:

```sh
npx @codenhub/icons build --content "app/views/**/*.erb" --output public/icons.css
```

Use `npx @codenhub/icons`, não `npx chi`: existe no npm um pacote não relacionado chamado `chi`, e `npx chi` o executa onde este pacote não está instalado.

Depois, faça o link da folha de estilos que ele escreveu. Ela já contém as regras base `.ic`, então nada mais é importado:

```html
<link rel="stylesheet" href="/icons.css" />
```

Rode o comando de novo sempre que os seus arquivos mudarem quais ícones usam, no mínimo antes de cada deploy. Ele escreve as mesmas regras que o [plugin do PostCSS](postcss.md) adiciona para os mesmos arquivos e opções, então um projeto pode trocar um pelo outro sem que o seu CSS mude.

## Opções

| Flag                          | Finalidade                                                                                             |
| ----------------------------- | ------------------------------------------------------------------------------------------------------ |
| `-c`, `--content <glob>`      | Arquivos onde procurar classes de ícone. Obrigatório e repetível.                                      |
| `-o`, `--output <file>`       | Folha de estilos a escrever. Obrigatório. As pastas acima são criadas.                                 |
| `--family <prefix>`           | Uma família de onde resolver ícones. Repetível. Por padrão, todas exceto as de marcas.                 |
| `--default-prefix <prefix>`   | Família contra a qual um nome sem família, como `ic-heart`, é resolvido. Sem ele, nenhum é.            |
| `--prefix <prefix>`           | Prefixo de classe. Por padrão, `ic`.                                                                   |
| `--stroke-width <width>`      | Padrão para as famílias baseadas em traço cujas classes não levam modificador.                         |
| `--no-base`                   | Deixa de fora as regras base `.ic`, para uma página que já as carrega de `@codenhub/icons`.            |
| `--attribution <auto \| off>` | `auto` escreve os avisos de licença como um comentário no topo; `off` não escreve nenhum. Veja abaixo. |
| `--help`, `--version`         | Mostra o uso ou a versão do pacote.                                                                    |

Cada opção é a do plugin do PostCSS, com o mesmo padrão, exceto `--family`. O plugin não resolve nenhuma família até você passar uma, enquanto o comando resolve todas exceto `simple-icons` e `logos`, as famílias de marcas, cujos logotipos carregam os termos de marca dos seus donos. Nomeie uma família de marcas para usá-la, junto com todas as outras famílias que você usa, já que nomear uma substitui o padrão:

```sh
chi build --content "templates/**/*.html" --output static/icons.css --family lucide --family simple-icons
```

`--content` lê globs como o plugin do PostCSS: relativos à pasta onde você roda o comando, com `**` para qualquer número de pastas e `{html,erb}` para qualquer das duas extensões. Um caminho que nomeia um arquivo existente é lido como esse arquivo, mesmo quando o nome tem um colchete, como o `app/[id]/page.tsx` do Next.js. Coloque cada glob entre aspas, com `\"` dentro de um script do `package.json`, para que o seu shell não o expanda antes.

## Atribuição

Com `--attribution auto`, o padrão, a folha de estilos começa com um comentário preservado que carrega o aviso de licença de cada família que ela usou, e que sobrevive à minificação. Com `off`, ela não carrega nenhum, e o comando avisa quando uma família que ela usou exige um aviso, para que você distribua esse aviso de outra forma. [Licenciamento](../licensing.md) explica o que cada família exige.

## Falhas e avisos

O comando para, não escreve nada e imprime uma linha começando com `chi:` quando o build sairia errado:

- **`--content "<glob>" matches no file in <folder>`.** Normalmente um erro de digitação, ou o comando rodando de outra pasta que não a raiz do projeto. Um build com arquivos faltando escreveria uma folha de estilos sem alguns ícones, e o site os perderia em silêncio.
- **Um arquivo que ele não consegue ler**, com a própria mensagem do Node.js.
- **`unexpected argument "<file>"`.** Quase sempre um glob de `--content` sem aspas, que o seu shell expandiu. Coloque o glob entre aspas.
- **`unknown family`, `unknown default prefix`**, listando os válidos, e **um `--attribution` diferente de `auto` ou `off`**, ou **um `--stroke-width` que não é um número positivo**.
- **Um Node.js anterior ao 26**, nomeando as duas versões.

Uma classe que não resolve para nenhum ícone, como um `ic-lucide-hart` com erro de digitação, é um aviso, não uma falha: o comando lista cada classe assim uma vez e escreve a folha de estilos mesmo assim. Uma palavra que só parece uma classe, como um texto `ic-` em um comentário, interromperia um build caso contrário.

## O que ele não faz

- **SVG inline e módulos por ícone.** Eles mudam os seus arquivos-fonte ou servem módulos a um bundler. Use o [plugin do Vite](vite.md).
- **Um registry personalizado ou um conjunto de ícones adotado.** Eles recebem valores JavaScript. Use um plugin.
- **Modo watch, arquivo de configuração e minificação.** Rode o comando a partir do seu próprio watcher ou script de build, e minifique a saída no seu próprio pipeline se você minifica CSS.

## Veja também

- [Métodos de entrega](index.md) — como os métodos se comparam.
- [Plugin do PostCSS](postcss.md) — as mesmas regras, a partir de um pipeline PostCSS.
- [Frameworks](../frameworks/index.md) — próximo passo na ordem de leitura.
