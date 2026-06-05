import { ok, err, type Result } from "../result";

type PlainObject = Record<string, unknown>;

interface ObjectValidators {
  plain(): Result<PlainObject>;
  hasKeys(keys: string[]): Result<PlainObject>;
}

const getObjectType = (val: unknown): string => {
  if (val === null) return "null";
  if (Array.isArray(val)) return "array";
  return typeof val;
};

const isPlainObject = (val: unknown): val is PlainObject => {
  if (typeof val !== "object" || val === null || Array.isArray(val)) return false;

  const prototype = Object.getPrototypeOf(val);
  return prototype === Object.prototype || prototype === null;
};

export function object(val: unknown): ObjectValidators {
  if (typeof val !== "object" || val === null || Array.isArray(val)) {
    const typeErr = err(`Expected object, got ${getObjectType(val)}`);
    const fail = () => typeErr;

    return {
      plain: fail,
      hasKeys: fail,
    };
  }

  if (!isPlainObject(val)) {
    const plainErr = err("Expected plain object");
    const fail = () => plainErr;

    return {
      plain: fail,
      hasKeys: fail,
    };
  }

  const v = val;

  return {
    plain(): Result<PlainObject> {
      return ok(v);
    },

    hasKeys(keys: string[]): Result<PlainObject> {
      const missingKey = keys.find((key) => !Object.hasOwn(v, key));
      if (missingKey !== undefined) return err(`Missing required key: ${missingKey}`);
      return ok(v);
    },
  };
}
