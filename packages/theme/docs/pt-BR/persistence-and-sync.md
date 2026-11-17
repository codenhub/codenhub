---
title: Salvar e sincronizar
description: Como a escolha é salva, o que acontece quando o armazenamento falha, como as abas ficam de acordo e como reagir a mudanças de tema.
order: 4
source: dea770130ba871237154263ed85c91f8a27a90a4
---

# Salvar e sincronizar

A troca de tema já lembra a escolha do usuário e segue o sistema operacional. Esta página explica como isso funciona, o que acontece quando o navegador atrapalha, e como o resto do seu código, como um gráfico que precisa se redesenhar com as cores novas, pode acompanhar quando o tema muda.

## Como a escolha é salva

`set()` e `toggle()` salvam o nome do tema escolhido no `localStorage`, sob a chave `"app-theme-preference"`, a menos que você defina `storageKey`. Na próxima visita, `init()` o encontra e o aplica. `clearPreference()` o apaga e volta à configuração do sistema operacional.

Só conta um nome que corresponda a um tema configurado. Se o valor salvo nomeia um tema que você removeu nesse meio-tempo, o pacote o ignora, como se nada estivesse salvo. Renomear `sepia` para `parchment` é seguro; os usuários que o tinham escolhido voltam para o tema do sistema.

Enquanto houver uma escolha salva, as mudanças no modo claro ou escuro do sistema operacional são ignoradas: o usuário já disse o que quer. Elas voltam a valer depois que `clearPreference()` roda.

## Quando o armazenamento falha

Navegadores podem recusar o `localStorage`: uma janela anônima pode bloqueá-lo, um usuário pode desativar os dados de sites, ou o armazenamento pode estar cheio. O pacote nunca deixa isso quebrar a sua página, e cada tipo de falha (leitura, escrita, remoção) é registrado uma única vez com `console.error`, e não a cada chamada:

- **Uma leitura que falha** conta como nenhuma escolha salva, então vale a configuração do sistema operacional, a menos que o usuário já tenha escolhido um tema com `set()` ou `toggle()` nesta página, e aí essa escolha fica.
- **Uma escrita que falha** mantém o que estava salvo antes, se havia algo. A nova escolha do usuário continua funcionando enquanto a página estiver aberta: depois de `set()` ou `toggle()`, o tema escolhido fica, e as mudanças do sistema operacional não o sobrescrevem. Ao recarregar, volta a valer o tema salvo antes, ou a configuração do sistema operacional.
- **Uma remoção que falha** em `clearPreference()` deixa a escolha antiga salva. A página muda para o tema do sistema, mas recarregar restaura a escolha salva, e as mudanças do sistema operacional continuam ignoradas enquanto ela estiver lá.

`theme.preference` informa a escolha salva quando ela nomeia um dos seus temas, e `null` caso contrário, então nessa situação ele pode discordar do tema ativo: ele fica `null` quando o armazenamento não pode ser lido de jeito nenhum, e mantém o tema salvo antes quando só a gravação falha, como com a cota cheia.

## Mantendo as abas de acordo

Um usuário com o seu app aberto em duas abas que troca o tema numa delas espera que a outra acompanhe. E ela acompanha, automaticamente: toda aba cujo gerenciador rodou `init()` com o mesmo `storageKey` escuta mudanças na escolha salva. Quando outra aba salva, apaga ou substitui essa escolha, inclusive com `localStorage.clear()`, cada aba escolhe o tema de novo a partir do armazenamento e do sistema operacional, como `init()` faz.

Uma escolha que uma aba não conseguiu salvar é descartada nesse momento, porque o armazenamento não concorda mais com ela. A exceção é uma aba em que o próprio acesso a `window.localStorage` lança um erro: ela ignora esses eventos e mantém a sua escolha. Uma aba que consegue alcançar o `localStorage` mas falha ao ler dele descarta a escolha como qualquer outra.

Só o tema acompanha. Os overrides de tokens de `setTokens()` pertencem à aba que os definiu.

## Reagindo a mudanças

Outras partes do seu código podem precisar saber quando o tema muda: o gráfico que se redesenha com as cores novas, ou o ícone do toggle que mostra um sol ou uma lua. `subscribe()` chama uma função depois de cada mudança e devolve uma função que interrompe isso:

```ts
const unsubscribe = theme.subscribe(({ name, theme: active, source }) => {
  console.log(`Agora mostrando ${name}, um tema ${active.colorScheme}, por causa de ${source}.`);
});

// Mais tarde, quando não for mais necessário:
unsubscribe();
```

A função, do tipo `ThemeChangeListener`, recebe um `ThemeChangeDetail`:

- `name`: o nome do tema ativo.
- `theme`: o mesmo objeto que `theme.get()` devolve.
- `source`: o que causou a mudança, do tipo `ThemeChangeSource`. É o método que rodou, `"init"`, `"set"`, `"toggle"`, `"clearPreference"` ou `"setTokens"`; `"system"` quando o modo do sistema operacional mudou; ou `"storage"` quando outra aba mudou a escolha salva.

Esses tipos ajudam quando o subscriber mora em outro lugar:

```ts
import type { ThemeChangeListener } from "@codenhub/theme";

const redrawChart: ThemeChangeListener = ({ theme: active }) => {
  chart.setColors(active.tokens);
};

theme.subscribe(redrawChart);
```

Uma mudança é anunciada mesmo quando cai no tema que já estava ativo, como `set("dark")` enquanto `dark` está à mostra. Compare `name` com o anterior quando só uma troca de verdade deve gerar trabalho.

`source` importa quando o seu app também salva o tema em outro lugar, como num perfil de usuário no seu servidor. Reaja só a `"set"`, `"toggle"` e `"clearPreference"`, as ações do próprio usuário. Caso contrário, cada aba aberta repete a mesma requisição quando recebe a mudança via `"storage"`, e o seu servidor fica sabendo do tema do usuário uma vez por aba.

Algumas garantias tornam os subscribers seguros de escrever:

- Um subscriber que lança um erro é registrado no log, e os outros continuam rodando.
- Um subscriber que muda o tema ele mesmo, por exemplo chamando `set()`, interrompe a entrega da mudança que recebeu: os subscribers depois dele recebem só a mudança mais nova, então nenhum deles age sobre um tema que já foi embora.
- Um subscriber adicionado enquanto uma mudança está sendo entregue recebe só as mudanças seguintes.

### A partir de código sem acesso ao gerenciador

Algum código não consegue importar o gerenciador, como um widget de terceiros ou um script separado. O pacote também dispara um evento `themechange` em `window` depois de cada mudança que um subscriber não substituiu por uma mais nova, com o mesmo `ThemeChangeDetail` no seu `detail`. Importe o nome e o tipo do evento em vez de escrever a string na mão:

```ts
import { THEME_CHANGE_EVENT, type ThemeChangeEvent } from "@codenhub/theme";

window.addEventListener(THEME_CHANGE_EVENT, (event) => {
  const { name } = (event as ThemeChangeEvent).detail;
  console.log(`Agora mostrando ${name}.`);
});
```

O evento não diz qual gerenciador o enviou. Se uma página roda mais de um gerenciador, use `subscribe()` naquele que interessa.

Em seguida, [Evitar o flash](preventing-the-flash.md) faz o tema certo aparecer antes de a página ser desenhada pela primeira vez.
