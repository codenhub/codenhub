---
title: Formatos
description: Endereços de e-mail, URLs, nomes de domínio, endereços IP, datas, horários e os outros formatos de string, o que cada um aceita e o valor que produz.
source: 93bf70e591f7a455796d5799052538beee90e41b
order: 7
---

# Formatos

Um formato é um validador para uma string com uma forma específica, como um endereço de e-mail ou uma URL. O cadastro precisa de um para o e-mail, e muitas regras que você escreveria por conta própria são um formato que o pacote já tem. Esta página lista os formatos, o que cada um aceita e o valor que cada um produz. Ela se demora mais em `email` e `url`, já que um endereço ou um link que um servidor segue é onde uma verificação descuidada custa mais caro.

Cada formato é importado separadamente, então um programa leva no bundle os que usa e nenhum outro. Cada um aceita a opção `message` e verificações.

## O que um formato produz

A maioria dos formatos produz a string sem alterações. Então, quando a entrada puder precisar, remova os espaços ou passe para minúsculas antes, com `pipe`:

```ts
import { email, pipe, string } from "@codenhub/validation";

const address = pipe(string({ trim: true }), email());

address(" Ada@Example.com "); // { ok: true, value: "Ada@example.com" }
```

Um formato cujo significado tem várias grafias produz, em vez disso, uma grafia canônica, de modo que um valor é uma única string, não importa como foi escrito. A tabela abaixo diz quais. Para `email`, `url` e `domain`, quem decide o que eles nomeiam é o parser de URL padrão, não o texto. Por isso eles produzem o que o parser leu.

Um valor que não é string falha com `invalid_type` e `{ expected: "string", received }`. Uma string que não corresponde ao formato falha com `invalid_format` e `{ format }`, e `format` o nomeia como mostra a tabela.

## Os formatos

| Validador      | Aceita                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Produz                                                           | `format`                           |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- | ---------------------------------- |
| `email()`      | Um endereço de e-mail com um nome de domínio público. [Mais abaixo](#email).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | O domínio como o parser o lê                                     | `"email"`                          |
| `url()`        | Uma URL absoluta com um protocolo permitido e um host público. [Mais abaixo](#url).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | A URL como o parser a escreve                                    | `"url"`                            |
| `domain()`     | Um nome de domínio público. [Mais abaixo](#domain-e-hostname).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | ASCII em minúsculas, com rótulos internacionalizados em punycode | `"domain"`                         |
| `hostname()`   | Um nome de host feito de letras ASCII, dígitos e hífens. [Mais abaixo](#domain-e-hostname).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Em minúsculas                                                    | `"hostname"`                       |
| `ip()`         | Um endereço IPv4 ou IPv6. [Mais abaixo](#ip).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | IPv6 na forma canônica                                           | `"ip"`, `"ipv4"` ou `"ipv6"`       |
| `cidr()`       | Um endereço e um tamanho de prefixo, como `10.0.0.0/8`, com o prefixo de no máximo 32 para IPv4 e 128 para IPv6. Aceita `version` como `ip`. Bits ligados depois do prefixo são aceitos.                                                                                                                                                                                                                                                                                                                                                                                                                                       | O endereço como `ip` o produz                                    | `"cidr"`, `"cidrv4"` ou `"cidrv6"` |
| `mac()`        | Um endereço MAC: seis pares de dígitos hexadecimais, separados só por dois-pontos ou só por hífens.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Em minúsculas, com dois-pontos                                   | `"mac"`                            |
| `phone()`      | Um número internacional no formato E.164: `+`, um código de país e o número, de 7 a 15 dígitos. Espaços, hífens ou pontos podem separar dígitos, e no máximo um grupo pode estar entre parênteses, como em `+55 (11) 98765-4321`. Um prefixo de discagem nacional entre parênteses, como em `+44 (0)20 7946 0958`, é rejeitado, já que não é um dígito do número internacional. O número não é comparado com o plano de numeração do país, então um prefixo nacional escrito sem parênteses continua no número: `+44 020 7946 0958` produz `+4402079460958`, que ninguém consegue discar. Se o número existe não é verificado. | `+` e os dígitos                                                 | `"phone"`                          |
| `creditCard()` | Um número de cartão de pagamento: de 12 a 19 dígitos que passam no dígito verificador de Luhn, opcionalmente agrupados por espaços ou por hífens. Se o cartão foi emitido não é verificado.                                                                                                                                                                                                                                                                                                                                                                                                                                    | Só os dígitos                                                    | `"creditCard"`                     |
| `uuid()`       | Um UUID da versão 1 à 8, ou o UUID nil ou max, com hífens, em maiúsculas ou minúsculas. `uuid({ version: 7 })` exige uma versão, e então rejeita os UUIDs nil e max.                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Em minúsculas                                                    | `"uuid"`                           |
| `datetime()`   | Uma data e hora ISO 8601 como `2026-09-28T14:30:00Z`, num dia que existe. [Mais abaixo](#datetime-e-time).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Como foi escrito                                                 | `"datetime"`                       |
| `isoDate()`    | Uma data de calendário ISO 8601 como `2026-09-28`, num dia que existe.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Como foi escrito                                                 | `"isoDate"`                        |
| `time()`       | Um horário do dia como `14:30`, `14:30:00` ou `14:30:00.250`, sem offset. [Mais abaixo](#datetime-e-time).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Como foi escrito                                                 | `"time"`                           |
| `duration()`   | Uma duração ISO 8601 como `P1Y2M`, `PT30M` ou `P1DT12H`, com pelo menos um componente. Só os segundos podem ter fração, escrita com ponto, então `PT0.5H` e `PT1,5S` são rejeitados. Isso é mais rígido que a ISO 8601 e que `Temporal.Duration`, que aceitam os dois. Semanas podem ser combinadas com outras unidades, como em `P1W2D`, o que a ISO 8601-2 e `Temporal` permitem. Uma duração negativa como `-P1D` é rejeitada. Quem consome o valor e tem um limite, como os nove dígitos de `Temporal.Duration`, o confere com uma verificação.                                                                            | Como foi escrito                                                 | `"duration"`                       |
| `semver()`     | Uma versão do Semantic Versioning 2.0.0 como `1.4.0-beta.2`, sem um `v` no início. Nem a especificação nem `semver()` limitam um número ou o tamanho. Algumas bibliotecas recusam um número acima de `Number.MAX_SAFE_INTEGER` ou uma versão com mais de 256 caracteres: coloque `string({ max: 256 })` antes, com `pipe`, quando o valor for para uma delas.                                                                                                                                                                                                                                                                  | Como foi escrito                                                 | `"semver"`                         |
| `slug()`       | Letras ASCII minúsculas e dígitos, em palavras unidas por um único hífen, como `hello-world-2`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Como foi escrito                                                 | `"slug"`                           |
| `jwt()`        | Um JSON Web Token na forma compacta: três segmentos base64url cujo header e payload são objetos JSON, sem chave repetida em nenhum objeto, e um header que traz `alg` como um texto não vazio. Uma chave repetida, como em `{"alg":"none","alg":"HS256"}`, é rejeitada, já que os parsers de JSON discordam sobre qual delas vale. **A assinatura não é verificada e os claims não são lidos**, então um token que passa pode ser forjado ou estar expirado. Um token sem assinatura, com `alg` `none` e assinatura vazia, também passa. Verifique o token com uma biblioteca de JWT antes de confiar nele.                    | Como foi escrito                                                 | `"jwt"`                            |
| `hex()`        | Um ou mais dígitos hexadecimais, em maiúsculas ou minúsculas.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Como foi escrito                                                 | `"hex"`                            |
| `base64()`     | Base64 padrão com o padding correto, como um codificador o escreve. Não pode haver espaços em branco nem quebras de linha, então base64 quebrado em 64 ou 76 colunas, como PEM e MIME o escrevem, falha. Os bits que o último caractere guarda além dos dados precisam ser zero, então `YWJ=`, que `Buffer.from` decodifica como `ab`, também falha. A string vazia, que não codifica nada, é rejeitada. `base64({ url: true })` exige o alfabeto seguro para URLs, `-` e `_`, com o padding opcional.                                                                                                                         | Como foi escrito                                                 | `"base64"` ou `"base64url"`        |
| `ulid()`       | Um ULID, em maiúsculas ou minúsculas.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Em maiúsculas                                                    | `"ulid"`                           |
| `nanoid()`     | Um Nano ID na forma padrão: 21 caracteres de `A-Za-z0-9_-`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Como foi escrito                                                 | `"nanoid"`                         |
| `cuid2()`      | Um identificador CUID2: de 24 a 32 letras ASCII minúsculas e dígitos, começando por uma letra. Maiúsculas são rejeitadas, não convertidas para minúsculas.                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Como foi escrito                                                 | `"cuid2"`                          |

`isoDate()` produz uma string. Para obter um `Date`, use [`coerceDate()`](text-input.md#datas), que lê o mesmo texto como meia-noite UTC.

### `port`

`port()` é um formato de números, não de texto: um número inteiro de 1 a 65535.

- A porta 0, que pede ao sistema qualquer porta livre, não aceita conexões e é rejeitada.
- Um valor que não é número falha com `invalid_type`, e um número que não é uma porta, com `invalid_format` e `{ format: "port" }`.
- Leia uma porta a partir de texto com `pipe(coerceNumber(), port())`.

## `email`

`email(options?, ...checks)` aceita um endereço de e-mail com um nome de domínio público. O valor é o endereço tal como a mensagem é entregue a ele.

As opções são `allowPlus`, por padrão `true`, que controla se `+` é aceito antes do `@`, como em `ada+news@example.com`, e as partes descritas em [Partes de um e-mail ou de uma URL](#partes-de-um-e-mail-ou-de-uma-url).

### A parte local

A parte local, antes do `@`, precisa ser um dot-atom, como o que o campo de e-mail do HTML aceita:

- Letras ASCII, dígitos e ``!#$%&'*+/=?^_`{|}~-``, com pontos isolados entre eles.
- Uma parte local entre aspas, como `"a b"@example.com`, é rejeitada.
- Também é rejeitado um endereço com outras letras antes do `@` (RFC 6531).
- A parte local é limitada a 64 caracteres, e o endereço inteiro, como é entregue, a 254.

A parte local é produzida como foi escrita.

### O domínio

O domínio é produzido como o parser de URL o lê: ASCII em minúsculas, com um rótulo internacionalizado em punycode. Assim, `Ada@München.DE` produz `Ada@xn--mnchen-3ya.de`. Toda grafia que o parser lê como um mesmo domínio produz o mesmo endereço, como letras de largura total em `ada@ｅxample.com` ou um seletor de variação invisível. Então uma verificação feita depois sobre o valor, como uma lista de domínios bloqueados ou uma verificação de unicidade, vê o domínio a que a mensagem vai chegar.

Um domínio é escrito somente com estes caracteres:

- Letras, marcas, dígitos, pontos e hífens.
- O zero-width non-joiner e o zero-width joiner, onde o IDNA os permite, como em `ada@می‌خواهم.com` ou `ada@ශ්‍රී.lk`.
- Os pontos finais ideográfico, de largura total e de meia largura (`。`, `．`, `｡`), que contam como pontos, como `url` também os lê.

Um escape percentual como `ex%61mple.com` é sintaxe de URL, que `url` decodifica num host. Ele não faz parte de um domínio de e-mail, então `email` o rejeita.

O domínio precisa ser um nome de domínio público, como [`domain()`](#domain-e-hostname) exige. Estes são rejeitados:

- `localhost`, hosts de um único rótulo e endereços IP.
- Nomes de uso especial que nunca chegam a um host público: os que terminam em `localhost`, `localdomain`, `local`, `internal`, `home`, `corp`, `mail`, `arpa`, `test`, `example`, `invalid`, `alt` ou `onion`, ou em um dos onze domínios de topo de teste de IDN que a IANA reservou, como `テスト` ou `测试`.
- Rótulos internacionalizados que não são válidos em todos os navegadores, como em `ada@example.xn--zz` e `ada@٠.com`.
- Um domínio que termina em ponto, `ada@example.com.`.
- Um domínio escrito com mais de 759 caracteres, três para cada um que um domínio pode ter. Ele é rejeitado antes de o parser lê-lo.

## `url`

`url(options?)` aceita uma URL absoluta com um protocolo permitido e um host público:

```ts
import { hostname, url } from "@codenhub/validation";

url()("https://example.com/a?b=1"); // ok
url()("http://localhost:3000"); // falha: não é um host público
url({ host: hostname() })("http://localhost:3000"); // ok
url({ protocols: ["ftp"] })("ftp://example.com"); // ok
```

`protocols` lista os protocolos aceitos, sem os dois-pontos, com letras em qualquer caixa. O padrão é `["http", "https"]`. A lista é copiada quando o validador é criado. Um protocolo que não é um nome de esquema, como `"https:"`, lança um `TypeError` nesse momento, já que não corresponderia a nada. O mesmo acontece com `javascript`, `vbscript` e `data`, cujas URLs executam script. As outras opções são as partes descritas em [Partes de um e-mail ou de uma URL](#partes-de-um-e-mail-ou-de-uma-url).

### O que ela rejeita

- Uma URL relativa: `example.com` e `//example.com` são rejeitadas, e nenhum esquema é presumido.
- Credenciais embutidas, como `https://user:password@example.com`, a menos que um validador `credentials` as aceite, como faria um para `DATABASE_URL`. Uma URL sem host, como `mailto`, nunca as aceita.
- A porta 0, `https://example.com:0/`, à qual nada consegue se conectar, a menos que um validador `port` a aceite.
- Texto com espaços em branco ou caracteres de controle, como uma quebra de linha. Uma URL escrita nunca os contém, então o texto é rejeitado, não limpo. Remova os espaços antes com `pipe(string({ trim: true }), url())` quando a entrada puder ter espaços ao redor.

### O host

Estes hosts são rejeitados, seja qual for o validador `host`:

- Um host com mais de 253 caracteres, o máximo que um nome de domínio pode ter.
- O host de `http`, `https` ou de outro esquema para o qual o URL Standard tem regras, quando escrito com mais de 759 caracteres. Ele é recusado antes de o parser lê-lo.
- Um host absoluto como `example.com.`. É uma segunda grafia de `example.com`, e deixaria um host passar por uma lista de hosts bloqueados.
- Um host com um rótulo internacionalizado que não é válido em todos os navegadores, como `xn--zz.com` ou `٠.com`.
- Um host que o Node.js não consegue ler de novo depois de escrito em punycode, como `éxn--.com`. Assim, uma URL que passa é lida do mesmo jeito em todo runtime.

Um validador `host` substitui a regra de que o host é público, e nenhuma outra. Para `http`, `https` e os outros esquemas para os quais o URL Standard tem regras, ele só recebe um host de letras minúsculas, dígitos, `.`, `-` e `_`, um endereço IPv4 ou um endereço IPv6. `http://a*b.com`, `http://a%20.com` e `http://[::01.2.3.4]`, que os runtimes leem de formas diferentes, são rejeitados, seja o que for que ele aceite.

Um host que só se parece com outro, como `exаmple.com` com um `а` cirílico, é um host diferente. Ele passa na forma punycode, `xn--exmple-4nf.com`. Compare o valor, nunca o texto, com uma lista de hosts.

### O valor que ela produz

O parser de URL padrão lê o texto. Toda verificação é feita sobre o que ele leu: o esquema, as credenciais e o host. O valor é essa leitura, escrita de volta como o parser a escreve. Então uma verificação feita depois sobre o valor, como um prefixo de caminho permitido ou uma lista de hosts bloqueados, vê a URL a que uma requisição vai chegar:

- `https://Example.com/public/../admin` produz `https://example.com/admin`.
- Um host escrito com letras de largura total ou caracteres invisíveis produz o host que eles formam.
- Um host internacionalizado fica em punycode.
- Um host IPv4 escrito como `0x7f.1` ou `127.1` vira `127.0.0.1`.
- O host de um esquema para o qual o parser não tem regras, como `ssh://Example.COM`, fica em minúsculas.
- Caracteres como `"` e `<` no caminho são codificados com escape percentual.

Isso é codificação de URL, não escape de HTML. Outros caracteres, como `'` e `&`, são mantidos. Antes de colocar o valor em HTML, faça o escape para o lugar onde ele vai ser escrito, como faria com qualquer texto.

### `mailto`, `tel` e `urn`

Três esquemas não têm host. Quando `protocols` lista um deles, uma URL desse esquema é verificada pelas regras dele, mesmo quando escrita com um host, como em `mailto://example.com`, que não indica nenhum destinatário:

```ts
import { url } from "@codenhub/validation";

url({ protocols: ["mailto"] })("mailto:ada@example.com?cc=bob@example.org"); // ok
url({ protocols: ["mailto"] })("mailto:ada@localhost"); // falha: não é um host público
url({ protocols: ["tel"] })("tel:+1-201-555-0123"); // ok
url({ protocols: ["urn"] })("urn:isbn:0451450523"); // ok
```

Uma URL `mailto` é aceita quando:

- Ela indica pelo menos um destinatário.
- Todo destinatário, no caminho e em `to`, `cc` ou `bcc`, é um endereço que `email()` aceita, num domínio público, seja qual for `host`. `host` verifica o host de uma URL, e um mailto não tem host.
- A query contém só `to`, `cc`, `bcc`, `subject` e `body`, cada um como `name=value`. Qualquer outro campo, como `from` ou `reply-to`, falha.
- `subject` e `body` contêm o que a RFC 6068 permite: letras, dígitos, `-._~!$'()*+,;:@` e escapes `%`, então uma quebra de linha é `%0D%0A`. Eles também permitem `/` e `?`, que uma query de URL permite, então `body=https://example.com/a?b` passa. `&`, `=`, `#` e um escape malformado como `%zz` falham.
- Uma quebra de linha, `%0D` ou `%0A`, só aparece em `body`. Em `subject` ela terminaria a linha do header, então um programa de e-mail que a escrevesse na mensagem sem escape leria o que vem depois, como `Bcc: …`, como outro header. `subject` também recusa qualquer outro caractere de controle codificado, como `%00` ou um tab, e os separadores de linha e de parágrafo, `%E2%80%A8` e `%E2%80%A9`, já que um assunto é uma única linha de texto.
- `subject` e `body` aparecem no máximo uma vez cada. `to`, `cc` e `bcc` podem se repetir, já que cada um acrescenta destinatários.

Cada destinatário é produzido como `email()` o produz, com a parte local escapada onde um mailto precisa. Assim, `mailto:Ada@EXAMPLE.com` produz `mailto:Ada@example.com`, e `mailto:ada@exa%6dple.com` produz `mailto:ada@example.com`. Os nomes dos campos são produzidos em minúsculas, e `subject` e `body`, como foram escritos.

Uma URL `tel` é aceita quando é um número global: `+`, dígitos com `-`, `.`, `(` ou `)` entre eles, e depois parâmetros `;name=value` opcionais. Um valor contém só os caracteres que a RFC 3966 permite: letras, dígitos, `-_.!~*'()[]/:&+$` e escapes `%`, então nunca `"` ou `<`. Um número local com `phone-context` é rejeitado.

Um `urn` é aceito quando segue a RFC 8141: um namespace de 2 a 32 letras, dígitos e hífens internos, dois-pontos e um nome não vazio.

Qualquer outro esquema sem host, como `file:///etc/passwd` ou `about:blank`, é rejeitado mesmo quando listado, seja qual for `host`. Então listar um protocolo nunca deixa uma URL sem host passar sem verificação. Qualquer outro esquema listado escrito com um host, como `file://server/share` ou `ftp://example.com`, passa pelas verificações de host que toda URL recebe.

`javascript`, `vbscript` e `data` não podem ser listados de forma alguma. Um host não os torna seguros: `javascript://example.com/%0aalert(1)` tem um host público e, mesmo assim, executa como script quando o link é seguido.

## `domain` e `hostname`

`domain()` aceita um nome de domínio público. É a regra que `email` e `url` aplicam a um host por padrão:

- Dois ou mais rótulos, e um último rótulo de 2 a 63 letras, ou um rótulo em punycode.
- Nenhum nome de uso especial, como `localhost`, `.local`, `.internal`, `.test`, `.arpa`, `.home`, `.corp`, `.mail`, `.localdomain`, os `.svc` e `.cluster` do Kubernetes, ou um domínio de topo de teste de IDN como `.テスト`.
- Rótulos internacionalizados válidos em todos os navegadores. Um rótulo em punycode precisa decodificar para o rótulo que ele representa. Um nome com um rótulo da direita para a esquerda precisa respeitar a regra bidi (RFC 5893), então `٠.com` e `1.ب` são rejeitados, como os navegadores os rejeitam, em todo runtime.
- O zero-width non-joiner e o zero-width joiner onde o IDNA os permite, como em `می‌خواهم.com`.
- Nenhum nome absoluto como `example.com.`, e nenhum nome escrito com mais de 759 caracteres, três para cada um que um nome pode ter. O segundo é rejeitado antes de o parser lê-lo.

Ele produz o nome em ASCII minúsculo, com rótulos internacionalizados em punycode.

Se o domínio de topo existe não é verificado. Então um nome sob qualquer outro rótulo passa, inclusive os privados de uso comum, como `nas.lan`, `a.private` ou `a.intranet`. Bloqueie esses com uma verificação sua quando eles importarem. Um nome público também pode resolver para um endereço privado.

`hostname()` aceita um nome de host: rótulos de letras ASCII, dígitos e hífens, separados por pontos.

- O último rótulo não é um número: só dígitos, ou `0x` e dígitos hexadecimais, que o parser de URL lê como um endereço IPv4.
- Rótulos em punycode (`xn--`) precisam decodificar para o rótulo que representam e respeitar a regra bidi, como `domain()` exige.
- Outras letras são rejeitadas. Então `hostname()` rejeita `münchen.de` e aceita o punycode dele, `xn--mnchen-3ya.de`. Para aceitar os dois, use `union([domain(), hostname()])`.
- Um nome absoluto terminado em ponto, como em `example.com.`, é rejeitado. Ele nomeia o mesmo host que `example.com`, e uma segunda grafia deixaria um host passar por uma verificação que compara o valor como string, como uma lista de hosts bloqueados.

Ele produz o nome em minúsculas. Ao contrário de `domain()`, aceita `localhost` e nomes privados.

## `ip`

`ip(options?)` aceita um endereço IPv4 ou IPv6. `version`, `"v4"` ou `"v6"`, aceita uma única família de endereços. Sem essa opção, as duas são aceitas, e qualquer outro valor lança um `TypeError` quando o validador é criado. O `format` no problema é `"ipv4"` ou `"ipv6"` quando uma versão é dada, e `"ip"` caso contrário.

Os endereços que ele aceita:

- IPv4 tem quatro partes decimais de 0 a 255, sem zeros à esquerda, que alguns parsers leem como octal.
- IPv6 é escrito como a RFC 4291 permite: oito grupos de um a quatro dígitos hexadecimais, com uma sequência de grupos zero abreviada como `::`, e um endereço IPv4 no lugar dos dois últimos grupos, como em `::ffff:192.0.2.1`, cujas partes seguem a regra do IPv4.
- Uma zona como `%eth0` só é aceita depois de um endereço link-local (`fe80::/10`), o único lugar em que ela significa algo.

Um endereço IPv4 tem uma única grafia e é produzido como foi escrito. Um endereço IPv6 é produzido na forma canônica, de modo que um endereço é uma única string:

- Em minúsculas, com a sequência mais longa de grupos zero abreviada como `::`, como a RFC 5952 e o parser de URL o escrevem. Assim, `0:0:0:0:0:0:0:1` produz `::1`.
- Um endereço IPv4 mapeado (`::ffff:0:0/96`), ou um sob o prefixo well-known do NAT64 (`64:ff9b::/96`), sai com a parte IPv4 em notação com pontos, como recomenda a seção 5 da RFC 5952: `::ffff:c000:201` produz `::ffff:192.0.2.1`.
- Todo outro endereço IPv6 sai em grupos hexadecimais, inclusive os IPv4-compatíveis, que estão obsoletos, já que essa faixa também contém `::1`: `::1.2.3.4` produz `::102:304`.

`cidr()` escreve o endereço do mesmo jeito.

## `datetime` e `time`

`datetime(options?)` aceita uma data e hora como `2026-09-28T14:30:00Z`:

- Exige o separador `T`, um horário e `Z`, ambos em maiúsculas. `t` e `z` minúsculos, e o espaço no lugar do `T` que a RFC 3339 também permite, falham.
- Rejeita dias que não existem, então `2026-02-30T00:00:00Z` falha.
- Rejeita segundos bissextos (`23:59:60`).

| Opção       | Padrão  | Significado                                                                                                                                                                                                                                    |
| ----------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `offset`    | `false` | Aceita também um offset UTC como `+02:00` no lugar de `Z`. `+00:00` precisa dela, já que é assim que o `isoformat()` do Python e o `OffsetDateTime` do Java escrevem UTC.                                                                      |
| `local`     | `false` | Aceita também uma data e hora sem fuso, um horário de relógio local como `2026-09-28T14:30` vindo de um campo HTML `datetime-local`. Os segundos podem ser omitidos, como esse campo os omite. Um horário com fuso ainda precisa dos segundos. |
| `precision` | nenhum  | Um inteiro de 0 a 9: exatamente essa quantidade de dígitos de fração de segundo. `0` proíbe fração. Sem ela, a fração é opcional. Com `local`, também exige os segundos.                                                                       |

Uma `precision` que não é número lança um `TypeError` quando o validador é criado, e uma fora desse intervalo, um `RangeError`.

`coerceDate` lê mais grafias que essas, como um espaço no lugar do `T`, um offset sem os dois-pontos ou, com `zoneless: "utc"`, nenhum fuso. Ele converte texto, e não verifica a forma dele. [Entrada em texto](text-input.md#datas) as lista.

`time(options?)` aceita `HH:MM`, como um campo de horário do HTML o escreve, e `HH:MM:SS` com fração opcional. Aceita `precision` como `datetime`, o que também torna os segundos obrigatórios.

## Partes de um e-mail ou de uma URL

`url` e `email` são formados por partes, e cada parte pode ser verificada com um validador seu. O validador de uma parte recebe o que o parser leu, não o texto. Ele substitui a regra padrão do formato para aquela parte, e nunca a sintaxe dela:

| Opção                  | Recebe                                                                                                                                                                                                                                                                                                     | Regra padrão                 |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| `url({ credentials })` | `{ username, password }` como o parser os escreve, com escape percentual, e `password` vazio quando só há um usuário. `undefined` quando a URL não indica nenhum dos dois. A URL produzida os mantém.                                                                                                      | Nenhuma credencial           |
| `url({ host })`        | O host: um domínio em ASCII minúsculo com rótulos internacionalizados em punycode, um endereço IPv4 em quatro partes decimais ou um endereço IPv6 sem colchetes, escrito como `ip()` o escreve. A URL produzida mantém a grafia do parser. Para outros esquemas, [veja abaixo](#hosts-de-outros-esquemas). | Um nome de domínio público   |
| `url({ port })`        | A porta como número. `undefined` quando a URL não indica nenhuma, ou indica a padrão do esquema, que o parser descarta.                                                                                                                                                                                    | Qualquer porta menos 0       |
| `url({ path })`        | O caminho como o parser o escreve, com os segmentos de ponto resolvidos e caracteres como espaços codificados com escape percentual, começando com `/`. Vazio para uma URL de um esquema para o qual o parser não tem regras, como `ssh://example.com`, que não indica caminho.                            | Qualquer caminho             |
| `url({ query })`       | A query como um objeto com os parâmetros decodificados, sendo o valor de cada chave uma string. Com `repeated: true`, todos os valores de cada chave, num array.                                                                                                                                           | Qualquer query               |
| `email({ domain })`    | O domínio como `email` o produz, ASCII minúsculo com rótulos internacionalizados em punycode. Ainda precisa ser um nome de host, então nunca um endereço IP.                                                                                                                                               | Um nome de domínio público   |
| `email({ local })`     | A parte local, antes do `@`, como foi escrita.                                                                                                                                                                                                                                                             | A sintaxe de uma parte local |

```ts
import { domain, email, hostname, ip, object, oneOf, optional, port, startsWith, string, union, url } from "@codenhub/validation";

url({ host: hostname() }); // qualquer nome de host, inclusive localhost
url({ protocols: ["postgres"], host: hostname(), credentials: optional(object({ username: string(), password: string() })) }); // uma DATABASE_URL
url({ host: union([domain(), ip()]) }); // endereços IP também, mas não localhost
url({ host: oneOf(["api.example.com"]), port: optional(port()) });
url({ protocols: ["https"], path: string(startsWith("/api/")) });
url({ query: object({ page: optional(string()) }, { unknownKeys: "strict" }) }); // nenhum outro parâmetro
email({ domain: oneOf(["company.com"]), message: "Use your company address" });
```

Uma parte que falha é reportada como o problema do formato, no lugar da URL ou do endereço, para que um formulário o mostre ao lado do campo em que o texto foi digitado. Ele é `invalid_format`, com `params` `{ format: "url", part: "host", issues }` ou `{ format: "email", part: "domain", issues }`. `issues` contém o que o validador da parte encontrou, com caminhos relativos à parte, como `["page"]` dentro da query.

- A `message` do formato dá o texto desse problema, como dá o de todos os outros problemas do formato. Então `email({ domain: oneOf(["company.com"]), message: "Use your company address" })` mostra essa frase para um endereço de outro domínio.
- `englishMessages` dá o texto com o que a parte encontrou primeiro, como em "Invalid email address domain: Expected one of "company.com"".
- Uma parte só decide. O valor continua sendo a URL ou o endereço inteiro, então uma parte que converte o próprio valor, como `coerceNumber` dentro de `query`, não muda nada na saída. Para ler valores tipados de uma query, use [`searchParams`](text-input.md#uma-query-string).
- Um validador de parte assíncrono torna o formato assíncrono.
- As partes se aplicam a uma URL com host. Uma URL `mailto`, `tel` ou `urn` mantém [as próprias regras](#mailto-tel-e-urn).

Uma chave de query informada mais de uma vez, como em `?id=1&id=2`, falha, a menos que `repeated` esteja definido. Ela falha como a parte da query, cujos `issues` contêm `invalid_key` em `[key]`. Uma verificação que visse um dos dois valores enquanto um servidor lesse o outro deixaria passar um valor que ninguém verificou.

### Hosts de outros esquemas

Para um esquema para o qual o parser não tem regras, como `ssh`, `url({ host })` recebe o nome como foi escrito, com as letras em minúsculas e os escapes em maiúsculas. O parser não lê um host desses como um endereço. Então `redis://2130706433/`, `redis://0x7f.1/` e `redis://%31%32%37.0.0.1/` chegam ao validador como foram escritos, enquanto um cliente pode se conectar a `127.0.0.1`. Verifique um host desses com `hostname()`, `domain()` ou `ip()`, que rejeitam essas grafias, nunca com uma lista de strings.

### Caminhos que um servidor lê de outro jeito

Um servidor pode ler um caminho de formas que o URL Standard não prevê: decodificando `%61` para `a`, juntando `//` em `/` ou descartando de um segmento o `;` e o que vem depois. Então escreva um validador `path` como uma allowlist, uma descrição dos caminhos que podem passar, como `string(startsWith("/api/"))`. Uma denylist como "não está sob `/admin`" deixa passar `/;/admin`, `//admin` e `/%61dmin`. Uma allowlist continua valendo para cada uma dessas leituras. Ela não vale para um servidor que decodifica o caminho duas vezes. Um servidor assim lê `/api/%252e%252e/admin` como `/api/../admin`, que é `/admin`, e `startsWith("/api/")` o aceita. Para um servidor assim, escreva uma allowlist que deixe `%` de fora, como `pattern(/^\/api\/[\w/-]*$/)`.

Com um validador `path`, dois tipos de caminho falham antes de qualquer parte rodar. Cada um falha como a parte do caminho, cujos `issues` contêm `invalid_value`:

- Um caminho com um `/` ou `\` codificado, `%2F` ou `%5C` em maiúsculas ou minúsculas, com `{ encodedSeparator: true }`. O parser, e uma verificação do caminho, leem `/api/..%2fadmin` como um único segmento sob `/api/`. Um servidor que decodifica o separador antes do roteamento lê `/admin`, então uma verificação de prefixo deixaria passar um caminho que ela não cobre.
- Um caminho com um segmento `.` ou `..`, com o ponto escrito literalmente ou como `%2E`, seguido de `;` ou `%3B`, com `{ dotSegment: true }`. O parser lê `/api/..;/admin` como um segmento chamado `..;` sob `/api/`. Um servidor que descarta os parâmetros antes de resolver os segmentos de ponto, como o Tomcat e o Jetty fazem, lê `/admin`. Um proxy que decodifica o caminho, como o nginx, repassa `..%3B` a ele como `..;`.

Um `;` em qualquer outro lugar, como em `/api/a;v=1`, é aceito. Sem um validador `path`, uma URL dessas é aceita, já que nada verifica o caminho dela.

Para um esquema para o qual o parser não tem regras, como `ssh`, um `\` no caminho é mantido como foi escrito, e não é um separador para o parser. Então `foo://host/api/..\admin` passa em `startsWith("/api/")`. Quem consome a URL e lê `\` como separador, como pode acontecer no Windows, precisa de uma allowlist que o deixe de fora, como `pattern(/^\/api\/[\w/-]*$/)`.

## Próximos passos

Um formato verifica um valor. Às vezes o valor também precisa mudar no caminho: texto sem espaços lido como número, uma string transformada em `Date`, um campo de uma estrutura reaproveitado em outra. [Moldando valores](shaping-values.md) trata disso.
