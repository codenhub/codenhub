---
title: Design tokens
description: Dê valores aos temas em JavaScript com tokenSchema, sobrescreva-os em tempo de execução com setTokens() e leia-os de volta.
order: 3
source: cd6d5a2758273500c4fb9f2adbdc4fbf553ec9ef
---

# Design tokens

Até aqui, toda cor morava no CSS, indexada por `[data-theme]`. Esse é o setup mais simples, e muitas vezes é tudo de que um app precisa. Aí a tela de configurações ganha um seletor de cor de destaque, e a cor passa a ter que vir do JavaScript. Cores carregadas de uma configuração em JSON e um gráfico em canvas que precisa dos valores reais das cores caem no mesmo lugar. **Tokens** cobrem esses casos. Um token é um valor com nome, como `primary`, que o pacote escreve numa CSS custom property, como `--color-primary`, sempre que o tema dele está ativo.

## Dê nomes aos seus tokens

`tokenSchema` lista os tokens e a custom property em que cada um é escrito:

```ts
import { createTheme } from "@codenhub/theme";

const theme = createTheme({
  themes: {
    light: { colorScheme: "light", tokens: { primary: "#171717", surface: "#ffffff" } },
    dark: { colorScheme: "dark", tokens: { primary: "#f9fafb", surface: "#171717" } },
  },
  tokenSchema: { primary: "--color-primary", surface: "--color-surface" },
}).init();
```

O `tokens` de cada tema guarda os valores dele. Quando `dark` fica ativo, o pacote define `--color-primary: #f9fafb` e `--color-surface: #171717` em `<html>`, e o seu CSS os usa como qualquer outra custom property:

```css
button {
  background: var(--color-primary);
  color: var(--color-surface);
}
```

No TypeScript, as chaves de `tokenSchema` tipam todo objeto `tokens`, então um nome de token escrito errado é um erro de compilação. Sem um `tokenSchema`, tokens não são permitidos de jeito nenhum.

Cada valor de `tokenSchema` precisa ser um nome de custom property que uma folha de estilos consiga usar como está escrito: `--` seguido de letras, dígitos, `-`, `_` ou caracteres não ASCII. Qualquer outra coisa, como `"--"` sozinho ou um nome com espaço, faz `createTheme()` lançar um erro. O mesmo vale para mapear dois tokens para a mesma propriedade, já que eles passariam cada troca de tema sobrescrevendo um ao outro.

## Misture tokens com CSS

Um tema não precisa definir todos os tokens. Quando o tema ativo deixa um token de fora, o pacote remove essa propriedade de `<html>`, e vale o que a sua folha de estilos disser. Os valores dos tokens são definidos como estilos inline em `<html>`, então, quando um tema define um, ele ganha de um valor para a mesma propriedade numa regra `[data-theme]`, a menos que essa regra use `!important`.

Isso permite manter a maioria dos valores no CSS e mover só os que o JavaScript precisa controlar. A maioria dos apps termina com uma folha de estilos comprida e dois ou três tokens, e essa é a proporção certa.

## Mude tokens em tempo de execução

`setTokens()` sobrescreve valores de tokens para todos os temas, que é o que o seletor de cor de destaque precisa:

```ts
const picker = document.querySelector<HTMLInputElement>("#accent-picker");

picker?.addEventListener("input", () => {
  theme.setTokens({ primary: picker.value });
});
```

Os overrides ganham dos `tokens` dos próprios temas e continuam valendo quando o tema muda. Cada chamada substitui todos os overrides anteriores, então passe todos os tokens que você quer sobrescrever, e passe `{}` para remover todos.

Algumas regras deixam os valores previsíveis:

- **Overrides não são salvos.** Eles duram até a página ser descarregada ou `destroy()` rodar. Para guardar a cor de um usuário, salve-a você mesmo e chame `setTokens()` de novo na próxima visita.
- **Um valor vazio significa "sem override".** Um token definido como `""` ou `undefined` volta ao valor do próprio tema, ou ao seu CSS quando o tema não define nenhum. Um input de texto esvaziado, portanto, volta à cor do tema em vez de removê-la. Um input de cor sempre contém uma cor e não pode ser esvaziado, então dê ao seletor de destaque um botão de redefinir que chame `setTokens({})`.
- **Números são escritos como strings.** Em JavaScript, `setTokens({ radius: 4 })` escreve `"4"`; os tipos do TypeScript aceitam só strings, então escreva `"4"` lá. Qualquer valor que não seja uma string, um número finito, `undefined` ou `""` lança um erro, assim como um nome de token que não está em `tokenSchema`.
- **Os valores não são validados como CSS.** Um valor que o navegador rejeita, como `"red; color: blue"`, não é aplicado, e a propriedade mantém o valor anterior, embora `get().tokens` continue informando o valor rejeitado. Como os overrides continuam valendo quando o tema muda, a propriedade mantém esse valor também nas trocas de tema, até que um override válido ou `setTokens({})` o substitua. Verifique valores que vêm de entrada do usuário antes de passá-los.
- **Antes de `init()`, os overrides esperam.** Quando chamado antes de o primeiro tema ser aplicado, ou depois de `destroy()`, `setTokens()` só registra os overrides; a próxima mudança, normalmente `init()`, os aplica. Isso evita que uma chamada antecipada mostre o tema padrão por cima do que já está na página.

## Leia os valores dos tokens

`theme.get().tokens` guarda os valores que o JavaScript conhece: os `tokens` do tema ativo com os seus overrides por cima. Ele nunca lê a página.

`theme.readTokens()` inclui também os tokens definidos só no CSS. Para cada token de que o JavaScript não tem valor, ele lê o valor que o navegador calculou para a custom property em `<html>`:

```ts
theme.setTokens({ primary: "#00c853" });

// Com o tema claro ativo:
theme.get().tokens; // { primary: "#00c853", surface: "#ffffff" }
theme.readTokens(); // o mesmo, mais qualquer token que o tema deixou para o CSS
```

Ler estilos calculados pode fazer o navegador recalcular o layout, então prefira `get().tokens`, a menos que você precise dos valores que só existem no CSS, e mantenha `readTokens()` longe de qualquer coisa que rode a cada frame. Ele pula a leitura por completo quando o JavaScript conhece todos os tokens. Se o navegador recusar a leitura, como alguns ambientes em sandbox fazem, o erro é registrado com `console.error` e você recebe os tokens que o JavaScript conhece.

Em seguida, [Salvar e sincronizar](persistence-and-sync.md) mostra como a escolha do usuário é salva, e como o gráfico que precisa dessas cores descobre que o tema mudou.
