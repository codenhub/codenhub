<!-- source: 7a1a1c25b4ddb5cbffd5130e9e40d26c0643509b -->

# @codenhub/i18n

Traduza os textos do seu app com chaves tipadas, mensagens ICU, plurais e idiomas de fallback, no navegador, no servidor ou no build. Você traz as palavras; o pacote garante que cada visitante receba as dele.

O exemplo abaixo é o começo de uma pequena loja de chá online, que [a documentação](docs/pt-BR/index.md) vai aumentando página a página: uma página inicial, um carrinho que conta os itens, uma página "sobre" e um seletor de idioma.

## Instalação

```sh
pnpm add @codenhub/i18n
```

## Uso

```ts
// src/i18n.ts
import { createI18n } from "@codenhub/i18n";

const dictionaries = {
  en: { home: { title: "Welcome", greeting: "Hello, {name}!" }, cart: { items: { one: "{count} item", other: "{count} items" } } },
  pt: { home: { title: "Bem-vindo", greeting: "Olá, {name}!" }, cart: { items: { one: "{count} item", other: "{count} itens" } } },
} as const;

export const i18n = createI18n({
  locales: ["en", "pt"] as const,
  defaultLocale: "en",
  loadLocale: (locale) => dictionaries[locale],
});

export const { t } = i18n;
```

```ts
// src/main.ts
import { i18n, t } from "./i18n";

await i18n.init({ locale: "pt" });

t("home.greeting", { name: "Ana" }); // "Olá, Ana!"
t("cart.items", { count: 3 }); // "3 itens"
t("home.titel"); // erro de compilação: essa chave não existe
```

Essa última linha é a razão de ser do pacote inteiro: o erro de digitação falha no seu editor, e não na frente de um visitante que lê português. Aguarde o `init()` com `await` antes de chamar `t()`, que lança um erro enquanto o gerenciador não tiver começado.

Dois entry points opcionais cobrem o que muda de um ambiente para outro:

- `@codenhub/i18n/browser` detecta o idioma do visitante, lembra o que o seu app escolher, mantém `<html lang>` e `dir` em sincronia e pode traduzir HTML marcado com `data-i18n`.
- `@codenhub/i18n/routing` lê e monta caminhos localizados, como `/pt/about` ou `/pt/sobre`, e pode dispensar o prefixo do locale quando um caminho não deixa dúvida, como em `/sobre`.

## Documentação

- [Visão geral](docs/pt-BR/index.md): as ideias por trás do pacote e um passo a passo.
- [Escreva as suas traduções](docs/pt-BR/translations.md): arquivos JSON, mensagens ICU, plurais, variantes regionais e chaves e valores tipados.
- [Traduza um app no navegador](docs/pt-BR/browser.md), inclusive dentro de um Web Worker.
- [Renderize no servidor ou no build](docs/pt-BR/server-rendering.md)
- [URLs localizadas](docs/pt-BR/localized-urls.md)
- [Solução de problemas](docs/pt-BR/troubleshooting.md)
- [Referência da API](docs/reference/index.md) (em inglês)
- [Changelog](docs/changelog/index.md) (em inglês)

## Requisitos

- Um bundler ou runtime que entenda ESM.
- Node.js 26 ou mais recente, ou um navegador Chromium, Firefox ou WebKit atual, ou um Web Worker.
- Nenhuma dependência de runtime.

Em um Web Worker, o entry point raiz e `@codenhub/i18n/routing` funcionam como em qualquer outro lugar. `@codenhub/i18n/browser` só funciona com `syncDocument: false` e sem `root`, já que um worker não tem página; com os padrões, ele rejeita com um `TypeError` antes de iniciar o gerenciador. Veja [Em um Web Worker](docs/pt-BR/browser.md#em-um-web-worker).

## Observações

- No servidor ou num build estático, crie um gerenciador por requisição ou por página, e não um compartilhado. Um gerenciador compartilhado é o caminho para um visitante acabar lendo no idioma de outro.
- O pacote não renderiza HTML vindo das traduções: o texto sempre volta como texto.
- As mensagens ICU cobrem `number`, `date`, `time`, `plural`, `selectordinal` e `select`, sem skeletons de número nem estilos como `{n, number, currency}`, que aparecem como foram escritos, com um aviso. Formate um valor desses com `formatNumber()` e passe o resultado.

## Licença

Licenciado sob a [Apache-2.0](LICENSE).
