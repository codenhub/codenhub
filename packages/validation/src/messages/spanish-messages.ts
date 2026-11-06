import type { ValidationIssue } from "../core/types";
import type { Messages } from "./word";
import { entryOf, formatValue, listOf, meantIssue, momentOf, param, quote } from "./wording";

/** What each format is called when it is invalid, a whole sentence since the adjective agrees with the noun. */
const INVALID_FORMATS: Readonly<Record<string, string>> = {
  email: "Dirección de correo electrónico no válida",
  url: "URL no válida",
  uuid: "UUID no válido",
  ip: "Dirección IP no válida",
  ipv4: "Dirección IPv4 no válida",
  ipv6: "Dirección IPv6 no válida",
  datetime: "Fecha y hora no válidas",
  isoDate: "Fecha no válida",
  base64: "Texto en base64 no válido",
  hex: "Texto hexadecimal no válido",
  hostname: "Nombre de host no válido",
  cuid2: "cuid2 no válido",
  ulid: "ULID no válido",
  nanoid: "Nano ID no válido",
  json: "JSON no válido",
  base64url: "Texto en base64url no válido",
  domain: "Nombre de dominio no válido",
  port: "Puerto no válido",
  phone: "Número de teléfono no válido",
  slug: "Slug no válido",
  semver: "Versión no válida",
  jwt: "Token no válido",
  creditCard: "Número de tarjeta no válido",
  cidr: "Bloque CIDR no válido",
  cidrv4: "Bloque CIDR IPv4 no válido",
  cidrv6: "Bloque CIDR IPv6 no válido",
  mac: "Dirección MAC no válida",
  time: "Hora no válida",
  duration: "Duración no válida",
};

/** What each collection's size counts, singular and plural. */
const COLLECTIONS: Readonly<Record<string, readonly [string, string]>> = {
  array: ["elemento", "elementos"],
  set: ["elemento", "elementos"],
  map: ["elemento", "elementos"],
  record: ["clave", "claves"],
};

/** Says how many allowed values a list left out. */
const more = (count: number): string => `y ${count} más`;

/**
 * A number written with a decimal comma, `0,1`, as Spain and most of South America write it. Only a bound
 * or a step: a value listed among others is written as in code, where a comma would read as the end of one.
 */
const decimal = (value: unknown): string =>
  typeof value === "number" ? String(value).replace(".", ",") : String(value);

const describeLimit = ({ params }: ValidationIssue, isMin: boolean): string => {
  const limit = params?.[isMin ? "minimum" : "maximum"];
  const bound = decimal(limit);
  const type = String(params?.type);
  const moment = momentOf(limit, type);
  if (moment !== undefined) {
    return `Debe ser ${params?.inclusive === false ? "" : "igual o "}${isMin ? "posterior" : "anterior"} a ${moment}`;
  }
  if (type === "depth") {
    return `Debe tener como máximo ${bound} niveles de anidamiento`;
  }
  if (type === "calls") {
    return `Demasiado complejo para verificar en ${bound} pasos recursivos`;
  }
  if (type === "issues") {
    return `Detenido tras ${bound} problemas, así que puede haber más`;
  }
  const isExact = params?.exact === true;
  const isInclusive = params?.inclusive !== false;
  const counts = entryOf(COLLECTIONS, type);
  if (counts !== undefined) {
    const wording = isExact ? "exactamente" : isMin ? "como mínimo" : "como máximo";
    return `Debe contener ${wording} ${bound} ${counts[limit === 1 ? 0 : 1]}`;
  }
  if (type === "string" || type === "file" || isExact) {
    const counted =
      type === "string"
        ? limit === 1
          ? "carácter"
          : "caracteres"
        : type === "file"
          ? limit === 1
            ? "byte"
            : "bytes"
          : limit === 1
            ? "elemento"
            : "elementos";
    const wording = isExact
      ? "exactamente"
      : isMin
        ? isInclusive
          ? "como mínimo"
          : "más de"
        : isInclusive
          ? "como máximo"
          : "menos de";
    return `Debe tener ${wording} ${bound} ${counted}`;
  }
  return `Debe ser ${isMin ? (isInclusive ? "como mínimo" : "mayor que") : isInclusive ? "como máximo" : "menor que"} ${bound}`;
};

const describeFormat = (issue: ValidationIssue, messages: Messages): string => {
  const format = param(issue, "format");
  const invalid = entryOf(INVALID_FORMATS, format) ?? `Formato ${format} no válido`;
  // A part of a URL or an address that failed is worded with what its validator found first.
  const [found] = (issue.params?.["issues"] ?? []) as readonly ValidationIssue[];
  if (found !== undefined) {
    return `${invalid} (${param(issue, "part")}): ${quote(found, messages)}`;
  }
  switch (format) {
    case "regex":
      return `Debe coincidir con ${param(issue, "pattern")}`;
    case "startsWith":
      return `Debe empezar por ${formatValue(issue.params?.["value"])}`;
    case "endsWith":
      return `Debe terminar en ${formatValue(issue.params?.["value"])}`;
    case "includes":
      return `Debe incluir ${formatValue(issue.params?.["value"])}`;
    case "lowercase":
      return "Debe estar en minúsculas";
    case "uppercase":
      return "Debe estar en mayúsculas";
    case "nonBlank":
      return "No puede estar en blanco";
    default:
      return invalid;
  }
};

const describeUnion = (issue: ValidationIssue, messages: Messages): string => {
  if (Array.isArray(issue.params?.options)) {
    return `Se esperaba que ${param(issue, "discriminator")} fuera uno de ${listOf(issue.params.options, formatValue, more)}`;
  }
  const first = meantIssue(issue);
  return first === undefined ? "No coincide con ninguno de los tipos permitidos" : quote(first, messages);
};

const describeValue = (issue: ValidationIssue): string => {
  // A bigint is reported as its digits, and `type: "bigint"` says so.
  const word = issue.params?.type === "bigint" ? (value: unknown) => `${String(value)}n` : formatValue;
  if (issue.params?.unique === true) {
    return "Debe ser único";
  }
  if (issue.params?.reserved === true) {
    // Only a key is reserved, and every message of a key agrees with "la clave".
    return "Está reservada";
  }
  if (issue.params?.unreadable === true) {
    return "No se pudo leer";
  }
  if (issue.params?.encodedSeparator === true) {
    return "No puede contener / ni \\ codificados";
  }
  if (issue.params?.dotSegment === true) {
    return "No puede contener . ni .. seguidos de ;";
  }
  if (issue.params !== undefined && "expected" in issue.params) {
    return `Se esperaba ${word(issue.params.expected)}`;
  }
  if (Array.isArray(issue.params?.options)) {
    return `Se esperaba uno de ${listOf(issue.params.options, word, more)}`;
  }
  switch (issue.params?.format) {
    case "multipleOf":
      return `Debe ser múltiplo de ${decimal(issue.params?.["value"])}`;
    case "int":
      return "Debe ser un número entero";
    case "safeInt":
      return "Debe ser un entero seguro";
    case "nonZero":
      return "No puede ser cero";
    default:
      return "Valor no válido";
  }
};

const describeType = (issue: ValidationIssue): string => {
  if (issue.params?.coerced === true) {
    return `No se puede convertir ${param(issue, "received")} en ${param(issue, "expected")}`;
  }
  if (issue.params?.received === "non-plain object") {
    // Such as `process.env` or a class instance, which a copy into a plain object passes.
    return "Se esperaba un objeto simple; cópialo antes, como en { ...value }";
  }
  return issue.params?.expected === "never"
    ? "No permitido"
    : `Se esperaba ${param(issue, "expected")}, se recibió ${param(issue, "received")}`;
};

const describeKey = (issue: ValidationIssue, messages: Messages): string => {
  const [found] = (issue.params?.issues ?? []) as readonly ValidationIssue[];
  if (found?.code === "invalid_value" && found.params?.unique === true) {
    return "Debe ser indicada una sola vez";
  }
  if (found?.code === "invalid_value" && found.params?.reserved === true) {
    return "No puede ser usada como clave";
  }
  return found === undefined ? "Clave no válida" : `Clave no válida: ${quote(found, messages)}`;
};

/**
 * The built-in Spanish wording for every issue the validators can report, as a message map.
 *
 * @remarks
 * It is what {@link englishMessages} is, in Spanish: pass it to `formatIssue`, `flatten`, `assert` or
 * `standard` to get text such as "Debe ser como mínimo 18". A bound or a step is written with a decimal
 * comma, "0,1". It is a separate value, so a program bundles the wording of the languages it imports and
 * no other, apart from the English that `formatIssue`, `flatten` and `standard` fall back to. To change some of the
 * wording, spread it and override the codes you want:
 * `{ ...spanishMessages, too_small: "Demasiado corto" }`. It is frozen. The names of types, such as
 * `string` in "Se esperaba string, se recibió number", are the ones the issue holds and are not translated,
 * and a custom validator's own codes are not in it: one without a `message` on the issue or an entry
 * of your own is worded "Valor no válido", by the entry `default`.
 *
 * @example
 * ```ts
 * const result = number({ min: 18 })(15);
 * if (!result.ok) {
 *   formatIssue(result.error.issues[0], spanishMessages); // "Debe ser como mínimo 18"
 * }
 * ```
 */
export const spanishMessages: Messages = /* @__PURE__ */ Object.freeze({
  invalid_type: describeType,
  too_small: (issue: ValidationIssue) => describeLimit(issue, true),
  too_big: (issue: ValidationIssue) => describeLimit(issue, false),
  invalid_format: describeFormat,
  invalid_value: describeValue,
  invalid_key: describeKey,
  unrecognized_key: (issue: ValidationIssue) => `Clave no reconocida ${formatValue(issue.params?.key)}`,
  invalid_intersection: () => "Valores en conflicto",
  invalid_union: describeUnion,
  default: "Valor no válido",
});
