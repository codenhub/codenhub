---
title: Traduza um app no navegador
description: Detecte e lembre o idioma do visitante, mantenha lang e dir em sincronia, renderize de novo um framework, traduza HTML e rode num Web Worker.
order: 2
source: 255aaf9fbb14aa26557ebfdba8271b41d3911206
---

# Traduza um app no navegador

No navegador, quem traduz continua sendo o gerenciador da [visão geral](index.md). O `@codenhub/i18n/browser` acrescenta as partes que só um navegador tem: as configurações de idioma do visitante, um lugar para lembrar a escolha dele e a própria página.

Esta página monta essas partes para o app `en` e `pt` da loja de chá, vindo da visão geral. No fim, a loja recebe cada visitante no idioma dele, lembra esse idioma, tem um seletor de idioma e mantém o selo do carrinho em sincronia quando o idioma muda.

## Comece com `initializeBrowserI18n`

Use `initializeBrowserI18n()` no lugar de `i18n.init()`. Ele escolhe um locale, inicia o gerenciador com ele e depois mantém a página em sincronia:

```ts
// src/main.ts
import { initializeBrowserI18n } from "@codenhub/i18n/browser";
import { i18n } from "./i18n";

await initializeBrowserI18n({ i18n });
```

Sem nenhuma outra opção, ele:

1. Escolhe o locale do visitante (veja abaixo) e o carrega.
2. Define `<html lang="pt" dir="ltr">` para combinar, para que os leitores de tela pronunciem o texto corretamente e os [idiomas da direita para a esquerda](index.md#idiomas-da-direita-para-a-esquerda) fiquem com o layout certo.
3. Salva o idioma que o seu app escolher e o lê de volta na próxima visita do visitante.

Ele devolve um binding. Guarde-o se o seu seletor de idioma tem uma opção "Sistema", como [Ofereça uma opção "Sistema"](#ofereça-uma-opção-sistema) mostra. O método `disconnect()` dele só é necessário quando você desmonta o app, como em testes ou micro-frontends.

### Como o locale é escolhido

Vence o primeiro destes que der um locale suportado:

1. A opção `locale`, quando você passa uma. Ela conta como escolha do seu app, então também é salva, a menos que `persistLocale` seja `false`.
2. A escolha salva do visitante, de uma visita anterior. Um locale salvo que você não configura mais, como `pt-PT` depois que você mantém só `pt-BR`, é comparado como uma preferência do navegador, e o valor salvo fica como estava.
3. As configurações de idioma do navegador, `navigator.languages`, comparadas com os seus locales por [`matchLocale()`](index.md#transforme-entrada-externa-em-um-locale). Um visitante cujo navegador pede `pt-BR` recebe o seu `pt`.
4. O seu locale padrão.

Passe `locale` quando a página já sabe o idioma dela, como pela URL num [site localizado](localized-urls.md#leia-o-locale-no-cliente). Aí ele passa por cima de todo o resto, para que o navegador não possa discordar do servidor sobre o idioma da página.

Num site localizado, isso significa que cada visualização de página salva o idioma que está na URL dela. Normalmente é isso mesmo que você quer: o idioma salvo é o último que o visitante leu, e é nisso que [o redirecionamento do site estático](localized-urls.md#detecte-o-idioma-em-um-site-estático) se apoia.

Também significa que um visitante que segue um único link compartilhado de um chá em português fica com português salvo dali em diante, até ler uma página em outro idioma, mesmo que o navegador dele peça inglês. Um link de um amigo brasileiro, e a loja passa a falar português com ele.

Se você prefere salvar só o que o visitante escolhe no seu seletor de idioma, desligue o salvamento com `persistLocale: false` e guarde você mesmo a escolha do seletor. Essa opção também faz o binding parar de ler a escolha salva, então leia a sua de volta e passe-a como `locale`. Se o seu seletor também tem [uma opção "Sistema"](#ofereça-uma-opção-sistema), apague a escolha que você guardou quando o visitante escolhê-la, e inicie sem `locale` enquanto nada estiver guardado, para que o binding detecte de novo.

#### Quando um loader falha na inicialização

Se o seu loader falhar para um locale salvo, o binding avisa e tenta o locale que ele detecta pelo navegador, depois o locale padrão, para que o visitante ainda receba um idioma que lê em vez de um app quebrado. Um locale detectado que falha cai no padrão do mesmo jeito. A escolha salva é mantida para a próxima vez.

Duas falhas ainda rejeitam:

- Uma falha do loader para um locale que você passou explicitamente, ou para o locale padrão, já que não há nada razoável para onde cair.
- Um dicionário que carrega mas [quebra as regras](troubleshooting.md#um-dicionário-é-rejeitado), seja qual for o locale. Isso é um bug a corrigir, e não um soluço da rede para deixar passar.

## Deixe os visitantes trocarem de idioma

Chame `setLocale()` a partir do seu seletor de idioma. O binding reage a toda troca aplicada: ele salva a escolha e atualiza `lang` e `dir`.

```ts
const picker = document.querySelector<HTMLSelectElement>("#language")!;

picker.value = i18n.locale;
picker.addEventListener("change", async () => {
  await i18n.setLocale(picker.value as (typeof i18n.locales)[number]);
});
```

Um visitante que muda de ideia rápido é tratado para você. Quando duas trocas se sobrepõem, a última vence, e a anterior é resolvida sem mudar nada, como explica [A última chamada vence](index.md#a-última-chamada-vence). Então leia `i18n.locale` depois do `await` em vez de presumir o valor do seletor.

Só são salvas as escolhas que o seu app faz: a opção `locale` e cada `setLocale()` ou `init()` aplicado depois que o binding começou. Estes não são salvos:

- Um idioma detectado pelas configurações do navegador.
- O locale padrão em que o binding caiu.

Um visitante que nunca escolheu um idioma continua seguindo as configurações do navegador, inclusive quando você acrescenta o idioma dele mais tarde.

A escolha fica guardada no `localStorage` como `{"locale":"pt"}`, na chave `"i18n"`. Mude a chave com `storageKey`, ou desligue o salvamento com `persistLocale: false`. Se o armazenamento não estiver disponível, como em alguns modos de navegação privada, o binding avisa e segue sem ele.

### Ofereça uma opção "Sistema"

Quando um visitante escolhe um idioma, ele fica, e é essa a ideia. Uma opção "Sistema" no seletor deixa o visitante desfazer isso e voltar a seguir o navegador. Guarde o binding que `initializeBrowserI18n()` devolve; isto substitui o início e o seletor acima:

```ts
const binding = await initializeBrowserI18n({ i18n });
const picker = document.querySelector<HTMLSelectElement>("#language")!;

picker.value = binding.isUsingSystemLocale ? "system" : i18n.locale;
picker.addEventListener("change", async () => {
  try {
    if (picker.value === "system") {
      await binding.switchToSystemLocale();
    } else {
      await i18n.setLocale(picker.value as (typeof i18n.locales)[number]);
    }
  } finally {
    // Mostra a escolha do visitante, mesmo quando a troca falhou ou outra mais nova passou na frente.
    picker.value = binding.isUsingSystemLocale ? "system" : i18n.locale;
  }
});
```

`switchToSystemLocale()` esquece a escolha salva e troca para o idioma que o binding detecta agora, pelas configurações do navegador e depois pelo locale padrão. Esse idioma não é salvo, então a próxima visita detecta de novo. Se o armazenamento não puder ser limpo, o binding avisa, e a próxima visita ainda encontra a escolha antiga.

`isUsingSystemLocale` diz qual opção mostrar selecionada. Ele é `true` quando o binding começou sem nada escolhido e depois de `switchToSystemLocale()`. Ele vira `false` quando o seu app aplica um locale com `setLocale()` ou `init()`, inclusive o que já está na tela: um visitante que escolhe inglês enquanto inglês foi detectado escolheu inglês.

Enquanto `isUsingSystemLocale` é `true`, o binding também escuta o evento `languagechange` do navegador, então um visitante que troca o idioma do navegador no meio da visita recebe o novo sem recarregar. Um idioma que o visitante acabou de escolher e que ainda está carregando é mantido, não atropelado.

Num framework, renderize o seletor a partir de `binding.subscribe()` em vez de `i18n.subscribe()`. Escolher o idioma que já está na tela, ou "Sistema" enquanto o idioma detectado é o que está na tela, muda a seleção sem mudar o idioma, então o gerenciador não tem nada a informar. O binding informa as duas coisas, e também cada troca de idioma. No React:

```tsx
import { useState, useSyncExternalStore } from "react";
import type { BrowserI18nBinding } from "@codenhub/i18n/browser";
import { i18n } from "./i18n";

export function LanguagePicker({ binding }: { binding: BrowserI18nBinding }) {
  const selected = useSyncExternalStore(binding.subscribe, () => (binding.isUsingSystemLocale ? "system" : i18n.locale));
  // A escolha do visitante, mostrada enquanto o idioma dela carrega, para o select não voltar para o antigo.
  const [pending, setPending] = useState<string>();

  return (
    <select
      value={pending ?? selected}
      onChange={(event) => {
        const value = event.target.value;
        setPending(value);
        const switching = value === "system" ? binding.switchToSystemLocale() : i18n.setLocale(value as (typeof i18n.locales)[number]);
        // Depois a seleção volta a vir do binding, mesmo quando a troca falhou ou uma posterior passou na frente dela.
        switching.catch((error: unknown) => console.error(error)).finally(() => setPending((current) => (current === value ? undefined : current)));
      }}
    >
      <option value="system">System</option>
      {i18n.locales.map((locale) => (
        <option key={locale} value={locale}>
          {locale}
        </option>
      ))}
    </select>
  );
}
```

Quando o idioma detectado não carrega, `switchToSystemLocale()` rejeita com o `I18nError` do loader, e a página mantém o idioma atual; a escolha salva já foi esquecida. Mesmo assim `isUsingSystemLocale` é `true`, então o seletor mostra "System" sobre o idioma antigo: é o que o visitante escolheu, e a próxima visita ou o próximo `languagechange` tenta de novo o idioma detectado. Uma falha depois de um `languagechange` avisa e mantém o idioma atual. Nenhum dos dois cai para o padrão como o início faz, porque a página já tem um idioma para mostrar.

"Sistema" é para um site em que o binding escolhe o idioma. Num site com o idioma nas URLs, quem escolhe é a URL: cada página passa o seu locale para `initializeBrowserI18n()`, como faz [URLs localizadas](localized-urls.md), que o salva e encerra o seguimento do sistema, então uma escolha de "Sistema" só dura até a próxima página. Nesse caso, faça "Sistema" navegar, para a URL da página atual no idioma que `i18n.matchLocale(navigator.languages)` encontra, ou deixe a opção de fora.

## Renderize de novo com um framework

Frameworks como React, Vue, Svelte ou Solid renderizam o texto eles mesmos, chamando `t()`. Eles precisam saber quando renderizar de novo, e `i18n.subscribe()` diz a eles. Ele chama a sua função depois de cada `init()` aplicado e de cada troca de idioma aplicada, e devolve uma função que interrompe isso. Um `setLocale()` para o idioma que já está na tela, ou um que foi ultrapassado por uma chamada posterior, não muda nada e não chama nada.

No React, o `useSyncExternalStore` liga os dois. Aqui ele mantém o selo do carrinho da loja no idioma atual:

```tsx
import { useSyncExternalStore } from "react";
import { i18n, t } from "./i18n";

export function useLocale() {
  return useSyncExternalStore(i18n.subscribe, () => i18n.locale);
}

export function CartBadge({ count }: { count: number }) {
  useLocale(); // renderiza este componente de novo quando o idioma muda
  return <span>{t("cart.items", { count })}</span>;
}
```

Os outros frameworks seguem o mesmo padrão: guarde `i18n.locale` num valor reativo e atualize-o a partir de `subscribe()`.

## Traduza HTML sem framework

Para páginas estáticas, ou HTML que o seu framework não renderiza, o binding pode traduzir a própria página. Marque os elementos com a chave e passe a parte da página a traduzir como `root`:

```html
<h1 data-i18n="home.title">Welcome</h1>
<input data-i18n-placeholder="search.hint" placeholder="Search teas" />
<button data-i18n-aria-label="menu.open"><svg>…</svg></button>
```

```ts
await initializeBrowserI18n({ i18n, root: document });
```

Como cada parte se comporta:

- **`data-i18n` substitui todo o conteúdo de um elemento.** O elemento precisa conter só texto, sem elementos filhos, para que uma tradução nunca consiga apagar a sua marcação. Elementos com filhos são pulados com um aviso.
- **Comentários também são substituídos.** Eles não são elementos, então não contam como filhos. Não coloque `data-i18n` num elemento que um framework renderiza ou hidrata, já que os frameworks guardam marcadores em comentários ali; traduza esse texto com `t()`.
- **`data-i18n-<attribute>` traduz um atributo.** Só são permitidos atributos que guardam texto para pessoas ou para leitores de tela: `alt`, `title`, `placeholder`, `label`, `aria-label`, `aria-description`, `aria-placeholder`, `aria-roledescription` e `aria-valuetext`. Os outros, como `data-i18n-href` ou `data-i18n-onclick`, são ignorados, então uma tradução nunca consegue mudar um link, um estilo ou um event handler. O `title` de um `<style>`, ou de um `<link rel="stylesheet">`, é pulado com um aviso, porque ali ele nomeia um conjunto de folhas de estilo, e renomeá-lo poderia desligar os estilos da página.
- **O texto que já está no HTML é o último fallback.** Uma chave que falta num idioma mostra o texto do próximo locale na cadeia de fallback dele, como `t()` faz: um pai configurado, como `pt` para `pt-BR`, e depois o locale padrão. O texto original só volta quando nenhum dicionário da cadeia tem a chave. Um elemento que mostra o texto de outro locale recebe o `lang` desse locale, como `<p lang="en">` numa página em português, para que um leitor de tela o pronuncie no idioma certo; o binding restaura o `lang` próprio do elemento quando o texto volta a estar no idioma da página, a menos que o seu código o tenha mudado. Um elemento com conteúdo próprio, como texto ou filhos, é marcado só pelo texto de `data-i18n` dele, já que `lang` cobriria esse conteúdo também, e um elemento cujas chaves mostram texto de locales diferentes, ou o próprio texto do HTML depois de uma chave que falta, não é marcado.
- **O texto é definido como texto puro, nunca como HTML.** O texto de `<script>`, `<style>`, `<noscript>`, `<template>`, `<iframe>`, `<noembed>`, `<noframes>`, `<xmp>` e `<plaintext>` nunca é tocado, já que roda como código, decide o que aparece ou é escrito sem escape quando a página é salva como HTML. Os atributos deles são traduzidos como os de qualquer outro, então `<iframe data-i18n-title="video.title">` recebe um nome acessível traduzido.
- **Uma mensagem que precisa de valores mantém o texto do HTML**, com um aviso uma vez por chave, porque não há de onde, no HTML, passar um valor. Isso vale para `{name}` e qualquer outro argumento, como um plural inteiro, que de outro jeito mostraria a sintaxe ICU aos visitantes. Renderize textos com valores a partir do seu código, com `t()`.
- **A página mostra o texto do HTML até o dicionário do visitante carregar** e depois troca no lugar, o que, numa conexão lenta, dá para ver. Há dois jeitos de evitar isso:
  - Renderize uma página por idioma com antecedência, como em [Gere um site estático](server-rendering.md#gere-um-site-estático), e passe o `locale` dela.
  - Mantenha o root escondido até a promise do binding terminar, seja resolvida ou rejeitada, com um prazo no loader como em [Ele nunca falha, só trava](troubleshooting.md#ele-nunca-falha-só-trava), para que uma requisição empacada não deixe a página em branco.

### Controles de formulário

Dois elementos de formulário pedem cuidado, porque o texto deles também é o que o formulário envia. O checkout da loja tem os dois:

- **Dê um `value` a todo `<option>` traduzido.** Uma opção sem `value` envia o próprio texto, então `<option data-i18n="shipping.standard">Standard shipping</option>` envia `Envio padrão` quando a página está em português, e o seu servidor recebe um método de envio de que nunca ouviu falar. Escreva `<option value="standard" data-i18n="shipping.standard">Standard shipping</option>`, e o formulário envia `standard` em todos os idiomas.
- **Use `<button>` para um botão de envio traduzido.** O rótulo de `<input type="submit" value="Place order">` é o `value` dele, e `value` não é um atributo que o binding traduz, já que também é um dado que o formulário envia. `<button type="submit" data-i18n="checkout.submit">Place order</button>` é traduzido como qualquer outro texto.

### Acompanhe as mudanças

A página é traduzida de novo a cada troca de idioma. Para traduzir também os elementos que o seu código acrescenta depois, ligue `observe`:

```ts
await initializeBrowserI18n({ i18n, root: document.querySelector("#app")!, observe: true });
```

Com `observe`, acrescentar um elemento, ou mudar ou remover uma chave `data-i18n`, é tratado na hora. Isso inclui elementos que outro código acrescenta enquanto o binding está traduzindo, como um custom element que renderiza filhos quando um atributo dele muda.

O texto de um elemento pertence à chave `data-i18n` dele, então com `observe` o binding escreve a tradução de volta por cima do texto que o seu código coloca: um botão cujo rótulo o seu código troca para "Enviando pedido…" volta a dizer "Fazer pedido" na hora. Remova a chave antes, o que restaura o texto do HTML, ou ponha o texto que muda num elemento sem chave.

O binding trata essas mudanças uma vez por passada. Se aquele código mudar uma chave de novo em resposta, como faria um elemento que vive redefinindo o próprio atributo `data-i18n-*`, a segunda mudança espera pela próxima troca de locale em vez de começar um loop infinito. Dois trechos de código que não param de responder um ao outro são uma conversa sem fim, e o binding sai dela com educação.

Um elemento que é acrescentado e depois tirado de dentro do `root` antes de o binding chegar nele não é traduzido: a essa altura, ele pertence a outra parte da página.

Deixe `observe` desligado quando um framework renderiza a página: o framework já chama `t()`, e observar a página só duplicaria o trabalho dele.

### Custom elements

O binding não olha dentro de custom elements, com ou sem shadow root, e não avisa quando pula um deles. Isso vale para tags com hífen, como `<my-widget>`, e para elementos nativos customizados com `is`, como `<button is="my-button">`.

Um componente tem vida própria: ele pode renderizar depois que a página foi traduzida, e acrescenta e remove texto conforme as pessoas o usam, texto que ele vai ter de traduzir sozinho de qualquer jeito. Então o componente traduz o próprio conteúdo: chame `i18n.t()` quando ele renderizar e renderize de novo a partir de `i18n.subscribe()`. O card de produto da loja faz exatamente isso:

```ts
class ProductCard extends HTMLElement {
  #unsubscribe?: () => void;

  connectedCallback() {
    // O elemento pode se conectar antes de o gerenciador ficar pronto; `subscribe()` também chama de volta quando `init()` é aplicado.
    this.#unsubscribe = i18n.subscribe(() => this.render());
    if (i18n.isReady) {
      this.render();
    }
  }

  disconnectedCallback() {
    this.#unsubscribe?.();
  }

  render() {
    this.querySelector("button")!.textContent = i18n.t("cart.add");
  }
}
```

Isso inclui um custom element usado só como embrulho, cujos filhos você escreveu na página, como `<site-nav><a data-i18n="nav.home">Home</a></site-nav>`: esses links também são pulados. Use um elemento comum, como `<nav>`, para um embrulho cujo texto a página traduz.

Um componente não pode ter um binding próprio no mesmo gerenciador, já que um gerenciador tem um binding só.

## Em um Web Worker

Um Web Worker não tem página, então não há `<html>` onde definir `lang` nem nada para traduzir. Digamos que a loja formate o histórico de pedidos num worker. O gerenciador do núcleo e o `@codenhub/i18n/routing` funcionam ali como em qualquer lugar. O binding do navegador ainda consegue escolher e salvar o locale, se você desligar as partes que precisam de uma página:

```ts
// worker.ts
await initializeBrowserI18n({ i18n, syncDocument: false });
```

Passe `syncDocument: false` e nenhum `root`. Com o padrão `syncDocument: true` e sem `document`, `initializeBrowserI18n()` lança `TypeError: [I18n] Document synchronization requires a page document; pass syncDocument: false without one.` antes de iniciar o gerenciador, então o gerenciador fica sem iniciar em vez de meio vinculado.

Um worker também não tem `localStorage`, então o salvamento avisa e é pulado. Acrescente `persistLocale: false` para iniciar em silêncio.

## Opções

| Opção           | Padrão        | O que faz                                                                                                                 |
| --------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `i18n`          | (obrigatória) | O gerenciador a iniciar.                                                                                                  |
| `locale`        | nenhum        | Um locale que passa por cima dos salvos e dos detectados. Ele também é salvo enquanto `persistLocale` estiver ligado.     |
| `persistLocale` | `true`        | Lê a escolha salva e salva a opção `locale` e cada troca de idioma que o seu app fizer depois de iniciar.                 |
| `storageKey`    | `"i18n"`      | A chave do `localStorage` para a escolha salva.                                                                           |
| `syncDocument`  | `true`        | Mantém `<html lang>` e `dir` em sincronia com o locale. Precisa de um `document` de página; passe `false` num Web Worker. |
| `root`          | nenhum        | A parte da página a traduzir com atributos `data-i18n`.                                                                   |
| `observe`       | `false`       | Também traduz as mudanças abaixo de `root` conforme elas acontecem. Precisa de `root`.                                    |

## Regras para conhecer

- **Um binding por gerenciador.** Uma segunda chamada de `initializeBrowserI18n()` para o mesmo gerenciador é rejeitada até que o primeiro seja desconectado.
- **Inicie o binding uma vez só, quando o app começa**, com um `await` no nível superior de um módulo ou antes de montar o app, não no efeito de um componente. Um início que ainda está carregando não pode ser cancelado, então um segundo início, como o que o StrictMode do React causa ao rodar um efeito duas vezes, é rejeitado com `Error: [I18n] The manager already has a browser binding.`, sem nenhum binding ainda para chamar `disconnect()`.
- **Dê a cada binding a sua própria parte da página.** Dois bindings, como em micro-frontends, cada um com o seu gerenciador, precisam de `root`s que não contenham um ao outro. Onde eles se sobrepõem, cada um traduz os elementos compartilhados no próprio idioma, e o último a rodar vence. Eles também compartilham a escolha salva e o `<html lang>`, a menos que você diga o contrário: dê a cada binding extra o seu próprio `storageKey`, para que a escolha que um binding salva não sobrescreva a de outro, e `syncDocument: false` a todos menos o binding dono da página.
- **Deixe o binding iniciar o gerenciador.** A promise do binding é rejeitada com `Error: [I18n] Browser initialization was superseded before its locale became active.` quando, antes de o locale do binding estar ativo, o seu código:
  - chama `i18n.init()`, ou
  - chama `i18n.setLocale()` num gerenciador que já estava inicializado, mesmo que seja para o locale que já está na tela.

  O gerenciador fica com o resultado da chamada posterior, conforme [a regra da última chamada](index.md#a-última-chamada-vence), e o binding não é conectado. Num gerenciador que ainda não tinha sido inicializado, `setLocale()` só falha com o próprio erro, e o binding segue em frente. Chamar `init()` ou `setLocale()` depois que a promise do binding foi resolvida não tem problema.

- **`disconnect()` para de reagir, mas não desfaz nada.** Ele para de salvar, sincronizar, traduzir, seguir o idioma do navegador e chamar os listeners de `binding.subscribe()`, mas deixa o texto atual, os atributos e a escolha salva como estão. Uma troca para um idioma detectado que ainda está carregando é descartada, e `switchToSystemLocale()` rejeita depois dele. Depois disso você pode iniciar um novo binding.

A [referência do navegador](../reference/browser.md) (em inglês) documenta cada opção e cada falha, e [Solução de problemas](troubleshooting.md#o-binding-do-navegador-avisa-ou-rejeita) lista cada aviso que o binding registra.

## Próximos passos

Um app de navegador que também é renderizado no servidor, ou gerado com antecedência, tem uma segunda metade: [Renderize no servidor ou no build](server-rendering.md) cobre essa parte, inclusive como passar o locale do servidor para o navegador. Se o seu app só roda no navegador e coloca o idioma nas URLs, vá direto para [URLs localizadas](localized-urls.md), onde a página "sobre" vira `/sobre`.
