---
title: Formatos
description: Direcciones de correo, URL, nombres de dominio, direcciones IP, fechas, horas y los demás formatos de cadena, lo que acepta cada uno y el valor que produce.
order: 7
source: 93bf70e591f7a455796d5799052538beee90e41b
---

# Formatos

Un formato es un validador para una cadena con una forma particular, como una dirección de correo o una URL. El registro necesita uno para su correo, y muchas reglas que podrías escribir tú son un formato que el paquete ya tiene. Esta página los enumera, junto con lo que acepta cada uno y el valor que produce. Se detiene más en `email` y `url`, ya que una dirección o un enlace que sigue un servidor es donde una verificación descuidada sale más cara.

Cada formato se importa por separado, así que un programa empaqueta los que usa y ningún otro. Cada uno acepta una opción `message` y verificaciones.

## Lo que produce un formato

La mayoría de los formatos producen la cadena sin cambios. Así que quítale los espacios o pásala a minúsculas primero con `pipe` cuando la entrada lo necesite:

```ts
import { email, pipe, string } from "@codenhub/validation";

const address = pipe(string({ trim: true }), email());

address(" Ada@Example.com "); // { ok: true, value: "Ada@example.com" }
```

Un formato cuyo significado admite varias escrituras produce en cambio una escritura canónica, para que un valor sea una sola cadena sin importar cómo se escribió. La tabla de abajo dice cuáles. En `email`, `url` y `domain`, lo que nombran lo decide el parser de URL estándar, no el texto. Por eso producen lo que lee el parser.

Lo que no es una cadena falla con `invalid_type` y `{ expected: "string", received }`. Una cadena que no coincide falla con `invalid_format` y `{ format }`, y `format` lo nombra como muestra la tabla.

## Los formatos

| Validador      | Acepta                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Produce                                                                | `format`                          |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- | --------------------------------- |
| `email()`      | Una dirección de correo con un nombre de dominio público. [Más abajo](#email).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | El dominio tal como lo lee el parser                                   | `"email"`                         |
| `url()`        | Una URL absoluta con un protocolo permitido y un host público. [Más abajo](#url).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | La URL tal como la escribe el parser                                   | `"url"`                           |
| `domain()`     | Un nombre de dominio público. [Más abajo](#domain-y-hostname).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | ASCII en minúsculas, con las etiquetas internacionalizadas en punycode | `"domain"`                        |
| `hostname()`   | Un nombre de host de letras ASCII, dígitos y guiones. [Más abajo](#domain-y-hostname).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | En minúsculas                                                          | `"hostname"`                      |
| `ip()`         | Una dirección IPv4 o IPv6. [Más abajo](#ip).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | IPv6 en su forma canónica                                              | `"ip"`, `"ipv4"` o `"ipv6"`       |
| `cidr()`       | Una dirección y una longitud de prefijo, como `10.0.0.0/8`, con el prefijo de 32 como máximo para IPv4 y 128 para IPv6. Acepta `version` como `ip`. Se aceptan bits activados más allá del prefijo.                                                                                                                                                                                                                                                                                                                                                                                                                                  | La dirección tal como la produce `ip`                                  | `"cidr"`, `"cidrv4"` o `"cidrv6"` |
| `mac()`        | Una dirección MAC: seis pares de dígitos hexadecimales, separados todos por dos puntos o todos por guiones.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | En minúsculas, con dos puntos                                          | `"mac"`                           |
| `phone()`      | Un número internacional en formato E.164: `+`, un código de país y el número, de 7 a 15 dígitos. Los dígitos pueden separarse con espacios, guiones o puntos, y como máximo un grupo puede ir entre paréntesis, como en `+55 (11) 98765-4321`. Un prefijo troncal nacional entre paréntesis, como en `+44 (0)20 7946 0958`, se rechaza, ya que no es un dígito del número internacional. El número no se compara con el plan de numeración del país, así que un prefijo troncal escrito sin paréntesis se queda en él: `+44 020 7946 0958` produce `+4402079460958`, al que nadie puede llamar. No se comprueba si el número existe. | `+` y los dígitos                                                      | `"phone"`                         |
| `creditCard()` | Un número de tarjeta de pago: de 12 a 19 dígitos que pasan la suma de verificación de Luhn, opcionalmente agrupados con espacios o con guiones. No se comprueba si la tarjeta fue emitida.                                                                                                                                                                                                                                                                                                                                                                                                                                           | Solo los dígitos                                                       | `"creditCard"`                    |
| `uuid()`       | Un UUID de la versión 1 a la 8, o el UUID nil o max, con guiones, en mayúsculas o minúsculas. `uuid({ version: 7 })` exige una versión, y entonces rechaza los UUID nil y max.                                                                                                                                                                                                                                                                                                                                                                                                                                                       | En minúsculas                                                          | `"uuid"`                          |
| `datetime()`   | Una fecha y hora ISO 8601 como `2026-09-28T14:30:00Z`, en un día que existe. [Más abajo](#datetime-y-time).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Tal como está escrito                                                  | `"datetime"`                      |
| `isoDate()`    | Una fecha de calendario ISO 8601 como `2026-09-28`, en un día que existe.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Tal como está escrito                                                  | `"isoDate"`                       |
| `time()`       | Una hora del día como `14:30`, `14:30:00` o `14:30:00.250`, sin desfase horario. [Más abajo](#datetime-y-time).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Tal como está escrito                                                  | `"time"`                          |
| `duration()`   | Una duración ISO 8601 como `P1Y2M`, `PT30M` o `P1DT12H`, con al menos un componente. Solo los segundos pueden tener fracción, escrita con punto, así que `PT0.5H` y `PT1,5S` se rechazan. Eso es más estricto que ISO 8601 y que `Temporal.Duration`, que aceptan ambos. Las semanas pueden combinarse con otras unidades, como en `P1W2D`, cosa que ISO 8601-2 y `Temporal` permiten. Una duración negativa como `-P1D` se rechaza. Quien tenga un límite, como los nueve dígitos de `Temporal.Duration`, lo comprueba con una verificación.                                                                                        | Tal como está escrito                                                  | `"duration"`                      |
| `semver()`     | Una versión de Semantic Versioning 2.0.0 como `1.4.0-beta.2`, sin una `v` inicial. Ni la especificación ni `semver()` limitan un número ni la longitud. Algunas bibliotecas rechazan un número mayor que `Number.MAX_SAFE_INTEGER` o una versión de más de 256 caracteres: pon `string({ max: 256 })` delante con `pipe` cuando el valor vaya a una de ellas.                                                                                                                                                                                                                                                                        | Tal como está escrito                                                  | `"semver"`                        |
| `slug()`       | Letras ASCII en minúsculas y dígitos, en palabras unidas por guiones simples, como `hello-world-2`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Tal como está escrito                                                  | `"slug"`                          |
| `jwt()`        | Un JSON Web Token en forma compacta: tres segmentos base64url cuyo encabezado y payload son objetos JSON, sin ninguna clave repetida en ningún objeto, y con un encabezado que indica `alg` como texto no vacío. Una clave repetida, como en `{"alg":"none","alg":"HS256"}`, se rechaza, ya que los parsers de JSON no coinciden en cuál de las dos vale. **La firma no se verifica y los claims no se leen**, así que un token que pasa puede estar falsificado o vencido. Uno sin firmar, con `alg` `none` y una firma vacía, también pasa. Verifica un token con una biblioteca de JWT antes de confiar en él.                    | Tal como está escrito                                                  | `"jwt"`                           |
| `hex()`        | Uno o más dígitos hexadecimales, en mayúsculas o minúsculas.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Tal como está escrito                                                  | `"hex"`                           |
| `base64()`     | Base64 estándar con el relleno correcto, tal como lo escribe un codificador. No puede haber espacios en blanco ni saltos de línea, así que el base64 cortado a 64 o 76 columnas, como lo escriben PEM y MIME, falla. Los bits que un último carácter contiene más allá de los datos deben ser cero, así que `YWJ=`, que `Buffer.from` decodifica como `ab`, también falla. La cadena vacía, que no codifica nada, se rechaza. `base64({ url: true })` exige el alfabeto seguro para URL, `-` y `_`, con el relleno opcional.                                                                                                         | Tal como está escrito                                                  | `"base64"` o `"base64url"`        |
| `ulid()`       | Un ULID, en mayúsculas o minúsculas.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | En mayúsculas                                                          | `"ulid"`                          |
| `nanoid()`     | Un Nano ID en su forma predeterminada: 21 caracteres de `A-Za-z0-9_-`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Tal como está escrito                                                  | `"nanoid"`                        |
| `cuid2()`      | Un identificador CUID2: de 24 a 32 letras ASCII en minúsculas y dígitos, el primero una letra. Las mayúsculas se rechazan, no se convierten a minúsculas.                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Tal como está escrito                                                  | `"cuid2"`                         |

`isoDate()` produce una cadena. Para obtener un `Date`, usa [`coerceDate()`](./text-input.md#fechas), que lee el mismo texto como medianoche UTC.

### `port`

`port()` es un formato de números en lugar de texto: un número entero de 1 a 65535.

- El puerto 0, que le pide al sistema cualquier puerto libre, no admite conexiones y se rechaza.
- Lo que no es un número falla con `invalid_type`, y un número que no es un puerto, con `invalid_format` y `{ format: "port" }`.
- Lee un puerto a partir de texto con `pipe(coerceNumber(), port())`.

## `email`

`email(options?, ...checks)` acepta una dirección de correo con un nombre de dominio público. El valor es la dirección tal como se le entrega el correo.

Las opciones son `allowPlus`, con valor predeterminado `true`, que controla si se acepta `+` antes de la `@`, como en `ada+news@example.com`, y las partes descritas en [Partes de una dirección de correo o una URL](#partes-de-una-dirección-de-correo-o-una-url).

### La parte local

La parte local, antes de la `@`, debe ser un dot-atom, como lo acepta el input de email de HTML:

- Letras ASCII, dígitos y ``!#$%&'*+/=?^_`{|}~-``, con puntos simples entre ellos.
- Una parte local entre comillas, como `"a b"@example.com`, se rechaza.
- También se rechaza una dirección con otras letras antes de la `@` (RFC 6531).
- La parte local tiene un límite de 64 caracteres, y la dirección completa, tal como se entrega, de 254.

La parte local se produce tal como está escrita.

### El dominio

El dominio se produce tal como lo lee el parser de URL: ASCII en minúsculas, con una etiqueta internacionalizada en punycode. Así, `Ada@München.DE` produce `Ada@xn--mnchen-3ya.de`. Todas las escrituras que el parser lee como un mismo dominio producen la misma dirección, como las letras de ancho completo en `ada@ｅxample.com` o un selector de variación invisible. Así, una verificación hecha después sobre el valor, como una lista de dominios bloqueados o una verificación de unicidad, ve el dominio al que llegará el correo.

Un dominio se escribe solo con estos caracteres:

- Letras, marcas, dígitos, puntos y guiones.
- El zero-width non-joiner y el zero-width joiner, donde IDNA los permite, como en `ada@می‌خواهم.com` o `ada@ශ්‍රී.lk`.
- Los puntos ideográfico, de ancho completo y de medio ancho (`。`, `．`, `｡`), que cuentan como puntos, igual que los lee `url`.

Un escape de porcentaje como `ex%61mple.com` es sintaxis de URL, que `url` decodifica en un host. No forma parte de un dominio de correo, así que `email` lo rechaza.

El dominio debe ser un nombre de dominio público, como exige [`domain()`](#domain-y-hostname). Se rechazan:

- `localhost`, los hosts de una sola etiqueta y las direcciones IP.
- Los nombres de uso especial que nunca llegan a un host público: los que terminan en `localhost`, `localdomain`, `local`, `internal`, `home`, `corp`, `mail`, `arpa`, `test`, `example`, `invalid`, `alt` u `onion`, o en uno de los once dominios de nivel superior IDN de prueba que reservó IANA, como `テスト` o `测试`.
- Las etiquetas internacionalizadas que no son válidas en todos los navegadores, como en `ada@example.xn--zz` y `ada@٠.com`.
- Un dominio que termina en punto, `ada@example.com.`.
- Un dominio escrito con más de 759 caracteres, tres por cada uno que puede tener un dominio. Se rechaza antes de que el parser lo lea.

## `url`

`url(options?)` acepta una URL absoluta con un protocolo permitido y un host público:

```ts
import { hostname, url } from "@codenhub/validation";

url()("https://example.com/a?b=1"); // ok
url()("http://localhost:3000"); // falla: no es un host público
url({ host: hostname() })("http://localhost:3000"); // ok
url({ protocols: ["ftp"] })("ftp://example.com"); // ok
```

`protocols` enumera los protocolos aceptados, sin los dos puntos, en mayúsculas o minúsculas. El valor predeterminado es `["http", "https"]`. La lista se copia cuando se crea el validador. Un protocolo que no es un nombre de esquema, como `"https:"`, lanza entonces un `TypeError`, ya que no coincidiría con nada. Lo mismo ocurre con `javascript`, `vbscript` y `data`, cuyas URL ejecutan scripts. Las demás opciones son las partes descritas en [Partes de una dirección de correo o una URL](#partes-de-una-dirección-de-correo-o-una-url).

### Lo que rechaza

- Una URL relativa: `example.com` y `//example.com` se rechazan, y no se adivina ningún esquema.
- Las credenciales incrustadas, como `https://user:password@example.com`, salvo que un validador `credentials` las acepte, como haría uno para `DATABASE_URL`. Una URL sin host, como `mailto`, nunca las admite.
- El puerto 0, `https://example.com:0/`, al que nada puede conectarse, salvo que un validador `port` lo acepte.
- Un texto con espacios en blanco o caracteres de control, como un salto de línea. Una URL escrita nunca los contiene, así que el texto se rechaza, no se limpia. Quita primero los espacios con `pipe(string({ trim: true }), url())` cuando la entrada pueda tener espacios alrededor.

### El host

Estos hosts se rechazan, sea cual sea el validador `host`:

- Un host de más de 253 caracteres, el máximo que puede tener un nombre de dominio.
- El host de `http`, `https` u otro esquema para el que el URL Standard tiene reglas, cuando está escrito con más de 759 caracteres. Se rechaza antes de que el parser lo lea.
- Un host absoluto como `example.com.`. Es una segunda escritura de `example.com`, y permitiría que un host se colara por una lista de hosts bloqueados.
- Un host con una etiqueta internacionalizada que no es válida en todos los navegadores, como `xn--zz.com` o `٠.com`.
- Un host que Node.js no puede volver a leer una vez escrito en punycode, como `éxn--.com`. Así, una URL que pasa se lee igual en todos los runtimes.

Un validador `host` reemplaza la regla de que el host sea público, y ninguna otra. Para `http`, `https` y los demás esquemas para los que el URL Standard tiene reglas, solo recibe un host de letras minúsculas, dígitos, `.`, `-` y `_`, una dirección IPv4 o una dirección IPv6. `http://a*b.com`, `http://a%20.com` y `http://[::01.2.3.4]`, que los runtimes leen de forma distinta, se rechazan acepte lo que acepte.

Un host que solo se parece a otro, como `exаmple.com` con una `а` cirílica, es un host distinto. Pasa en su forma punycode, `xn--exmple-4nf.com`. Compara el valor, nunca el texto, con una lista de hosts.

### El valor que produce

El parser de URL estándar lee el texto. Todas las verificaciones se hacen sobre lo que leyó: el esquema, las credenciales y el host. El valor es esa lectura, escrita de vuelta como la escribe el parser. Así, una verificación hecha después sobre el valor, como un prefijo de ruta permitido o una lista de hosts bloqueados, ve la URL a la que llegará una solicitud:

- `https://Example.com/public/../admin` produce `https://example.com/admin`.
- Un host escrito con letras de ancho completo o caracteres invisibles produce el host que representan.
- Un host internacionalizado queda en punycode.
- Un host IPv4 escrito como `0x7f.1` o `127.1` queda como `127.0.0.1`.
- El host de un esquema para el que el parser no tiene reglas, como `ssh://Example.COM`, queda en minúsculas.
- Los caracteres como `"` y `<` en la ruta se codifican con porcentaje.

Eso es codificación de URL, no escape de HTML. Los demás caracteres, como `'` y `&`, se mantienen. Antes de poner el valor en HTML, escápalo para el lugar donde lo escribes, como cualquier texto.

### `mailto`, `tel` y `urn`

Tres esquemas no tienen host. Cuando `protocols` incluye uno, una URL de ese esquema se comprueba con sus propias reglas, incluso cuando está escrita con un host, como en `mailto://example.com`, que no nombra a ningún destinatario:

```ts
import { url } from "@codenhub/validation";

url({ protocols: ["mailto"] })("mailto:ada@example.com?cc=bob@example.org"); // ok
url({ protocols: ["mailto"] })("mailto:ada@localhost"); // falla: no es un host público
url({ protocols: ["tel"] })("tel:+1-201-555-0123"); // ok
url({ protocols: ["urn"] })("urn:isbn:0451450523"); // ok
```

Una URL `mailto` se acepta cuando:

- Nombra al menos un destinatario.
- Cada destinatario, en la ruta y en `to`, `cc` o `bcc`, es una dirección que `email()` acepta, en un dominio público sea cual sea `host`. `host` comprueba el host de una URL, y un mailto no tiene.
- La query contiene solo `to`, `cc`, `bcc`, `subject` y `body`, cada uno como `name=value`. Cualquier otro campo, como `from` o `reply-to`, falla.
- `subject` y `body` contienen lo que permite el RFC 6068: letras, dígitos, `-._~!$'()*+,;:@` y escapes `%`, así que un salto de línea es `%0D%0A`. También permiten `/` y `?`, que una query de URL permite, así que `body=https://example.com/a?b` pasa. `&`, `=`, `#` y un escape mal formado como `%zz` fallan.
- Un salto de línea, `%0D` o `%0A`, solo está en `body`. En `subject` terminaría la línea del encabezado, así que un programa de correo que lo escribiera en el mensaje sin escapar leería lo que sigue, como `Bcc: …`, como otro encabezado. `subject` también rechaza cualquier otro carácter de control codificado, como `%00` o una tabulación, y los separadores de línea y de párrafo, `%E2%80%A8` y `%E2%80%A9`, ya que un asunto es una sola línea de texto.
- `subject` y `body` aparecen como máximo una vez cada uno. `to`, `cc` y `bcc` pueden repetirse, ya que cada uno agrega destinatarios.

Cada destinatario se produce como lo produce `email()`, con su parte local escapada donde un mailto lo necesita. Así, `mailto:Ada@EXAMPLE.com` produce `mailto:Ada@example.com`, y `mailto:ada@exa%6dple.com` produce `mailto:ada@example.com`. Los nombres de los campos se producen en minúsculas, y `subject` y `body`, tal como están escritos.

Una URL `tel` se acepta cuando es un número global: `+`, dígitos con `-`, `.`, `(` o `)` entre ellos, y luego parámetros `;name=value` opcionales. Un valor contiene solo los caracteres que permite el RFC 3966: letras, dígitos, `-_.!~*'()[]/:&+$` y escapes `%`, así que nunca `"` ni `<`. Un número local con `phone-context` se rechaza.

Un `urn` se acepta cuando sigue el RFC 8141: un espacio de nombres de 2 a 32 letras, dígitos y guiones internos, dos puntos y un nombre no vacío.

Cualquier otro esquema sin host, como `file:///etc/passwd` o `about:blank`, se rechaza aunque esté en la lista, y sea cual sea `host`. Así, incluir un protocolo en la lista nunca deja pasar sin comprobar una URL sin host. Cualquier otro esquema de la lista escrito con un host, como `file://server/share` o `ftp://example.com`, recibe las verificaciones de host que recibe toda URL.

`javascript`, `vbscript` y `data` no pueden incluirse en la lista de ningún modo. Un host no los vuelve seguros: `javascript://example.com/%0aalert(1)` tiene un host público, y aun así se ejecuta como script al seguirlo.

## `domain` y `hostname`

`domain()` acepta un nombre de dominio público. Es la regla que `email` y `url` aplican a un host de forma predeterminada:

- Dos o más etiquetas, y una última etiqueta de 2 a 63 letras, o una etiqueta punycode.
- Ningún nombre de uso especial, como `localhost`, `.local`, `.internal`, `.test`, `.arpa`, `.home`, `.corp`, `.mail`, `.localdomain`, los `.svc` y `.cluster` de Kubernetes, o un dominio de nivel superior IDN de prueba como `.テスト`.
- Etiquetas internacionalizadas que sean válidas en todos los navegadores. Una etiqueta punycode debe decodificarse en la etiqueta que representa. Un nombre con una etiqueta de derecha a izquierda debe cumplir la regla bidi (RFC 5893), así que `٠.com` y `1.ب` se rechazan, como los rechazan los navegadores, en todos los runtimes.
- El zero-width non-joiner y el zero-width joiner donde IDNA los permite, como en `می‌خواهم.com`.
- Ningún nombre absoluto como `example.com.`, y ningún nombre escrito con más de 759 caracteres, tres por cada uno que puede tener un nombre. Este último se rechaza antes de que el parser lo lea.

Produce el nombre en ASCII en minúsculas, con las etiquetas internacionalizadas en punycode.

No se comprueba si el dominio de nivel superior existe. Así que un nombre bajo cualquier otra etiqueta pasa, incluidas las privadas de uso común, como `nas.lan`, `a.private` o `a.intranet`. Bloquéalas con una verificación propia cuando importen. Un nombre público también puede resolverse a una dirección privada.

`hostname()` acepta un nombre de host: etiquetas de letras ASCII, dígitos y guiones, separadas por puntos.

- La última etiqueta no es un número: ni solo dígitos, ni `0x` seguido de dígitos hexadecimales, que el parser de URL lee como una dirección IPv4.
- Las etiquetas punycode (`xn--`) deben decodificarse en la etiqueta que representan y cumplir la regla bidi, como exige `domain()`.
- Las demás letras se rechazan. Así, `hostname()` rechaza `münchen.de` y acepta su punycode, `xn--mnchen-3ya.de`. Para aceptar ambos, usa `union([domain(), hostname()])`.
- Un nombre absoluto que termina en punto, como en `example.com.`, se rechaza. Nombra el mismo host que `example.com`, y una segunda escritura permitiría que un host se colara por una verificación que compara el valor como cadena, como una lista de hosts bloqueados.

Produce el nombre en minúsculas. A diferencia de `domain()`, acepta `localhost` y nombres privados.

## `ip`

`ip(options?)` acepta una dirección IPv4 o IPv6. `version`, `"v4"` o `"v6"`, acepta una sola familia de direcciones. Sin ella se aceptan ambas, y cualquier otro valor lanza un `TypeError` cuando se crea el validador. El `format` del problema es `"ipv4"` o `"ipv6"` cuando se indica una versión, y `"ip"` en caso contrario.

Las direcciones que acepta:

- IPv4 son cuatro partes decimales de 0 a 255, sin ceros a la izquierda, que algunos parsers leen como octal.
- IPv6 se escribe como lo permite el RFC 4291: ocho grupos de uno a cuatro dígitos hexadecimales, con una secuencia de grupos de ceros abreviada como `::`, y una dirección IPv4 en lugar de los dos últimos grupos, como en `::ffff:192.0.2.1`, cuyas partes siguen la regla de IPv4.
- Una zona como `%eth0` se acepta solo después de una dirección link-local (`fe80::/10`), el único lugar donde significa algo.

Una dirección IPv4 tiene una sola escritura, y se produce tal como está escrita. Una dirección IPv6 se produce en su forma canónica, para que una dirección sea una sola cadena:

- En minúsculas, con la secuencia más larga de grupos de ceros abreviada como `::`, como la escriben el RFC 5952 y el parser de URL. Así, `0:0:0:0:0:0:0:1` produce `::1`.
- Una dirección IPv4 mapeada (`::ffff:0:0/96`), o una bajo el prefijo conocido de NAT64 (`64:ff9b::/96`), sale con su parte IPv4 en notación con puntos, como recomienda la sección 5 del RFC 5952: `::ffff:c000:201` produce `::ffff:192.0.2.1`.
- Toda otra dirección IPv6 sale en grupos hexadecimales, incluidas las obsoletas compatibles con IPv4, ya que ese rango también contiene `::1`: `::1.2.3.4` produce `::102:304`.

`cidr()` escribe su dirección de la misma forma.

## `datetime` y `time`

`datetime(options?)` acepta una fecha y hora como `2026-09-28T14:30:00Z`:

- Exige el separador `T`, una hora y `Z`, ambos en mayúsculas. La `t` y la `z` minúsculas, y el espacio en lugar de la `T` que RFC 3339 también permite, fallan.
- Rechaza los días que no existen, así que `2026-02-30T00:00:00Z` falla.
- Rechaza los segundos intercalares (`23:59:60`).

| Opción      | Valor predeterminado | Significado                                                                                                                                                                                                                                  |
| ----------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `offset`    | `false`              | Acepta también un desfase UTC como `+02:00` en lugar de `Z`. `+00:00` lo necesita, ya que así escriben UTC `isoformat()` de Python y `OffsetDateTime` de Java.                                                                               |
| `local`     | `false`              | Acepta también una fecha y hora sin zona, una hora de un reloj local como `2026-09-28T14:30` de un input `datetime-local` de HTML. Sus segundos pueden omitirse, como los omite ese input. Una hora con zona sigue necesitando sus segundos. |
| `precision` | ninguno              | Un entero de 0 a 9: exactamente esa cantidad de dígitos de fracción de segundo. `0` prohíbe la fracción. Sin esta opción, la fracción es opcional. Con `local`, también exige los segundos.                                                  |

Un `precision` que no es un número lanza un `TypeError` cuando se crea el validador, y uno fuera de ese rango, un `RangeError`.

`coerceDate` lee más escrituras que esta, como un espacio en lugar de la `T`, un desfase sin sus dos puntos o, con `zoneless: "utc"`, ninguna zona. Convierte texto, y no comprueba su forma. [Entrada de texto](./text-input.md#fechas) las enumera.

`time(options?)` acepta `HH:MM`, como lo escribe un input de hora de HTML, y `HH:MM:SS` con una fracción opcional. Acepta `precision` como `datetime`, lo que además hace obligatorios los segundos.

## Partes de una dirección de correo o una URL

`url` y `email` se construyen a partir de partes, y cada parte puede comprobarse con un validador propio. Un validador de parte recibe lo que leyó el parser, no el texto. Reemplaza la regla predeterminada del formato para esa parte, y nunca su sintaxis:

| Opción                 | Recibe                                                                                                                                                                                                                                                                                                                                        | Regla predeterminada           |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| `url({ credentials })` | `{ username, password }` tal como los escribe el parser, codificados con porcentaje, con `password` vacío cuando solo se escribe un usuario. `undefined` cuando la URL no nombra ninguno de los dos. La URL producida los conserva.                                                                                                           | Sin credenciales               |
| `url({ host })`        | El host: un dominio en ASCII en minúsculas con las etiquetas internacionalizadas en punycode, una dirección IPv4 como cuatro partes decimales o una dirección IPv6 sin sus corchetes, escrita como la escribe `ip()`. La URL producida conserva la escritura del parser. Para otros esquemas, [consulta más abajo](#hosts-de-otros-esquemas). | Un nombre de dominio público   |
| `url({ port })`        | El puerto como número. `undefined` cuando la URL no nombra ninguno, o nombra el predeterminado de su esquema, que el parser descarta.                                                                                                                                                                                                         | Cualquier puerto excepto 0     |
| `url({ path })`        | La ruta tal como la escribe el parser, con los segmentos de punto resueltos y caracteres como los espacios codificados con porcentaje, empezando con `/`. Vacía para una URL de un esquema para el que el parser no tiene reglas, como `ssh://example.com`, que no nombra ninguna ruta.                                                       | Cualquier ruta                 |
| `url({ query })`       | La query como un objeto con sus parámetros decodificados, con el valor de cada clave como cadena. Con `repeated: true`, todos los valores de cada clave, como un array.                                                                                                                                                                       | Cualquier query                |
| `email({ domain })`    | El dominio tal como lo produce `email`, ASCII en minúsculas con las etiquetas internacionalizadas en punycode. Aun así debe ser un nombre de host, así que nunca una dirección IP.                                                                                                                                                            | Un nombre de dominio público   |
| `email({ local })`     | La parte local, antes de la `@`, tal como está escrita.                                                                                                                                                                                                                                                                                       | La sintaxis de una parte local |

```ts
import { domain, email, hostname, ip, object, oneOf, optional, port, startsWith, string, union, url } from "@codenhub/validation";

url({ host: hostname() }); // cualquier nombre de host, incluido localhost
url({ protocols: ["postgres"], host: hostname(), credentials: optional(object({ username: string(), password: string() })) }); // una DATABASE_URL
url({ host: union([domain(), ip()]) }); // también direcciones IP, pero no localhost
url({ host: oneOf(["api.example.com"]), port: optional(port()) });
url({ protocols: ["https"], path: string(startsWith("/api/")) });
url({ query: object({ page: optional(string()) }, { unknownKeys: "strict" }) }); // ningún otro parámetro
email({ domain: oneOf(["company.com"]), message: "Use your company address" });
```

Una parte que falla se reporta como el problema del formato, en el lugar de la URL o de la dirección, para que un formulario lo muestre junto al campo donde se escribió el texto. Es `invalid_format`, con `params` `{ format: "url", part: "host", issues }` o `{ format: "email", part: "domain", issues }`. `issues` contiene lo que encontró el validador de la parte, con rutas relativas a la parte, como `["page"]` dentro de la query.

- El `message` del formato lo redacta, igual que redacta cualquier otro problema del formato. Así, `email({ domain: oneOf(["company.com"]), message: "Use your company address" })` dice esa frase para una dirección de otro dominio.
- `englishMessages` lo redacta con lo primero que encontró la parte, como en "Invalid email address domain: Expected one of "company.com"".
- Una parte solo decide. El valor sigue siendo la URL o la dirección completa, así que una parte que convierte su valor, como `coerceNumber` dentro de `query`, no cambia nada en la salida. Para leer valores tipados de una query, usa [`searchParams`](./text-input.md#una-query-string).
- Un validador de parte asíncrono vuelve asíncrono el formato.
- Las partes se aplican a una URL con host. Una URL `mailto`, `tel` o `urn` conserva [sus propias reglas](#mailto-tel-y-urn).

Una clave de la query repetida, como en `?id=1&id=2`, falla salvo que se active `repeated`. Falla como la parte de la query, cuyos `issues` contienen `invalid_key` en `[key]`. Una verificación que viera uno de los dos valores mientras un servidor lee el otro dejaría pasar un valor que nadie comprobó.

### Hosts de otros esquemas

Para un esquema para el que el parser no tiene reglas, como `ssh`, `url({ host })` recibe el nombre tal como está escrito, con sus letras en minúsculas y sus escapes en mayúsculas. El parser no lee un host así como una dirección. Así que `redis://2130706433/`, `redis://0x7f.1/` y `redis://%31%32%37.0.0.1/` llegan al validador tal como están escritos, mientras que un cliente puede conectarse a `127.0.0.1`. Comprueba un host así con `hostname()`, `domain()` o `ip()`, que rechazan esas escrituras, nunca con una lista de cadenas.

### Rutas que un servidor lee de otra forma

Un servidor puede leer una ruta de maneras que el URL Standard no contempla: decodificar `%61` como `a`, unir `//` en `/`, o descartar de un segmento el `;` y lo que le sigue. Así que escribe un validador `path` como una lista de permitidos, una descripción de las rutas que pueden pasar, como `string(startsWith("/api/"))`. Una lista de bloqueados como "no bajo `/admin`" deja pasar `/;/admin`, `//admin` y `/%61dmin`. Una lista de permitidos sigue siendo válida para cada una de esas lecturas. No lo es para un servidor que decodifica la ruta dos veces. Un servidor así lee `/api/%252e%252e/admin` como `/api/../admin`, que es `/admin`, y `startsWith("/api/")` la acepta. Para un servidor así, escribe una lista de permitidos que deje fuera `%`, como `pattern(/^\/api\/[\w/-]*$/)`.

Con un validador `path`, dos tipos de ruta fallan antes de que se ejecute cualquier parte. Cada uno falla como la parte de la ruta, cuyos `issues` contienen `invalid_value`:

- Una ruta con un `/` o un `\` codificado, `%2F` o `%5C` en mayúsculas o minúsculas, con `{ encodedSeparator: true }`. El parser, y una verificación sobre la ruta, leen `/api/..%2fadmin` como un solo segmento bajo `/api/`. Un servidor que decodifica el separador antes de enrutar lee `/admin`, así que una verificación de prefijo dejaría pasar una ruta que no cubre.
- Una ruta con un segmento `.` o `..`, con el punto escrito tal cual o como `%2E`, seguido de `;` o `%3B`, con `{ dotSegment: true }`. El parser lee `/api/..;/admin` como un segmento llamado `..;` bajo `/api/`. Un servidor que descarta los parámetros antes de resolver los segmentos de punto, como hacen Tomcat y Jetty, lee `/admin`. Un proxy que decodifica la ruta, como nginx, le pasa `..%3B` como `..;`.

Un `;` en cualquier otro lugar, como en `/api/a;v=1`, se acepta. Sin un validador `path`, una URL así se acepta, ya que nada comprueba su ruta.

Para un esquema para el que el parser no tiene reglas, como `ssh`, un `\` en la ruta se mantiene tal como se escribió, y no es un separador para el parser. Así que `foo://host/api/..\admin` pasa `startsWith("/api/")`. Quien lea `\` como separador, como puede hacerlo algo en Windows, necesita una lista de permitidos que lo excluya, como `pattern(/^\/api\/[\w/-]*$/)`.

## Siguiente

Un formato comprueba un valor. A veces el valor también debería cambiar en el camino: texto sin espacios leído como número, una cadena convertida en un `Date`, un campo de una forma conservado en otra. [Dar forma a los valores](./shaping-values.md) cubre esos casos.
