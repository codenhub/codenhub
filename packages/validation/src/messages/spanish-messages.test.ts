import { describe, expect, it } from "vitest";

import { check } from "../builders/check";
import { format } from "../builders/format";
import { multipleOf } from "../checks/multiple-of";
import { nonBlank } from "../checks/non-blank";
import { nonZero } from "../checks/non-zero";
import { pattern } from "../checks/pattern";
import { startsWith } from "../checks/starts-with";
import { unique } from "../checks/unique";
import { coerceNumber } from "../coercion/coerce-number";
import { array } from "../composition/array";
import { intersection } from "../composition/intersection";
import { lazy } from "../composition/lazy";
import { object } from "../composition/object";
import { objectLike } from "../composition/object-like";
import { optional } from "../composition/optional";
import { record } from "../composition/record";
import { tagged } from "../composition/tagged";
import { union } from "../composition/union";
import type { ValidationIssue, ValidationResult } from "../core/types";
import { email } from "../formats/email";
import { url } from "../formats/url";
import { bigint } from "../primitives/bigint";
import { date } from "../primitives/date";
import { literal } from "../primitives/literal";
import { never } from "../primitives/never";
import { number } from "../primitives/number";
import { oneOf } from "../primitives/one-of";
import { string } from "../primitives/string";
import { issuesOf } from "../test-utils";
import { englishMessages } from "./english-messages";
import { flatten, formatIssue } from "./format-issue";
import { spanishMessages } from "./spanish-messages";

const said = (result: ValidationResult<unknown>): string[] =>
  issuesOf(result).map((issue) => formatIssue(issue, spanishMessages));

interface Node {
  next?: Node | undefined;
}

describe("spanishMessages", () => {
  it("should word every code englishMessages does, and be frozen", () => {
    expect(Object.keys(spanishMessages).toSorted()).toEqual([...Object.keys(englishMessages), "default"].toSorted());
    expect(Object.isFrozen(spanishMessages)).toBe(true);
  });

  it("should word a wrong type, a conversion that failed and a value that is not allowed", () => {
    expect(said(string()(1))).toEqual(["Se esperaba string, se recibió number"]);
    expect(said(coerceNumber()("abc"))).toEqual(["No se puede convertir string en number"]);
    expect(said(object({})(new (class Box {})()))).toEqual([
      "Se esperaba un objeto simple; cópialo antes, como en { ...value }",
    ]);
    expect(said(never()(1))).toEqual(["No permitido"]);
  });

  it("should word the limits of text, with the singular", () => {
    expect(said(string({ min: 3 })("a"))).toEqual(["Debe tener como mínimo 3 caracteres"]);
    expect(said(string({ min: 1 })(""))).toEqual(["Debe tener como mínimo 1 carácter"]);
    expect(said(string({ max: 2 })("abc"))).toEqual(["Debe tener como máximo 2 caracteres"]);
    expect(said(string({ length: 1 })("ab"))).toEqual(["Debe tener exactamente 1 carácter"]);
  });

  it("should word the limits of numbers with their inclusivity, and of dates as a moment", () => {
    expect(said(number({ min: 18 })(15))).toEqual(["Debe ser como mínimo 18"]);
    expect(said(number({ max: 1 })(2))).toEqual(["Debe ser como máximo 1"]);
    expect(said(number({ gt: 1 })(1))).toEqual(["Debe ser mayor que 1"]);
    expect(said(number({ lt: 1 })(1))).toEqual(["Debe ser menor que 1"]);
    expect(said(bigint({ min: 2n })(1n))).toEqual(["Debe ser como mínimo 2"]);
    expect(said(date({ min: new Date(0) })(new Date(-1)))).toEqual([
      "Debe ser igual o posterior a 1970-01-01T00:00:00.000Z",
    ]);
    expect(said(date({ max: new Date(0) })(new Date(1)))).toEqual([
      "Debe ser igual o anterior a 1970-01-01T00:00:00.000Z",
    ]);
  });

  it("should word the size of a collection by what it counts", () => {
    expect(said(array(string(), { min: 2 })([]))).toEqual(["Debe contener como mínimo 2 elementos"]);
    expect(said(array(string(), { max: 1 })(["a", "b"]))).toEqual(["Debe contener como máximo 1 elemento"]);
    expect(said(array(string(), { length: 2 })([]))).toEqual(["Debe contener exactamente 2 elementos"]);
    expect(said(record(string(), string(), { min: 1 })({}))).toEqual(["Debe contener como mínimo 1 clave"]);
  });

  it("should word the limits that stop a validation", () => {
    const node: (input: unknown) => ValidationResult<Node> = lazy(() => object({ next: optional(node) }), {
      maxDepth: 2,
    });
    expect(said(node({ next: { next: { next: {} } } }))).toEqual(["Debe tener como máximo 2 niveles de anidamiento"]);
    const calls: ValidationIssue = { code: "too_big", path: [], params: { maximum: 5, type: "calls" } };
    expect(formatIssue(calls, spanishMessages)).toBe("Demasiado complejo para verificar en 5 pasos recursivos");
    expect(said(array(string())(Array.from({ length: 1001 }, () => 1))).at(-1)).toBe(
      "Detenido tras 1000 problemas, así que puede haber más",
    );
  });

  it("should word a format by its name, with the adjective agreeing, and one it does not know", () => {
    expect(said(email()("nope"))).toEqual(["Dirección de correo electrónico no válida"]);
    expect(said(url()("nope"))).toEqual(["URL no válida"]);
    expect(said(format("cpf", () => false)()("x"))).toEqual(["Formato cpf no válido"]);
    expect(said(format("constructor", () => false)()("x"))).toEqual(["Formato constructor no válido"]);
    expect(said(email({ domain: oneOf(["company.com"]) })("ada@example.com"))).toEqual([
      'Dirección de correo electrónico no válida (domain): Se esperaba uno de "company.com"',
    ]);
  });

  it("should word the checks of text and of numbers", () => {
    expect(said(string(pattern(/^a$/))("b"))).toEqual(["Debe coincidir con /^a$/"]);
    expect(said(string(startsWith("x"))("b"))).toEqual(['Debe empezar por "x"']);
    expect(said(string(nonBlank())(" "))).toEqual(["No puede estar en blanco"]);
    expect(said(number({ int: true })(1.5))).toEqual(["Debe ser un número entero"]);
    expect(said(number(nonZero())(0))).toEqual(["No puede ser cero"]);
    expect(said(number(multipleOf(5))(7))).toEqual(["Debe ser múltiplo de 5"]);
    expect(said(array(string(), unique())(["a", "a"]))).toEqual(["Debe ser único"]);
  });

  it("should write a bound and a step that are not whole with a decimal comma", () => {
    expect(said(number({ min: 0.1 })(0))).toEqual(["Debe ser como mínimo 0,1"]);
    expect(said(number({ lt: -2.5 })(0))).toEqual(["Debe ser menor que -2,5"]);
    expect(said(number(multipleOf(0.01))(0.015))).toEqual(["Debe ser múltiplo de 0,01"]);
  });

  it("should word a reserved key as one that must not be used, and what is inside it as reserved", () => {
    const [reserved] = issuesOf(record(string(), number())(JSON.parse('{"__proto__":1}')));
    expect(formatIssue(reserved as ValidationIssue, spanishMessages)).toBe("No puede ser usada como clave");
    const [inside] = ((reserved as ValidationIssue).params ?? {})["issues"] as ValidationIssue[];
    // Only a key is reserved, and "la clave" is feminine, as every message of a key is.
    expect(formatIssue(inside as ValidationIssue, spanishMessages)).toBe("Está reservada");
  });

  it("should word a key given twice in the feminine, as the other messages of a key", () => {
    expect(said(record(string({ trim: true }), number())({ a: 1, " a": 2 }))).toEqual([
      "Debe ser indicada una sola vez",
    ]);
  });

  it("should word a value that is not the one expected, and a long list of them", () => {
    expect(said(literal("a")("b"))).toEqual(['Se esperaba "a"']);
    expect(said(oneOf(["a", 1])("b"))).toEqual(['Se esperaba uno de "a", 1']);
    const many = Array.from({ length: 12 }, (_, index) => index);
    expect(said(oneOf(many)("b"))).toEqual(["Se esperaba uno de 0, 1, 2, 3, 4, 5, 6, 7, 8, 9 y 2 más"]);
    const unread = {
      get name(): string {
        throw new Error("boom");
      },
    };
    expect(said(objectLike({ name: string() })(unread))).toEqual(["No se pudo leer"]);
    expect(formatIssue({ code: "invalid_value", path: [] }, spanishMessages)).toBe("Valor no válido");
  });

  it("should word keys, unions and an intersection that conflicts", () => {
    expect(said(object({}, { unknownKeys: "strict" })({ extra: 1 }))).toEqual(['Clave no reconocida "extra"']);
    expect(said(record(string({ min: 2 }), string())({ a: "x" }))).toEqual([
      "Clave no válida: Debe tener como mínimo 2 caracteres",
    ]);
    expect(said(union([literal(""), email()])("nope"))).toEqual(["Dirección de correo electrónico no válida"]);
    expect(said(union([string(), number()])(true))).toEqual(["No coincide con ninguno de los tipos permitidos"]);
    expect(said(tagged("type", { a: object({}), b: object({}) })({ type: "c" }))).toEqual([
      'Se esperaba que type fuera uno de "a", "b"',
    ]);
    const conflict = intersection(object({ a: string({ trim: true }) }), object({ a: string() }));
    expect(said(conflict({ a: " x " }))).toEqual(["Valores en conflicto"]);
  });

  it("should word a code it has no entry for in Spanish, and never in English", () => {
    expect(said(string(check(() => false))("a"))).toEqual(["Valor no válido"]);
    expect(formatIssue({ code: "username_taken", path: [] }, spanishMessages)).toBe("Valor no válido");
    expect(formatIssue({ code: "constructor", path: [] }, spanishMessages)).toBe("Valor no válido");
  });

  it("should word an issue quoted inside another with the map in use, and group them for a form", () => {
    const reworded = { ...spanishMessages, too_small: "Demasiado corto" };
    const [found] = issuesOf(record(string({ min: 2 }), string())({ a: "x" }));
    expect(formatIssue(found as ValidationIssue, reworded)).toBe("Clave no válida: Demasiado corto");
    const result = object({ name: string({ min: 2 }) })({ name: "" });
    expect(result.ok ? undefined : flatten(result.error, spanishMessages).fieldErrors).toEqual({
      name: ["Debe tener como mínimo 2 caracteres"],
    });
  });
});
