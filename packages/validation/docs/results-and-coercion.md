# Results And Coercion

## Result Model

`ValidationResult<T>` is `ValidationOk<T> | ValidationErr`. Success contains
`{ ok: true, value }`; failure contains `{ ok: false, error }`.

`ValidationError` extends `ValidationIssue` with optional child `issues`. Both
contain a `code`, `message`, and `path`, plus optional `input`, `expected`, and
`received`. A `ValidationPathSegment` is a string or number. Stable
`ValidationErrorCode` values are `invalid_type`, `invalid_value`,
`invalid_format`, `too_small`, `too_big`, `missing_key`, and `custom`.

`ValidationOptions` accepts `path` and `includeInput`. Paths default to `[]`.
Original input is omitted by validators and coercers unless `includeInput` is
`true`; retain it only when safe.

`ok(value)` creates `ValidationOk<T>`. `err(input)` creates `ValidationErr` from
a string, `ValidationIssue`, or `ValidationErrorOptions`. String failures use
`code: "custom"` and an empty path. Unknown codes normalize to `custom`, invalid
path segments are removed, and missing messages become `"Invalid value"`.

`parseResult<T>(value)` accepts success/failure result-like objects,
`ValidationErrorOptions`, `Error`, and string values. Unrecognized values become
a custom `"Invalid value"` failure. It does not throw for normal unknown input,
though hostile property access can still throw.

## Custom Validators

`custom<T>(value, validator, options?)` calls the validator and normalizes its
returned or thrown value with `parseResult`. Failure paths are replaced by the
path in `options` when supplied.

```ts
import { custom, err, ok } from "@codenhub/validation";

const result = custom<string>(
  "usr_123",
  (value) => {
    if (typeof value !== "string") return err("Expected a string");
    return value.startsWith("usr_") ? ok(value) : err("Invalid user id");
  },
  { path: ["userId"] },
);
```

## Primitive Coercion

The `coerce` object returns `ValidationResult` values:

| Method                    | Accepted input and result                                                                                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `int(value, options?)`    | String-convertible primitives in signed decimal integer form; returns a safe integer. Exponent, decimal, empty, and unsafe values fail with `invalid_format`. |
| `number(value, options?)` | Signed finite decimal forms, including `.5` and `1.`; exponent, empty, and non-finite values fail with `invalid_format`.                                      |
| `bool(value, options?)`   | Booleans or case-insensitive strings `true`, `false`, `1`, `0`, `yes`, `no`, `on`, and `off`. Other primitives fail with `invalid_format`.                    |
| `string(value, options?)` | Stringifies defined primitives. `null`, `undefined`, objects, functions, and failed string conversion return `invalid_type`.                                  |

Objects and functions are rejected by all coercers. Symbols may be converted to
strings, but are not accepted by numeric or boolean format checks. Coercion does
not perform subsequent domain validation; for example, pass an integer result
to `val.number(value).port()` to enforce the port range.

The public type exports `ValidationErrorInput`, `ValidationErrorOptions`,
`ValidationIssue`, `ValidationError`, `ValidationOptions`, `ValidationOk`,
`ValidationErr`, `ValidationResult`, `ValidationErrorCode`, and
`ValidationPathSegment` describe these workflows.
