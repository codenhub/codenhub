import { ok, err, Result } from "../result";

interface ArrayValidators<T> {
  minLength(n: number): Result<T[]>;
  maxLength(n: number): Result<T[]>;
  notEmpty(): Result<T[]>;
}

const isValidLengthLimit = (n: number): boolean => Number.isFinite(n) && n >= 0;

export function array<T = unknown>(val: unknown): ArrayValidators<T> {
  if (!Array.isArray(val)) {
    const typeErr = err(`Expected array, got ${typeof val}`);
    const fail = () => typeErr;

    return {
      minLength: fail,
      maxLength: fail,
      notEmpty: fail,
    };
  }

  const v = val as T[];

  return {
    minLength(n: number): Result<T[]> {
      if (!isValidLengthLimit(n)) return err("Minimum length must be a finite non-negative number");
      if (v.length < n) return err(`Must contain at least ${n} items`);
      return ok(v);
    },

    maxLength(n: number): Result<T[]> {
      if (!isValidLengthLimit(n)) return err("Maximum length must be a finite non-negative number");
      if (v.length > n) return err(`Must contain at most ${n} items`);
      return ok(v);
    },

    notEmpty(): Result<T[]> {
      if (v.length === 0) return err("Array cannot be empty");
      return ok(v);
    },
  };
}
