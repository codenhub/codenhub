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
import { portugueseMessages } from "./portuguese-messages";

const said = (result: ValidationResult<unknown>): string[] =>
  issuesOf(result).map((issue) => formatIssue(issue, portugueseMessages));

interface Node {
  next?: Node | undefined;
}

describe("portugueseMessages", () => {
  it("should word every code englishMessages does, and be frozen", () => {
    expect(Object.keys(portugueseMessages).toSorted()).toEqual([...Object.keys(englishMessages), "default"].toSorted());
    expect(Object.isFrozen(portugueseMessages)).toBe(true);
  });

  it("should word a wrong type, a conversion that failed and a value that is not allowed", () => {
    expect(said(string()(1))).toEqual(["Esperado string, recebido number"]);
    expect(said(coerceNumber()("abc"))).toEqual(["Não é possível converter string em number"]);
    expect(said(object({})(new (class Box {})()))).toEqual([
      "Esperado um objeto simples; copie-o antes, como em { ...value }",
    ]);
    expect(said(never()(1))).toEqual(["Não permitido"]);
  });

  it("should word the limits of text, with the singular", () => {
    expect(said(string({ min: 3 })("a"))).toEqual(["Deve ter no mínimo 3 caracteres"]);
    expect(said(string({ min: 1 })(""))).toEqual(["Deve ter no mínimo 1 caractere"]);
    expect(said(string({ max: 2 })("abc"))).toEqual(["Deve ter no máximo 2 caracteres"]);
    expect(said(string({ length: 1 })("ab"))).toEqual(["Deve ter exatamente 1 caractere"]);
  });

  it("should word the limits of numbers with their inclusivity, and of dates as a moment", () => {
    expect(said(number({ min: 18 })(15))).toEqual(["Deve ser no mínimo 18"]);
    expect(said(number({ max: 1 })(2))).toEqual(["Deve ser no máximo 1"]);
    expect(said(number({ gt: 1 })(1))).toEqual(["Deve ser maior que 1"]);
    expect(said(number({ lt: 1 })(1))).toEqual(["Deve ser menor que 1"]);
    expect(said(bigint({ min: 2n })(1n))).toEqual(["Deve ser no mínimo 2"]);
    expect(said(date({ min: new Date(0) })(new Date(-1)))).toEqual([
      "Deve ser igual ou posterior a 1970-01-01T00:00:00.000Z",
    ]);
    expect(said(date({ max: new Date(0) })(new Date(1)))).toEqual([
      "Deve ser igual ou anterior a 1970-01-01T00:00:00.000Z",
    ]);
  });

  it("should word the size of a collection by what it counts", () => {
    expect(said(array(string(), { min: 2 })([]))).toEqual(["Deve conter no mínimo 2 itens"]);
    expect(said(array(string(), { max: 1 })(["a", "b"]))).toEqual(["Deve conter no máximo 1 item"]);
    expect(said(array(string(), { length: 2 })([]))).toEqual(["Deve conter exatamente 2 itens"]);
    expect(said(record(string(), string(), { min: 1 })({}))).toEqual(["Deve conter no mínimo 1 chave"]);
  });

  it("should word the limits that stop a validation", () => {
    const node: (input: unknown) => ValidationResult<Node> = lazy(() => object({ next: optional(node) }), {
      maxDepth: 2,
    });
    expect(said(node({ next: { next: { next: {} } } }))).toEqual(["Deve ter no máximo 2 níveis de aninhamento"]);
    const calls: ValidationIssue = { code: "too_big", path: [], params: { maximum: 5, type: "calls" } };
    expect(formatIssue(calls, portugueseMessages)).toBe("Complexo demais para verificar em 5 passos recursivos");
    expect(said(array(string())(Array.from({ length: 1001 }, () => 1))).at(-1)).toBe(
      "Interrompido após 1000 problemas, então pode haver mais",
    );
  });

  it("should word a format by its name, with the adjective agreeing, and one it does not know", () => {
    expect(said(email()("nope"))).toEqual(["Endereço de e-mail inválido"]);
    expect(said(url()("nope"))).toEqual(["URL inválida"]);
    expect(said(format("cpf", () => false)()("x"))).toEqual(["Formato cpf inválido"]);
    expect(said(format("constructor", () => false)()("x"))).toEqual(["Formato constructor inválido"]);
    expect(said(email({ domain: oneOf(["company.com"]) })("ada@example.com"))).toEqual([
      'Endereço de e-mail inválido (domain): Esperado um de "company.com"',
    ]);
  });

  it("should word the checks of text and of numbers", () => {
    expect(said(string(pattern(/^a$/))("b"))).toEqual(["Deve corresponder a /^a$/"]);
    expect(said(string(startsWith("x"))("b"))).toEqual(['Deve começar com "x"']);
    expect(said(string(nonBlank())(" "))).toEqual(["Não pode estar em branco"]);
    expect(said(number({ int: true })(1.5))).toEqual(["Deve ser um número inteiro"]);
    expect(said(number(nonZero())(0))).toEqual(["Não pode ser zero"]);
    expect(said(number(multipleOf(5))(7))).toEqual(["Deve ser múltiplo de 5"]);
    expect(said(array(string(), unique())(["a", "a"]))).toEqual(["Deve ser único"]);
  });

  it("should word a reserved key as one that must not be used, and what is inside it as reserved", () => {
    const [reserved] = issuesOf(record(string(), number())(JSON.parse('{"__proto__":1}')));
    expect(formatIssue(reserved as ValidationIssue, portugueseMessages)).toBe("Não pode ser usada como chave");
    const [inside] = ((reserved as ValidationIssue).params ?? {})["issues"] as ValidationIssue[];
    expect(formatIssue(inside as ValidationIssue, portugueseMessages)).toBe("É reservado");
  });

  it("should word a value that is not the one expected, and a long list of them", () => {
    expect(said(literal("a")("b"))).toEqual(['Esperado "a"']);
    expect(said(oneOf(["a", 1])("b"))).toEqual(['Esperado um de "a", 1']);
    const many = Array.from({ length: 12 }, (_, index) => index);
    expect(said(oneOf(many)("b"))).toEqual(["Esperado um de 0, 1, 2, 3, 4, 5, 6, 7, 8, 9 ou mais 2"]);
    const unread = {
      get name(): string {
        throw new Error("boom");
      },
    };
    expect(said(objectLike({ name: string() })(unread))).toEqual(["Não pôde ser lido"]);
    expect(formatIssue({ code: "invalid_value", path: [] }, portugueseMessages)).toBe("Valor inválido");
  });

  it("should word keys, unions and an intersection that conflicts", () => {
    expect(said(object({}, { unknownKeys: "strict" })({ extra: 1 }))).toEqual(['Chave não reconhecida "extra"']);
    expect(said(record(string({ min: 2 }), string())({ a: "x" }))).toEqual([
      "Chave inválida: Deve ter no mínimo 2 caracteres",
    ]);
    expect(said(union([literal(""), email()])("nope"))).toEqual(["Endereço de e-mail inválido"]);
    expect(said(union([string(), number()])(true))).toEqual(["Não corresponde a nenhum dos tipos permitidos"]);
    expect(said(tagged("type", { a: object({}), b: object({}) })({ type: "c" }))).toEqual([
      'Esperado que type seja um de "a", "b"',
    ]);
    const conflict = intersection(object({ a: string({ trim: true }) }), object({ a: string() }));
    expect(said(conflict({ a: " x " }))).toEqual(["Valores conflitantes"]);
  });

  it("should word a code it has no entry for in Portuguese, and never in English", () => {
    expect(said(string(check(() => false))("a"))).toEqual(["Valor inválido"]);
    expect(formatIssue({ code: "username_taken", path: [] }, portugueseMessages)).toBe("Valor inválido");
    expect(formatIssue({ code: "constructor", path: [] }, portugueseMessages)).toBe("Valor inválido");
  });

  it("should word an issue quoted inside another with the map in use, and group them for a form", () => {
    const reworded = { ...portugueseMessages, too_small: "Muito curto" };
    const [found] = issuesOf(record(string({ min: 2 }), string())({ a: "x" }));
    expect(formatIssue(found as ValidationIssue, reworded)).toBe("Chave inválida: Muito curto");
    const result = object({ name: string({ min: 2 }) })({ name: "" });
    expect(result.ok ? undefined : flatten(result.error, portugueseMessages).fieldErrors).toEqual({
      name: ["Deve ter no mínimo 2 caracteres"],
    });
  });
});
