---
title: Introdução
description: Para que serve o @codenhub/styles, quanto ele custa e em que ordem ler esta documentação.
source: 5f82b6a4d492bdb5ea73406f256d307f775fa1ea
---

# @codenhub/styles

O `@codenhub/styles` permite montar uma interface consistente e com suporte a temas escrevendo nomes de classe em HTML puro. Você importa uma folha de estilos e ganha tokens, um reset, utilitários de layout e tipografia, e classes para botões, campos de formulário, alertas, cards, tabelas e tooltips. Não há JavaScript para carregar nem biblioteca de componentes para encapsular: um `<button class="btn primary">` é toda a integração.

Esta documentação monta uma tela pequena do início ao fim: uma página de configurações de conta com um formulário de perfil, um resumo do plano e uma zona de perigo. Cada página acrescenta algo a ela, então no final você terá visto todas as partes do pacote funcionando juntas, e não isoladas.

```html
<main class="section">
  <div class="section-content narrow stack">
    <h1 class="text-title">Account settings</h1>
    <form class="card stack">
      <h2 class="text-title-sm">Profile</h2>
      <div class="field">
        <label class="label" for="display-name">Display name</label>
        <input class="ipt" id="display-name" name="display-name" value="Ada Lovelace" />
      </div>
      <div class="cluster">
        <button class="btn primary" type="submit">Save changes</button>
        <button class="btn ghost" type="reset">Cancel</button>
      </div>
    </form>
  </div>
</main>
```

## Três escolhas por componente

Todo componente responde a três perguntas independentes com classes, então um visual novo nunca exige uma nova variante de componente:

- **Intenção: qual cor?** `.primary`, `.secondary`, `.success`, `.warning`, `.destructive` ou `.info`. Sem nenhuma, o componente fica neutro.
- **Apresentação: quanto dessa cor?** `.solid`, `.soft` ou `.ghost` define o preenchimento; `.edged` ou `.edgeless` define a borda.
- **Estética: do que ele é feito?** Uma classe opcional, como `.neobrutalism` ou `.glass`, muda cantos, espessura de borda, sombras e tipografia de tudo o que estiver dentro dela.

`<button class="btn destructive ghost edged">Delete account</button>` é um botão vermelho com contorno, e envolver a página em `.pixel` o transforma num botão em pixel art sem mexer no botão. [Montando uma tela](./concepts.md) apresenta cada eixo no momento em que a página de configurações precisa dele.

## CSS compilado ou código-fonte do Tailwind

O pacote entrega as mesmas classes de duas formas:

- **CSS compilado**, pronto para usar. Importe de qualquer bundler ou referencie o arquivo a partir de uma CDN. Você não precisa do Tailwind.
- **Código-fonte do Tailwind CSS v4**, em `@codenhub/styles/tw`. Use quando o seu projeto já roda Tailwind v4, para que o seu build compile o pacote junto com os seus próprios utilitários e tema.

A [Configuração](./setup.md) ajuda você a escolher.

## O que ele não faz

- **Nada de JavaScript.** Não há runtime, bindings para frameworks nem código gerado. Tudo o que precisa de script, como abrir um dialog, alternar o tema ou dispensar um tooltip, fica por conta do seu código.
- **Nada de semântica ou comportamento.** As classes pintam elementos; elas não acrescentam semântica de HTML, ARIA, tratamento de teclado, gerenciamento de foco, validação nem anúncios. A página de [Acessibilidade](./accessibility.md) traça a linha exata.
- **Nada de troca de tema.** Escolher entre claro e escuro é uma classe ou atributo que você define. O pacote separado `@codenhub/theme` pode lembrar e aplicar essa escolha para você.
- **Nada de fontes ou ícones.** Nenhum arquivo de fonte é baixado. Estéticas que pedem uma fonte especial usam uma fonte do sistema até você fornecer uma. Ícones, incluindo spinners de carregamento, vêm do seu próprio conjunto de ícones, como o `@codenhub/icons`.
- **Nada de aliases de compatibilidade.** Uma classe ou token removido aparece no changelog, não fica mantido com o nome antigo.

## Trade-offs

Conheça estes custos antes de adotar o pacote:

- **Os nomes de classe são curtos e sem prefixo.** `.primary`, `.success`, `.dark`, `.label`, `.field`, `.section`, `.stack`, `.flat` e `.ghost` são nomes globais. Outra folha de estilos na mesma página que use esses nomes colide com esta. O pacote fica em [camadas de cascata](./setup.md#camadas-de-cascata), então o seu próprio CSS fora de camadas vence uma colisão, mas as regras de uma biblioteca de terceiros para o mesmo nome continuam valendo junto com as do pacote.
- **As folhas de estilos completas são grandes antes da compressão.** No momento em que este texto foi escrito, minificada, a folha de estilos completa tem cerca de 198 KB, a `/native` cerca de 295 KB e a `/components` cerca de 159 KB. Servidas com gzip, ficam em cerca de 17 KB, 22 KB e 13 KB. Os arquivos específicos são bem menores: `/theme` tem cerca de 12 KB (3 KB com gzip) e cada estética tem de 4 a 14 KB (1 a 2 KB com gzip). A maior parte do tamanho é composição que todo componente repete, e é por isso que a compressão elimina tanto. Um arquivo compilado traz todas as classes, a página usando ou não. Para entregar só as classes que as suas páginas usam, compile o pacote no seu próprio build: pelo [Tailwind CSS v4](./integrating/tailwind.md) quando o projeto o usa, ou com o [comando `build`](./integrating/without-a-bundler.md#gere-só-as-classes-que-você-usa) do pacote em qualquer outro projeto. Assim, uma página com um botão recebe de 26 a 28 KB minificados, e cerca de 6 KB com gzip. Fora isso, importe o entrypoint mais restrito que cubra a página; veja [Configuração → Todos os entrypoints](./setup.md#todos-os-entrypoints).
- **`--color-foreground` é um fundo, não uma cor de texto.** É o tom um passo distante da página, sobre o qual fica um card ou painel discreto. A cor do texto é `--color-text`.
- **Quatro cores de hover são valores fixos.** `--color-success-hover`, `--color-warning-hover`, `--color-destructive-hover` e `--color-info-hover` são pré-calculadas, porque misturá-las em tempo real travava o WebKit. Se você sobrescrever só `--color-success`, o hover dela mantém o tom antigo, então substitua a família inteira; veja [Temas → Tokens de cor](./usage/theming.md#tokens-de-cor).
- **Só navegadores modernos.** Chrome 123, Safari 17.5 ou Firefox 128 e mais recentes. Não há camada de fallback para navegadores mais antigos.

## O que conta como suportado

Uma combinação de classes é suportada quando esta documentação a descreve e a demo pública em [demo.codenhub.dev/styles](https://demo.codenhub.dev/styles/) a mostra. A demo renderiza as fixtures de teste do pacote, incluindo as matrizes completas de intenção, apresentação e estética, usando o CSS gerado pelo build. Uma combinação que não está documentada nem aparece na demo pode até gerar CSS, mas não é mantida e pode mudar em qualquer versão.

A demo é reconstruída a partir da branch main, não a cada versão. Ela pode mostrar trabalho ainda não lançado, então, quando a demo e esta documentação discordarem sobre uma versão já lançada, valem a documentação e o [changelog](../changelog/index.md) daquela versão.

## Versionamento

O pacote está abaixo da 1.0 e segue a [regra do versionamento semântico para versões 0.x](https://semver.org/lang/pt-BR/#spec-item-4): a superfície pública ainda pode mudar entre versões minor.

- Uma versão minor, como da 0.7.0 para a 0.8.0, pode quebrar compatibilidade. Ela pode renomear ou remover uma classe ou token, ou mudar um padrão. Toda quebra é listada em **Changed** ou **Removed** na página do [changelog](../changelog/index.md) daquela versão, com o que usar no lugar.
- Uma versão patch, como da 0.7.0 para a 0.7.1, nunca quebra.

O range padrão do npm para uma dependência nova, `^0.7.0`, já aceita apenas patches, porque abaixo da 1.0 um range com circunflexo não avança para a próxima versão minor. Leia o changelog antes de subir esse range. Ao referenciar um arquivo de uma CDN, coloque a versão exata na URL; veja [Sem bundler](./integrating/without-a-bundler.md).

As quebras não são amenizadas com aliases porque o modelo ainda está se assentando, e manter cada nome antigo ao lado do substituto aumentaria a superfície a cada versão. Uma renomeação ou remoção costuma custar um localizar-e-substituir quando você atualiza; um padrão alterado pode exigir que você reajuste o seu próprio CSS.

## Ordem de leitura

Na primeira vez, leia nesta ordem. Cada página acrescenta algo à tela de configurações e termina indicando a próxima.

1. [Configuração](./setup.md): instale o pacote, escolha entre CSS compilado ou código-fonte do Tailwind e renderize a estrutura vazia da página.
2. [Integração](./integrating/index.md): só se você usa Next.js, Vue, Svelte, Astro, Tailwind v4 ou nenhum bundler. Cada guia devolve você ao caminho principal.
3. [Montando uma tela](./concepts.md): organize o layout da página, defina a tipografia e adicione um card e um botão de salvar, aprendendo intenção, preenchimento e borda pelo caminho.
4. [Uso](./usage/index.md): o resto da tela, nesta ordem:
   - [Botões](./usage/buttons.md): ações secundárias e destrutivas, tamanhos, botões de ícone e estados desabilitados.
   - [Formulários](./usage/forms.md): campos com rótulo, dicas, erros, ícones, selects, checkboxes, radios e switches.
   - [Feedback](./usage/feedback.md): um estado de salvamento, um alerta de sucesso, um badge de plano, um placeholder de carregamento e uma barra de uso.
   - [Tooltips](./usage/tooltips.md): ajuda de campo que funciona com mouse, teclado e leitor de tela.
   - [Temas](./usage/theming.md): modo claro e escuro, cores da marca e suas próprias intenções.
   - [Estéticas](./usage/aesthetics.md): mude o estilo da tela inteira com uma classe.
   - [Classes solo](./usage/solo.md): aplique uma estética a um componente que este pacote não estiliza.
   - [Composição](./usage/composing.md), [Personalização](./usage/customizing.md) e [Conteúdo e layout](./usage/content-and-layout.md): páginas de consulta com cada regra de eixo, token, padrão e classe utilitária.
   - [Predefinições](./usage/presets.md): defina um visual uma única vez, para uma região, um tema ou a sua própria classe de componente, em vez de repeti-lo em cada elemento.
5. [Acessibilidade](./accessibility.md): o que o CSS resolve por você e o que a sua aplicação ainda precisa fazer.

O [changelog](../changelog/index.md) lista todas as versões e o que mudou em cada uma.
