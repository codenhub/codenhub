/**
 * Zero-dependency TypeScript interface definition matching the Standard Schema specification (v1, as
 * published in `@standard-schema/spec` 1.1).
 *
 * @see https://github.com/standard-schema/standard-schema
 */

/**
 * Interface representing a Standard Schema compliant validator.
 *
 * Conforming schemas expose the `~standard` property containing metadata and validation logic.
 *
 * @typeParam TInput - The input type accepted by the schema.
 * @typeParam TOutput - The output type produced after validation.
 */
export interface StandardSchemaV1<TInput = unknown, TOutput = TInput> {
  /** The Standard Schema metadata and execution properties. */
  readonly "~standard": StandardSchemaV1.Props<TInput, TOutput>;
}

export declare namespace StandardSchemaV1 {
  /**
   * Properties defined on the `~standard` object of a compliant schema.
   *
   * @typeParam TInput - Inferred input type.
   * @typeParam TOutput - Inferred output type.
   */
  export interface Props<TInput = unknown, TOutput = TInput> {
    /** The version number of the Standard Schema specification (always 1). */
    readonly version: 1;
    /** The vendor identifier of the schema library. */
    readonly vendor: string;
    /** Validates an unknown input value and returns a synchronous or asynchronous result. */
    readonly validate: (value: unknown, options?: Options | undefined) => Result<TOutput> | Promise<Result<TOutput>>;
    /** Inferred TypeScript types preserved for schema inspection. */
    readonly types?: Types<TInput, TOutput> | undefined;
  }

  /**
   * Result produced by Standard Schema validation.
   *
   * @typeParam TOutput - Inferred output type.
   */
  export type Result<TOutput> = SuccessResult<TOutput> | FailureResult;

  /**
   * Successful validation result containing the validated or transformed value.
   *
   * @typeParam TOutput - Inferred output type.
   */
  export interface SuccessResult<TOutput> {
    /** The validated and coerced output value. */
    readonly value: TOutput;
    /** Discriminant indicating absence of validation issues. */
    readonly issues?: undefined;
  }

  /** Options a caller can pass to `validate`. */
  export interface Options {
    /** Options specific to the library behind the schema. */
    readonly libraryOptions?: Record<string, unknown> | undefined;
  }

  /**
   * Failed validation result containing accumulated issues.
   */
  export interface FailureResult {
    /** List of validation issues encountered during validation. */
    readonly issues: ReadonlyArray<Issue>;
  }

  /**
   * A single validation issue produced by a standard schema validator.
   */
  export interface Issue {
    /** Human-readable description of the validation failure. */
    readonly message: string;
    /** Path segments pointing to the location of the invalid data. */
    readonly path?: ReadonlyArray<PropertyKey | PathSegment> | undefined;
  }

  /**
   * Structured path segment identifying an issue location.
   */
  export interface PathSegment {
    /** The key or index segment. */
    readonly key: PropertyKey;
  }

  /**
   * Container carrying phantom input and output types.
   *
   * @typeParam TInput - Inferred input type.
   * @typeParam TOutput - Inferred output type.
   */
  export interface Types<TInput = unknown, TOutput = TInput> {
    /** Phantom input type. */
    readonly input: TInput;
    /** Phantom output type. */
    readonly output: TOutput;
  }

  /**
   * Infers the input type of a Standard Schema compliant validator.
   */
  export type InferInput<Schema extends StandardSchemaV1> = NonNullable<Schema["~standard"]["types"]>["input"];

  /**
   * Infers the output type of a Standard Schema compliant validator.
   */
  export type InferOutput<Schema extends StandardSchemaV1> = NonNullable<Schema["~standard"]["types"]>["output"];
}

/**
 * Interface of a schema that can also be written as a JSON Schema, from the Standard JSON Schema
 * specification published in `@standard-schema/spec` 1.1. A library that needs a JSON Schema, such as one
 * that declares the tools of a language model, calls `jsonSchema.input` or `jsonSchema.output`.
 *
 * @typeParam TInput - The input type accepted by the schema.
 * @typeParam TOutput - The output type produced after validation.
 */
export interface StandardJSONSchemaV1<TInput = unknown, TOutput = TInput> {
  /** The Standard JSON Schema properties. */
  readonly "~standard": StandardJSONSchemaV1.Props<TInput, TOutput>;
}

export declare namespace StandardJSONSchemaV1 {
  /** Properties defined on the `~standard` object of a schema that can be written as a JSON Schema. */
  export interface Props<TInput = unknown, TOutput = TInput> {
    /** The version number of the specification (always 1). */
    readonly version: 1;
    /** The vendor identifier of the schema library. */
    readonly vendor: string;
    /** Inferred TypeScript types preserved for schema inspection. */
    readonly types?: Types<TInput, TOutput> | undefined;
    /** Methods that write the input or the output type as a JSON Schema. */
    readonly jsonSchema: Converter;
  }

  /** Writes a side of the schema as a JSON Schema. Each may throw when it cannot. */
  export interface Converter {
    /** Writes the input type as a JSON Schema. */
    readonly input: (options: Options) => Record<string, unknown>;
    /** Writes the output type as a JSON Schema. */
    readonly output: (options: Options) => Record<string, unknown>;
  }

  /** The draft to write. A library throws for one it does not write. */
  export type Target = "draft-2020-12" | "draft-07" | "openapi-3.0" | (string & {});

  /** The input and output types of a schema, as Standard Schema gives them. */
  export type Types<TInput = unknown, TOutput = TInput> = StandardSchemaV1.Types<TInput, TOutput>;

  /** Infers the input type of a schema that can be written as a JSON Schema. */
  export type InferInput<Schema extends StandardJSONSchemaV1> = NonNullable<Schema["~standard"]["types"]>["input"];

  /** Infers the output type of a schema that can be written as a JSON Schema. */
  export type InferOutput<Schema extends StandardJSONSchemaV1> = NonNullable<Schema["~standard"]["types"]>["output"];

  /** Options a caller passes to `input` and `output`. */
  export interface Options {
    /** The draft of JSON Schema to write. */
    readonly target: Target;
    /** Options specific to the library behind the schema. */
    readonly libraryOptions?: Record<string, unknown> | undefined;
  }
}
