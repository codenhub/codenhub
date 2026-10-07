/*
 * Prints how many validations a second the built package runs for a few schemas, so a change to a composer
 * can be measured before and after. It is not a test: time measured in CI fails for reasons that are not
 * the code's. Run it with `pnpm bench`, which builds `dist/` first, and pass a word to run only the
 * scenarios whose name holds it.
 *
 * Compare whole runs with whole runs. A scenario run alone is faster than the same one after the others,
 * since the engine has then seen the shared helpers called with one kind of child only: on Node.js 24.19
 * an `array` of 100 strings ran 0.9 M ops/s alone and 0.55 M in a whole run, of the same build.
 */
import { array, email, number, object, optional, record, string, tagged, tuple, union } from "../dist/index.js";

const signup = object({ name: string({ min: 2 }), email: email(), age: optional(number({ int: true })) });
const strings = Array.from({ length: 100 }, (_, index) => `item ${index}`);
const event = tagged("type", {
  click: object({ x: number(), y: number() }),
  key: object({ code: string() }),
});

const scenarios = [
  ["string", string(), "hello"],
  ["number, an integer", number({ int: true }), 3],
  ["object of no fields", object({}), {}],
  ["object of three strings", object({ a: string(), b: string(), c: string() }), { a: "x", b: "y", c: "z" }],
  [
    "object of three strings, strict",
    object({ a: string(), b: string(), c: string() }, { unknownKeys: "strict" }),
    { a: "x", b: "y", c: "z" },
  ],
  [
    "object in an object",
    object({ user: object({ name: string(), tags: array(string()) }) }),
    { user: { name: "Ada", tags: ["a", "b"] } },
  ],
  ["array of 100 strings", array(string()), strings],
  ["tuple of two numbers", tuple([number(), number()]), [1, 2]],
  [
    "record of ten numbers",
    record(string(), number()),
    Object.fromEntries(strings.slice(0, 10).map((key, index) => [key, index])),
  ],
  ["union, second option", union([number(), string()]), "hello"],
  ["tagged", event, { type: "key", code: "Enter" }],
  ["signup, valid", signup, { name: "Ada Lovelace", email: "ada@example.com", age: 36 }],
  ["signup, invalid", signup, { name: "A", email: "nope", age: 1.5 }],
  ["array of strings, a hundred bad items", array(string()), strings.map((_, index) => index)],
];

// Each result is kept where the engine cannot prove it unused, so the object a validator returns is made.
let kept;

const filter = process.argv[2];
for (const [name, validator, input] of scenarios) {
  if (filter !== undefined && !name.includes(filter)) {
    continue;
  }
  for (let warm = 0; warm < 20_000; warm += 1) {
    validator(input);
  }
  let runs = 0;
  const start = performance.now();
  let elapsed = 0;
  while (elapsed < 500) {
    for (let batch = 0; batch < 1000; batch += 1) {
      kept = validator(input);
    }
    runs += 1000;
    elapsed = performance.now() - start;
  }
  const perSecond = (runs / elapsed) * 1000;
  if (kept === undefined) {
    throw new Error(`${name} returned no result`);
  }
  console.log(`${name.padEnd(36)} ${(perSecond / 1e6).toFixed(2).padStart(8)} M ops/s`);
}
