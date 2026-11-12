<!-- source: 7f4751ecdbf5734bf09a32b6583ae27b0c471146 -->

# @codenhub/styles

Monte uma interface consistente e com suporte a temas escrevendo nomes de classe em HTML puro: uma folha de estilos com tokens, um reset, utilitários de layout e tipografia, e classes para botões, campos de formulário, alertas, cards, tabelas e tooltips. Não há JavaScript para carregar nem biblioteca de componentes para encapsular.

## Instalação

```sh
pnpm add @codenhub/styles
```

## Uso

Importe a folha de estilos compilada, que contém tudo o que o pacote entrega:

```css
@import "@codenhub/styles";
```

```html
<form class="card stack">
  <h2 class="text-title-sm">Profile</h2>
  <div class="field">
    <label class="label" for="display-name">Display name</label>
    <input class="ipt" id="display-name" name="display-name" />
  </div>
  <button class="btn primary" type="submit">Save changes</button>
</form>
```

Para usar os entrypoints de código-fonte do Tailwind CSS v4, ou para carregar só uma parte do pacote, veja [Configuração](./docs/pt-BR/setup.md). A [demo](https://demo.codenhub.dev/styles/) mostra cada componente em cada intenção, apresentação e estética.

## Documentação

A documentação monta uma tela de configurações de conta do início ao fim, nesta ordem:

- [Introdução](./docs/pt-BR/index.md): para que serve o pacote, quanto ele custa e a ordem de leitura.
- [Configuração](./docs/pt-BR/setup.md): instale o pacote, escolha entre CSS compilado ou código-fonte do Tailwind e renderize a estrutura da página.
- [Integração](./docs/pt-BR/integrating/index.md): carregue a folha de estilos no Next.js, Vue, Svelte, Astro, Tailwind CSS v4 ou numa página sem bundler.
- [Montando uma tela](./docs/pt-BR/concepts.md): organize o layout da página e aprenda intenção, preenchimento, borda e estética.
- [Uso](./docs/pt-BR/usage/index.md): guias de botões, formulários, feedback, tooltips, temas, estéticas e classes solo, seguidos das páginas de consulta com cada classe, token e padrão.
- [Acessibilidade](./docs/pt-BR/accessibility.md): o que o CSS faz pelos seus usuários e o que a sua aplicação ainda deve a eles.
- [Changelog](./docs/changelog/index.md) (em inglês): histórico de versões, incluindo breaking changes.

## Requisitos

| Requisito      | Detalhes                                                                                                                                                             |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Imports de CSS | O ferramental do projeto precisa resolver imports de CSS de pacotes.                                                                                                 |
| Navegadores    | Chrome 123, Safari 17.5 ou Firefox 128 e mais recentes (`light-dark()` para temas; `:has()` para o estado de `.input-group`; `@property` para elevação sem herança). |
| Tailwind CSS   | 4.3.2 ou mais recente, abaixo da 5, apenas para os entrypoints de código-fonte `/tw`. Instale-o você mesmo; o pacote não o instala.                                  |
| Node.js        | 24 ou mais recente, só na máquina que roda o comando `chs build`. As folhas de estilos não precisam dele.                                                            |
| Acessibilidade | Quem usa o pacote fornece HTML semântico, ARIA, comportamento de teclado e gerenciamento de foco.                                                                    |

## Observações

Este pacote não tem comportamento em JavaScript. Ele não entrega aliases de compatibilidade: uma classe ou token removido é documentado no [changelog](./docs/changelog/index.md), não mantido com um segundo nome. Abaixo da 1.0, uma versão minor pode quebrar compatibilidade e uma versão patch nunca quebra; veja [Versionamento](./docs/pt-BR/index.md#versionamento).

## Licença

Este projeto é licenciado sob a licença [Apache-2.0](LICENSE). As marcas de checkbox embutidas derivam dos ícones `check` e `minus` do [Lucide](https://lucide.dev) (ISC), que o Lucide deriva do [Feather](https://github.com/feathericons/feather) (MIT). Veja [NOTICE](NOTICE) para os avisos exigidos.
