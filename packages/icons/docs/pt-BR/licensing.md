---
title: Licenciamento
description: O que cada build deve incluir pela arte que entrega, os modos de atribuição e como o aviso viaja em cada método de entrega.
order: 5
source: ee37c2be06074477ad7b3efecbf5375cd3ba983c
---

# Licenciamento e atribuição

Esta página explica o que o seu build deve incluir pela arte de ícones que entrega, como funciona a opção `attribution`, como cada método de entrega transporta o aviso exigido e quais restrições de marca registrada se aplicam aos ícones de marca.

Toda família gerada e empacotada traz o texto de licença e o aviso de atribuição que a sua arte exige; esses arquivos acompanham o pacote independentemente do que um build gera. Um conjunto de terceiros adotado com `adoptIconifySet` não é coberto por essa garantia — forneça o material de licença e atribuição dele por conta própria.

## Modos de atribuição

A opção `attribution` controla como os avisos de licença chegam à saída do seu build:

| Modo            | Comportamento                                                                                                                                                                                |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auto` (padrão) | Adiciona um banner `/*! … */` no início do CSS gerado, nomeando apenas as famílias que o build usou. O modo SVG inline do Vite, que não tem folha de estilos, emite `icons-attribution.txt`. |
| `file`          | Emite `icons-attribution.txt` como um asset de build no lugar do banner. Apenas no Vite.                                                                                                     |
| `off`           | Não emite nada e exibe um aviso quando uma família usada ainda exige aviso de licença.                                                                                                       |

## Como o aviso viaja

Cada método de entrega transporta o aviso por um mecanismo compatível com o seu pipeline:

| Método             | Como o aviso viaja                                                                             |
| ------------------ | ---------------------------------------------------------------------------------------------- |
| Vite               | Um banner `/*! … */` no CSS gerado, ou `icons-attribution.txt` em `file` e no modo SVG inline. |
| PostCSS            | Um banner `/*! … */` no CSS gerado.                                                            |
| Tailwind `/tw`     | Um banner `/*! … */` abrindo `dist/tw/index.css`, nomeando todas as famílias que ele resolve.  |
| Tailwind `@plugin` | Uma custom property `--ic-attribution-<family>` em `:root`, uma por família que o build usou.  |
| CSS puro           | Um banner `/*! … */` abrindo cada folha de estilos de família que você importou.               |

`@import "@codenhub/icons/tw"` incorpora um arquivo estático, então traz um banner `/*! … */` comum. Como esse arquivo torna todas as famílias empacotadas resolvíveis, exceto as famílias de marcas, o banner nomeia todas essas famílias principais — um aviso abrangente (superset), que cumpre a exigência da licença com segurança. Declarar o plugin manualmente com `@plugin "@codenhub/icons/tailwind"` restringe a resolução, e aí o aviso é emitido como uma custom property `--ic-attribution-<family>`: a API de plugins do Tailwind gera declarações CSS em vez de comentários, e a propriedade é emitida na primeira vez que uma família gera um utilitário, então a saída carrega avisos apenas para a arte que realmente foi entregue.

## Níveis de obrigação

Licenças permissivas ainda impõem requisitos de distribuição diferentes, agrupados em três níveis:

- **`none`** — dedicações ao domínio público. Nada é exigido na saída distribuída.
- **`notice`** — MIT, ISC e Apache-2.0. O aviso de copyright e licença precisa acompanhar a saída distribuída, o que `auto` e `file` fazem automaticamente.
- **`credit`** — CC-BY e licenças semelhantes. A autoria precisa ser creditada de forma visível.

Toda família empacotada, exceto `simple-icons` e `logos`, pertence ao nível `core`, o que significa que seu nível de obrigação é `none` ou `notice`, então um build padrão cumpre os termos da licença automaticamente. Observe que um minificador configurado com `legalComments: "none"` remove comentários CSS, incluindo banners `/*! … */`; use `attribution: "file"` no Vite, ou preserve comentários legais na configuração do seu minificador.

Um conjunto adotado com `adoptIconifySet` pertence ao nível `extended` — você continua responsável por cumprir os termos da licença dele e fornecer o seu material de atribuição. Veja [API JavaScript](javascript-api.md).

## Famílias de marcas

`simple-icons` e `logos` pertencem ao nível `brand`: logotipos em uma cor do [Simple Icons](https://simpleicons.org) e logotipos coloridos de [gilbarbara/logos](https://github.com/gilbarbara/logos), ambos dedicados ao domínio público sob CC0. Nenhuma das duas famílias exige aviso de licença, mas um logotipo é uma marca registrada, e a marca registrada é separada da licença de direitos autorais: usar uma marca continua sujeito às diretrizes da marca do seu proprietário, o que nenhuma opção de build consegue satisfazer ou verificar.

- **Apenas opt-in.** Vite e PostCSS carregam apenas as famílias que você passar. `@codenhub/icons/tw` nunca resolve famílias de marcas; um `@plugin "@codenhub/icons/tailwind"` declarado manualmente só as resolve quando a opção `families` as nomeia.
- **Linha de aviso de marca registrada.** A linha de aviso de cada família, onde quer que o build a emita, declara que as marcas são marcas registradas de seus proprietários. Definir `attribution: "off"` a suprime sem emitir alerta porque nenhuma licença a exige.
- **Entradas excluídas do Simple Icons.** O Simple Icons registra uma licença separada para alguns ícones. Ícones cuja licença própria acrescenta qualquer obrigação são excluídos, então nenhum ícone na família carrega uma obrigação de licença registrada: cada um é CC0, Unlicense ou não tem licença registrada na origem.
- **Recoloração e diretrizes.** Cada ícone de marca é renderizado nas cores da marca por padrão, e `--ic-color` pode recolori-lo; um logotipo colorido vira uma silhueta monocromática. As diretrizes dos proprietários costumam permitir a marca em suas cores oficiais ou em monocromático simples e restringir cores arbitrárias; confira os termos do proprietário ao recolorir uma marca. Veja [Cor](concepts.md#cor).
- **Remoções do Simple Icons.** O Simple Icons remove ícones quando proprietários de marcas solicitam. Atualizar o pacote entre versões major da origem pode remover nomes de ícones; confira o changelog para nomes removidos.
- **Origem fixada para `logos`.** O repositório gilbarbara/logos não publica releases, então `logos` é gerado a partir de um commit fixado, e atualizá-lo pode remover ou renomear logotipos; confira as mudanças no changelog. Alguns arquivos da origem cujo markup não pode ser renderizado como um ícone autossuficiente, como arquivos que incorporam um bitmap, são excluídos, e o `ATTRIBUTION.md` da família os lista.

## A seguir

Leia [Solução de problemas](troubleshooting.md) se um ícone não aparecer, renderizar como um quadrado sólido, ignorar a espessura do traço ou perder seu aviso de licença.
