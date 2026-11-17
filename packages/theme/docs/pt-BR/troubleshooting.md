---
title: Solução de problemas
description: Sintomas, como confirmar a causa de cada um e como corrigi-los.
order: 7
source: d8cb7e198162be48eb6fd956c960af106d16ae9d
---

# Solução de problemas

Comece pelo sintoma que você está vendo. Cada item diz como confirmar a causa e depois como corrigi-la. Confira o primeiro item antes de qualquer outro: nele, o pacote fez o trabalho dele, e a folha de estilos não tem regra para o tema. É a correção mais barata desta página.

## Nada muda quando o tema troca

Abra as ferramentas de desenvolvedor do navegador e inspecione o elemento `<html>` enquanto clica no toggle.

- **`data-theme` muda, mas a página não.** O pacote está funcionando; o seu CSS não tem regras para esse nome de tema. Adicione uma regra `[data-theme="<name>"]` para cada tema, como em [Primeiros passos](getting-started.md#2-escreva-o-css-de-cada-tema). Se você definiu `attribute`, use esse nome de atributo nos seus seletores.
- **`data-theme` nunca aparece.** Se você definiu `attribute`, procure esse atributo. Se ele também nunca aparece, `init()` não foi chamado, ou o código que o chama nunca rodou. `createTheme()` sozinho não faz nada na página. Procure no console um erro lançado antes, como um de `createTheme()` sobre opções inválidas.
- **Os estilos `dark:` do Tailwind não se aplicam.** Confira se há `darkClass: true` nas opções, uma classe `dark` em `<html>` e a configuração do Tailwind de [Frameworks](frameworks.md#tailwind-css). Sem essa configuração, o Tailwind segue a configuração do sistema operacional e ignora a classe.

## O tema errado pisca quando a página carrega

O script de pré-pintura está faltando, bloqueado ou fora de sintonia com o seu app. Na ordem:

1. Veja o código-fonte da página, e não a visão de elementos das ferramentas de desenvolvedor, e confira se o script está dentro do `<head>`. Se não estiver lá, configure-o como em [Evitar o flash](preventing-the-flash.md).
2. Procure no console um erro de Content Security Policy. Se houver um, libere o script com um nonce ou um hash; veja [Content Security Policy](preventing-the-flash.md#content-security-policy).
3. Confira se o script e o gerenciador do seu app usam as mesmas opções, principalmente `storageKey` e `themes`. Importar os dois de um único módulo os mantém alinhados.

## A escolha é esquecida depois de recarregar

- **O navegador bloqueia o armazenamento**, como algumas janelas anônimas fazem. O console mostra um erro `[theme]` na primeira vez que a gravação falha. A escolha continua funcionando até a página fechar; não há onde guardá-la por mais tempo. Veja [Quando o armazenamento falha](persistence-and-sync.md#quando-o-armazenamento-falha).
- **Outro app no mesmo domínio usa o mesmo `storageKey`** e a sobrescreve. Dê ao seu app um `storageKey` próprio.
- **O tema salvo não existe mais**, porque foi renomeado ou removido de `themes`. O pacote ignora um nome salvo que ele não reconhece, então o usuário volta para a configuração do sistema operacional.

## O tema ignora o sistema operacional

O usuário fez uma escolha, que sempre ganha. `theme.preference` mostra uma escolha salva; uma que o navegador não conseguiu salvar, porque o armazenamento está bloqueado ou cheio, continua ganhando enquanto a página está aberta, a não ser que outra aba mude o tema, embora `theme.preference` mostre então `null` ou uma escolha salva anterior. Uma escolha feita antes de `init()` é a exceção; veja [Quando o armazenamento falha](persistence-and-sync.md#quando-o-armazenamento-falha). Chame `theme.clearPreference()`, a partir de uma opção "Automático" ou "Sistema" na sua UI, para voltar a seguir o sistema operacional. Se o navegador se recusar a apagar a escolha salva, o console mostra um erro `[theme]`, o tema do sistema é aplicado uma vez e as mudanças do sistema operacional continuam ignoradas enquanto a escolha continuar salva.

## `createTheme()` lança um erro

As opções são inválidas, e a mensagem de erro nomeia o problema. Os mais comuns:

- **Um tema faltando.** `themes` personalizados sem `light` e `dark` também precisam de `defaultTheme` e `systemTheme` nomeando temas que você definiu; veja [Escolha os temas que o sistema usa](themes.md#escolha-os-temas-que-o-sistema-usa).
- **Um `pairedTheme`, `defaultTheme` ou `systemTheme` que nomeia um tema que não está em `themes`.** Confira a grafia.
- **Um nome de tema que não pode ser uma classe.** Enquanto `className` é `true`, cada nome vira parte de uma classe `theme-<name>`, então não pode ter espaços. Renomeie o tema, ou defina `className` como `false` ou como uma função.
- **`tokens` sem um `tokenSchema`, ou um token que não está listado nele.** Todo token precisa de uma entrada em `tokenSchema`; veja [Design tokens](tokens.md).

## O TypeScript acusa `Cannot find name 'NoInfer'`

A sua versão do TypeScript é anterior à 5.4, que adicionou `NoInfer`. Atualize o TypeScript no seu projeto. Ativar `skipLibCheck` esconde o erro, mas aí os tipos também passam a aceitar nomes de temas que você não configurou.

## O navegador informa `Object.hasOwn is not a function` ou um `SyntaxError`

`createTheme()` lança `TypeError: Object.hasOwn is not a function` ou, num navegador anterior ao Chrome 85, ao Firefox 79 ou ao Safari 14, o pacote nem carrega e falha com um `SyntaxError` antes de qualquer código seu rodar. Nos dois casos, o navegador é anterior ao Chrome 93, ao Firefox 92 ou ao Safari 15.4, as versões mais antigas em que o pacote publicado roda; [Requisitos](index.md#requisitos) lista essas versões. Atualize o navegador, ou faça o seu build transpilar as dependências e adicionar polyfills para os navegadores que você suporta. O script de pré-pintura ainda aplica o atributo e as classes do tema em navegadores até o Chrome 24, o Firefox 24 e o Safari 7, mas o toggle e todo o resto precisam do gerenciador.

## Um aviso de hidratação do React menciona `<html>`

O React encontrou o `data-theme`, a classe ou o `style` que o script de pré-pintura adicionou. Essa diferença é esperada; adicione `suppressHydrationWarning` ao seu elemento `<html>`, como mostrado em [Evitar o flash](preventing-the-flash.md#num-app-renderizado-no-servidor).

Ainda não resolveu? A [referência da API](../reference/index.md) (em inglês) lista cada regra que cada método impõe e cada erro que ele lança.
