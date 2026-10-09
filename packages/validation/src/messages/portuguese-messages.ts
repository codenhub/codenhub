import type { ValidationIssue } from "../core/types";
import type { Messages } from "./word";
import { entryOf, formatValue, listOf, meantIssue, momentOf, param, quote } from "./wording";

/** What each format is called when it is invalid, a whole sentence since the adjective agrees with the noun. */
const INVALID_FORMATS: Readonly<Record<string, string>> = {
  email: "Endereço de e-mail inválido",
  url: "URL inválida",
  uuid: "UUID inválido",
  ip: "Endereço IP inválido",
  ipv4: "Endereço IPv4 inválido",
  ipv6: "Endereço IPv6 inválido",
  datetime: "Data e hora inválidas",
  isoDate: "Data inválida",
  base64: "Texto em base64 inválido",
  hex: "Texto hexadecimal inválido",
  hostname: "Nome de host inválido",
  cuid2: "cuid2 inválido",
  ulid: "ULID inválido",
  nanoid: "Nano ID inválido",
  json: "JSON inválido",
  base64url: "Texto em base64url inválido",
  domain: "Nome de domínio inválido",
  port: "Porta inválida",
  phone: "Número de telefone inválido",
  slug: "Slug inválido",
  semver: "Versão inválida",
  jwt: "Token inválido",
  creditCard: "Número de cartão inválido",
  cidr: "Bloco CIDR inválido",
  cidrv4: "Bloco CIDR IPv4 inválido",
  cidrv6: "Bloco CIDR IPv6 inválido",
  mac: "Endereço MAC inválido",
  time: "Hora inválida",
  duration: "Duração inválida",
};

/** What each collection's size counts, singular and plural. */
const COLLECTIONS: Readonly<Record<string, readonly [string, string]>> = {
  array: ["item", "itens"],
  set: ["item", "itens"],
  map: ["item", "itens"],
  record: ["chave", "chaves"],
};

/** Says how many allowed values a list left out. */
const more = (count: number): string => `ou mais ${count}`;

const describeLimit = ({ params }: ValidationIssue, isMin: boolean): string => {
  const limit = params?.[isMin ? "minimum" : "maximum"];
  const bound = String(limit);
  const type = String(params?.type);
  const moment = momentOf(limit, type);
  if (moment !== undefined) {
    return `Deve ser igual ou ${isMin ? "posterior" : "anterior"} a ${moment}`;
  }
  if (type === "depth") {
    return `Deve ter no máximo ${bound} níveis de aninhamento`;
  }
  if (type === "calls") {
    return `Complexo demais para verificar em ${bound} passos recursivos`;
  }
  if (type === "issues") {
    return `Interrompido após ${bound} problemas, então pode haver mais`;
  }
  const isExact = params?.exact === true;
  const isInclusive = params?.inclusive !== false;
  const counts = entryOf(COLLECTIONS, type);
  if (counts !== undefined) {
    const wording = isExact ? "exatamente" : isMin ? "no mínimo" : "no máximo";
    return `Deve conter ${wording} ${bound} ${counts[limit === 1 ? 0 : 1]}`;
  }
  if (type === "string" || type === "file" || isExact) {
    const counted =
      type === "string"
        ? limit === 1
          ? "caractere"
          : "caracteres"
        : type === "file"
          ? limit === 1
            ? "byte"
            : "bytes"
          : limit === 1
            ? "item"
            : "itens";
    const wording = isExact
      ? "exatamente"
      : isMin
        ? isInclusive
          ? "no mínimo"
          : "mais de"
        : isInclusive
          ? "no máximo"
          : "menos de";
    return `Deve ter ${wording} ${bound} ${counted}`;
  }
  return `Deve ser ${isMin ? (isInclusive ? "no mínimo" : "maior que") : isInclusive ? "no máximo" : "menor que"} ${bound}`;
};

const describeFormat = (issue: ValidationIssue, messages: Messages): string => {
  const format = param(issue, "format");
  const invalid = entryOf(INVALID_FORMATS, format) ?? `Formato ${format} inválido`;
  // A part of a URL or an address that failed is worded with what its validator found first.
  const [found] = (issue.params?.["issues"] ?? []) as readonly ValidationIssue[];
  if (found !== undefined) {
    return `${invalid} (${param(issue, "part")}): ${quote(found, messages)}`;
  }
  switch (format) {
    case "regex":
      return `Deve corresponder a ${param(issue, "pattern")}`;
    case "startsWith":
      return `Deve começar com ${formatValue(issue.params?.["value"])}`;
    case "endsWith":
      return `Deve terminar com ${formatValue(issue.params?.["value"])}`;
    case "includes":
      return `Deve incluir ${formatValue(issue.params?.["value"])}`;
    case "lowercase":
      return "Deve estar em minúsculas";
    case "uppercase":
      return "Deve estar em maiúsculas";
    case "nonBlank":
      return "Não pode estar em branco";
    default:
      return invalid;
  }
};

const describeUnion = (issue: ValidationIssue, messages: Messages): string => {
  if (Array.isArray(issue.params?.options)) {
    return `Esperado que ${param(issue, "discriminator")} seja um de ${listOf(issue.params.options, formatValue, more)}`;
  }
  const first = meantIssue(issue);
  return first === undefined ? "Não corresponde a nenhum dos tipos permitidos" : quote(first, messages);
};

const describeValue = (issue: ValidationIssue): string => {
  // A bigint is reported as its digits, and `type: "bigint"` says so.
  const word = issue.params?.type === "bigint" ? (value: unknown) => `${String(value)}n` : formatValue;
  if (issue.params?.unique === true) {
    return "Deve ser único";
  }
  if (issue.params?.reserved === true) {
    return "É reservado";
  }
  if (issue.params?.unreadable === true) {
    return "Não pôde ser lido";
  }
  if (issue.params?.encodedSeparator === true) {
    return "Não pode conter / ou \\ codificados";
  }
  if (issue.params?.dotSegment === true) {
    return "Não pode conter . ou .. seguido de ;";
  }
  if (issue.params !== undefined && "expected" in issue.params) {
    return `Esperado ${word(issue.params.expected)}`;
  }
  if (Array.isArray(issue.params?.options)) {
    return `Esperado um de ${listOf(issue.params.options, word, more)}`;
  }
  switch (issue.params?.format) {
    case "multipleOf":
      return `Deve ser múltiplo de ${param(issue, "value")}`;
    case "int":
      return "Deve ser um número inteiro";
    case "safeInt":
      return "Deve ser um inteiro seguro";
    case "nonZero":
      return "Não pode ser zero";
    default:
      return "Valor inválido";
  }
};

const describeType = (issue: ValidationIssue): string => {
  if (issue.params?.coerced === true) {
    return `Não é possível converter ${param(issue, "received")} em ${param(issue, "expected")}`;
  }
  if (issue.params?.received === "non-plain object") {
    // Such as `process.env` or a class instance, which a copy into a plain object passes.
    return "Esperado um objeto simples; copie-o antes, como em { ...value }";
  }
  return issue.params?.expected === "never"
    ? "Não permitido"
    : `Esperado ${param(issue, "expected")}, recebido ${param(issue, "received")}`;
};

const describeKey = (issue: ValidationIssue, messages: Messages): string => {
  const [found] = (issue.params?.issues ?? []) as readonly ValidationIssue[];
  if (found?.code === "invalid_value" && found.params?.unique === true) {
    return "Deve ser informado apenas uma vez";
  }
  if (found?.code === "invalid_value" && found.params?.reserved === true) {
    return "Não pode ser usada como chave";
  }
  return found === undefined ? "Chave inválida" : `Chave inválida: ${quote(found, messages)}`;
};

/**
 * The built-in Portuguese wording for every issue the validators can report, as a message map.
 *
 * @remarks
 * It is what {@link englishMessages} is, in Portuguese as written in Brazil: pass it to `formatIssue`,
 * `flatten`, `assert` or `standard` to get text such as "Deve ser no mínimo 18". It is a separate value,
 * so a program bundles the wording of the languages it imports and no other. To change some of the
 * wording, spread it and override the codes you want:
 * `{ ...portugueseMessages, too_small: "Muito curto" }`. It is frozen. The names of types, such as
 * `string` in "Esperado string, recebido number", are the ones the issue holds and are not translated,
 * and a custom validator's own codes are not in it: one without a `message` on the issue or an entry
 * of your own is worded "Valor inválido", by the entry `default`.
 *
 * @example
 * ```ts
 * const result = number({ min: 18 })(15);
 * if (!result.ok) {
 *   formatIssue(result.error.issues[0], portugueseMessages); // "Deve ser no mínimo 18"
 * }
 * ```
 */
export const portugueseMessages: Messages = /* @__PURE__ */ Object.freeze({
  invalid_type: describeType,
  too_small: (issue: ValidationIssue) => describeLimit(issue, true),
  too_big: (issue: ValidationIssue) => describeLimit(issue, false),
  invalid_format: describeFormat,
  invalid_value: describeValue,
  invalid_key: describeKey,
  unrecognized_key: (issue: ValidationIssue) => `Chave não reconhecida ${formatValue(issue.params?.key)}`,
  invalid_intersection: () => "Valores conflitantes",
  invalid_union: describeUnion,
  default: "Valor inválido",
});
